# 使用说明

本文档说明 AgentBridge 启动后如何处理消息、会话和附件。

## 1. 启动服务

开发模式：

```bash
npm run dev
```

构建并启动：

```bash
npm run build
npm run start
```

启动后，程序会：

- 读取 `.env`
- 校验配置
- 初始化 SQLite 数据库
- 初始化图片缓存目录
- 启动 Slack 和/或飞书 / Lark 控制器

## 2. 消息如何分类

进入 AgentBridge 的消息会被分为两类：

- 控制意图
- 普通 AI 请求

当前控制意图主要包括：

- `status`
- `new session`
- `restart session`
- `stop`
- `interrupt`
- `set cwd <absolute path>`

如果消息没有命中这些规则，就会作为普通 prompt 转发给 Claude 或 Codex。

## 3. Agent 选择规则

消息处理时的优先级大致如下：

1. 如果消息文本中明确提到 `codex`，优先用 Codex
2. 如果消息文本中明确提到 `claude`，优先用 Claude
3. 否则使用 `AGENTBRIDGE_DEFAULT_AGENT`

示例：

- `use codex debug this build failure`
- `claude explain this repository`

## 4. 持久会话与单次执行

### 持久会话

持久会话用于把同一平台用户的多条消息持续发送到同一个 agent 会话中。

当前持久会话按以下维度隔离：

- 平台
- 平台用户
- agent 类型

典型命令：

- `new session`
- `restart session`
- `status`

### 单次执行

如果当前用户没有可复用的持久会话，AgentBridge 会退回到单次执行模式。单次执行完成后，输出一次性返回，不保留对话上下文。

## 5. 工作目录切换

你可以通过消息切换工作目录，例如：

```text
set cwd E:/your/project
```

或者在部分情况下通过消息中出现的白名单目录名触发切换。

限制：

- 目标路径必须在 `AGENTBRIDGE_ALLOWED_CWDS` 白名单中
- 非白名单路径会被拒绝

## 6. 图片附件处理

如果平台消息里包含图片附件，AgentBridge 会：

1. 把图片缓存到本地 `.image-cache`
2. 生成包含图片元信息和本地路径的补充文本
3. 把这段补充文本追加到原始 prompt 之后

这意味着 agent 能看到：

- 图片名
- MIME 类型
- 平台文件 ID
- 原始来源 URL
- 本地缓存路径

## 7. 常见使用方式

- `status`
- `new session`
- `restart session`
- `interrupt`
- `set cwd E:/your/project`
- `use claude inspect this repo`
- `use codex review this error log`

## 8. 输出与中断行为

当前实现有几个需要明确知道的点：

- 输出不是流式的，而是在任务完成后一次性返回
- `interrupt` 只能中断由当前 AgentBridge 进程发起的活动任务
- 意图路由是轻量规则，不适合复杂多步骤命令

## 9. 相关文档

- 安装见 [installation.md](installation.md)
- 配置见 [configuration.md](configuration.md)
- 排障见 [troubleshooting.md](troubleshooting.md)
