# 配置说明 / Configuration

这份文档说明 AgentBridge 使用到的环境变量。  
This document explains the environment variables used by AgentBridge.

最终以运行时代码和 `.env.example` 为准。  
The runtime code and `.env.example` are the source of truth.

## 1. 核心运行配置 / Core Runtime Settings

### `AGENTBRIDGE_ENABLED_PLATFORMS`

- 作用：选择启用哪些聊天平台  
  Purpose: choose enabled chat platforms.
- 是否必填：建议显式填写  
  Required: recommended to set explicitly.
- 可选值：`slack`、`lark`、`slack,lark`  
  Allowed values: `slack`, `lark`, `slack,lark`.

示例：  
Examples:

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
AGENTBRIDGE_ENABLED_PLATFORMS=slack,lark
```

### `AGENTBRIDGE_DB_PATH`

- 作用：SQLite 数据库文件路径  
  Purpose: SQLite database file path.
- 是否必填：否  
  Required: no.
- 默认值：`./agentbridge.db`  
  Default: `./agentbridge.db`.

说明：  
Notes:

- 这是文件路径，不是需要手动创建的数据库文件  
  This is a file path, not a database file you must create manually.
- AgentBridge 会在首次运行时自动创建数据库  
  AgentBridge will create the database automatically on first run.

### `AGENTBRIDGE_ALLOWED_CWDS`

- 作用：允许使用的工作目录白名单  
  Purpose: whitelist of allowed working directories.
- 是否必填：是  
  Required: yes.
- 格式：多个绝对路径用英文逗号分隔  
  Format: absolute paths separated by commas.

示例：  
Example:

```env
AGENTBRIDGE_ALLOWED_CWDS=E:/project-a,E:/project-b
```

说明：  
Notes:

- 必须使用绝对路径  
  You must use absolute paths.
- 所有 session 初始化都只能从这份白名单里选择 cwd  
  All session setup flows must choose cwd from this whitelist.

### `AGENTBRIDGE_DEFAULT_AGENT`

- 作用：平台流程没有显式选 agent 时的兜底值  
  Purpose: fallback agent when a platform flow does not select one explicitly.
- 是否必填：否  
  Required: no.
- 可选值：`claude`、`codex`  
  Allowed values: `claude`, `codex`.

### `AGENTBRIDGE_DEFAULT_TIMEOUT_MS`

- 作用：默认超时时间  
  Purpose: default timeout for runs.
- 是否必填：否  
  Required: no.
- 默认值：`1800000`  
  Default: `1800000`.

## 2. 代理配置 / Proxy Settings

### `AGENTBRIDGE_HTTP_PROXY`
### `AGENTBRIDGE_HTTPS_PROXY`

- 作用：给平台 SDK 和 agent 子进程注入代理  
  Purpose: proxy used by platform SDKs and agent child processes.
- 是否必填：否  
  Required: no.

如果这台机器可以直接访问 Feishu / Slack / 模型服务，这两项留空即可。  
Leave these empty if the machine can access Feishu / Slack / model providers directly.

只有本地环境必须经过代理时才填写。  
Only fill them when the local environment must use a proxy.

示例：  
Example:

```env
AGENTBRIDGE_HTTP_PROXY=http://127.0.0.1:10088
AGENTBRIDGE_HTTPS_PROXY=http://127.0.0.1:10088
```

## 3. Claude 配置 / Claude Settings

### `AGENTBRIDGE_CLAUDE_COMMAND`

- 作用：Claude 可执行文件路径  
  Purpose: Claude executable path.
- 默认值：`claude`  
  Default: `claude`.

说明：  
Notes:

- 如果一台机器上有多个 Claude 可执行文件，建议使用绝对路径  
  If the machine has multiple Claude binaries, use an absolute path.
- 这是最容易在不同机器之间配错的字段之一  
  This is one of the easiest fields to misconfigure across machines.

### `AGENTBRIDGE_CLAUDE_ARGS`

- 作用：Claude 正常执行参数  
  Purpose: arguments used for normal Claude execution.
- 通常不需要修改  
  Usually you do not need to change this.

### `AGENTBRIDGE_CLAUDE_RESUME_ARGS`

- 作用：Claude 恢复会话参数模板  
  Purpose: arguments used when resuming a Claude session.
- `{sessionId}` 是占位符  
  `{sessionId}` is a placeholder.
- 通常不需要修改  
  Usually you do not need to change this.

### `AGENTBRIDGE_CLAUDE_OUTPUT_MODE`

- 作用：Claude 输出解析模式  
  Purpose: Claude output parsing mode.
- 可选值：`text`、`claude_json`  
  Allowed values: `text`, `claude_json`.
- 默认值：`claude_json`  
  Default: `claude_json`.

示例：  
Example:

```env
AGENTBRIDGE_CLAUDE_COMMAND=E:/nodejs/claude.cmd
AGENTBRIDGE_CLAUDE_ARGS=-p --output-format json --permission-mode bypassPermissions
AGENTBRIDGE_CLAUDE_RESUME_ARGS=-p --output-format json --permission-mode bypassPermissions -r {sessionId}
AGENTBRIDGE_CLAUDE_OUTPUT_MODE=claude_json
```

## 4. Codex 配置 / Codex Settings

### `AGENTBRIDGE_CODEX_COMMAND`

- 作用：启动 Codex 的外层命令  
  Purpose: outer command used to launch Codex.
- 默认值：`node`  
  Default: `node`.

说明：  
Notes:

- 默认配置里 `node` 是正常的  
  `node` is normal in the default setup.
- 这并不代表 Codex 本体缺失  
  This does not mean Codex itself is missing.
- 真正的 Codex 入口在 `AGENTBRIDGE_CODEX_ARGS` 中  
  The real Codex entry point lives in `AGENTBRIDGE_CODEX_ARGS`.

### `AGENTBRIDGE_CODEX_ARGS`

- 作用：Codex 正常执行参数  
  Purpose: arguments used for normal Codex execution.
- 通常不需要修改  
  Usually you do not need to change this.

### `AGENTBRIDGE_CODEX_RESUME_ARGS`

- 作用：Codex 恢复会话参数模板  
  Purpose: arguments used when resuming a Codex session.
- 通常不需要修改  
  Usually you do not need to change this.

### `AGENTBRIDGE_CODEX_OUTPUT_MODE`

- 作用：Codex 输出解析模式  
  Purpose: Codex output parsing mode.
- 可选值：`text`、`claude_json`、`codex_text`  
  Allowed values: `text`, `claude_json`, `codex_text`.
- 默认值：`codex_text`  
  Default: `codex_text`.

默认示例：  
Default example:

```env
AGENTBRIDGE_CODEX_COMMAND=node
AGENTBRIDGE_CODEX_ARGS=node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_RESUME_ARGS=node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_OUTPUT_MODE=codex_text
```

## 5. Slack 配置 / Slack Settings

只有当 `AGENTBRIDGE_ENABLED_PLATFORMS` 包含 `slack` 时才需要填写。  
These are required only when `AGENTBRIDGE_ENABLED_PLATFORMS` includes `slack`.

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_ALLOWED_USER_ID`

Slack 的权限、scopes、App Home、事件订阅和 shortcut 配置见：  
See the following for Slack permissions, scopes, App Home, event subscriptions, and shortcut setup:

- [platforms/slack.md](platforms/slack.md)

## 6. 飞书配置 / Feishu / Lark Settings

只有当 `AGENTBRIDGE_ENABLED_PLATFORMS` 包含 `lark` 时才需要填写。  
These are required only when `AGENTBRIDGE_ENABLED_PLATFORMS` includes `lark`.

- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_ALLOWED_USER_ID`

可选项：  
Optional:

- `LARK_ENCRYPT_KEY`
- `LARK_VERIFICATION_TOKEN`

长连接模式下，可选加密字段可以留空。  
In long-connection mode, the optional encryption fields can stay empty.

飞书的话题模式、共享卡片和长连接说明见：  
See the following for Feishu topic mode, shared cards, and long-connection notes:

- [platforms/lark.md](platforms/lark.md)

## 7. 常见误配 / Common Misconfigurations

- `AGENTBRIDGE_ALLOWED_CWDS` 为空  
  `AGENTBRIDGE_ALLOWED_CWDS` is empty.
- `AGENTBRIDGE_CLAUDE_COMMAND` 指向的不是你手动测试过的那个 `claude`  
  `AGENTBRIDGE_CLAUDE_COMMAND` points to a different `claude` than the one you tested manually.
- 明明不需要代理却填了代理  
  Proxy fields are filled even though the machine does not need a proxy.
- 某个平台被启用了，但对应凭据没有填  
  A platform is enabled but its credentials are missing.
- Slack 的 scopes 不完整  
  Slack scopes are incomplete.
- 同一个飞书机器人还连接给了 OpenClaw 之类的其他消费者  
  The same Feishu bot is also connected to another consumer such as OpenClaw.
