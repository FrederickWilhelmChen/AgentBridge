import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { Workspace } from "../domain/models.js";
import { SessionService } from "./session-service.js";

type WorkspaceDiscoveryConfig = {
  allowedWorkspaceParents: string[];
  manualWorkspaces: string[];
};

type GitWorkspaceCandidate = {
  repoRoot: string;
  commonDir: string;
};

type WorkspaceDiscoveryResult = {
  workspaces: Workspace[];
};

const MARKER_FILE_PATH = path.join(".agentbridge", "workspace.json");
const MAX_SCAN_DEPTH = 1;
const SKIPPED_DIRECTORY_NAMES = new Set([
  ".git",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".venv",
  "venv",
  "__pycache__",
  ".gradle",
  "build",
  "target"
]);

export class WorkspaceDiscoveryService {
  public constructor(private readonly sessionService: SessionService) {}

  public refresh(config: WorkspaceDiscoveryConfig): WorkspaceDiscoveryResult {
    const discovered = new Map<string, Workspace>();
    const existingWorkspaces = this.sessionService.listWorkspaces();
    const existingByRootPath = new Map(
      existingWorkspaces.map((workspace) => [workspace.rootPath, workspace] as const)
    );

    const registerWorkspace = (
      rootPath: string,
      attributes: Pick<Workspace, "kind" | "source" | "capabilities">
    ) => {
      const normalizedRootPath = path.resolve(rootPath);
      const now = new Date().toISOString();
      const existing = existingByRootPath.get(normalizedRootPath);
      const workspace: Workspace = {
        workspaceId: existing?.workspaceId ?? crypto.randomUUID(),
        rootPath: normalizedRootPath,
        kind: attributes.kind,
        source: attributes.source,
        capabilities: attributes.capabilities,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        lastUsedAt: existing?.lastUsedAt ?? null
      };

      const persisted = this.sessionService.upsertWorkspace(workspace);
      existingByRootPath.set(normalizedRootPath, persisted);
      discovered.set(normalizedRootPath, persisted);
    };

    for (const manualWorkspace of config.manualWorkspaces) {
      if (!fs.existsSync(manualWorkspace) || !fs.statSync(manualWorkspace).isDirectory()) {
        continue;
      }

      registerWorkspace(manualWorkspace, {
        kind: "plain_dir",
        source: "manual",
        capabilities: {
          gitCapable: false,
          worktreeCapable: false
        }
      });
    }

    const gitCandidatesByRepo = new Map<string, GitWorkspaceCandidate>();

    for (const parent of config.allowedWorkspaceParents) {
      for (const directory of walkDirectories(parent, MAX_SCAN_DEPTH)) {
        const gitCandidate = detectGitWorkspace(directory);
        if (gitCandidate) {
          gitCandidatesByRepo.set(gitCandidate.commonDir, gitCandidate);
          continue;
        }

        if (fs.existsSync(path.join(directory, MARKER_FILE_PATH))) {
          registerWorkspace(directory, {
            kind: "plain_dir",
            source: "marker_file",
            capabilities: {
              gitCapable: false,
              worktreeCapable: false
            }
          });
        }
      }
    }

    for (const candidate of gitCandidatesByRepo.values()) {
      registerWorkspace(candidate.repoRoot, {
        kind: "git_repo",
        source: "scanned_git",
        capabilities: {
          gitCapable: true,
          worktreeCapable: true
        }
      });
    }

    for (const existing of existingWorkspaces) {
      if (!discovered.has(existing.rootPath)) {
        this.sessionService.deleteWorkspace(existing.workspaceId);
      }
    }

    return {
      workspaces: Array.from(discovered.values()).sort((left, right) =>
        left.rootPath.localeCompare(right.rootPath)
      )
    };
  }
}

function walkDirectories(rootPath: string, maxDepth: number): string[] {
  const normalizedRootPath = path.resolve(rootPath);
  if (!fs.existsSync(normalizedRootPath) || !fs.statSync(normalizedRootPath).isDirectory()) {
    return [];
  }

  const directories: string[] = [];
  const queue: Array<{ directory: string; depth: number }> = [{ directory: normalizedRootPath, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    directories.push(next.directory);
    if (next.depth >= maxDepth) {
      continue;
    }

    for (const entry of fs.readdirSync(next.directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      if (SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }

      queue.push({
        directory: path.join(next.directory, entry.name),
        depth: next.depth + 1
      });
    }
  }

  return directories;
}

function detectGitWorkspace(directory: string): GitWorkspaceCandidate | null {
  const gitEntryPath = path.join(directory, ".git");
  if (!fs.existsSync(gitEntryPath)) {
    return null;
  }

  try {
    const commonDir = execFileSync(
      "git",
      ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        encoding: "utf8",
        stdio: "pipe"
      }
    ).trim();

    if (!commonDir) {
      return null;
    }

    return {
      repoRoot: deriveRepoRootFromCommonDir(commonDir),
      commonDir
    };
  } catch {
    return null;
  }
}

function deriveRepoRootFromCommonDir(commonDir: string): string {
  const normalizedCommonDir = path.resolve(commonDir);
  if (path.basename(normalizedCommonDir).toLowerCase() === ".git") {
    return path.dirname(normalizedCommonDir);
  }

  return normalizedCommonDir;
}
