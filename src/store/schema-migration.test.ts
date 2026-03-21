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

test("migrates a legacy execution_contexts table that only has context_id", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-execution-context-${Date.now()}.db`);
  const database = new Database(dbPath);

  database.exec(`
    CREATE TABLE execution_contexts (
      context_id TEXT PRIMARY KEY
    );

    INSERT INTO execution_contexts (context_id) VALUES ('legacy-context-1');
  `);

  database.close();

  const migrated = createDatabase(dbPath);
  const contextStore = new ExecutionContextStore(migrated);

  assert.ok(migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get("execution_contexts"));
  assert.equal(contextStore.findById("legacy-context-1"), null);

  migrated.close();
  fs.unlinkSync(dbPath);
});

test("migrates partially populated workspace and execution_context schemas without breaking sessions", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-schema-${Date.now()}.db`);
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

    CREATE TABLE workspaces (
      workspace_id TEXT PRIMARY KEY,
      root_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE execution_contexts (
      context_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      managed INTEGER NOT NULL,
      status TEXT NOT NULL,
      branch TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    INSERT INTO sessions (
      session_id, agent_type, cwd, mode, status, provider_session_id, created_at, last_active_at, last_run_id
    ) VALUES (
      'session-1', 'codex', 'E:/AgentBridge', 'persistent', 'idle', NULL,
      '2026-03-21T09:00:00.000Z', '2026-03-21T09:00:00.000Z', NULL
    );

    INSERT INTO workspaces (
      workspace_id, root_path, kind, source, created_at, updated_at
    ) VALUES (
      'workspace-1', 'E:/repos/project-a', 'git_repo', 'manual',
      '2026-03-21T09:30:00.000Z', '2026-03-21T09:35:00.000Z'
    );

    INSERT INTO execution_contexts (
      context_id, workspace_id, kind, path, managed, status, branch, created_at, updated_at
    ) VALUES (
      'context-1', 'workspace-1', 'main', 'E:/repos/project-a', 0, 'active', NULL,
      '2026-03-21T09:40:00.000Z', '2026-03-21T09:45:00.000Z'
    );
  `);

  database.close();

  const migrated = createDatabase(dbPath);
  const sessionStore = new SessionStore(migrated);
  const workspaceStore = new WorkspaceStore(migrated);
  const contextStore = new ExecutionContextStore(migrated);

  const workspaceColumns = migrated.prepare("PRAGMA table_info(workspaces)").all() as Array<{ name: string }>;
  assert.ok(workspaceColumns.some((column) => column.name === "git_capable"));
  assert.ok(workspaceColumns.some((column) => column.name === "worktree_capable"));
  assert.ok(workspaceColumns.some((column) => column.name === "last_used_at"));

  const foreignKeys = migrated.prepare("PRAGMA foreign_key_list(execution_contexts)").all() as Array<{
    table: string;
    from: string;
    to: string;
  }>;
  assert.ok(
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "workspaces" &&
        foreignKey.from === "workspace_id" &&
        foreignKey.to === "workspace_id"
    )
  );

  assert.equal(sessionStore.findById("session-1")?.cwd, "E:/AgentBridge");
  assert.equal(workspaceStore.findById("workspace-1")?.rootPath, "E:/repos/project-a");
  assert.equal(workspaceStore.findById("workspace-1")?.capabilities.gitCapable, false);
  assert.equal(contextStore.findById("context-1")?.workspaceId, "workspace-1");

  assert.throws(
    () =>
      migrated
        .prepare(
          "INSERT INTO execution_contexts (context_id, workspace_id, kind, path, managed, status, branch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          "context-2",
          "missing-workspace",
          "main",
          "E:/repos/project-b",
          0,
          "active",
          null,
          "2026-03-21T10:00:00.000Z",
          "2026-03-21T10:00:00.000Z"
        ),
    /FOREIGN KEY constraint failed/i
  );

  migrated.close();
  fs.unlinkSync(dbPath);
});
