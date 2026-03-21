import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createDatabase } from "./db.js";
import { SessionStore } from "./session-store.js";
import { WorkspaceStore } from "./workspace-store.js";

function withTempDb(run: (dbPath: string) => void) {
  const dbPath = path.join(os.tmpdir(), `agentbridge-schema-${Date.now()}-${Math.random()}.db`);
  try {
    run(dbPath);
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  }
}

test("fails execution-context migration when legacy rows cannot be mapped safely", () => {
  withTempDb((dbPath) => {
    const database = new Database(dbPath);

    database.exec(`
      CREATE TABLE execution_contexts (
        context_id TEXT PRIMARY KEY
      );

      INSERT INTO execution_contexts (context_id) VALUES ('legacy-context-1');
    `);

    database.close();

    assert.throws(
      () => createDatabase(dbPath),
      /required columns are missing: workspace_id, kind, path, managed, status, created_at, updated_at/i
    );

    const reopened = new Database(dbPath);
    const columns = reopened.prepare("PRAGMA table_info(execution_contexts)").all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name), ["context_id"]);
    assert.equal((reopened.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get() as { count: number }).count, 1);
    reopened.close();
  });
});

test("fails execution-context migration when populated legacy rows are missing semantic columns", () => {
  withTempDb((dbPath) => {
    const database = new Database(dbPath);

    database.exec(`
      CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY
      );

      CREATE TABLE execution_contexts (
        context_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        managed INTEGER NOT NULL,
        status TEXT NOT NULL
      );

      INSERT INTO workspaces (workspace_id) VALUES ('workspace-1');
      INSERT INTO execution_contexts (
        context_id, workspace_id, kind, managed, status
      ) VALUES (
        'context-1', 'workspace-1', 'main', 0, 'active'
      );
    `);

    database.close();

    assert.throws(
      () => createDatabase(dbPath),
      /required columns are missing: path, created_at, updated_at/i
    );

    const reopened = new Database(dbPath);
    const columns = reopened.prepare("PRAGMA table_info(execution_contexts)").all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name), [
      "context_id",
      "workspace_id",
      "kind",
      "managed",
      "status"
    ]);
    assert.equal((reopened.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get() as { count: number }).count, 1);
    reopened.close();
  });
});

test("fails execution-context migration on orphaned legacy rows without deleting them", () => {
  withTempDb((dbPath) => {
    const database = new Database(dbPath);

    database.exec(`
      CREATE TABLE workspaces (
        workspace_id TEXT PRIMARY KEY
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

      INSERT INTO execution_contexts (
        context_id, workspace_id, kind, path, managed, status, branch, created_at, updated_at
      ) VALUES (
        'context-1', 'missing-workspace', 'main', 'E:/repos/project-a', 0, 'active', NULL,
        '2026-03-21T09:40:00.000Z', '2026-03-21T09:45:00.000Z'
      );
    `);

    database.close();

    assert.throws(
      () => createDatabase(dbPath),
      /orphaned execution_context row/i
    );

    const reopened = new Database(dbPath);
    const columns = reopened.prepare("PRAGMA table_info(execution_contexts)").all() as Array<{ name: string }>;
    assert.deepEqual(columns.map((column) => column.name), [
      "context_id",
      "workspace_id",
      "kind",
      "path",
      "managed",
      "status",
      "branch",
      "created_at",
      "updated_at"
    ]);
    assert.equal((reopened.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get() as { count: number }).count, 1);
    reopened.close();
  });
});

test("migrates partially populated workspace schemas while leaving empty execution-context tables intact", () => {
  withTempDb((dbPath) => {
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
        context_id TEXT PRIMARY KEY
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
    `);

    database.close();

    const migrated = createDatabase(dbPath);
    const sessionStore = new SessionStore(migrated);
    const workspaceStore = new WorkspaceStore(migrated);

    const workspaceColumns = migrated.prepare("PRAGMA table_info(workspaces)").all() as Array<{ name: string }>;
    assert.ok(workspaceColumns.some((column) => column.name === "git_capable"));
    assert.ok(workspaceColumns.some((column) => column.name === "worktree_capable"));
    assert.ok(workspaceColumns.some((column) => column.name === "last_used_at"));

    const executionContextColumns = migrated
      .prepare("PRAGMA table_info(execution_contexts)")
      .all() as Array<{ name: string }>;
    assert.ok(executionContextColumns.some((column) => column.name === "workspace_id"));
    assert.equal((migrated.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get() as { count: number }).count, 0);
    assert.equal(sessionStore.findById("session-1")?.cwd, "E:/AgentBridge");
    assert.equal(workspaceStore.findById("workspace-1")?.rootPath, "E:/repos/project-a");

    migrated.close();
  });
});
