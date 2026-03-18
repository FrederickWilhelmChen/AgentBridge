import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../app/config.js";
import { createLarkEventHandler } from "./handlers.js";

test("loadConfig supports Lark-only startup", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "lark",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "codex -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "codex resume {sessionId} -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text",
    LARK_APP_ID: "cli_app",
    LARK_APP_SECRET: "secret",
    LARK_ALLOWED_USER_ID: "ou_123"
  };

  try {
    const config = loadConfig();

    assert.deepEqual(config.runtime.enabledPlatforms, ["lark"]);
    assert.equal(config.lark?.appId, "cli_app");
    assert.equal(config.lark?.allowedUserId, "ou_123");
    assert.equal(config.slack, undefined);
  } finally {
    process.env = previousEnv;
  }
});

test("lark handler transforms incoming message events into unified platform messages", async () => {
  const routed: any[] = [];
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  const response = await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_1",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_123",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "status" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0], {
    platform: "lark",
    platformUserId: "ou_123",
    platformChannelId: "oc_123",
    platformThreadId: null,
    messageId: "om_123",
    rawText: "status"
  });
  assert.equal(replies[0]?.messageId, "om_123");
});
