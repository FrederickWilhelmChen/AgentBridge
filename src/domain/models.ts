import type {
  AgentType,
  ExecutionContextKind,
  ExecutionContextStatus,
  RunStatus,
  SessionMode,
  SessionStatus,
  WorkspaceKind,
  WorkspaceSource
} from "./enums.js";

export type WorkspaceCapabilities = {
  gitCapable: boolean;
  worktreeCapable: boolean;
};

export type Workspace = {
  workspaceId: string;
  rootPath: string;
  kind: WorkspaceKind;
  source: WorkspaceSource;
  capabilities: WorkspaceCapabilities;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type ExecutionContext = {
  contextId: string;
  workspaceId: string;
  kind: ExecutionContextKind;
  path: string;
  managed: boolean;
  status: ExecutionContextStatus;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  sessionId: string;
  agentType: AgentType;
  cwd: string;
  mode: SessionMode;
  status: SessionStatus;
  providerSessionId: string | null;
  platform: "slack" | "lark";
  platformChannelId: string;
  platformThreadId: string | null;
  platformUserId: string;
  createdAt: string;
  lastActiveAt: string;
  lastRunId: string | null;
};

export type Run = {
  runId: string;
  sessionId: string | null;
  agentType: AgentType;
  platform: "slack" | "lark";
  platformChannelId: string;
  platformThreadId: string | null;
  platformUserId: string;
  inputText: string;
  status: RunStatus;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  outputTail: string;
  rawOutput: string;
  errorReason: string | null;
};
