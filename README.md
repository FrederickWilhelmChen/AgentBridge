# AgentBridge

AgentBridge is a lightweight messaging bridge for remotely controlling local Claude Code or Codex sessions from mobile. It now supports Slack and has a first working Feishu/Lark adapter.

## Current MVP

This repository now includes a usable MVP skeleton with:

- Slack Bolt app running in Socket Mode
- Global shortcut modal
- Slack DM text entry with lightweight intent routing
- first Feishu/Lark webhook adapter
- `Run Once`
- persistent session creation/reset
- send-to-persistent-session
- session status lookup
- interrupt for active runs
- SQLite-backed session/run storage
- configurable Claude/Codex command adapters
- verified Claude and Codex persistent session support

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env file and fill values:

```bash
copy .env.example .env
```

3. Choose enabled platforms in `.env`:

```env
AGENTBRIDGE_ENABLED_PLATFORMS=slack
```

Use `slack`, `lark`, or `slack,lark`.

4. Configure platform credentials in `.env`.

Slack:

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_ALLOWED_USER_ID`

Lark:

- `LARK_APP_ID`
- `LARK_APP_SECRET`
- `LARK_ALLOWED_USER_ID`

`LARK_ENCRYPT_KEY` and `LARK_VERIFICATION_TOKEN` are optional in the current implementation.
Feishu/Lark now uses the official long-connection mode, so no inbound webhook URL, public IP, or local tunnel is required.

5. Configure allowed working directories:

```env
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project
```

6. Configure proxy if your network relies on a local system proxy.

On this Windows machine, Codex CLI did not automatically inherit the Windows Internet Settings proxy, which caused repeated WebSocket retries before falling back to HTTPS. AgentBridge now auto-detects the Windows proxy from the registry, but you can also pin it explicitly:

```env
AGENTBRIDGE_HTTP_PROXY=http://127.0.0.1:10088
AGENTBRIDGE_HTTPS_PROXY=http://127.0.0.1:10088
```

7. Configure agent commands.

Recommended Claude config on this machine:

```env
AGENTBRIDGE_CLAUDE_COMMAND=E:/nodejs/claude.cmd
AGENTBRIDGE_CLAUDE_ARGS=-p --output-format json
AGENTBRIDGE_CLAUDE_RESUME_ARGS=-p --output-format json -r {sessionId}
AGENTBRIDGE_CLAUDE_OUTPUT_MODE=claude_json
```

Recommended Codex config for this project:

```env
AGENTBRIDGE_CODEX_COMMAND=node
AGENTBRIDGE_CODEX_ARGS=node_modules/@openai/codex/bin/codex.js exec --skip-git-repo-check -
AGENTBRIDGE_CODEX_RESUME_ARGS=node_modules/@openai/codex/bin/codex.js exec resume {sessionId} -
AGENTBRIDGE_CODEX_OUTPUT_MODE=codex_text
```

This avoids the unstable WindowsApps `codex.exe` path and uses the installed `@openai/codex` package directly.

## Run

Development mode:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Type-check:

```bash
npm run check
```

## Slack App Requirements

Your Slack app should have:

- Socket Mode enabled
- a global shortcut with callback ID `open_agent_console`
- bot DMs enabled for text-entry mode
- bot scopes required for opening views and posting messages

At minimum, check these scopes:

- `commands`
- `chat:write`
- `im:write`
- `im:history`

Depending on your app setup, you may also need:

- `users:read`
- `channels:history`

## Feishu / Lark App Requirements

Your Feishu app should have:

- a bot capability enabled
- long connection / event subscription enabled
- permission to receive and send IM messages

For the current v1 implementation, AgentBridge only handles direct bot messages from the configured `LARK_ALLOWED_USER_ID`, and it connects outbound to Feishu instead of exposing a local callback endpoint.

## Text Intent Routing

Text entry is now the primary UX on Slack DM and Feishu. AgentBridge uses a small rule-first router:

- recognized control intents: `status`, `new session`, `restart session`, `interrupt`, `set cwd`
- Chinese and English aliases are supported for the small command set
- normal prose falls through to Claude/Codex as a regular AI task
- when a prompt mentions `claude` or `codex`, that agent preference is used for the request
- shortcut/modal remains available as the low-risk fallback path

Composite intents such as “switch to E:/repo and then use codex to inspect the build failure” are intentionally deferred beyond v1.

## MVP Notes

- Claude persistent sessions are supported through Claude session resume IDs.
- Codex persistent sessions are supported through `codex exec` and `codex exec resume`.
- persistent sessions are isolated by platform + user + agent
- AgentBridge injects `HTTP_PROXY` and `HTTPS_PROXY` into child processes, and on Windows it auto-detects the system proxy from Internet Settings if those env vars are not already set.
- Codex output may include transport warnings if the network path is broken; AgentBridge extracts the final answer and session id from that output.
- Output is returned when the run finishes; streaming updates are not implemented yet.
- Interrupt works only for runs started by the current AgentBridge process.

## Next Steps

- add richer status cards
- show running output tail while tasks are in progress
- add App Home and recent session UX
- add composite intent execution
