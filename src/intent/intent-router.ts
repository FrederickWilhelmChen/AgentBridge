type ControlIntent =
  | { type: "interrupt" }
  | { type: "list_contexts" }
  | { type: "switch_context"; selector: string }
  | { type: "create_worktree"; name: string };

type ParseIntentResult =
  | { kind: "control"; intent: ControlIntent }
  | { kind: "ai_prompt"; message: string };

export function parseIntent(input: string): ParseIntentResult {
  const message = input.trim();
  const normalized = normalizeText(message);
  const slashCommand = parseSlashCommand(message);

  if (slashCommand) {
    return {
      kind: "control",
      intent: slashCommand
    };
  }

  return {
    kind: "ai_prompt",
    message
  };
}

function normalizeText(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseSlashCommand(input: string): ControlIntent | null {
  const prefix = input[0];
  if (prefix !== "/" && prefix !== ".") {
    return null;
  }

  const normalized = normalizeText(input.slice(1));
  if (!normalized) {
    return null;
  }

  if (normalized === "stop" || normalized === "interrupt") {
    return { type: "interrupt" };
  }

  if (normalized === "contexts") {
    return { type: "list_contexts" };
  }

  if (normalized === "context main") {
    return { type: "switch_context", selector: "main" };
  }

  if (normalized.startsWith("context switch ")) {
    const selector = input.slice(input.toLowerCase().indexOf("/context switch ") + "/context switch ".length).trim();
    return selector ? { type: "switch_context", selector } : null;
  }

  if (normalized.startsWith("worktree create ")) {
    const name = input.slice(input.toLowerCase().indexOf("/worktree create ") + "/worktree create ".length).trim();
    return name ? { type: "create_worktree", name } : null;
  }

  return null;
}
