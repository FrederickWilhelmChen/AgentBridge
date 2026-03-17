# AgentBridge 产品设计评审

## 整体判断：设计思路清晰且务实 ✓

你们把一个模糊的需求（"手机控制本地CLI"）收敛成了一个边界明确的产品。核心决策都很合理。

---

## 做得好的地方

### 1. 定位精准
- 明确了"bridge不是agent"这个核心边界
- 不做runtime、不做skill平台、不做workflow engine
- 这避免了scope creep，也是和OpenClaw最大的区别

### 2. 技术选型务实
- Slack Socket Mode：不需要公网webhook，对个人用户友好
- 先做Slack而不是WhatsApp：降低MVP复杂度
- Intent Router用规则+模糊匹配+embedding：渐进式方案，不过度依赖LLM

### 3. Session模型设计合理
- persistent + parallel + oneshot 三种模式覆盖了主要场景
- session包含的字段（cwd/pid/status/mode）都是必要的
- 支持并行session是亮点，符合实际开发场景

### 4. UI优先的思路对
- 手机上自然语言输入成本高，用shortcut/modal/buttons降低操作负担
- 80%操作通过UI完成是合理目标

---

## 需要注意的风险点

### 1. Process Supervisor的复杂度可能被低估

当前设计：
```
- spawn / interrupt / restart / kill
- auto restart、timeout
- MCP 修改后可 reload，卡死进程可恢复
```

这块是整个系统最容易出问题的地方：
- Claude Code/Codex的进程模型是什么样的？是否支持优雅中断？
- streaming output如何可靠捕获？stdout/stderr buffer满了怎么办？
- 进程卡死的判定逻辑是什么？timeout设多少合理？
- MCP reload是重启进程还是热加载？

**建议：** MVP阶段先做最简单的spawn/kill，restart和auto-recovery放到后面迭代。

### 2. Intent Router可能不需要这么复杂

你们设计了三层：规则 → RapidFuzz → embedding

但实际上，如果80%操作都通过UI完成，那自然语言输入的场景很少。可能规则匹配+简单的关键词就够了。

**建议：** MVP先做规则匹配，看实际使用中有多少edge case再决定要不要加模糊匹配。

### 3. Session routing的用户体验需要细化

当前设计是：用户在modal里选session，然后发消息。

但实际场景可能是：
- 我在手机上看到一个错误通知
- 我想立刻让agent去修
- 我不记得这个项目对应哪个session

这时候需要：
- 从cwd反推session
- 或者支持"临时指定cwd"而不是必须先switch session
- 或者支持"最近使用的session"快捷选择

**建议：** 在App Home里加"Recent Sessions"，按last_active排序。

### 4. 安全边界需要更具体

当前只说了：
- user whitelist
- private DM only
- cwd whitelist

但没说：
- cwd whitelist怎么配置？默认是什么？
- 如果agent要读写文件，是否需要二次确认？
- 如果agent要执行shell命令，是否需要限制？

**建议：** MVP阶段可以简单粗暴：只允许预设的几个项目目录，其他一律拒绝。

### 5. "Run Once"的定义不够清晰

MRD里说"执行完自动退出"，但：
- 什么叫"执行完"？agent返回结果就算完？还是进程退出才算完？
- 如果agent问了follow-up问题怎么办？
- 如果任务跑了很久（比如跑测试），是否有超时？

**建议：** Run Once = 单轮对话 + 30分钟超时 + 自动kill进程。

---

## 缺失的部分

### 1. 错误处理策略

需要定义：
- agent进程crash了怎么办？
- Slack连接断了怎么办？
- 用户发了消息但agent没响应怎么办？

**建议：** 加一个"Error Handling"章节，定义重试策略、降级方案、用户通知机制。

### 2. 输出格式化

Claude Code/Codex的输出可能很长，直接发到Slack会：
- 超过消息长度限制
- 格式乱掉（代码块、表格）
- 刷屏

**建议：**
- 长输出自动截断 + "查看完整输出"按钮
- 代码块自动转成Slack code block
- 支持"只看最后N行"

### 3. 成本估算

MRD里说"1000-1500行代码"，但没说：
- 开发时间预估
- 依赖的外部服务（Slack API、embedding API）
- 运行成本（如果用embedding做intent routing）

**建议：** 补充一个"Implementation Plan"，列出关键模块的开发顺序和时间预估。

---

## 最终建议

### MVP范围可以再收敛一点

**必须有：**
- Slack Socket Mode
- 一个简单的console modal（agent选择 + 消息输入）
- 单session管理（先不做parallel）
- 基础的process spawn/kill
- 规则匹配的intent router

**可以砍掉：**
- App Home（先用DM就行）
- parallel sessions（先证明单session能跑通）
- streaming output（先用polling，每5秒拉一次）
- intent router的模糊匹配和embedding（先用规则）

这样可以把代码量控制在500-800行，2-3天做出来，快速验证核心价值。

---

## 总结

这是一个边界清晰、定位准确的设计。主要风险在进程管理和用户体验细节，建议MVP先做最小可用版本，快速验证核心假设。
