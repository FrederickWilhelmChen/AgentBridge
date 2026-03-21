import type { Database } from "better-sqlite3";
import type { Workspace } from "../domain/models.js";

type WorkspaceRow = {
  workspace_id: string;
  root_path: string;
  kind: Workspace["kind"];
  source: Workspace["source"];
  git_capable: number;
  worktree_capable: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
};

function mapWorkspace(row: WorkspaceRow): Workspace {
  return {
    workspaceId: row.workspace_id,
    rootPath: row.root_path,
    kind: row.kind,
    source: row.source,
    capabilities: {
      gitCapable: row.git_capable !== 0,
      worktreeCapable: row.worktree_capable !== 0
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at
  };
}

export class WorkspaceStore {
  public constructor(private readonly database: Database) {}

  private findRowById(workspaceId: string): WorkspaceRow | null {
    const row = this.database
      .prepare("SELECT * FROM workspaces WHERE workspace_id = ?")
      .get(workspaceId) as WorkspaceRow | undefined;

    return row ?? null;
  }

  public create(workspace: Workspace): Workspace {
    this.database
      .prepare(`
        INSERT INTO workspaces (
          workspace_id, root_path, kind, source, git_capable, worktree_capable, created_at, updated_at, last_used_at
        ) VALUES (
          @workspaceId, @rootPath, @kind, @source, @gitCapable, @worktreeCapable, @createdAt, @updatedAt, @lastUsedAt
        )
      `)
      .run({
        workspaceId: workspace.workspaceId,
        rootPath: workspace.rootPath,
        kind: workspace.kind,
        source: workspace.source,
        gitCapable: workspace.capabilities.gitCapable ? 1 : 0,
        worktreeCapable: workspace.capabilities.worktreeCapable ? 1 : 0,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        lastUsedAt: workspace.lastUsedAt
      });

    return workspace;
  }

  public findById(workspaceId: string): Workspace | null {
    const row = this.findRowById(workspaceId);

    return row ? mapWorkspace(row) : null;
  }

  public list(): Workspace[] {
    const rows = this.database
      .prepare("SELECT * FROM workspaces ORDER BY created_at ASC, workspace_id ASC")
      .all() as WorkspaceRow[];

    return rows.map(mapWorkspace);
  }

  public update(workspace: Workspace): Workspace {
    const existing = this.findRowById(workspace.workspaceId);
    if (!existing) {
      throw new Error(`Workspace ${workspace.workspaceId} does not exist`);
    }

    if (existing.created_at !== workspace.createdAt) {
      throw new Error(
        `Workspace ${workspace.workspaceId} createdAt cannot change from ${existing.created_at} to ${workspace.createdAt}`
      );
    }

    const result = this.database
      .prepare(`
        UPDATE workspaces
        SET root_path = @rootPath,
            kind = @kind,
            source = @source,
            git_capable = @gitCapable,
            worktree_capable = @worktreeCapable,
            updated_at = @updatedAt,
            last_used_at = @lastUsedAt
        WHERE workspace_id = @workspaceId
      `)
      .run({
        workspaceId: workspace.workspaceId,
        rootPath: workspace.rootPath,
        kind: workspace.kind,
        source: workspace.source,
        gitCapable: workspace.capabilities.gitCapable ? 1 : 0,
        worktreeCapable: workspace.capabilities.worktreeCapable ? 1 : 0,
        updatedAt: workspace.updatedAt,
        lastUsedAt: workspace.lastUsedAt
      });

    if (result.changes === 0) {
      throw new Error(`Workspace ${workspace.workspaceId} does not exist`);
    }

    const updated = this.findById(workspace.workspaceId);
    return updated ?? workspace;
  }
}
