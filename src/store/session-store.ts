import type { Database } from "better-sqlite3";
import type { Session } from "../domain/models.js";

type SessionRow = {
  session_id: string;
  agent_type: Session["agentType"];
  cwd: string;
  mode: Session["mode"];
  status: Session["status"];
  provider_session_id: string | null;
  platform: Session["platform"];
  platform_user_id: string;
  created_at: string;
  last_active_at: string;
  last_run_id: string | null;
};

function mapSession(row: SessionRow): Session {
  return {
    sessionId: row.session_id,
    agentType: row.agent_type,
    cwd: row.cwd,
    mode: row.mode,
    status: row.status,
    providerSessionId: row.provider_session_id,
    platform: row.platform,
    platformUserId: row.platform_user_id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    lastRunId: row.last_run_id
  };
}

export class SessionStore {
  public constructor(private readonly database: Database) {}

  public create(session: Session): Session {
    this.database
      .prepare(`
        INSERT INTO sessions (
          session_id, agent_type, cwd, mode, status, provider_session_id, platform, platform_user_id, created_at, last_active_at, last_run_id
        ) VALUES (
          @sessionId, @agentType, @cwd, @mode, @status, @providerSessionId, @platform, @platformUserId, @createdAt, @lastActiveAt, @lastRunId
        )
      `)
      .run(session);

    return session;
  }

  public findById(sessionId: string): Session | null {
    const row = this.database
      .prepare("SELECT * FROM sessions WHERE session_id = ?")
      .get(sessionId) as SessionRow | undefined;

    return row ? mapSession(row) : null;
  }

  public list(): Session[] {
    const rows = this.database
      .prepare("SELECT * FROM sessions ORDER BY last_active_at DESC")
      .all() as SessionRow[];

    return rows.map(mapSession);
  }

  public findPersistentByScope(
    agentType: Session["agentType"],
    platform: Session["platform"],
    platformUserId: string
  ): Session | null {
    const row = this.database
      .prepare(`
        SELECT *
        FROM sessions
        WHERE agent_type = ?
          AND platform = ?
          AND platform_user_id = ?
          AND mode = 'persistent'
        LIMIT 1
      `)
      .get(agentType, platform, platformUserId) as SessionRow | undefined;

    return row ? mapSession(row) : null;
  }

  public update(session: Session): Session {
    this.database
      .prepare(`
        UPDATE sessions
        SET cwd = @cwd,
            status = @status,
            provider_session_id = @providerSessionId,
            platform = @platform,
            platform_user_id = @platformUserId,
            last_active_at = @lastActiveAt,
            last_run_id = @lastRunId
        WHERE session_id = @sessionId
      `)
      .run(session);

    return session;
  }
}
