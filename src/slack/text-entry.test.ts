import test from "node:test";
import assert from "node:assert/strict";
import { registerSlackHandlers } from "./handlers.js";

test("routes Slack thread replies through the unified message entry point when a session exists", async () => {
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
      getPersistentSessionByThread() {
        return { sessionId: "session-1" };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any,
    imageCache: {
      async cacheSlackAttachments(attachments: any[]) {
        return attachments.map((attachment, index) => ({
          ...attachment,
          localPath: `E:/AgentBridge/.image-cache/${index}-${attachment.name}`
        }));
      }
    } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
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
      ts: "172",
      thread_ts: "171"
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
        ts: "172"
      }
    }
  });

  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0], {
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: "171",
    messageId: "172",
    rawText: "status",
    attachments: []
  });
  assert.equal(postedMessages[0]?.text, "Processing your message...");
  assert.equal(updatedMessages[0]?.text, "AgentBridge response");
});

test("ignores Slack DM root messages until a modal-created thread exists", async () => {
  let messageHandler: any = null;
  let routed = false;
  let posted = false;

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
      getPersistentSessionByThread() {
        return null;
      },
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

  await messageHandler({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "hello",
      ts: "171"
    },
    client: {
      chat: {
        async postMessage() {
          posted = true;
          return { ts: "reply-1" };
        },
        async update() {
          throw new Error("should not update");
        }
      }
    },
    body: { event: { ts: "171" } }
  });

  assert.equal(routed, false);
  assert.equal(posted, false);
});

test("ignores Slack thread replies when the thread is not a registered session", async () => {
  let messageHandler: any = null;
  let routed = false;
  let posted = false;

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
      getPersistentSessionByThread() {
        return null;
      },
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

  await messageHandler({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "hello",
      ts: "172",
      thread_ts: "171"
    },
    client: {
      chat: {
        async postMessage() {
          posted = true;
          return { ts: "reply-2" };
        },
        async update() {
          throw new Error("should not update");
        }
      }
    },
    body: { event: { ts: "172" } }
  });

  assert.equal(routed, false);
  assert.equal(posted, false);
});

test("routes Slack DM image attachments into the unified message entry point", async () => {
  let messageHandler: any = null;
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
      getPersistentSessionByThread() {
        return { sessionId: "session-1" };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any,
    imageCache: {
      async cacheSlackAttachments(attachments: any[]) {
        return attachments.map((attachment, index) => ({
          ...attachment,
          localPath: `E:/AgentBridge/.image-cache/${index}-${attachment.name}`
        }));
      }
    } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
    } as any
  });

  if (!messageHandler) {
    throw new Error("Expected Slack message handler to be registered");
  }

  await messageHandler({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "please inspect this image",
      ts: "172",
      thread_ts: "171",
      files: [
        {
          id: "F123",
          mimetype: "image/png",
          name: "error.png",
          url_private_download: "https://files.slack.com/example/error.png"
        }
      ]
    },
    client: {
      chat: {
        async postMessage() {
          return { ts: "reply-2" };
        },
        async update(payload: any) {
          return payload;
        }
      }
    },
    body: {
      event: {
        ts: "172"
      }
    }
  });

  assert.deepEqual(routed[0]?.attachments, [
    {
      kind: "image",
      name: "error.png",
      mimeType: "image/png",
      sourceUrl: "https://files.slack.com/example/error.png",
      platformFileId: "F123",
      localPath: "E:/AgentBridge/.image-cache/0-error.png"
    }
  ]);
});

test("routes Slack DM file_share image messages even without text", async () => {
  let messageHandler: any = null;
  const routed: any[] = [];
  const postedMessages: any[] = [];

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
      getPersistentSessionByThread() {
        return { sessionId: "session-1" };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled image",
          session: null
        };
      }
    } as any,
    imageCache: {
      async cacheSlackAttachments(attachments: any[]) {
        return attachments.map((attachment, index) => ({
          ...attachment,
          localPath: `E:/AgentBridge/.image-cache/${index}-${attachment.name}`
        }));
      }
    } as any
  });

  if (!messageHandler) {
    throw new Error("Expected Slack message handler to be registered");
  }

  await messageHandler({
    message: {
      type: "message",
      subtype: "file_share",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      ts: "173",
      thread_ts: "171",
      files: [
        {
          id: "F124",
          mimetype: "image/jpeg",
          name: "screenshot.jpg",
          url_private_download: "https://files.slack.com/example/screenshot.jpg"
        }
      ]
    },
    client: {
      chat: {
        async postMessage(payload: any) {
          postedMessages.push(payload);
          return { ts: "reply-3" };
        },
        async update(payload: any) {
          return payload;
        }
      }
    },
    body: {
      event: {
        ts: "173"
      }
    }
  });

  assert.equal(postedMessages[0]?.text, "Processing your message...");
  assert.equal(routed.length, 1);
  assert.equal(routed[0]?.rawText, "");
  assert.deepEqual(routed[0]?.attachments, [
    {
      kind: "image",
      name: "screenshot.jpg",
      mimeType: "image/jpeg",
      sourceUrl: "https://files.slack.com/example/screenshot.jpg",
      platformFileId: "F124",
      localPath: "E:/AgentBridge/.image-cache/0-screenshot.jpg"
    }
  ]);
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
    } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
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

test("ignores duplicate Slack DM deliveries once a message is already reserved", async () => {
  let messageHandler: any = null;
  let handledCount = 0;
  let postCount = 0;

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
      getPersistentSessionByThread() {
        return { sessionId: "session-1" };
      },
      async handleIncomingMessage() {
        handledCount += 1;
        return {
          kind: "info",
          text: "handled",
          session: null
        };
      }
    } as any,
    messageDeduper: {
      tryBeginCalls: 0,
      tryBegin() {
        this.tryBeginCalls += 1;
        return this.tryBeginCalls === 1;
      },
      markCompleted() {},
      release() {}
    } as any
  });

  await messageHandler({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "status",
      ts: "174",
      thread_ts: "171"
    },
    client: {
      chat: {
        async postMessage() {
          postCount += 1;
          return { ts: "reply-4" };
        },
        async update(payload: any) {
          return payload;
        }
      }
    },
    body: { event: { ts: "174" } }
  });

  await messageHandler({
    message: {
      type: "message",
      user: "U123",
      channel: "D123",
      channel_type: "im",
      text: "status",
      ts: "174",
      thread_ts: "171"
    },
    client: {
      chat: {
        async postMessage() {
          postCount += 1;
          return { ts: "reply-5" };
        },
        async update(payload: any) {
          return payload;
        }
      }
    },
    body: { event: { ts: "174" } }
  });

  assert.equal(handledCount, 1);
  assert.equal(postCount, 1);
});
