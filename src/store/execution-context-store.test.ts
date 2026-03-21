import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "./db.js";
import { WorkspaceStore } from "./workspace-store.js";
import { ExecutionContextStore } from "./execution-context-store.js";
import type { ExecutionContext, Workspace } from "../domain/models.js";

function createWorkspace(workspaceId = "workspace-1"): Workspace {
  return {
    workspaceId,
    rootPath: `E:/repos/${workspaceId}`,
    kind: "git_repo",
    source: "manual",
    capabilities: {
      gitCapable: true,
      worktreeCapable: true
    },
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    lastUsedAt: null
  };
}

function createExecutionContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    contextId: "context-1",
    workspaceId: "workspace-1",
    kind: "main",
    path: "E:/repos/workspace-1",
    managed: false,
    status: "active",
    branch: null,
    createdAt: "2026-03-21T10:10:00.000Z",
    updatedAt: "2026-03-21T10:15:00.000Z",
    ...overrides
  };
}

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

test("rejects orphan execution contexts before insert", () => {
  const database = createDatabase(":memory:");
  const contextStore = new ExecutionContextStore(database);

  assert.throws(
    () => contextStore.create(createExecutionContext()),
    /workspace/i
  );
  assert.equal(contextStore.findById("context-1"), null);
});

test("update preserves the original workspace binding and createdAt", () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);

  workspaceStore.create(createWorkspace("workspace-1"));
  workspaceStore.create(createWorkspace("workspace-2"));
  const original = createExecutionContext();
  contextStore.create(original);

  contextStore.update({
    ...original,
    path: "E:/repos/workspace-1/task-2",
    managed: false,
    status: "active",
    branch: null,
    updatedAt: "2026-03-21T11:00:00.000Z"
  });

  assert.deepEqual(contextStore.findById("context-1"), {
    ...original,
    path: "E:/repos/workspace-1/task-2",
    managed: false,
    status: "active",
    branch: null,
    createdAt: original.createdAt,
    updatedAt: "2026-03-21T11:00:00.000Z"
  });
});

test("update fails loudly when immutable execution-context fields differ from the stored row", () => {
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);

  workspaceStore.create(createWorkspace("workspace-1"));
  workspaceStore.create(createWorkspace("workspace-2"));
  const original = createExecutionContext();
  contextStore.create(original);

  assert.throws(
    () =>
      contextStore.update({
        ...original,
        workspaceId: "workspace-2"
      }),
    /workspaceId/i
  );

  assert.throws(
    () =>
      contextStore.update({
        ...original,
        createdAt: "2020-01-01T00:00:00.000Z"
      }),
    /createdAt/i
  );
});

test("update fails loudly when the execution context does not exist", () => {
  const database = createDatabase(":memory:");
  const contextStore = new ExecutionContextStore(database);

  assert.throws(
    () =>
      contextStore.update({
        contextId: "missing-context",
        workspaceId: "workspace-1",
        kind: "main",
        path: "E:/repos/project-a",
        managed: false,
        status: "active",
        branch: null,
        createdAt: "2026-03-21T10:00:00.000Z",
        updatedAt: "2026-03-21T11:00:00.000Z"
      }),
    /does not exist/i
  );
});

test("createDatabase persists file-backed execution-context writes across close and reopen", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-context-commit-${Date.now()}.db`);
  const database = createDatabase(dbPath);
  const workspaceStore = new WorkspaceStore(database);
  const contextStore = new ExecutionContextStore(database);

  workspaceStore.create(createWorkspace("workspace-commit"));
  contextStore.create(
    createExecutionContext({
      contextId: "context-commit",
      workspaceId: "workspace-commit",
      path: "E:/repos/workspace-commit",
      createdAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T12:00:00.000Z"
    })
  );

  database.close();

  const reopened = createDatabase(dbPath);
  const reopenedContextStore = new ExecutionContextStore(reopened);

  assert.equal(reopenedContextStore.findById("context-commit")?.workspaceId, "workspace-commit");

  reopened.close();
  fs.unlinkSync(dbPath);
});
