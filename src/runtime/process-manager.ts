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

  public async run(runId: string, profile: LaunchProfile, timeoutMs: number): Promise<RunResult> {
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
      timedOut: false
    };

    this.activeProcesses.set(runId, activeProcess);

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
        clearTimeout(activeProcess.timeout);
        this.activeProcesses.delete(runId);
        reject(error);
      });

      child.on("close", (exitCode) => {
        clearTimeout(activeProcess.timeout);
        this.activeProcesses.delete(runId);

        void finalizeRunResult({
          output,
          exitCode,
          profile,
          timedOut: activeProcess.timedOut,
          interrupted: activeProcess.interrupted,
          codexSnapshot
        }).then(resolve);
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

  try {
    const parsed = JSON.parse(output);
    return {
      text: typeof parsed.result === "string" ? parsed.result.trim() : output.trim(),
      providerSessionId: typeof parsed.session_id === "string" ? parsed.session_id : null
    };
  } catch {
    return {
      text: output.trim(),
      providerSessionId: null
    };
  }
}

function parseCodexOutput(output: string): { text: string; providerSessionId: string | null } {
  const normalized = output.replace(/\r/g, "");
  const sessionIdMatch = normalized.match(/session id:\s*([0-9a-f-]+)/i);
  const finalAnswerMatch = normalized.match(/\ncodex\s*\n([\s\S]*?)\n(tokens used|$)/i);

  if (finalAnswerMatch?.[1]) {
    return {
      text: finalAnswerMatch[1].trim(),
      providerSessionId: sessionIdMatch?.[1] ?? null
    };
  }

  const nonEmptyLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^20\d{2}-\d{2}-\d{2}t/i.test(line))
    .filter((line) => !/^OpenAI Codex v/i.test(line))
    .filter((line) => !/^workdir:/i.test(line))
    .filter((line) => !/^model:/i.test(line))
    .filter((line) => !/^provider:/i.test(line))
    .filter((line) => !/^approval:/i.test(line))
    .filter((line) => !/^sandbox:/i.test(line))
    .filter((line) => !/^reasoning /i.test(line))
    .filter((line) => !/^session id:/i.test(line))
    .filter((line) => !/^mcp startup:/i.test(line))
    .filter((line) => !/^warning:/i.test(line))
    .filter((line) => !/^reconnecting\.\.\./i.test(line))
    .filter((line) => !/^tokens used/i.test(line))
    .filter((line) => line !== "--------")
    .filter((line) => line !== "user")
    .filter((line) => line !== "codex");

  return {
    text: nonEmptyLines.at(-1) ?? normalized.trim(),
    providerSessionId: sessionIdMatch?.[1] ?? null
  };
}
