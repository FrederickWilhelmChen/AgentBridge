import test from "node:test";
import assert from "node:assert/strict";
import { AgentBridgeService } from "./agent-bridge-service.js";
import type { AppConfig } from "../app/config.js";
import type { Run, Session } from "../domain/models.js";

function createConfig(): AppConfig {
  return {
    database: {
      path: "E:/AgentBridge/agentbridge.db"
    },
    runtime: {
      enabledPlatforms: ["slack", "lark"],
      allowedCwds: ["E:/AgentBridge", "/Users/test/AgentBridge"],
      defaultAgent: "codex",
      defaultTimeoutMs: 1000,
      httpProxy: null,
      httpsProxy: null,
      agents: {
        claude: {
          command: "claude",
          args: [],
          resumeArgs: ["resume", "{sessionId}"],
          outputMode: "text"
        },
        codex: {
          command: "codex",
          args: [],
          resumeArgs: ["resume", "{sessionId}"],
          outputMode: "text"
        }
      }
    }
  };
}

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: "session-1",
    agentType: "codex",
    cwd: "E:/AgentBridge",
    mode: "persistent",
    status: "idle",
    providerSessionId: null,
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    createdAt: "2026-03-20T10:00:00.000Z",
    lastActiveAt: "2026-03-20T10:00:00.000Z",
    lastRunId: null,
    ...overrides
  };
}

function createRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "run-1",
    sessionId: "session-1",
    agentType: "codex",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    inputText: "hello",
    status: "queued",
    pid: null,
    startedAt: "2026-03-20T10:00:00.000Z",
    endedAt: null,
    exitCode: null,
    outputTail: "",
    rawOutput: "",
    errorReason: null,
    ...overrides
  };
}

test("createOrResetPersistentSession creates a new session when the thread binding belongs to another agent", () => {
  const existing = createSession({ agentType: "claude" });
  let createdAgentType: Session["agentType"] | null = null;
  let updated = false;

  const service = new AgentBridgeService(
    createConfig(),
    {
      getPersistentSessionByThread() {
        return existing;
      },
      getPersistentSessionByScope() {
        return null;
      },
      createPersistentSession(
        agentType: Session["agentType"],
        cwd: string,
        platform: Session["platform"],
        platformUserId: string,
        platformChannelId: string,
        platformThreadId: string | null
      ) {
        const createdSession = createSession({
          sessionId: "session-2",
          agentType,
          cwd,
          platform,
          platformUserId,
          platformChannelId,
          platformThreadId
        });
        createdAgentType = createdSession.agentType;
        return createdSession;
      },
      updateSession() {
        updated = true;
        return existing;
      }
    } as any,
    {} as any
  );

  const result = service.createOrResetPersistentSession(
    "codex",
    "E:/AgentBridge",
    "slack",
    "U123",
    "D123",
    "thread-1"
  );

  assert.equal(result.sessionId, "session-2");
  assert.equal(createdAgentType, "codex");
  assert.equal(updated, false);
});

test("sendToPersistentSession falls back to the requested agent session when the thread binding belongs to another agent", async () => {
  let lookedUpByScope = false;
  let createdRunSessionId: string | null = null;
  const service = new AgentBridgeService(
    createConfig(),
    {
      getPersistentSessionByThread() {
        return createSession({ agentType: "claude", providerSessionId: "claude-session" });
      },
      getOrCreatePersistentSession(
        agentType: Session["agentType"],
        cwd: string,
        platform: Session["platform"],
        platformUserId: string
      ) {
        lookedUpByScope = true;
        return createSession({
          sessionId: "session-2",
          agentType,
          cwd,
          platform,
          platformUserId,
          providerSessionId: "codex-session"
        });
      },
      createRun(params: {
        sessionId: string | null;
        agentType: Session["agentType"];
        inputText: string;
      }) {
        const createdRun = createRun({
          sessionId: params.sessionId,
          agentType: params.agentType,
          inputText: params.inputText
        });
        createdRunSessionId = createdRun.sessionId;
        return createdRun;
      },
      updateSession(session: Session) {
        return session;
      },
      updateRun(run: Run) {
        return run;
      }
    } as any,
    {
      async run() {
        return {
          exitCode: 0,
          status: "finished",
          output: "done",
          parsedOutput: "done",
          providerSessionId: "codex-session",
          errorReason: null
        };
      }
    } as any
  );

  const result = await service.sendToPersistentSession({
    agentType: "codex",
    cwd: "E:/AgentBridge",
    message: "hello",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123"
  });

  assert.equal(lookedUpByScope, true);
  assert.equal(createdRunSessionId, "session-2");
  assert.equal(result.session?.agentType, "codex");
});

test("handleIncomingMessage prefers a thread-bound Lark session over the user-scoped session", async () => {
  const service = new AgentBridgeService(
    createConfig(),
    {
      getPersistentSessionByScope() {
        return createSession({
          sessionId: "scope-session",
          agentType: "codex",
          cwd: "E:/AgentBridge",
          platform: "lark",
          platformChannelId: "oc_123",
          platformThreadId: null,
          platformUserId: "ou_123"
        });
      }
    } as any,
    {} as any
  ) as AgentBridgeService & {
    getPersistentSessionByThread: (typeof AgentBridgeService.prototype)["getPersistentSessionByThread"];
    sendToPersistentSession: (typeof AgentBridgeService.prototype)["sendToPersistentSession"];
  };

  let usedAgentType: string | null = null;
  let usedCwd: string | null = null;

  service.getPersistentSessionByThread = (() =>
    createSession({
      sessionId: "thread-session",
      agentType: "claude",
      cwd: "/Users/test/thread-repo",
      platform: "lark",
      platformChannelId: "oc_123",
      platformThreadId: "om_root",
      platformUserId: "ou_123"
    })) as typeof service.getPersistentSessionByThread;
  service.sendToPersistentSession = (async (params) => {
    usedAgentType = params.agentType;
    usedCwd = params.cwd;
    return {
      run: createRun({
        inputText: params.message,
        agentType: params.agentType,
        platform: "lark",
        platformThreadId: params.platformThreadId ?? null
      }),
      session: createSession({
        sessionId: "thread-session",
        agentType: params.agentType,
        cwd: params.cwd,
        platform: "lark",
        platformChannelId: params.platformChannelId,
        platformThreadId: params.platformThreadId ?? null,
        platformUserId: params.platformUserId ?? ""
      })
    };
  }) as typeof service.sendToPersistentSession;

  const result = await service.handleIncomingMessage({
    platform: "lark",
    platformUserId: "ou_123",
    platformChannelId: "oc_123",
    platformThreadId: "om_root",
    messageId: "om_child",
    rawText: "use codex inspect this issue"
  });

  assert.equal(result.kind, "execution");
  assert.equal(usedAgentType, "claude");
  assert.equal(usedCwd, "/Users/test/thread-repo");
});

test("runOnce marks the run as failed when process startup throws", async () => {
  const updates: Run[] = [];
  const run = createRun({ sessionId: null, status: "queued" });

  const service = new AgentBridgeService(
    createConfig(),
    {
      createRun() {
        return run;
      },
      updateRun(nextRun: Run) {
        updates.push(nextRun);
        return nextRun;
      }
    } as any,
    {
      async run() {
        throw new Error("spawn ENOENT");
      }
    } as any
  );

  await assert.rejects(
    service.runOnce({
      agentType: "codex",
      cwd: "E:/AgentBridge",
      message: "hello",
      platform: "slack",
      platformChannelId: "D123",
      platformUserId: "U123"
    }),
    /spawn ENOENT/
  );

  assert.equal(updates.length, 2);
  assert.equal(updates[0]?.status, "starting");
  assert.equal(updates[1]?.status, "failed");
  assert.equal(updates[1]?.errorReason, "spawn ENOENT");
  assert.equal(updates[1]?.endedAt === null, false);
});

test("sendToPersistentSession marks the run failed and session errored when process startup throws", async () => {
  const runUpdates: Run[] = [];
  const sessionUpdates: Session[] = [];
  const session = createSession({ providerSessionId: "resume-123" });

  const service = new AgentBridgeService(
    createConfig(),
    {
      getPersistentSessionByThread() {
        return session;
      },
      createRun(params: {
        sessionId: string | null;
        agentType: Session["agentType"];
        inputText: string;
      }) {
        return createRun({
          sessionId: params.sessionId,
          agentType: params.agentType,
          inputText: params.inputText
        });
      },
      updateRun(run: Run) {
        runUpdates.push(run);
        return run;
      },
      updateSession(nextSession: Session) {
        sessionUpdates.push(nextSession);
        return nextSession;
      }
    } as any,
    {
      async run() {
        throw new Error("cwd not found");
      }
    } as any
  );

  await assert.rejects(
    service.sendToPersistentSession({
      agentType: "codex",
      cwd: "E:/AgentBridge",
      message: "hello",
      platform: "slack",
      platformChannelId: "D123",
      platformThreadId: "thread-1",
      platformUserId: "U123"
    }),
    /cwd not found/
  );

  assert.equal(runUpdates.length, 2);
  assert.equal(runUpdates[0]?.status, "starting");
  assert.equal(runUpdates[1]?.status, "failed");
  assert.equal(runUpdates[1]?.errorReason, "cwd not found");
  assert.equal(sessionUpdates.length, 2);
  assert.equal(sessionUpdates[0]?.status, "running");
  assert.equal(sessionUpdates[1]?.status, "error");
  assert.equal(sessionUpdates[1]?.lastRunId, runUpdates[1]?.runId);
});
