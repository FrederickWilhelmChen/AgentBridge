import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "./db.js";
import { InboundMessageStore } from "./inbound-message-store.js";

test("reserves, completes, and releases inbound message receipts", () => {
  const database = createDatabase(":memory:");
  const store = new InboundMessageStore(database);

  assert.equal(store.tryBegin("lark", "message-1"), true);
  assert.equal(store.tryBegin("lark", "message-1"), false);

  store.markCompleted("lark", "message-1");
  const receipt = store.findByMessageId("lark", "message-1");
  assert.equal(receipt?.status, "completed");

  assert.equal(store.tryBegin("lark", "message-2"), true);
  store.release("lark", "message-2");
  assert.equal(store.findByMessageId("lark", "message-2"), null);
  assert.equal(store.tryBegin("lark", "message-2"), true);
});
