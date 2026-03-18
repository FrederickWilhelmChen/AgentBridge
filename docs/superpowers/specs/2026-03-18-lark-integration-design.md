# Lark/Feishu Integration Design

**Date:** 2026-03-18
**Status:** Approved
**Scope:** Add Lark (Feishu) as an alternative messaging platform to Slack

---

## 1. Overview

AgentBridge currently supports Slack as the control interface for AI agents (Claude/Codex). This design adds Lark/Feishu support for Chinese users who prefer the domestic platform.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform isolation | Sessions are platform-specific | A user running a session on Slack won't see it on Lark |
| Interaction style | Natural language text | No forms/modals; simple commands + free-form text to AI |
| Notification style | Reply in-thread | No proactive push notifications |
| Intent parsing | Hybrid approach | Bridge parses control commands (`!new`, `!status`); everything else goes to AI |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          AgentBridge (Node.js)                          │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐  │
│  │   Slack     │     │   Lark/Feishu    │     │   IntentRouter       │  │
│  │  Controller │     │   Controller     │────▶│  (thin layer)        │  │
│  │ (Bolt SDK)  │     │ (OpenAPI HTTPS)  │     └──────────────────────┘  │
│  └──────┬──────┘     └────────┬─────────┘              │                  │
│         │                     │                        │                  │
│         └─────────────────────┴────────────────────────┘                  │
│                              │                                          │
│                              ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    AgentBridgeService                              │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐              │ │
│  │  │ Session  │ │   Run    │ │Interrupt │ │  Status  │              │ │
│  │  │ Manager  │ │ Executor │ │ Handler  │ │  Query   │              │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Claude / Codex (CLI)                               │
└─────────────────────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Platform Abstraction**: Common service layer doesn't know about message source
2. **Minimal Intent Recognition**: Bridge only intercepts session lifecycle commands
3. **Event-Driven**: Lark uses webhook + event subscription, no persistent connection

---

## 3. User Interaction Protocol

### Control Commands (Parsed by Bridge)

| User Input | Intent | Action |
|------------|--------|--------|
| `!new`, `!session`, `新会话` | Create new session | `createSession()` |
| `!restart`, `重启` | Restart current session | `restartSession()` |
| `!status`, `状态` | Query session status | `getStatus()` |
| `!stop`, `!interrupt`, `中断` | Interrupt current run | `interruptRun()` |
| `!cd <path>`, `切换目录 <path>` | Change working directory | `setCwd()` |

### Normal Requests (Passed to AI)

```
User: "帮我重构这段代码，改成async/await写法"
  ↓
Bridge → AgentBridgeService.runOnce(inputText) → Claude/Codex
  ↓
AI: generates code patch
  ↓
Bridge: Reply with message card (code block + interrupt button)
```

---

## 4. Data Model Changes

### Session
```typescript
export type Session = {
  sessionId: string;
  agentType: AgentType;
  cwd: string;
  mode: SessionMode;
  status: SessionStatus;
  providerSessionId: string | null;
  platform: "slack" | "lark";        // NEW
  platformUserId: string;             // NEW
  createdAt: string;
  lastActiveAt: string;
  lastRunId: string | null;
};
```

### Run
```typescript
export type Run = {
  runId: string;
  sessionId: string | null;
  agentType: AgentType;
  platform: "slack" | "lark";        // NEW (replaces slack-specific naming)
  platformChannelId: string;          // unified field for both platforms
  platformThreadId: string | null;    // unified field for both platforms
  platformUserId: string;             // NEW
  inputText: string;
  status: RunStatus;
  pid: number | null;
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
  outputTail: string;
  errorReason: string | null;
};
```

### Database Migration
- Add `platform` column to sessions table
- Add `platform`, `platform_user_id` columns to runs table
- Rename `slack_channel_id` → `platform_channel_id`
- Rename `slack_thread_ts` → `platform_thread_id`

---

## 5. Directory Structure

```
src/
├── platform/                    # Platform abstraction layer [NEW]
│   ├── types.ts                 # Unified message interfaces
│   ├── slack/                   # Existing (refactored)
│   │   ├── controller.ts
│   │   ├── handlers.ts
│   │   └── messages.ts
│   └── lark/                    # New implementation
│       ├── client.ts            # OpenAPI HTTP client
│       ├── controller.ts        # Event handlers
│       ├── handlers.ts          # Message processing
│       └── messages.ts          # Message card builders
├── domain/
│   ├── models.ts                # Updated types
│   └── enums.ts
├── services/
│   └── agent-bridge-service.ts  # Platform-agnostic
├── store/
│   └── db.ts                    # Migration support
└── app/
    ├── config.ts                # Add LARK_* env vars
    └── main.ts                  # Initialize both platforms
```

---

## 6. Lark Implementation Details

### API Strategy

- **No SDK dependency**: Use raw HTTPS calls to Lark OpenAPI
- **Event Subscriptions**: Configure webhook URL in Lark app console
- **Message Cards**: JSON-based rich messages (similar to Slack blocks)

### Required Configuration

```bash
# .env additions
LARK_APP_ID=cli_xxxxx
LARK_APP_SECRET=xxxxx
LARK_ENCRYPT_KEY=xxxxx         # For message encryption
LARK_VERIFICATION_TOKEN=xxxxx  # For URL validation (optional)
```

### Lark App Setup

1. Create **Enterprise Self-Built App** in Lark admin console
2. Enable **Bot** capability
3. Configure **Event Subscriptions**:
   - Subscribe to: `im.message.receive_v1`
   - Set webhook URL: `https://your-server.com/lark/events`
4. Grant permissions:
   - `im:message:send_as_bot`
   - `im:message:read`
   - `im:chat:readonly`

### Core API Endpoints

| Operation | Endpoint |
|-----------|----------|
| Get tenant token | `POST /auth/v3/tenant_access_token/internal` |
| Reply to message | `POST /im/v1/messages/{message_id}/reply` |
| Send DM | `POST /im/v1/messages` |

---

## 7. Configuration Schema Update

```typescript
// app/config.ts
export type AppConfig = {
  // Existing
  slack?: {
    botToken: string;
    appToken: string;
    signingSecret: string;
    allowedUserId: string;
  };
  // New
  lark?: {
    appId: string;
    appSecret: string;
    encryptKey: string;
    verificationToken?: string;
  };
  database: { path: string; };
  runtime: {
    // Existing runtime config...
    allowedCwds: string[];
    defaultAgent: AgentType;
    // platform selection at startup
    enabledPlatforms: ("slack" | "lark")[];
  };
};
```

---

## 8. Intent Router Design

```typescript
// platform/types.ts
export type IncomingMessage = {
  platform: "slack" | "lark";
  userId: string;
  channelId: string;
  threadId: string | null;
  rawText: string;
  messageId: string;
  timestamp: string;
};

export type PlatformClient = {
  platform: "slack" | "lark";
  reply(messageId: string, content: MessageContent): Promise<void>;
  update(messageId: string, content: MessageContent): Promise<void>;
};

// Intent classification
function parseCommand(text: string): Command | null {
  const trimmed = text.trim().toLowerCase();

  if (/^!(new|session)|^新会话/.test(trimmed)) {
    return { type: "create_session" };
  }
  if (/^!(restart)|^重启/.test(trimmed)) {
    return { type: "restart_session" };
  }
  if (/^!(status)|^状态/.test(trimmed)) {
    return { type: "get_status" };
  }
  if (/^!(stop|interrupt)|^中断/.test(trimmed)) {
    return { type: "interrupt_run" };
  }
  const cdMatch = trimmed.match(/^!(cd|cwd)\s+(.+)|^切换目录\s+(.+)/);
  if (cdMatch) {
    return { type: "set_cwd", path: cdMatch[2] || cdMatch[3] };
  }

  return null; // Not a command, pass to AI
}
```

---

## 9. Out of Scope

| Feature | Reason |
|---------|--------|
| Cross-platform session sync | Users choose one platform and stick with it |
| Lark slash commands | Text-based commands are simpler and sufficient |
| Lark approval flows | Not needed for personal computer use case |
| Lark native forms/cards | Text + simple buttons only (MVP approach) |

---

## 10. Future Considerations

1. **Message Card Templates**: Could add rich diff view for code changes
2. **File Sharing**: Support Lark's file upload for code/context sharing
3. **Group Chat Support**: Currently scoped to 1:1 bot conversations

---

## Appendix: Lark vs Slack API Comparison

| Feature | Slack | Lark |
|---------|-------|------|
| Connection | Socket Mode (persistent) | Webhook + HTTPS polling |
| Auth | Bot token + App token | App ID + App Secret → Tenant token |
| Rich messages | Block Kit | Message Card (JSON) |
| Threading | `thread_ts` | `parent_id` in message context |
| DM handling | `conversations.open` | `chat_id` in message event |
| User identification | `user.id` | `sender.sender_id.open_id` |

---

*[Document follows AgentBridge design conventions. For implementation, see associated implementation plan.]*
