# 排障指南

这个页面集中说明 AgentBridge 启动和使用过程中最常见的问题。

## 1. 先运行 `doctor`

排障的第一步应该始终是：

```bash
npm run doctor
```

这个命令会检查：

- 数据库路径
- 允许的工作目录
- 代理配置
- Claude 命令可达性
- Codex 命令可达性

如果这里已经报错，先修复环境问题，再去看平台侧问题。

## 2. CLI 不可达

典型表现：

- `doctor` 显示 `reachable: no`
- 启动后实际任务无法执行

排查方向：

- `AGENTBRIDGE_CLAUDE_COMMAND` 或 `AGENTBRIDGE_CODEX_COMMAND` 是否写对
- 命令在当前 shell 下能否直接执行
- 命令加上 `--help` 后是否会正常退出
- Windows 路径是否需要写成绝对路径

## 3. 配置校验失败

典型原因：

- `AGENTBRIDGE_ALLOWED_CWDS` 为空
- 启用了 `slack` 但缺少 Slack 凭据
- 启用了 `lark` 但缺少 Lark 凭据
- `AGENTBRIDGE_DEFAULT_AGENT` 填了非法值

修复方式：

- 对照 [configuration.md](configuration.md) 补齐必填项
- 先用最小配置跑通单平台，再加另一平台

## 4. 工作目录无法切换

典型表现：

- `set cwd` 后报错
- prompt 执行时报 `CWD is not allowed`

原因：

- 目标路径不在 `AGENTBRIDGE_ALLOWED_CWDS` 白名单里

修复方式：

- 把目标路径补进白名单
- 确保路径是绝对路径
- 修改后重启服务

## 5. 代理相关问题

典型表现：

- 依赖安装失败
- 平台 SDK 或 agent CLI 无法访问外部网络

排查方向：

- 显式设置 `AGENTBRIDGE_HTTP_PROXY` 和 `AGENTBRIDGE_HTTPS_PROXY`
- 检查 `HTTP_PROXY` / `HTTPS_PROXY` 是否污染了当前环境
- Windows 上确认系统代理是否与预期一致

## 6. Slack 无响应

优先检查：

- `SLACK_ALLOWED_USER_ID` 是否正确
- Socket Mode 是否开启
- bot 私聊能力是否开启
- 所需 scopes 是否齐全
- app token 和 bot token 是否混填

详细说明见 [platforms/slack.md](platforms/slack.md)。

## 7. 飞书 / Lark 无响应

优先检查：

- `LARK_APP_ID` 和 `LARK_APP_SECRET` 是否正确
- `LARK_ALLOWED_USER_ID` 是否正确
- 平台是否已启用
- 本机网络和代理是否影响长连接

详细说明见 [platforms/lark.md](platforms/lark.md)。

## 8. 已知限制

这些不是故障，而是当前实现边界：

- 输出是任务结束后一次性返回，不是流式输出
- `interrupt` 只能中断当前 AgentBridge 进程发起的任务
- 意图路由是轻量规则，不支持复杂复合动作
- 当前访问控制偏单用户模型
- 中文控制命令别名覆盖范围有限

## 9. 建议排障顺序

1. `npm run doctor`
2. 校验 `.env`
3. 校验 agent CLI 可用性
4. 校验平台凭据
5. 校验白名单工作目录
6. 再检查平台侧事件是否正常到达
