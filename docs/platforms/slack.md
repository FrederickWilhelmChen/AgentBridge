# Slack 接入

本文档说明如何为 AgentBridge 配置 Slack。

## 1. 所需环境变量

```env
SLACK_BOT_TOKEN=xoxb-your-token
SLACK_APP_TOKEN=xapp-your-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_ALLOWED_USER_ID=U0123456789
```

说明：

- `SLACK_ALLOWED_USER_ID` 用来限制允许操作 AgentBridge 的 Slack 用户

## 2. Slack App 基本要求

你的 Slack App 至少需要满足：

- 开启 Socket Mode
- 允许 bot 私聊
- 配置一个 callback ID 为 `open_agent_console` 的全局快捷入口
- 具备打开视图和发送消息所需权限

## 3. 建议 scopes

至少确认这些 scopes 已启用：

- `commands`
- `chat:write`
- `im:write`
- `im:history`

根据你的使用方式，可能还需要：

- `users:read`
- `channels:history`

## 4. 启用 Slack 平台

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack
```

然后填写 Slack 凭据并启动：

```bash
npm run doctor
npm run dev
```

## 5. 如何验证

验证顺序建议如下：

1. 运行 `npm run doctor`，确认配置加载正常
2. 启动服务后确认日志中没有 Slack 启动错误
3. 从允许的 Slack 用户给 bot 发送私聊消息
4. 先测试 `status`、`new session`，再测试普通 prompt

## 6. 当前说明

- Slack 是当前默认文档示例中的主要平台
- 最近如果你的 Slack 接入链路发生过变更，建议在本地重新校验权限和事件链路
- 如果 bot 能启动但消息无响应，优先回查用户 ID、scopes 和 Socket Mode 配置

## 7. 相关文档

- 总体配置见 [../configuration.md](../configuration.md)
- 使用说明见 [../usage.md](../usage.md)
- 排障见 [../troubleshooting.md](../troubleshooting.md)
