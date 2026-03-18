import test from "node:test";
import assert from "node:assert/strict";
import { parseCodexOutputForTest } from "./process-manager.js";

test("extracts the final assistant-style answer from noisy codex output", () => {
  const output = `
---
name: using-superpowers
description: Use when starting any conversation
---

exec
"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "Get-Content ..."
in E:\\AgentBridge

exec
"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command 'Get-ChildItem ...'
in E:\\AgentBridge exited -1 in 0ms:
\`...\` rejected: blocked by policy

succeeded in 630ms:
---
name: using-superpowers
---

codex
我会先读取会话必需的 \`.gitignore\` 和 \`.git/info/exclude\`，然后把当前忽略规则按类型整理给你。

exec
"C:\\\\WINDOWS\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -Command "Get-Content .gitignore"
in E:\\AgentBridge succeeded in 212ms:
node_modules
dist

codex
当前仓库忽略了 \`node_modules\` 和 \`dist\`，另外我建议再检查一下本地数据库文件是否也需要忽略。

tokens used
`;

  const parsed = parseCodexOutputForTest(output);

  assert.equal(
    parsed.text,
    "当前仓库忽略了 `node_modules` 和 `dist`，另外我建议再检查一下本地数据库文件是否也需要忽略。"
  );
});

test("falls back to the best natural-language block when no codex marker exists", () => {
  const output = `
exec
"powershell" -Command "Get-Location"
succeeded in 100ms:

当前工作目录已经是 E:\\KeynesEngine。后续命令我会在这个目录下执行。

OpenAI Codex v0.1
tokens used
`;

  const parsed = parseCodexOutputForTest(output);

  assert.equal(parsed.text, "当前工作目录已经是 E:\\KeynesEngine。后续命令我会在这个目录下执行。");
});
