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

test("loadConfig accepts workspace parents and manual workspaces without AGENTBRIDGE_ALLOWED_CWDS", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: "E:/repos,E:/projects",
    AGENTBRIDGE_MANUAL_WORKSPACES: "E:/multi-ideas,E:/notes",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    delete process.env.AGENTBRIDGE_ALLOWED_CWDS;

    const config = loadConfig();

    assert.deepEqual(config.runtime.workspace?.allowedWorkspaceParents, [
      path.resolve("E:/repos"),
      path.resolve("E:/projects")
    ]);
    assert.deepEqual(config.runtime.workspace?.manualWorkspaces, [
      path.resolve("E:/multi-ideas"),
      path.resolve("E:/notes")
    ]);
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig fails when no workspace source is configured", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    delete process.env.AGENTBRIDGE_ALLOWED_CWDS;
    delete process.env.AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS;
    delete process.env.AGENTBRIDGE_MANUAL_WORKSPACES;

    assert.throws(
      () => loadConfig(),
      /No workspace source configured|workspace source/
    );
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig rejects workspace parents without a runnable workspace source", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: "E:/repos,E:/projects",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    delete process.env.AGENTBRIDGE_ALLOWED_CWDS;
    delete process.env.AGENTBRIDGE_MANUAL_WORKSPACES;

    assert.throws(
      () => loadConfig(),
      /runnable workspace source|workspace source/
    );
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig preserves skip-git-repo-check for codex resume args", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge,E:/multi-ideas",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    const config = loadConfig();

    assert.deepEqual(config.runtime.agents.codex.resumeArgs?.slice(-2), ["--skip-git-repo-check", "-"]);
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig enables writable Codex execution defaults", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge,E:/multi-ideas",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --skip-git-repo-check -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    delete process.env.AGENTBRIDGE_CODEX_ARGS;
    delete process.env.AGENTBRIDGE_CODEX_RESUME_ARGS;

    const config = loadConfig();

    assert.ok(
      config.runtime.agents.codex.args.includes("--dangerously-bypass-approvals-and-sandbox")
    );
    assert.ok(
      config.runtime.agents.codex.resumeArgs?.includes("--dangerously-bypass-approvals-and-sandbox")
    );
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig enables writable Claude execution defaults", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge,E:/multi-ideas",
    AGENTBRIDGE_DEFAULT_AGENT: "claude",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    delete process.env.AGENTBRIDGE_CLAUDE_ARGS;
    delete process.env.AGENTBRIDGE_CLAUDE_RESUME_ARGS;

    const config = loadConfig();

    assert.ok(config.runtime.agents.claude.args.includes("--permission-mode"));
    assert.ok(config.runtime.agents.claude.args.includes("bypassPermissions"));
    assert.ok(config.runtime.agents.claude.resumeArgs?.includes("--permission-mode"));
    assert.ok(config.runtime.agents.claude.resumeArgs?.includes("bypassPermissions"));
  } finally {
    process.env = previousEnv;
  }
});

test("loadConfig preserves quoted args with spaces for cross-platform command lines", () => {
  const previousEnv = { ...process.env };

  process.env = {
    ...previousEnv,
    AGENTBRIDGE_ENABLED_PLATFORMS: "slack",
    SLACK_BOT_TOKEN: "x",
    SLACK_APP_TOKEN: "x",
    SLACK_SIGNING_SECRET: "x",
    SLACK_ALLOWED_USER_ID: "U123",
    AGENTBRIDGE_DB_PATH: "./agentbridge.db",
    AGENTBRIDGE_ALLOWED_CWDS: "E:/AgentBridge,/Users/test/My Repo",
    AGENTBRIDGE_DEFAULT_AGENT: "codex",
    AGENTBRIDGE_CLAUDE_COMMAND: "claude",
    AGENTBRIDGE_CLAUDE_ARGS: "-p --output-format json",
    AGENTBRIDGE_CLAUDE_RESUME_ARGS: "-p --output-format json -r {sessionId}",
    AGENTBRIDGE_CLAUDE_OUTPUT_MODE: "claude_json",
    AGENTBRIDGE_CODEX_COMMAND: "node",
    AGENTBRIDGE_CODEX_ARGS: "\"node_modules/@openai/codex/bin/codex.js\" exec --label \"my repo\" -",
    AGENTBRIDGE_CODEX_RESUME_ARGS: "\"node_modules/@openai/codex/bin/codex.js\" exec resume {sessionId} --label \"my repo\" -",
    AGENTBRIDGE_CODEX_OUTPUT_MODE: "codex_text"
  };

  try {
    const config = loadConfig();
    const expectedEntrypoint = path.resolve("E:/AgentBridge", "node_modules/@openai/codex/bin/codex.js");

    assert.equal(config.runtime.agents.codex.args[0], expectedEntrypoint);
    assert.deepEqual(config.runtime.agents.codex.args.slice(1), ["exec", "--label", "my repo", "-"]);
    assert.equal(config.runtime.agents.codex.resumeArgs?.[0], expectedEntrypoint);
    assert.deepEqual(config.runtime.agents.codex.resumeArgs?.slice(1), ["exec", "resume", "{sessionId}", "--label", "my repo", "-"]);
  } finally {
    process.env = previousEnv;
  }
});
