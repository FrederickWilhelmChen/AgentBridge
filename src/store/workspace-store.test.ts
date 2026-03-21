import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDatabase } from "./db.js";
import { WorkspaceStore } from "./workspace-store.js";
import type { Workspace } from "../domain/models.js";

function createWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: "workspace-1",
    rootPath: "E:/repos/project-a",
    kind: "git_repo",
    source: "manual",
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

test("persists workspace records with capability flags and timestamps", () => {
  const database = createDatabase(":memory:");
  const store = new WorkspaceStore(database);
  const workspace = createWorkspace();

  assert.deepEqual(store.create(workspace), workspace);
  assert.deepEqual(store.findById("workspace-1"), workspace);
  assert.deepEqual(store.list(), [workspace]);
});

test("update preserves the original createdAt while changing mutable fields", () => {
  const database = createDatabase(":memory:");
  const store = new WorkspaceStore(database);
  const original = createWorkspace();
  store.create(original);

  store.update({
    ...original,
    rootPath: "E:/repos/project-a-renamed",
    kind: "plain_dir",
    source: "manual",
    capabilities: {
      gitCapable: false,
      worktreeCapable: false
    },
    updatedAt: "2026-03-21T11:00:00.000Z",
    lastUsedAt: null
  });

  assert.deepEqual(store.findById("workspace-1"), {
    ...original,
    rootPath: "E:/repos/project-a-renamed",
    kind: "plain_dir",
    source: "manual",
    capabilities: {
      gitCapable: false,
      worktreeCapable: false
    },
    createdAt: original.createdAt,
    updatedAt: "2026-03-21T11:00:00.000Z",
    lastUsedAt: null
  });
});

test("update fails loudly when createdAt drifts from the stored workspace", () => {
  const database = createDatabase(":memory:");
  const store = new WorkspaceStore(database);
  const original = createWorkspace();
  store.create(original);

  assert.throws(
    () =>
      store.update({
        ...original,
        createdAt: "2020-01-01T00:00:00.000Z"
      }),
    /createdAt/i
  );
});

test("update fails loudly when the workspace does not exist", () => {
  const database = createDatabase(":memory:");
  const store = new WorkspaceStore(database);

  assert.throws(
    () =>
      store.update({
        workspaceId: "missing-workspace",
        rootPath: "E:/repos/missing",
        kind: "plain_dir",
        source: "manual",
        capabilities: {
          gitCapable: false,
          worktreeCapable: false
        },
        createdAt: "2026-03-21T10:00:00.000Z",
        updatedAt: "2026-03-21T11:00:00.000Z",
        lastUsedAt: null
      }),
    /does not exist/i
  );
});

test("createDatabase persists file-backed workspace writes across close and reopen", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-workspace-commit-${Date.now()}.db`);
  const database = createDatabase(dbPath);
  const store = new WorkspaceStore(database);

  store.create(
    createWorkspace({
      workspaceId: "workspace-commit",
      rootPath: "E:/repos/commit-check",
      createdAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T12:00:00.000Z",
      lastUsedAt: null
    })
  );

  database.close();

  const reopened = createDatabase(dbPath);
  const reopenedStore = new WorkspaceStore(reopened);

  assert.equal(reopenedStore.findById("workspace-commit")?.rootPath, "E:/repos/commit-check");

  reopened.close();
  fs.unlinkSync(dbPath);
});
