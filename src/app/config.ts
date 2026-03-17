import path from "node:path";
import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { AgentType } from "../domain/enums.js";

loadEnv();

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.string(),
  resumeArgs: z.string().optional(),
  outputMode: z.enum(["text", "claude_json", "codex_text"]).default("text")
});

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_ALLOWED_USER_ID: z.string().min(1),
  AGENTBRIDGE_DB_PATH: z.string().min(1).default("./agentbridge.db"),
  AGENTBRIDGE_ALLOWED_CWDS: z.string().min(1),
  AGENTBRIDGE_DEFAULT_AGENT: z.enum(["claude", "codex"]).default("codex"),
  AGENTBRIDGE_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  AGENTBRIDGE_HTTP_PROXY: z.string().optional(),
  AGENTBRIDGE_HTTPS_PROXY: z.string().optional(),
  AGENTBRIDGE_CLAUDE_COMMAND: z.string().min(1).default("claude"),
  AGENTBRIDGE_CLAUDE_ARGS: z.string().default("-p --output-format json"),
  AGENTBRIDGE_CLAUDE_RESUME_ARGS: z.string().default("-p --output-format json -r {sessionId}"),
  AGENTBRIDGE_CLAUDE_OUTPUT_MODE: z.enum(["text", "claude_json"]).default("claude_json"),
  AGENTBRIDGE_CODEX_COMMAND: z.string().min(1).default("node"),
  AGENTBRIDGE_CODEX_ARGS: z.string().default("node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -"),
  AGENTBRIDGE_CODEX_RESUME_ARGS: z.string().default("node_modules/@openai/codex/bin/codex.js exec resume {sessionId} -"),
  AGENTBRIDGE_CODEX_OUTPUT_MODE: z.enum(["text", "claude_json", "codex_text"]).default("codex_text")
});

function splitArgs(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildAgentCommand(agentType: AgentType) {
  const parsed = parseEnv();
  const raw = agentType === "claude"
    ? {
        command: parsed.AGENTBRIDGE_CLAUDE_COMMAND,
        args: parsed.AGENTBRIDGE_CLAUDE_ARGS,
        resumeArgs: parsed.AGENTBRIDGE_CLAUDE_RESUME_ARGS,
        outputMode: parsed.AGENTBRIDGE_CLAUDE_OUTPUT_MODE
      }
    : {
        command: parsed.AGENTBRIDGE_CODEX_COMMAND,
        args: parsed.AGENTBRIDGE_CODEX_ARGS,
        resumeArgs: parsed.AGENTBRIDGE_CODEX_RESUME_ARGS,
        outputMode: parsed.AGENTBRIDGE_CODEX_OUTPUT_MODE
      };

  return commandSchema.parse(raw);
}

export type AppConfig = {
  slack: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    allowedUserId: string;
  };
  database: {
    path: string;
  };
  runtime: {
    allowedCwds: string[];
    defaultAgent: "claude" | "codex";
    defaultTimeoutMs: number;
    httpProxy: string | null;
    httpsProxy: string | null;
    agents: Record<
      AgentType,
      {
        command: string;
        args: string[];
        resumeArgs: string[] | null;
        outputMode: "text" | "claude_json" | "codex_text";
      }
    >;
  };
};

export function loadConfig(): AppConfig {
  const parsed = parseEnv();
  const claudeAgent = buildAgentCommand("claude");
  const codexAgent = buildAgentCommand("codex");
  const detectedWindowsProxy = detectWindowsProxy();
  const httpProxy = normalizeProxyUrl(parsed.AGENTBRIDGE_HTTP_PROXY ?? detectedWindowsProxy);
  const httpsProxy = normalizeProxyUrl(parsed.AGENTBRIDGE_HTTPS_PROXY ?? detectedWindowsProxy);

  return {
    slack: {
      botToken: parsed.SLACK_BOT_TOKEN,
      appToken: parsed.SLACK_APP_TOKEN,
      signingSecret: parsed.SLACK_SIGNING_SECRET,
      allowedUserId: parsed.SLACK_ALLOWED_USER_ID
    },
    database: {
      path: path.resolve(parsed.AGENTBRIDGE_DB_PATH)
    },
    runtime: {
      allowedCwds: parsed.AGENTBRIDGE_ALLOWED_CWDS.split(",")
        .map((cwd) => cwd.trim())
        .filter(Boolean)
        .map((cwd) => path.resolve(cwd)),
      defaultAgent: parsed.AGENTBRIDGE_DEFAULT_AGENT,
      defaultTimeoutMs: parsed.AGENTBRIDGE_DEFAULT_TIMEOUT_MS,
      httpProxy,
      httpsProxy,
      agents: {
        claude: {
          command: claudeAgent.command,
          args: splitArgs(claudeAgent.args),
          resumeArgs: claudeAgent.resumeArgs
            ? splitArgs(claudeAgent.resumeArgs)
            : null,
          outputMode: claudeAgent.outputMode
        },
        codex: {
          command: codexAgent.command,
          args: splitArgs(codexAgent.args),
          resumeArgs: codexAgent.resumeArgs
            ? splitArgs(codexAgent.resumeArgs)
            : null,
          outputMode: codexAgent.outputMode
        }
      }
    }
  };
}

function parseEnv() {
  return envSchema.parse({
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
    SLACK_ALLOWED_USER_ID: process.env.SLACK_ALLOWED_USER_ID,
    AGENTBRIDGE_DB_PATH: process.env.AGENTBRIDGE_DB_PATH,
    AGENTBRIDGE_ALLOWED_CWDS: process.env.AGENTBRIDGE_ALLOWED_CWDS,
    AGENTBRIDGE_DEFAULT_AGENT: process.env.AGENTBRIDGE_DEFAULT_AGENT,
    AGENTBRIDGE_DEFAULT_TIMEOUT_MS: process.env.AGENTBRIDGE_DEFAULT_TIMEOUT_MS,
    AGENTBRIDGE_HTTP_PROXY: process.env.AGENTBRIDGE_HTTP_PROXY ?? process.env.HTTP_PROXY,
    AGENTBRIDGE_HTTPS_PROXY: process.env.AGENTBRIDGE_HTTPS_PROXY ?? process.env.HTTPS_PROXY,
    AGENTBRIDGE_CLAUDE_COMMAND: process.env.AGENTBRIDGE_CLAUDE_COMMAND,
    AGENTBRIDGE_CLAUDE_ARGS: process.env.AGENTBRIDGE_CLAUDE_ARGS,
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: process.env.AGENTBRIDGE_CLAUDE_RESUME_ARGS,
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: process.env.AGENTBRIDGE_CLAUDE_OUTPUT_MODE,
    AGENTBRIDGE_CODEX_COMMAND: process.env.AGENTBRIDGE_CODEX_COMMAND,
    AGENTBRIDGE_CODEX_ARGS: process.env.AGENTBRIDGE_CODEX_ARGS,
    AGENTBRIDGE_CODEX_RESUME_ARGS: process.env.AGENTBRIDGE_CODEX_RESUME_ARGS,
    AGENTBRIDGE_CODEX_OUTPUT_MODE: process.env.AGENTBRIDGE_CODEX_OUTPUT_MODE
  });
}

export function normalizeProxyUrl(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `http://${value}`;
}

export function detectWindowsProxy(): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  try {
    const enabledOutput = execFileSync("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyEnable"
    ], { encoding: "utf8" });

    if (!/0x1/i.test(enabledOutput)) {
      return undefined;
    }

    const serverOutput = execFileSync("reg", [
      "query",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
      "/v",
      "ProxyServer"
    ], { encoding: "utf8" });

    const match = serverOutput.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}
