import type { AgentType, RunStatus, SessionMode, SessionStatus } from "./enums.js";

export type Session = {
  sessionId: string;
  agentType: AgentType;
  cwd: string;
  mode: SessionMode;
  status: SessionStatus;
  providerSessionId: string | null;
  createdAt: string;
  lastActiveAt: string;
  lastRunId: string | null;
};

export type Run = {
  runId: string;
  sessionId: string | null;
  agentType: AgentType;
  slackChannelId: string;
  slackThreadTs: string | null;
  inputText: string;
  status: RunStatus;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  outputTail: string;
  errorReason: string | null;
};
