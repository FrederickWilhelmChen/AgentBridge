import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as childProcess from "node:child_process";
import { createDatabase } from "../store/db.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { WorkspaceStore } from "../store/workspace-store.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "./session-service.js";
import { resolveGitCommonDir, WorkspaceDiscoveryService } from "./workspace-discovery-service.js";

function runGit(args: string[], cwd: string) {
  childProcess.execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    encoding: "utf8"
  });
}

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

test("deduplicates multiple git work directories from the same repository into one top-level workspace", () => {
  const parentDir = createTempDir("agentbridge-discovery-parent-");
  const repoRoot = path.join(parentDir, "project-a");
  const worktreeRoot = path.join(parentDir, "project-a-review");

  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(["init", "--initial-branch=main"], repoRoot);
  runGit(["config", "user.name", "AgentBridge"], repoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], repoRoot);
  writeFile(path.join(repoRoot, "README.md"), "# project-a\n");
  runGit(["add", "README.md"], repoRoot);
  runGit(["commit", "-m", "initial"], repoRoot);
  runGit(["worktree", "add", worktreeRoot, "-b", "review-auth"], repoRoot);

  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore
  );
  const discovery = new WorkspaceDiscoveryService(sessionService);

  const result = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: []
  });

  assert.equal(result.workspaces.length, 1);
  assert.equal(result.workspaces[0]?.rootPath, repoRoot);
  assert.equal(result.workspaces[0]?.kind, "git_repo");
  assert.equal(result.workspaces[0]?.capabilities.gitCapable, true);
  assert.equal(result.workspaces[0]?.capabilities.worktreeCapable, true);
  assert.deepEqual(
    result.workspaces.map((workspace) => workspace.rootPath),
    [repoRoot]
  );
});

test("registers manual and marker-file plain workspaces as plain_dir without duplicating repeated refreshes", () => {
  const parentDir = createTempDir("agentbridge-plain-parent-");
  const markerWorkspace = path.join(parentDir, "brain-dump");
  const manualWorkspace = path.join(parentDir, "manual-notes");

  writeFile(
    path.join(markerWorkspace, ".agentbridge", "workspace.json"),
    JSON.stringify({ name: "brain-dump" }, null, 2)
  );
  fs.mkdirSync(manualWorkspace, { recursive: true });

  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore
  );
  const discovery = new WorkspaceDiscoveryService(sessionService);

  discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: [manualWorkspace]
  });

  const second = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: [manualWorkspace]
  });

  assert.deepEqual(
    second.workspaces.map((workspace) => ({
      rootPath: workspace.rootPath,
      kind: workspace.kind,
      source: workspace.source
    })),
    [
      {
        rootPath: markerWorkspace,
        kind: "plain_dir",
        source: "marker_file"
      },
      {
        rootPath: manualWorkspace,
        kind: "plain_dir",
        source: "manual"
      }
    ]
  );
});

test("scans only the workspace parent and its direct children", () => {
  const parentDir = createTempDir("agentbridge-scan-depth-parent-");
  const directRepoRoot = path.join(parentDir, "project-a");
  const nestedRepoRoot = path.join(parentDir, "runtime", "wt-test-sample");

  fs.mkdirSync(directRepoRoot, { recursive: true });
  runGit(["init", "--initial-branch=main"], directRepoRoot);
  runGit(["config", "user.name", "AgentBridge"], directRepoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], directRepoRoot);
  writeFile(path.join(directRepoRoot, "README.md"), "# project-a\n");
  runGit(["add", "README.md"], directRepoRoot);
  runGit(["commit", "-m", "initial"], directRepoRoot);

  fs.mkdirSync(nestedRepoRoot, { recursive: true });
  runGit(["init", "--initial-branch=main"], nestedRepoRoot);
  runGit(["config", "user.name", "AgentBridge"], nestedRepoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], nestedRepoRoot);
  writeFile(path.join(nestedRepoRoot, "README.md"), "# wt-test-sample\n");
  runGit(["add", "README.md"], nestedRepoRoot);
  runGit(["commit", "-m", "initial"], nestedRepoRoot);

  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore
  );
  const discovery = new WorkspaceDiscoveryService(sessionService);

  const result = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: []
  });

  assert.deepEqual(
    result.workspaces.map((workspace) => workspace.rootPath),
    [directRepoRoot]
  );
});

test("removes workspaces and execution contexts that are no longer discovered", () => {
  const parentDir = createTempDir("agentbridge-discovery-delete-parent-");
  const repoRoot = path.join(parentDir, "project-a");

  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(["init", "--initial-branch=main"], repoRoot);
  runGit(["config", "user.name", "AgentBridge"], repoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], repoRoot);
  writeFile(path.join(repoRoot, "README.md"), "# project-a\n");
  runGit(["add", "README.md"], repoRoot);
  runGit(["commit", "-m", "initial"], repoRoot);

  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const executionContextStore = new ExecutionContextStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore,
    executionContextStore
  );
  const discovery = new WorkspaceDiscoveryService(sessionService);

  const first = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: []
  });

  const workspace = first.workspaces[0];
  if (!workspace) {
    throw new Error("Expected discovered workspace");
  }

  executionContextStore.create({
    contextId: "context-1",
    workspaceId: workspace.workspaceId,
    kind: "main",
    path: workspace.rootPath,
    managed: false,
    status: "active",
    branch: null,
    createdAt: "2026-03-23T00:00:00.000Z",
    updatedAt: "2026-03-23T00:00:00.000Z"
  });

  fs.rmSync(repoRoot, { recursive: true, force: true });

  const second = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: []
  });

  assert.deepEqual(second.workspaces, []);
  assert.deepEqual(workspaceStore.list(), []);
  assert.deepEqual(executionContextStore.listByWorkspaceId(workspace.workspaceId), []);
});

test("deduplicates sibling worktrees back to the main repository workspace", () => {
  const parentDir = createTempDir("agentbridge-sibling-worktree-parent-");
  const repoRoot = path.join(parentDir, "project-a");
  const siblingWorktreeRoot = path.join(parentDir, "project-a-review-auth");

  fs.mkdirSync(repoRoot, { recursive: true });
  runGit(["init", "--initial-branch=main"], repoRoot);
  runGit(["config", "user.name", "AgentBridge"], repoRoot);
  runGit(["config", "user.email", "agentbridge@example.com"], repoRoot);
  writeFile(path.join(repoRoot, "README.md"), "# project-a\n");
  runGit(["add", "README.md"], repoRoot);
  runGit(["commit", "-m", "initial"], repoRoot);
  runGit(["worktree", "add", siblingWorktreeRoot, "-b", "review-auth"], repoRoot);

  const database = createDatabase(":memory:");
  const workspaceStore = new WorkspaceStore(database);
  const sessionService = new SessionService(
    new SessionStore(database),
    new RunStore(database),
    workspaceStore
  );
  const discovery = new WorkspaceDiscoveryService(sessionService);

  const result = discovery.refresh({
    allowedWorkspaceParents: [parentDir],
    manualWorkspaces: []
  });

  assert.deepEqual(
    result.workspaces.map((workspace) => workspace.rootPath),
    [repoRoot]
  );
});

test("resolveGitCommonDir ignores legacy path-format noise and normalizes relative paths", () => {
  const repoRoot = path.resolve("E:/workspace-root/project-a");

  assert.equal(
    resolveGitCommonDir(repoRoot, "--path-format=absolute\n.git\n"),
    path.join(repoRoot, ".git")
  );

  assert.equal(
    resolveGitCommonDir(repoRoot, "--path-format=absolute\nC:/repos/project-a/.git\n"),
    path.resolve("C:/repos/project-a/.git")
  );
});
