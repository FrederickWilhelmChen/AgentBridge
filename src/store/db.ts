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
      error_reason TEXT
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

  return database;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
