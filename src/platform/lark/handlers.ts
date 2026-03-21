import type { Logger } from "pino";
import type { AgentType } from "../../domain/enums.js";
import type { Session } from "../../domain/models.js";
import type { ImageCache } from "../../runtime/image-cache.js";
import type { InboundMessageStore } from "../../store/inbound-message-store.js";
import type { IncomingImageAttachment, SelectableWorkspace } from "../types.js";
import { buildLarkTextMessage } from "./messages.js";

type LarkRawEnvelope = {
  schema?: string;
  challenge?: string;
  header?: {
    event_type?: string;
    event_id?: string;
    create_time?: string;
  };
  event?: LarkMessageEvent;
};

type LarkMessageEvent = {
  message?: {
    message_id?: string;
    chat_id?: string;
    root_id?: string;
    thread_id?: string;
    parent_id?: string;
    message_type?: string;
    content?: string;
  };
  sender?: {
    sender_id?: {
      open_id?: string;
    };
  };
};

type LarkResult =
  | { kind: "execution"; title: string; run: { outputTail: string; status: string }; session: { sessionId: string } | null }
  | { kind: "info"; text: string; session: unknown };

type PendingThreadSetup =
  | { stage: "choose_agent" }
  | { stage: "choose_workspace"; agentType: AgentType };

type HandlerArgs = {
  allowedUserId: string;
  allowedWorkspaces?: SelectableWorkspace[];
  allowedCwds?: string[];
  agentBridgeService: {
    handleIncomingMessage?(message: {
      platform: "lark";
      platformUserId: string;
      platformChannelId: string;
      platformThreadId: string | null;
      messageId: string;
      rawText: string;
      attachments?: IncomingImageAttachment[];
    }): Promise<LarkResult>;
    getPersistentSessionByThread?(
      platform: "lark",
      platformUserId: string,
      platformChannelId: string,
      platformThreadId: string
    ): Session | null;
    createOrResetPersistentSession?(
      agentType: AgentType,
      cwd: string,
      platform: "lark",
      platformUserId: string,
      platformChannelId: string,
      platformThreadId: string
    ): { sessionId: string; agentType: AgentType; cwd: string };
    listSelectableWorkspaces?(): SelectableWorkspace[];
    interruptRun?(runId: string): boolean;
  };
  client: {
    replyToMessage(messageId: string, content: ReturnType<typeof buildLarkTextMessage>): Promise<void>;
    replyWithProgressCard?(messageId: string, title: string, status: string, body: string): Promise<string>;
    updateProgressCard?(messageId: string, title: string, status: string, body: string): Promise<void>;
    downloadImage?(messageId: string, imageKey: string): Promise<{
      bytes: Uint8Array;
      mimeType: string | null;
      name: string | null;
    }>;
  };
  logger: Logger;
  imageCache?: ImageCache;
  messageDeduper?: InboundMessageStore;
  schedule?: (task: () => Promise<void>) => void;
  onEventReceived?: () => void;
};

export function createLarkEventHandler(args: HandlerArgs) {
  const pendingThreadSetups = new Map<string, PendingThreadSetup>();
  const handleMessageEvent = createLarkMessageHandler(args, pendingThreadSetups);
  const seenEventKeys = new Set<string>();
  const schedule = args.schedule ?? ((task: () => Promise<void>) => {
    void task().catch((error) => {
      args.logger.error({ error }, "Failed asynchronous Lark event task");
    });
  });

  return async function handleEnvelope(payload: LarkRawEnvelope): Promise<{ ok?: true; challenge?: string }> {
    if (payload.challenge) {
      return { challenge: payload.challenge };
    }

    if (payload.header?.event_type !== "im.message.receive_v1" || !payload.event) {
      return { ok: true };
    }

    const eventKey = payload.header.event_id
      ?? payload.event.message?.message_id
      ?? `${payload.event.sender?.sender_id?.open_id ?? "unknown"}:${payload.event.message?.chat_id ?? "unknown"}`;
    if (seenEventKeys.has(eventKey)) {
      args.logger.info({ eventKey }, "Skipping duplicate Lark event");
      return { ok: true };
    }

    seenEventKeys.add(eventKey);
    const cleanupTimer = setTimeout(() => {
      seenEventKeys.delete(eventKey);
    }, 5 * 60 * 1000);
    cleanupTimer.unref?.();

    schedule(async () => {
      await handleMessageEvent(payload.event!);
    });

    return { ok: true };
  };
}

export function createLarkMessageHandler(
  args: HandlerArgs,
  pendingThreadSetups = new Map<string, PendingThreadSetup>()
) {
  return async function handleMessageEvent(event: LarkMessageEvent): Promise<void> {
    const messageId = event.message?.message_id;
    const chatId = event.message?.chat_id;
    const threadId = resolveLarkThreadId(event.message);
    const rawContent = event.message?.content;
    const userId = event.sender?.sender_id?.open_id;

    if (!messageId || !chatId || !rawContent || !userId) {
      args.logger.warn({ event }, "Ignoring malformed Lark message event");
      return;
    }

    args.onEventReceived?.();
    args.logger.info({ messageId, chatId, userId, threadId }, "Handling Lark message event");

    if (userId !== args.allowedUserId) {
      args.logger.warn({ userId, allowedUserId: args.allowedUserId }, "Rejected Lark message from unauthorized user");
      return;
    }

    if (args.messageDeduper && !args.messageDeduper.tryBegin("lark", messageId)) {
      args.logger.info({ messageId }, "Skipping duplicate Lark message");
      return;
    }

    let progressCardMessageId: string | null = null;

    try {
      const parsedMessage = parseLarkMessage(event.message?.message_type, rawContent);
      if (!parsedMessage) {
        return;
      }

      const normalizedText = normalizeLarkCommandText(parsedMessage.text);
      if (!threadId) {
        if (normalizedText === "start") {
          pendingThreadSetups.set(buildSetupKey(userId, chatId, messageId), { stage: "choose_agent" });
          await args.client.replyToMessage(messageId, buildLarkTextMessage(formatAgentPrompt()));
          args.messageDeduper?.markCompleted("lark", messageId);
          return;
        }

        await args.client.replyToMessage(messageId, buildLarkTextMessage(formatLarkStartHint()));
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      const threadSession = args.agentBridgeService.getPersistentSessionByThread?.("lark", userId, chatId, threadId) ?? null;
      if (threadSession) {
        if (normalizedText === "stop") {
          const interrupted = threadSession.lastRunId
            ? (args.agentBridgeService.interruptRun?.(threadSession.lastRunId) ?? false)
            : false;
          await args.client.replyToMessage(
            messageId,
            buildLarkTextMessage(interrupted ? "Interrupt requested." : "Run is no longer active.")
          );
          args.messageDeduper?.markCompleted("lark", messageId);
          return;
        }

        if (!args.agentBridgeService.handleIncomingMessage) {
          throw new Error("Lark thread execution requires handleIncomingMessage support");
        }

        const attachments = await resolveAttachments(args, parsedMessage, messageId);
        progressCardMessageId = args.client.replyWithProgressCard
          ? await args.client.replyWithProgressCard(
            messageId,
            "AgentBridge",
            "Processing",
            "Request received. Running the agent now..."
          )
          : null;
        const result = await args.agentBridgeService.handleIncomingMessage({
          platform: "lark",
          platformUserId: userId,
          platformChannelId: chatId,
          platformThreadId: threadId,
          messageId,
          rawText: parsedMessage.text,
          ...(attachments.length > 0 ? { attachments } : {})
        });

        if (progressCardMessageId && args.client.updateProgressCard) {
          await args.client.updateProgressCard(
            progressCardMessageId,
            "AgentBridge",
            formatLarkResultStatus(result),
            formatLarkResult(result)
          );
          args.messageDeduper?.markCompleted("lark", messageId);
          return;
        }

        await args.client.replyToMessage(messageId, buildLarkTextMessage(formatLarkResult(result)));
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      const setupKey = buildSetupKey(userId, chatId, threadId);
      if (normalizedText === "start") {
        pendingThreadSetups.set(setupKey, { stage: "choose_agent" });
        await args.client.replyToMessage(messageId, buildLarkTextMessage(formatAgentPrompt()));
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      const pendingSetup = pendingThreadSetups.get(setupKey);
      if (!pendingSetup) {
        await args.client.replyToMessage(messageId, buildLarkTextMessage(formatLarkStartHint()));
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      if (pendingSetup.stage === "choose_agent") {
        const agentType = normalizeAgentChoice(normalizedText);
        if (!agentType) {
          await args.client.replyToMessage(messageId, buildLarkTextMessage(formatExactAgentPrompt()));
          args.messageDeduper?.markCompleted("lark", messageId);
          return;
        }

        pendingThreadSetups.set(setupKey, {
          stage: "choose_workspace",
          agentType
        });
        await args.client.replyToMessage(
          messageId,
          buildLarkTextMessage(formatWorkspacePrompt(getSelectableWorkspaces(args)))
        );
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      const workspaces = getSelectableWorkspaces(args);
      const selectedWorkspace = resolveWorkspaceChoice(normalizedText, workspaces);
      if (!selectedWorkspace) {
        await args.client.replyToMessage(
          messageId,
          buildLarkTextMessage(formatExactWorkspacePrompt(workspaces))
        );
        args.messageDeduper?.markCompleted("lark", messageId);
        return;
      }

      if (!args.agentBridgeService.createOrResetPersistentSession) {
        throw new Error("Lark setup requires createOrResetPersistentSession support");
      }

      const session = args.agentBridgeService.createOrResetPersistentSession(
        pendingSetup.agentType,
        selectedWorkspace.rootPath,
        "lark",
        userId,
        chatId,
        threadId
      );
      pendingThreadSetups.delete(setupKey);
      await args.client.replyToMessage(
        messageId,
        buildLarkTextMessage(formatInitializedReply(session, selectedWorkspace.rootPath))
      );
      args.messageDeduper?.markCompleted("lark", messageId);
    } catch (error) {
      args.messageDeduper?.release("lark", messageId);
      args.logger.error({ error, messageId, chatId, userId, threadId }, "Failed to handle Lark message event");
      if (progressCardMessageId && args.client.updateProgressCard) {
        await args.client.updateProgressCard(
          progressCardMessageId,
          "AgentBridge",
          "Failed",
          formatLarkError(error)
        );
        return;
      }
      await args.client.replyToMessage(
        messageId,
        buildLarkTextMessage(formatLarkError(error))
      );
    }
  };
}

async function resolveAttachments(
  args: HandlerArgs,
  parsedMessage: { text: string; attachments: IncomingImageAttachment[] },
  messageId: string
): Promise<IncomingImageAttachment[]> {
  if (!(args.imageCache && parsedMessage.attachments.length > 0 && args.client.downloadImage)) {
    return parsedMessage.attachments;
  }

  return args.imageCache.cacheLarkAttachments(parsedMessage.attachments, {
    messageId,
    download: async (attachment) => {
      if (!attachment.platformFileId) {
        throw new Error("Lark image attachment missing image key");
      }

      return args.client.downloadImage!(messageId, attachment.platformFileId);
    }
  });
}

function parseLarkMessage(
  messageType: string | undefined,
  rawContent: string
): { text: string; attachments: IncomingImageAttachment[] } | null {
  try {
    if (messageType === "image") {
      const parsed = JSON.parse(rawContent) as { image_key?: string };
      if (!parsed.image_key) {
        return null;
      }

      return {
        text: "",
        attachments: [
          {
            kind: "image",
            name: null,
            mimeType: null,
            sourceUrl: null,
            platformFileId: parsed.image_key,
            localPath: null
          }
        ]
      };
    }

    const parsed = JSON.parse(rawContent) as { text?: string };
    const text = parsed.text?.trim() ?? "";
    if (!text) {
      return null;
    }

    return {
      text,
      attachments: []
    };
  } catch {
    return null;
  }
}

function buildSetupKey(userId: string, chatId: string, threadId: string): string {
  return `${userId}:${chatId}:${threadId}`;
}

function resolveLarkThreadId(message: LarkMessageEvent["message"] | undefined): string | null {
  return message?.thread_id ?? message?.root_id ?? message?.parent_id ?? null;
}

function normalizeLarkCommandText(text: string): string {
  return text
    .trim()
    .replace(/(?:^|\s)@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAgentChoice(normalizedText: string): AgentType | null {
  if (normalizedText === "codex") {
    return "codex";
  }

  if (normalizedText === "claude") {
    return "claude";
  }

  return null;
}

function resolveWorkspaceChoice(normalizedText: string, workspaces: SelectableWorkspace[]): SelectableWorkspace | null {
  const index = Number(normalizedText);
  if (Number.isInteger(index) && index >= 1 && index <= workspaces.length) {
    return workspaces[index - 1] ?? null;
  }

  return workspaces.find((workspace) => workspace.rootPath === normalizedText) ?? null;
}

function formatAgentPrompt(): string {
  return "Start OK.\nChoose agent: `codex` or `claude`.\nReply with one exact option.";
}

function formatExactAgentPrompt(): string {
  return "Invalid agent.\nReply with exactly `codex` or `claude`.";
}

function formatWorkspacePrompt(workspaces: SelectableWorkspace[]): string {
  const lines = workspaces.map((workspace, index) => `${index + 1}. ${workspace.label} (${workspace.rootPath})`);
  return `Choose workspace:\n${lines.join("\n")}\nReply with one exact number.`;
}

function formatExactWorkspacePrompt(workspaces: SelectableWorkspace[]): string {
  return `Invalid workspace.\n${formatWorkspacePrompt(workspaces)}`;
}

function formatInitializedReply(
  session: { sessionId: string; agentType: AgentType; cwd: string },
  workspaceRoot: string
): string {
  return `Initialized.\nAgent: ${session.agentType}\nWorkspace: ${workspaceRoot}\nCurrent context: ${session.cwd}\nSession: ${session.sessionId}\n\nSend prompts in this thread.\nUse \`stop\` to interrupt.`;
}

function getSelectableWorkspaces(args: HandlerArgs): SelectableWorkspace[] {
  if (args.allowedWorkspaces && args.allowedWorkspaces.length > 0) {
    return args.allowedWorkspaces;
  }

  if (args.allowedCwds && args.allowedCwds.length > 0) {
    return args.allowedCwds.map((cwd) => ({
      rootPath: cwd,
      label: cwd,
      kind: "plain_dir"
    }));
  }

  return [];
}

function formatLarkResult(result: LarkResult): string {
  if (result.kind === "execution") {
    const sessionLabel = result.session?.sessionId ?? "run once";
    return `${result.title}\nAgent session: ${sessionLabel}\nStatus: ${result.run.status}\n\n${result.run.outputTail || "(no output)"}`;
  }

  return result.text;
}

function formatLarkResultStatus(result: LarkResult): string {
  if (result.kind === "execution") {
    if (result.run.status === "failed") {
      return "Failed";
    }

    if (result.run.status === "interrupted") {
      return "Interrupted";
    }

    if (result.run.status === "timed_out") {
      return "Timed Out";
    }

    return "Completed";
  }

  return "Completed";
}

function formatLarkStartHint(): string {
  return "Send `start` as a new root message.\nThen continue in the thread.";
}

function formatLarkError(error: unknown): string {
  if (error instanceof Error) {
    return `Action failed: ${error.message}`;
  }

  return "Action failed with an unknown error.";
}
