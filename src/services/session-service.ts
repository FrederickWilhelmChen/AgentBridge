import crypto from "node:crypto";
import type { AgentType } from "../domain/enums.js";
import type { Run, Session } from "../domain/models.js";
import { RunStore } from "../store/run-store.js";
import { SessionStore } from "../store/session-store.js";

export class SessionService {
  public constructor(
    private readonly sessionStore: SessionStore,
    private readonly runStore: RunStore
  ) {}

  public createPersistentSession(agentType: AgentType, cwd: string): Session {
    const now = new Date().toISOString();
    const session: Session = {
      sessionId: crypto.randomUUID(),
      agentType,
      cwd,
      mode: "persistent",
      status: "idle",
      providerSessionId: null,
      createdAt: now,
      lastActiveAt: now,
      lastRunId: null
    };

    return this.sessionStore.create(session);
  }

  public getOrCreatePersistentSession(agentType: AgentType, cwd: string): Session {
    const existing = this.sessionStore.findPersistentByAgent(agentType);
    if (existing) {
      if (existing.cwd !== cwd) {
        return this.sessionStore.update({
          ...existing,
          cwd,
          lastActiveAt: new Date().toISOString()
        });
      }

      return existing;
    }

    return this.createPersistentSession(agentType, cwd);
  }

  public createRun(params: {
    sessionId: string | null;
    agentType: AgentType;
    slackChannelId: string;
    slackThreadTs?: string | null;
    inputText: string;
  }): Run {
    const now = new Date().toISOString();
    const run: Run = {
      runId: crypto.randomUUID(),
      sessionId: params.sessionId,
      agentType: params.agentType,
      slackChannelId: params.slackChannelId,
      slackThreadTs: params.slackThreadTs ?? null,
      inputText: params.inputText,
      status: "queued",
      pid: null,
      startedAt: now,
      endedAt: null,
      exitCode: null,
      outputTail: "",
      errorReason: null
    };

    return this.runStore.create(run);
  }

  public getSessionById(sessionId: string): Session | null {
    return this.sessionStore.findById(sessionId);
  }

  public getPersistentSessionByAgent(agentType: AgentType): Session | null {
    return this.sessionStore.findPersistentByAgent(agentType);
  }

  public updateSession(session: Session): Session {
    return this.sessionStore.update(session);
  }

  public updateRun(run: Run): Run {
    return this.runStore.update(run);
  }

  public getRunById(runId: string): Run | null {
    return this.runStore.findById(runId);
  }

  public getLatestRunBySessionId(sessionId: string): Run | null {
    return this.runStore.findLatestBySessionId(sessionId);
  }
}
