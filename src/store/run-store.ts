import type { Database } from "better-sqlite3";
import type { Run } from "../domain/models.js";

type RunRow = {
  run_id: string;
  session_id: string | null;
  agent_type: Run["agentType"];
  slack_channel_id: string;
  slack_thread_ts: string | null;
  input_text: string;
  status: Run["status"];
  pid: number | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  output_tail: string;
  error_reason: string | null;
};

function mapRun(row: RunRow): Run {
  return {
    runId: row.run_id,
    sessionId: row.session_id,
    agentType: row.agent_type,
    slackChannelId: row.slack_channel_id,
    slackThreadTs: row.slack_thread_ts,
    inputText: row.input_text,
    status: row.status,
    pid: row.pid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code,
    outputTail: row.output_tail,
    errorReason: row.error_reason
  };
}

export class RunStore {
  public constructor(private readonly database: Database) {}

  public create(run: Run): Run {
    this.database
      .prepare(`
        INSERT INTO runs (
          run_id, session_id, agent_type, slack_channel_id, slack_thread_ts, input_text,
          status, pid, started_at, ended_at, exit_code, output_tail, error_reason
        ) VALUES (
          @runId, @sessionId, @agentType, @slackChannelId, @slackThreadTs, @inputText,
          @status, @pid, @startedAt, @endedAt, @exitCode, @outputTail, @errorReason
        )
      `)
      .run(run);

    return run;
  }

  public findById(runId: string): Run | null {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE run_id = ?")
      .get(runId) as RunRow | undefined;

    return row ? mapRun(row) : null;
  }

  public update(run: Run): Run {
    this.database
      .prepare(`
        UPDATE runs
        SET session_id = @sessionId,
            agent_type = @agentType,
            slack_channel_id = @slackChannelId,
            slack_thread_ts = @slackThreadTs,
            input_text = @inputText,
            status = @status,
            pid = @pid,
            started_at = @startedAt,
            ended_at = @endedAt,
            exit_code = @exitCode,
            output_tail = @outputTail,
            error_reason = @errorReason
        WHERE run_id = @runId
      `)
      .run(run);

    return run;
  }

  public findLatestBySessionId(sessionId: string): Run | null {
    const row = this.database
      .prepare("SELECT * FROM runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 1")
      .get(sessionId) as RunRow | undefined;

    return row ? mapRun(row) : null;
  }
}
