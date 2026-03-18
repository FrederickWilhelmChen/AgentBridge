import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "./config.js";

test("loadConfig resolves relative codex executable args against the app root", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge,E:/KeynesEngine",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    const config = loadConfig();
    const expected = path.resolve("E:/AgentBridge", "node_modules/@openai/codex/bin/codex.js");

    assert.equal(config.runtime.agents.codex.args[0], expected);
    assert.equal(config.runtime.agents.codex.resumeArgs?.[0], expected);
  } finally {
    process.env = previousEnv;
  }
});
