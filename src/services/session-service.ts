import crypto from "node:crypto";
import type { AgentType } from "../domain/enums.js";
import type { ExecutionContext, Run, Session, Workspace } from "../domain/models.js";
import { RunStore } from "../store/run-store.js";
import { SessionStore } from "../store/session-store.js";
import { ExecutionContextStore } from "../store/execution-context-store.js";
import { WorkspaceStore } from "../store/workspace-store.js";

export class SessionService {
  public constructor(
    private readonly sessionStore: SessionStore,
    private readonly runStore: RunStore,
    private readonly workspaceStore?: WorkspaceStore,
    private readonly executionContextStore?: ExecutionContextStore
  ) {}

  public createPersistentSession(
    agentType: AgentType,
    cwd: string,
    platform: Session["platform"] = "slack",
    platformUserId = "",
    platformChannelId = "",
    platformThreadId: string | null = null,
    workspaceId: string | null = null,
    currentContextId: string | null = null
  ): Session {
    const now = new Date().toISOString();
    const session: Session = {
      sessionId: crypto.randomUUID(),
      agentType,
      cwd,
      workspaceId,
      currentContextId,
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
    platformThreadId: string | null = null,
    workspaceId: string | null = null,
    currentContextId: string | null = null
  ): Session {
    const existing = platformThreadId && platformChannelId
      ? this.sessionStore.findPersistentByThread(
          platform,
          platformUserId,
          platformChannelId,
          platformThreadId
        )
      : this.sessionStore.findPersistentByScope(agentType, platform, platformUserId);
    if (existing) {
      if (
        existing.cwd !== cwd
        || (existing.workspaceId ?? null) !== workspaceId
        || (existing.currentContextId ?? null) !== currentContextId
        || existing.platformChannelId !== platformChannelId
        || (existing.platformThreadId ?? null) !== platformThreadId
      ) {
        return this.sessionStore.update({
          ...existing,
          cwd,
          workspaceId,
          currentContextId,
          platformChannelId,
          platformThreadId,
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
      platformThreadId,
      workspaceId,
      currentContextId
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

  public recoverStaleRuntimeState(): { recoveredRuns: number; recoveredSessions: number } {
    const now = new Date().toISOString();
    const staleRuns = this.runStore.listActive();

    for (const run of staleRuns) {
      this.runStore.update({
        ...run,
        status: "failed",
        endedAt: now,
        exitCode: null,
        errorReason: run.errorReason ?? "Recovered stale active run during startup."
      });
    }

    let recoveredSessions = 0;
    for (const session of this.sessionStore.list()) {
      if (session.status !== "running") {
        continue;
      }

      const latestRun = session.lastRunId ? this.runStore.findById(session.lastRunId) : null;
      this.sessionStore.update({
        ...session,
        status: "idle",
        lastActiveAt: now
      });
      recoveredSessions += 1;
    }

    return {
      recoveredRuns: staleRuns.length,
      recoveredSessions
    };
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

  public findWorkspaceById(workspaceId: string): Workspace | null {
    if (!this.workspaceStore) {
      return null;
    }

    return this.workspaceStore.findById(workspaceId);
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

  public deleteWorkspace(workspaceId: string): boolean {
    if (!this.workspaceStore) {
      throw new Error("Workspace store is not configured");
    }

    this.executionContextStore?.deleteByWorkspaceId(workspaceId);
    return this.workspaceStore.delete(workspaceId);
  }

  public resolveWorkspaceByRootPath(rootPath: string): Workspace | null {
    return this.findWorkspaceByRootPath(rootPath);
  }

  public ensureMainContextForWorkspace(workspace: Workspace): ExecutionContext {
    if (!this.executionContextStore) {
      throw new Error("Execution context store is not configured");
    }

    const existingMain = this.executionContextStore
      .listByWorkspaceId(workspace.workspaceId)
      .find((context) => context.kind === "main");

    if (existingMain) {
      return existingMain.status === "active"
        ? existingMain
        : this.executionContextStore.update({
            ...existingMain,
            status: "active",
            updatedAt: new Date().toISOString()
          });
    }

    const now = new Date().toISOString();
    return this.executionContextStore.create({
      contextId: crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      kind: "main",
      path: workspace.rootPath,
      managed: false,
      status: "active",
      branch: null,
      createdAt: now,
      updatedAt: now
    });
  }

  public resolveWorkspaceSelection(rootPath: string): { workspace: Workspace; context: ExecutionContext } | null {
    const workspace = this.resolveWorkspaceByRootPath(rootPath);
    if (!workspace) {
      return null;
    }

    return {
      workspace,
      context: this.ensureMainContextForWorkspace(workspace)
    };
  }

  public resolveSessionExecutionContext(session: Session): ExecutionContext | null {
    if (!this.executionContextStore) {
      return null;
    }

    if (session.currentContextId) {
      const context = this.executionContextStore.findById(session.currentContextId);
      if (context) {
        return context;
      }
    }

    if (!session.workspaceId || !this.workspaceStore) {
      return null;
    }

    const workspace = this.workspaceStore.findById(session.workspaceId);
    if (!workspace) {
      return null;
    }

    return this.ensureMainContextForWorkspace(workspace);
  }

  public getDefaultWorkspaceSelection(): { workspace: Workspace; context: ExecutionContext } | null {
    const [workspace] = this.listWorkspaces();
    if (!workspace) {
      return null;
    }

    return {
      workspace,
      context: this.ensureMainContextForWorkspace(workspace)
    };
  }

  public listExecutionContextsByWorkspaceId(workspaceId: string): ExecutionContext[] {
    if (!this.executionContextStore) {
      return [];
    }

    return this.executionContextStore.listByWorkspaceId(workspaceId);
  }

  public switchExecutionContext(sessionId: string, contextId: string): Session {
    if (!this.executionContextStore) {
      throw new Error("Execution context store is not configured");
    }

    const session = this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} does not exist`);
    }

    const context = this.executionContextStore.findById(contextId);
    if (!context) {
      throw new Error(`Execution context ${contextId} does not exist`);
    }

    if (session.workspaceId && context.workspaceId !== session.workspaceId) {
      throw new Error(
        `Execution context ${contextId} does not belong to session workspace ${session.workspaceId}`
      );
    }

    return this.updateSession({
      ...session,
      cwd: context.path,
      currentContextId: context.contextId,
      workspaceId: session.workspaceId ?? context.workspaceId,
      lastActiveAt: new Date().toISOString()
    });
  }

  public buildPersistentSessionLockKey(params: {
    agentType: AgentType;
    platform: Session["platform"];
    platformUserId: string;
    platformChannelId?: string;
    platformThreadId?: string | null;
  }): string {
    if (params.platformThreadId && params.platformChannelId) {
      return `thread:${params.platform}:${params.platformUserId}:${params.platformChannelId}:${params.platformThreadId}`;
    }

    return `scope:${params.platform}:${params.platformUserId}:${params.agentType}`;
  }

  public buildExecutionContextLockKey(
    agentType: AgentType,
    contextId: string | null | undefined,
    cwd: string
  ): string {
    return contextId ? `context:${agentType}:${contextId}` : `cwd:${agentType}:${cwd}`;
  }
}
