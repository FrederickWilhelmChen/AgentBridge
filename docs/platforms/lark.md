# 飞书 / Lark 接入

本文档说明如何为 AgentBridge 配置飞书 / Lark。

## 1. 所需环境变量

```env
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
LARK_ENCRYPT_KEY=
LARK_VERIFICATION_TOKEN=
```

说明：

- `LARK_ALLOWED_USER_ID` 用来限制允许操作 AgentBridge 的飞书 / Lark 用户
- `LARK_ENCRYPT_KEY` 和 `LARK_VERIFICATION_TOKEN` 是否需要填写，取决于你的应用配置方式

## 2. 当前接入方式

当前实现使用飞书 / Lark 官方长连接模式。

这意味着：

- 不需要公网回调 URL
- 不需要本地隧道
- 不需要单独暴露 webhook 服务

这更适合本地自托管的 AgentBridge 场景。

## 3. 启用 Lark 平台

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
```

然后填写飞书 / Lark 凭据并启动：

```bash
npm run doctor
npm run dev
```

## 4. 如何验证

建议按这个顺序验证：

1. 运行 `npm run doctor`
2. 启动服务，确认没有 Lark 启动异常
3. 使用允许的用户给 bot 发送私聊消息
4. 先测试 `status` 或 `new session`
5. 再测试普通 AI prompt 和图片附件

## 5. 当前行为边界

- 当前逻辑主要面向配置过的允许用户私聊消息
- 文档和示例以本地自托管为前提
- 如果你的飞书应用策略更复杂，需要自行补充组织级权限验证

## 6. 常见问题方向

如果飞书 / Lark 无法正常工作，优先排查：

- `LARK_APP_ID` 和 `LARK_APP_SECRET` 是否正确
- 允许用户 ID 是否填错
- 本机网络和代理是否影响 SDK 连接
- 平台是否已被包含在 `AGENTBRIDGE_ENABLED_PLATFORMS`

## 7. 相关文档

- 总体配置见 [../configuration.md](../configuration.md)
- 使用说明见 [../usage.md](../usage.md)
- 排障见 [../troubleshooting.md](../troubleshooting.md)
