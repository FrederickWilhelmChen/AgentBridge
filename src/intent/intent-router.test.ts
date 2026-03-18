import test from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "./intent-router.js";

test("maps status text to a status control intent", () => {
  const result = parseIntent("status");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "status");
});

test("maps an absolute path switch request to set_cwd", () => {
  const result = parseIntent("switch to E:/AgentBridge");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "set_cwd");
  assert.equal(result.intent.cwd, "E:/AgentBridge");
});

test("falls through to ai prompt for normal task text", () => {
  const result = parseIntent("help me inspect this build failure");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "help me inspect this build failure"
  });
});

test("does not treat prose mentioning status as a control command", () => {
  const result = parseIntent("show me the status of this build");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "show me the status of this build"
  });
});

test("maps restart codex session to a restart control intent", () => {
  const result = parseIntent("restart codex session");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "restart_session");
  assert.equal(result.intent.agentType, "codex");
});

test("maps new session text to a create session control intent", () => {
  const result = parseIntent("new codex session");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "new_session");
  assert.equal(result.intent.agentType, "codex");
});

test("maps interrupt text to an interrupt control intent", () => {
  const result = parseIntent("stop");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "interrupt");
});

test("preserves agent preference for ai prompts", () => {
  const result = parseIntent("use claude help me inspect this build failure");

  assert.equal(result.kind, "ai_prompt");
  assert.equal(result.agentType, "claude");
});

test("maps project name to an allowed cwd", () => {
  const result = parseIntent("切到KeynesEngine这个目录", {
    allowedCwds: ["E:/KeynesEngine", "E:/AgentBridge"]
  });

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "set_cwd");
  assert.equal(result.intent.cwd, "E:/KeynesEngine");
});
