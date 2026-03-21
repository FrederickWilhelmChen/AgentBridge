# Workspace-First Context Model Design

**Date:** 2026-03-21
**Status:** Approved
**Scope:** Redesign AgentBridge session scoping so users select a stable workspace at initialization time while Git repositories can transparently use managed worktrees and non-Git folders remain first-class workspaces.

---

## 1. Overview

The current runtime model treats `cwd` as both the user-facing selection object and the execution boundary. That works for a single fixed working directory, but it becomes brittle as soon as the system needs:

- Git worktrees under the same repository
- multiple isolated execution contexts under one conversation
- non-Git directories used for general productivity work
- future agent-team style parallel execution

The redesigned model makes `workspace` the primary object users select, keeps `cwd` as an execution detail, and treats Git worktrees as managed sub-contexts of a Git-backed workspace rather than top-level session identities.

This keeps the initialization flow simple:

1. select workspace
2. select agent
3. start the conversation

Worktrees only appear later when a task needs isolation.

---

## 2. Goals

- Preserve a simple initialization flow centered on one stable user choice
- Support both Git repositories and non-Git folders as first-class workspaces
- Deduplicate the same repository across multiple discovered worktrees into one selectable workspace
- Allow Git-backed workspaces to create and switch managed worktrees inside a session
- Prevent unsafe concurrent reuse of the same session or execution context
- Make `doctor` degrade cleanly when Git is unavailable on the machine

## 3. Non-Goals

- No automatic detection of every meaningful plain folder on disk
- No requirement that every workspace be converted into a Git repository
- No distributed lock manager or multi-host coordination in this phase
- No user-facing exposure of raw `cwd` values during initialization

---

## 4. Design Options

### Option A: Keep `cwd` as the session identity

Users continue selecting a literal path up front, and any worktree path must be added to the allowlist before use.

Pros:

- lowest implementation cost
- minimal schema changes

Cons:

- conflicts directly with dynamic worktrees
- does not generalize cleanly to non-Git workspaces
- makes future agent-team parallelism fragile

### Option B: Repo-first model

Users select a repository, and sessions bind to a repository identity.

Pros:

- fits code-centric use cases well
- natural place to attach worktrees

Cons:

- excludes ordinary folders like `multi-ideas`
- forces Git concepts onto users doing non-code work

### Option C: Workspace-first model with capability detection

Users select a workspace root. The system detects whether that workspace is a Git repository and enables Git-only features such as worktrees when available.

Pros:

- supports both Git and non-Git usage
- keeps initialization simple
- gives one consistent session model
- allows worktree support without making worktrees top-level choices

Cons:

- requires a new workspace registry
- requires capability-based branching in the runtime

### Recommendation

Adopt Option C.

It keeps the product broad enough for non-technical users while still allowing advanced Git-backed behavior when available.

---

## 5. Primary Model

### Workspace

A workspace is the stable root users select during initialization.

Proposed fields:

- `workspaceId`
- `rootPath`
- `displayName`
- `kind`: `git_repo` | `plain_dir`
- `source`: `scanned_git` | `manual` | `marker_file`
- `capabilities`
- `enabled`
- `lastUsedAt`

Examples:

- `E:/repos/project-a` -> `git_repo`
- `E:/multi-ideas` -> `plain_dir`

### Session

A session binds:

- agent
- workspace
- current execution context

It does not bind directly to a fixed `cwd`.

### Execution Context

An execution context is where a specific run actually executes.

Kinds:

- `main`
- `git_worktree`
- future: `task_folder`, `scratch_copy`

Proposed fields:

- `contextId`
- `workspaceId`
- `kind`
- `path`
- `label`
- `managed`
- `status`
- `branch` when applicable
- `createdBy`: `user` | `system`

The session points to one current context at a time.

---

## 6. Workspace Loading

### Git-backed workspaces

Git repositories should be auto-discovered from configured parent directories rather than registered one by one.

Configuration concept:

- `allowedWorkspaceParents`

Example:

- `E:/repos`
- `E:/projects`

Discovery flow:

1. walk configured parents at a bounded depth
2. detect Git working directories
3. compute a repository identity key using Git common-dir information
4. distinct multiple worktrees of the same repository into one workspace record

The result is one selectable workspace per repository, even if the filesystem currently contains several linked worktrees for that repo.

### Plain workspaces

Plain folders should not be broadly auto-discovered.

They should enter the system through one of these paths:

- explicit config registration
- a marker file such as `.agentbridge/workspace.json`

This avoids noisy discovery and lets users intentionally promote a folder into a workspace.

---

## 7. Initialization UX

Initialization stays simple and does not mention worktrees.

Flow:

1. user opens new session flow
2. system shows selectable workspaces
3. user chooses a workspace
4. user chooses an agent
5. session starts on the workspace's main execution context

Display rules:

- show one list mixing Git repos and plain workspaces
- label each item by type
- never show worktrees in the top-level selection list

Examples:

- `project-a` `Git Repo`
- `project-b` `Git Repo`
- `multi-ideas` `Workspace`

---

## 8. Worktree Behavior Inside One Git Workspace

For a Git-backed workspace, worktrees are session-internal execution contexts.

### Default behavior

- the session starts on `main`
- normal tasks continue on `main` unless isolation is needed

### Supported operations

- list contexts
- create managed worktree
- switch current context
- archive or remove managed worktree
- return to `main`

### Recommended creation policy

Managed worktrees should live under a dedicated AgentBridge-controlled root rather than under the repository root by default.

Example:

- `E:/AgentBridge-worktrees/project-a/<session-id>/<task-name>`

Reasons:

- cleaner repository root
- easier cleanup
- simpler path policy
- reduced risk of tooling recursively indexing nested worktrees

### Existing user-created worktrees

When the selected Git workspace already has linked worktrees, the system may discover them and expose them as external contexts.

They should be marked:

- `managed=false`
- `createdBy=user`

The runtime may allow switching into them, but it should not auto-delete them.

---

## 9. Capability Model

The runtime should branch behavior based on workspace capabilities.

### Git workspace capabilities

- file editing
- Git inspection
- worktree management
- future agent-team isolation

### Plain workspace capabilities

- file editing
- attachments
- office or document workflows
- future non-Git isolation modes

This avoids forcing Git semantics onto users doing general productivity work.

---

## 10. Locking Model

The system needs local runtime locks.

### Session lock

One session should have only one active front-door transition at a time.

Use cases:

- starting a run
- switching current context
- updating provider-session state

### Context lock

One execution context should only run one task at a time.

This prevents two runs from mutating the same worktree concurrently.

### Repo metadata lock

Short-lived lock for repo-level management actions:

- create worktree
- remove worktree
- refresh worktree registry

Do not serialize all execution across the entire repository. Different worktrees should still run in parallel.

---

## 11. Doctor Behavior Without Git

`doctor` should explicitly handle machines where Git is not installed.

Expected behavior:

1. detect whether Git is available
2. if Git is missing:
   - do not run repository scanning
   - do not fail the whole setup because of missing Git
   - warn that Git-only features are unavailable
   - continue validating plain workspaces
3. if Git is present:
   - enable repo scanning
   - enable Git capability checks

This is important for non-technical users who use AgentBridge for general file work rather than software development.

Recommended doctor messaging:

- `Git not found. Repository discovery and worktree features are disabled. Plain workspaces remain available.`

---

## 12. Data and Config Changes

### Replace

- `allowedCwds`

### Introduce

- `allowedWorkspaceParents`
- `manualWorkspaces`
- workspace registry persistence
- execution-context persistence

The runtime should treat exact run `cwd` values as derived state, not configuration state.

---

## 13. Error Handling

- Selecting a workspace whose root no longer exists should surface a clear invalid-workspace error
- Git capability checks should degrade gracefully if the workspace was once a repo but Git is currently unavailable
- Switching to a context that no longer exists should fail safely and fall back to `main` when possible
- Removing a managed worktree should be blocked while its context lock is held

---

## 14. Verification

The design is correctly implemented when:

- users can start a session by selecting either a Git repo or a plain workspace
- multiple worktrees of the same repo are deduplicated into one top-level Git workspace choice
- worktrees do not appear as top-level selectable workspaces
- a Git workspace can create and switch managed worktrees within the session
- a plain workspace remains usable on machines with no Git installed
- `doctor` does not fail repo scanning on no-Git systems and clearly reports the degraded mode

---

## 15. Risks

- bounded repo scanning can still be expensive if parent directories are too broad
- workspace marker files can drift if users move folders manually
- switching from `allowedCwds` to workspace-based rules requires careful migration of old sessions
- exposing external user-created worktrees may confuse users if labels and ownership are not clear

---

## 16. Open Decisions For Implementation Planning

- exact schema for storing workspace and execution-context records
- how much of worktree switching should be exposed in Slack and Lark UI versus kept implicit
- whether external worktrees are selectable by default or behind an advanced toggle
- the exact config format for manual plain-workspace registration
