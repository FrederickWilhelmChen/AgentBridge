# 安装指南

本文档说明如何在本地安装并启动 AgentBridge。

## 1. 前置要求

- Node.js 20 或更高版本
- Windows 是当前主要验证环境
- 已安装并可调用的 Claude Code CLI 和/或 Codex CLI
- 至少一个准备授权给 AgentBridge 使用的工作目录
- 至少一个聊天平台的应用凭据：
  - Slack
  - 飞书 / Lark

## 2. 获取代码并安装依赖

```bash
npm install
```

如果依赖安装失败，优先确认：

- Node 版本是否过低
- 本机网络是否需要代理
- `better-sqlite3` 的原生依赖是否能正常安装

## 3. 初始化环境变量

复制示例文件：

```bash
copy .env.example .env
```

最少需要配置：

- `AGENTBRIDGE_ENABLED_PLATFORMS`
- `AGENTBRIDGE_ALLOWED_CWDS`
- `AGENTBRIDGE_DEFAULT_AGENT`
- 对应平台的凭据

完整配置解释见 [configuration.md](configuration.md)。

## 4. 配置本地 agent CLI

AgentBridge 不直接内置 Claude 或 Codex，它会调用你本机已有的命令行工具。

### Claude

默认会读取：

- `AGENTBRIDGE_CLAUDE_COMMAND`
- `AGENTBRIDGE_CLAUDE_ARGS`
- `AGENTBRIDGE_CLAUDE_RESUME_ARGS`
- `AGENTBRIDGE_CLAUDE_OUTPUT_MODE`

如果你在 Windows 上通过自定义路径安装 Claude Code CLI，可以像这样配置：

```env
AGENTBRIDGE_CLAUDE_COMMAND=E:/nodejs/claude.cmd
AGENTBRIDGE_CLAUDE_ARGS=-p --output-format json --permission-mode bypassPermissions
AGENTBRIDGE_CLAUDE_RESUME_ARGS=-p --output-format json --permission-mode bypassPermissions -r {sessionId}
AGENTBRIDGE_CLAUDE_OUTPUT_MODE=claude_json
```

### Codex

默认配置通过本仓库依赖里的 `@openai/codex` 调用 Codex：

```env
AGENTBRIDGE_CODEX_COMMAND=node
AGENTBRIDGE_CODEX_ARGS=node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_RESUME_ARGS=node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_OUTPUT_MODE=codex_text
```

这样做的好处是避免依赖 WindowsApps shim。

## 5. 配置网络代理

如果你的环境依赖本地代理，显式设置：

```env
AGENTBRIDGE_HTTP_PROXY=http://127.0.0.1:10088
AGENTBRIDGE_HTTPS_PROXY=http://127.0.0.1:10088
```

在 Windows 上，如果没有显式设置，AgentBridge 会尝试从 Internet Settings 自动探测系统代理。

## 6. 运行环境自检

启动前先执行：

```bash
npm run doctor
```

这个命令会输出：

- 数据库路径
- 允许的工作目录
- 代理配置
- Claude 命令是否可达
- Codex 命令是否可达

如果 `doctor` 显示命令不可达，优先修复 CLI 路径和环境变量，再启动服务。

## 7. 启动服务

开发模式：

```bash
npm run dev
```

构建：

```bash
npm run build
```

运行构建产物：

```bash
npm run start
```

类型检查：

```bash
npm run check
```

## 8. 下一步

- 平台接入见 [platforms/slack.md](platforms/slack.md) 和 [platforms/lark.md](platforms/lark.md)
- 使用方式见 [usage.md](usage.md)
- 排障见 [troubleshooting.md](troubleshooting.md)
