import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { detectWindowsProxy, normalizeProxyUrl } from "./config.js";

type ProbeResult = { ok: boolean; error?: string };

export type DoctorReport = {
  gitAvailable: boolean;
  repoScanningEnabled: boolean;
  lines: string[];
  output: string;
};

export type DoctorDeps = {
  env?: NodeJS.ProcessEnv;
  probeGit?: () => Promise<ProbeResult>;
  probeCommand?: (command: string) => Promise<ProbeResult>;
  scanWorkspaceParents?: (workspaceParents: string[]) => Promise<string[]>;
};

export async function buildDoctorReport(deps: DoctorDeps = {}): Promise<DoctorReport> {
  const env = deps.env ?? process.env;
  const httpProxy = normalizeProxyUrl(env.AGENTBRIDGE_HTTP_PROXY ?? env.HTTP_PROXY ?? detectWindowsProxy());
  const httpsProxy = normalizeProxyUrl(env.AGENTBRIDGE_HTTPS_PROXY ?? env.HTTPS_PROXY ?? detectWindowsProxy());
  const dbPath = env.AGENTBRIDGE_DB_PATH ?? "./agentbridge.db";
  const allowedUserId = env.SLACK_ALLOWED_USER_ID ?? "(unset)";
  const workspaceParents = parsePathList(env.AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS);
  const manualWorkspaces = parsePathList(env.AGENTBRIDGE_MANUAL_WORKSPACES);
  const claudeCommand = env.AGENTBRIDGE_CLAUDE_COMMAND ?? "claude";
  const codexCommand = env.AGENTBRIDGE_CODEX_COMMAND ?? "node";
  const probeGit = deps.probeGit ?? probeGitAvailability;
  const probeCommand = deps.probeCommand ?? probeAgentCommand;
  const scanWorkspaceParents = deps.scanWorkspaceParents;

  const lines: string[] = [];
  const push = (line = "") => {
    lines.push(line);
  };

  push("AgentBridge doctor");
  push("");
  push(`Database: ${dbPath}`);
  push(`Allowed user: ${allowedUserId}`);
  push(`Workspace parents: ${formatList(workspaceParents)}`);
  push(`Manual workspaces: ${formatList(manualWorkspaces)}`);
  push(`HTTP proxy: ${httpProxy ?? "(none)"}`);
  push(`HTTPS proxy: ${httpsProxy ?? "(none)"}`);
  push("");

  const gitProbe = await probeGit();
  const gitAvailable = gitProbe.ok;
  const repoScanningEnabled = gitAvailable;

  if (gitAvailable) {
    push("Git: available");
    if (workspaceParents.length > 0 && scanWorkspaceParents) {
      await scanWorkspaceParents(workspaceParents);
    }
  } else {
    push("Git not found. Repository discovery and worktree features are disabled. Plain workspaces remain available.");
  }

  push("");

  for (const [agentType, command] of [
    ["claude", claudeCommand],
    ["codex", codexCommand]
  ] as const) {
    const result = await probeCommand(command);
    push(`[${agentType}] command=${command}`);
    push(`  reachable: ${result.ok ? "yes" : "no"}`);
    if (!result.ok) {
      push(`  error: ${result.error}`);
    }
  }

  return {
    gitAvailable,
    repoScanningEnabled,
    lines,
    output: lines.join("\n")
  };
}

async function main() {
  loadEnv();

  const report = await buildDoctorReport();
  for (const line of report.lines) {
    console.log(line);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function probeGitAvailability(): Promise<ProbeResult> {
  return await new Promise((resolve) => {
    const child = spawn("git", ["--version"], {
      shell: true,
      stdio: "ignore"
    });

    child.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }

      resolve({
        ok: false,
        error: `Exited with code ${code}`
      });
    });
  });
}

async function probeAgentCommand(command: string): Promise<ProbeResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, ["--help"], {
      shell: true,
      stdio: "ignore"
    });

    child.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }

      resolve({
        ok: false,
        error: `Exited with code ${code}`
      });
    });
  });
}

function parsePathList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part);
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(unset)";
}
