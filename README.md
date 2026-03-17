# AgentBridge

AgentBridge is a lightweight Slack bridge for remotely controlling local Claude Code or Codex sessions from mobile.

## Current MVP

This repository now includes a usable MVP skeleton with:

- Slack Bolt app running in Socket Mode
- Global shortcut modal
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

3. Configure Slack app credentials in `.env`:

- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_ALLOWED_USER_ID`

4. Configure allowed working directories:

```env
AGENTBRIDGE_ALLOWED_CWDS=E:/your/project,E:/another/project
```

5. Configure proxy if your network relies on a local system proxy.

On this Windows machine, Codex CLI did not automatically inherit the Windows Internet Settings proxy, which caused repeated WebSocket retries before falling back to HTTPS. AgentBridge now auto-detects the Windows proxy from the registry, but you can also pin it explicitly:

```env
AGENTBRIDGE_HTTP_PROXY=http://127.0.0.1:10088
AGENTBRIDGE_HTTPS_PROXY=http://127.0.0.1:10088
```

6. Configure agent commands.

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
- bot scopes required for opening views and posting messages

At minimum, check these scopes:

- `commands`
- `chat:write`
- `im:write`
- `im:history`

Depending on your app setup, you may also need:

- `users:read`
- `channels:history`

## MVP Notes

- Claude persistent sessions are supported through Claude session resume IDs.
- Codex persistent sessions are supported through `codex exec` and `codex exec resume`.
- AgentBridge injects `HTTP_PROXY` and `HTTPS_PROXY` into child processes, and on Windows it auto-detects the system proxy from Internet Settings if those env vars are not already set.
- Codex output may include transport warnings if the network path is broken; AgentBridge extracts the final answer and session id from that output.
- Output is returned when the run finishes; streaming updates are not implemented yet.
- Interrupt works only for runs started by the current AgentBridge process.

## Next Steps

- add richer status cards
- show running output tail while tasks are in progress
- add App Home and recent session UX
