# AgentBridge 技术方案与开发计划

## 1. 目标

本文档基于 [prd.md](E:/AgentBridge/prd.md) 的 MVP 范围，给出第一版可落地的技术方案、模块拆分与开发顺序。

目标不是覆盖所有远期能力，而是用最小复杂度跑通：
- Slack 手机端发起任务
- 本地启动 Claude Code / Codex
- 回传状态与输出
- 支持中断、重启、one-shot
- 在安全边界内稳定运行

## 2. MVP 技术结论

### 2.1 建议的 MVP 范围
第一版只做：
- Slack Socket Mode
- 单用户私聊
- Global Shortcut + Console Modal
- 每种 agent 一个 persistent session
- one-shot 执行
- 基础 spawn / interrupt / kill / status
- polling 输出更新
- SQLite 状态存储

### 2.2 第一版不做
- parallel sessions
- App Home
- streaming output
- embedding / fuzz intent router
- 自动恢复
- MCP reload

原因很简单：这些能力要么显著增加状态复杂度，要么依赖对底层 agent 行为的更强验证，不适合作为第一版前置条件。

## 3. 系统架构

### 3.1 总体结构

```text
Slack Mobile
   |
   v
Slack App (Bolt + Socket Mode)
   |
   v
AgentBridge Daemon
   |- Slack Controller
   |- Action Router
   |- Session Store
   |- Process Manager
   |- Output Poller
   |- Persistence (SQLite)
   |
   v
Claude Code / Codex CLI
```

### 3.2 设计原则
- UI 驱动优先于文本命令解析
- 进程状态要有单一事实源
- Slack 响应和本地执行解耦
- 所有执行都必须显式绑定 agent、cwd、session

## 4. 模块设计

## 4.1 Slack Controller

职责：
- 接收 shortcut、modal submit、button click
- 校验用户身份和 DM 场景
- 把 Slack 交互转为内部 action
- 把执行状态回写到 Slack

输入：
- Slack events
- Slack interactive payloads

输出：
- 内部 action 请求
- Slack 消息、更新、按钮

MVP 只需要支持：
- global shortcut
- modal submit
- button actions

## 4.2 Action Router

职责：
- 将 UI 选择或文本 fallback 转换为标准 action
- 校验参数完整性
- 路由到 Session Store 或 Process Manager

标准 action 建议统一为：
- `create_session`
- `send_message`
- `run_once`
- `get_status`
- `interrupt_run`
- `restart_session`
- `set_cwd`

说明：
- MVP 中不建议把“意图识别”做成独立复杂模块
- 文本 fallback 只做关键词匹配，识别失败则拒绝执行

## 4.3 Session Store

职责：
- 维护 session 元数据
- 记录当前 active run
- 提供按 agent 查询和按 session 查询
- 保存最后输出 tail

建议实体：

### Session
- `session_id`
- `agent_type`
- `cwd`
- `mode`
- `status`
- `created_at`
- `last_active_at`
- `last_run_id`

### Run
- `run_id`
- `session_id`
- `agent_type`
- `slack_channel_id`
- `slack_thread_ts`
- `input_text`
- `status`
- `pid`
- `started_at`
- `ended_at`
- `exit_code`
- `output_tail`
- `error_reason`

说明：
- `session` 是逻辑层概念
- `run` 是一次具体执行
- persistent session 也可能对应多次 run

## 4.4 Process Manager

职责：
- 启动本地 agent 进程
- 绑定 stdout/stderr 采集
- 处理 interrupt / kill / timeout
- 更新 run 状态

建议能力边界：
- 只接收结构化参数，不接收 shell 拼接字符串
- 每次执行显式指定 agent 类型、cwd、输入文本
- 对每次执行设置 timeout

MVP 关键点：
- 先确认 Claude Code / Codex 的稳定调用方式
- 优先使用 stdin 或安全参数传递
- 不做复杂 supervisor 语义

## 4.5 Output Poller

职责：
- 定时读取当前 run 的输出缓存
- 生成 tail 摘要
- 按节奏更新 Slack 状态消息

MVP 推荐策略：
- 每 3 到 5 秒 polling 一次
- 只推送状态变化或输出 tail 有变化的 run
- 只展示最后 N 行

这样可以避免：
- Slack 刷屏
- 流式推送实现复杂度过高
- 长输出导致格式失控

## 4.6 Persistence

MVP 推荐 SQLite。

原因：
- 足够轻
- 易调试
- 易做重启后状态恢复
- 后续也能平滑升级

至少需要两张表：
- `sessions`
- `runs`

可选第三张表：
- `settings`

## 5. 关键流程

## 5.1 Send 到持久 Session

```text
User opens modal
-> selects agent/session/action/message
-> Slack Controller validates user
-> Action Router builds send_message action
-> Session Store loads target session
-> Process Manager starts run
-> Output Poller tracks progress
-> Slack Controller updates result card
-> Run ends and status persisted
```

## 5.2 Run Once

```text
User opens modal
-> selects Run Once
-> submits message and cwd
-> Action Router builds run_once action
-> Process Manager starts one-shot run
-> Output Poller updates Slack
-> On exit/timeout/interruption mark run finished
```

## 5.3 Interrupt

```text
User clicks Interrupt
-> Slack Controller sends interrupt_run action
-> Process Manager sends interrupt signal
-> If graceful stop fails, terminate process
-> Session Store updates final status
-> Slack message updated
```

## 6. 状态机建议

### 6.1 Run 状态
- `queued`
- `starting`
- `running`
- `finished`
- `failed`
- `interrupted`
- `timed_out`

### 6.2 Session 状态
- `idle`
- `running`
- `error`

说明：
- 第一版不要让状态过多
- Slack 展示层和内部状态尽量一一对应

## 7. 安全实现要点

### 7.1 用户校验
- 配置唯一允许的 Slack User ID
- 所有入口都先校验 user_id

### 7.2 DM 校验
- 拒绝群聊、频道、共享会话入口

### 7.3 cwd 白名单
- 启动时读取允许目录列表
- modal 中只暴露这些路径
- 自由输入时必须归一化后校验

### 7.4 禁止 shell 拼接
错误做法：
- `claude \"$user_input\"`

正确方向：
- 通过安全参数数组或 stdin 传入

### 7.5 timeout
- run_once 默认 30 分钟
- persistent session 单次 run 也必须有 timeout

## 8. Slack 交互设计建议

## 8.1 MVP 必做
- Global Shortcut: `Open Agent Console`
- Console Modal
- Result Card with buttons

## 8.2 Modal 字段建议
- Agent
- Session
- Action
- Message
- CWD

约束建议：
- `Run Once` 直接作为 Session 选项之一
- 如果选择 `Status`、`Interrupt`、`Restart`，隐藏或弱化 Message

## 8.3 Result Card
建议包含：
- agent
- session
- cwd
- run status
- start time
- latest output tail

按钮：
- `Continue`
- `Interrupt`
- `Restart`
- `Status`
- `Open Console`

## 9. 技术风险与验证项

## 9.1 最高优先级风险

### 1. Claude Code / Codex 的调用协议
需要尽快验证：
- 命令行参数形式
- 是否支持 stdin
- 是否支持中断
- 输出是否稳定写到 stdout/stderr

### 2. 持久 Session 的真实语义
需要验证：
- agent 是否天然支持“持续会话”
- 还是需要 bridge 自己维护上下文映射

如果持久会话不能稳定成立，MVP 可退化为：
- 每次执行一个独立 run
- 只保留“最近配置”，不承诺真正长驻进程

### 3. Slack 交互节奏
需要验证：
- modal 提交后的响应时限
- 后续消息更新的频率是否合适

## 10. 开发顺序

### Milestone 1: CLI 验证层
目标：证明本地 agent 可被稳定驱动。

任务：
- 封装 Claude Code 启动器
- 封装 Codex 启动器
- 验证输入传递方式
- 验证 stdout/stderr 捕获
- 验证 interrupt / terminate 行为

交付物：
- 一个本地可跑的 `ProcessManager` 原型

### Milestone 2: 本地执行核心
目标：不接 Slack，先在本地把 run 生命周期跑通。

任务：
- 设计 `sessions` / `runs` 表
- 实现 Session Store
- 实现 Process Manager
- 实现 timeout
- 实现 output tail

交付物：
- 一个可用的本地 daemon 核心

### Milestone 3: Slack 接入
目标：打通用户侧最短路径。

任务：
- 接入 Slack Bolt + Socket Mode
- 实现 user / DM 校验
- 实现 global shortcut
- 实现 console modal submit
- 实现结果卡片

交付物：
- Slack 可直接发起 one-shot

### Milestone 4: Session 能力
目标：支持持久 session 的最小版本。

任务：
- 新建 session
- 发送消息到 session
- status / interrupt / restart
- cwd 白名单切换

交付物：
- 第一版 MVP

## 11. 开发任务清单

## 11.1 基础设施
- 建项目结构
- 接入配置加载
- 接入日志
- 初始化 SQLite

## 11.2 Domain 模型
- 定义 Session 模型
- 定义 Run 模型
- 定义状态枚举
- 定义 Action schema

## 11.3 Process 层
- 实现 agent launcher
- 实现进程启动与销毁
- 实现 stdout/stderr 采集
- 实现 timeout
- 实现 output tail 缓存

## 11.4 Store 层
- Session CRUD
- Run CRUD
- active run 查询
- 最近输出查询

## 11.5 Slack 层
- shortcut handler
- modal renderer
- modal submit handler
- button handlers
- message formatter

## 11.6 安全层
- user whitelist
- DM only 校验
- cwd whitelist 校验
- 参数安全传递

## 11.7 测试
- 路由单测
- store 单测
- 进程生命周期测试
- timeout 测试
- Slack payload handler 测试

## 12. 验收标准

MVP 完成的最低标准：
- 用户可在 Slack 中通过 shortcut 打开 modal
- 用户可发起 one-shot 任务并看到状态与输出 tail
- 用户可创建一个 persistent session 并继续发送消息
- 用户可中断和重启执行
- 非白名单用户无法执行
- 非白名单 cwd 无法执行
- 长任务超时后能正确回写状态

## 13. 建议的代码目录

```text
agentbridge/
  app/
    main.py
    config.py
  slack/
    controller.py
    views.py
    handlers.py
  domain/
    models.py
    actions.py
    enums.py
  runtime/
    process_manager.py
    launchers.py
    output_poller.py
  store/
    session_store.py
    run_store.py
    db.py
  services/
    router.py
    session_service.py
  tests/
```

## 14. 最终建议

第一版最重要的不是“像产品”，而是“真的能稳定远程触发本地 agent”。

所以开发顺序必须坚持：
1. 先验证本地 CLI 调用语义
2. 再做本地运行时核心
3. 最后接 Slack UI

如果第一步验证发现 persistent session 不稳定，就及时降级，不要为了概念完整性硬保留复杂设计。
