import test from "node:test";
import assert from "node:assert/strict";
import { AgentBridgeService } from "../services/agent-bridge-service.js";
import { LockAcquisitionTimeoutError, RuntimeLocks } from "./locks.js";
import type { AppConfig } from "../app/config.js";
import type { Run, Session } from "../domain/models.js";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "../services/session-service.js";

function createConfig(): AppConfig {
  return {
    database: {
      path: "E:/AgentBridge/agentbridge.db"
    },
    runtime: {
      enabledPlatforms: ["slack"],
      workspace: {
        allowedWorkspaceParents: [],
        manualWorkspaces: []
      },
      allowedCwds: ["E:/AgentBridge", "E:/multi-ideas"],
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
    workspaceId: null,
    currentContextId: null,
    mode: "persistent",
    status: "idle",
    providerSessionId: "provider-1",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    createdAt: "2026-03-21T10:00:00.000Z",
    lastActiveAt: "2026-03-21T10:00:00.000Z",
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
    startedAt: "2026-03-21T10:00:00.000Z",
    endedAt: null,
    exitCode: null,
    outputTail: "",
    rawOutput: "",
    errorReason: null,
    ...overrides
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

test("one session cannot perform two front-door transitions concurrently", async () => {
  const firstRunGate = deferred<void>();
  let startedRuns = 0;

  const service = new AgentBridgeService(
    createConfig(),
    {
      getPersistentSessionByThread() {
        return createSession();
      },
      getOrCreatePersistentSession() {
        return createSession();
      },
      createRun(params: { inputText: string }) {
        return createRun({ inputText: params.inputText, runId: `run-${Math.random()}` });
      },
      updateSession(session: Session) {
        return session;
      },
      updateRun(run: Run) {
        return run;
      }
    } as never,
    {
      async run() {
        startedRuns += 1;
        if (startedRuns === 1) {
          await firstRunGate.promise;
        }

        return {
          exitCode: 0,
          status: "finished" as const,
          output: "done",
          parsedOutput: "done",
          providerSessionId: "provider-1",
          errorReason: null
        };
      }
    } as never
  );

  const first = service.sendToPersistentSession({
    agentType: "codex",
    cwd: "E:/AgentBridge",
    message: "first",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123"
  });

  const second = service.sendToPersistentSession({
    agentType: "codex",
    cwd: "E:/AgentBridge",
    message: "second",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123"
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(startedRuns, 1);

  firstRunGate.resolve();
  await Promise.all([first, second]);
  assert.equal(startedRuns, 2);
});

test("one execution context cannot be reused by two active runs at the same time", async () => {
  const firstRunGate = deferred<void>();
  let startedRuns = 0;

  const service = new AgentBridgeService(
    createConfig(),
    {
      createRun(params: { inputText: string }) {
        return createRun({ sessionId: null, inputText: params.inputText, runId: `run-${Math.random()}` });
      },
      updateRun(run: Run) {
        return run;
      }
    } as never,
    {
      async run() {
        startedRuns += 1;
        if (startedRuns === 1) {
          await firstRunGate.promise;
        }

        return {
          exitCode: 0,
          status: "finished" as const,
          output: "done",
          parsedOutput: "done",
          providerSessionId: null,
          errorReason: null
        };
      }
    } as never
  );

  const first = service.runOnce({
    agentType: "codex",
    cwd: "E:/multi-ideas",
    message: "first",
    platform: "slack",
    platformChannelId: "D123",
    platformUserId: "U123"
  });

  const second = service.runOnce({
    agentType: "codex",
    cwd: "E:/multi-ideas",
    message: "second",
    platform: "slack",
    platformChannelId: "D123",
    platformUserId: "U123"
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(startedRuns, 1);

  firstRunGate.resolve();
  await Promise.all([first, second]);
  assert.equal(startedRuns, 2);
});

test("repo metadata operations serialize without blocking unrelated context execution", async () => {
  const locks = new RuntimeLocks();
  const events: string[] = [];
  const releaseMeta = deferred<void>();

  const metaOne = locks.withRepoMetadataLock("repo-1", async () => {
    events.push("meta-1-start");
    await releaseMeta.promise;
    events.push("meta-1-end");
  });

  const metaTwo = locks.withRepoMetadataLock("repo-1", async () => {
    events.push("meta-2-start");
    events.push("meta-2-end");
  });

  const contextRun = locks.withContextLock("context-2", async () => {
    events.push("context-start");
    events.push("context-end");
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(events, ["meta-1-start", "context-start", "context-end"]);

  releaseMeta.resolve();
  await Promise.all([metaOne, metaTwo, contextRun]);
  assert.deepEqual(events, [
    "meta-1-start",
    "context-start",
    "context-end",
    "meta-1-end",
    "meta-2-start",
    "meta-2-end"
  ]);
});

test("context locks time out instead of waiting forever", async () => {
  const locks = new RuntimeLocks();
  const release = deferred<void>();

  const first = locks.withContextLock("context-1", async () => {
    await release.promise;
  });

  await new Promise((resolve) => setTimeout(resolve, 20));

  await assert.rejects(
    locks.withContextLock("context-1", async () => {}, 30),
    (error: unknown) => error instanceof LockAcquisitionTimeoutError
  );

  release.resolve();
  await first;
});

test("execution context lock keys are separated by agent type", () => {
  const database = createDatabase(":memory:");
  const service = new SessionService(new SessionStore(database), new RunStore(database));

  assert.equal(
    service.buildExecutionContextLockKey("claude", null, "E:/AgentBridge"),
    "cwd:claude:E:/AgentBridge"
  );
  assert.equal(
    service.buildExecutionContextLockKey("codex", null, "E:/AgentBridge"),
    "cwd:codex:E:/AgentBridge"
  );
});
