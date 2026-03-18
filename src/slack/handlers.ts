import type { App } from "@slack/bolt";
import type { Logger } from "pino";
import { z } from "zod";
import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";
import type { AgentBridgeService } from "../services/agent-bridge-service.js";
import { buildExecutionBlocks, buildInfoBlocks, buildStatusBlocks } from "./messages.js";
import { buildConsoleModal } from "./views.js";

type HandlerContext = {
  allowedUserId: string;
  logger: Logger;
  config: AppConfig;
  agentBridgeService: AgentBridgeService;
};

const modalSubmissionSchema = z.object({
  agentType: z.enum(["claude", "codex"]),
  action: z.enum(["run_once", "send_persistent", "new_session", "status", "restart_session"]),
  cwd: z.string().min(1),
  message: z.string()
});

export function registerSlackHandlers(app: App, context: HandlerContext) {
  app.shortcut("open_agent_console", async ({ ack, body, client }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildConsoleModal({
        allowedCwds: context.config.runtime.allowedCwds,
        defaultAgent: context.config.runtime.defaultAgent
      })
    });
  });

  app.view("agent_console_submit", async ({ ack, body, view, client }: any) => {
    await ack();
    ensureAllowedUser(body.user.id, context);

    const values = parseModalSubmission(view.state.values);
    const dmChannelId = await openDirectMessage(client, body.user.id);

    const startMessage = await client.chat.postMessage({
      channel: dmChannelId,
      text: `Starting ${values.action} for ${values.agentType}...`,
      blocks: buildInfoBlocks(`Starting *${values.action}* for *${values.agentType}* in \`${values.cwd}\`...`)
    });

    try {
      if (values.action === "run_once") {
        ensureMessage(values.message, values.action);
        const result = await context.agentBridgeService.runOnce({
          agentType: values.agentType,
          cwd: values.cwd,
          message: values.message,
          platform: "slack",
          platformChannelId: dmChannelId,
          platformThreadId: startMessage.ts,
          platformUserId: body.user.id
        });

        await client.chat.update({
          channel: dmChannelId,
          ts: startMessage.ts,
          text: `Run once finished: ${result.run.status}`,
          blocks: buildExecutionBlocks({
            title: "Run Once Result",
            run: result.run,
            session: result.session
          })
        });
        return;
      }

      if (values.action === "send_persistent") {
        ensureMessage(values.message, values.action);
        const result = await context.agentBridgeService.sendToPersistentSession({
          agentType: values.agentType,
          cwd: values.cwd,
          message: values.message,
          platform: "slack",
          platformChannelId: dmChannelId,
          platformThreadId: startMessage.ts,
          platformUserId: body.user.id
        });

        await client.chat.update({
          channel: dmChannelId,
          ts: startMessage.ts,
          text: `Persistent session updated: ${result.run.status}`,
          blocks: buildExecutionBlocks({
            title: "Persistent Session Result",
            run: result.run,
            session: result.session
          })
        });
        return;
      }

      if (values.action === "new_session") {
        const session = context.agentBridgeService.createOrResetPersistentSession(
          values.agentType,
          values.cwd,
          "slack",
          body.user.id
        );

        await client.chat.update({
          channel: dmChannelId,
          ts: startMessage.ts,
          text: "Persistent session created",
          blocks: buildInfoBlocks(
            `Persistent session ready.\n*Agent:* ${session.agentType}\n*Session:* ${session.sessionId}\n*cwd:* \`${session.cwd}\``
          )
        });
        return;
      }

      if (values.action === "restart_session") {
        const session = context.agentBridgeService.restartSession(
          values.agentType,
          values.cwd,
          "slack",
          body.user.id
        );
        await client.chat.update({
          channel: dmChannelId,
          ts: startMessage.ts,
          text: "Persistent session restarted",
          blocks: buildInfoBlocks(
            `Persistent session reset.\n*Agent:* ${session.agentType}\n*Session:* ${session.sessionId}\n*cwd:* \`${session.cwd}\``
          )
        });
        return;
      }

      if (values.action === "status") {
        const status = context.agentBridgeService.getSessionStatus(
          values.agentType,
          "slack",
          body.user.id
        );
        await client.chat.update({
          channel: dmChannelId,
          ts: startMessage.ts,
          text: "Session status",
          blocks: buildStatusBlocks({
            agentType: values.agentType,
            session: status.session,
            run: status.run
          })
        });
      }
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
        allowedCwds: context.config.runtime.allowedCwds,
        defaultAgent: context.config.runtime.defaultAgent
      })
    });
  });

  app.message(async ({ message, client, body }: any) => {
    if (!isDirectMessageEvent(message) || message.user !== context.allowedUserId) {
      return;
    }

    const threadTs = message.thread_ts ?? message.ts;
    const startMessage = await client.chat.postMessage({
      channel: message.channel,
      thread_ts: threadTs,
      text: "Processing your message...",
      blocks: buildInfoBlocks("Processing your message...")
    });

    try {
      const result = await context.agentBridgeService.handleIncomingMessage({
        platform: "slack",
        platformUserId: message.user,
        platformChannelId: message.channel,
        platformThreadId: threadTs,
        messageId: message.ts,
        rawText: (message.text as string | undefined)?.trim() ?? ""
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
        return;
      }

      if (result.kind === "status") {
        await client.chat.update({
          channel: message.channel,
          ts: startMessage.ts,
          text: "AgentBridge response",
          blocks: buildStatusBlocks({
            agentType: result.agentType,
            session: result.session,
            run: result.run
          })
        });
        return;
      }

      await client.chat.update({
        channel: message.channel,
        ts: startMessage.ts,
        text: "AgentBridge response",
        blocks: buildInfoBlocks(result.text)
      });
    } catch (error) {
      context.logger.error({ error }, "Failed to handle Slack text message");
      await client.chat.update({
        channel: message.channel,
        ts: startMessage.ts,
        text: "AgentBridge action failed",
        blocks: buildInfoBlocks(formatErrorMessage(error))
      });
    }
  });
}

function ensureAllowedUser(userId: string, context: HandlerContext) {
  if (userId !== context.allowedUserId) {
    context.logger.warn({ userId }, "Rejected Slack action from unauthorized user");
    throw new Error("Unauthorized Slack user");
  }
}

function parseModalSubmission(values: Record<string, Record<string, any>>): {
  agentType: AgentType;
  action: "run_once" | "send_persistent" | "new_session" | "status" | "restart_session";
  cwd: string;
  message: string;
} {
  const agentBlock = values.agent_block;
  const actionBlock = values.action_block;
  const cwdBlock = values.cwd_block;
  const messageBlock = values.message_block;

  if (!agentBlock || !actionBlock || !cwdBlock || !messageBlock) {
    throw new Error("Modal submission is missing required fields");
  }

  const agentType = agentBlock.agent.selected_option.value as AgentType;
  const action = actionBlock.action.selected_option.value as
    | "run_once"
    | "send_persistent"
    | "new_session"
    | "status"
    | "restart_session";
  const cwd = cwdBlock.cwd.selected_option.value as string;
  const message = (messageBlock.message.value as string | undefined)?.trim() ?? "";

  return modalSubmissionSchema.parse({
    agentType,
    action,
    cwd,
    message
  });
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

function ensureMessage(message: string, action: string) {
  if (!message) {
    throw new Error(`Message is required for ${action}`);
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `Action failed: ${error.message}`;
  }

  return "Action failed with an unknown error.";
}

function isDirectMessageEvent(message: any): boolean {
  return (
    message?.type === "message"
    && message?.channel_type === "im"
    && typeof message?.text === "string"
    && !message?.bot_id
    && !message?.subtype
  );
}
