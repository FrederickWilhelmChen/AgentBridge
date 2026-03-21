import type { App } from "@slack/bolt";
import type { Logger } from "pino";
import { z } from "zod";
import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";
import type { SelectableWorkspace } from "../platform/types.js";
import type { IncomingImageAttachment } from "../platform/types.js";
import type { ImageCache } from "../runtime/image-cache.js";
import type { AgentBridgeService } from "../services/agent-bridge-service.js";
import type { InboundMessageStore } from "../store/inbound-message-store.js";
import { buildExecutionBlocks, buildInfoBlocks } from "./messages.js";
import { buildConsoleModal } from "./views.js";

type HandlerContext = {
  allowedUserId: string;
  logger: Logger;
  config: AppConfig;
  agentBridgeService: AgentBridgeService;
  imageCache?: ImageCache;
  messageDeduper?: InboundMessageStore;
  onEventReceived?: () => void;
};

const modalSubmissionSchema = z.object({
  agentType: z.enum(["claude", "codex"]),
  workspaceRoot: z.string().min(1),
  message: z.string().min(1)
});

export function registerSlackHandlers(app: App, context: HandlerContext) {
  app.shortcut("open_agent_console", async ({ ack, body, client }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildConsoleModal({
        workspaces: getSelectableWorkspaces(context),
        defaultAgent: context.config.runtime.defaultAgent
      })
    });
  });

  app.view("agent_console_submit", async ({ ack, body, view, client }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    const values = parseModalSubmission(view.state.values, getSelectableWorkspaces(context));
    const dmChannelId = await openDirectMessage(client, body.user.id);

    const startMessage = await client.chat.postMessage({
      channel: dmChannelId,
      text: `Starting conversation with ${values.agentType}...`,
      blocks: buildInfoBlocks(`Starting a new *${values.agentType}* conversation in workspace \`${values.workspaceRoot}\`...`)
    });

    try {
      context.agentBridgeService.createOrResetPersistentSession(
        values.agentType,
        values.workspaceRoot,
        "slack",
        body.user.id,
        dmChannelId,
        startMessage.ts
      );

      const result = await context.agentBridgeService.sendToPersistentSession({
        agentType: values.agentType,
        cwd: values.workspaceRoot,
        message: values.message,
        platform: "slack",
        platformChannelId: dmChannelId,
        platformThreadId: startMessage.ts,
        platformUserId: body.user.id
      });

      await client.chat.update({
        channel: dmChannelId,
        ts: startMessage.ts,
        text: `Conversation started: ${result.run.status}`,
        blocks: buildExecutionBlocks({
          title: "Conversation Started",
          run: result.run,
          session: result.session
        })
      });
      return;
    } catch (error) {
      context.logger.error({ error }, "Failed to handle modal submission");
      await client.chat.update({
        channel: dmChannelId,
        ts: startMessage.ts,
        text: "AgentBridge action failed",
        blocks: buildInfoBlocks(formatErrorMessage(error))
      });
    }
  });

  app.action("interrupt_run", async ({ ack, body, client, action }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    const interrupted = context.agentBridgeService.interruptRun(action.value);
    await client.chat.postMessage({
      channel: body.channel.id,
      text: interrupted ? "Interrupt requested." : "Run is no longer active.",
      blocks: buildInfoBlocks(interrupted ? "Interrupt requested." : "Run is no longer active.")
    });
  });

  app.action("open_console_button", async ({ ack, body, client }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildConsoleModal({
        workspaces: getSelectableWorkspaces(context),
        defaultAgent: context.config.runtime.defaultAgent
      })
    });
  });

  app.message(async ({ message, client, body }: any) => {
    if (!isDirectMessageEvent(message) || message.user !== context.allowedUserId) {
      return;
    }

    const threadTs = message.thread_ts as string | undefined;
    if (!threadTs) {
      return;
    }

    const session = context.agentBridgeService.getPersistentSessionByThread(
      "slack",
      message.user,
      message.channel,
      threadTs
    );
    if (!session) {
      return;
    }

    context.onEventReceived?.();
    if (context.messageDeduper && !context.messageDeduper.tryBegin("slack", message.ts)) {
      context.logger.debug?.({ messageId: message.ts }, "Skipping duplicate Slack message");
      return;
    }
    const startMessage = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: threadTs,
      text: "Processing your message...",
      blocks: buildInfoBlocks("Processing your message...")
    });

    try {
      const attachments = context.imageCache
        ? await context.imageCache.cacheSlackAttachments(extractSlackImageAttachments(message.files), {
            botToken: context.config.slack?.botToken ?? "",
            messageId: message.ts
          })
        : extractSlackImageAttachments(message.files);
      const result = await context.agentBridgeService.handleIncomingMessage({
        platform: "slack",
        platformUserId: message.user,
        platformChannelId: message.channel,
        platformThreadId: threadTs,
        messageId: message.ts,
        rawText: (message.text as string | undefined)?.trim() ?? "",
        attachments
      });

      if (result.kind === "execution") {
        await client.chat.update({
          channel: message.channel,
          ts: startMessage.ts,
          text: "AgentBridge response",
          blocks: buildExecutionBlocks({
            title: result.title,
            run: result.run,
            session: result.session
          })
        });
        context.messageDeduper?.markCompleted("slack", message.ts);
        return;
      }

      await client.chat.update({
        channel: message.channel,
        ts: startMessage.ts,
        text: "AgentBridge response",
        blocks: buildInfoBlocks(result.text)
      });
      context.messageDeduper?.markCompleted("slack", message.ts);
    } catch (error) {
      context.messageDeduper?.release("slack", message.ts);
      context.logger.error({ error }, "Failed to handle Slack text message");
      await client.chat.update({
        channel: message.channel,
        ts: startMessage.ts,
        text: "AgentBridge action failed",
        blocks: buildInfoBlocks(formatErrorMessage(error))
      });
      return;
    }
  });
}

function ensureAllowedUser(userId: string, context: HandlerContext) {
  if (userId !== context.allowedUserId) {
    context.logger.warn({ userId }, "Rejected Slack action from unauthorized user");
    throw new Error("Unauthorized Slack user");
  }
}

function parseModalSubmission(
  values: Record<string, Record<string, any>>,
  selectableWorkspaces: SelectableWorkspace[]
): {
  agentType: AgentType;
  workspaceRoot: string;
  message: string;
} {
  const agentBlock = values.agent_block;
  const workspaceBlock = values.workspace_block;
  const messageBlock = values.message_block;

  if (!agentBlock || !workspaceBlock || !messageBlock) {
    throw new Error("Modal submission is missing required fields");
  }

  const agentType = agentBlock.agent.selected_option.value as AgentType;
  const workspaceRoot = resolveSubmittedWorkspaceRoot(workspaceBlock, selectableWorkspaces);
  const message = (messageBlock.message.value as string | undefined)?.trim() ?? "";

  return modalSubmissionSchema.parse({
    agentType,
    workspaceRoot,
    message
  });
}

function resolveSubmittedWorkspaceRoot(
  workspaceBlock: Record<string, any>,
  selectableWorkspaces: SelectableWorkspace[]
): string {
  const selectedRoot = workspaceBlock.workspace?.selected_option?.value as string | undefined;
  if (selectedRoot) {
    return selectedRoot;
  }

  const query = (workspaceBlock.workspace_query?.value as string | undefined)?.trim();
  if (!query) {
    throw new Error("Workspace selection is required");
  }

  const exactPathMatch = selectableWorkspaces.find((workspace) => workspace.rootPath === query);
  if (exactPathMatch) {
    return exactPathMatch.rootPath;
  }

  const labelMatches = selectableWorkspaces.filter((workspace) => workspace.label === query);
  if (labelMatches.length === 1) {
    return labelMatches[0]!.rootPath;
  }

  throw new Error("Workspace must match an exact configured path or a unique label");
}

function getSelectableWorkspaces(context: HandlerContext): SelectableWorkspace[] {
  return context.agentBridgeService.listSelectableWorkspaces?.() ?? context.config.runtime.allowedCwds.map((cwd) => ({
    rootPath: cwd,
    label: cwd,
    kind: "plain_dir"
  }));
}

async function openDirectMessage(client: any, userId: string): Promise<string> {
  const response = await client.conversations.open({
    users: userId
  });

  const channelId = response.channel?.id;
  if (!channelId) {
    throw new Error("Unable to open Slack DM channel");
  }

  return channelId;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Action failed: ${error.message}`;
  }

  return "Action failed with an unknown error.";
}

function isDirectMessageEvent(message: any): boolean {
  const hasImageAttachments = extractSlackImageAttachments(message?.files).length > 0;
  return (
    message?.type === "message"
    && message?.channel_type === "im"
    && !message?.bot_id
    && (typeof message?.text === "string" || hasImageAttachments)
    && (message?.subtype === undefined || (message?.subtype === "file_share" && hasImageAttachments))
  );
}

function extractSlackImageAttachments(files: any): IncomingImageAttachment[] {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter((file) => typeof file?.mimetype === "string" && file.mimetype.startsWith("image/"))
    .map((file) => ({
      kind: "image" as const,
      name: typeof file?.name === "string" ? file.name : null,
      mimeType: typeof file?.mimetype === "string" ? file.mimetype : null,
      sourceUrl: typeof file?.url_private_download === "string" ? file.url_private_download : null,
      platformFileId: typeof file?.id === "string" ? file.id : null,
      localPath: null
    }));
}
