import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createDatabase } from "./db.js";
import { SessionStore } from "./session-store.js";
import { RunStore } from "./run-store.js";

test("persists platform-neutral session and run fields", () => {
  const database = createDatabase(":memory:");
  const sessionStore = new SessionStore(database);
  const runStore = new RunStore(database);

  const session = sessionStore.create({
    sessionId: "session-1",
    agentType: "codex",
    cwd: "E:/AgentBridge",
    mode: "persistent",
    status: "idle",
    providerSessionId: null,
    platform: "slack",
    platformChannelId: "C123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    createdAt: "2026-03-19T10:00:00.000Z",
    lastActiveAt: "2026-03-19T10:00:00.000Z",
    lastRunId: null
  });

  const run = runStore.create({
    runId: "run-1",
    sessionId: session.sessionId,
    agentType: "codex",
    platform: "slack",
    platformChannelId: "C123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    inputText: "status",
    status: "queued",
    pid: null,
    startedAt: "2026-03-19T10:01:00.000Z",
    endedAt: null,
    exitCode: null,
    outputTail: "",
    rawOutput: "",
    errorReason: null
  });

  assert.equal(sessionStore.findById("session-1")?.platform, "slack");
  assert.equal(sessionStore.findById("session-1")?.platformUserId, "U123");
  assert.equal(runStore.findById("run-1")?.platformChannelId, "C123");
  assert.equal(runStore.findById("run-1")?.platformThreadId, "thread-1");
  assert.equal(runStore.findById("run-1")?.platformUserId, "U123");
  assert.equal(run.platform, "slack");
});

test("migrates old slack-specific run columns into platform-neutral columns", () => {
  const dbPath = path.join(os.tmpdir(), `agentbridge-platform-${Date.now()}.db`);
  const database = new Database(dbPath);

  database.exec(`
    CREATE TABLE sessions (
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

    CREATE TABLE runs (
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

    INSERT INTO runs (
      run_id, session_id, agent_type, slack_channel_id, slack_thread_ts, input_text,
      status, pid, started_at, ended_at, exit_code, output_tail, error_reason
    ) VALUES (
      'legacy-run', NULL, 'claude', 'D123', '171', 'hello',
      'finished', NULL, '2026-03-19T10:00:00.000Z', NULL, 0, '', NULL
    );
  `);

  database.close();

  const migrated = createDatabase(dbPath);
  const runStore = new RunStore(migrated);

  const run = runStore.findById("legacy-run");

  assert.equal(run?.platform, "slack");
  assert.equal(run?.platformChannelId, "D123");
  assert.equal(run?.platformThreadId, "171");

  migrated.close();
  fs.unlinkSync(dbPath);
});
