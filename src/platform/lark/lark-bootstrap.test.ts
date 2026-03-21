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

test("lark handler transforms initialized thread messages into unified platform messages", async () => {
  const routed: any[] = [];
  const replies: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
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
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
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
        root_id: "om_root",
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
  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();
  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0], {
    platform: "lark",
    platformUserId: "ou_123",
    platformChannelId: "oc_123",
    platformThreadId: "om_root",
    messageId: "om_123",
    rawText: "status"
  });
  assert.equal(replies[0]?.messageId, "om_123");
});

test("lark handler returns immediately and deduplicates repeated message events", async () => {
  const routed: any[] = [];
  const replies: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];
  let releaseProcessing: any = null;

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        await new Promise<void>((resolve) => {
          releaseProcessing = resolve;
        });
        return {
          kind: "info",
          text: "handled once",
          session: null
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
    } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  });

  const payload = {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_dup",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_dup",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "text",
        content: JSON.stringify({ text: "status" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  };

  const first = await handler(payload);
  const second = await handler(payload);

  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(routed.length, 0);
  assert.equal(scheduledTasks.length, 1);

  const runningTask = scheduledTasks[0]!();
  await Promise.resolve();
  assert.equal(routed.length, 1);
  const release = releaseProcessing;
  if (!release) {
    throw new Error("Expected releaseProcessing to be set");
  }
  release();
  await runningTask;

  assert.equal(replies.length, 1);
  assert.equal(replies[0]?.messageId, "om_dup");
});

test("lark handler turns a root start message into an agent selection prompt", async () => {
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {} as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_start",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_start",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.equal(replies[0]?.messageId, "om_start");
  assert.match(JSON.parse(replies[0]?.content.content ?? "{}").text ?? "", /choose agent/i);
});

test("lark handler accepts @mention start as a root topic opener", async () => {
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {} as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_start_mention",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_start_mention",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "@OpenClaw start" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.equal(replies[0]?.messageId, "om_start_mention");
  assert.match(JSON.parse(replies[0]?.content.content ?? "{}").text ?? "", /choose agent/i);
});

test("lark handler asks the user to send start before using root messages", async () => {
  const routed: any[] = [];
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "should not route",
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

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_root_plain",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_root_plain",
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

  assert.equal(routed.length, 0);
  assert.equal(replies[0]?.messageId, "om_root_plain");
  assert.match(JSON.parse(replies[0]?.content.content ?? "{}").text ?? "", /send `start`/i);
});

test("lark handler explains that a thread without a bound session must be reinitialized", async () => {
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return null;
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_thread_no_session",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_thread_no_session",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "text",
        content: JSON.stringify({ text: "hello" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.match(
    JSON.parse(replies[0]?.content.content ?? "{}").text ?? "",
    /not bound to an active session/i
  );
});

test("lark handler requires an exact agent choice before moving to workspace selection", async () => {
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {} as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_start_agent",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_start_agent",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_agent_invalid",
      create_time: "172"
    },
    event: {
      message: {
        message_id: "om_agent_invalid",
        chat_id: "oc_123",
        root_id: "om_start_agent",
        message_type: "text",
        content: JSON.stringify({ text: "use codex" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_agent_valid",
      create_time: "173"
    },
    event: {
      message: {
        message_id: "om_agent_valid",
        chat_id: "oc_123",
        root_id: "om_start_agent",
        message_type: "text",
        content: JSON.stringify({ text: "codex" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.match(JSON.parse(replies[1]?.content.content ?? "{}").text ?? "", /exactly `codex` or `claude`/i);
  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /choose workspace/i);
});

test("lark handler uses exact paths or unique label fragments for large workspace lists", async () => {
  const replies: any[] = [];
  const createdSessions: any[] = [];
  const allowedWorkspaces = Array.from({ length: 25 }, (_, index) => ({
    rootPath: `E:/repos/project-${index + 1}`,
    label: `project-${index + 1}`,
    kind: "git_repo" as const
  }));

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    allowedWorkspaces,
    agentBridgeService: {
      createOrResetPersistentSession(agentType: string, cwd: string, platform: string, userId: string, channelId: string, threadId: string) {
        createdSessions.push({ agentType, cwd, platform, userId, channelId, threadId });
        return {
          sessionId: "session-1",
          agentType,
          cwd
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

  const base = {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      create_time: "171"
    },
    event: {
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  };

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_large_start" },
    event: {
      ...base.event,
      message: {
        message_id: "om_large_start",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_large_agent" },
    event: {
      ...base.event,
      message: {
        message_id: "om_large_agent",
        chat_id: "oc_123",
        root_id: "om_large_start",
        message_type: "text",
        content: JSON.stringify({ text: "codex" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_large_workspace" },
    event: {
      ...base.event,
      message: {
        message_id: "om_large_workspace",
        chat_id: "oc_123",
        root_id: "om_large_start",
        message_type: "text",
        content: JSON.stringify({ text: "project-25" })
      }
    }
  });

  assert.match(JSON.parse(replies[1]?.content.content ?? "{}").text ?? "", /unique label fragment/i);
  assert.deepEqual(createdSessions[0], {
    agentType: "codex",
    cwd: "E:/repos/project-25",
    platform: "lark",
    userId: "ou_123",
    channelId: "oc_123",
    threadId: "om_large_start"
  });
});

test("lark handler shows narrowed matches when a workspace fragment is ambiguous", async () => {
  const replies: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    allowedWorkspaces: [
      { rootPath: "E:/repos/project-api", label: "project-api", kind: "git_repo" },
      { rootPath: "E:/repos/project-app", label: "project-app", kind: "git_repo" },
      { rootPath: "E:/repos/notes", label: "notes", kind: "plain_dir" }
    ],
    agentBridgeService: {} as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any
  });

  const base = {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      create_time: "171"
    },
    event: {
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  };

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_amb_start" },
    event: {
      ...base.event,
      message: {
        message_id: "om_amb_start",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_amb_agent" },
    event: {
      ...base.event,
      message: {
        message_id: "om_amb_agent",
        chat_id: "oc_123",
        root_id: "om_amb_start",
        message_type: "text",
        content: JSON.stringify({ text: "claude" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_amb_workspace" },
    event: {
      ...base.event,
      message: {
        message_id: "om_amb_workspace",
        chat_id: "oc_123",
        root_id: "om_amb_start",
        message_type: "text",
        content: JSON.stringify({ text: "project" })
      }
    }
  });

  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /workspace is ambiguous/i);
  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /project-api/i);
  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /project-app/i);
});

test("lark handler initializes the thread after exact agent and workspace selection", async () => {
  const replies: any[] = [];
  const createdSessions: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      createOrResetPersistentSession(agentType: string, cwd: string, platform: string, userId: string, channelId: string, threadId: string) {
        createdSessions.push({ agentType, cwd, platform, userId, channelId, threadId });
        return {
          sessionId: "session-1",
          agentType,
          cwd
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    allowedCwds: ["E:/AgentBridge", "/Users/test/repo"]
  } as any);

  const base = {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      create_time: "171"
    },
    event: {
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  };

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_start_init" },
    event: {
      ...base.event,
      message: {
        message_id: "om_start_init",
        chat_id: "oc_123",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_choose_agent" },
    event: {
      ...base.event,
      message: {
        message_id: "om_choose_agent",
        chat_id: "oc_123",
        root_id: "om_start_init",
        message_type: "text",
        content: JSON.stringify({ text: "claude" })
      }
    }
  });

  await handler({
    ...base,
    header: { ...base.header, event_id: "evt_choose_cwd" },
    event: {
      ...base.event,
      message: {
        message_id: "om_choose_cwd",
        chat_id: "oc_123",
        root_id: "om_start_init",
        message_type: "text",
        content: JSON.stringify({ text: "2" })
      }
    }
  });

  assert.deepEqual(createdSessions[0], {
    agentType: "claude",
    cwd: "/Users/test/repo",
    platform: "lark",
    userId: "ou_123",
    channelId: "oc_123",
    threadId: "om_start_init"
  });
  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /workspace:/i);
});

test("lark handler continues topic-mode replies keyed by thread_id even without root_id", async () => {
  const replies: any[] = [];
  const createdSessions: any[] = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      createOrResetPersistentSession(agentType: string, cwd: string, platform: string, userId: string, channelId: string, threadId: string) {
        createdSessions.push({ agentType, cwd, platform, userId, channelId, threadId });
        return {
          sessionId: "session-1",
          agentType,
          cwd
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    allowedCwds: ["E:/AgentBridge"]
  } as any);

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_topic_start",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_topic_start",
        chat_id: "oc_123",
        thread_id: "omt_1",
        message_type: "text",
        content: JSON.stringify({ text: "start" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  } as any);

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_topic_agent",
      create_time: "172"
    },
    event: {
      message: {
        message_id: "om_topic_agent",
        chat_id: "oc_123",
        thread_id: "omt_1",
        parent_id: "om_topic_start",
        message_type: "text",
        content: JSON.stringify({ text: "codex" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  } as any);

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_topic_cwd",
      create_time: "173"
    },
    event: {
      message: {
        message_id: "om_topic_cwd",
        chat_id: "oc_123",
        thread_id: "omt_1",
        parent_id: "om_topic_start",
        message_type: "text",
        content: JSON.stringify({ text: "1" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  } as any);

  assert.deepEqual(createdSessions[0], {
    agentType: "codex",
    cwd: "E:/AgentBridge",
    platform: "lark",
    userId: "ou_123",
    channelId: "oc_123",
    threadId: "omt_1"
  });
  assert.match(JSON.parse(replies[2]?.content.content ?? "{}").text ?? "", /initialized/i);
});

test("lark handler locks an initialized thread so non-stop messages are always forwarded as prompts", async () => {
  const replies: any[] = [];
  const forwarded: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "claude",
          cwd: "/Users/test/repo",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage(params: any) {
        forwarded.push(params);
        return {
          kind: "execution",
          title: "Persistent Session Result",
          run: { outputTail: "done", status: "finished" },
          session: { sessionId: "session-1" }
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  } as any);

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_locked_prompt",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_locked_prompt",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "text",
        content: JSON.stringify({ text: "use codex and switch to /tmp then fix this" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0]?.platformThreadId, "om_root");
  assert.equal(forwarded[0]?.rawText, "use codex and switch to /tmp then fix this");
  assert.equal(replies[0]?.messageId, "om_locked_prompt");
});

test("lark handler expires duplicate event reservations even when the scheduled task does not complete", async () => {
  const scheduledTasks: Array<() => Promise<void>> = [];
  const timeoutCalls: Array<{ fn: () => void; ms: number }> = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let routedCount = 0;

  global.setTimeout = ((fn: (...args: any[]) => void, ms?: number) => {
    timeoutCalls.push({ fn: () => fn(), ms: ms ?? 0 });
    return {
      unref() {}
    } as any;
  }) as typeof setTimeout;
  global.clearTimeout = (() => {}) as typeof clearTimeout;

  try {
  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage() {
        routedCount += 1;
        return new Promise(() => {});
        }
      } as any,
      client: {
        async replyToMessage() {}
      } as any,
      logger: { info() {}, warn() {}, error() {} } as any,
      schedule(task: () => Promise<void>) {
        scheduledTasks.push(task);
      }
    });

    const payload = {
      schema: "2.0",
      header: {
        event_type: "im.message.receive_v1",
        event_id: "evt_stuck",
        create_time: "171"
      },
      event: {
        message: {
          message_id: "om_stuck",
          chat_id: "oc_123",
          root_id: "om_root",
          message_type: "text",
          content: JSON.stringify({ text: "status" })
        },
        sender: {
          sender_id: {
            open_id: "ou_123"
          }
        }
      }
    };

    await handler(payload);
    assert.equal(scheduledTasks.length, 1);
    const runningTask = scheduledTasks[0]!();
    await Promise.resolve();
    assert.equal(routedCount, 1);

    const duplicateWhileReserved = await handler(payload);
    assert.deepEqual(duplicateWhileReserved, { ok: true });
    assert.equal(scheduledTasks.length, 1);
    assert.equal(timeoutCalls.length, 1);
    assert.equal(timeoutCalls[0]?.ms, 5 * 60 * 1000);

    timeoutCalls[0]!.fn();
    await handler(payload);
    assert.equal(scheduledTasks.length, 2);
    await Promise.race([runningTask, Promise.resolve()]);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test("lark handler routes image messages through the shared attachment pipeline", async () => {
  const routed: any[] = [];
  const replies: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
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
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      },
      async downloadImage(messageId: string, imageKey: string) {
        return {
          bytes: new Uint8Array([9, 8, 7]),
          mimeType: "image/png",
          name: `${messageId}-${imageKey}.png`
        };
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
    } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    },
    imageCache: {
      async cacheLarkAttachments(attachments: any[], options: any) {
        return Promise.all(attachments.map(async (attachment: any) => {
          const downloaded = await options.download(attachment);
          return {
          ...attachment,
          name: downloaded.name,
          mimeType: downloaded.mimeType,
          localPath: `E:/AgentBridge/.image-cache/${attachment.platformFileId}.png`
          };
        }));
      }
    } as any
  });

  const response = await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_img",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_img",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "image",
        content: JSON.stringify({ image_key: "img_123" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();
  assert.equal(routed.length, 1);
  assert.deepEqual(routed[0], {
    platform: "lark",
    platformUserId: "ou_123",
    platformChannelId: "oc_123",
    platformThreadId: "om_root",
    messageId: "om_img",
    rawText: "",
    attachments: [
      {
        kind: "image",
        name: "om_img-img_123.png",
        mimeType: "image/png",
        sourceUrl: null,
        platformFileId: "img_123",
        localPath: "E:/AgentBridge/.image-cache/img_123.png"
      }
    ]
  });
  assert.equal(replies[0]?.messageId, "om_img");
});

test("lark handler replies with an error message when image download fails", async () => {
  const replies: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage() {
        throw new Error("should not reach service");
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      },
      async downloadImage() {
        throw new Error("image download failed");
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    messageDeduper: {
      tryBegin() {
        return true;
      },
      markCompleted() {},
      release() {}
    } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    },
    imageCache: {
      async cacheLarkAttachments(attachments: any[], options: any) {
        return Promise.all(attachments.map((attachment: any) => options.download(attachment)));
      }
    } as any
  });

  const response = await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_img_err",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_img_err",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "image",
        content: JSON.stringify({ image_key: "img_err" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  });

  assert.deepEqual(response, { ok: true });
  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();
  assert.equal(replies[0]?.messageId, "om_img_err");
  assert.match(JSON.parse(replies[0]?.content.content ?? "{}").text ?? "", /Action failed:/);
});

test("lark handler ignores duplicate deliveries once the message was already reserved", async () => {
  const routed: any[] = [];
  const replies: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "info",
          text: "handled once",
          session: null
        };
      }
    } as any,
    client: {
      async replyToMessage(messageId: string, content: any) {
        replies.push({ messageId, content });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    messageDeduper: {
      calls: 0,
      tryBegin() {
        this.calls += 1;
        return this.calls === 1;
      },
      markCompleted() {},
      release() {}
    } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  });

  const payload = {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_dup_store_1",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_dup_store",
        chat_id: "oc_123",
        root_id: "om_root",
        message_type: "text",
        content: JSON.stringify({ text: "status" })
      },
      sender: {
        sender_id: {
          open_id: "ou_123"
        }
      }
    }
  };

  await handler(payload);
  await handler({
    ...payload,
    header: {
      ...payload.header,
      event_id: "evt_dup_store_2"
    }
  });

  assert.equal(scheduledTasks.length, 2);
  await scheduledTasks[0]!();
  await scheduledTasks[1]!();

  assert.equal(routed.length, 1);
  assert.equal(replies.length, 1);
});

test("lark handler sends and updates a shared progress card for thread executions", async () => {
  const routed: any[] = [];
  const cardReplies: any[] = [];
  const cardUpdates: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage(message: any) {
        routed.push(message);
        return {
          kind: "execution",
          title: "Persistent Session Result",
          run: {
            outputTail: "all done",
            status: "finished"
          },
          session: {
            sessionId: "session-1"
          }
        };
      }
    } as any,
    client: {
      async replyToMessage() {
        throw new Error("expected progress card path instead of plain text reply");
      },
      async replyWithProgressCard(messageId: string, title: string, status: string, body: string) {
        cardReplies.push({ messageId, title, status, body });
        return "om_progress_1";
      },
      async updateProgressCard(messageId: string, title: string, status: string, body: string) {
        cardUpdates.push({ messageId, title, status, body });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  });

  const response = await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_progress",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_progress_src",
        chat_id: "oc_123",
        root_id: "om_root",
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
  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();

  assert.equal(routed.length, 1);
  assert.deepEqual(cardReplies[0], {
    messageId: "om_progress_src",
    title: "AgentBridge",
    status: "Processing",
    body: "Request received. Running the agent now..."
  });
  assert.deepEqual(cardUpdates[0], {
    messageId: "om_progress_1",
    title: "AgentBridge",
    status: "Completed",
    body: "Persistent Session Result\nAgent session: session-1\nStatus: finished\n\nall done"
  });
});

test("lark handler shows interrupted runs as Interrupted on the shared progress card", async () => {
  const cardUpdates: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage() {
        return {
          kind: "execution",
          title: "Persistent Session Result",
          run: {
            outputTail: "stopped",
            status: "interrupted"
          },
          session: {
            sessionId: "session-1"
          }
        };
      }
    } as any,
    client: {
      async replyToMessage() {
        throw new Error("expected progress card path instead of plain text reply");
      },
      async replyWithProgressCard() {
        return "om_progress_interrupt";
      },
      async updateProgressCard(messageId: string, title: string, status: string, body: string) {
        cardUpdates.push({ messageId, title, status, body });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_progress_interrupt",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_progress_interrupt_src",
        chat_id: "oc_123",
        root_id: "om_root",
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

  await scheduledTasks[0]!();

  assert.deepEqual(cardUpdates[0], {
    messageId: "om_progress_interrupt",
    title: "AgentBridge",
    status: "Interrupted",
    body: "Persistent Session Result\nAgent session: session-1\nStatus: interrupted\n\nstopped"
  });
});

test("lark handler updates the shared progress card to failed when execution errors", async () => {
  const cardReplies: any[] = [];
  const cardUpdates: any[] = [];
  const scheduledTasks: Array<() => Promise<void>> = [];

  const handler = createLarkEventHandler({
    allowedUserId: "ou_123",
    agentBridgeService: {
      getPersistentSessionByThread() {
        return {
          sessionId: "session-1",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          lastRunId: "run-1"
        };
      },
      async handleIncomingMessage() {
        throw new Error("boom");
      }
    } as any,
    client: {
      async replyToMessage() {
        throw new Error("expected progress card path instead of plain text reply");
      },
      async replyWithProgressCard(messageId: string, title: string, status: string, body: string) {
        cardReplies.push({ messageId, title, status, body });
        return "om_progress_fail";
      },
      async updateProgressCard(messageId: string, title: string, status: string, body: string) {
        cardUpdates.push({ messageId, title, status, body });
      }
    } as any,
    logger: { info() {}, warn() {}, error() {} } as any,
    schedule(task: () => Promise<void>) {
      scheduledTasks.push(task);
    }
  });

  await handler({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      event_id: "evt_progress_fail",
      create_time: "171"
    },
    event: {
      message: {
        message_id: "om_progress_fail_src",
        chat_id: "oc_123",
        root_id: "om_root",
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

  assert.equal(scheduledTasks.length, 1);
  await scheduledTasks[0]!();

  assert.deepEqual(cardReplies[0], {
    messageId: "om_progress_fail_src",
    title: "AgentBridge",
    status: "Processing",
    body: "Request received. Running the agent now..."
  });
  assert.deepEqual(cardUpdates[0], {
    messageId: "om_progress_fail",
    title: "AgentBridge",
    status: "Failed",
    body: "Action failed: boom"
  });
});
