import crypto from "node:crypto";
import type { AgentType } from "../domain/enums.js";
import type { Run, Session, Workspace } from "../domain/models.js";
import { RunStore } from "../store/run-store.js";
import { SessionStore } from "../store/session-store.js";
import { WorkspaceStore } from "../store/workspace-store.js";

export class SessionService {
  public constructor(
    private readonly sessionStore: SessionStore,
    private readonly runStore: RunStore,
    private readonly workspaceStore?: WorkspaceStore
  ) {}

  public createPersistentSession(
    agentType: AgentType,
    cwd: string,
    platform: Session["platform"] = "slack",
    platformUserId = "",
    platformChannelId = "",
    platformThreadId: string | null = null
  ): Session {
    const now = new Date().toISOString();
    const session: Session = {
      sessionId: crypto.randomUUID(),
      agentType,
      cwd,
      mode: "persistent",
      status: "idle",
      providerSessionId: null,
      platform,
      platformChannelId,
      platformThreadId,
      platformUserId,
      createdAt: now,
      lastActiveAt: now,
      lastRunId: null
    };

    return this.sessionStore.create(session);
  }

  public getOrCreatePersistentSession(
    agentType: AgentType,
    cwd: string,
    platform: Session["platform"] = "slack",
    platformUserId = "",
    platformChannelId = "",
    platformThreadId: string | null = null
  ): Session {
    const existing = this.sessionStore.findPersistentByScope(agentType, platform, platformUserId);
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

    return this.createPersistentSession(
      agentType,
      cwd,
      platform,
      platformUserId,
      platformChannelId,
      platformThreadId
    );
  }

  public createRun(params: {
    sessionId: string | null;
    agentType: AgentType;
    platform?: Run["platform"];
    platformChannelId: string;
    platformThreadId?: string | null;
    platformUserId?: string;
    inputText: string;
  }): Run {
    const now = new Date().toISOString();
    const run: Run = {
      runId: crypto.randomUUID(),
      sessionId: params.sessionId,
      agentType: params.agentType,
      platform: params.platform ?? "slack",
      platformChannelId: params.platformChannelId,
      platformThreadId: params.platformThreadId ?? null,
      platformUserId: params.platformUserId ?? "",
      inputText: params.inputText,
      status: "queued",
      pid: null,
      startedAt: now,
      endedAt: null,
      exitCode: null,
      outputTail: "",
      rawOutput: "",
      errorReason: null
    };

    return this.runStore.create(run);
  }

  public getSessionById(sessionId: string): Session | null {
    return this.sessionStore.findById(sessionId);
  }

  public getPersistentSessionByScope(
    agentType: AgentType,
    platform: Session["platform"] = "slack",
    platformUserId = ""
  ): Session | null {
    return this.sessionStore.findPersistentByScope(agentType, platform, platformUserId);
  }

  public getPersistentSessionByThread(
    platform: Session["platform"],
    platformUserId: string,
    platformChannelId: string,
    platformThreadId: string
  ): Session | null {
    return this.sessionStore.findPersistentByThread(
      platform,
      platformUserId,
      platformChannelId,
      platformThreadId
    );
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

  public listWorkspaces(): Workspace[] {
    if (!this.workspaceStore) {
      return [];
    }

    return this.workspaceStore.list();
  }

  public findWorkspaceByRootPath(rootPath: string): Workspace | null {
    if (!this.workspaceStore) {
      return null;
    }

    return this.workspaceStore.list().find((workspace) => workspace.rootPath === rootPath) ?? null;
  }

  public upsertWorkspace(workspace: Workspace): Workspace {
    if (!this.workspaceStore) {
      throw new Error("Workspace store is not configured");
    }

    const existing = this.findWorkspaceByRootPath(workspace.rootPath);
    if (!existing) {
      return this.workspaceStore.create(workspace);
    }

    return this.workspaceStore.update({
      ...workspace,
      workspaceId: existing.workspaceId,
      createdAt: existing.createdAt
    });
  }
}
