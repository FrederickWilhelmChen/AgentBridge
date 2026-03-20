import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutionBlocks, buildStatusBlocks } from "./messages.js";
import type { Run, Session } from "../domain/models.js";

function createRun(outputTail: string): Run {
  return {
    runId: "run-1",
    sessionId: "session-1",
    agentType: "codex",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: null,
    platformUserId: "U123",
    inputText: "hello",
    status: "finished",
    pid: null,
    startedAt: "2026-03-19T10:00:00.000Z",
    endedAt: "2026-03-19T10:01:00.000Z",
    exitCode: 0,
    outputTail,
    rawOutput: outputTail,
    errorReason: null
  };
}

function createSession(): Session {
  return {
    sessionId: "session-1",
    agentType: "codex",
    cwd: "E:/AgentBridge",
    mode: "persistent",
    status: "idle",
    providerSessionId: null,
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "thread-1",
    platformUserId: "U123",
    createdAt: "2026-03-19T10:00:00.000Z",
    lastActiveAt: "2026-03-19T10:00:00.000Z",
    lastRunId: "run-1"
  };
}

test("buildExecutionBlocks truncates output to Slack-safe mrkdwn length", () => {
  const longOutput = "A".repeat(4000);
  const blocks = buildExecutionBlocks({
    title: "Run Once Result",
    run: createRun(longOutput),
    session: createSession()
  });

  const outputSection = blocks[1];
  assert.equal(outputSection?.type, "section");
  assert.ok((outputSection as any).text.text.length <= 3000);
  assert.match((outputSection as any).text.text, /\*Output tail\*/);
  assert.match((outputSection as any).text.text, /truncated/i);
});

test("buildStatusBlocks truncates output to Slack-safe mrkdwn length", () => {
  const longOutput = "B".repeat(4000);
  const blocks = buildStatusBlocks({
    agentType: "codex",
    session: createSession(),
    run: createRun(longOutput)
  });

  const outputSection = blocks[1];
  assert.equal(outputSection?.type, "section");
  assert.ok((outputSection as any).text.text.length <= 3000);
  assert.match((outputSection as any).text.text, /\*Latest Output\*/);
  assert.match((outputSection as any).text.text, /truncated/i);
});

test("buildExecutionBlocks shows cwd when a session exists", () => {
  const blocks = buildExecutionBlocks({
    title: "Conversation Started",
    run: createRun("done"),
    session: createSession()
  });

  const summary = blocks[0];
  assert.equal(summary?.type, "section");
  assert.match((summary as any).text.text, /\*cwd:\* E:\/AgentBridge/);
});
