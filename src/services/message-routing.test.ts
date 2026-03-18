import test from "node:test";
import assert from "node:assert/strict";
import { AgentBridgeService } from "./agent-bridge-service.js";
import type { Run, Session } from "../domain/models.js";

function createService() {
  const service = new AgentBridgeService(
    {
      slack: {
        botToken: "x",
        appToken: "x",
        signingSecret: "x",
        allowedUserId: "U123"
      },
      database: { path: "E:/AgentBridge/agentbridge.db" },
      runtime: {
        enabledPlatforms: ["slack"],
        allowedCwds: ["E:/AgentBridge"],
        defaultAgent: "codex",
        defaultTimeoutMs: 1000,
        httpProxy: null,
        httpsProxy: null,
        agents: {
          claude: { command: "claude", args: [], resumeArgs: [], outputMode: "text" },
          codex: { command: "codex", args: [], resumeArgs: [], outputMode: "text" }
        }
      }
    },
    {} as never,
    {} as never
  );

  return service as AgentBridgeService & {
    runOnce: (typeof service)["runOnce"];
    sendToPersistentSession: (typeof service)["sendToPersistentSession"];
    getSessionStatus: (typeof service)["getSessionStatus"];
    createOrResetPersistentSession: (typeof service)["createOrResetPersistentSession"];
    interruptRun: (typeof service)["interruptRun"];
  };
}

function createRun(overrides: Partial<Run> = {}): Run {
  return {
    runId: "run-1",
    sessionId: null,
    agentType: "codex",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: null,
    platformUserId: "U123",
    inputText: "hello",
    status: "finished",
    pid: null,
    startedAt: "2026-03-19T10:00:00.000Z",
    endedAt: "2026-03-19T10:01:00.000Z",
    exitCode: 0,
    outputTail: "done",
    errorReason: null,
    ...overrides
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
    platformUserId: "U123",
    createdAt: "2026-03-19T10:00:00.000Z",
    lastActiveAt: "2026-03-19T10:00:00.000Z",
    lastRunId: null,
    ...overrides
  };
}

test("routes control intents to status lookups", async () => {
  const service = createService();
  let calledWith: unknown[] | null = null;

  service.getSessionStatus = ((agentType, platform, platformUserId) => {
    calledWith = [agentType, platform, platformUserId];
    return { session: null, run: null };
  }) as typeof service.getSessionStatus;

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m1",
    rawText: "status"
  });

  assert.deepEqual(calledWith, ["codex", "slack", "U123"]);
  assert.equal(result.kind, "status");
});

test("uses active persistent session when available for ai prompts", async () => {
  const service = createService();

  service.getSessionStatus = (() => ({ session: createSession(), run: null })) as typeof service.getSessionStatus;
  service.sendToPersistentSession = (async (params) => ({
    run: createRun({ inputText: params.message }),
    session: createSession()
  })) as typeof service.sendToPersistentSession;

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    messageId: "m2",
    rawText: "help me inspect this build failure"
  });

  assert.equal(result.kind, "execution");
  assert.equal(result.title, "Persistent Session Result");
  assert.equal(result.run.inputText, "help me inspect this build failure");
});

test("falls back to run once when no persistent session exists", async () => {
  const service = createService();

  service.getSessionStatus = (() => ({ session: null, run: null })) as typeof service.getSessionStatus;
  service.runOnce = (async (params) => ({
    run: createRun({ inputText: params.message }),
    session: null
  })) as typeof service.runOnce;

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m3",
    rawText: "help me inspect this build failure"
  });

  assert.equal(result.kind, "execution");
  assert.equal(result.title, "Run Once Result");
  assert.equal(result.session, null);
});

test("creates a persistent session for new session control intents", async () => {
  const service = createService();

  service.getSessionStatus = (() => ({ session: null, run: null })) as typeof service.getSessionStatus;
  service.createOrResetPersistentSession = ((agentType, cwd) =>
    createSession({ agentType, cwd })) as typeof service.createOrResetPersistentSession;

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m4",
    rawText: "new codex session"
  });

  assert.equal(result.kind, "info");
  assert.match(result.text, /Persistent session ready/);
});

test("interrupts the latest active run for interrupt control intents", async () => {
  const service = createService();
  let interruptedRunId: string | null = null;

  service.getSessionStatus = (() => ({
    session: createSession({ lastRunId: "run-active", status: "running" }),
    run: createRun({ runId: "run-active", status: "running" })
  })) as typeof service.getSessionStatus;
  service.interruptRun = ((runId) => {
    interruptedRunId = runId;
    return true;
  }) as typeof service.interruptRun;

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m5",
    rawText: "stop"
  });

  assert.equal(interruptedRunId, "run-active");
  assert.equal(result.kind, "info");
  assert.match(result.text, /Interrupt requested/);
});

test("uses preferred agent type from ai prompts when provided", async () => {
  const service = createService();
  let usedAgentType: string | null = null;

  service.getSessionStatus = (() => ({ session: null, run: null })) as typeof service.getSessionStatus;
  service.runOnce = (async (params) => {
    usedAgentType = params.agentType;
    return {
      run: createRun({ inputText: params.message, agentType: params.agentType }),
      session: null
    };
  }) as typeof service.runOnce;

  await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m6",
    rawText: "use claude help me inspect this build failure"
  });

  assert.equal(usedAgentType, "claude");
});
