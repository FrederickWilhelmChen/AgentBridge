import path from "node:path";
import { execFileSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { AgentType } from "../domain/enums.js";
import type { Platform } from "../platform/types.js";

loadEnv();

const commandSchema = z.object({
  command: z.string().min(1),
  args: z.string(),
  resumeArgs: z.string().optional(),
  outputMode: z.enum(["text", "claude_json", "codex_text"]).default("text")
});

const commonEnvSchema = z.object({
  AGENTBRIDGE_DB_PATH: z.string().min(1).default("./agentbridge.db"),
  AGENTBRIDGE_ALLOWED_CWDS: z.string().optional(),
  AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: z.string().optional(),
  AGENTBRIDGE_MANUAL_WORKSPACES: z.string().optional(),
  AGENTBRIDGE_ENABLED_PLATFORMS: z.string().default("slack"),
  AGENTBRIDGE_DEFAULT_AGENT: z.enum(["claude", "codex"]).default("codex"),
  AGENTBRIDGE_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  AGENTBRIDGE_HTTP_PROXY: z.string().optional(),
  AGENTBRIDGE_HTTPS_PROXY: z.string().optional(),
  AGENTBRIDGE_CLAUDE_COMMAND: z.string().min(1).default("claude"),
  AGENTBRIDGE_CLAUDE_ARGS: z.string().default("-p --output-format json --permission-mode bypassPermissions"),
  AGENTBRIDGE_CLAUDE_RESUME_ARGS: z.string().default("-p --output-format json --permission-mode bypassPermissions -r {sessionId}"),
  AGENTBRIDGE_CLAUDE_OUTPUT_MODE: z.enum(["text", "claude_json"]).default("claude_json"),
  AGENTBRIDGE_CODEX_COMMAND: z.string().min(1).default("node"),
  AGENTBRIDGE_CODEX_ARGS: z.string().default("node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -"),
  AGENTBRIDGE_CODEX_RESUME_ARGS: z.string().default("node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -"),
  AGENTBRIDGE_CODEX_OUTPUT_MODE: z.enum(["text", "claude_json", "codex_text"]).default("codex_text")
});

const slackEnvSchema = z.object({
  SLACK_BOT_TOKEN: z.string().min(1),
  SLACK_APP_TOKEN: z.string().min(1),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_ALLOWED_USER_ID: z.string().min(1)
});

const larkEnvSchema = z.object({
  LARK_APP_ID: z.string().min(1),
  LARK_APP_SECRET: z.string().min(1),
  LARK_ALLOWED_USER_ID: z.string().min(1),
  LARK_ENCRYPT_KEY: z.string().optional(),
  LARK_VERIFICATION_TOKEN: z.string().optional()
});

function splitArgs(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!char) {
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function resolveAgentArgs(command: string, args: string[]): string[] {
  if (command !== "node") {
    return args;
  }

  const [entrypoint, ...rest] = args;
  if (!entrypoint) {
    return args;
  }

  if (path.isAbsolute(entrypoint)) {
    return args;
  }

  if (!/\.(cjs|mjs|js)$/i.test(entrypoint)) {
    return args;
  }

  return [path.resolve(process.cwd(), entrypoint), ...rest];
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
  slack?: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    allowedUserId: string;
  };
  lark?: {
    appId: string;
    appSecret: string;
    allowedUserId: string;
    encryptKey: string | null;
    verificationToken: string | null;
  };
  database: {
    path: string;
  };
  runtime: {
    enabledPlatforms: Platform[];
    workspace?: {
      allowedWorkspaceParents: string[];
      manualWorkspaces: string[];
    };
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
  const enabledPlatforms = parseEnabledPlatforms(parsed.AGENTBRIDGE_ENABLED_PLATFORMS);
  const claudeAgent = buildAgentCommand("claude");
  const codexAgent = buildAgentCommand("codex");
  const detectedWindowsProxy = detectWindowsProxy();
  const httpProxy = normalizeProxyUrl(parsed.AGENTBRIDGE_HTTP_PROXY ?? detectedWindowsProxy);
  const httpsProxy = normalizeProxyUrl(parsed.AGENTBRIDGE_HTTPS_PROXY ?? detectedWindowsProxy);
  const allowedWorkspaceParents = parsePathList(parsed.AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS);
  const manualWorkspaces = parsePathList(parsed.AGENTBRIDGE_MANUAL_WORKSPACES);
  const legacyAllowedCwds = parsePathList(parsed.AGENTBRIDGE_ALLOWED_CWDS);

  if (allowedWorkspaceParents.length === 0 && manualWorkspaces.length === 0 && legacyAllowedCwds.length === 0) {
    throw new Error(
      "No workspace source configured. Set AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS, AGENTBRIDGE_MANUAL_WORKSPACES, or legacy AGENTBRIDGE_ALLOWED_CWDS."
    );
  }

  const slack = enabledPlatforms.includes("slack")
    ? slackEnvSchema.parse({
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
        SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
        SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
        SLACK_ALLOWED_USER_ID: process.env.SLACK_ALLOWED_USER_ID
      })
    : undefined;

  const lark = enabledPlatforms.includes("lark")
    ? larkEnvSchema.parse({
        LARK_APP_ID: process.env.LARK_APP_ID,
        LARK_APP_SECRET: process.env.LARK_APP_SECRET,
        LARK_ALLOWED_USER_ID: process.env.LARK_ALLOWED_USER_ID,
        LARK_ENCRYPT_KEY: process.env.LARK_ENCRYPT_KEY,
        LARK_VERIFICATION_TOKEN: process.env.LARK_VERIFICATION_TOKEN
      })
    : undefined;

  return {
    ...(slack
      ? {
          slack: {
            botToken: slack.SLACK_BOT_TOKEN,
            appToken: slack.SLACK_APP_TOKEN,
            signingSecret: slack.SLACK_SIGNING_SECRET,
            allowedUserId: slack.SLACK_ALLOWED_USER_ID
          }
        }
      : {}),
    ...(lark
      ? {
          lark: {
            appId: lark.LARK_APP_ID,
            appSecret: lark.LARK_APP_SECRET,
            allowedUserId: lark.LARK_ALLOWED_USER_ID,
            encryptKey: lark.LARK_ENCRYPT_KEY ?? null,
            verificationToken: lark.LARK_VERIFICATION_TOKEN ?? null
          }
        }
      : {}),
    database: {
      path: path.resolve(parsed.AGENTBRIDGE_DB_PATH)
    },
    runtime: {
      enabledPlatforms,
      workspace: {
        allowedWorkspaceParents,
        manualWorkspaces
      },
      allowedCwds: Array.from(new Set([...legacyAllowedCwds, ...manualWorkspaces])),
      defaultAgent: parsed.AGENTBRIDGE_DEFAULT_AGENT,
      defaultTimeoutMs: parsed.AGENTBRIDGE_DEFAULT_TIMEOUT_MS,
      httpProxy,
      httpsProxy,
      agents: {
        claude: {
          command: claudeAgent.command,
          args: resolveAgentArgs(claudeAgent.command, splitArgs(claudeAgent.args)),
          resumeArgs: claudeAgent.resumeArgs
            ? resolveAgentArgs(claudeAgent.command, splitArgs(claudeAgent.resumeArgs))
            : null,
          outputMode: claudeAgent.outputMode
        },
        codex: {
          command: codexAgent.command,
          args: resolveAgentArgs(codexAgent.command, splitArgs(codexAgent.args)),
          resumeArgs: codexAgent.resumeArgs
            ? resolveAgentArgs(codexAgent.command, splitArgs(codexAgent.resumeArgs))
            : null,
          outputMode: codexAgent.outputMode
        }
      }
    }
  };
}

function parseEnv() {
  return commonEnvSchema.parse({
    AGENTBRIDGE_DB_PATH: process.env.AGENTBRIDGE_DB_PATH,
    AGENTBRIDGE_ALLOWED_CWDS: process.env.AGENTBRIDGE_ALLOWED_CWDS,
    AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: process.env.AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS,
    AGENTBRIDGE_MANUAL_WORKSPACES: process.env.AGENTBRIDGE_MANUAL_WORKSPACES,
    AGENTBRIDGE_ENABLED_PLATFORMS: process.env.AGENTBRIDGE_ENABLED_PLATFORMS,
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

function parsePathList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => path.resolve(part));
}

function parseEnabledPlatforms(value: string): Platform[] {
  const platforms = value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const parsed = z.array(z.enum(["slack", "lark"])).min(1).parse(platforms);
  return Array.from(new Set(parsed));
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
