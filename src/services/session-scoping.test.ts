import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../store/db.js";
import { SessionStore } from "../store/session-store.js";
import { RunStore } from "../store/run-store.js";
import { SessionService } from "./session-service.js";

test("scopes persistent sessions by platform, user, and agent", () => {
  const database = createDatabase(":memory:");
  const service = new SessionService(new SessionStore(database), new RunStore(database));

  const slackUserOne = service.getOrCreatePersistentSession("codex", "E:/AgentBridge", "slack", "U1");
  const slackUserTwo = service.getOrCreatePersistentSession("codex", "E:/AgentBridge", "slack", "U2");
  const larkUserOne = service.getOrCreatePersistentSession("codex", "E:/AgentBridge", "lark", "OU_1");

  assert.notEqual(slackUserOne.sessionId, slackUserTwo.sessionId);
  assert.notEqual(slackUserOne.sessionId, larkUserOne.sessionId);
  assert.equal(
    service.getPersistentSessionByScope("codex", "slack", "U1")?.sessionId,
    slackUserOne.sessionId
  );
  assert.equal(
    service.getPersistentSessionByScope("codex", "slack", "U2")?.sessionId,
    slackUserTwo.sessionId
  );
  assert.equal(
    service.getPersistentSessionByScope("codex", "lark", "OU_1")?.sessionId,
    larkUserOne.sessionId
  );
});

test("finds Slack persistent sessions by thread binding", () => {
  const database = createDatabase(":memory:");
  const service = new SessionService(new SessionStore(database), new RunStore(database));

  const session = service.createPersistentSession(
    "claude",
    "E:/AgentBridge",
    "slack",
    "U1",
    "D123",
    "171"
  );

  assert.equal(
    service.getPersistentSessionByThread("slack", "U1", "D123", "171")?.sessionId,
    session.sessionId
  );
  assert.equal(
    service.getPersistentSessionByThread("slack", "U1", "D123", "999"),
    null
  );
});

test("does not reuse a persistent session across different Slack threads for the same user and agent", () => {
  const database = createDatabase(":memory:");
  const service = new SessionService(new SessionStore(database), new RunStore(database));

  const firstThreadSession = service.getOrCreatePersistentSession(
    "codex",
    "E:/AgentBridge",
    "slack",
    "U1",
    "D123",
    "171"
  );
  const secondThreadSession = service.getOrCreatePersistentSession(
    "codex",
    "E:/AgentBridge",
    "slack",
    "U1",
    "D123",
    "172"
  );

  assert.notEqual(firstThreadSession.sessionId, secondThreadSession.sessionId);
  assert.equal(
    service.getPersistentSessionByThread("slack", "U1", "D123", "171")?.sessionId,
    firstThreadSession.sessionId
  );
  assert.equal(
    service.getPersistentSessionByThread("slack", "U1", "D123", "172")?.sessionId,
    secondThreadSession.sessionId
  );
});

test("recoverStaleRuntimeState resets stale active runs and sessions on startup", () => {
  const database = createDatabase(":memory:");
  const service = new SessionService(new SessionStore(database), new RunStore(database));
  const session = service.createPersistentSession("codex", "E:/AgentBridge", "slack", "U1", "D123", "171");
  const run = service.createRun({
    sessionId: session.sessionId,
    agentType: "codex",
    platform: "slack",
    platformChannelId: "D123",
    platformThreadId: "171",
    platformUserId: "U1",
    inputText: "hello"
  });

  service.updateRun({
    ...run,
    status: "running"
  });
  service.updateSession({
    ...session,
    status: "running",
    lastRunId: run.runId
  });

  const recovered = service.recoverStaleRuntimeState();
  const updatedRun = service.getRunById(run.runId);
  const updatedSession = service.getSessionById(session.sessionId);

  assert.equal(recovered.recoveredRuns, 1);
  assert.equal(recovered.recoveredSessions, 1);
  assert.equal(updatedRun?.status, "failed");
  assert.match(updatedRun?.errorReason ?? "", /Recovered stale active run/);
  assert.equal(updatedSession?.status, "idle");
});
