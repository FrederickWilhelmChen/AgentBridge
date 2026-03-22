import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import { chooseFirstAvailable, commandExists, normalizePlatforms, normalizeYesNo, setEnvValue } from "./install-lib.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envExamplePath = path.join(rootDir, ".env.example");
const envPath = path.join(rootDir, ".env");

async function main() {
  console.log("AgentBridge installer");
  console.log("");

  ensureCommand("node");
  ensureCommand("npm");

  run("npm", ["install"], "Installing dependencies");

  await ensureLocalFiles();

  const rl = readline.createInterface({ input, output });

  try {
    let envContent = await fs.readFile(envPath, "utf8");

    const platformAnswer = await prompt(
      rl,
      "Platforms (slack,lark)",
      readCurrentValue(envContent, "AGENTBRIDGE_ENABLED_PLATFORMS") || "slack"
    );
    const enabledPlatforms = normalizePlatforms(platformAnswer);
    envContent = setEnvValue(envContent, "AGENTBRIDGE_ENABLED_PLATFORMS", enabledPlatforms.join(","));

    const defaultAgent = await prompt(
      rl,
      "Default agent (codex/claude)",
      readCurrentValue(envContent, "AGENTBRIDGE_DEFAULT_AGENT") || "codex"
    );
    envContent = setEnvValue(envContent, "AGENTBRIDGE_DEFAULT_AGENT", defaultAgent || "codex");

    const workspaceParents = await prompt(
      rl,
      "Workspace parent dirs to scan (checks the parent and its direct children), comma-separated",
      readCurrentValue(envContent, "AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS") || path.dirname(rootDir)
    );
    envContent = setEnvValue(
      envContent,
      "AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS",
      workspaceParents || path.dirname(rootDir)
    );

    const manualWorkspaces = await prompt(
      rl,
      "Manual plain workspaces, comma-separated (optional)",
      readCurrentValue(envContent, "AGENTBRIDGE_MANUAL_WORKSPACES") || ""
    );
    envContent = setEnvValue(envContent, "AGENTBRIDGE_MANUAL_WORKSPACES", manualWorkspaces);
    envContent = setEnvValue(envContent, "AGENTBRIDGE_ALLOWED_CWDS", "");

    const useProxy = normalizeYesNo(
      await prompt(
        rl,
        "Use HTTP(S) proxy? (y/N)",
        readCurrentValue(envContent, "AGENTBRIDGE_HTTP_PROXY") ? "y" : "n"
      ),
      false
    );
    if (useProxy) {
      const proxyUrl = await prompt(
        rl,
        "Proxy URL",
        readCurrentValue(envContent, "AGENTBRIDGE_HTTP_PROXY") || "http://127.0.0.1:10088"
      );
      envContent = setEnvValue(envContent, "AGENTBRIDGE_HTTP_PROXY", proxyUrl);
      envContent = setEnvValue(envContent, "AGENTBRIDGE_HTTPS_PROXY", proxyUrl);
    } else {
      envContent = setEnvValue(envContent, "AGENTBRIDGE_HTTP_PROXY", "");
      envContent = setEnvValue(envContent, "AGENTBRIDGE_HTTPS_PROXY", "");
    }

    const detectedClaude = chooseFirstAvailable(["claude", "E:/nodejs/claude.cmd"]);
    const claudeCommand = await prompt(
      rl,
      "Claude command",
      readCurrentValue(envContent, "AGENTBRIDGE_CLAUDE_COMMAND") || detectedClaude || "claude"
    );
    envContent = setEnvValue(envContent, "AGENTBRIDGE_CLAUDE_COMMAND", claudeCommand);

    envContent = setEnvValue(
      envContent,
      "AGENTBRIDGE_CODEX_COMMAND",
      readCurrentValue(envContent, "AGENTBRIDGE_CODEX_COMMAND") || "node"
    );

    if (enabledPlatforms.includes("slack")) {
      envContent = await configureSlack(rl, envContent);
    }

    if (enabledPlatforms.includes("lark")) {
      envContent = await configureLark(rl, envContent);
    }

    await fs.writeFile(envPath, envContent, "utf8");
    console.log(`\nSaved ${path.relative(rootDir, envPath)}`);

    run("npm", ["run", "doctor"], "Running doctor");

    const startNow = normalizeYesNo(await prompt(rl, "Start now? (y/N)", "n"), false);
    if (startNow) {
      run("npm", ["run", "dev"], "Starting AgentBridge");
    }
  } finally {
    rl.close();
  }
}

async function ensureLocalFiles() {
  await ensureExists(envExamplePath);
  try {
    await fs.access(envPath);
  } catch {
    await fs.copyFile(envExamplePath, envPath);
  }

  for (const name of [".logs", ".image-cache", ".tmp"]) {
    await fs.mkdir(path.join(rootDir, name), { recursive: true });
  }
}

async function configureSlack(rl, envContent) {
  let next = envContent;
  next = setEnvValue(
    next,
    "SLACK_BOT_TOKEN",
    await prompt(rl, "Slack bot token", readCurrentValue(next, "SLACK_BOT_TOKEN") || "")
  );
  next = setEnvValue(
    next,
    "SLACK_APP_TOKEN",
    await prompt(rl, "Slack app token", readCurrentValue(next, "SLACK_APP_TOKEN") || "")
  );
  next = setEnvValue(
    next,
    "SLACK_SIGNING_SECRET",
    await prompt(rl, "Slack signing secret", readCurrentValue(next, "SLACK_SIGNING_SECRET") || "")
  );
  next = setEnvValue(
    next,
    "SLACK_ALLOWED_USER_ID",
    await prompt(rl, "Slack allowed user id", readCurrentValue(next, "SLACK_ALLOWED_USER_ID") || "")
  );
  return next;
}

async function configureLark(rl, envContent) {
  let next = envContent;
  next = setEnvValue(
    next,
    "LARK_APP_ID",
    await prompt(rl, "Lark app id", readCurrentValue(next, "LARK_APP_ID") || "")
  );
  next = setEnvValue(
    next,
    "LARK_APP_SECRET",
    await prompt(rl, "Lark app secret", readCurrentValue(next, "LARK_APP_SECRET") || "")
  );
  next = setEnvValue(next, "LARK_ALLOWED_USER_ID", "");
  return next;
}

function ensureCommand(command) {
  if (!commandExists(command)) {
    throw new Error(`Required command not found: ${command}`);
  }
}

function run(command, args, title) {
  console.log(`\n${title}`);
  const isWin = process.platform === "win32";
  const [spawnCmd, spawnArgs] = isWin ? ["cmd", ["/c", command, ...args]] : [command, args];
  const result = spawnSync(spawnCmd, spawnArgs, {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} failed to spawn: ${result.error.message}`);
  }
  if (result.status !== 0 && result.status !== null) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

async function prompt(rl, label, fallback) {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || fallback;
}

function readCurrentValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match?.[1] ?? "";
}

async function ensureExists(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

main().catch((error) => {
  console.error(`\nInstall failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
