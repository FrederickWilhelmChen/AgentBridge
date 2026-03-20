# Feishu / Lark 接入 / Feishu / Lark Setup

这份文档说明如何把 Feishu / Lark 接到 AgentBridge。  
This document explains how to connect Feishu / Lark to AgentBridge.

## 适合什么场景 / When To Choose Feishu / Lark

Feishu / Lark 更适合这些场景：  
Feishu / Lark is a good fit when:

- 你本来就在飞书里工作  
  You already work in Feishu.
- 你希望本机长期自用，不暴露公网 webhook  
  You want local self-hosting without exposing a public webhook.
- 你更喜欢“话题模式”，而不是严格的逐条回复模式  
  You prefer topic mode instead of strict reply-to-the-last-message behavior.

## 必填环境变量 / Required Environment Variables

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark

LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
```

可选项：  
Optional:

```env
LARK_ENCRYPT_KEY=
LARK_VERIFICATION_TOKEN=
```

在长连接模式下，这两个可选项可以先留空。  
In long-connection mode, these optional fields can stay empty.

## 当前接入方式 / Current Access Mode

AgentBridge 使用 Feishu / Lark 官方长连接模式。  
AgentBridge uses the official Feishu / Lark long-connection mode.

这意味着：  
That means:

- 不需要公网回调地址  
  No public callback URL is needed.
- 不需要内网穿透  
  No local tunnel is needed.
- 不需要暴露本地 webhook 服务  
  No local webhook server needs to be exposed.

这很适合本地自托管。  
This is a strong fit for local self-hosting.

## 当前交互模型 / Current Interaction Model

推荐使用“话题模式”：  
The recommended flow is topic mode:

1. 发送一条根消息，例如：  
   Send a root message such as:
   - `start`
   - `@Bot start`
2. AgentBridge 会在初始化阶段引导你选择一次 agent 和 cwd  
   AgentBridge will guide you through choosing agent and cwd once during setup.
3. 初始化完成后，后续都在同一个话题里继续  
   After setup, continue inside the same topic.
4. AgentBridge 会先发送一张处理中共享卡片  
   AgentBridge will first send a processing shared card.
5. 完成后更新同一张卡片为最终结果  
   The same card is then updated with the final result.

你不需要每次都回复上一条 bot 消息。  
You should not need to reply to the previous bot message every time.

## 联调步骤 / Suggested Validation Flow

1. 启动：  
   Start:

```bash
npm run doctor
npm run dev
```

2. 确认日志里出现 Lark 长连接启动成功  
   Confirm that the process logs successful Lark long-connection startup.
3. 在飞书里发送根消息：  
   In Feishu, send a root message:

```text
@YourBot start
```

4. 在同一个话题里继续：  
   Continue inside the same topic:
   - 完成 agent 选择  
     Choose the agent.
   - 完成 cwd 选择  
     Choose the cwd.
   - 然后开始发送真实任务  
     Then start sending real prompts.
5. 确认先看到一张处理中卡片  
   Confirm that you first see a processing card.
6. 确认同一张卡片被更新为最终结果  
   Confirm that the same card gets updated to the final result.

## 常见误配 / Common Mistakes

- `AGENTBRIDGE_ENABLED_PLATFORMS` 里没有 `lark`  
  `AGENTBRIDGE_ENABLED_PLATFORMS` does not include `lark`.
- `LARK_ALLOWED_USER_ID` 配错  
  `LARK_ALLOWED_USER_ID` is wrong.
- 飞书后台没有配成长连接模式  
  The Feishu app is not configured for long-connection mode.
- 本机需要代理但没有配置代理  
  The machine needs a proxy but proxy is not configured.
- 同一个机器人被别的服务同时消费  
  Another service is consuming events from the same bot.

## 不要和 OpenClaw 共用同一个机器人 / Do Not Share The Same Bot With OpenClaw

这一点非常重要：  
This point is important enough to call out explicitly:

- 如果同一个 Feishu bot 同时连接了 OpenClaw 和 AgentBridge  
  If the same Feishu bot is connected to both OpenClaw and AgentBridge.
- 两边会竞争同一条事件流  
  The two services can compete for the same event stream.
- 结果就是消息丢失、投递看起来随机、回复跑到另一边去  
  That leads to missing messages, random-looking delivery, or replies appearing on the wrong side.

建议做法：  
Practical recommendation:

- 测试 AgentBridge 时先停掉 OpenClaw  
  Stop OpenClaw before testing AgentBridge.
- 或者单独为 AgentBridge 新建一个 Feishu 机器人  
  Or create a dedicated Feishu bot for AgentBridge.

## 图片说明 / Notes About Images

飞书图片消息通过消息资源下载接口处理。  
Feishu image messages are handled through the message resource download API.

如果图片处理失败，先检查：  
If image handling fails, first check:

- 机器人能力是否开启  
  Whether bot capability is enabled.
- 图片消息是否来自同一个机器人会话  
  Whether the image message belongs to the same bot conversation.
- 本地网络或代理能否访问 Feishu OpenAPI  
  Whether the local network or proxy can reach Feishu OpenAPI.

## 相关文档 / Related Docs

- [../installation.md](../installation.md)
- [../configuration.md](../configuration.md)
- [../usage.md](../usage.md)
- [../troubleshooting.md](../troubleshooting.md)
