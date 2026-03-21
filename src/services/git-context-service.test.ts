import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createDatabase } from "../store/db.js";
import { WorkspaceStore } from "../store/workspace-store.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "./session-service.js";
import { GitContextService } from "./git-context-service.js";
import type { Workspace } from "../domain/models.js";

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runGit(args: string[], cwd: string) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8"
  });
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function createWorkspace(rootPath: string): Workspace {
  return {
    workspaceId: "workspace-1",
    rootPath,
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

function createGitWorkspace() {
  const repoRoot = createTempDir("agentbridge-git-context-repo-");
  const externalWorktree = createTempDir("agentbridge-git-context-external-");

  runGit(["init", "--initial-branch=main"], repoRoot);
  runGit(["config", "user.name", "AgentBridge"], repoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], repoRoot);
  writeFile(path.join(repoRoot, "README.md"), "# project-a\n");
  runGit(["add", "README.md"], repoRoot);
  runGit(["commit", "-m", "initial"], repoRoot);
  runGit(["worktree", "add", externalWorktree, "-b", "external-review"], repoRoot);

  return {
    repoRoot,
    externalWorktree
  };
}

test("lists git workspace contexts as main plus linked worktrees and marks external worktrees unmanaged", () => {
  const { repoRoot, externalWorktree } = createGitWorkspace();
  const managedRoot = createTempDir("agentbridge-managed-worktrees-");
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const executionContextStore = new ExecutionContextStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    executionContextStore
  );
  const workspace = workspaceStore.create(createWorkspace(repoRoot));
  const service = new GitContextService(sessionService, executionContextStore, managedRoot);

  const contexts = service.listWorkspaceContexts(workspace);

  assert.deepEqual(
    contexts.map((context) => ({
      path: context.path,
      kind: context.kind,
      managed: context.managed
    })),
    [
      { path: repoRoot, kind: "main", managed: false },
      { path: externalWorktree, kind: "worktree", managed: false }
    ]
  );
});

test("creates managed worktrees under the configured root and marks them managed", () => {
  const { repoRoot } = createGitWorkspace();
  const managedRoot = createTempDir("agentbridge-managed-worktrees-");
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const executionContextStore = new ExecutionContextStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    executionContextStore
  );
  const workspace = workspaceStore.create(createWorkspace(repoRoot));
  const service = new GitContextService(sessionService, executionContextStore, managedRoot);

  const created = service.createManagedWorktree(workspace, "review-auth");

  assert.equal(created.kind, "worktree");
  assert.equal(created.managed, true);
  assert.match(created.path, new RegExp(`^${escapeRegExp(path.resolve(managedRoot))}`));
  assert.equal(fs.existsSync(created.path), true);
});

test("switching context only changes the session current execution context", () => {
  const { repoRoot } = createGitWorkspace();
  const managedRoot = createTempDir("agentbridge-managed-worktrees-");
  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const executionContextStore = new ExecutionContextStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    executionContextStore
  );
  const workspace = workspaceStore.create(createWorkspace(repoRoot));
  const service = new GitContextService(sessionService, executionContextStore, managedRoot);
  const mainContext = service.listWorkspaceContexts(workspace)[0];

  if (!mainContext) {
    throw new Error("Expected a main context");
  }

  const session = sessionService.createPersistentSession(
    "codex",
    mainContext.path,
    "slack",
    "U123",
    "D123",
    "thread-1",
    workspace.workspaceId,
    mainContext.contextId
  );
  const worktreeContext = service.createManagedWorktree(workspace, "fix-tests");

  const switched = sessionService.switchExecutionContext(session.sessionId, worktreeContext.contextId);

  assert.equal(switched.currentContextId, worktreeContext.contextId);
  assert.equal(switched.cwd, worktreeContext.path);
  assert.equal(switched.providerSessionId, session.providerSessionId);
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
