import { spawn } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { detectWindowsProxy, normalizeProxyUrl } from "./config.js";

async function main() {
  loadEnv();

  const httpProxy = normalizeProxyUrl(process.env.AGENTBRIDGE_HTTP_PROXY ?? process.env.HTTP_PROXY ?? detectWindowsProxy());
  const httpsProxy = normalizeProxyUrl(process.env.AGENTBRIDGE_HTTPS_PROXY ?? process.env.HTTPS_PROXY ?? detectWindowsProxy());
  const dbPath = process.env.AGENTBRIDGE_DB_PATH ?? "./agentbridge.db";
  const allowedUserId = process.env.SLACK_ALLOWED_USER_ID ?? "(unset)";
  const allowedCwds = process.env.AGENTBRIDGE_ALLOWED_CWDS ?? "(unset)";
  const claudeCommand = process.env.AGENTBRIDGE_CLAUDE_COMMAND ?? "claude";
  const codexCommand = process.env.AGENTBRIDGE_CODEX_COMMAND ?? "node";

  console.log("AgentBridge doctor");
  console.log("");
  console.log(`Database: ${dbPath}`);
  console.log(`Allowed user: ${allowedUserId}`);
  console.log(`Allowed CWDs: ${allowedCwds}`);
  console.log(`HTTP proxy: ${httpProxy ?? "(none)"}`);
  console.log(`HTTPS proxy: ${httpsProxy ?? "(none)"}`);
  console.log("");

  for (const [agentType, command] of [
    ["claude", claudeCommand],
    ["codex", codexCommand]
  ] as const) {
    const result = await probeCommand(command);
    console.log(`[${agentType}] command=${command}`);
    console.log(`  reachable: ${result.ok ? "yes" : "no"}`);
    if (!result.ok) {
      console.log(`  error: ${result.error}`);
    }
  }
}

async function probeCommand(command: string): Promise<{ ok: boolean; error?: string }> {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
