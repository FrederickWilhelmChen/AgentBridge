import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";

type TableColumn = { name: string };
type ForeignKeyRow = {
  table: string;
  from: string;
  to: string;
};

const EXECUTION_CONTEXT_REQUIRED_COLUMNS = [
  "context_id",
  "workspace_id",
  "kind",
  "path",
  "managed",
  "status",
  "created_at",
  "updated_at"
] as const;

function getTableColumns(database: SqliteDatabase, tableName: string): TableColumn[] {
  return database.prepare(`PRAGMA table_info(${tableName})`).all() as TableColumn[];
}

function hasColumn(database: SqliteDatabase, tableName: string, columnName: string): boolean {
  return getTableColumns(database, tableName).some((column) => column.name === columnName);
}

function hasForeignKey(
  database: SqliteDatabase,
  tableName: string,
  foreignTable: string,
  fromColumn: string,
  toColumn: string
): boolean {
  const foreignKeys = database.prepare(`PRAGMA foreign_key_list(${tableName})`).all() as ForeignKeyRow[];

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.table === foreignTable &&
      foreignKey.from === fromColumn &&
      foreignKey.to === toColumn
  );
}

function rebuildExecutionContextTable(database: SqliteDatabase) {
  const legacyColumns = getTableColumns(database, "execution_contexts").map((column) => column.name);
  const legacyRowCount = database
    .prepare("SELECT COUNT(*) AS count FROM execution_contexts")
    .get() as { count: number };

  if (legacyRowCount.count > 0) {
    const missingRequiredColumns = EXECUTION_CONTEXT_REQUIRED_COLUMNS.filter(
      (columnName) => !legacyColumns.includes(columnName)
    );

    if (missingRequiredColumns.length > 0) {
      throw new Error(
        `Cannot safely migrate execution_contexts legacy rows because required columns are missing: ${missingRequiredColumns.join(", ")}`
      );
    }

    const orphanCount = database
      .prepare(`
        SELECT COUNT(*) AS count
        FROM execution_contexts
        WHERE workspace_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM workspaces
            WHERE workspaces.workspace_id = execution_contexts.workspace_id
          )
      `)
      .get() as { count: number };

    if (orphanCount.count > 0) {
      throw new Error(
        `Cannot safely migrate ${orphanCount.count} orphaned execution_context row(s) without a matching workspace`
      );
    }
  }

  database.exec(`
    ALTER TABLE execution_contexts RENAME TO execution_contexts_legacy;

    CREATE TABLE execution_contexts (
      context_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
      kind TEXT NOT NULL,
      path TEXT NOT NULL,
      managed INTEGER NOT NULL,
      status TEXT NOT NULL,
      branch TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (legacyRowCount.count > 0) {
    const selectExpressions = [
      "context_id",
      "workspace_id",
      "kind",
      "path",
      "managed",
      "status",
      legacyColumns.includes("branch") ? "branch" : "NULL",
      "created_at",
      "updated_at"
    ];

    database.exec(`
      INSERT INTO execution_contexts (
        context_id, workspace_id, kind, path, managed, status, branch, created_at, updated_at
      )
      SELECT
        ${selectExpressions.join(",\n        ")}
      FROM execution_contexts_legacy;
    `);
  }

  database.exec("DROP TABLE execution_contexts_legacy;");
}

function ensureExecutionContextTable(database: SqliteDatabase) {
  const executionContextColumns = getTableColumns(database, "execution_contexts");
  if (executionContextColumns.length === 0) {
    return;
  }

  const hasWorkspaceForeignKey = hasForeignKey(
    database,
    "execution_contexts",
    "workspaces",
    "workspace_id",
    "workspace_id"
  );

  if (!hasWorkspaceForeignKey) {
    rebuildExecutionContextTable(database);
  }

  if (!hasColumn(database, "execution_contexts", "workspace_id")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
  }

  if (!hasColumn(database, "execution_contexts", "kind")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN kind TEXT NOT NULL DEFAULT 'main'");
  }

  if (!hasColumn(database, "execution_contexts", "path")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN path TEXT NOT NULL DEFAULT ''");
  }

  if (!hasColumn(database, "execution_contexts", "managed")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN managed INTEGER NOT NULL DEFAULT 0");
  }

  if (!hasColumn(database, "execution_contexts", "status")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }

  if (!hasColumn(database, "execution_contexts", "branch")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN branch TEXT");
  }

  if (!hasColumn(database, "execution_contexts", "created_at")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }

  if (!hasColumn(database, "execution_contexts", "updated_at")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }
}

export function createDatabase(dbPath: string) {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  try {
    database.exec("BEGIN IMMEDIATE;");

    database.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        cwd TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        provider_session_id TEXT,
        platform TEXT NOT NULL DEFAULT 'slack',
        platform_channel_id TEXT NOT NULL DEFAULT '',
        platform_thread_id TEXT,
        platform_user_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        last_run_id TEXT
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        session_id TEXT,
        agent_type TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'slack',
        platform_channel_id TEXT NOT NULL DEFAULT '',
        platform_thread_id TEXT,
        platform_user_id TEXT NOT NULL DEFAULT '',
        input_text TEXT NOT NULL,
        status TEXT NOT NULL,
        pid INTEGER,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        exit_code INTEGER,
        output_tail TEXT NOT NULL,
        raw_output TEXT NOT NULL DEFAULT '',
        error_reason TEXT
      );

      CREATE TABLE IF NOT EXISTS inbound_message_receipts (
        platform TEXT NOT NULL,
        message_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (platform, message_id)
      );

      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL,
        kind TEXT NOT NULL,
        source TEXT NOT NULL,
        git_capable INTEGER NOT NULL,
        worktree_capable INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_used_at TEXT
      );

      CREATE TABLE IF NOT EXISTS execution_contexts (
        context_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        managed INTEGER NOT NULL,
        status TEXT NOT NULL,
        branch TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const sessionColumns = database
      .prepare("PRAGMA table_info(sessions)")
      .all() as Array<{ name: string }>;

    if (!sessionColumns.some((column) => column.name === "provider_session_id")) {
      database.exec("ALTER TABLE sessions ADD COLUMN provider_session_id TEXT");
    }

    if (!sessionColumns.some((column) => column.name === "platform")) {
      database.exec("ALTER TABLE sessions ADD COLUMN platform TEXT NOT NULL DEFAULT 'slack'");
    }

    if (!sessionColumns.some((column) => column.name === "platform_user_id")) {
      database.exec("ALTER TABLE sessions ADD COLUMN platform_user_id TEXT NOT NULL DEFAULT ''");
    }

    if (!sessionColumns.some((column) => column.name === "platform_channel_id")) {
      database.exec("ALTER TABLE sessions ADD COLUMN platform_channel_id TEXT NOT NULL DEFAULT ''");
    }

    if (!sessionColumns.some((column) => column.name === "platform_thread_id")) {
      database.exec("ALTER TABLE sessions ADD COLUMN platform_thread_id TEXT");
    }

    const runColumns = database.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;

    if (!runColumns.some((column) => column.name === "platform")) {
      database.exec("ALTER TABLE runs ADD COLUMN platform TEXT NOT NULL DEFAULT 'slack'");
    }

    if (!runColumns.some((column) => column.name === "platform_channel_id")) {
      database.exec("ALTER TABLE runs ADD COLUMN platform_channel_id TEXT NOT NULL DEFAULT ''");
    }

    if (!runColumns.some((column) => column.name === "platform_thread_id")) {
      database.exec("ALTER TABLE runs ADD COLUMN platform_thread_id TEXT");
    }

    if (!runColumns.some((column) => column.name === "platform_user_id")) {
      database.exec("ALTER TABLE runs ADD COLUMN platform_user_id TEXT NOT NULL DEFAULT ''");
    }

    if (!runColumns.some((column) => column.name === "raw_output")) {
      database.exec("ALTER TABLE runs ADD COLUMN raw_output TEXT NOT NULL DEFAULT ''");
    }

    if (runColumns.some((column) => column.name === "slack_channel_id")) {
      database.exec(`
        UPDATE runs
        SET platform = COALESCE(NULLIF(platform, ''), 'slack'),
            platform_channel_id = CASE
              WHEN platform_channel_id = '' THEN slack_channel_id
              ELSE platform_channel_id
            END,
            platform_thread_id = COALESCE(platform_thread_id, slack_thread_ts)
      `);
    }

    const workspaceColumns = getTableColumns(database, "workspaces");

    if (!workspaceColumns.some((column) => column.name === "root_path")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN root_path TEXT NOT NULL DEFAULT ''");
    }

    if (!workspaceColumns.some((column) => column.name === "kind")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN kind TEXT NOT NULL DEFAULT 'plain_dir'");
    }

    if (!workspaceColumns.some((column) => column.name === "source")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
    }

    if (!workspaceColumns.some((column) => column.name === "git_capable")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN git_capable INTEGER NOT NULL DEFAULT 0");
    }

    if (!workspaceColumns.some((column) => column.name === "worktree_capable")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN worktree_capable INTEGER NOT NULL DEFAULT 0");
    }

    if (!workspaceColumns.some((column) => column.name === "created_at")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
    }

    if (!workspaceColumns.some((column) => column.name === "updated_at")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    }

    if (!workspaceColumns.some((column) => column.name === "last_used_at")) {
      database.exec("ALTER TABLE workspaces ADD COLUMN last_used_at TEXT");
    }

    ensureExecutionContextTable(database);
    database.exec("COMMIT;");
    return database;
  } catch (error) {
    try {
      database.exec("ROLLBACK;");
    } catch {
      // Ignore rollback failures when the transaction was never started or already ended.
    }

    database.close();
    throw error;
  }
}

export type AppDatabase = ReturnType<typeof createDatabase>;
