import test from "node:test";
import assert from "node:assert/strict";
import { registerSlackHandlers } from "./handlers.js";

test("routes allowed Slack DM text through the unified message entry point", async () => {
  let messageHandler: any = null;
  const postedMessages: Array<{ channel: string; thread_ts?: string; text: string }> = [];
  const updatedMessages: Array<{ channel: string; ts: string; text: string }> = [];
  const routed: any[] = [];

  const app = {
    shortcut() {},
    view() {},
    action() {},
    message(handler: (args: any) => Promise<void>) {
      messageHandler = handler;
    }
  };

  registerSlackHandlers(app as any, {
    allowedUserId: "U123",
    logger: { warn() {}, error() {} } as any,
    config: {
      runtime: {
        allowedCwds: ["E:/AgentBridge"],
        defaultAgent: "codex"
      }
    } as any,
    agentBridgeService: {
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any
  });

  if (!messageHandler) {
    throw new Error("Expected Slack message handler to be registered");
  }

  const handleMessage = messageHandler;

  await handleMessage({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "status",
      ts: "171"
    },
    client: {
      chat: {
        async postMessage(payload: any) {
          postedMessages.push(payload);
          return { ts: "reply-1" };
        },
        async update(payload: any) {
          updatedMessages.push(payload);
          return payload;
        }
      }
    },
    body: {
      event: {
        ts: "171"
      }
    }
  });

  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0], {
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: "171",
    messageId: "171",
    rawText: "status"
  });
  assert.equal(postedMessages[0]?.text, "Processing your message...");
  assert.equal(updatedMessages[0]?.text, "AgentBridge response");
});

test("ignores non-DM Slack messages for v1 text entry", async () => {
  let messageHandler: any = null;
  let routed = false;

  const app = {
    shortcut() {},
    view() {},
    action() {},
    message(handler: (args: any) => Promise<void>) {
      messageHandler = handler;
    }
  };

  registerSlackHandlers(app as any, {
    allowedUserId: "U123",
    logger: { warn() {}, error() {} } as any,
    config: {
      runtime: {
        allowedCwds: ["E:/AgentBridge"],
        defaultAgent: "codex"
      }
    } as any,
    agentBridgeService: {
      async handleIncomingMessage() {
        routed = true;
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any
  });

  if (!messageHandler) {
    throw new Error("Expected Slack message handler to be registered");
  }

  const handleMessage = messageHandler;

  await handleMessage({
    message: {
      type: "message",
      user: "U123",
      channel: "C123",
      channel_type: "channel",
      text: "status",
      ts: "171"
    },
    client: {
      chat: {
        async postMessage() {
          throw new Error("should not post");
        },
        async update() {
          throw new Error("should not update");
        }
      }
    },
    body: {
      event: {
        ts: "171"
      }
    }
  });

  assert.equal(routed, false);
});
