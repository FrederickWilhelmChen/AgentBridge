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
