export const AGENT_TYPES = ["claude", "codex"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const SESSION_MODES = ["persistent", "oneshot"] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export const SESSION_STATUSES = ["idle", "running", "error"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const WORKSPACE_KINDS = ["git_repo", "plain_dir"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const WORKSPACE_SOURCES = ["manual", "marker_file", "scanned_git"] as const;
export type WorkspaceSource = (typeof WORKSPACE_SOURCES)[number];

export const EXECUTION_CONTEXT_KINDS = ["main"] as const;
export type ExecutionContextKind = (typeof EXECUTION_CONTEXT_KINDS)[number];

export const EXECUTION_CONTEXT_STATUSES = ["active"] as const;
export type ExecutionContextStatus = (typeof EXECUTION_CONTEXT_STATUSES)[number];

export const RUN_STATUSES = [
  "queued",
  "starting",
  "running",
  "finished",
  "failed",
  "interrupted",
  "timed_out"
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const ACTION_TYPES = [
  "create_session",
  "send_message",
  "run_once",
  "get_status",
  "interrupt_run",
  "restart_session",
  "set_cwd"
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];
