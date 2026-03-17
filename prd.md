# PRD - AgentBridge

## 1. 产品概述

### 1.1 产品定义
AgentBridge 是一个轻量级桥接层，让单个开发者可以通过手机上的 Slack，远程操作自己电脑上运行的 Claude Code 或 Codex 会话。

它不是 agent runtime，不是工作流平台，也不是多用户协作系统。它只负责消息入口、会话路由与进程控制。

### 1.2 核心价值
- 给本地 coding agent 提供移动端入口
- 降低手机侧操作成本
- 保留 Claude Code / Codex 的原生能力
- 用最小系统边界换取更好的可控性与安全性

### 1.3 目标用户
- 已经在本地使用 Claude Code 或 Codex 的开发者
- 熟悉 CLI 的 AI power user
- 经常离开电脑但仍希望远程触发任务的人

### 1.4 非目标用户
- no-code 用户
- 多人协作团队
- 工作流编排平台用户
- 希望获得全自动 agent 编排能力的用户

## 2. 问题定义

当开发者离开电脑后，缺少一种轻量、稳定、低配置成本的方式，从手机远程触发本地 coding agent。

当前痛点：
- 手机输入 CLI 命令成本高
- 远程管理 session、cwd、进程状态很麻烦
- 现有通用 agent 平台通常过重、过宽，且安全边界不够清晰

## 3. 产品目标

### 3.1 目标
- 用户可以在 Slack 中向 Claude Code 或 Codex 发送任务
- 用户可以在 Slack 中查看状态与最近输出
- 用户可以远程管理少量本地 session
- 高频操作可在 3 步内完成

### 3.2 成功指标
- 用户可在手机上 3 步内发起一次任务
- 80% 的高频操作可通过 Slack UI 完成，无需输入命令
- MVP 能稳定支持 1 个持久 session 和 one-shot 执行
- 从 Slack 发起到本地任务开始执行的中位耗时小于 5 秒

### 3.3 非目标
- 不提供通用 chat-to-shell 能力
- 不做多用户账号系统
- 不做 skill marketplace
- 不做复杂 workflow 编排
- MVP 不支持 WhatsApp、飞书

## 4. 产品原则

- Agent-first：推理、工具调用、规划能力都留在 Claude Code / Codex 内部
- Thin bridge：AgentBridge 只做传输、路由、状态与进程生命周期
- UI-first：优先使用 shortcut、modal、buttons，而不是让用户手打控制命令
- Closed intent set：只支持固定的控制动作集合
- Safe by default：默认收紧用户、目录、超时与执行边界

## 5. 用户场景

### 5.1 核心场景
- 离开电脑后，让 agent 查看报错、分析日志、修测试
- 查看某个本地 session 是否仍在运行
- 中断一个卡住的任务
- 执行一次无需保留上下文的分析任务

### 5.2 高频操作
- 向当前 session 发送消息
- 启动一次 one-shot 任务
- 查看状态
- 中断当前执行
- 重启 session

### 5.3 低频操作
- 创建新 session
- 切换或设置 cwd
- 查看最近使用的 session

## 6. 范围定义

### 6.1 MVP 范围
MVP 只包含：
- Slack 单一入口
- Socket Mode Slack App
- 单用户、仅私聊使用
- 每种 agent 最多 1 个持久 session
- one-shot 执行
- 基础的 spawn / status / interrupt / kill
- 基于 polling 的输出更新
- 基于规则的简单意图识别
- cwd 白名单与超时控制

### 6.2 Post-MVP
- 多个并行持久 session
- App Home 控制台
- Recent Sessions
- 更好的输出浏览与格式化
- 模糊匹配或 embedding 意图识别
- 飞书入口

### 6.3 明确不进 MVP 的内容
- WhatsApp
- embedding 分类
- streaming output
- 自动重启与自动恢复
- MCP reload 管理
- 通用 shell 执行能力

## 7. 功能需求

### 7.1 Slack 入口
系统必须支持：
- 全局 shortcut：`Open Agent Console`
- Bot 私聊消息回复
- 执行结果消息上的交互按钮

MVP 不应要求公网 webhook。

### 7.2 Console Modal
Modal 必须包含：
- Agent 选择：`Claude` / `Codex`
- Session 选择：已有 session 或 `Run Once`
- Action 选择：`Send` / `Status` / `Interrupt` / `Restart` / `New Session` / `Set CWD`
- Message 输入框：`Send` 和 `Run Once` 必填
- CWD 输入或选择：仅允许白名单目录

### 7.3 动作定义

#### Send
- 将用户输入发送到选中的持久 session
- 如果没有现有 session，必须先创建，或改用 `Run Once`

#### Run Once
- 启动一次 one-shot 执行
- 当进程退出、超时或被手动中断时，任务结束
- MVP 默认超时时间为 30 分钟

#### Status
- 返回状态：`idle`、`running`、`finished`、`failed`、`interrupted`、`timed_out`
- 返回 agent、cwd、开始时间、最近输出摘要

#### Interrupt
- 优先发送中断信号；若 agent 不支持，则退化为终止进程
- 在 Slack 中返回最终状态

#### Restart
- 杀死当前持久 session 进程
- 按相同配置重新启动

#### New Session
- 为指定 agent 和 cwd 创建新的持久 session
- MVP 可以限制为每种 agent 只保留一个持久 session

#### Set CWD
- 修改选中 session 的 cwd
- 新 cwd 必须命中白名单

### 7.4 输出处理
- Slack 返回消息必须包含：状态、agent、session、cwd、最近输出摘要
- 长输出必须截断
- MVP 至少支持展示最后 N 行或 tail 内容
- stdout 与 stderr 都必须被采集

### 7.5 意图识别
MVP 中意图识别只是辅助层，不能成为唯一交互方式。

MVP 支持的意图：
- send
- status
- interrupt
- restart
- new_session
- set_cwd
- run_once

MVP 的识别策略：
- UI 选择优先
- DM 文本兜底时，仅做规则/关键词匹配
- 低置信度时不自动执行，而是提示用户打开 modal

### 7.6 Session 管理
每个 session 至少需要保存：
- `session_id`
- `agent_type`
- `cwd`
- `mode`
- `status`
- `pid`
- `created_at`
- `last_active_at`
- `last_output_tail`

MVP 支持的 mode：
- `persistent`
- `oneshot`

### 7.7 进程管理
MVP 的 Process Supervisor 必须支持：
- spawn
- stdout/stderr 捕获
- timeout
- 状态跟踪
- interrupt / terminate

MVP 暂不支持：
- auto-restart
- 自动恢复
- MCP 热重载

## 8. 交互设计

### 8.1 主流程
1. 用户在 Slack 手机端触发 `Open Agent Console`
2. 选择 agent、session 或 run-once 模式，并输入任务
3. AgentBridge 在本地启动或路由执行
4. Slack 私聊收到状态卡片
5. 用户通过按钮继续：`Continue`、`Interrupt`、`Restart`、`Status`

### 8.2 One-shot 流程
1. 打开 modal
2. 选择 `Run Once`
3. 输入任务与可选 cwd
4. 在私聊中收到结果摘要与完成状态

### 8.3 失败流程
当进程启动失败、执行失败或超时时：
- Slack 消息必须明确标注失败类型
- 提供 `Retry`、`Open Console` 或 `View Status` 入口

## 9. 安全与约束

### 9.1 访问控制
- 仅允许一个预先配置的 Slack User ID 触发
- MVP 仅接受私聊消息和私聊交互

### 9.2 文件系统约束
- 执行目录必须命中 cwd 白名单
- 超出白名单的路径在进程启动前直接拒绝

### 9.3 执行约束
- 每个任务都必须有超时
- 禁止通过 shell 拼接用户输入
- Bridge 不暴露通用命令执行入口

### 9.4 推荐实现约束
- 如条件允许，建议使用独立本地系统用户运行
- 建议尽量缩小 agent 可见目录范围
- 若未来扩大范围，优先通过 OS 或容器级隔离补强

## 10. 异常处理要求

系统必须明确处理以下异常：
- Slack 连接中断
- 本地进程启动失败
- 本地进程崩溃
- 任务超时
- 用户主动中断
- 长时间无输出

每类异常都应在 Slack 中返回：
- 可读的失败原因
- 最终状态
- 下一步可执行动作

MVP 重试策略：
- 不做自动重试
- 仅支持用户主动重试

## 11. 技术假设

- 优先使用 Slack Bolt + Socket Mode
- AgentBridge 以本地常驻 daemon 形式运行
- 状态可先存储在 SQLite 或轻量本地文件中
- MVP 用 polling 替代 streaming

## 12. 数据模型

### 12.1 Session
- `session_id`
- `agent_type`
- `cwd`
- `mode`
- `status`
- `pid`
- `created_at`
- `last_active_at`

### 12.2 Execution Record
- `request_id`
- `session_id`
- `source_platform`
- `slack_channel_id`
- `slack_thread_ts`
- `raw_input`
- `started_at`
- `ended_at`
- `exit_code`
- `final_status`
- `output_tail`

## 13. 版本计划

### Phase 1: MVP
- Slack shortcut
- Console modal
- 单用户私聊
- 持久 session + run once
- spawn / status / interrupt / kill
- 输出 polling 与截断
- 基础本地状态存储

### Phase 2
- Recent Sessions
- App Home 控制台
- 更好的 session 选择体验
- 更完整的异常提示

### Phase 3
- Parallel Sessions
- 更强的意图识别
- 飞书支持

## 14. 待确认问题

- Claude Code / Codex 的中断语义需要在实现中验证
- 持久 session 到底映射为长驻进程还是“可恢复会话包装器”，需要技术验证
- CWD 在 modal 中是自由输入还是白名单下拉，取决于实现复杂度

## 15. 最终产品判断

AgentBridge 应该被定义为“个人本地 coding agent 的远程控制台”，而不是通用 agent 平台。

MVP 的优先级不是功能广度，而是三件事：
- 远程触发可靠
- 本地执行边界清晰
- 手机操作足够顺手

先把最小可用版本做稳，再扩展并行 session、App Home 和更智能的路由能力。
