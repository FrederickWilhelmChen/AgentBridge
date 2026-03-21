import type { Database } from "better-sqlite3";
import type { ExecutionContext } from "../domain/models.js";

type ExecutionContextRow = {
  context_id: string;
  workspace_id: string;
  kind: ExecutionContext["kind"];
  path: string;
  managed: number;
  status: ExecutionContext["status"];
  branch: string | null;
  created_at: string;
  updated_at: string;
};

function mapExecutionContext(row: ExecutionContextRow): ExecutionContext {
  return {
    contextId: row.context_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    path: row.path,
    managed: row.managed !== 0,
    status: row.status,
    branch: row.branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ExecutionContextStore {
  public constructor(private readonly database: Database) {}

  public create(context: ExecutionContext): ExecutionContext {
    const workspaceExists = this.database
      .prepare("SELECT 1 FROM workspaces WHERE workspace_id = ?")
      .get(context.workspaceId);

    if (!workspaceExists) {
      throw new Error(`Workspace ${context.workspaceId} does not exist`);
    }

    this.database
      .prepare(`
        INSERT INTO execution_contexts (
          context_id, workspace_id, kind, path, managed, status, branch, created_at, updated_at
        ) VALUES (
          @contextId, @workspaceId, @kind, @path, @managed, @status, @branch, @createdAt, @updatedAt
        )
      `)
      .run({
        contextId: context.contextId,
        workspaceId: context.workspaceId,
        kind: context.kind,
        path: context.path,
        managed: context.managed ? 1 : 0,
        status: context.status,
        branch: context.branch,
        createdAt: context.createdAt,
        updatedAt: context.updatedAt
      });

    return context;
  }

  private findRowById(contextId: string): ExecutionContextRow | null {
    const row = this.database
      .prepare("SELECT * FROM execution_contexts WHERE context_id = ?")
      .get(contextId) as ExecutionContextRow | undefined;

    return row ?? null;
  }

  public findById(contextId: string): ExecutionContext | null {
    const row = this.findRowById(contextId);

    return row ? mapExecutionContext(row) : null;
  }

  public listByWorkspaceId(workspaceId: string): ExecutionContext[] {
    const rows = this.database
      .prepare("SELECT * FROM execution_contexts WHERE workspace_id = ? ORDER BY created_at ASC, context_id ASC")
      .all(workspaceId) as ExecutionContextRow[];

    return rows.map(mapExecutionContext);
  }

  public update(context: ExecutionContext): ExecutionContext {
    const existing = this.findRowById(context.contextId);
    if (!existing) {
      throw new Error(`Execution context ${context.contextId} does not exist`);
    }

    if (existing.workspace_id !== context.workspaceId) {
      throw new Error(
        `Execution context ${context.contextId} workspaceId cannot change from ${existing.workspace_id} to ${context.workspaceId}`
      );
    }

    if (existing.created_at !== context.createdAt) {
      throw new Error(
        `Execution context ${context.contextId} createdAt cannot change from ${existing.created_at} to ${context.createdAt}`
      );
    }

    const result = this.database
      .prepare(`
        UPDATE execution_contexts
        SET kind = @kind,
            path = @path,
            managed = @managed,
            status = @status,
            branch = @branch,
            updated_at = @updatedAt
        WHERE context_id = @contextId
      `)
      .run({
        contextId: context.contextId,
        kind: context.kind,
        path: context.path,
        managed: context.managed ? 1 : 0,
        status: context.status,
        branch: context.branch,
        updatedAt: context.updatedAt
      });

    if (result.changes === 0) {
      throw new Error(`Execution context ${context.contextId} does not exist`);
    }

    const updated = this.findById(context.contextId);
    return updated ?? context;
  }
}
