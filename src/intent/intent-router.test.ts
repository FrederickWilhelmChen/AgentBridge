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

test("maps slash interrupt text to an interrupt control intent", () => {
  const result = parseIntent("/stop");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "interrupt");
});

test("maps slash interrupt alias to an interrupt control intent", () => {
  const result = parseIntent("/interrupt");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "interrupt");
});

test("maps dot interrupt text to an interrupt control intent", () => {
  const result = parseIntent(".stop");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "interrupt");
});

test("maps /contexts to a list-contexts control intent", () => {
  const result = parseIntent("/contexts");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "list_contexts");
});

test("maps .contexts to a list-contexts control intent", () => {
  const result = parseIntent(".contexts");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "list_contexts");
});

test("maps /context main to a switch-context control intent", () => {
  const result = parseIntent("/context main");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "switch_context");
  assert.equal(result.intent.selector, "main");
});

test("maps .context main to a switch-context control intent", () => {
  const result = parseIntent(".context main");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "switch_context");
  assert.equal(result.intent.selector, "main");
});

test("maps /context switch path to a switch-context control intent", () => {
  const result = parseIntent("/context switch E:/AgentBridge-worktrees/review-auth");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "switch_context");
  assert.equal(result.intent.selector, "E:/AgentBridge-worktrees/review-auth");
});

test("maps .context switch path to a switch-context control intent", () => {
  const result = parseIntent(".context switch E:/AgentBridge-worktrees/review-auth");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "switch_context");
  assert.equal(result.intent.selector, "E:/AgentBridge-worktrees/review-auth");
});

test("maps /worktree create name to a create-worktree control intent", () => {
  const result = parseIntent("/worktree create review-auth");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "create_worktree");
  assert.equal(result.intent.name, "review-auth");
});

test("maps .worktree create name to a create-worktree control intent", () => {
  const result = parseIntent(".worktree create review-auth");

  assert.equal(result.kind, "control");
  assert.equal(result.intent.type, "create_worktree");
  assert.equal(result.intent.name, "review-auth");
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

test("treats bare stop as a regular prompt", () => {
  const result = parseIntent("stop");

  assert.deepEqual(result, {
    kind: "ai_prompt",
    message: "stop"
  });
});
