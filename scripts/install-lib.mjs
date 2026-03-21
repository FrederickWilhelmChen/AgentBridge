import { spawnSync } from "node:child_process";
import os from "node:os";

export function setEnvValue(content, key, value) {
  const line = `${key}=${value ?? ""}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const normalized = content.endsWith("\n") ? content : `${content}\n`;
  return `${normalized}${line}\n`;
}

export function commandExists(command) {
  const isWin = os.platform() === "win32";
  const checker = isWin ? "where" : "which";
  const [spawnCmd, spawnArgs] = isWin ? ["cmd", ["/c", checker, command]] : [checker, [command]];
  const result = spawnSync(spawnCmd, spawnArgs, {
    stdio: "ignore",
    env: process.env
  });
  return result.status === 0;
}

export function chooseFirstAvailable(candidates) {
  for (const candidate of candidates) {
    if (candidate && commandExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function normalizePlatforms(value) {
  const raw = value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(raw)].filter((item) => item === "slack" || item === "lark");
  return unique.length > 0 ? unique : ["slack"];
}

export function normalizeYesNo(value, fallback = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["y", "yes", "1", "true"].includes(normalized)) {
    return true;
  }

  if (["n", "no", "0", "false"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
