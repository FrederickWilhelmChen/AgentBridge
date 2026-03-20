import test from "node:test";
import assert from "node:assert/strict";
import { buildResumeProfile, buildRunOnceProfile } from "./agents.js";
import type { AppConfig } from "../app/config.js";

function createConfig(): AppConfig {
  return {
    database: { path: "E:/AgentBridge/agentbridge.db" },
    runtime: {
      enabledPlatforms: ["slack"],
      allowedCwds: ["E:/AgentBridge"],
      defaultAgent: "codex",
      defaultTimeoutMs: 1000,
      httpProxy: null,
      httpsProxy: null,
      agents: {
        claude: {
          command: "E:/nodejs/claude.cmd",
          args: ["-p", "--output-format", "json", "--permission-mode", "bypassPermissions"],
          resumeArgs: ["-p", "--output-format", "json", "--permission-mode", "bypassPermissions", "-r", "{sessionId}"],
          outputMode: "claude_json"
        },
        codex: {
          command: "node",
          args: ["codex.js", "exec", "--dangerously-bypass-approvals-and-sandbox", "-"],
          resumeArgs: ["codex.js", "exec", "resume", "{sessionId}", "--dangerously-bypass-approvals-and-sandbox", "-"],
          outputMode: "codex_text"
        }
      }
    }
  };
}

test("buildRunOnceProfile wraps bridge prompts with a complete-response instruction", () => {
  const profile = buildRunOnceProfile(
    createConfig(),
    "claude",
    "E:/AgentBridge",
    "review this project"
  );

  assert.match(profile.input, /complete final answer in this response/i);
  assert.match(profile.input, /do not reply with placeholders/i);
  assert.match(profile.input, /review this project/);
});

test("buildResumeProfile wraps bridge prompts with a complete-response instruction", () => {
  const profile = buildResumeProfile(
    createConfig(),
    "codex",
    "E:/AgentBridge",
    "continue",
    "session-1"
  );

  assert.match(profile.input, /complete final answer in this response/i);
  assert.match(profile.input, /do not reply with placeholders/i);
  assert.match(profile.input, /continue/);
});
