import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProcessTreeKillPlanForTest,
  parseClaudeOutputForTest,
  parseCodexOutputForTest
} from "./process-manager.js";

test("extracts the final assistant-style answer from noisy codex output", () => {
  const output = `
---
name: using-superpowers
description: Use when starting any conversation
---

exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content ..."
in E:\\AgentBridge

rejected: blocked by policy

codex
I will first inspect the repository ignore files.
exec
"C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Command "Get-Content .gitignore"
in E:\\AgentBridge succeeded in 212ms:
node_modules
dist

codex
The repository currently ignores \`node_modules\` and \`dist\`.
tokens used
`;

  const parsed = parseCodexOutputForTest(output);

  assert.equal(parsed.text, "The repository currently ignores `node_modules` and `dist`.");
});

test("falls back to the best natural-language block when no codex marker exists", () => {
  const output = `
exec
"powershell" -Command "Get-Location"
succeeded in 100ms:

The current working directory is already E:\\KeynesEngine.
OpenAI Codex v0.1
tokens used
`;

  const parsed = parseCodexOutputForTest(output);

  assert.match(parsed.text, /The current working directory is already E:\\KeynesEngine\./);
});

test("extracts Claude result text from headless JSON output", () => {
  const parsed = parseClaudeOutputForTest(JSON.stringify({
    type: "result",
    subtype: "success",
    result: "hello",
    session_id: "session-1"
  }));

  assert.equal(parsed.text, "hello");
  assert.equal(parsed.providerSessionId, "session-1");
});

test("falls back to subtype when Claude JSON omits result text", () => {
  const parsed = parseClaudeOutputForTest(JSON.stringify({
    type: "result",
    subtype: "error_during_execution",
    errors: [],
    session_id: "session-2"
  }));

  assert.match(parsed.text, /Claude returned no final text result/);
  assert.match(parsed.text, /error_during_execution/);
  assert.equal(parsed.providerSessionId, "session-2");
});

test("strips Unix command path noise from codex output", () => {
  const output = `
codex
The repository looks clean.
"/usr/local/bin/node" "/Users/test/My Repo/codex.js"
in /Users/test/My Repo succeeded in 100ms:
tokens used
`;

  const parsed = parseCodexOutputForTest(output);

  assert.equal(parsed.text, "The repository looks clean.");
});

test("uses taskkill tree termination on Windows when a pid is available", () => {
  assert.deepEqual(buildProcessTreeKillPlanForTest("win32", 1234), {
    command: "taskkill",
    args: ["/PID", "1234", "/T", "/F"]
  });
});

test("does not build a taskkill plan when the pid is missing", () => {
  assert.equal(buildProcessTreeKillPlanForTest("win32", null), null);
  assert.equal(buildProcessTreeKillPlanForTest("linux", 1234), null);
});
