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
    platformUserId: "U123",
    createdAt: "2026-03-19T10:00:00.000Z",
    lastActiveAt: "2026-03-19T10:00:00.000Z",
    lastRunId: "run-1"
  };
}

test("buildExecutionBlocks keeps the full output text", () => {
  const longOutput = "A".repeat(3000);
  const blocks = buildExecutionBlocks({
    title: "Run Once Result",
    run: createRun(longOutput),
    session: createSession()
  });

  const outputSection = blocks[1];
  assert.equal(outputSection?.type, "section");
  assert.match((outputSection as any).text.text, new RegExp(`\\*Output tail\\*\\n\`\`\`${longOutput}\`\`\``));
});

test("buildStatusBlocks keeps the full latest output text", () => {
  const longOutput = "B".repeat(3000);
  const blocks = buildStatusBlocks({
    agentType: "codex",
    session: createSession(),
    run: createRun(longOutput)
  });

  const outputSection = blocks[1];
  assert.equal(outputSection?.type, "section");
  assert.match((outputSection as any).text.text, new RegExp(`\\*Latest Output\\*\\n\`\`\`${longOutput}\`\`\``));
});
