# 排障指南 / Troubleshooting

这个页面集中说明 AgentBridge 最常见的问题。  
This page collects the most common AgentBridge problems.

## 1. 先跑 doctor / Start With Doctor

始终先运行：  
Always start with:

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
  Claude reachability.
- Codex 是否可达  
  Codex reachability.

如果 doctor 已经失败，优先修本地环境。  
If doctor already fails, fix the local environment first.

## 2. Claude 或 Codex 不可达 / Claude Or Codex Cannot Be Reached

典型现象：  
Typical symptoms:

- `doctor` 提示 `reachable: no`  
  `doctor` says `reachable: no`.
- 任务一开始就立即失败  
  Task execution fails immediately.

优先检查：  
Check:

- `AGENTBRIDGE_CLAUDE_COMMAND` 或 `AGENTBRIDGE_CODEX_COMMAND` 是否正确  
  Whether `AGENTBRIDGE_CLAUDE_COMMAND` or `AGENTBRIDGE_CODEX_COMMAND` is correct.
- 同一 shell 里手动执行命令是否正常  
  Whether the command works directly in the same shell.
- `--help` 是否能正常退出  
  Whether `--help` exits normally.
- 是否应该用绝对路径而不是依赖 PATH  
  Whether you should use an absolute path instead of relying on PATH.

Claude 相关的特别提醒：  
Important Claude-specific warning:

- 你手动测试的 `claude` 可能不是 AgentBridge 运行时解析到的那个 `claude`  
  The `claude` you test manually may not be the same `claude` that AgentBridge resolves at runtime.
- 如果一台机器上有多个 Claude，可显式填写 `AGENTBRIDGE_CLAUDE_COMMAND`  
  If the machine has multiple Claude binaries, set `AGENTBRIDGE_CLAUDE_COMMAND` explicitly.

## 3. 配置校验失败 / Configuration Validation Fails

常见原因：  
Common causes:

- `AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS` 和 `AGENTBRIDGE_MANUAL_WORKSPACES` 都为空  
  `AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS` and `AGENTBRIDGE_MANUAL_WORKSPACES` are both empty.
- 启用了 `slack`，但 Slack 凭据没有填  
  `slack` is enabled but Slack credentials are missing.
- 启用了 `lark`，但 Lark 凭据没有填  
  `lark` is enabled but Lark credentials are missing.
- `AGENTBRIDGE_DEFAULT_AGENT` 的值非法  
  `AGENTBRIDGE_DEFAULT_AGENT` has an invalid value.

建议处理顺序：  
Fix strategy:

- 对照 [configuration.md](configuration.md) 检查 `.env`  
  Compare `.env` against [configuration.md](configuration.md).
- 先让一个平台工作起来  
  Get one platform working first.
- 再按需启用第二个平台  
  Then enable the second platform if needed.

## 4. Git 不可用 / Git Is Not Available

典型现象：  
Typical symptoms:

- `doctor` 明确提示 Git 不可用  
  `doctor` explicitly reports that Git is unavailable.
- repo discovery 被关闭  
  Repo discovery is disabled.
- worktree 相关能力不可用  
  Worktree-related features are unavailable.

说明：  
Notes:

- 这不是致命错误  
  This is not a fatal error.
- plain workspace 仍然可以正常使用  
  Plain workspaces still work normally.
- 如果你本来就不处理 Git repo，可以忽略这一项  
  If you do not work with Git repos, you can ignore this.

## 5. 代理问题 / Proxy Problems

典型现象：  
Typical symptoms:

- 依赖安装失败  
  Dependency install fails.
- 平台 SDK 连不上  
  Platform SDKs cannot connect.
- agent CLI 连不上模型服务  
  Agent CLI cannot reach model providers.

优先检查：  
Check:

- 这台机器是否真的需要代理  
  Whether the machine actually needs a proxy.
- `AGENTBRIDGE_HTTP_PROXY` 和 `AGENTBRIDGE_HTTPS_PROXY` 是否误填  
  Whether `AGENTBRIDGE_HTTP_PROXY` and `AGENTBRIDGE_HTTPS_PROXY` are wrongly filled.
- 系统代理和本地代理是否冲突  
  Whether system proxy and local proxy conflict.

说明：  
Important:

- 代理字段是可选的  
  Proxy fields are optional.
- 不要因为 `.env.example` 里有这些字段就机械地填写  
  Do not fill them just because they exist in `.env.example`.

## 6. Slack 无响应 / Slack Does Not Respond

优先检查这些项：  
Check these first:

- `SLACK_ALLOWED_USER_ID` 是否正确  
  `SLACK_ALLOWED_USER_ID` is correct.
- `Socket Mode` 是否开启  
  Socket Mode is enabled.
- `App Home` 消息入口是否开启  
  App Home message entry is enabled.
- `Event Subscriptions` 是否开启  
  Event Subscriptions is enabled.
- 是否订阅了 `message.im`  
  `message.im` is subscribed.
- 必需的 scopes 是否完整  
  Required scopes are present.
- 全局 shortcut 的 callback id 是否正好是 `open_agent_console`  
  The global shortcut callback id is exactly `open_agent_console`.
- 改完 scopes 或 events 后是否重新安装了 app  
  The app was reinstalled after changing scopes or events.

完整清单见：  
See the full checklist in:

- [platforms/slack.md](platforms/slack.md)

## 7. 飞书无响应 / Feishu / Lark Does Not Respond

优先检查这些项：  
Check these first:

- `LARK_APP_ID` 和 `LARK_APP_SECRET` 是否正确  
  `LARK_APP_ID` and `LARK_APP_SECRET` are correct.
- `LARK_ALLOWED_USER_ID` 是否正确  
  `LARK_ALLOWED_USER_ID` is correct.
- `AGENTBRIDGE_ENABLED_PLATFORMS` 是否包含 `lark`  
  `AGENTBRIDGE_ENABLED_PLATFORMS` includes `lark`.
- 飞书应用是否配置成长连接模式  
  Long-connection mode is configured in the Feishu app.
- 本地网络或代理是否阻断了 SDK  
  Local network or proxy is not blocking the SDK.

正常的话题模式说明见：  
See the normal topic-mode flow in:

- [platforms/lark.md](platforms/lark.md)

## 8. 重要：飞书机器人冲突 / Very Important: Shared Feishu Bot Conflict

不要把同一个飞书机器人同时连接给 AgentBridge 和 OpenClaw。  
Do not connect the same Feishu bot to both AgentBridge and OpenClaw at the same time.

这会导致：  
This can cause:

- 两边抢同一份事件  
  Both services compete for the same event stream.
- 消息时有时无  
  Missing messages.
- 回复错乱  
  Misrouted replies.
- 看起来像随机失效  
  Random-looking delivery failures.

建议做法：  
Practical rule:

- 要么先停掉 OpenClaw  
  Either stop OpenClaw first.
- 要么单独给 AgentBridge 新建一个飞书机器人  
  Or create a separate Feishu bot for AgentBridge.

这不是小概率边角问题，而是会直接打乱消息接收体验。  
This is not a minor edge case. It can completely break message delivery expectations.

## 9. 飞书共享卡片不回写 / Feishu Progress Card Does Not Update

优先检查：  
Check:

- 初始卡片是否创建成功  
  Whether the initial card was created successfully.
- 机器人是否被允许更新共享卡片  
  Whether the bot is allowed to update shared cards.
- 回复消息 id 是否正确返回  
  Whether the reply message id was returned correctly.
- 是否有其他消费者干扰了同一个机器人  
  Whether another consumer is interfering with the same bot.

如果工作已经完成，但卡片还停留在处理中，重点看 Lark 更新步骤附近的运行日志。  
If the work finished but the card stayed in processing, inspect runtime logs around the Lark update step.

## 10. 当前实现边界 / Known Product Limits

这些是当前边界，不一定是 bug：  
These are current limits, not necessarily bugs:

- 输出仍然是结果优先，不是完整流式  
  Output is still final-result oriented, not fully streaming.
- `interrupt` 只影响当前 AgentBridge 进程发起的工作  
  `interrupt` only affects work launched by the current AgentBridge process.
- Git workspace 的 managed worktree 已经支持，但平台侧还没有完整的 context 切换界面  
  Managed worktrees for Git workspaces are supported, but the platform-side context switching UX is still limited.
- 当前访问控制仍偏向单用户本地自托管  
  Access control is still optimized for local single-user scenarios.

## 11. 建议排障顺序 / Suggested Debug Order

1. 运行 `npm run doctor`  
   Run `npm run doctor`.
2. 检查 `.env`  
   Validate `.env`.
3. 直接在本机验证 Claude / Codex CLI  
   Validate local Claude / Codex CLI directly.
4. 检查平台凭据  
   Validate platform credentials.
5. 检查 workspace 配置与 Git 可用性  
   Validate workspace configuration and Git availability.
6. 检查平台事件投递  
   Validate platform event delivery.
7. 最后再查更高层的 session 行为  
   Only then debug higher-level session behavior.
