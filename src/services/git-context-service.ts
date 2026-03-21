import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ExecutionContext, Workspace } from "../domain/models.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { SessionService } from "./session-service.js";

type ParsedWorktree = {
  path: string;
  branch: string | null;
  detached: boolean;
};

export class GitContextService {
  public constructor(
    private readonly sessionService: SessionService,
    private readonly executionContextStore: ExecutionContextStore,
    private readonly managedWorktreeRoot: string
  ) {}

  public listWorkspaceContexts(workspace: Workspace): ExecutionContext[] {
    this.ensureGitWorkspace(workspace);
    return this.syncWorkspaceContexts(workspace);
  }

  public createManagedWorktree(workspace: Workspace, name: string, startPoint = "HEAD"): ExecutionContext {
    this.ensureGitWorkspace(workspace);

    const targetPath = path.join(
      path.resolve(this.managedWorktreeRoot),
      sanitizeSegment(path.basename(workspace.rootPath)),
      sanitizeSegment(name)
    );

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const branchName = `ab/${sanitizeSegment(workspace.workspaceId)}/${sanitizeSegment(name)}`;
    execFileSync(
      "git",
      ["-C", workspace.rootPath, "worktree", "add", targetPath, "-b", branchName, startPoint],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    );

    const contexts = this.syncWorkspaceContexts(workspace);
    const created = contexts.find((context) => context.path === path.resolve(targetPath));
    if (!created) {
      throw new Error(`Managed worktree ${targetPath} was created but not discovered`);
    }

    return created;
  }

  private syncWorkspaceContexts(workspace: Workspace): ExecutionContext[] {
    const discovered = parseWorktreeList(workspace.rootPath).map((item) => ({
      path: path.resolve(item.path),
      kind: path.resolve(item.path) === path.resolve(workspace.rootPath) ? "main" as const : "worktree" as const,
      branch: item.branch,
      managed: this.isManagedPath(item.path),
      status: "active" as const
    }));

    const existing = this.executionContextStore.listByWorkspaceId(workspace.workspaceId);
    const byPath = new Map(existing.map((context) => [path.resolve(context.path), context] as const));

    const synced = discovered.map((item) => {
      const matched = byPath.get(item.path);
      if (!matched) {
        const now = new Date().toISOString();
        return this.executionContextStore.create({
          contextId: crypto.randomUUID(),
          workspaceId: workspace.workspaceId,
          kind: item.kind,
          path: item.path,
          managed: item.managed,
          status: item.status,
          branch: item.branch,
          createdAt: now,
          updatedAt: now
        });
      }

      return this.executionContextStore.update({
        ...matched,
        kind: item.kind,
        path: item.path,
        managed: item.managed,
        status: item.status,
        branch: item.branch,
        updatedAt: new Date().toISOString()
      });
    });

    const discoveredPaths = new Set(discovered.map((item) => item.path));
    for (const context of existing) {
      if (!discoveredPaths.has(path.resolve(context.path)) && context.status !== "archived") {
        this.executionContextStore.update({
          ...context,
          status: "archived",
          updatedAt: new Date().toISOString()
        });
      }
    }

    return synced.sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "main" ? -1 : 1;
      }

      return left.path.localeCompare(right.path);
    });
  }

  private isManagedPath(worktreePath: string): boolean {
    const normalizedManagedRoot = ensureTrailingSeparator(path.resolve(this.managedWorktreeRoot));
    const normalizedWorktreePath = ensureTrailingSeparator(path.resolve(worktreePath));

    return normalizedWorktreePath.startsWith(normalizedManagedRoot);
  }

  private ensureGitWorkspace(workspace: Workspace) {
    if (workspace.kind !== "git_repo" || !workspace.capabilities.gitCapable) {
      throw new Error(`Workspace ${workspace.workspaceId} is not a Git workspace`);
    }
  }
}

function parseWorktreeList(repoRoot: string): ParsedWorktree[] {
  const output = execFileSync("git", ["-C", repoRoot, "worktree", "list", "--porcelain"], {
    encoding: "utf8",
    stdio: "pipe"
  });

  const entries = output
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return entries.map((entry) => {
    const lines = entry.split("\n");
    const worktreeLine = lines.find((line) => line.startsWith("worktree "));
    if (!worktreeLine) {
      throw new Error(`Invalid git worktree output block: ${entry}`);
    }

    const branchLine = lines.find((line) => line.startsWith("branch "));
    const detached = lines.some((line) => line === "detached");

    return {
      path: worktreeLine.slice("worktree ".length),
      branch: branchLine ? branchLine.replace("branch refs/heads/", "") : null,
      detached
    };
  });
}

function sanitizeSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return normalized.replace(/^-|-$/g, "") || "workspace";
}

function ensureTrailingSeparator(value: string): string {
  return value.endsWith(path.sep) ? value : `${value}${path.sep}`;
}
