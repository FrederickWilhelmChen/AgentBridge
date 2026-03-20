# AgentBridge

AgentBridge 是一个本地消息桥接服务，用来从聊天平台远程驱动本机的 Claude Code 和 Codex 会话。

当前实现支持 Slack 与飞书/Lark，使用 SQLite 持久化会话和运行记录，支持轻量级文本意图路由，并且可以把图片附件缓存到本地后传递给本地 agent。

## 功能概览

- 通过 Slack Bolt Socket Mode 接入 Slack
- 通过飞书/Lark 官方长连接 SDK 接入飞书/Lark
- 支持控制命令和普通 AI 请求共用同一个聊天入口
- 支持持久会话的创建、复用、重置和状态查询
- 没有持久会话时自动退回到单次执行
- 支持把图片附件本地缓存后附加到 prompt
- 使用 SQLite 存储 session、run 和消息去重记录
- 支持分别配置 Claude 和 Codex 的命令行适配方式
- Windows 下支持自动探测系统代理
- 提供 `doctor` 环境诊断命令

## 环境要求

- Node.js 20+
- Windows 是当前主要验证环境
- 本机可用的 Claude Code CLI 和/或 Codex CLI
- Slack 和/或飞书/Lark 应用凭据
- 至少一个允许切换到的工作目录

## 快速启动

1. 安装依赖

```bash
npm install
```

2. 初始化环境变量

```bash
copy .env.example .env
```

3. 至少填写这组基础配置

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project
AGENTBRIDGE_DEFAULT_AGENT=codex
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
```

4. 运行环境自检

```bash
npm run doctor
```

5. 启动服务

```bash
npm run dev
```

如果你需要完整安装、配置和平台接入说明，直接看下方文档导航。

## 常用命令

```bash
npm run dev
npm run build
npm run check
npm run start
npm run doctor
```

## 聊天侧常见指令

- `status`
- `new session`
- `restart session`
- `stop`
- `interrupt`
- `set cwd E:/your/project`
- `use claude inspect this repo`
- `use codex debug this build failure`

说明：

- 如果消息里明确提到 `claude` 或 `codex`，会优先使用对应 agent
- 如果当前平台用户已经存在持久会话，会优先把消息发到该会话
- 如果不存在持久会话，会自动退回到单次执行

## 文档导航

- [安装指南](docs/installation.md)
- [配置说明](docs/configuration.md)
- [使用说明](docs/usage.md)
- [Slack 接入](docs/platforms/slack.md)
- [飞书 / Lark 接入](docs/platforms/lark.md)
- [排障指南](docs/troubleshooting.md)

## 当前限制

- 当前输出是任务完成后一次性返回，还没有流式输出
- `interrupt` 只能中断当前 AgentBridge 进程启动的任务
- 意图路由是浅层规则，不支持复杂复合动作编排
- 当前访问控制更偏单平台单用户模型
- 中文命令别名只覆盖少量控制命令

## 开发相关

常用源码目录：

- `src/app`：启动、配置、日志、诊断
- `src/slack`：Slack 集成
- `src/platform/lark`：飞书/Lark 集成
- `src/services` 和 `src/intent`：消息路由与核心业务逻辑
- `src/runtime`：进程管理、图片缓存、运行时工具
- `src/store`：SQLite 存储层
