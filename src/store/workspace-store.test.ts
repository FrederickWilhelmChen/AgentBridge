import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createDatabase } from "./db.js";
import { SessionStore } from "./session-store.js";
import { WorkspaceStore } from "./workspace-store.js";
import { ExecutionContextStore } from "./execution-context-store.js";
import type { ExecutionContext, Workspace } from "../domain/models.js";

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: "workspace-1",
    rootPath: "E:/repos/project-a",
    kind: "git_repo",
    source: "scanned_git",
    capabilities: {
      gitCapable: true,
      worktreeCapable: true
    },
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:05:00.000Z",
    lastUsedAt: "2026-03-21T10:10:00.000Z",
    ...overrides
  };
}

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    contextId: "context-1",
    workspaceId: "workspace-1",
    kind: "git_worktree",
    path: "E:/AgentBridge-worktrees/project-a/task-1",
    managed: true,
    status: "active",
    branch: "feature/task-1",
    createdAt: "2026-03-21T10:10:00.000Z",
    updatedAt: "2026-03-21T10:15:00.000Z",
    ...overrides
  };
}

test("persists workspace records with capability flags and timestamps", () => {
  const database = createDatabase(":memory:");
  const store = new WorkspaceStore(database);
  const workspace = createWorkspace();

  assert.deepEqual(store.create(workspace), workspace);
  assert.deepEqual(store.findById("workspace-1"), workspace);
  assert.deepEqual(store.list(), [workspace]);
});

test("persists execution-context records with workspace binding and optional branch", () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);

  workspaceStore.create(createWorkspace());
  const context = createExecutionContext();

  assert.deepEqual(contextStore.create(context), context);
  assert.deepEqual(contextStore.findById("context-1"), context);
  assert.deepEqual(contextStore.listByWorkspaceId("workspace-1"), [context]);
});

test("creates the new tables during migration without breaking session storage", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-workspace-${Date.now()}.db`);
  const database = new Database(dbPath);

  database.exec(`
    CREATE TABLE sessions (
      session_id TEXT PRIMARY KEY,
      agent_type TEXT NOT NULL,
      cwd TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_session_id TEXT,
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      last_run_id TEXT
    );

    INSERT INTO sessions (
      session_id, agent_type, cwd, mode, status, provider_session_id, created_at, last_active_at, last_run_id
    ) VALUES (
      'session-1', 'codex', 'E:/AgentBridge', 'persistent', 'idle', NULL,
      '2026-03-21T09:00:00.000Z', '2026-03-21T09:00:00.000Z', NULL
    );
  `);

  database.close();

  const migrated = createDatabase(dbPath);
  const sessionStore = new SessionStore(migrated);
  const workspaceStore = new WorkspaceStore(migrated);
  const contextStore = new ExecutionContextStore(migrated);

  assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("workspaces"));
  assert.ok(
    migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("execution_contexts")
  );
  assert.equal(sessionStore.findById("session-1")?.cwd, "E:/AgentBridge");

  const workspace = workspaceStore.create(createWorkspace({
    workspaceId: "workspace-2",
    rootPath: "E:/repos/project-b",
    source: "manual",
    capabilities: {
      gitCapable: false,
      worktreeCapable: false
    },
    createdAt: "2026-03-21T11:00:00.000Z",
    updatedAt: "2026-03-21T11:00:00.000Z",
    lastUsedAt: null
  }));
  const context = contextStore.create(createExecutionContext({
    contextId: "context-2",
    workspaceId: workspace.workspaceId,
    kind: "main",
    path: "E:/repos/project-b",
    managed: false,
    status: "active",
    branch: null,
    createdAt: "2026-03-21T11:05:00.000Z",
    updatedAt: "2026-03-21T11:05:00.000Z"
  }));

  assert.equal(workspaceStore.findById(workspace.workspaceId)?.rootPath, "E:/repos/project-b");
  assert.equal(contextStore.findById(context.contextId)?.workspaceId, workspace.workspaceId);

  migrated.close();
  fs.unlinkSync(dbPath);
});
