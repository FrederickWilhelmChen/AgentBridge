import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";
import type { Run, Session } from "../domain/models.js";
import { parseIntent } from "../intent/intent-router.js";
import type { IncomingPlatformMessage, MessageHandlingResult } from "../platform/types.js";
import { buildResumeProfile, buildRunOnceProfile } from "../runtime/agents.js";
import { RuntimeLocks } from "../runtime/locks.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { SessionService } from "./session-service.js";

export type RunExecutionResult = {
  run: Run;
  session: Session | null;
};

export class AgentBridgeService {
  private readonly locks = new RuntimeLocks();

  public constructor(
    private readonly config: AppConfig,
    private readonly sessionService: SessionService,
    private readonly processManager: ProcessManager
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
    const contextLockKey = this.buildExecutionContextLockKey(resolved?.context.contextId, executionCwd);

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

      const result = await this.processManager.run(
        run.runId,
        buildRunOnceProfile(this.config, params.agentType, executionCwd, params.message),
        this.config.runtime.defaultTimeoutMs
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
    });
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

        const result = await this.processManager.run(
          run.runId,
          profile,
          this.config.runtime.defaultTimeoutMs
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
      });
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

  public interruptRun(runId: string): boolean {
    return this.processManager.interrupt(runId);
  }

  public async handleIncomingMessage(
    message: IncomingPlatformMessage
  ): Promise<MessageHandlingResult> {
    if (message.platformThreadId) {
      const threadSession = this.getPersistentSessionByThread(
        message.platform,
        message.platformUserId,
        message.platformChannelId,
        message.platformThreadId
      );

      if (threadSession) {
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

    const parsed = parseIntent(message.rawText);

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

  private buildExecutionContextLockKey(contextId: string | null | undefined, cwd: string): string {
    const resolver = (this.sessionService as SessionService & {
      buildExecutionContextLockKey?: (
        contextId: string | null | undefined,
        cwd: string
      ) => ReturnType<SessionService["buildExecutionContextLockKey"]>;
    }).buildExecutionContextLockKey;

    return typeof resolver === "function"
      ? resolver.call(this.sessionService, contextId, cwd)
      : (contextId ? `context:${contextId}` : `cwd:${cwd}`);
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
