import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";
import type { Run, Session } from "../domain/models.js";
import { buildResumeProfile, buildRunOnceProfile } from "../runtime/agents.js";
import { ProcessManager } from "../runtime/process-manager.js";
import { SessionService } from "./session-service.js";

export type RunExecutionResult = {
  run: Run;
  session: Session | null;
};

export class AgentBridgeService {
  public constructor(
    private readonly config: AppConfig,
    private readonly sessionService: SessionService,
    private readonly processManager: ProcessManager
  ) {}

  public async runOnce(params: {
    agentType: AgentType;
    cwd: string;
    message: string;
    slackChannelId: string;
    slackThreadTs?: string | null;
  }): Promise<RunExecutionResult> {
    this.ensureAllowedCwd(params.cwd);

    let run = this.sessionService.createRun({
      sessionId: null,
      agentType: params.agentType,
      slackChannelId: params.slackChannelId,
      slackThreadTs: params.slackThreadTs ?? null,
      inputText: params.message
    });

    run = this.sessionService.updateRun({
      ...run,
      status: "starting"
    });

    const result = await this.processManager.run(
      run.runId,
      buildRunOnceProfile(this.config, params.agentType, params.cwd, params.message),
      this.config.runtime.defaultTimeoutMs
    );

    run = this.sessionService.updateRun({
      ...run,
      status: result.status,
      endedAt: new Date().toISOString(),
      exitCode: result.exitCode,
      outputTail: result.parsedOutput,
      errorReason: result.errorReason
    });

    return {
      run,
      session: null
    };
  }

  public createOrResetPersistentSession(agentType: AgentType, cwd: string): Session {
    this.ensurePersistentSessionSupport(agentType);
    this.ensureAllowedCwd(cwd);
    const existing = this.sessionService.getPersistentSessionByAgent(agentType);
    if (!existing) {
      return this.sessionService.createPersistentSession(agentType, cwd);
    }

    return this.sessionService.updateSession({
      ...existing,
      cwd,
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
    slackChannelId: string;
    slackThreadTs?: string | null;
  }): Promise<RunExecutionResult> {
    this.ensurePersistentSessionSupport(params.agentType);
    this.ensureAllowedCwd(params.cwd);

    let session = this.sessionService.getOrCreatePersistentSession(params.agentType, params.cwd);
    let run = this.sessionService.createRun({
      sessionId: session.sessionId,
      agentType: params.agentType,
      slackChannelId: params.slackChannelId,
      slackThreadTs: params.slackThreadTs ?? null,
      inputText: params.message
    });

    session = this.sessionService.updateSession({
      ...session,
      cwd: params.cwd,
      status: "running",
      lastActiveAt: new Date().toISOString(),
      lastRunId: run.runId
    });

    run = this.sessionService.updateRun({
      ...run,
      status: "starting"
    });

    const profile = session.providerSessionId
      ? buildResumeProfile(
          this.config,
          params.agentType,
          params.cwd,
          params.message,
          session.providerSessionId
        )
      : buildRunOnceProfile(this.config, params.agentType, params.cwd, params.message);

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
      errorReason: result.errorReason
    });

    session = this.sessionService.updateSession({
      ...session,
      status: result.status === "finished" ? "idle" : "error",
      providerSessionId: result.providerSessionId ?? session.providerSessionId,
      lastActiveAt: new Date().toISOString(),
      lastRunId: run.runId
    });

    return {
      run,
      session
    };
  }

  public getSessionStatus(agentType: AgentType): { session: Session | null; run: Run | null } {
    const session = this.sessionService.getPersistentSessionByAgent(agentType);
    if (!session) {
      return { session: null, run: null };
    }

    return {
      session,
      run: session.lastRunId ? this.sessionService.getRunById(session.lastRunId) : null
    };
  }

  public restartSession(agentType: AgentType, cwd: string): Session {
    return this.createOrResetPersistentSession(agentType, cwd);
  }

  public interruptRun(runId: string): boolean {
    return this.processManager.interrupt(runId);
  }

  private ensureAllowedCwd(cwd: string) {
    if (!this.config.runtime.allowedCwds.includes(cwd)) {
      throw new Error(`CWD is not allowed: ${cwd}`);
    }
  }

  private ensurePersistentSessionSupport(agentType: AgentType) {
    const agent = this.config.runtime.agents[agentType];
    if (!agent.resumeArgs) {
      throw new Error(`${agentType} persistent sessions are not configured yet`);
    }
  }
}
