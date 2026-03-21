# Workspace-First Context Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `cwd`-centric session routing with a workspace-first model that supports Git repo discovery, plain workspace registration, managed execution contexts, and no-Git doctor degradation.

**Architecture:** Introduce a persistent workspace registry and execution-context model, then route sessions through a selected workspace rather than a fixed `cwd`. Git repositories gain capability-driven discovery and managed worktree support, while plain folders remain selectable through explicit registration and run without Git-specific features.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, zod, Slack Bolt, Lark SDK, Git CLI

---

### Task 1: Add workspace and execution-context persistence

**Files:**
- Modify: `E:\AgentBridge\src\domain\models.ts`
- Modify: `E:\AgentBridge\src\domain\enums.ts`
- Modify: `E:\AgentBridge\src\store\db.ts`
- Create: `E:\AgentBridge\src\store\workspace-store.ts`
- Create: `E:\AgentBridge\src\store\execution-context-store.ts`
- Create: `E:\AgentBridge\src\store\workspace-store.test.ts`
- Modify: `E:\AgentBridge\src\store\session-store.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- workspace records persist `rootPath`, `kind`, `source`, capability flags, and timestamps
- execution-context records persist `workspaceId`, `kind`, `path`, `managed`, `status`, and optional branch
- database initialization creates or migrates the new tables without breaking existing session storage

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/store/workspace-store.test.ts`
Expected: FAIL because the new stores and schema do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- new workspace and execution-context domain types
- schema migration for new tables
- focused stores for workspace and execution-context persistence
- only the enum values needed by the approved spec

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/store/workspace-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/models.ts src/domain/enums.ts src/store/db.ts src/store/workspace-store.ts src/store/execution-context-store.ts src/store/workspace-store.test.ts src/store/session-store.ts
git commit -m "feat: add workspace and execution-context persistence"
```

### Task 2: Replace `allowedCwds` with workspace-oriented config and doctor checks

**Files:**
- Modify: `E:\AgentBridge\src\app\config.ts`
- Modify: `E:\AgentBridge\src\app\doctor.ts`
- Modify: `E:\AgentBridge\.env.example`
- Create: `E:\AgentBridge\src\app\doctor-workspace.test.ts`
- Modify: `E:\AgentBridge\src\app\config.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- config accepts `allowedWorkspaceParents` and manual plain-workspace registration
- config no longer requires exact `allowedCwds`
- doctor detects when Git is unavailable
- doctor skips repo scanning and reports degraded mode when Git is missing

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/app/config.test.ts src/app/doctor-workspace.test.ts`
Expected: FAIL because config and doctor still assume `cwd` allowlists and Git availability

- [ ] **Step 3: Write minimal implementation**

Implement:
- config parsing for workspace parents and manual workspaces
- Git availability detection utility
- doctor messaging that explicitly disables repo discovery when Git is absent
- compatibility fallback only where needed to avoid a hard break during migration

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/app/config.test.ts src/app/doctor-workspace.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/config.ts src/app/doctor.ts .env.example src/app/doctor-workspace.test.ts src/app/config.test.ts
git commit -m "feat: add workspace config and no-git doctor fallback"
```

### Task 3: Implement workspace discovery and repository deduplication

**Files:**
- Create: `E:\AgentBridge\src\services\workspace-discovery-service.ts`
- Create: `E:\AgentBridge\src\services\workspace-discovery-service.test.ts`
- Modify: `E:\AgentBridge\src\app\main.ts`
- Modify: `E:\AgentBridge\src\services\session-service.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- Git work directories discovered under configured parents are deduplicated by repository identity
- plain workspaces from config or marker files are registered as `plain_dir`
- discovered worktrees do not become top-level duplicate workspace choices

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/services/workspace-discovery-service.test.ts`
Expected: FAIL because no discovery service exists yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- bounded parent-directory scanning
- Git repo detection using Git CLI
- repository identity derivation using common-dir information
- registration or refresh of workspace records
- marker-file detection for explicit plain workspaces if that path is chosen in config

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/services/workspace-discovery-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/workspace-discovery-service.ts src/services/workspace-discovery-service.test.ts src/app/main.ts src/services/session-service.ts
git commit -m "feat: add workspace discovery and repo deduplication"
```

### Task 4: Refactor session routing around workspaces and execution contexts

**Files:**
- Modify: `E:\AgentBridge\src\services\agent-bridge-service.ts`
- Modify: `E:\AgentBridge\src\services\session-service.ts`
- Modify: `E:\AgentBridge\src\platform\types.ts`
- Modify: `E:\AgentBridge\src\services\message-routing.test.ts`
- Modify: `E:\AgentBridge\src\services\agent-bridge-service.test.ts`
- Create: `E:\AgentBridge\src\services\workspace-session-routing.test.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- session creation binds to a workspace rather than a literal selected `cwd`
- runs use the session's current execution context path
- plain workspaces remain valid when no Git capabilities exist
- top-level message routing no longer depends on `allowedCwds`

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/services/workspace-session-routing.test.ts src/services/message-routing.test.ts src/services/agent-bridge-service.test.ts`
Expected: FAIL because services still route by `cwd`

- [ ] **Step 3: Write minimal implementation**

Implement:
- workspace lookup during session initialization
- current execution-context resolution
- session updates that point to a context identifier instead of a mutable `cwd`
- compatibility mapping for legacy session records when needed

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/services/workspace-session-routing.test.ts src/services/message-routing.test.ts src/services/agent-bridge-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/agent-bridge-service.ts src/services/session-service.ts src/platform/types.ts src/services/message-routing.test.ts src/services/agent-bridge-service.test.ts src/services/workspace-session-routing.test.ts
git commit -m "refactor: route sessions through workspaces"
```

### Task 5: Add local runtime locks for session, context, and repo metadata operations

**Files:**
- Create: `E:\AgentBridge\src\runtime\locks.ts`
- Create: `E:\AgentBridge\src\runtime\locks.test.ts`
- Modify: `E:\AgentBridge\src\services\agent-bridge-service.ts`
- Modify: `E:\AgentBridge\src\services\session-service.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- one session cannot perform two front-door transitions concurrently
- one execution context cannot be reused by two active runs at the same time
- repo metadata operations serialize only the metadata-changing section

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/runtime/locks.test.ts`
Expected: FAIL because lock primitives do not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- lightweight in-process mutex helpers keyed by session, context, and repo
- lock wrapping at service boundaries
- no broad global serialization

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/runtime/locks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/runtime/locks.ts src/runtime/locks.test.ts src/services/agent-bridge-service.ts src/services/session-service.ts
git commit -m "feat: add runtime locks for workspace execution"
```

### Task 6: Add Git workspace context listing and managed worktree operations

**Files:**
- Create: `E:\AgentBridge\src\services\git-context-service.ts`
- Create: `E:\AgentBridge\src\services\git-context-service.test.ts`
- Modify: `E:\AgentBridge\src\services\session-service.ts`
- Modify: `E:\AgentBridge\src\services\agent-bridge-service.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- Git workspace contexts list `main` plus discovered linked worktrees
- managed worktree creation uses the configured AgentBridge-controlled root
- external user-created worktrees are marked as `managed=false`
- switching context only changes the session's current execution context

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/services/git-context-service.test.ts`
Expected: FAIL because Git context management does not exist yet

- [ ] **Step 3: Write minimal implementation**

Implement:
- `git worktree list --porcelain` parsing
- context synchronization for Git workspaces
- managed worktree creation and removal commands
- switch-to-context behavior without `git checkout`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/services/git-context-service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/git-context-service.ts src/services/git-context-service.test.ts src/services/session-service.ts src/services/agent-bridge-service.ts
git commit -m "feat: add managed git execution contexts"
```

### Task 7: Update Slack and Lark workspace selection UX

**Files:**
- Modify: `E:\AgentBridge\src\slack\views.ts`
- Modify: `E:\AgentBridge\src\slack\views.test.ts`
- Modify: `E:\AgentBridge\src\slack\handlers.ts`
- Modify: `E:\AgentBridge\src\platform\lark\handlers.ts`
- Modify: `E:\AgentBridge\src\slack\messages.ts`

- [ ] **Step 1: Write the failing tests**

Cover these behaviors:
- initialization UI shows selectable workspaces rather than raw `cwd` entries
- worktrees do not appear in the top-level workspace list
- session start messaging identifies the chosen workspace and current context cleanly

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/slack/views.test.ts src/platform/lark/lark-bootstrap.test.ts`
Expected: FAIL because the UI still assumes agent + `cwd` selection

- [ ] **Step 3: Write minimal implementation**

Implement:
- workspace-centric selection UI
- top-level filtering that hides worktrees
- wording changes from `cwd` to `workspace` where that is now user-facing

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/slack/views.test.ts src/platform/lark/lark-bootstrap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/slack/views.ts src/slack/views.test.ts src/slack/handlers.ts src/platform/lark/handlers.ts src/slack/messages.ts
git commit -m "feat: update platform flows for workspace selection"
```

### Task 8: Refresh docs and run full verification

**Files:**
- Modify: `E:\AgentBridge\README.md`
- Modify: `E:\AgentBridge\docs\configuration.md`
- Modify: `E:\AgentBridge\docs\usage.md`
- Modify: `E:\AgentBridge\docs\troubleshooting.md`
- Modify: `E:\AgentBridge\docs\installation.md`

- [ ] **Step 1: Update documentation**

Document:
- workspace-first terminology
- Git repo discovery vs manual plain-workspace registration
- managed worktree behavior
- no-Git doctor degradation
- any user-visible changes to Slack and Lark initialization

- [ ] **Step 2: Run typecheck and targeted tests**

Run:
- `npm run check`
- `node --test src/store/workspace-store.test.ts`
- `node --test src/services/workspace-discovery-service.test.ts`
- `node --test src/services/workspace-session-routing.test.ts`
- `node --test src/runtime/locks.test.ts`
- `node --test src/services/git-context-service.test.ts`
- `node --test src/slack/views.test.ts`
- `node --test src/platform/lark/lark-bootstrap.test.ts`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md docs/configuration.md docs/usage.md docs/troubleshooting.md docs/installation.md
git commit -m "docs: document workspace-first runtime model"
```
