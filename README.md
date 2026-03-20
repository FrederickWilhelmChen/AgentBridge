# AgentBridge

这是一个把聊天平台和本机 Agent CLI 连接起来的桥接服务。  
This is a bridge service that connects chat platforms to local agent CLIs.

你可以在 Feishu / Lark 或 Slack 中驱动本机的 Claude Code、Codex，以及后续可扩展的其他 agent CLI。  
You can use Feishu / Lark or Slack to drive local Claude Code, Codex, and other agent CLIs that may be added later.

## 平台交互方式
## Platform Interaction Model

### Feishu / Lark

- 推荐使用“话题模式”  
  Topic mode is the recommended interaction pattern.
- 先发送一条根消息，例如 `start` 或 `@Bot start`  
  First send a root message such as `start` or `@Bot start`.
- 只在初始化阶段选择一次 agent 和工作目录  
  Agent and working directory are chosen only once during setup.
- 初始化完成后，后续都在同一个话题里继续发送任务  
  After setup, keep sending follow-up tasks in the same topic.
- AgentBridge 会先回复一张处理中共享卡片，完成后再更新同一张卡片  
  AgentBridge first replies with a processing card, then updates the same card with the final result.

### Slack

- 推荐使用“modal-first”模式  
  Modal-first is the recommended interaction pattern.
- 通过全局 shortcut 打开新会话  
  Use the global shortcut to open a new session.
- 一个 Slack thread 就是一个 session  
  One Slack thread equals one session.
- 只在创建 session 时选择 agent 和工作目录  
  Agent and working directory are chosen only when the session is created.
- 后续都在这个 thread 里继续，不在同一 thread 里切换 agent 或工作目录  
  Continue inside the same thread and do not switch agent or working directory in that thread.

## 快速开始
## Quick Start

Windows:

```powershell
.\install.ps1
```

macOS / Linux:

```bash
chmod +x ./install.sh
./install.sh
```

安装脚本会完成这些事：  
The installer will do the following:

- 检查 `node` 和 `npm`  
  Check `node` and `npm`.
- 执行 `npm install`  
  Run `npm install`.
- 按需从 `.env.example` 生成 `.env`  
  Create `.env` from `.env.example` when needed.
- 创建本地运行目录  
  Create local runtime directories.
- 询问平台、代理、默认 agent、允许的工作目录  
  Ask for platform, proxy, default agent, and allowed working directories.
- 继续询问 Slack 或 Feishu 所需配置  
  Ask for the required Slack or Feishu settings.
- 运行 `npm run doctor`  
  Run `npm run doctor`.
- 可选直接启动 `npm run dev`  
  Optionally start `npm run dev`.

## 手动安装
## Manual Setup

1. 安装依赖  
   Install dependencies.

```bash
npm install
```

2. 复制配置模板  
   Copy the config template.

Windows:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

3. 填写 `.env`  
   Fill in `.env`.

Feishu / Lark 示例：  
Feishu / Lark example:

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project

LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
```

Slack 所需权限、事件和 shortcut 配置见：  
For Slack permissions, events, and shortcut setup, see:

- [docs/platforms/slack.md](docs/platforms/slack.md)

4. 运行自检  
   Run doctor.

```bash
npm run doctor
```

5. 启动服务  
   Start the service.

```bash
npm run dev
```

## 重要配置说明
## Important Configuration Notes

- `AGENTBRIDGE_DB_PATH` 是数据库文件路径，不需要手动创建数据库文件  
  `AGENTBRIDGE_DB_PATH` is the database file path. You do not need to create the database file manually.
- `AGENTBRIDGE_HTTP_PROXY` 和 `AGENTBRIDGE_HTTPS_PROXY` 是可选项，只有本机必须走代理时才填写  
  `AGENTBRIDGE_HTTP_PROXY` and `AGENTBRIDGE_HTTPS_PROXY` are optional. Only fill them if the machine must use a proxy.
- `AGENTBRIDGE_CLAUDE_COMMAND` 是 Claude 可执行文件路径  
  `AGENTBRIDGE_CLAUDE_COMMAND` is the Claude executable path.
- `AGENTBRIDGE_CLAUDE_ARGS`、`AGENTBRIDGE_CLAUDE_RESUME_ARGS`、`AGENTBRIDGE_CODEX_ARGS`、`AGENTBRIDGE_CODEX_RESUME_ARGS` 一般不需要修改，除非你明确在做兼容性调整  
  `AGENTBRIDGE_CLAUDE_ARGS`, `AGENTBRIDGE_CLAUDE_RESUME_ARGS`, `AGENTBRIDGE_CODEX_ARGS`, and `AGENTBRIDGE_CODEX_RESUME_ARGS` usually do not need to be changed unless you are doing explicit compatibility tuning.
- `AGENTBRIDGE_CODEX_COMMAND=node` 在默认配置中是正常的，因为真正的 Codex 入口在 `AGENTBRIDGE_CODEX_ARGS`  
  `AGENTBRIDGE_CODEX_COMMAND=node` is normal in the default setup because the real Codex entry point lives in `AGENTBRIDGE_CODEX_ARGS`.

## 常用命令
## Common Commands

```bash
npm run dev
npm run build
npm run check
npm run start
npm run doctor
```

## 文档
## Documentation

- [安装说明 / Installation](docs/installation.md)
- [配置说明 / Configuration](docs/configuration.md)
- [使用说明 / Usage](docs/usage.md)
- [Slack 接入 / Slack Setup](docs/platforms/slack.md)
- [Feishu / Lark 接入 / Feishu / Lark Setup](docs/platforms/lark.md)
- [排障说明 / Troubleshooting](docs/troubleshooting.md)

## 当前限制
## Current Limitations

- 目前还是“最终结果优先”，还没有真正的流式输出  
  Output is still final-result-first, not true token streaming.
- 文本控制目前只保留很少量的中断语义，不再依赖完整意图路由  
  Text control now keeps only a very small interruption surface and no longer depends on a full intent-routing model.
- 当前访问控制更偏向单用户本地自托管  
  Access control is still optimized for single-user local self-hosting.
- 不同机器上的 Claude / Codex CLI 行为仍可能存在差异  
  Claude / Codex CLI behavior can still vary across different machines.
