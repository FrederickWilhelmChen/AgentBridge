import test from "node:test";
import assert from "node:assert/strict";
import { buildConsoleModal } from "./views.js";

test("buildConsoleModal only supports starting a new conversation", () => {
  const modal = buildConsoleModal({
    allowedCwds: ["E:/AgentBridge"],
    defaultAgent: "codex"
  });

  const blockIds = modal.blocks.map((block: any) => block.block_id);
  assert.deepEqual(blockIds, ["agent_block", "cwd_block", "message_block"]);
});

test("buildConsoleModal requires an initial message", () => {
  const modal = buildConsoleModal({
    allowedCwds: ["E:/AgentBridge"],
    defaultAgent: "codex"
  });

  const messageBlock = modal.blocks.find((block: any) => block.block_id === "message_block") as any;
  assert.equal(messageBlock.optional, undefined);
  assert.match(messageBlock.element.placeholder.text, /Required/i);
});
