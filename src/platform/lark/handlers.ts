import type { Logger } from "pino";
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
  | { kind: "status"; agentType: string; session: { sessionId: string; status: string; cwd: string } | null; run: { outputTail: string } | null }
  | { kind: "info"; text: string; session: unknown };

type HandlerArgs = {
  allowedUserId: string;
  agentBridgeService: {
    handleIncomingMessage(message: {
      platform: "lark";
      platformUserId: string;
      platformChannelId: string;
      platformThreadId: string | null;
      messageId: string;
      rawText: string;
    }): Promise<LarkResult>;
  };
  client: {
    replyToMessage(messageId: string, content: ReturnType<typeof buildLarkTextMessage>): Promise<void>;
  };
  logger: Logger;
};

export function createLarkEventHandler(args: HandlerArgs) {
  const handleMessageEvent = createLarkMessageHandler(args);

  return async function handleEnvelope(payload: LarkRawEnvelope): Promise<{ ok?: true; challenge?: string }> {
    if (payload.challenge) {
      return { challenge: payload.challenge };
    }

    if (payload.header?.event_type !== "im.message.receive_v1" || !payload.event) {
      return { ok: true };
    }

    await handleMessageEvent(payload.event);
    return { ok: true };
  };
}

export function createLarkMessageHandler(args: HandlerArgs) {
  return async function handleMessageEvent(event: LarkMessageEvent): Promise<void> {
    const messageId = event.message?.message_id;
    const chatId = event.message?.chat_id;
    const rawContent = event.message?.content;
    const userId = event.sender?.sender_id?.open_id;

    if (!messageId || !chatId || !rawContent || !userId) {
      args.logger.warn({ event }, "Ignoring malformed Lark message event");
      return;
    }

    args.logger.info({ messageId, chatId, userId }, "Handling Lark message event");

    if (userId !== args.allowedUserId) {
      args.logger.warn({ userId, allowedUserId: args.allowedUserId }, "Rejected Lark message from unauthorized user");
      return;
    }

    const content = parseLarkText(rawContent);
    if (!content) {
      return;
    }

    const result = await args.agentBridgeService.handleIncomingMessage({
      platform: "lark",
      platformUserId: userId,
      platformChannelId: chatId,
      platformThreadId: null,
      messageId,
      rawText: content
    });

    args.logger.info({ messageId }, "Sending Lark reply");
    await args.client.replyToMessage(messageId, buildLarkTextMessage(formatLarkResult(result)));
  };
}

function parseLarkText(rawContent: string): string | null {
  try {
    const parsed = JSON.parse(rawContent) as { text?: string };
    return parsed.text?.trim() ?? null;
  } catch {
    return null;
  }
}

function formatLarkResult(result: LarkResult): string {
  if (result.kind === "execution") {
    const sessionLabel = result.session?.sessionId ?? "run once";
    return `${result.title}\nAgent session: ${sessionLabel}\nStatus: ${result.run.status}\n\n${result.run.outputTail || "(no output)"}`;
  }

  if (result.kind === "status") {
    if (!result.session) {
      return `No persistent session exists for ${result.agentType}.`;
    }

    return `Persistent Session Status\nAgent: ${result.agentType}\nSession: ${result.session.sessionId}\nState: ${result.session.status}\ncwd: ${result.session.cwd}\n\n${result.run?.outputTail ?? "(no runs yet)"}`;
  }

  return result.text;
}
