# MRD — AgentBridge

> 一个通过 Slack 在手机上远程控制本地 Claude Code / Codex 会话的轻量级 Agent Gateway。

---

## 核心理念

- **agent** 是 Claude/Codex
- **bridge** 只负责入口与会话管理
- 不做 agent runtime、不做 skill 平台

---

## 一、背景与问题

现代 coding agent（Claude Code / Codex）非常强大，但存在一个现实问题：**缺乏移动端入口**。

### 典型痛点

**1. 远程触发困难**

当开发者离开电脑时，想让 agent：
- 分析 log
- 修复测试
- 跑代码分析

通常只能 SSH 回机器、打开电脑，或完全无法操作。

**2. CLI 使用成本高**

即使通过 Slack 远程触发 CLI：
- 手机输入命令非常麻烦
- session / cwd / agent 切换复杂
- slash command 体验差

**3. Agent 需要会话管理**

Claude Code / Codex 实际是弱 agent loop + CLI 进程，依赖：
- session
- cwd
- MCP / tool 配置
- 进程状态

因此需要：restart、interrupt、session routing。

---

## 二、产品目标

构建一个**极简 agent gateway**，实现：

| 目标 | 说明 |
|------|------|
| 手机远程控制 | 通过 Slack 发送任务、查看输出、管理 session |
| 保留 agent 原生能力 | reasoning / tools / MCP / planning 全部由 Claude Code / Codex 负责 |
| 保留并行能力 | 支持多 session、多 agent、并行执行 |
| 降低手机操作成本 | 通过 Slack UI、轻量意图识别、shortcut + modal 减少输入负担 |

---

## 三、目标用户

**主要用户：** 高级开发者 / AI power user

特征：
- 已使用 Claude Code / Codex
- 熟悉 CLI
- 希望远程触发 agent
- 不需要复杂 workflow 平台

**非目标用户：** no-code 用户、业务自动化用户、AI workflow builder

---

## 四、核心设计原则

**1. Agent-first**
Claude Code / Codex 是系统核心。Bridge 不实现 agent runtime、skill registry、planning loop。

**2. Thin gateway**
Bridge 只负责：transport、session、process control。

**3. Closed intent set**
控制操作来自固定动作池：`send` / `restart` / `kill` / `status` / `new_session` / `switch_session`

**4. UI-first**
优先使用 Slack UI（shortcut / modal / buttons / menus），自然语言仅作为辅助。

---

## 五、系统架构

```
Slack Mobile
      │
      ▼
Slack App (Socket Mode)
      │
      ▼
AgentBridge
 ├─ Intent Router
 ├─ Session Manager
 ├─ Process Supervisor
 └─ UI Controller
      │
      ▼
Claude Code / Codex
      │
      ▼
Local Tools / MCP
```

---

## 六、核心模块

### 1. Slack Gateway

- 接收 Slack 事件，处理 shortcuts / modal / 按钮回调
- 技术：Slack Bolt + Socket Mode
- 优势：不需要公网 webhook，安全简单

### 2. Intent Router

将输入映射为固定动作，方法：
1. 规则匹配
2. RapidFuzz 模糊匹配
3. embedding 相似度

支持动作：`send` / `restart` / `kill` / `status` / `new_session` / `switch_session` / `set_cwd` / `run_once`

> 不生成 shell 命令。

### 3. Session Manager

每个 session 包含：

| 字段 | 说明 |
|------|------|
| `session_id` | 唯一标识 |
| `agent_type` | claude / codex |
| `cwd` | 工作目录 |
| `pid` | 进程 ID |
| `status` | 运行状态 |
| `created_at` | 创建时间 |
| `last_active` | 最后活跃时间 |
| `mode` | persistent / oneshot |

功能：create / route / list / switch session

### 4. Process Supervisor

负责 agent 进程管理：
- spawn / interrupt / restart / kill
- auto restart、timeout
- MCP 修改后可 reload，卡死进程可恢复

### 5. UI Controller

Slack UI 组件：shortcut / modal / buttons / App Home

---

## 七、Session 模型

### Persistent Session
长期会话，用于项目开发、debugging、iterative coding。
```
claude/project-a/main
codex/project-b/tests
```

### Parallel Sessions
支持多并行，每个 session 独立 cwd / 进程 / 状态。
```
claude/project-a/debug
claude/project-a/refactor
codex/project-a/testfix
```

### One-shot Task
短任务，执行完自动退出。适用于：解释 stacktrace、分析 log、快速代码 review。

---

## 八、Slack UI 设计

### Global Shortcut
名称：**Open Agent Console** — 打开主控制 modal。

### Console Modal

| 字段 | 选项 |
|------|------|
| Agent | Claude / Codex |
| Session | dropdown |
| Action | Send / Restart / Kill / Status / New Session / Set CWD |
| Message | text input |

按钮：`Run` / `Run Once` / `Cancel`

### Execution Message Card

```
Agent: claude
Session: debug-api
cwd: ~/repo/api
status: running
```

按钮：`Continue` / `Interrupt` / `Restart` / `Status` / `Open Console`

### App Home

模块：
- **Active Sessions**：`claude/project-a/main`、`codex/project-b/tests`
  - 按钮：Open / Restart / Kill
- **Quick Actions**：New Claude Session / New Codex Session / Run Once / View Logs
- **Running Tasks**：显示 agent / session / cwd / runtime / status

---

## 九、Intent 示例

| 用户输入 | 识别结果 |
|----------|----------|
| 重启 claude | `restart(claude)` |
| 看看 codex 状态 | `status(codex)` |
| 切到 debug session | `switch_session(debug)` |
| 给 claude 说：修这个测试 | `send(claude, message)` |

---

## 十、关键功能

| 优先级 | 功能 |
|--------|------|
| 必须 | Slack shortcut、modal console、session routing、process supervisor、interrupt、restart、parallel sessions、run once |
| 应该 | streaming output、intent routing、session list、App Home dashboard |
| 可选 | log viewer、project templates、session TTL、mobile notifications |

---

## 十一、安全设计

原则：**只允许单用户控制**

措施：
- Slack user whitelist
- private DM only
- process sandbox
- cwd whitelist
- command timeout

---

## 十二、非目标

系统明确**不做**：
- agent runtime
- skill marketplace
- tool orchestration
- multi-user platform
- autonomous planning loop

---

## 十三、成功指标

| 指标 | 目标 |
|------|------|
| 远程触发效率 | 手机上 3 步内启动 agent 任务 |
| 并行能力 | 支持 3–5 个并行 session |
| 输入成本 | 80% 操作通过 UI 点选完成 |

---

## 十四、MVP 范围

MVP 包含：
- Slack Socket Mode
- global shortcut
- console modal
- session manager
- process supervisor
- parallel sessions
- run once

**总代码规模预估：1000–1500 行**

---

## 总结

AgentBridge 的核心价值：**给本地 coding agent 一个移动端控制入口。**

它不是 OpenClaw、workflow engine、agent runtime，而是一个**极简的 Agent Gateway + Session Supervisor**。
