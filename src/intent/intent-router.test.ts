import test from "node:test";
import assert from "node:assert/strict";
import { parseIntent } from "./intent-router.js";

test("treats status text as a regular prompt", () => {
  const result = parseIntent("status");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "status"
  });
});

test("treats cwd switch requests as regular prompts", () => {
  const result = parseIntent("switch to E:/AgentBridge");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "switch to E:/AgentBridge"
  });
});

test("treats agent preference hints as regular prompts", () => {
  const result = parseIntent("use claude help me inspect this build failure");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "use claude help me inspect this build failure"
  });
});

test("maps interrupt text to an interrupt control intent", () => {
  const result = parseIntent("stop");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "interrupt");
});

test("treats stop prose as a regular prompt", () => {
  const result = parseIntent("please stop the current run");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "please stop the current run"
  });
});

test("does not treat interrupt discussion as a control command", () => {
  const result = parseIntent("help me explain interrupt handling");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "help me explain interrupt handling"
  });
});

test("does not treat interrupt substrings inside normal prose as a control command", () => {
  const result = parseIntent("this retry loop is unstoppable under load");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "this retry loop is unstoppable under load"
  });
});
