import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { WorkspaceStore } from "../store/workspace-store.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { SessionService } from "./session-service.js";
import { AgentBridgeService } from "./agent-bridge-service.js";
import type { AppConfig } from "../app/config.js";
import type { ExecutionContext, Workspace } from "../domain/models.js";

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: "workspace-1",
    rootPath: "E:/multi-ideas",
    kind: "plain_dir",
    source: "manual",
    capabilities: {
      gitCapable: false,
      worktreeCapable: false
    },
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    lastUsedAt: null,
    ...overrides
  };
}

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    contextId: "context-1",
    workspaceId: "workspace-1",
    kind: "main",
    path: "E:/multi-ideas",
    managed: false,
    status: "active",
    branch: null,
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    ...overrides
  };
}

function createConfig(): AppConfig {
  return {
    database: {
      path: "E:/AgentBridge/agentbridge.db"
    },
    runtime: {
      enabledPlatforms: ["slack"],
      workspace: {
        allowedWorkspaceParents: [],
        manualWorkspaces: ["E:/multi-ideas"]
      },
      allowedCwds: [],
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

test("createOrResetPersistentSession binds the session to a workspace and current execution context", () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);
  workspaceStore.create(createWorkspace());
  contextStore.create(createContext());

  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    contextStore
  );
  const service = new AgentBridgeService(createConfig(), sessionService, {} as never);

  const session = service.createOrResetPersistentSession(
    "codex",
    "E:/multi-ideas",
    "slack",
    "U123",
    "D123",
    "thread-1"
  );

  assert.equal(session.workspaceId, "workspace-1");
  assert.equal(session.currentContextId, "context-1");
  assert.equal(session.cwd, "E:/multi-ideas");
});

test("sendToPersistentSession executes against the session current context path", async () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);
  workspaceStore.create(createWorkspace({
    workspaceId: "workspace-2",
    rootPath: "E:/repos/project-a",
    kind: "git_repo",
    capabilities: {
      gitCapable: true,
      worktreeCapable: true
    }
  }));
  contextStore.create(createContext({
    contextId: "context-2",
    workspaceId: "workspace-2",
    path: "E:/AgentBridge-worktrees/project-a/review-auth",
    branch: "review-auth"
  }));

  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    contextStore
  );
  sessionService.createPersistentSession(
    "codex",
    "E:/repos/project-a",
    "slack",
    "U123",
    "D123",
    "thread-1",
    "workspace-2",
    "context-2"
  );

  let usedCwd: string | null = null;
  const service = new AgentBridgeService(createConfig(), sessionService, {
    async run(_runId: string, profile: { cwd: string }) {
      usedCwd = profile.cwd;
      return {
        exitCode: 0,
        status: "finished" as const,
        output: "done",
        parsedOutput: "done",
        providerSessionId: "provider-1",
        errorReason: null
      };
    }
  } as never);

  await service.sendToPersistentSession({
    agentType: "codex",
    cwd: "E:/repos/project-a",
    message: "inspect the branch",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123"
  });

  assert.equal(usedCwd, "E:/AgentBridge-worktrees/project-a/review-auth");
});

test("runOnce accepts a plain workspace even when allowedCwds is empty", async () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);
  workspaceStore.create(createWorkspace());
  contextStore.create(createContext());

  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    contextStore
  );

  let usedCwd: string | null = null;
  const service = new AgentBridgeService(createConfig(), sessionService, {
    async run(_runId: string, profile: { cwd: string }) {
      usedCwd = profile.cwd;
      return {
        exitCode: 0,
        status: "finished" as const,
        output: "done",
        parsedOutput: "done",
        providerSessionId: null,
        errorReason: null
      };
    }
  } as never);

  const result = await service.runOnce({
    agentType: "codex",
    cwd: "E:/multi-ideas",
    message: "organize my notes",
    platform: "slack",
    platformChannelId: "D123",
    platformUserId: "U123"
  });

  assert.equal(result.session, null);
  assert.equal(usedCwd, "E:/multi-ideas");
});

test("handleIncomingMessage falls back to the first registered workspace when no persistent session exists", async () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);
  workspaceStore.create(createWorkspace());
  contextStore.create(createContext());

  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    contextStore
  );

  let usedCwd: string | null = null;
  const service = new AgentBridgeService(createConfig(), sessionService, {
    async run(_runId: string, profile: { cwd: string }) {
      usedCwd = profile.cwd;
      return {
        exitCode: 0,
        status: "finished" as const,
        output: "done",
        parsedOutput: "done",
        providerSessionId: null,
        errorReason: null
      };
    }
  } as never);

  const result = await service.handleIncomingMessage({
    platform: "slack",
    platformUserId: "U123",
    platformChannelId: "D123",
    platformThreadId: null,
    messageId: "m-1",
    rawText: "summarize these ideas"
  });

  assert.equal(result.kind, "execution");
  assert.equal(usedCwd, "E:/multi-ideas");
});

test("sendToPersistentSession records a failed run and resets the session when process launch fails", async () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);
  workspaceStore.create(createWorkspace());
  contextStore.create(createContext());

  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    contextStore
  );
  const persistentSession = sessionService.createPersistentSession(
    "codex",
    "E:/multi-ideas",
    "slack",
    "U123",
    "D123",
    "thread-1",
    "workspace-1",
    "context-1"
  );
  const service = new AgentBridgeService(createConfig(), sessionService, {
    async run() {
      throw new Error("spawn ENOENT");
    }
  } as never);

  await assert.rejects(
    () => service.sendToPersistentSession({
      agentType: "codex",
      cwd: "E:/multi-ideas",
      message: "inspect the branch",
      platform: "slack",
      platformChannelId: "D123",
      platformThreadId: "thread-1",
      platformUserId: "U123"
    }),
    /spawn ENOENT/
  );

  const storedSession = sessionService.getSessionById(persistentSession.sessionId);
  const storedRun = storedSession?.lastRunId
    ? sessionService.getRunById(storedSession.lastRunId)
    : null;

  assert.equal(storedSession?.status, "error");
  assert.equal(storedRun?.status, "failed");
  assert.match(storedRun?.errorReason ?? "", /spawn ENOENT/);
  assert.notEqual(storedRun?.endedAt, null);
});
