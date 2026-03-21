type ControlIntent =
  | { type: "interrupt" };

type ParseIntentResult =
  | { kind: "control"; intent: ControlIntent }
  | { kind: "ai_prompt"; message: string };

const INTERRUPT_ALIASES = ["stop", "interrupt"];

export function parseIntent(input: string): ParseIntentResult {
  const message = input.trim();
  const normalized = normalizeText(message);

  if (isInterruptCommand(normalized)) {
    return {
      kind: "control",
      intent: { type: "interrupt" }
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

function isInterruptCommand(normalized: string): boolean {
  return INTERRUPT_ALIASES.some((alias) => normalized === alias);
}
