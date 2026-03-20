# 配置说明

本文档按功能分组解释 AgentBridge 使用到的环境变量。变量名以运行时代码和 `.env.example` 为准。

## 1. 基础运行配置

### `AGENTBRIDGE_ENABLED_PLATFORMS`

- 作用：启用哪些聊天平台
- 是否必填：建议显式填写
- 可选值：`slack`、`lark`、`slack,lark`
- 默认值：`slack`

示例：

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack,lark
```

### `AGENTBRIDGE_DB_PATH`

- 作用：SQLite 数据库文件路径
- 是否必填：否
- 默认值：`./agentbridge.db`

### `AGENTBRIDGE_ALLOWED_CWDS`

- 作用：定义允许切换到的工作目录白名单
- 是否必填：是
- 格式：多个绝对路径用英文逗号分隔

示例：

```env
AGENTBRIDGE_ALLOWED_CWDS=E:/project-a,E:/project-b
```

注意：

- 这里必须是绝对路径
- 消息里的 `set cwd` 或路径切换只能落在这组白名单中

### `AGENTBRIDGE_DEFAULT_AGENT`

- 作用：没有明确提及 agent 时使用哪个默认 agent
- 是否必填：否
- 可选值：`claude`、`codex`
- 默认值：`codex`

### `AGENTBRIDGE_DEFAULT_TIMEOUT_MS`

- 作用：单次执行和持久会话执行的默认超时时间
- 是否必填：否
- 默认值：`1800000`

## 2. 代理配置

### `AGENTBRIDGE_HTTP_PROXY`
### `AGENTBRIDGE_HTTPS_PROXY`

- 作用：给子进程注入 HTTP / HTTPS 代理
- 是否必填：否

示例：

```env
AGENTBRIDGE_HTTP_PROXY=http://127.0.0.1:10088
AGENTBRIDGE_HTTPS_PROXY=http://127.0.0.1:10088
```

说明：

- 如果未设置，程序会回退到 `HTTP_PROXY` / `HTTPS_PROXY`
- 在 Windows 上还会尝试探测系统代理

## 3. Claude 配置

### `AGENTBRIDGE_CLAUDE_COMMAND`

- 作用：Claude CLI 主命令
- 默认值：`claude`

### `AGENTBRIDGE_CLAUDE_ARGS`

- 作用：新建或单次执行时使用的参数
- 默认值：`-p --output-format json --permission-mode bypassPermissions`

### `AGENTBRIDGE_CLAUDE_RESUME_ARGS`

- 作用：恢复持久会话时使用的参数模板
- 默认值：`-p --output-format json --permission-mode bypassPermissions -r {sessionId}`

### `AGENTBRIDGE_CLAUDE_OUTPUT_MODE`

- 作用：Claude 输出解析方式
- 可选值：`text`、`claude_json`
- 默认值：`claude_json`

示例：

```env
AGENTBRIDGE_CLAUDE_COMMAND=E:/nodejs/claude.cmd
AGENTBRIDGE_CLAUDE_ARGS=-p --output-format json --permission-mode bypassPermissions
AGENTBRIDGE_CLAUDE_RESUME_ARGS=-p --output-format json --permission-mode bypassPermissions -r {sessionId}
AGENTBRIDGE_CLAUDE_OUTPUT_MODE=claude_json
```

## 4. Codex 配置

### `AGENTBRIDGE_CODEX_COMMAND`

- 作用：Codex CLI 主命令
- 默认值：`node`

### `AGENTBRIDGE_CODEX_ARGS`

- 作用：新建或单次执行时使用的参数
- 默认值：

```text
node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
```

### `AGENTBRIDGE_CODEX_RESUME_ARGS`

- 作用：恢复持久会话时使用的参数模板
- 默认值：

```text
node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
```

### `AGENTBRIDGE_CODEX_OUTPUT_MODE`

- 作用：Codex 输出解析方式
- 可选值：`text`、`claude_json`、`codex_text`
- 默认值：`codex_text`

## 5. Slack 配置

仅当 `AGENTBRIDGE_ENABLED_PLATFORMS` 启用 `slack` 时需要：

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_ALLOWED_USER_ID`

示例：

```env
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
```

详细接入要求见 [platforms/slack.md](platforms/slack.md)。

## 6. 飞书 / Lark 配置

仅当 `AGENTBRIDGE_ENABLED_PLATFORMS` 启用 `lark` 时需要：

- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_ALLOWED_USER_ID`
- `LARK_ENCRYPT_KEY`
- `LARK_VERIFICATION_TOKEN`

示例：

```env
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
LARK_ENCRYPT_KEY=
LARK_VERIFICATION_TOKEN=
```

详细接入要求见 [platforms/lark.md](platforms/lark.md)。

## 7. 常见配置组合

### 仅启用 Slack

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project
AGENTBRIDGE_DEFAULT_AGENT=codex
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
```

### 仅启用飞书 / Lark

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project
AGENTBRIDGE_DEFAULT_AGENT=codex
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
```

### 同时启用两个平台

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack,lark
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project
AGENTBRIDGE_DEFAULT_AGENT=codex
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
```

## 8. 常见坑

- `AGENTBRIDGE_ALLOWED_CWDS` 为空会导致配置校验失败
- 工作目录不在白名单中时，切换目录和执行都会报错
- 平台启用了但对应凭据缺失时，启动阶段就会失败
- CLI 命令存在但 `--help` 无法正常返回时，`doctor` 会显示不可达
