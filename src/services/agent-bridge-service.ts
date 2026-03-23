import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";
import type { Run, Session } from "../domain/models.js";
import { parseIntent } from "../intent/intent-router.js";
import type { IncomingPlatformMessage, MessageHandlingResult, SelectableWorkspace } from "../platform/types.js";
import { buildResumeProfile, buildRunOnceProfile } from "../runtime/agents.js";
import { LockAcquisitionTimeoutError, RuntimeLocks } from "../runtime/locks.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { GitContextService } from "./git-context-service.js";
import { SessionService } from "./session-service.js";
import path from "node:path";

export type RunExecutionResult = {
  run: Run;
  session: Session | null;
};

export class AgentBridgeService {
  private readonly locks = new RuntimeLocks();
  private static readonly EXECUTION_CONTEXT_LOCK_TIMEOUT_MS = 5_000;
  private static readonly MAX_CONTEXT_LOCK_HOLD_MS = 15 * 60 * 1_000;

  public constructor(
    private readonly config: AppConfig,
    private readonly sessionService: SessionService,
    private readonly processManager: ProcessManager,
    private readonly gitContextService?: GitContextService
  ) {}

  public async runOnce(params: {
    agentType: AgentType;
    cwd: string;
    message: string;
    platform?: Run["platform"];
    platformChannelId: string;
    platformThreadId?: string | null;
    platformUserId?: string;
  }): Promise<RunExecutionResult> {
    const resolved = this.resolveExecutionTarget(params.cwd);
    const executionCwd = resolved?.context.path ?? this.ensureAllowedCwd(params.cwd);
    const contextLockKey = this.buildExecutionContextLockKey(params.agentType, resolved?.context.contextId, executionCwd);

    return await this.locks.withContextLock(contextLockKey, async () => {
      let run = this.sessionService.createRun({
        sessionId: null,
        agentType: params.agentType,
        ...(params.platform ? { platform: params.platform } : {}),
        platformChannelId: params.platformChannelId,
        platformThreadId: params.platformThreadId ?? null,
        platformUserId: params.platformUserId ?? "",
        inputText: params.message
      });

      run = this.sessionService.updateRun({
        ...run,
        status: "starting"
      });

      try {
        const result = await this.processManager.run(
          run.runId,
          buildRunOnceProfile(this.config, params.agentType, executionCwd, params.message),
          this.getExecutionTimeoutMs(),
          {
            onSpawn: (pid) => {
              run = this.sessionService.updateRun({
                ...run,
                status: "running",
                pid
              });
            }
          }
        );

        run = this.sessionService.updateRun({
          ...run,
          status: result.status,
          endedAt: new Date().toISOString(),
          exitCode: result.exitCode,
          outputTail: result.parsedOutput,
          rawOutput: result.output,
          errorReason: result.errorReason
        });

        return {
          run,
          session: null
        };
      } catch (error) {
        run = this.sessionService.updateRun({
          ...run,
          status: "failed",
          endedAt: new Date().toISOString(),
          exitCode: null,
          outputTail: "",
          rawOutput: "",
          errorReason: formatErrorReason(error)
        });
        throw error;
      }
    }, AgentBridgeService.EXECUTION_CONTEXT_LOCK_TIMEOUT_MS);
  }

  public createOrResetPersistentSession(
    agentType: AgentType,
    cwd: string,
    platform: Session["platform"] = "slack",
    platformUserId = "",
    platformChannelId = "",
    platformThreadId: string | null = null
  ): Session {
    this.ensurePersistentSessionSupport(agentType);
    const resolved = this.resolveExecutionTarget(cwd);
    const executionCwd = resolved?.context.path ?? this.ensureAllowedCwd(cwd);
    const existing = platformThreadId
      ? this.sessionService.getPersistentSessionByThread(
          platform,
          platformUserId,
          platformChannelId,
          platformThreadId
        )
      : this.sessionService.getPersistentSessionByScope(
          agentType,
          platform,
          platformUserId
        );
    if (!existing || existing.agentType !== agentType) {
      return this.sessionService.createPersistentSession(
        agentType,
        executionCwd,
        platform,
        platformUserId,
        platformChannelId,
        platformThreadId,
        resolved?.workspace.workspaceId ?? null,
        resolved?.context.contextId ?? null
      );
    }

    return this.sessionService.updateSession({
      ...existing,
      cwd: executionCwd,
      workspaceId: resolved?.workspace.workspaceId ?? existing.workspaceId ?? null,
      currentContextId: resolved?.context.contextId ?? existing.currentContextId ?? null,
      status: "idle",
      providerSessionId: null,
      lastActiveAt: new Date().toISOString(),
      lastRunId: null
    });
  }

  public async sendToPersistentSession(params: {
    agentType: AgentType;
    cwd: string;
    message: string;
    platform?: Run["platform"];
    platformChannelId: string;
    platformThreadId?: string | null;
    platformUserId?: string;
  }): Promise<RunExecutionResult> {
    const sessionLockKey = this.buildPersistentSessionLockKey({
      agentType: params.agentType,
      platform: params.platform ?? "slack",
      platformUserId: params.platformUserId ?? "",
      platformChannelId: params.platformChannelId,
      platformThreadId: params.platformThreadId ?? null
    });

    return await this.locks.withSessionLock(sessionLockKey, async () => {
      this.ensurePersistentSessionSupport(params.agentType);
      const resolved = this.resolveExecutionTarget(params.cwd);

      let session = (params.platform && params.platformThreadId)
        ? this.sessionService.getPersistentSessionByThread(
            params.platform,
            params.platformUserId ?? "",
            params.platformChannelId,
            params.platformThreadId
          )
        : null;

      if (session && session.agentType !== params.agentType) {
        session = null;
      }

      if (!session) {
        session = this.sessionService.getOrCreatePersistentSession(
          params.agentType,
          resolved?.context.path ?? this.ensureAllowedCwd(params.cwd),
          params.platform ?? "slack",
          params.platformUserId ?? "",
          params.platformChannelId,
          params.platformThreadId ?? null,
          resolved?.workspace.workspaceId ?? null,
          resolved?.context.contextId ?? null
        );
      }
      if (!session) {
        throw new Error("Persistent session could not be created");
      }

      const activeSession = session;
      const currentContext = this.resolveSessionExecutionContext(activeSession);
      const executionCwd = currentContext?.path ?? resolved?.context.path ?? this.ensureAllowedCwd(params.cwd);
      const contextLockKey = this.buildExecutionContextLockKey(
        params.agentType,
        currentContext?.contextId ?? resolved?.context.contextId,
        executionCwd
      );

      return await this.locks.withContextLock(contextLockKey, async () => {
        let run = this.sessionService.createRun({
          sessionId: activeSession.sessionId,
          agentType: params.agentType,
          ...(params.platform ? { platform: params.platform } : {}),
          platformChannelId: params.platformChannelId,
          platformThreadId: params.platformThreadId ?? null,
          platformUserId: params.platformUserId ?? "",
          inputText: params.message
        });

        let updatedSession = this.sessionService.updateSession({
          ...activeSession,
          cwd: executionCwd,
          workspaceId: activeSession.workspaceId ?? resolved?.workspace.workspaceId ?? null,
          currentContextId: currentContext?.contextId ?? resolved?.context.contextId ?? activeSession.currentContextId ?? null,
          status: "running",
          lastActiveAt: new Date().toISOString(),
          lastRunId: run.runId
        });

        run = this.sessionService.updateRun({
          ...run,
          status: "starting"
        });

        const profile = updatedSession.providerSessionId
          ? buildResumeProfile(
              this.config,
              params.agentType,
              executionCwd,
              params.message,
              updatedSession.providerSessionId
            )
          : buildRunOnceProfile(this.config, params.agentType, executionCwd, params.message);

        try {
          const result = await this.processManager.run(
            run.runId,
            profile,
            this.getExecutionTimeoutMs(),
            {
              onSpawn: (pid) => {
                run = this.sessionService.updateRun({
                  ...run,
                  status: "running",
                  pid
                });
              }
            }
          );

          run = this.sessionService.updateRun({
            ...run,
            status: result.status,
            endedAt: new Date().toISOString(),
            exitCode: result.exitCode,
            outputTail: result.parsedOutput,
            rawOutput: result.output,
            errorReason: result.errorReason
          });

          updatedSession = this.sessionService.updateSession({
            ...updatedSession,
            status: result.status === "finished" ? "idle" : "error",
            providerSessionId: result.providerSessionId ?? updatedSession.providerSessionId,
            lastActiveAt: new Date().toISOString(),
            lastRunId: run.runId
          });

          return {
            run,
            session: updatedSession
          };
        } catch (error) {
          run = this.sessionService.updateRun({
            ...run,
            status: "failed",
            endedAt: new Date().toISOString(),
            exitCode: null,
            outputTail: "",
            rawOutput: "",
            errorReason: formatErrorReason(error)
          });

          updatedSession = this.sessionService.updateSession({
            ...updatedSession,
            status: "error",
            lastActiveAt: new Date().toISOString(),
            lastRunId: run.runId
          });

          throw error;
        }
      }, AgentBridgeService.EXECUTION_CONTEXT_LOCK_TIMEOUT_MS);
    });
  }

  public getSessionStatus(
    agentType: AgentType,
    platform: Session["platform"] = "slack",
    platformUserId = ""
  ): { session: Session | null; run: Run | null } {
    const session = this.sessionService.getPersistentSessionByScope(
      agentType,
      platform,
      platformUserId
    );
    if (!session) {
      return { session: null, run: null };
    }

    return {
      session,
      run: session.lastRunId ? this.sessionService.getRunById(session.lastRunId) : null
    };
  }

  public getPersistentSessionByThread(
    platform: Session["platform"],
    platformUserId: string,
    platformChannelId: string,
    platformThreadId: string
  ): Session | null {
    return this.sessionService.getPersistentSessionByThread(
      platform,
      platformUserId,
      platformChannelId,
      platformThreadId
    );
  }

  public restartSession(
    agentType: AgentType,
    cwd: string,
    platform: Session["platform"] = "slack",
    platformUserId = ""
  ): Session {
    return this.createOrResetPersistentSession(agentType, cwd, platform, platformUserId);
  }

  public switchSessionContext(sessionId: string, contextId: string): Session {
    return this.sessionService.switchExecutionContext(sessionId, contextId);
  }

  public listSelectableWorkspaces(): SelectableWorkspace[] {
    const workspaces = this.sessionService.listWorkspaces();
    if (workspaces.length > 0) {
      return workspaces.map((workspace) => ({
        rootPath: workspace.rootPath,
        label: path.basename(workspace.rootPath) || workspace.rootPath,
        kind: workspace.kind
      }));
    }

    return this.config.runtime.allowedCwds.map((cwd) => ({
      rootPath: cwd,
      label: path.basename(cwd) || cwd,
      kind: "plain_dir"
    }));
  }

  public interruptRun(runId: string): boolean {
    return this.processManager.interrupt(runId);
  }

  public async handleIncomingMessage(
    message: IncomingPlatformMessage
  ): Promise<MessageHandlingResult> {
    const parsed = parseIntent(message.rawText);

    if (message.platformThreadId) {
      const threadSession = this.getPersistentSessionByThread(
        message.platform,
        message.platformUserId,
        message.platformChannelId,
        message.platformThreadId
      );

      if (threadSession) {
        if (parsed.kind === "control") {
          return await this.handleSessionControlIntent(threadSession, parsed.intent);
        }

        const result = await this.sendToPersistentSession({
          agentType: threadSession.agentType,
          cwd: threadSession.cwd,
          message: buildPromptWithAttachments(message),
          platform: message.platform,
          platformChannelId: message.platformChannelId,
          platformThreadId: message.platformThreadId,
          platformUserId: message.platformUserId
        });

        return {
          kind: "execution",
          title: "Persistent Session Result",
          run: result.run,
          session: result.session
        };
      }
    }

    if (parsed.kind === "control") {
      if (parsed.intent.type === "interrupt") {
        const status = this.getSessionStatus(
          this.config.runtime.defaultAgent,
          message.platform,
          message.platformUserId
        );
        const runId = status.run?.runId ?? status.session?.lastRunId;
        const interrupted = runId ? this.interruptRun(runId) : false;

        return {
          kind: "info",
          text: interrupted ? "Interrupt requested." : "Run is no longer active.",
          session: status.session
        };
      }

      return {
        kind: "info",
        text: "This command only works inside an active thread session.",
        session: null
      };
    }

    const preferredAgent = this.config.runtime.defaultAgent;
    const prompt = buildPromptWithAttachments(message);
    const status = this.getSessionStatus(preferredAgent, message.platform, message.platformUserId);

    if (status.session) {
      const result = await this.sendToPersistentSession({
        agentType: preferredAgent,
        cwd: status.session.cwd,
        message: prompt,
        platform: message.platform,
        platformChannelId: message.platformChannelId,
        platformThreadId: message.platformThreadId,
        platformUserId: message.platformUserId
      });

      return {
        kind: "execution",
        title: "Persistent Session Result",
        run: result.run,
        session: result.session
      };
    }

    const defaultWorkspace = this.getDefaultWorkspaceSelection();
    const result = await this.runOnce({
      agentType: preferredAgent,
      cwd: defaultWorkspace?.workspace.rootPath ?? this.config.runtime.allowedCwds[0] ?? process.cwd(),
      message: prompt,
      platform: message.platform,
      platformChannelId: message.platformChannelId,
      platformThreadId: message.platformThreadId,
      platformUserId: message.platformUserId
    });

    return {
      kind: "execution",
      title: "Run Once Result",
      run: result.run,
      session: result.session
    };
  }

  private async handleSessionControlIntent(session: Session, intent: any): Promise<MessageHandlingResult> {
    if (intent.type === "interrupt") {
      const interrupted = session.lastRunId ? this.interruptRun(session.lastRunId) : false;
      return {
        kind: "info",
        text: interrupted ? "Interrupt requested." : "Run is no longer active.",
        session
      };
    }

    if (intent.type === "list_contexts") {
      return {
        kind: "info",
        text: this.formatContextList(session),
        session
      };
    }

    if (intent.type === "switch_context") {
      const switched = this.switchSessionContextBySelector(session, intent.selector);
      return {
        kind: "info",
        text: `Current context switched to ${switched.cwd}`,
        session: switched
      };
    }

    if (intent.type === "create_worktree") {
      const switched = this.createAndSwitchManagedWorktree(session, intent.name);
      return {
        kind: "info",
        text: `Managed worktree created and selected.\nCurrent context: ${switched.cwd}`,
        session: switched
      };
    }

    return {
      kind: "info",
      text: "Unsupported command.",
      session
    };
  }

  private formatContextList(session: Session): string {
    const currentContext = this.resolveSessionExecutionContext(session);
    const contexts = this.listSessionContexts(session);
    if (contexts.length === 0) {
      return "No execution contexts are available for this session.";
    }

    const lines = contexts.map((context) => {
      const label = context.kind === "main"
        ? "main"
        : (context.branch || path.basename(context.path) || context.path);
      const suffix = context.contextId === currentContext?.contextId ? " [current]" : "";
      return `- ${label}: ${context.path}${suffix}`;
    });

    return `Contexts:\n${lines.join("\n")}`;
  }

  private listSessionContexts(session: Session) {
    const workspace = session.workspaceId ? this.findWorkspaceById(session.workspaceId) : null;
    if (!workspace) {
      return [];
    }

    if (workspace.kind === "git_repo" && workspace.capabilities.worktreeCapable && this.gitContextService) {
      return this.gitContextService.listWorkspaceContexts(workspace);
    }

    const contexts = this.listExecutionContextsByWorkspaceId(workspace.workspaceId);
    if (contexts.length > 0) {
      return contexts;
    }

    return [this.ensureMainContextForWorkspace(workspace)];
  }

  private switchSessionContextBySelector(session: Session, selector: string): Session {
    const normalizedSelector = selector.trim().toLowerCase();
    const contexts = this.listSessionContexts(session);

    if (normalizedSelector === "main") {
      const main = contexts.find((context) => context.kind === "main");
      if (main) {
        return this.switchSessionContext(session.sessionId, main.contextId);
      }
    }

    const exactPath = contexts.find((context) => context.path.toLowerCase() === normalizedSelector);
    if (exactPath) {
      return this.switchSessionContext(session.sessionId, exactPath.contextId);
    }

    const exactBranch = contexts.find((context) => (context.branch ?? "").toLowerCase() === normalizedSelector);
    if (exactBranch) {
      return this.switchSessionContext(session.sessionId, exactBranch.contextId);
    }

    const exactBaseName = contexts.filter((context) => path.basename(context.path).toLowerCase() === normalizedSelector);
    if (exactBaseName.length === 1) {
      return this.switchSessionContext(session.sessionId, exactBaseName[0]!.contextId);
    }

    throw new Error(`Context '${selector}' was not found. Use /contexts to inspect available contexts.`);
  }

  private createAndSwitchManagedWorktree(session: Session, name: string): Session {
    if (!session.workspaceId) {
      throw new Error("This session is not bound to a workspace.");
    }

    const workspace = this.findWorkspaceById(session.workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${session.workspaceId} does not exist.`);
    }

    if (!this.gitContextService) {
      throw new Error("Managed worktree support is not configured.");
    }

    const created = this.gitContextService.createManagedWorktree(workspace, name);
    return this.switchSessionContext(session.sessionId, created.contextId);
  }

  private ensureAllowedCwd(cwd: string): string {
    if (!this.config.runtime.allowedCwds.includes(cwd)) {
      throw new Error(`CWD is not allowed: ${cwd}`);
    }

    return cwd;
  }

  private resolveExecutionTarget(cwd: string) {
    const resolver = (this.sessionService as SessionService & {
      resolveWorkspaceSelection?: (cwd: string) => ReturnType<SessionService["resolveWorkspaceSelection"]>;
    }).resolveWorkspaceSelection;

    return typeof resolver === "function" ? resolver.call(this.sessionService, cwd) : null;
  }

  private resolveSessionExecutionContext(session: Session) {
    const resolver = (this.sessionService as SessionService & {
      resolveSessionExecutionContext?: (
        session: Session
      ) => ReturnType<SessionService["resolveSessionExecutionContext"]>;
    }).resolveSessionExecutionContext;

    return typeof resolver === "function" ? resolver.call(this.sessionService, session) : null;
  }

  private getDefaultWorkspaceSelection() {
    const resolver = (this.sessionService as SessionService & {
      getDefaultWorkspaceSelection?: () => ReturnType<SessionService["getDefaultWorkspaceSelection"]>;
    }).getDefaultWorkspaceSelection;

    return typeof resolver === "function" ? resolver.call(this.sessionService) : null;
  }

  private findWorkspaceById(workspaceId: string) {
    const resolver = (this.sessionService as SessionService & {
      findWorkspaceById?: (workspaceId: string) => ReturnType<SessionService["findWorkspaceById"]>;
    }).findWorkspaceById;

    return typeof resolver === "function" ? resolver.call(this.sessionService, workspaceId) : null;
  }

  private listExecutionContextsByWorkspaceId(workspaceId: string) {
    const resolver = (this.sessionService as SessionService & {
      listExecutionContextsByWorkspaceId?: (workspaceId: string) => ReturnType<SessionService["listExecutionContextsByWorkspaceId"]>;
    }).listExecutionContextsByWorkspaceId;

    return typeof resolver === "function" ? resolver.call(this.sessionService, workspaceId) : [];
  }

  private ensureMainContextForWorkspace(workspace: NonNullable<ReturnType<SessionService["findWorkspaceById"]>>) {
    const resolver = (this.sessionService as SessionService & {
      ensureMainContextForWorkspace?: (
        workspace: NonNullable<ReturnType<SessionService["findWorkspaceById"]>>
      ) => ReturnType<SessionService["ensureMainContextForWorkspace"]>;
    }).ensureMainContextForWorkspace;

    if (typeof resolver !== "function") {
      throw new Error("Execution context support is not configured");
    }

    return resolver.call(this.sessionService, workspace);
  }

  private buildPersistentSessionLockKey(params: {
    agentType: AgentType;
    platform: Session["platform"];
    platformUserId: string;
    platformChannelId?: string;
    platformThreadId?: string | null;
  }): string {
    const resolver = (this.sessionService as SessionService & {
      buildPersistentSessionLockKey?: (
        params: {
          agentType: AgentType;
          platform: Session["platform"];
          platformUserId: string;
          platformChannelId?: string;
          platformThreadId?: string | null;
        }
      ) => ReturnType<SessionService["buildPersistentSessionLockKey"]>;
    }).buildPersistentSessionLockKey;

    if (typeof resolver === "function") {
      return resolver.call(this.sessionService, params);
    }

    if (params.platformThreadId && params.platformChannelId) {
      return `thread:${params.platform}:${params.platformUserId}:${params.platformChannelId}:${params.platformThreadId}`;
    }

    return `scope:${params.platform}:${params.platformUserId}:${params.agentType}`;
  }

  private buildExecutionContextLockKey(
    agentType: AgentType,
    contextId: string | null | undefined,
    cwd: string
  ): string {
    const resolver = (this.sessionService as SessionService & {
      buildExecutionContextLockKey?: (
        agentType: AgentType,
        contextId: string | null | undefined,
        cwd: string
      ) => ReturnType<SessionService["buildExecutionContextLockKey"]>;
    }).buildExecutionContextLockKey;

    return typeof resolver === "function"
      ? resolver.call(this.sessionService, agentType, contextId, cwd)
      : (contextId ? `context:${agentType}:${contextId}` : `cwd:${agentType}:${cwd}`);
  }

  private getExecutionTimeoutMs(): number {
    return Math.min(this.config.runtime.defaultTimeoutMs, AgentBridgeService.MAX_CONTEXT_LOCK_HOLD_MS);
  }

  private ensurePersistentSessionSupport(agentType: AgentType) {
    const agent = this.config.runtime.agents[agentType];
    if (!agent.resumeArgs) {
      throw new Error(`${agentType} persistent sessions are not configured yet`);
    }
  }
}

function buildPromptWithAttachments(message: IncomingPlatformMessage): string {
  if (!message.attachments || message.attachments.length === 0) {
    return message.rawText;
  }

  const imageLines = message.attachments
    .filter((attachment) => attachment.kind === "image")
    .map((attachment, index) => {
      const parts = [
        `Image ${index + 1}:`,
        attachment.name ? `name=${attachment.name}` : null,
        attachment.mimeType ? `mime=${attachment.mimeType}` : null,
        attachment.sourceUrl ? `source=${attachment.sourceUrl}` : null,
        attachment.platformFileId ? `fileId=${attachment.platformFileId}` : null,
        attachment.localPath ? `localPath=${attachment.localPath}` : null
      ].filter(Boolean);

      return parts.join(" ");
    });

  if (imageLines.length === 0) {
    return message.rawText;
  }

  return `${message.rawText}\n\nAttached images:\n${imageLines.join("\n")}`;
}

function formatErrorReason(error: unknown): string {
  if (error instanceof LockAcquisitionTimeoutError) {
    return "Execution context is busy with another run. Wait for it to finish or interrupt the active run.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown process execution error";
}
