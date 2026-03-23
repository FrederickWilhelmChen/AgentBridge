import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Logger } from "pino";
import type { LaunchProfile } from "./agents.js";
import { captureCodexState, discoverCodexSessionId } from "./codex-state.js";

export type RunResult = {
  exitCode: number | null;
  status: "finished" | "failed" | "interrupted" | "timed_out";
  output: string;
  parsedOutput: string;
  providerSessionId: string | null;
  errorReason: string | null;
};

type ActiveProcess = {
  process: ChildProcessWithoutNullStreams;
  timeout: NodeJS.Timeout;
  interrupted: boolean;
  timedOut: boolean;
  settled: boolean;
};

export class ProcessManager {
  private readonly activeProcesses = new Map<string, ActiveProcess>();

  public constructor(
    private readonly logger: Logger,
    private readonly proxyConfig?: {
      httpProxy: string | null;
      httpsProxy: string | null;
    }
  ) {}

  public async run(
    runId: string,
    profile: LaunchProfile,
    timeoutMs: number,
    options?: {
      onSpawn?: (pid: number | null) => void;
    }
  ): Promise<RunResult> {
    const codexSnapshot = profile.outputMode === "codex_text"
      ? await captureCodexState()
      : null;

    const child = spawn(profile.command, profile.args, {
      cwd: profile.cwd,
      stdio: "pipe",
      shell: profile.shell,
      env: {
        ...process.env,
        ...(this.proxyConfig?.httpProxy ? { HTTP_PROXY: this.proxyConfig.httpProxy } : {}),
        ...(this.proxyConfig?.httpsProxy ? { HTTPS_PROXY: this.proxyConfig.httpsProxy } : {})
      }
    });

    let output = "";

    const activeProcess: ActiveProcess = {
      process: child,
      timeout: setTimeout(() => {
        this.logger.warn({ runId, pid: child.pid }, "Run timed out");
        activeProcess.timedOut = true;
        child.kill();
      }, timeoutMs),
      interrupted: false,
      timedOut: false,
      settled: false
    };

    this.activeProcesses.set(runId, activeProcess);
    options?.onSpawn?.(child.pid ?? null);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });

    child.stdin.write(profile.input);
    child.stdin.end();

    return await new Promise<RunResult>((resolve, reject) => {
      child.on("error", (error) => {
        if (activeProcess.settled) {
          return;
        }

        activeProcess.settled = true;
        clearTimeout(activeProcess.timeout);
        this.activeProcesses.delete(runId);
        reject(error);
      });

      child.on("close", (exitCode) => {
        if (activeProcess.settled) {
          return;
        }

        activeProcess.settled = true;
        clearTimeout(activeProcess.timeout);
        this.activeProcesses.delete(runId);

        void finalizeRunResult({
          output,
          exitCode,
          profile,
          timedOut: activeProcess.timedOut,
          interrupted: activeProcess.interrupted,
          codexSnapshot
        }).then(resolve).catch(reject);
      });
    });
  }

  public interrupt(runId: string): boolean {
    const active = this.activeProcesses.get(runId);
    if (!active) {
      return false;
    }

    active.interrupted = true;
    active.process.kill();
    return true;
  }

  public shutdown(): void {
    for (const [runId, active] of this.activeProcesses.entries()) {
      this.logger.info({ runId, pid: active.process.pid }, "Stopping active process during shutdown");
      active.interrupted = true;
      clearTimeout(active.timeout);
      active.process.kill();
    }

    this.activeProcesses.clear();
  }
}

async function finalizeRunResult(args: {
  output: string;
  exitCode: number | null;
  profile: LaunchProfile;
  timedOut: boolean;
  interrupted: boolean;
  codexSnapshot: Awaited<ReturnType<typeof captureCodexState>> | null;
}): Promise<RunResult> {
  const parsed = parseOutput(args.output, args.profile.outputMode);
  const status = args.timedOut
    ? "timed_out"
    : args.interrupted
      ? "interrupted"
      : args.exitCode === 0
        ? "finished"
        : "failed";

  const providerSessionId = parsed.providerSessionId
    ?? (args.profile.outputMode === "codex_text" && args.codexSnapshot
      ? await discoverCodexSessionId(args.codexSnapshot)
      : null);

  return {
    exitCode: args.exitCode,
    status,
    output: args.output,
    parsedOutput: parsed.text,
    providerSessionId,
    errorReason: status === "failed" ? `Process exited with code ${args.exitCode}` : null
  };
}

function parseOutput(
  output: string,
  outputMode: "text" | "claude_json" | "codex_text"
): { text: string; providerSessionId: string | null } {
  if (outputMode === "text") {
    return {
      text: output.trim(),
      providerSessionId: null
    };
  }

  if (outputMode === "codex_text") {
    return parseCodexOutput(output);
  }

  return parseClaudeOutput(output);
}

function parseClaudeOutput(output: string): { text: string; providerSessionId: string | null } {
  const trimmed = output.trim();
  if (!trimmed) {
    return {
      text: "Claude returned no structured output.",
      providerSessionId: null
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const text = extractClaudeDisplayText(parsed);
    return {
      text,
      providerSessionId: typeof parsed.session_id === "string" ? parsed.session_id : null
    };
  } catch {
    return {
      text: trimmed,
      providerSessionId: null
    };
  }
}

function parseCodexOutput(output: string): { text: string; providerSessionId: string | null } {
  const normalized = output.replace(/\r/g, "");
  const sessionIdMatch = normalized.match(/session id:\s*([0-9a-f-]+)/i);
  const extracted = extractDisplayTextFromCodex(normalized);

  return {
    text: extracted,
    providerSessionId: sessionIdMatch?.[1] ?? null
  };
}

function extractDisplayTextFromCodex(output: string): string {
  const codexBlocks = output
    .split(/\ncodex\s*\n/i)
    .slice(1)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => trimTrailingNoise(block))
    .filter(Boolean);

  if (codexBlocks.length > 0) {
    return codexBlocks.at(-1) ?? output.trim();
  }

  const blocks = output
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isNoiseBlock(block))
    .sort((left, right) => scoreCandidate(right) - scoreCandidate(left));

  return blocks[0] ?? output.trim();
}

function trimTrailingNoise(block: string): string {
  const lines = block
    .split("\n")
    .map((line) => line.trimEnd());

  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (kept.length > 0 && kept.at(-1) !== "") {
        kept.push("");
      }
      continue;
    }

    if (isNoiseLine(trimmed)) {
      break;
    }

    kept.push(trimmed);
  }

  return kept.join("\n").trim();
}

function isNoiseBlock(block: string): boolean {
  const compact = block.trim();
  if (!compact) {
    return true;
  }

  const lines = compact.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return true;
  }

  if (lines.every((line) => isNoiseLine(line))) {
    return true;
  }

  const first = lines[0] ?? "";
  return /^(exec|succeeded in|rejected:|OpenAI Codex v|tokens used|name:|description:|---$)/i.test(first);
}

function isNoiseLine(line: string): boolean {
  return (
    /^20\d{2}-\d{2}-\d{2}t/i.test(line)
    || /^OpenAI Codex v/i.test(line)
    || /^workdir:/i.test(line)
    || /^model:/i.test(line)
    || /^provider:/i.test(line)
    || /^approval:/i.test(line)
    || /^sandbox:/i.test(line)
    || /^reasoning /i.test(line)
    || /^session id:/i.test(line)
    || /^mcp startup:/i.test(line)
    || /^warning:/i.test(line)
    || /^reconnecting\.\.\./i.test(line)
    || /^tokens used/i.test(line)
    || /^exec$/i.test(line)
    || /^succeeded in /i.test(line)
    || /^exited -?\d+/i.test(line)
    || /^rejected:/i.test(line)
    || /^name:/i.test(line)
    || /^description:/i.test(line)
    || line === "--------"
    || line === "user"
    || line === "codex"
    || line === "---"
    || /^[A-Z]:\\/.test(line)
    || /^".*"\s+in\s+[A-Z]:\\/i.test(line)
    || /^\/[^\s]+/.test(line)
    || /^".*"\s+"\/.*"/.test(line)
    || /^in\s+\/.+\s+succeeded in /i.test(line)
  );
}

function scoreCandidate(block: string): number {
  let score = 0;

  if (/[。！？.!?]/.test(block)) {
    score += 3;
  }

  if (/\b(我会|当前|已经|可以|建议|first|current|will|recommend)\b/i.test(block)) {
    score += 2;
  }

  if (block.length > 20) {
    score += 2;
  }

  if (/\n/.test(block)) {
    score += 1;
  }

  if (/^(exec|rejected:|succeeded in)/im.test(block)) {
    score -= 5;
  }

  if (/[A-Z]:\\/.test(block)) {
    score -= 1;
  }

  if (/(^|\n)(\/|".*"\s+"\/)/.test(block)) {
    score -= 1;
  }

  return score;
}

export function parseCodexOutputForTest(output: string): { text: string; providerSessionId: string | null } {
  return parseCodexOutput(output);
}

function extractClaudeDisplayText(parsed: Record<string, unknown>): string {
  const directCandidates = [
    parsed.result,
    parsed.message,
    parsed.output
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  if (Array.isArray(parsed.content)) {
    const combined = parsed.content
      .flatMap((item) => {
        if (typeof item === "string") {
          return [item.trim()];
        }

        if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
          return [item.text.trim()];
        }

        return [];
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();

    if (combined) {
      return combined;
    }
  }

  const subtype = typeof parsed.subtype === "string" ? parsed.subtype : "unknown";
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  const errorSummary = errors.length > 0 ? ` errors=${JSON.stringify(errors)}` : "";
  return `Claude returned no final text result (subtype=${subtype}).${errorSummary}`;
}

export function parseClaudeOutputForTest(output: string): { text: string; providerSessionId: string | null } {
  return parseClaudeOutput(output);
}
