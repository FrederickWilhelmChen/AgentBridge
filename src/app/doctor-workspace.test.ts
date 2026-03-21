import test from "node:test";
import assert from "node:assert/strict";
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
