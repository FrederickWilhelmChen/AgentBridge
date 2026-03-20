# Slack 接入 / Slack Setup

这份文档说明如何把 Slack 接到 AgentBridge。  
This document explains how to connect Slack to AgentBridge.

## 适合什么场景 / When To Choose Slack

Slack 更适合这些场景：  
Slack is a good fit when:

- 你的团队本来就在 Slack 里协作  
  Your team already works in Slack.
- 你希望通过 modal 显式开启新会话  
  You want modal-based explicit session creation.
- 你希望把 thread 当成清晰的 session 边界  
  You want Slack threads to act as clear session boundaries.

## 必填环境变量 / Required Environment Variables

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack

SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
```

## 必须开启的能力 / Required App Capabilities

你的 Slack app 需要同时开启这些能力：  
Your Slack app must have all of the following enabled:

- `Socket Mode`
- `App Home` 的消息入口  
  App Home message entry.
- `Event Subscriptions`
- 一个全局 shortcut，callback id 必须是 `open_agent_console`  
  A global shortcut whose callback id is exactly `open_agent_console`.

## 必须订阅的事件 / Required Event Subscription

至少开启这个 bot event：  
Enable at least this bot event:

- `message.im`

这是 bot 私聊消息入口必需的事件。  
This event is required for bot direct messages.

## 必须授予的 Bot Scopes / Required Bot Scopes

至少确认有这些 scope：  
At minimum, confirm these scopes:

- `chat:write`
- `im:write`
- `im:history`
- `commands`
- `files:read`

作用分别是：  
Why they matter:

- `chat:write`：发送和更新 bot 消息  
  Send and update bot messages.
- `im:write`：启用私聊相关能力  
  Enable DM-related abilities.
- `im:history`：接收 bot 私聊事件  
  Receive bot DM message events.
- `commands`：支持全局 shortcut 流程  
  Support the global shortcut flow.
- `files:read`：读取图片和文件元数据  
  Read shared image and file metadata.

## 必须配置的 Shortcut / Required Shortcut

创建一个全局 shortcut：  
Create one global shortcut:

- callback id：`open_agent_console`  
  callback id: `open_agent_console`.

这是当前受支持的 Slack 新会话入口。  
This is the supported Slack new-session entry point.

## 当前交互模型 / Current Interaction Model

Slack 的交互模型是刻意收紧的：  
Slack behavior is intentionally strict:

- 新会话必须通过全局 shortcut 打开的 modal 创建  
  New sessions must be created through the global shortcut modal.
- 一个 Slack thread 就是一个 session  
  One Slack thread equals one session.
- thread 内 `agent` 固定  
  `agent` is fixed inside a thread.
- thread 内 `cwd` 固定  
  `cwd` is fixed inside a thread.
- 后续都在这个 thread 里继续  
  Follow-up messages continue in the same thread.

这样做是为了减少 session 串线和模型混乱。  
This is designed to reduce session confusion and model switching mistakes.

## 配置清单 / Setup Checklist

1. 创建或打开 Slack app  
   Create or open your Slack app.
2. 开启 `Socket Mode`  
   Enable `Socket Mode`.
3. 开启 `App Home`  
   Enable `App Home`.
4. 开启 App Home 的 messages tab  
   Enable the App Home messages tab.
5. 开启 `Event Subscriptions`  
   Enable `Event Subscriptions`.
6. 添加 bot event `message.im`  
   Add bot event `message.im`.
7. 添加必需的 bot scopes  
   Add the required bot scopes.
8. 创建全局 shortcut `open_agent_console`  
   Create the global shortcut `open_agent_console`.
9. 保存配置  
   Save changes.
10. 重新安装 app 到 workspace  
   Reinstall the app to the workspace.

## 联调步骤 / Suggested Validation Flow

1. 启动：  
   Start:

```bash
npm run doctor
npm run dev
```

2. 在 Slack 中打开全局 shortcut  
   Open the global shortcut in Slack.
3. 在 modal 中选择 agent、cwd 和 opening message  
   Choose agent, cwd, and opening message in the modal.
4. 确认 AgentBridge 发出 thread 根消息  
   Confirm that AgentBridge posts the thread root message.
5. 后续都在这个 thread 里继续  
   Continue inside the same thread.
6. 确认 session 不会意外切换 agent 或 cwd  
   Confirm that the session does not unexpectedly switch agent or cwd.

## 常见误配 / Common Mistakes

- 没开 `message.im`  
  `message.im` is not enabled.
- 没开 `App Home` 的 messages tab  
  The App Home messages tab is not enabled.
- 改完 scopes 或 events 后没有重新安装 app  
  The app was not reinstalled after changing scopes or events.
- `SLACK_ALLOWED_USER_ID` 配错  
  `SLACK_ALLOWED_USER_ID` is wrong.
- shortcut callback id 不是 `open_agent_console`  
  The shortcut callback id is not `open_agent_console`.

## 相关文档 / Related Docs

- [../installation.md](../installation.md)
- [../configuration.md](../configuration.md)
- [../usage.md](../usage.md)
- [../troubleshooting.md](../troubleshooting.md)
