# AgentBridge

这是一个把聊天平台和本机 Agent CLI 连接起来的桥接服务。  

你可以在 Feishu / Lark 或 Slack 中驱动本机的 Claude Code或Codex（当前仅支持这两个cli）。  

## 核心思想
- ClaudeCode Codex 已经是全面而功能完整的Agent，已经可以完成90%以上的OpenClaw的功能，直接远程操作他们比OpenClaw转一道+配置OpenClaw+额外多花token钱要省事的多
- ClaudeCode Codex 当前的远程Remote方案高度依赖于官方订阅+云服务，在Anthropic频繁炸号国内用户普遍使用中转站的情况下，官方Remote可望不可及
- 区别于GolemBot这种虽然是直接remote但又在ClaudeCode外面又蒙了一层Skill市场的做法，AgentBridge只做桥接，不加任何额外的”智能”层，核心仍然是：彻底放权给已经非常成熟的Agent

## 平台交互方式

### Feishu / Lark

- 推荐使用“话题模式” 
- 将机器人拉入群组，群组改为话题模式，发送一条根消息：`@Bot start`  
- 只在初始化阶段选择一次 cli（ClaudeCode、Codex） 和工作目录  
- 初始化完成后，后续都在同一个话题里继续发送任务，话题即session  
- AgentBridge 会先回复一张处理中共享卡片，完成后再更新同一张卡片  

### Slack

- 使用“modal-first”模式  
- 通过全局 shortcut 打开新会话  
- 一个 Slack thread 就是一个 session  
- 只在创建 session 时选择 agent 和工作目录  
- 后续都在这个 thread 里继续，不在同一 thread 里切换 agent 或工作目录  

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
- 询问平台、代理、默认 agent、允许的工作目录  
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
Feishu / Lark example:
注：USER_ID确保只有你给BOT发消息时会被接收并处理

```env
AGENTBRIDGE_ENABLED_PLATFORMS=lark
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project

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
- 文本控制目前只保留很少量的中断语义如stop、interrupt
- 当前访问控制更偏向单用户本地自托管  
- 不同机器上的 Claude / Codex CLI 行为仍可能存在差异  
- 如果你的slack、lark已经和OpenClaw形成了绑定，最好先关闭OpenClaw再开启本服务，或者直接新建一个bot，否则消息投递会出现混乱