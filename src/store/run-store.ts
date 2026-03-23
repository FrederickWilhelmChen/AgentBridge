import type { Database } from "better-sqlite3";
import type { Run } from "../domain/models.js";

type RunRow = {
  run_id: string;
  session_id: string | null;
  agent_type: Run["agentType"];
  platform: Run["platform"];
  platform_channel_id: string;
  platform_thread_id: string | null;
  platform_user_id: string;
  input_text: string;
  status: Run["status"];
  pid: number | null;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  output_tail: string;
  raw_output: string;
  error_reason: string | null;
};

function mapRun(row: RunRow): Run {
  return {
    runId: row.run_id,
    sessionId: row.session_id,
    agentType: row.agent_type,
    platform: row.platform,
    platformChannelId: row.platform_channel_id,
    platformThreadId: row.platform_thread_id,
    platformUserId: row.platform_user_id,
    inputText: row.input_text,
    status: row.status,
    pid: row.pid,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code,
    outputTail: row.output_tail,
    rawOutput: row.raw_output,
    errorReason: row.error_reason
  };
}

export class RunStore {
  public constructor(private readonly database: Database) {}

  public create(run: Run): Run {
    this.database
      .prepare(`
        INSERT INTO runs (
          run_id, session_id, agent_type, platform, platform_channel_id, platform_thread_id, platform_user_id, input_text,
          status, pid, started_at, ended_at, exit_code, output_tail, raw_output, error_reason
        ) VALUES (
          @runId, @sessionId, @agentType, @platform, @platformChannelId, @platformThreadId, @platformUserId, @inputText,
          @status, @pid, @startedAt, @endedAt, @exitCode, @outputTail, @rawOutput, @errorReason
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
            platform = @platform,
            platform_channel_id = @platformChannelId,
            platform_thread_id = @platformThreadId,
            platform_user_id = @platformUserId,
            input_text = @inputText,
            status = @status,
            pid = @pid,
            started_at = @startedAt,
            ended_at = @endedAt,
            exit_code = @exitCode,
            output_tail = @outputTail,
            raw_output = @rawOutput,
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

  public listActive(): Run[] {
    const rows = this.database
      .prepare("SELECT * FROM runs WHERE status IN ('starting', 'running') ORDER BY started_at DESC")
      .all() as RunRow[];

    return rows.map(mapRun);
  }
}
