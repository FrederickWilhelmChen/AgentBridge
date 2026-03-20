import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlatforms, normalizeYesNo, setEnvValue } from "./install-lib.mjs";

test("setEnvValue replaces existing keys in env content", () => {
  const content = "A=1\nB=2\n";
  assert.equal(setEnvValue(content, "B", "3"), "A=1\nB=3\n");
});

test("setEnvValue appends missing keys in env content", () => {
  const content = "A=1\n";
  assert.equal(setEnvValue(content, "B", "2"), "A=1\nB=2\n");
});

test("normalizePlatforms keeps only supported unique values", () => {
  assert.deepEqual(normalizePlatforms("slack,lark,SLACK,foo"), ["slack", "lark"]);
});

test("normalizePlatforms falls back to slack when input is empty", () => {
  assert.deepEqual(normalizePlatforms(""), ["slack"]);
});

test("normalizeYesNo supports common affirmative and negative inputs", () => {
  assert.equal(normalizeYesNo("yes", false), true);
  assert.equal(normalizeYesNo("n", true), false);
  assert.equal(normalizeYesNo("", false), false);
});
