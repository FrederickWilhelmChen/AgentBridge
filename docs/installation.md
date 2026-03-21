# 安装说明 / Installation

这份文档说明如何在本地安装并启动 AgentBridge。  
This document explains how to install and start AgentBridge locally.

## 推荐安装方式 / Recommended Setup Path

Windows:

```powershell
.\install.ps1
```

macOS / Linux:

```bash
chmod +x ./install.sh
./install.sh
```

安装脚本是推荐入口，因为它会：  
The installer is the recommended entry point because it will:

- 检查 `node` 和 `npm`  
  Check `node` and `npm`.
- 执行 `npm install`  
  Run `npm install`.
- 从 `.env.example` 生成 `.env`  
  Create `.env` from `.env.example`.
- 创建本地运行目录  
  Create local runtime directories.
- 询问平台和凭据的基础配置  
  Ask for the basic platform and credential settings.
- 运行 `npm run doctor`  
  Run `npm run doctor`.

## 前置条件 / Prerequisites

- 需要 Node.js 20+  
  Node.js 20+ is required.
- 需要本机可用的 Claude Code CLI 和/或 Codex CLI  
  A working local Claude Code CLI and/or Codex CLI is required.
- 至少要有一个 workspace 来源  
  You need at least one workspace source.
- 至少要接入一个平台应用  
  You need at least one platform app.
  - Slack
  - Feishu / Lark

## 手动安装 / Manual Installation

### 1. 安装依赖 / Install Dependencies

```bash
npm install
```

如果安装失败，先检查：  
If installation fails, first check:

- Node.js 版本是否过旧  
  Whether Node.js is too old.
- 机器是否需要代理  
  Whether the machine needs a proxy.
- `better-sqlite3` 是否能在这台机器上正常构建  
  Whether `better-sqlite3` can build correctly on this machine.

### 2. 创建 `.env` / Create `.env`

Windows:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

### 3. 填写必需配置 / Fill Required Settings

最小公共配置包括：  
The minimum common settings are:

- `AGENTBRIDGE_ENABLED_PLATFORMS`
- `AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS` 和/或 `AGENTBRIDGE_MANUAL_WORKSPACES`
- `AGENTBRIDGE_DEFAULT_AGENT`

然后再填写你实际使用的平台凭据。  
Then fill in the platform-specific credentials you actually use.

字段级说明见：  
Field-by-field details are in:

- [configuration.md](configuration.md)

## Agent CLI 配置 / Agent CLI Setup

AgentBridge 不内置 Claude 或 Codex，而是调用你机器上已安装的 CLI。  
AgentBridge does not embed Claude or Codex. It calls the CLIs already installed on your machine.

### Claude

重点字段：  
Important fields:

- `AGENTBRIDGE_CLAUDE_COMMAND`
- `AGENTBRIDGE_CLAUDE_ARGS`
- `AGENTBRIDGE_CLAUDE_RESUME_ARGS`
- `AGENTBRIDGE_CLAUDE_OUTPUT_MODE`

示例：  
Example:

```env
AGENTBRIDGE_CLAUDE_COMMAND=E:/nodejs/claude.cmd
AGENTBRIDGE_CLAUDE_ARGS=-p --output-format json --permission-mode bypassPermissions
AGENTBRIDGE_CLAUDE_RESUME_ARGS=-p --output-format json --permission-mode bypassPermissions -r {sessionId}
AGENTBRIDGE_CLAUDE_OUTPUT_MODE=claude_json
```

说明：  
Notes:

- `AGENTBRIDGE_CLAUDE_COMMAND` 应该指向你真正希望 AgentBridge 使用的 Claude 可执行文件  
  `AGENTBRIDGE_CLAUDE_COMMAND` should point to the actual Claude executable you want AgentBridge to use.
- 如果一台机器上有多个 `claude`，建议写绝对路径  
  If the machine has multiple `claude` binaries, use an absolute path.

### Codex

默认配置示例：  
Default setup example:

```env
AGENTBRIDGE_CODEX_COMMAND=node
AGENTBRIDGE_CODEX_ARGS=node_modules/@openai/codex/bin/codex.js exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_RESUME_ARGS=node_modules/@openai/codex/bin/codex.js exec resume {sessionId} --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -
AGENTBRIDGE_CODEX_OUTPUT_MODE=codex_text
```

说明：  
Notes:

- `AGENTBRIDGE_CODEX_COMMAND=node` 在默认配置里是正常的  
  `AGENTBRIDGE_CODEX_COMMAND=node` is normal in the default setup.
- 真正的 Codex 入口在 `AGENTBRIDGE_CODEX_ARGS` 中  
  The real Codex entry point lives in `AGENTBRIDGE_CODEX_ARGS`.

## 数据库与本地目录 / Database And Local Directories

- `AGENTBRIDGE_DB_PATH` 是文件路径，不需要手动创建数据库文件  
  `AGENTBRIDGE_DB_PATH` is a file path. You do not need to create the database file manually.
- AgentBridge 会在首次启动时自动创建 SQLite 数据库  
  AgentBridge will create the SQLite database automatically on first run.
- `.logs`、`.image-cache`、`.tmp` 这类本地目录会由安装脚本或运行时自动创建  
  Local directories such as `.logs`, `.image-cache`, and `.tmp` are created automatically by the installer or runtime.

## 代理 / Proxy

代理字段是可选的：  
Proxy fields are optional:

- `AGENTBRIDGE_HTTP_PROXY`
- `AGENTBRIDGE_HTTPS_PROXY`

如果这台机器可以直接访问 Feishu / Slack / 模型服务，就留空。  
Leave them empty if the machine can access Feishu / Slack / model providers directly.

只有本地环境必须经过 HTTP(S) 代理时才填写。  
Only fill them when the local environment must use an HTTP(S) proxy.

## 运行自检 / Run Doctor

启动服务之前先运行：  
Before starting the service, run:

```bash
npm run doctor
```

Doctor 会检查：  
Doctor checks:

- 数据库路径  
  Database path.
- workspace 配置  
  Workspace configuration.
- 代理状态  
  Proxy status.
- Claude 是否可达  
  Whether Claude is reachable.
- Codex 是否可达  
  Whether Codex is reachable.
- Git 是否可用，以及是否进入 plain-workspace 降级模式  
  Whether Git is available, and whether doctor has fallen back to plain-workspace mode.

## 启动服务 / Start The Service

开发模式：  
Development:

```bash
npm run dev
```

生产构建：  
Production build:

```bash
npm run build
npm run start
```

类型检查：  
Type check:

```bash
npm run check
```

## 下一步文档 / Next Docs

- [configuration.md](configuration.md)
- [usage.md](usage.md)
- [platforms/lark.md](platforms/lark.md)
- [platforms/slack.md](platforms/slack.md)
- [troubleshooting.md](troubleshooting.md)
