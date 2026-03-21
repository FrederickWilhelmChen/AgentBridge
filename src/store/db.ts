import Database from "better-sqlite3";

export function createDatabase(dbPath: string) {
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");

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
      workspace_id TEXT NOT NULL,
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

  const workspaceColumns = database
    .prepare("PRAGMA table_info(workspaces)")
    .all() as Array<{ name: string }>;

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

  const executionContextColumns = database
    .prepare("PRAGMA table_info(execution_contexts)")
    .all() as Array<{ name: string }>;

  if (!executionContextColumns.some((column) => column.name === "workspace_id")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
  }

  if (!executionContextColumns.some((column) => column.name === "kind")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN kind TEXT NOT NULL DEFAULT 'main'");
  }

  if (!executionContextColumns.some((column) => column.name === "path")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN path TEXT NOT NULL DEFAULT ''");
  }

  if (!executionContextColumns.some((column) => column.name === "managed")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN managed INTEGER NOT NULL DEFAULT 0");
  }

  if (!executionContextColumns.some((column) => column.name === "status")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN status TEXT NOT NULL DEFAULT 'active'");
  }

  if (!executionContextColumns.some((column) => column.name === "branch")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN branch TEXT");
  }

  if (!executionContextColumns.some((column) => column.name === "created_at")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN created_at TEXT NOT NULL DEFAULT ''");
  }

  if (!executionContextColumns.some((column) => column.name === "updated_at")) {
    database.exec("ALTER TABLE execution_contexts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  }

  return database;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
