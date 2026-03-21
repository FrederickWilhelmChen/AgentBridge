import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildDoctorReport } from "./doctor.js";

test("doctor reports degraded workspace mode and skips repo scanning when git is unavailable", async () => {
  let scanCalls = 0;

  const report = await buildDoctorReport({
    env: {
      AGENTBRIDGE_DB_PATH: "./agentbridge.db",
      AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: "E:/repos",
      AGENTBRIDGE_MANUAL_WORKSPACES: "E:/multi-ideas",
      SLACK_ALLOWED_USER_ID: "U123"
    },
    probeGit: async () => ({ ok: false, error: "git not found" }),
    scanWorkspaceParents: async () => {
      scanCalls += 1;
      return [];
    },
    probeCommand: async () => ({ ok: true })
  });

  assert.equal(report.gitAvailable, false);
  assert.equal(report.repoScanningEnabled, false);
  assert.equal(scanCalls, 0);
  assert.match(report.output, /Git not found\./);
  assert.match(report.output, /Repository discovery and worktree features are disabled\./);
  assert.match(report.output, /Plain workspaces remain available\./);
});

test("doctor surfaces legacy cwd allowlist compatibility when only AGENTBRIDGE_ALLOWED_CWDS is configured", async () => {
  const report = await buildDoctorReport({
    env: {
      AGENTBRIDGE_DB_PATH: "./agentbridge.db",
      AGENTBRIDGE_ALLOWED_CWDS: "./legacy-workspace",
      SLACK_ALLOWED_USER_ID: "U123"
    },
    probeGit: async () => ({ ok: true }),
    scanWorkspaceParents: async () => [],
    probeCommand: async () => ({ ok: true })
  });

  assert.equal(report.gitAvailable, true);
  assert.match(report.output, new RegExp(`Legacy cwd allowlist \\(compatibility\\): ${escapeRegExp(path.resolve("./legacy-workspace"))}`));
  assert.match(report.output, /Workspace parents: \(unset\)/);
  assert.match(report.output, /Manual workspaces: \(unset\)/);
});

test("doctor normalizes workspace-related paths relative to the current directory", async () => {
  const report = await buildDoctorReport({
    env: {
      AGENTBRIDGE_DB_PATH: "./agentbridge.db",
      AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS: "./repos",
      AGENTBRIDGE_MANUAL_WORKSPACES: "./notes",
      AGENTBRIDGE_ALLOWED_CWDS: "./legacy",
      SLACK_ALLOWED_USER_ID: "U123"
    },
    probeGit: async () => ({ ok: true }),
    scanWorkspaceParents: async () => [],
    probeCommand: async () => ({ ok: true })
  });

  assert.match(report.output, new RegExp(`Workspace parents: ${escapeRegExp(path.resolve("./repos"))}`));
  assert.match(report.output, new RegExp(`Manual workspaces: ${escapeRegExp(path.resolve("./notes"))}`));
  assert.match(report.output, new RegExp(`Legacy cwd allowlist \\(compatibility\\): ${escapeRegExp(path.resolve("./legacy"))}`));
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
