import type { AppConfig } from "../app/config.js";
import type { AgentType } from "../domain/enums.js";

export type LaunchProfile = {
  command: string;
  args: string[];
  cwd: string;
  input: string;
  outputMode: "text" | "claude_json" | "codex_text";
  shell: boolean;
};

function hydrateResumeArgs(args: string[], sessionId: string): string[] {
  return args.map((arg) => arg.replaceAll("{sessionId}", sessionId));
}

function wrapBridgePrompt(message: string): string {
  return [
    "Respond with the complete final answer in this response.",
    "Do not reply with placeholders like 'let me...' or 'I will...' unless the full answer is included in the same response.",
    "",
    message
  ].join("\n");
}

export function buildRunOnceProfile(
  config: AppConfig,
  agentType: AgentType,
  cwd: string,
  message: string
): LaunchProfile {
  const agent = config.runtime.agents[agentType];

  return {
    command: agent.command,
    args: agent.args,
    cwd,
    input: wrapBridgePrompt(message),
    outputMode: agent.outputMode,
    shell: shouldUseShell(agent.command)
  };
}

export function buildResumeProfile(
  config: AppConfig,
  agentType: AgentType,
  cwd: string,
  message: string,
  providerSessionId: string
): LaunchProfile {
  const agent = config.runtime.agents[agentType];

  if (!agent.resumeArgs) {
    throw new Error(`${agentType} persistent sessions are not configured`);
  }

  return {
    command: agent.command,
    args: hydrateResumeArgs(agent.resumeArgs, providerSessionId),
    cwd,
    input: wrapBridgePrompt(message),
    outputMode: agent.outputMode,
    shell: shouldUseShell(agent.command)
  };
}

function shouldUseShell(command: string): boolean {
  if (process.platform === "win32") return true;
  return /\.(cmd|bat|ps1)$/i.test(command);
}
