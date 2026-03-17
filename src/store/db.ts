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
      created_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      last_run_id TEXT
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      session_id TEXT,
      agent_type TEXT NOT NULL,
      slack_channel_id TEXT NOT NULL,
      slack_thread_ts TEXT,
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

  return database;
}

export type AppDatabase = ReturnType<typeof createDatabase>;
