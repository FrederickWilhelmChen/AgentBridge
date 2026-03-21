# 使用说明 / Usage

这份文档说明 AgentBridge 启动后如何处理消息、会话和附件。  
This document explains how AgentBridge handles messages, sessions, and attachments after startup.

## 1. 启动 / Startup

开发模式：  
Development:

```bash
npm run dev
```

生产模式：  
Production:

```bash
npm run build
npm run start
```

启动后，AgentBridge 会完成这些事：  
After startup, AgentBridge will:

- 加载 `.env`  
  Load `.env`.
- 校验配置  
  Validate configuration.
- 初始化 SQLite  
  Initialize SQLite.
- 初始化图片缓存和本地运行目录  
  Initialize the image cache and local runtime directories.
- 启动 Slack 和/或 Feishu 控制器  
  Start Slack and/or Feishu controllers.

## 2. 平台心智模型 / Platform Mental Model

### Feishu / Lark

- 从根消息开始，例如 `start` 或 `@Bot start`  
  Start from a root message such as `start` or `@Bot start`.
- 初始化阶段只选择一次 agent 和 workspace  
  Agent and workspace are selected once during setup.
- 初始化完成后继续在同一个话题里交流  
  After setup, continue in the same topic.
- 这个话题本身就是持续会话入口  
  The topic itself becomes the ongoing session entry.
- AgentBridge 会先显示一张进度卡片，再更新结果  
  AgentBridge first shows a progress card and then updates it with the result.

### Slack

- 通过全局 shortcut 打开的 modal 来开始  
  Start through the global shortcut modal.
- 一个 Slack thread 就是一个 session  
  One Slack thread equals one session.
- thread 内的 `agent` 固定  
  `agent` is fixed inside the thread.
- thread 内的 `workspace` 固定，而当前执行 context 可能变化  
  `workspace` is fixed inside the thread, while the current execution context may change.
- 后续都在同一个 thread 里继续  
  Follow-up messages continue in the same thread.

这两个平台的交互模型是故意不完全相同的。  
These two platform flows are intentionally not identical.

## 3. 消息处理 / Message Handling

进入系统的消息大致分成三类：  
Incoming messages are roughly handled in three categories:

- 平台初始化消息  
  Platform setup messages.
- `interrupt` / `stop` 这类中断消息  
  Interruption messages such as `interrupt` / `stop`.
- 普通 agent prompt  
  Regular agent prompts.

除了显式初始化流程和中断指令之外，普通文本都会被当作正常 prompt 处理。  
Outside explicit setup flows and interruption commands, regular text is treated as a normal prompt.

## 4. Agent 与 Workspace 选择 / Agent And Workspace Selection

选择方式取决于平台：  
Selection depends on the platform flow:

- Slack：在创建 thread 的 modal 中选择 workspace  
  Slack: select the workspace in the thread-creation modal.
- Feishu / Lark：在话题初始化流程里选择 workspace  
  Feishu / Lark: select the workspace during topic setup.
- 其他情况下使用 `AGENTBRIDGE_DEFAULT_AGENT` 兜底  
  Otherwise, `AGENTBRIDGE_DEFAULT_AGENT` is used as fallback.

注意：  
Important:

- Slack 不允许在同一个 thread 里切换 agent  
  Slack does not expect agent switching inside the same thread.
- Feishu 初始化是先选 agent，再选 workspace  
  Feishu setup chooses the agent first, then the workspace.
- 初始化完成后，两边都不允许在同一会话里切换 agent 或 workspace  
  After setup, neither platform expects agent or workspace switching inside the same session.

## 5. 会话模型 / Session Model

AgentBridge 支持持久 provider session，用于多轮工作。  
AgentBridge supports persistent provider sessions for multi-turn work.

具体来说：  
In practice:

- Slack 把 session 绑定到 Slack thread  
  Slack binds the session to the Slack thread.
- Feishu / Lark 把 session 绑定到话题 / thread 上下文  
  Feishu / Lark binds the session to the topic/thread context.

## 6. Workspace 与 Context / Workspace And Context

AgentBridge 现在区分两层概念：  
AgentBridge now separates two concepts:

- `workspace`：用户在平台上选择的顶层工作区  
  `workspace`: the top-level work area selected by the user.
- `execution context`：实际运行命令的目录  
  `execution context`: the actual directory where the command runs.

对于 plain workspace，`execution context` 通常就是 workspace 根目录。  
For plain workspaces, the execution context is usually the workspace root.

对于 Git workspace，`execution context` 可以是主目录，也可以是 linked worktree。  
For Git workspaces, the execution context can be the main checkout or a linked worktree.

## 7. 图片 / Images

如果平台消息里包含图片，AgentBridge 会：  
If a platform message contains images, AgentBridge will:

1. 下载并缓存图片到本地  
   Download and cache the image locally.
2. 构建附件元数据  
   Build attachment metadata.
3. 把这些元数据和本地路径一并传给 agent prompt 流程  
   Pass the metadata and local path into the agent prompt flow.

这样 agent 可以看到：  
This allows the agent to see:

- 文件名  
  File name.
- MIME 类型  
  MIME type.
- 平台文件 ID  
  Platform file ID.
- 本地缓存路径  
  Local cache path.

## 8. 输出行为 / Output Behavior

当前行为如下：  
Current behavior:

- 输出是“结果优先”，不是真正的 token 流式输出  
  Output is result-first, not true token streaming.
- Feishu / Lark 会先给出可见的进度卡片反馈  
  Feishu / Lark gives immediate visible feedback through a progress card.
- Slack 主要在 thread 中展示完成结果  
  Slack mainly surfaces completed results in-thread.

## 9. 中断 / Interruption

`interrupt` 以及相关控制只会影响当前 AgentBridge 进程自己发起的任务。  
`interrupt` and related controls only affect work launched by the current AgentBridge process.

它们不会控制无关的本地终端或外部会话。  
They do not control unrelated local terminals or external sessions.

## 10. 实际使用方式 / Practical Usage Patterns

Feishu / Lark:

1. 发送 `@Bot start`  
   Send `@Bot start`.
2. 选择 `claude` 或 `codex`  
   Choose `claude` or `codex`.
3. 选择 workspace  
   Choose the workspace.
4. 然后在同一个话题里继续，不再切换 agent 或 workspace  
   Continue in the same topic without changing agent or workspace.

Slack:

1. 打开全局 shortcut  
   Open the global shortcut.
2. 在 modal 中选择 agent、workspace 和 opening message  
   Choose agent, workspace, and the opening message in the modal.
3. 在创建出来的 thread 里继续，不再切换 agent 或 workspace  
   Continue inside the created thread without changing agent or workspace.

## 11. 相关文档 / Related Docs

- [installation.md](installation.md)
- [configuration.md](configuration.md)
- [platforms/slack.md](platforms/slack.md)
- [platforms/lark.md](platforms/lark.md)
- [troubleshooting.md](troubleshooting.md)
