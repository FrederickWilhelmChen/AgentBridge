import path from "node:path";
import type { AgentType } from "../domain/enums.js";

type ControlIntent =
  | { type: "status"; agentType?: AgentType }
  | { type: "new_session"; agentType?: AgentType }
  | { type: "restart_session"; agentType?: AgentType }
  | { type: "interrupt"; agentType?: AgentType }
  | { type: "set_cwd"; cwd: string; agentType?: AgentType };

type ParseIntentResult =
  | { kind: "control"; intent: ControlIntent }
  | { kind: "ai_prompt"; message: string; agentType?: AgentType };

type ParseIntentOptions = {
  allowedCwds?: string[];
};

const STATUS_ALIASES = ["status"];
const NEW_SESSION_ALIASES = ["new session", "new"];
const RESTART_ALIASES = ["restart", "reset"];
const INTERRUPT_ALIASES = ["stop", "interrupt"];
const CODEX_ALIASES = ["codex"];
const CLAUDE_ALIASES = ["claude"];
const SET_CWD_HINTS = ["switch to", "change to", "cd ", "切到", "切换到"];
const ABSOLUTE_CWD_PATTERN = /(?:[A-Za-z]:\/|\/)[^\s"',，。！？]*/;

export function parseIntent(input: string, options: ParseIntentOptions = {}): ParseIntentResult {
  const message = input.trim();
  const normalized = normalizeText(message);
  const compact = compactText(message);
  const agentType = extractAgentType(normalized);
  const cwd = extractCwd(message) ?? matchAllowedCwd(compact, options.allowedCwds ?? []);

  if (cwd && looksLikeCwdCommand(normalized, compact, options.allowedCwds ?? [])) {
    return {
      kind: "control",
      intent: {
        type: "set_cwd",
        cwd,
        ...(agentType ? { agentType } : {})
      }
    };
  }

  if (isStatusCommand(normalized)) {
    return {
      kind: "control",
      intent: {
        type: "status",
        ...(agentType ? { agentType } : {})
      }
    };
  }

  if (isNewSessionCommand(normalized)) {
    return {
      kind: "control",
      intent: {
        type: "new_session",
        ...(agentType ? { agentType } : {})
      }
    };
  }

  if (isRestartCommand(normalized)) {
    return {
      kind: "control",
      intent: {
        type: "restart_session",
        ...(agentType ? { agentType } : {})
      }
    };
  }

  if (isInterruptCommand(normalized)) {
    return {
      kind: "control",
      intent: {
        type: "interrupt",
        ...(agentType ? { agentType } : {})
      }
    };
  }

  return {
    kind: "ai_prompt",
    message,
    ...(agentType ? { agentType } : {})
  };
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function compactText(input: string): string {
  return input.replace(/\s+/g, "").trim().toLowerCase();
}

function extractAgentType(normalized: string): AgentType | undefined {
  if (CODEX_ALIASES.some((alias) => normalized.includes(alias))) {
    return "codex";
  }

  if (CLAUDE_ALIASES.some((alias) => normalized.includes(alias))) {
    return "claude";
  }

  return undefined;
}

function extractCwd(input: string): string | undefined {
  const match = input.match(ABSOLUTE_CWD_PATTERN);
  return match?.[0];
}

function matchAllowedCwd(compact: string, allowedCwds: string[]): string | undefined {
  return allowedCwds.find((cwd) => {
    const basename = path.basename(cwd).toLowerCase();
    return compact.includes(basename);
  });
}

function looksLikeCwdCommand(normalized: string, compact: string, allowedCwds: string[]): boolean {
  if (extractCwd(normalized)) {
    return true;
  }

  return SET_CWD_HINTS.some((hint) => normalized.includes(hint))
    || allowedCwds.some((cwd) => compact.includes(path.basename(cwd).toLowerCase()));
}

function isStatusCommand(normalized: string): boolean {
  return STATUS_ALIASES.includes(normalized);
}

function isNewSessionCommand(normalized: string): boolean {
  return NEW_SESSION_ALIASES.some((alias) => normalized === alias || normalized.includes(alias));
}

function isRestartCommand(normalized: string): boolean {
  return RESTART_ALIASES.some((alias) => normalized.includes(alias)) && normalized.includes("session");
}

function isInterruptCommand(normalized: string): boolean {
  return INTERRUPT_ALIASES.some((alias) => normalized === alias || normalized.includes(alias));
}
