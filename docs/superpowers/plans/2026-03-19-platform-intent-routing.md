# Platform Intent Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add platform-agnostic message handling, Slack text-entry routing, and the first version of a lightweight natural-language intent router that prepares the codebase for Feishu support.

**Architecture:** Introduce a small platform abstraction layer and a rule-first intent router that can classify text into control intents or AI prompts. Migrate Slack-specific run metadata to platform-neutral fields before adding Slack message handlers and Feishu adapters so the service layer stays unaware of message source details.

**Tech Stack:** TypeScript, Node.js, Slack Bolt, better-sqlite3, zod

---

### Task 1: Create the failing tests for intent routing

**Files:**
- Create: `E:\AgentBridge\src\intent\intent-router.test.ts`
- Create: `E:\AgentBridge\src\intent\intent-router.ts`

- [ ] **Step 1: Write the failing test**

Cover these behaviors:
- text like `status` maps to a status control intent
- text like `切换到 E:/AgentBridge` maps to a `set_cwd` control intent with a path
- text like `帮我看下这个编译错误` falls through to an AI prompt
- text like `restart codex session` maps to a restart control intent with `codex`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/intent/intent-router.test.ts`
Expected: FAIL because the router module does not exist yet

- [ ] **Step 3: Write minimal implementation**

Create a small rule-first router with:
- text normalization
- alias-based command matching
- optional agent extraction
- path extraction for `set_cwd`
- default passthrough to AI prompt

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/intent/intent-router.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/intent/intent-router.ts src/intent/intent-router.test.ts
git commit -m "feat: add initial intent router"
```

### Task 2: Create the failing tests for platform-neutral run/session records

**Files:**
- Modify: `E:\AgentBridge\src\domain\models.ts`
- Modify: `E:\AgentBridge\src\store\db.ts`
- Modify: `E:\AgentBridge\src\store\run-store.ts`
- Modify: `E:\AgentBridge\src\store\session-store.ts`
- Create: `E:\AgentBridge\src\store\platform-store.test.ts`

- [ ] **Step 1: Write the failing test**

Cover these behaviors:
- run records persist `platform`, `platformChannelId`, `platformThreadId`, `platformUserId`
- session records persist `platform` and `platformUserId`
- database initialization migrates old Slack-specific columns into the platform-neutral schema

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/store/platform-store.test.ts`
Expected: FAIL because models and schema are still Slack-specific

- [ ] **Step 3: Write minimal implementation**

Update the domain types and database migration path so existing databases are upgraded in place. Keep compatibility with current local data by migrating or backfilling Slack records as platform `slack`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/store/platform-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/models.ts src/store/db.ts src/store/run-store.ts src/store/session-store.ts src/store/platform-store.test.ts
git commit -m "refactor: make persistence platform-neutral"
```

### Task 3: Create the failing tests for service-level message routing

**Files:**
- Modify: `E:\AgentBridge\src\services\agent-bridge-service.ts`
- Create: `E:\AgentBridge\src\services\message-routing.test.ts`
- Create: `E:\AgentBridge\src\platform\types.ts`

- [ ] **Step 1: Write the failing test**

Cover these behaviors:
- control intents call the correct service methods
- AI prompts use the active persistent session when available
- AI prompts fall back to default-agent `run_once` when no reusable session exists

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/services/message-routing.test.ts`
Expected: FAIL because the service does not yet expose a platform-neutral message entry point

- [ ] **Step 3: Write minimal implementation**

Add a platform-neutral message handling API that accepts unified message metadata and delegates to:
- control-intent execution
- persistent-session send
- run-once fallback

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/services/message-routing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-bridge-service.ts src/services/message-routing.test.ts src/platform/types.ts
git commit -m "feat: add platform-neutral message routing"
```

### Task 4: Create the failing tests for Slack text-entry support

**Files:**
- Modify: `E:\AgentBridge\src\slack\controller.ts`
- Modify: `E:\AgentBridge\src\slack\handlers.ts`
- Create: `E:\AgentBridge\src\slack\text-entry.test.ts`

- [ ] **Step 1: Write the failing test**

Cover these behaviors:
- direct Slack messages are accepted from the allowed user
- the handler routes text through the new message entry point
- shortcut/modal handling continues to work as a fallback path

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/slack/text-entry.test.ts`
Expected: FAIL because Slack only supports shortcut/modal entry today

- [ ] **Step 3: Write minimal implementation**

Register Slack message listeners for DM or mention-based input, adapt them into unified platform messages, and reply with the existing block builders until the platform-neutral message renderer exists.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/slack/text-entry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/slack/controller.ts src/slack/handlers.ts src/slack/text-entry.test.ts
git commit -m "feat: add Slack text entry routing"
```

### Task 5: Add Feishu platform scaffolding behind the same interfaces

**Files:**
- Create: `E:\AgentBridge\src\platform\lark\client.ts`
- Create: `E:\AgentBridge\src\platform\lark\controller.ts`
- Create: `E:\AgentBridge\src\platform\lark\handlers.ts`
- Modify: `E:\AgentBridge\src\app\config.ts`
- Modify: `E:\AgentBridge\src\app\main.ts`

- [ ] **Step 1: Write the failing test**

Cover these behaviors:
- config accepts optional `LARK_*` settings
- the app can boot with Slack only, Lark only, or both enabled
- Lark handlers transform incoming events into unified platform messages

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/platform/lark/lark-bootstrap.test.ts`
Expected: FAIL because Lark support is not implemented yet

- [ ] **Step 3: Write minimal implementation**

Add the Feishu adapter with raw HTTP client and webhook/event handling, but keep message rendering minimal and aligned with the current Slack responses.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/platform/lark/lark-bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/platform/lark src/app/config.ts src/app/main.ts
git commit -m "feat: add Feishu platform adapter"
```

### Task 6: Update docs and record the v2 composite-intent follow-up

**Files:**
- Modify: `E:\AgentBridge\README.md`
- Modify: `E:\AgentBridge\docs\superpowers\specs\2026-03-18-lark-integration-design.md`

- [ ] **Step 1: Update docs**

Document:
- Slack text-entry as the primary UX
- shortcut/modal as fallback
- intent router behavior and conservatism
- Feishu platform support
- composite intents explicitly listed as a post-v1 follow-up

- [ ] **Step 2: Verify docs match implementation**

Run: `npm run check`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-03-18-lark-integration-design.md
git commit -m "docs: update platform routing design"
```
