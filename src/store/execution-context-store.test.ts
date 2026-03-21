import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "./db.js";
import { WorkspaceStore } from "./workspace-store.js";
import { ExecutionContextStore } from "./execution-context-store.js";
import type { ExecutionContext, Workspace } from "../domain/models.js";

function createWorkspace(workspaceId = "workspace-1"): Workspace {
  return {
    workspaceId,
    rootPath: `E:/repos/${workspaceId}`,
    kind: "git_repo",
    source: "scanned_git",
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
    workspaceId: "workspace-2",
    path: "E:/AgentBridge-worktrees/project-a/task-2",
    managed: false,
    status: "archived",
    branch: null,
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2026-03-21T11:00:00.000Z"
  });

  assert.deepEqual(contextStore.findById("context-1"), {
    ...original,
    path: "E:/AgentBridge-worktrees/project-a/task-2",
    managed: false,
    status: "archived",
    branch: null,
    createdAt: original.createdAt,
    updatedAt: "2026-03-21T11:00:00.000Z"
  });
});
