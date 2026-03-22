# AgentBridge

这是一个把聊天平台和本机 Agent CLI 连接起来的桥接服务。  

你可以在 Feishu / Lark 或 Slack 中驱动本机的 Claude Code 或 Codex（当前主要支持这两个 CLI）。  

## 核心思想

- Claude Code 和 Codex 本身已经是成熟的 agent，很多场景下不需要再套一层复杂编排系统
- 官方 remote 方案往往依赖订阅和云服务，本地自托管桥接更适合当前这类使用环境
- AgentBridge 只做桥接，不额外叠加新的“智能层”，核心目标是把成熟 CLI 稳定接到聊天平台

## 平台交互方式

### Feishu / Lark

- 推荐使用“话题模式”
- 将机器人拉入群组，群组改为话题模式，发送一条根消息，例如 `start` 或 `@Bot start`
- 只在初始化阶段选择一次 agent 和 workspace
- 初始化完成后，后续都在同一个话题里继续发送任务，话题即 session
- AgentBridge 会先回复一张处理中共享卡片，完成后再更新同一张卡片

### Slack

- 使用“modal-first”模式
- 通过全局 shortcut 打开新会话
- 一个 Slack thread 就是一个 session
- 只在创建 session 时选择 agent 和 workspace
- 后续都在这个 thread 里继续，不在同一 thread 里切换 agent 或 workspace

## 快速开始

Windows:

```powershell
.\install.ps1
```

macOS / Linux:

```bash
chmod +x ./install.sh
./install.sh
```

安装脚本会完成这些事：

- 检查 `node` 和 `npm`
- 执行 `npm install`
- 按需从 `.env.example` 生成 `.env`
- 创建本地运行目录
- 询问平台、代理、默认 agent、workspace 发现根目录或手动 workspace
- 继续询问 Slack 或 Feishu 所需配置
- 运行 `npm run doctor`
- 可选直接启动 `npm run dev`

## 手动安装

1. 安装依赖

```bash
npm install
```

2. 复制配置模板

Windows:

```powershell
Copy-Item .env.example .env
```

macOS / Linux:

```bash
cp .env.example .env
```

3. 填写 `.env`

Feishu / Lark 示例：  
注：`LARK_ALLOWED_USER_ID` 确保只有你的消息会被接收并处理。

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS=E:/repos,E:/projects
AGENTBRIDGE_MANUAL_WORKSPACES=E:/multi-ideas

LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=your-app-secret
LARK_ALLOWED_USER_ID=ou_xxxxx
```

Slack 所需权限、事件和 shortcut 配置见：

- [docs/platforms/slack.md](docs/platforms/slack.md)

4. 运行自检

```bash
npm run doctor
```

5. 启动服务

```bash
npm run dev
```

## 重要配置说明

- `AGENTBRIDGE_DB_PATH` 是数据库文件路径，不需要手动创建数据库文件
- `AGENTBRIDGE_ALLOWED_WORKSPACE_PARENTS` 用来扫描父目录本身和一级子目录中的 Git repo workspace，并按同一仓库去重
- `AGENTBRIDGE_MANUAL_WORKSPACES` 用来显式登记普通目录，例如笔记、资料或日常工作目录
- 没有 Git 的机器仍然可以只使用 plain workspace
- managed worktree 会创建在主仓库同级目录，命名为 `{仓库名}-{worktree名}`，分支名形如 `worktree/review-auth`
- `AGENTBRIDGE_HTTP_PROXY` 和 `AGENTBRIDGE_HTTPS_PROXY` 是可选项，只有本机必须走代理时才填写
- `AGENTBRIDGE_CLAUDE_COMMAND` 是 Claude 可执行文件路径
- `AGENTBRIDGE_CLAUDE_ARGS`、`AGENTBRIDGE_CLAUDE_RESUME_ARGS`、`AGENTBRIDGE_CODEX_ARGS`、`AGENTBRIDGE_CODEX_RESUME_ARGS` 一般不需要修改，除非你明确在做兼容性调整
- `AGENTBRIDGE_CODEX_COMMAND=node` 在默认配置中是正常的，因为真正的 Codex 入口在 `AGENTBRIDGE_CODEX_ARGS`

## 常用命令

```bash
npm run dev
npm run build
npm run check
npm run start
npm run doctor
```

## 文档

- [安装说明 / Installation](docs/installation.md)
- [配置说明 / Configuration](docs/configuration.md)
- [使用说明 / Usage](docs/usage.md)
- [Slack 接入 / Slack Setup](docs/platforms/slack.md)
- [Feishu / Lark 接入 / Feishu / Lark Setup](docs/platforms/lark.md)
- [排障说明 / Troubleshooting](docs/troubleshooting.md)

## 当前限制

- 目前还是“最终结果优先”，还没有真正的流式输出
- managed Git worktree 已经支持，但平台侧还没有完整的 context 切换 UI
- 文本控制目前只保留很少量的中断语义，例如 `stop`、`interrupt`
- 当前访问控制更偏向单用户本地自托管
- 不同机器上的 Claude / Codex CLI 行为仍可能存在差异
- 如果你的 Slack、Lark 已经和其他 bot 绑定，最好先停掉冲突服务，避免消息投递混乱
