import test from "node:test";
import assert from "node:assert/strict";
import { buildConsoleModal } from "./views.js";

test("buildConsoleModal only supports starting a new conversation", () => {
  const modal = buildConsoleModal({
    workspaces: [{ rootPath: "E:/AgentBridge", label: "AgentBridge", kind: "plain_dir" }],
    defaultAgent: "codex"
  });

  const blockIds = modal.blocks.map((block: any) => block.block_id);
  assert.deepEqual(blockIds, ["agent_block", "workspace_block", "message_block"]);
});

test("buildConsoleModal requires an initial message", () => {
  const modal = buildConsoleModal({
    workspaces: [{ rootPath: "E:/AgentBridge", label: "AgentBridge", kind: "plain_dir" }],
    defaultAgent: "codex"
  });

  const messageBlock = modal.blocks.find((block: any) => block.block_id === "message_block") as any;
  assert.equal(messageBlock.optional, undefined);
  assert.match(messageBlock.element.placeholder.text, /Required/i);
});

test("buildConsoleModal shows workspace labels instead of raw cwd field names", () => {
  const modal = buildConsoleModal({
    workspaces: [
      { rootPath: "E:/repos/project-a", label: "project-a", kind: "git_repo" },
      { rootPath: "E:/multi-ideas", label: "multi-ideas", kind: "plain_dir" }
    ],
    defaultAgent: "codex"
  });

  const workspaceBlock = modal.blocks.find((block: any) => block.block_id === "workspace_block") as any;
  assert.equal(workspaceBlock.label.text, "Workspace");
  assert.deepEqual(
    workspaceBlock.element.options.map((option: any) => option.text.text),
    ["project-a", "multi-ideas"]
  );
});

test("buildConsoleModal omits submit and shows an empty-state message when no workspaces are available", () => {
  const modal = buildConsoleModal({
    workspaces: [],
    defaultAgent: "codex"
  });

  assert.equal((modal as any).submit, undefined);
  const emptyStateBlock = modal.blocks.find((block: any) => block.block_id === "workspace_empty_block") as any;
  assert.match(emptyStateBlock.text.text, /no workspaces available/i);
});

test("buildConsoleModal falls back to manual workspace entry when the workspace list exceeds Slack static_select limits", () => {
  const modal = buildConsoleModal({
    workspaces: Array.from({ length: 101 }, (_, index) => ({
      rootPath: `E:/repos/project-${index + 1}`,
      label: `project-${index + 1}`,
      kind: "git_repo" as const
    })),
    defaultAgent: "codex"
  });

  const workspaceBlock = modal.blocks.find((block: any) => block.block_id === "workspace_block") as any;
  assert.equal(workspaceBlock.element.type, "plain_text_input");
  assert.match(workspaceBlock.hint.text, /exact workspace path or label/i);
});
