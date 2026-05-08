# MVP-2: Claude Subprocess Integration + Chat Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a long-lived `claude -p` subprocess in the Tauri shell, expose it through 4 Tauri commands + a `claude_event` stream, and ship the bottom-overlay chat surface (`ClaudeChatDrawer`) plus the right-aligned `ClaudeStatusLine` in the footer. After this MVP, a user can hold a multi-turn chat with Claude inside the desktop app, riding their claude.ai subscription auth, with the active vault delivered to Claude as the subprocess `current_dir`.

**Architecture:** One long-lived `Command::new("claude")` per app session, spawned on the **first** user message (not on app boot — keeps cold start fast and avoids spawning when the user never opens chat). Stdin receives stream-json envelopes; stdout/stderr drain into Tokio tasks that parse stream-json and re-emit as Tauri `claude_event` payloads. Frontend hooks (`useClaudeSession`, `useClaudeStatus`, `useClaudeUsage`, `useDrawerState`) live under `src/app/knowledge_base/features/claude/`. The drawer is **absolute-positioned** over `PaneManager` (panes stay full-size and interactive). The footer gets a chat-toggle icon on the **left** and the right-aligned status line.

**Tech Stack:** Rust 2021 + tokio + serde + Tauri 2 (`Command::new` from `std::process` wrapped in `tokio::process::Command`); React + TypeScript + Tailwind v4 + shadcn/ui patterns; lucide-react icons (already used in Header); existing `tauri-plugin-store` for new settings keys.

---

## Decisions baked into this plan

- **Spawn lifecycle.** Subprocess spawned **lazily** on first `claude_send`, not on app boot. `claude_status` (which runs on app boot per § 7.3) only checks binary presence + version + auth — it does **not** spawn the long-lived process. Rationale: avoids paying ~600 ms of subprocess startup for users who never open chat; spec § 7.1 doesn't mandate eager spawn.
- **`current_dir` instead of `--cwd`.** Spec § 7.1 lists `--cwd <vaultRoot>` as a CLI flag. **`claude --help` confirms no such flag exists** — Claude inherits cwd from the spawning process. The Rust runner sets `Command::current_dir(vault_root)` instead. Functionally equivalent; the spec wording is wrong but the design intent is preserved.
- **`--permission-mode` value space.** Spec § 7.7 / § 7.1 say `acceptEdits` / `default`. **`claude --help` shows the actual choices include**: `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Plan honours the spec — only `acceptEdits` and `default` are exposed in settings. The wider set isn't useful inside the chat surface.
- **`ANTHROPIC_API_KEY` env_remove.** Per spec § 7.1, the runner explicitly `env_remove("ANTHROPIC_API_KEY")` so the subprocess can't fall back to API-key billing when the user has an OAuth subscription. Confirmed via `--bare` flag docs that Claude prefers OAuth in non-bare mode unless `ANTHROPIC_API_KEY` is set.
- **Crash-recovery state machine.** Three crashes inside any rolling 60-second window breaks the loop and surfaces "claude: failing to start" until the user clicks **Retry** (which fires `claude_reset` and resets the crash counter). Implemented as a `VecDeque<Instant>` of crash timestamps, dropping entries older than 60 s on each push.
- **Drawer mount point.** `KnowledgeBaseInner` renders `<ClaudeChatDrawer>` as a sibling of `<PaneManager>`, both inside a `relative` parent — drawer is `absolute inset-x-0 bottom-0` so it overlays panes without resizing them. (Mounting inside `<PaneManager>` would couple drawer state to pane internals; sibling keeps state isolation.)
- **Default-closed per launch.** Open/closed state is **not** persisted. Drawer height **is** persisted under `ui.claudeChat.height`. Spec § 7.4 is explicit on both.
- **Esc closes; click-outside does not.** Esc is wired only when chat has focus (`activeElement` inside drawer or composer textarea). Click-outside doesn't close because the user is expected to interact with panes-behind during chat. Spec § 7.4 explicit.
- **Toggle icon position: left edge of footer.** Mirrors Cursor / Claude Code / VS Code Copilot panel patterns (toggle on left, status info on right). Right edge is reserved for `ClaudeStatusLine`. Resolves spec § 11.4 plan-level decision.
- **Permission-mode UI when set to `default`.** Settings dropdown still exposes the toggle, but **the in-pane permission prompt UI is not built in this MVP**. When `default` is selected, the unhandled-prompt state is surfaced as a status-line warning ("claude: paused — awaiting permission"). Acceptable because the default selection is `acceptEdits`. Resolves spec § 11.4 plan-level decision.
- **Message bubble layout: both left-aligned, role label above.** Standard IDE-assistant pattern (Claude Code, Cursor, Copilot Chat). Right-aligned user bubbles waste horizontal space in a 320 px-default drawer.
- **Icon library: lucide-react.** Already used in `VaultSwitcher` (Header). Specific picks: `MessageCircle` (chat toggle), `Send` (composer), `Square` (interrupt), `ChevronRight` (collapse — rotated when expanded), `Circle` (status dot), `RotateCcw` (reset action), `AlertTriangle` (warning states).
- **Streaming cursor.** `▍` (U+258D LEFT FIVE EIGHTHS BLOCK) appended to the live partial text via the `PartialMessageStream` component, with `animate-pulse` Tailwind utility. Removed when `message_end` arrives for the turn.
- **Status-line typography.** `text-xs text-mute` with `font-variant-numeric: tabular-nums` so digits don't jiggle while streaming. Model name in `text-white`. Separator: ` · ` (literal middle dot with single spaces, matching spec § 7.5).
- **Settings additions: two keys.** `claude.permissionMode: 'acceptEdits' | 'default'` (default `acceptEdits`); `ui.claudeChat.height: number` (default `320`). Both persist via existing `settings_get` / `settings_set`.
- **MVP-1f cleanup folded into Task 0.** Per the handoff doc's **Open follow-up items**: `vaultConfig.ts` (legacy FSA, zero production callers) + `renameSidecar` (zero production callers) deleted in Task 0 before any chat code lands. Confirms `vaultConfigRepoTauri` is the live path before deletion.

---

## Out of scope (anti-goals — lift verbatim into PR description)

These are explicit anti-goals per spec § 7.8. The plan must not silently smear them:

- **No `/kb` slash-command UI affordances.** Skills auto-discover from `~/.claude/skills/`, so users can type `/kb document foo` in the composer and Claude will route — but there is no slash-command palette, no Skills sheet, and no button-driven path. That's MVP-3.
- **No "attach this document/diagram to context" UI.** Vault context delivery is two channels only: subprocess `current_dir(vault_root)` + whatever the user types. No app-side prompt injection.
- **No saved chats / chat history.** Open/closed state is not persisted; turn buffer is in-memory only and resets when `claude_reset` fires or the app closes. Chat history is a future MVP, separate from MVP-1e's per-document undo sidecars.
- **No real-subprocess integration tests.** Vitest covers the reducer + status-line formatter + drawer chrome; Rust unit tests cover the stream-json parser + crash-recovery state machine. End-to-end tests against a real `claude` binary are deferred to MVP-4 (`ClaudeRunner` trait + stub + `tauri-plugin-webdriver`).
- **No in-pane permission-prompt UI.** When `claude.permissionMode === 'default'`, unhandled-prompt state is surfaced via the footer status line only. Building the actual prompt UI is post-MVP-2.
- **No user-configured `statusLine.command`.** Spec § 7.5 says built-in format only; reading `statusLine.command` from `~/.claude/settings.json` is out of scope.

---

## File map (what changes)

### New (Rust)

```
src-tauri/src/claude/
├── mod.rs                # module declaration + state struct registration
├── runner.rs             # long-lived subprocess: spawn / send / interrupt / reset / drain
├── parser.rs             # stream-json line → ClaudeEvent
├── crash.rs              # CrashTracker (3-in-60s state machine)
├── status.rs             # binary detection + version parse + auth detection
├── commands.rs           # 4 #[tauri::command] entry points (status / send / interrupt / reset)
└── types.rs              # serde structs: ClaudeStatus, ClaudeUserMessage, ClaudeEvent
```

### Modified (Rust)

- `src-tauri/Cargo.toml` — add `which = "6"` (binary detection) and `tokio = { features = ["process", "io-util", "sync", "time"] }` to existing tokio entry.
- `src-tauri/src/lib.rs` — register `claude::commands::*` in the invoke handler; manage `ClaudeState` resource.
- `src-tauri/src/main.rs` — wire `ClaudeState::new()` into the `setup` closure.
- `src-tauri/capabilities/default.json` — allow the 4 new commands and the `claude_event` event channel.

### New (frontend — chat surface)

```
src/app/knowledge_base/features/claude/
├── ClaudeChatDrawer.tsx
├── ClaudeChatDrawer.test.tsx
├── components/
│   ├── DrawerResizeHandle.tsx
│   ├── DrawerResizeHandle.test.tsx
│   ├── MessageList.tsx
│   ├── MessageList.test.tsx
│   ├── MessageBubble.tsx
│   ├── MessageBubble.test.tsx
│   ├── ToolUseBlock.tsx
│   ├── ToolUseBlock.test.tsx
│   ├── PartialMessageStream.tsx
│   ├── PartialMessageStream.test.tsx
│   ├── Composer.tsx
│   ├── Composer.test.tsx
│   ├── SetupScreen.tsx
│   └── SetupScreen.test.tsx
├── hooks/
│   ├── useClaudeSession.ts
│   ├── useClaudeSession.test.ts
│   ├── useClaudeStatus.ts
│   ├── useClaudeStatus.test.ts
│   ├── useClaudeUsage.ts
│   ├── useClaudeUsage.test.ts
│   ├── useDrawerState.ts
│   └── useDrawerState.test.ts
└── types.ts
```

### New (frontend — footer surface)

```
src/app/knowledge_base/shell/footer/
├── ClaudeStatusLine.tsx
├── ClaudeStatusLine.test.tsx
├── ChatToggleButton.tsx
└── ChatToggleButton.test.tsx
```

### Modified (frontend)

- `src/app/knowledge_base/infrastructure/tauriBridge.ts` — add `claudeStatus()`, `claudeSend(message)`, `claudeInterrupt()`, `claudeReset()`, plus `subscribeClaudeEvent(handler)` using existing `listen()` pattern.
- `src/app/knowledge_base/infrastructure/settingsStore.ts` — add `getClaudePermissionMode()`, `setClaudePermissionMode(mode)`, `getClaudeChatHeight()`, `setClaudeChatHeight(px)`. Existing `Settings` type extended with two keys.
- `src/app/knowledge_base/shell/Footer.tsx` — mount `<ChatToggleButton />` (left) and `<ClaudeStatusLine />` (right) as new footer slots.
- `src/app/knowledge_base/knowledgeBase.tsx` — render `<ClaudeChatDrawer>` as sibling of `<PaneManager>` inside an existing or new `relative` wrapper; provide `<ClaudeSessionProvider>` (from `hooks/useClaudeSession.ts`) at the appropriate scope so footer + drawer share state.
- `src-tauri/src/settings/store.rs` — extend `Settings` struct with `claude_permission_mode: Option<String>` and `claude_chat_height: Option<f64>` (consistent with existing `claude_chat_height` field added in MVP-1c spec — verify in Task 8 whether MVP-1c shipped the field; if so, just wire reads).

### Deleted (MVP-1f cleanup, Task 0)

- `src/app/knowledge_base/features/document/utils/vaultConfig.ts` (4 functions, zero production callers; live path is `vaultConfigRepoTauri`)
- `src/app/knowledge_base/features/document/utils/vaultConfig.test.ts` (paired)
- `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts::renameSidecar` function only (file stays; one helper deleted)
- Adjustments in `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts` to drop the now-removed test cases.

### Modified (docs)

- `Features.md` — § 1.4 Footer gains `ClaudeStatusLine` + chat-toggle bullets; new § 12 (or extend § 0) for Claude chat surface; § 7 settings persistence row gains `claude.*` keys; § 0 deferred-line scoped down (chat-history, /kb UI, context attachments, in-pane permission UI deferred).
- `test-cases/01-app-shell.md` — Footer cases for chat toggle + status line idle/active/error states.
- `test-cases/12-claude-chat.md` — **new file**. Drawer open/close, esc, drawer resize, message rendering (text + tool-use), partial-stream cursor, interrupt, reset, crash recovery, setup screen.

---

## Bootstrap

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout feat/tauri-mvp2-claude-chat
git log --oneline -3
nvm use                      # match .nvmrc → Node 24
npm ci                       # install dependencies (lockfile-faithful)
ls docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md
ls docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
which claude && claude --version
```

Expected:
- Branch `feat/tauri-mvp2-claude-chat` is one commit ahead of `main` (the seed commit landing this plan + handoff edit).
- `claude --version` prints `2.x.x (Claude Code)`. If the binary is missing, install per `~/.claude/install.sh` or document publicly available install steps before running anything in Task 6+.

---

## Task 0: MVP-1f cleanup (legacy FSA + dead helpers)

**Files:**
- Delete: `src/app/knowledge_base/features/document/utils/vaultConfig.ts`
- Delete: `src/app/knowledge_base/features/document/utils/vaultConfig.test.ts`
- Modify: `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts` (remove `renameSidecar` function)
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts` (drop `renameSidecar` test cases)

- [ ] **Step 0.1: Confirm zero production callers**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
rg --type ts --type tsx "from .*vaultConfig['\"]" src/app/knowledge_base/features/document/utils/vaultConfig
rg --type ts --type tsx "renameSidecar" src
```

Expected: only test files in the output (no production callers). If a production caller appears, **stop** and add a migration step before deletion.

- [ ] **Step 0.2: Delete `vaultConfig.ts` + its test**

```bash
git rm src/app/knowledge_base/features/document/utils/vaultConfig.ts
git rm src/app/knowledge_base/features/document/utils/vaultConfig.test.ts
```

- [ ] **Step 0.3: Remove `renameSidecar` from `fileExplorerHelpers.ts`**

Open `src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts`. Locate the `renameSidecar` export (search for `export function renameSidecar` or `export const renameSidecar`). Delete the function and any imports it pulls in that no other export uses (`fnv1a`, `historyFileName` if local).

Then in `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts`, delete the `describe('renameSidecar', ...)` block (or whichever block exercises it).

- [ ] **Step 0.4: Run typecheck + tests to confirm nothing else breaks**

```bash
npm run typecheck
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts
```

Expected: 0 type errors; remaining `useFileExplorer.helpers` tests green.

- [ ] **Step 0.5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove dead vaultConfig.ts + renameSidecar helper

Confirmed zero production callers — vaultConfigRepoTauri (MVP-1c) is the
live vault-config path; renameSidecar was orphaned by the MVP-1e history
substrate retirement. Folds the MVP-1f follow-up item from the handoff doc
into MVP-2's first commit per the doc-update protocol decision."
```

---

## Task 1: Rust scaffold — `claude` module skeleton + types

**Files:**
- Create: `src-tauri/src/claude/mod.rs`
- Create: `src-tauri/src/claude/types.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1.1: Add `which` dep + ensure tokio features**

In `src-tauri/Cargo.toml`, find the `[dependencies]` section. Add:

```toml
which = "6"
```

Verify the existing `tokio` line includes `process`, `io-util`, `sync`, and `time` features. If not, extend it (don't replace — keep existing features). Example final shape:

```toml
tokio = { version = "1", features = ["macros", "rt-multi-thread", "fs", "process", "io-util", "sync", "time"] }
```

- [ ] **Step 1.2: Create `src-tauri/src/claude/types.rs`**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    /// "found" or "missing"
    pub binary: String,
    /// e.g. "2.1.129" — present only when binary is found
    pub version: Option<String>,
    /// "oauth" | "api_key" | "unknown"
    pub auth: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUserMessage {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeEvent {
    MessageStart { turn: u64 },
    PartialText { turn: u64, delta: String },
    ToolUse { turn: u64, tool: String, input: serde_json::Value },
    ToolResult { turn: u64, tool: String, output: serde_json::Value },
    HookEvent { name: String, payload: serde_json::Value },
    MessageEnd { turn: u64, usage: Option<TokenUsage> },
    Error { message: String },
    Crashed { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Optional cost in USD; computed by Claude or by the parser if model rate is known.
    pub cost_usd: Option<f64>,
}
```

- [ ] **Step 1.3: Create `src-tauri/src/claude/mod.rs` (skeleton; submodules stubbed)**

```rust
pub mod commands;
pub mod crash;
pub mod parser;
pub mod runner;
pub mod status;
pub mod types;

use tokio::sync::Mutex;

/// Tauri-managed state holding the long-lived subprocess and crash tracker.
pub struct ClaudeState(pub Mutex<runner::Runner>);

impl ClaudeState {
    pub fn new() -> Self {
        ClaudeState(Mutex::new(runner::Runner::new()))
    }
}
```

- [ ] **Step 1.4: Stub each submodule with empty `mod` files so the workspace compiles**

Create the following files with the listed minimal contents — they'll be filled in later tasks. They're stubbed now so `cargo check` is green and the IDE picks up the module structure.

`src-tauri/src/claude/runner.rs`:
```rust
pub struct Runner;

impl Runner {
    pub fn new() -> Self {
        Runner
    }
}
```

`src-tauri/src/claude/parser.rs`:
```rust
// Stream-json parser stub — filled in Task 4.
```

`src-tauri/src/claude/crash.rs`:
```rust
// Crash tracker stub — filled in Task 5.
```

`src-tauri/src/claude/status.rs`:
```rust
// Binary detection + version parse stub — filled in Task 3.
```

`src-tauri/src/claude/commands.rs`:
```rust
// Tauri command entry points stub — filled in Tasks 3, 6, 13, 14.
```

- [ ] **Step 1.5: Wire `claude` module into `lib.rs`**

In `src-tauri/src/lib.rs`, add the module and state registration. Find the existing `mod vault;` / `mod settings;` lines and add:

```rust
mod claude;
```

In the `tauri::Builder::default()` chain, after `.manage(VaultState::new())` and `.manage(SettingsState::new())` (or wherever the existing `.manage(...)` calls are), add:

```rust
.manage(claude::ClaudeState::new())
```

Don't yet add commands to `.invoke_handler` — those land per task as commands are written.

- [ ] **Step 1.6: Verify the workspace compiles**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: 0 errors. Warnings about unused `ClaudeState` / unused submodules are fine — they go away as later tasks land.

- [ ] **Step 1.7: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/claude/ src-tauri/src/lib.rs
git commit -m "feat(claude): scaffold src-tauri/src/claude module + types"
```

---

## Task 2: Frontend bridge + types — `tauriBridge.claude*` + `claudeBridge.subscribeEvent`

This is a frontend-only task. It defines the API surface the hooks will consume, with mock-friendly seams.

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/tauriBridge.ts`
- Create: `src/app/knowledge_base/features/claude/types.ts`
- Create: `src/app/knowledge_base/features/claude/types.test.ts` (tiny — round-trip a sample event payload)

- [ ] **Step 2.1: Write the failing test for `types.ts` round-trip**

Create `src/app/knowledge_base/features/claude/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import type { ClaudeEvent, ClaudeStatus } from "./types";

describe("ClaudeEvent type", () => {
  it("accepts message_start variant", () => {
    const e: ClaudeEvent = { kind: "message_start", turn: 1 };
    expect(e.kind).toBe("message_start");
  });

  it("accepts partial_text with delta", () => {
    const e: ClaudeEvent = { kind: "partial_text", turn: 1, delta: "Hel" };
    expect(e.delta).toBe("Hel");
  });

  it("accepts tool_use with arbitrary input", () => {
    const e: ClaudeEvent = {
      kind: "tool_use",
      turn: 2,
      tool: "Read",
      input: { path: "foo.md" },
    };
    expect(e.tool).toBe("Read");
  });

  it("accepts message_end with optional usage", () => {
    const e: ClaudeEvent = {
      kind: "message_end",
      turn: 1,
      usage: { inputTokens: 12, outputTokens: 4, costUsd: 0.0001 },
    };
    expect(e.usage?.inputTokens).toBe(12);
  });

  it("accepts error variant", () => {
    const e: ClaudeEvent = { kind: "error", message: "boom" };
    expect(e.message).toBe("boom");
  });
});

describe("ClaudeStatus type", () => {
  it("found + oauth", () => {
    const s: ClaudeStatus = { binary: "found", version: "2.1.129", auth: "oauth" };
    expect(s.auth).toBe("oauth");
  });

  it("missing has no version", () => {
    const s: ClaudeStatus = { binary: "missing", auth: "unknown" };
    expect(s.version).toBeUndefined();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/types.test.ts
```

Expected: FAIL with "Cannot find module './types'".

- [ ] **Step 2.3: Create `src/app/knowledge_base/features/claude/types.ts`**

```typescript
export type ClaudeBinaryState = "found" | "missing";
export type ClaudeAuthMode = "oauth" | "api_key" | "unknown";

export interface ClaudeStatus {
  binary: ClaudeBinaryState;
  version?: string;
  auth: ClaudeAuthMode;
}

export interface ClaudeUserMessage {
  text: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export type ClaudeEvent =
  | { kind: "message_start"; turn: number }
  | { kind: "partial_text"; turn: number; delta: string }
  | { kind: "tool_use"; turn: number; tool: string; input: unknown }
  | { kind: "tool_result"; turn: number; tool: string; output: unknown }
  | { kind: "hook_event"; name: string; payload: unknown }
  | { kind: "message_end"; turn: number; usage?: TokenUsage }
  | { kind: "error"; message: string }
  | { kind: "crashed"; reason: string };

/** Aggregated session state, derived from a stream of ClaudeEvents. */
export interface ChatTurn {
  turn: number;
  role: "user" | "assistant";
  text: string;
  toolUses: Array<{ tool: string; input: unknown; output?: unknown }>;
  isStreaming: boolean;
  endedAt?: number;
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/types.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 2.5: Add bridge methods to `tauriBridge.ts`**

Open `src/app/knowledge_base/infrastructure/tauriBridge.ts`. Locate the existing exports (`vaultPick`, `readText`, `writeText`, `watchStart`, etc.). Add the Claude block:

```typescript
import type { ClaudeEvent, ClaudeStatus, ClaudeUserMessage } from "@/app/knowledge_base/features/claude/types";
// (Add this import alongside existing imports — match the style in the file. If the file uses relative paths, use the relative form.)

// ... existing exports unchanged ...

/** Probe the Claude binary; safe to call repeatedly (no subprocess spawn). */
export async function claudeStatus(): Promise<ClaudeStatus> {
  return call<ClaudeStatus>("claude_status");
}

/** Push one user message onto the long-lived subprocess stdin. Spawns lazily on first call. */
export async function claudeSend(message: ClaudeUserMessage): Promise<void> {
  return call<void>("claude_send", { message });
}

/** SIGINT the subprocess, cancelling in-flight generation. Process stays alive. */
export async function claudeInterrupt(): Promise<void> {
  return call<void>("claude_interrupt");
}

/** Kill the subprocess and reset session state. Next claudeSend respawns. */
export async function claudeReset(): Promise<void> {
  return call<void>("claude_reset");
}

/** Subscribe to claude_event payloads. Returns an unsubscribe function. */
export async function subscribeClaudeEvent(
  handler: (event: ClaudeEvent) => void,
): Promise<() => void> {
  return listenEvent<ClaudeEvent>("claude_event", handler);
}
```

If `call<T>(cmd, args?)` and `listenEvent<T>(eventName, handler)` aren't already exported helpers in this file, mirror the pattern used by `watchStart` / `watchStop` (which were added in MVP-1b and use the `@tauri-apps/api/core` `invoke` and `@tauri-apps/api/event` `listen` directly). Re-grep the existing file for the exact helper names — don't invent new helpers if existing ones cover this.

- [ ] **Step 2.6: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 2.7: Commit**

```bash
git add src/app/knowledge_base/features/claude/types.ts src/app/knowledge_base/features/claude/types.test.ts src/app/knowledge_base/infrastructure/tauriBridge.ts
git commit -m "feat(claude): add tauriBridge claude* surface + frontend types"
```

---

## Task 3: Rust `claude_status` command — binary detection + version + auth

This is the **first vertical slice that lights up the footer**: by the end of this task, the footer can show `claude: idle` or `claude: not installed` based on a real probe.

**Files:**
- Modify: `src-tauri/src/claude/status.rs`
- Modify: `src-tauri/src/claude/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register command in invoke_handler)
- Modify: `src-tauri/capabilities/default.json` (allow `claude_status`)
- Create: `src-tauri/src/claude/status.test.rs` (Rust unit tests via `#[cfg(test)] mod tests`)

- [ ] **Step 3.1: Write the failing tests for `status::detect`**

Edit `src-tauri/src/claude/status.rs`:

```rust
use crate::claude::types::ClaudeStatus;
use std::path::PathBuf;
use tokio::process::Command;

/// Resolve the Claude binary path. Returns None if the binary isn't on PATH.
pub fn locate_binary() -> Option<PathBuf> {
    which::which("claude").ok()
}

/// Run `<bin> --version` and parse the leading semver token. Returns None on failure.
pub async fn read_version(bin: &PathBuf) -> Option<String> {
    let output = Command::new(bin)
        .arg("--version")
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_version_line(&stdout)
}

/// Strip everything after the semver token. "2.1.129 (Claude Code)\n" → "2.1.129".
pub fn parse_version_line(line: &str) -> Option<String> {
    let token = line.split_whitespace().next()?;
    if token.chars().next()?.is_ascii_digit() {
        Some(token.to_string())
    } else {
        None
    }
}

/// Detect auth posture by checking common credential locations + env.
/// Returns "oauth" if ~/.claude/.credentials or keychain hit; "api_key" if env set; else "unknown".
pub fn detect_auth_mode() -> &'static str {
    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        return "api_key";
    }
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return "unknown",
    };
    let oauth_paths = [
        home.join(".claude").join(".credentials.json"),
        home.join(".config").join("claude").join("credentials.json"),
    ];
    if oauth_paths.iter().any(|p| p.exists()) {
        return "oauth";
    }
    "unknown"
}

pub async fn detect() -> ClaudeStatus {
    match locate_binary() {
        None => ClaudeStatus {
            binary: "missing".into(),
            version: None,
            auth: detect_auth_mode().into(),
        },
        Some(bin) => {
            let version = read_version(&bin).await;
            ClaudeStatus {
                binary: "found".into(),
                version,
                auth: detect_auth_mode().into(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_line_strips_trailing_text() {
        assert_eq!(parse_version_line("2.1.129 (Claude Code)\n").as_deref(), Some("2.1.129"));
    }

    #[test]
    fn parse_version_line_rejects_non_numeric_lead() {
        assert_eq!(parse_version_line("hello world").as_deref(), None);
    }

    #[test]
    fn parse_version_line_handles_empty() {
        assert_eq!(parse_version_line("").as_deref(), None);
    }

    #[test]
    fn detect_auth_mode_returns_known_value() {
        let mode = detect_auth_mode();
        assert!(["oauth", "api_key", "unknown"].contains(&mode));
    }
}
```

- [ ] **Step 3.2: Run tests to verify they pass**

```bash
cd src-tauri && cargo test claude::status -- --nocapture && cd ..
```

Expected: 4 tests pass. (No `dirs` crate? If `cargo build` complains about missing `dirs`, add `dirs = "5"` to `Cargo.toml` — it may already be there from MVP-1c's settings module.)

- [ ] **Step 3.3: Add the `claude_status` command in `commands.rs`**

```rust
use crate::claude::{status, types::ClaudeStatus};

#[tauri::command]
pub async fn claude_status() -> Result<ClaudeStatus, String> {
    Ok(status::detect().await)
}
```

- [ ] **Step 3.4: Register the command in `lib.rs`**

In `src-tauri/src/lib.rs`, find the `.invoke_handler(tauri::generate_handler![ ... ])` line. Add `claude::commands::claude_status`. Example:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing entries (vault_pick, vault_read_text, settings_get, ...) ...
    claude::commands::claude_status,
])
```

- [ ] **Step 3.5: Allow the command in capabilities**

Open `src-tauri/capabilities/default.json`. Find the `permissions` array. Add `"claude_status"` (or, if the existing format uses scoped capability names like `core:vault:vault_pick`, mirror that — re-check the file's existing entries and follow the same convention exactly).

If the capability format uses object entries, add the matching shape:

```json
{
  "identifier": "claude_status",
  "allow": [{ "command": "claude_status" }]
}
```

- [ ] **Step 3.6: Smoke test from `cargo check`**

```bash
cd src-tauri && cargo check && cd ..
```

Expected: 0 errors.

- [ ] **Step 3.7: Commit**

```bash
git add src-tauri/src/claude/status.rs src-tauri/src/claude/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(claude): claude_status command — binary + version + auth"
```

---

## Task 4: Frontend `useClaudeStatus` hook + Footer initial integration

End-to-end vertical slice #1: by the end of this task, launching the app shows `claude: idle` (or `claude: not installed`) in the footer.

**Files:**
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeStatus.ts`
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeStatus.test.ts`
- Create: `src/app/knowledge_base/shell/footer/ClaudeStatusLine.tsx`
- Create: `src/app/knowledge_base/shell/footer/ClaudeStatusLine.test.tsx`
- Modify: `src/app/knowledge_base/shell/Footer.tsx`
- Modify: `src/app/knowledge_base/shell/Footer.test.tsx`

- [ ] **Step 4.1: Write the failing test for `useClaudeStatus`**

`src/app/knowledge_base/features/claude/hooks/useClaudeStatus.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/app/knowledge_base/infrastructure/tauriBridge", () => ({
  claudeStatus: vi.fn(),
}));

import { claudeStatus } from "@/app/knowledge_base/infrastructure/tauriBridge";
import { useClaudeStatus } from "./useClaudeStatus";

const mockedStatus = vi.mocked(claudeStatus);

describe("useClaudeStatus", () => {
  beforeEach(() => {
    mockedStatus.mockReset();
  });

  it("starts in 'unknown' state", () => {
    mockedStatus.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useClaudeStatus());
    expect(result.current.status).toEqual({ binary: "unknown", auth: "unknown" });
  });

  it("resolves to found + oauth when binary present", async () => {
    mockedStatus.mockResolvedValue({ binary: "found", version: "2.1.129", auth: "oauth" });
    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => {
      expect(result.current.status.binary).toBe("found");
    });
    expect(result.current.status.version).toBe("2.1.129");
    expect(result.current.status.auth).toBe("oauth");
  });

  it("resolves to missing when binary not on PATH", async () => {
    mockedStatus.mockResolvedValue({ binary: "missing", auth: "unknown" });
    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => {
      expect(result.current.status.binary).toBe("missing");
    });
  });

  it("exposes refresh()", async () => {
    mockedStatus.mockResolvedValueOnce({ binary: "missing", auth: "unknown" });
    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => expect(result.current.status.binary).toBe("missing"));
    mockedStatus.mockResolvedValueOnce({ binary: "found", version: "2.1.0", auth: "oauth" });
    await result.current.refresh();
    await waitFor(() => expect(result.current.status.binary).toBe("found"));
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/hooks/useClaudeStatus.test.ts
```

Expected: FAIL with "Cannot find module './useClaudeStatus'".

- [ ] **Step 4.3: Implement `useClaudeStatus`**

```typescript
import { useCallback, useEffect, useState } from "react";
import { claudeStatus } from "@/app/knowledge_base/infrastructure/tauriBridge";
import type { ClaudeStatus } from "@/app/knowledge_base/features/claude/types";

const UNKNOWN: ClaudeStatus = { binary: "unknown" as never, auth: "unknown" };
// "unknown" isn't part of ClaudeBinaryState; we widen here as a safe sentinel
// for "probe hasn't returned yet". Consumers treat it as "not yet known".

export function useClaudeStatus() {
  const [status, setStatus] = useState<ClaudeStatus>(UNKNOWN);

  const refresh = useCallback(async () => {
    try {
      const next = await claudeStatus();
      setStatus(next);
    } catch (err) {
      setStatus({ binary: "missing", auth: "unknown" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, refresh };
}
```

If TypeScript complains about `"unknown" as never` (the cast is intentional), widen `ClaudeBinaryState` in `types.ts` to include `"unknown"` as a third sentinel:

```typescript
export type ClaudeBinaryState = "found" | "missing" | "unknown";
```

…then drop the cast. **Update the test's first assertion** to expect `binary: "unknown"` literally (which it already does). **Update consumers** to treat `"unknown"` as "still loading" — in this MVP, that means rendering nothing (no chip) until the probe completes.

- [ ] **Step 4.4: Run test to verify it passes**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/hooks/useClaudeStatus.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 4.5: Write the failing test for `ClaudeStatusLine`**

`src/app/knowledge_base/shell/footer/ClaudeStatusLine.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/app/knowledge_base/features/claude/hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));
vi.mock("@/app/knowledge_base/features/claude/hooks/useClaudeUsage", () => ({
  useClaudeUsage: vi.fn(),
}));

import { useClaudeStatus } from "@/app/knowledge_base/features/claude/hooks/useClaudeStatus";
import { useClaudeUsage } from "@/app/knowledge_base/features/claude/hooks/useClaudeUsage";
import { ClaudeStatusLine } from "./ClaudeStatusLine";

const mockedStatus = vi.mocked(useClaudeStatus);
const mockedUsage = vi.mocked(useClaudeUsage);

describe("ClaudeStatusLine", () => {
  it("renders nothing while status is unknown", () => {
    mockedStatus.mockReturnValue({ status: { binary: "unknown", auth: "unknown" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    const { container } = render(<ClaudeStatusLine vaultName="kb" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders idle state when binary found and no turns yet", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: idle/)).toBeInTheDocument();
    expect(screen.getByText(/vault: kb/)).toBeInTheDocument();
  });

  it("renders not-installed state", () => {
    mockedStatus.mockReturnValue({ status: { binary: "missing", auth: "unknown" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: not installed/)).toBeInTheDocument();
  });

  it("renders api-key warning", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "api_key" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/api-key billing/i)).toBeInTheDocument();
  });

  it("renders active session with model + tokens + cost", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: "sonnet-4-6", inputTokens: 12400, outputTokens: 3200, costUsd: 0.04 });
    render(<ClaudeStatusLine vaultName="knowledge-base" />);
    expect(screen.getByText(/sonnet-4-6/)).toBeInTheDocument();
    expect(screen.getByText(/12\.4k in/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2k out/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.04/)).toBeInTheDocument();
    expect(screen.getByText(/vault: knowledge-base/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.6: Implement `ClaudeStatusLine`**

`src/app/knowledge_base/shell/footer/ClaudeStatusLine.tsx`:

```typescript
import { useClaudeStatus } from "@/app/knowledge_base/features/claude/hooks/useClaudeStatus";
import { useClaudeUsage } from "@/app/knowledge_base/features/claude/hooks/useClaudeUsage";

interface ClaudeStatusLineProps {
  vaultName: string;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  return `${(n / 1000).toFixed(1)}k`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function ClaudeStatusLine({ vaultName }: ClaudeStatusLineProps) {
  const { status } = useClaudeStatus();
  const { model, inputTokens, outputTokens, costUsd } = useClaudeUsage();

  if (status.binary === "unknown") return null;

  if (status.binary === "missing") {
    return (
      <span className="text-xs text-amber-400 tabular-nums">
        claude: not installed
      </span>
    );
  }

  if (status.auth === "api_key") {
    return (
      <span className="text-xs text-amber-400 tabular-nums">
        claude: api-key billing (not subscription) · vault: {vaultName}
      </span>
    );
  }

  if (model === null) {
    return (
      <span className="text-xs text-mute tabular-nums">
        claude: idle · vault: {vaultName}
      </span>
    );
  }

  return (
    <span className="text-xs text-mute tabular-nums">
      <span className="text-white">{model}</span>
      {" · "}
      {formatTokens(inputTokens)} in / {formatTokens(outputTokens)} out
      {" · "}
      {formatCost(costUsd)}
      {" · "}
      vault: {vaultName}
    </span>
  );
}
```

- [ ] **Step 4.7: Stub `useClaudeUsage` so the test compiles**

The full implementation lands in Task 17. Right now we just need a no-turn stub.

`src/app/knowledge_base/features/claude/hooks/useClaudeUsage.ts`:

```typescript
export interface ClaudeUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ZERO: ClaudeUsage = { model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 };

export function useClaudeUsage(): ClaudeUsage {
  return ZERO;
}
```

(Task 17 will replace the body with a `useClaudeSession`-driven accumulator.)

- [ ] **Step 4.8: Run tests to verify they pass**

```bash
npm run test:run -- src/app/knowledge_base/shell/footer/ClaudeStatusLine.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 4.9: Mount in `Footer.tsx`**

Open `src/app/knowledge_base/shell/Footer.tsx`. Locate the existing right-aligned content area (or create one if the layout is single-flow). Add:

```typescript
import { ClaudeStatusLine } from "./footer/ClaudeStatusLine";
// ... in JSX, right side ...
<ClaudeStatusLine vaultName={vaultName} />
```

`vaultName` should come from existing context (`useVaultContext()` or whatever `Footer.tsx` currently uses — re-grep). If no vault is mounted, show the static `claude: idle` form by passing `vaultName=""` and updating `ClaudeStatusLine` to suppress the `vault:` segment when empty.

- [ ] **Step 4.10: Update `Footer.test.tsx`**

If `Footer.test.tsx` currently asserts on absence of these new strings, those assertions stay green by default. If it does mount/snapshot the full footer, mock the two new hooks at the top of the test file:

```typescript
vi.mock("@/app/knowledge_base/features/claude/hooks/useClaudeStatus", () => ({
  useClaudeStatus: () => ({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() }),
}));
vi.mock("@/app/knowledge_base/features/claude/hooks/useClaudeUsage", () => ({
  useClaudeUsage: () => ({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 }),
}));
```

- [ ] **Step 4.11: Manual smoke**

```bash
npm run tauri:dev
```

Visually confirm:
- Footer right side shows `claude: idle · vault: <name>` (mute color) when binary is on PATH.
- Or `claude: not installed` (amber) if `claude` was removed from PATH for the test.

Don't ship until you've actually seen one of these.

- [ ] **Step 4.12: Commit**

```bash
git add src/app/knowledge_base/features/claude/hooks/ src/app/knowledge_base/shell/footer/ src/app/knowledge_base/shell/Footer.tsx src/app/knowledge_base/shell/Footer.test.tsx src/app/knowledge_base/features/claude/types.ts
git commit -m "feat(claude): footer status line + useClaudeStatus hook

Lights up the first vertical slice — invoke('claude_status') round-trips
through tauriBridge to a real Rust probe; footer renders idle / missing /
api-key states. Active-session render path stubbed via useClaudeUsage zero
state until Task 17 wires real accumulation."
```

---

## Task 5: Rust `runner` — long-lived subprocess + crash tracker

This is the substantive Rust task. Splits into clear sub-modules so each is testable in isolation.

**Files:**
- Modify: `src-tauri/src/claude/crash.rs`
- Modify: `src-tauri/src/claude/parser.rs`
- Modify: `src-tauri/src/claude/runner.rs`

- [ ] **Step 5.1: Implement `crash::CrashTracker`**

`src-tauri/src/claude/crash.rs`:

```rust
use std::collections::VecDeque;
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const THRESHOLD: usize = 3;

#[derive(Debug, Default)]
pub struct CrashTracker {
    timestamps: VecDeque<Instant>,
}

impl CrashTracker {
    pub fn new() -> Self {
        CrashTracker { timestamps: VecDeque::new() }
    }

    /// Record a crash. Returns true if the threshold has been hit (caller should stop respawning).
    pub fn record(&mut self) -> bool {
        let now = Instant::now();
        self.timestamps.push_back(now);
        // Drop entries older than WINDOW.
        while let Some(front) = self.timestamps.front() {
            if now.duration_since(*front) > WINDOW {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }
        self.timestamps.len() >= THRESHOLD
    }

    pub fn reset(&mut self) {
        self.timestamps.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;

    #[test]
    fn records_under_threshold_returns_false() {
        let mut t = CrashTracker::new();
        assert!(!t.record());
        assert!(!t.record());
    }

    #[test]
    fn three_in_window_returns_true() {
        let mut t = CrashTracker::new();
        t.record();
        t.record();
        assert!(t.record());
    }

    #[test]
    fn reset_clears() {
        let mut t = CrashTracker::new();
        t.record();
        t.record();
        t.record();
        t.reset();
        assert!(!t.record());
    }

    // Note: a real "old entries fall off after 60s" test would need a clock injection
    // to avoid sleeping for 60s in CI. Deferred — covered indirectly by manual smoke.
}
```

- [ ] **Step 5.2: Run crash tests**

```bash
cd src-tauri && cargo test claude::crash && cd ..
```

Expected: 3 tests pass.

- [ ] **Step 5.3: Implement `parser::parse_line`**

The Claude CLI's stream-json output format emits one JSON object per line. Each line has a `type` field — we map subset of those types into our `ClaudeEvent` enum and ignore the rest.

`src-tauri/src/claude/parser.rs`:

```rust
use crate::claude::types::{ClaudeEvent, TokenUsage};
use serde_json::Value;

/// Parse one stream-json line. Returns None for unknown / ignored event shapes.
pub fn parse_line(line: &str, current_turn: u64) -> Option<ClaudeEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let kind = v.get("type")?.as_str()?;

    match kind {
        "message_start" => Some(ClaudeEvent::MessageStart { turn: current_turn }),
        "content_block_delta" | "message_delta" => {
            let delta = v.pointer("/delta/text")
                .and_then(Value::as_str)
                .unwrap_or("");
            if delta.is_empty() { return None; }
            Some(ClaudeEvent::PartialText { turn: current_turn, delta: delta.into() })
        }
        "tool_use" => {
            let tool = v.get("name")?.as_str()?.to_string();
            let input = v.get("input").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::ToolUse { turn: current_turn, tool, input })
        }
        "tool_result" => {
            let tool = v.get("tool_name").and_then(Value::as_str).unwrap_or("").to_string();
            let output = v.get("content").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::ToolResult { turn: current_turn, tool, output })
        }
        "hook_event" => {
            let name = v.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let payload = v.get("payload").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::HookEvent { name, payload })
        }
        "message_stop" | "message_end" => {
            let usage = v.pointer("/usage").and_then(|u| serde_json::from_value::<TokenUsage>(u.clone()).ok());
            Some(ClaudeEvent::MessageEnd { turn: current_turn, usage })
        }
        "error" => {
            let message = v.get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error")
                .to_string();
            Some(ClaudeEvent::Error { message })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_message_start() {
        let line = r#"{"type":"message_start"}"#;
        let e = parse_line(line, 1);
        assert!(matches!(e, Some(ClaudeEvent::MessageStart { turn: 1 })));
    }

    #[test]
    fn parses_content_block_delta() {
        let line = r#"{"type":"content_block_delta","delta":{"text":"Hello"}}"#;
        let e = parse_line(line, 2);
        match e {
            Some(ClaudeEvent::PartialText { turn, delta }) => {
                assert_eq!(turn, 2);
                assert_eq!(delta, "Hello");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_tool_use() {
        let line = r#"{"type":"tool_use","name":"Read","input":{"path":"foo.md"}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::ToolUse { tool, input, .. }) => {
                assert_eq!(tool, "Read");
                assert_eq!(input.get("path").unwrap(), "foo.md");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_message_stop_with_usage() {
        let line = r#"{"type":"message_stop","usage":{"inputTokens":12,"outputTokens":4}}"#;
        let e = parse_line(line, 3);
        match e {
            Some(ClaudeEvent::MessageEnd { turn, usage }) => {
                assert_eq!(turn, 3);
                let u = usage.unwrap();
                assert_eq!(u.input_tokens, 12);
                assert_eq!(u.output_tokens, 4);
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn unknown_type_returns_none() {
        let line = r#"{"type":"random_unknown_event"}"#;
        assert!(parse_line(line, 1).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse_line("not json", 1).is_none());
    }
}
```

> **NOTE on stream-json field names.** The Claude CLI's stream-json format may differ in detail from what's coded above (`content_block_delta` vs `message_delta`, `tool_use` vs `tool_call`, etc.). **The first integration smoke (Task 6 manual test) is the source of truth.** If parser tests are green but partial text doesn't render, capture 5–10 raw stream-json lines from the live `claude -p --output-format stream-json --include-partial-messages` (run it with a one-line prompt, redirect stdout to a file), update the parser to match, re-test. Don't guess.

- [ ] **Step 5.4: Run parser tests**

```bash
cd src-tauri && cargo test claude::parser && cd ..
```

Expected: 6 tests pass.

- [ ] **Step 5.5: Implement `runner::Runner`**

`src-tauri/src/claude/runner.rs`:

```rust
use crate::claude::{crash::CrashTracker, parser, types::{ClaudeEvent, ClaudeUserMessage}};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::mpsc;

/// Long-lived `claude -p` subprocess wrapper.
pub struct Runner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    crash: CrashTracker,
    turn: u64,
    /// Accept-edits or default. Set at spawn time; changing requires reset.
    permission_mode: String,
}

impl Runner {
    pub fn new() -> Self {
        Runner {
            child: None,
            stdin: None,
            crash: CrashTracker::new(),
            turn: 0,
            permission_mode: "acceptEdits".into(),
        }
    }

    /// Spawn or reuse the subprocess. Returns the writer handle.
    /// `app` is captured by the stdout-drain task to emit events.
    pub async fn ensure_alive(&mut self, app: AppHandle, vault_root: PathBuf, permission_mode: String)
        -> Result<(), String>
    {
        if self.child.as_mut().map_or(false, |c| c.try_wait().ok().flatten().is_none()) {
            return Ok(());
        }

        if self.crash.record_check_only() {
            return Err("claude: failing to start (3 crashes in 60s)".into());
        }

        self.permission_mode = permission_mode.clone();

        let mut cmd = Command::new("claude");
        cmd.arg("-p")
            .arg("--input-format").arg("stream-json")
            .arg("--output-format").arg("stream-json")
            .arg("--include-partial-messages")
            .arg("--include-hook-events")
            .arg("--permission-mode").arg(&permission_mode)
            .current_dir(&vault_root)
            .env_remove("ANTHROPIC_API_KEY")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;

        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        self.stdin = Some(stdin);

        // Spawn drain tasks. Both emit through the app handle.
        let app_out = app.clone();
        let turn_at_spawn = self.turn;
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut current_turn = turn_at_spawn;
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(event) = parser::parse_line(&line, current_turn) {
                    if let ClaudeEvent::MessageStart { turn } = event {
                        current_turn = turn;
                    }
                    let _ = app_out.emit("claude_event", event);
                }
            }
        });

        let app_err = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_err.emit("claude_event", ClaudeEvent::Error { message: line });
            }
        });

        // Watcher task: detects exit, fires crashed event.
        let app_exit = app.clone();
        // Note: we can't easily move `child` into a task while keeping it on Self.
        // Instead, we spawn a child-wait task only after capturing the pid; then
        // a separate maintenance check happens lazily from `send`.
        // For simplicity in this MVP we leave child on Self and check status in send().
        let _ = app_exit; // placeholder to silence unused warning

        self.child = Some(child);
        Ok(())
    }

    /// Push one message envelope onto stdin.
    pub async fn send(&mut self, app: AppHandle, vault_root: PathBuf, message: ClaudeUserMessage)
        -> Result<(), String>
    {
        // Detect prior exit.
        let still_alive = self.child.as_mut().map_or(false, |c| c.try_wait().ok().flatten().is_none());
        if !still_alive {
            if self.child.is_some() {
                self.crash.record();
                let _ = app.emit("claude_event", ClaudeEvent::Crashed { reason: "subprocess exited".into() });
            }
            self.child = None;
            self.stdin = None;
            self.ensure_alive(app.clone(), vault_root, self.permission_mode.clone()).await?;
        }

        self.turn += 1;
        let envelope = serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": message.text },
        });
        let line = format!("{}\n", envelope);
        let stdin = self.stdin.as_mut().ok_or("no stdin")?;
        stdin.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn current_turn(&self) -> u64 {
        self.turn
    }

    /// SIGINT to subprocess; keeps it alive for next turn.
    pub async fn interrupt(&mut self) -> Result<(), String> {
        let pid = self.child.as_ref().and_then(|c| c.id()).ok_or("no subprocess")?;
        #[cfg(unix)]
        unsafe {
            libc::kill(pid as i32, libc::SIGINT);
        }
        #[cfg(not(unix))]
        return Err("interrupt only supported on unix".into());
        Ok(())
    }

    /// Kill subprocess and clear state. Next `send` respawns.
    pub async fn reset(&mut self) -> Result<(), String> {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill().await;
        }
        self.stdin = None;
        self.turn = 0;
        self.crash.reset();
        Ok(())
    }
}
```

> Add `libc = "0.2"` to `src-tauri/Cargo.toml` if not already present.
>
> The `record_check_only` helper isn't yet in `crash.rs` — keep using `record()` instead and pass the boolean down. The above code uses `record_check_only` as illustrative; replace with `if self.crash.record() { return Err(...) }`. **Inline-fix this when implementing.**

- [ ] **Step 5.6: Verify the workspace compiles**

```bash
cd src-tauri && cargo check && cd ..
```

If `record_check_only` is referenced but not defined, swap to `record()` (the existing API) — see note above.

Expected: 0 errors.

- [ ] **Step 5.7: Commit**

```bash
git add src-tauri/src/claude/ src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(claude): runner subprocess + parser + crash tracker

Long-lived claude -p with stream-json IO; stdout/stderr drain into Tokio
tasks emitting claude_event; CrashTracker breaks the respawn loop after
3 crashes in 60s. current_dir(vault_root) replaces the spec's --cwd flag
(claude --help confirms no such CLI flag exists)."
```

---

## Task 6: Rust `claude_send` command + first end-to-end roundtrip

This is the second vertical slice. By end-of-task: typing in a `claude -p` smoke test from the dev console (no UI yet) returns parseable events.

**Files:**
- Modify: `src-tauri/src/claude/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register command, add capability)
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 6.1: Add `claude_send` to `commands.rs`**

```rust
use crate::claude::{ClaudeState, types::{ClaudeStatus, ClaudeUserMessage}};
use crate::vault::VaultState;
use crate::settings::SettingsState;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn claude_status() -> Result<ClaudeStatus, String> {
    Ok(crate::claude::status::detect().await)
}

#[tauri::command]
pub async fn claude_send(
    app: AppHandle,
    state: State<'_, ClaudeState>,
    vault: State<'_, VaultState>,
    settings: State<'_, SettingsState>,
    message: ClaudeUserMessage,
) -> Result<(), String> {
    let vault_root: PathBuf = vault.get_root()
        .ok_or("no vault mounted; open a vault before sending")?;
    let permission_mode = settings.get_claude_permission_mode().unwrap_or_else(|| "acceptEdits".into());
    let mut runner = state.0.lock().await;
    runner.send(app, vault_root, message).await
}
```

> `VaultState::get_root` and `SettingsState::get_claude_permission_mode` may not yet exist with those exact names. Re-grep `vault::*` and `settings::*` for the canonical accessor; replace these with the actual names. If a settings accessor for `claude_permission_mode` doesn't exist (it doesn't yet — Task 8 will add it), inline the default `"acceptEdits"` for now and remove the `settings` parameter. Add it back in Task 8.

- [ ] **Step 6.2: Register + permit `claude_send`**

In `src-tauri/src/lib.rs`, add `claude::commands::claude_send` to the invoke handler list.

In `src-tauri/capabilities/default.json`, add the same shape used for `claude_status` in Task 3.

Also add the **event listen permission** for `claude_event`:

```json
{
  "identifier": "claude_event",
  "allow": [{ "event": "claude_event" }]
}
```

(Match the actual existing Tauri 2 capability shape — re-check the structure already used for `vault_change` from MVP-1b.)

- [ ] **Step 6.3: Smoke test from `npm run tauri:dev`**

```bash
npm run tauri:dev
```

In DevTools console:

```javascript
const unsub = await window.__TAURI__.event.listen("claude_event", (e) => console.log("event:", e.payload));
await window.__TAURI__.core.invoke("claude_send", { message: { text: "Reply with the single word: pong" } });
```

Expected: console logs a `message_start` event, one or more `partial_text` events with deltas, then `message_end` with usage. If it doesn't, **stop** and capture raw stream-json lines per the parser TODO note in Task 5.3.

- [ ] **Step 6.4: Commit**

```bash
git add src-tauri/src/claude/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(claude): claude_send command + claude_event capability"
```

---

## Task 7: `useClaudeSession` hook + reducer

**Files:**
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts`
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeSession.test.ts`

- [ ] **Step 7.1: Write the failing test**

`src/app/knowledge_base/features/claude/hooks/useClaudeSession.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const eventHandlers: Array<(e: any) => void> = [];

vi.mock("@/app/knowledge_base/infrastructure/tauriBridge", () => ({
  claudeSend: vi.fn(),
  claudeInterrupt: vi.fn(),
  claudeReset: vi.fn(),
  subscribeClaudeEvent: vi.fn(async (handler: any) => {
    eventHandlers.push(handler);
    return () => {
      const i = eventHandlers.indexOf(handler);
      if (i >= 0) eventHandlers.splice(i, 1);
    };
  }),
}));

import { useClaudeSession } from "./useClaudeSession";

function fireEvent(payload: any) {
  for (const h of eventHandlers) h(payload);
}

describe("useClaudeSession", () => {
  beforeEach(() => {
    eventHandlers.length = 0;
  });

  it("starts with no turns", () => {
    const { result } = renderHook(() => useClaudeSession());
    expect(result.current.turns).toEqual([]);
  });

  it("appends user turn on send", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toMatchObject({ role: "user", text: "hello" });
  });

  it("starts assistant turn on message_start", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
    });
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns[1]).toMatchObject({ role: "assistant", isStreaming: true });
  });

  it("accumulates partial_text deltas", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "partial_text", turn: 1, delta: "Hel" });
      fireEvent({ kind: "partial_text", turn: 1, delta: "lo" });
    });
    expect(result.current.turns[1].text).toBe("Hello");
    expect(result.current.turns[1].isStreaming).toBe(true);
  });

  it("marks turn ended on message_end", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "partial_text", turn: 1, delta: "ok" });
      fireEvent({ kind: "message_end", turn: 1, usage: { inputTokens: 5, outputTokens: 1 } });
    });
    expect(result.current.turns[1].isStreaming).toBe(false);
    expect(result.current.usage.inputTokens).toBe(5);
    expect(result.current.usage.outputTokens).toBe(1);
  });

  it("captures tool_use", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "tool_use", turn: 1, tool: "Read", input: { path: "x.md" } });
    });
    expect(result.current.turns[1].toolUses).toHaveLength(1);
    expect(result.current.turns[1].toolUses[0].tool).toBe("Read");
  });

  it("clears state on reset", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      await result.current.reset();
    });
    expect(result.current.turns).toEqual([]);
  });
});
```

- [ ] **Step 7.2: Implement `useClaudeSession`**

`src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts`:

```typescript
import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  claudeSend,
  claudeInterrupt,
  claudeReset,
  subscribeClaudeEvent,
} from "@/app/knowledge_base/infrastructure/tauriBridge";
import type { ChatTurn, ClaudeEvent, TokenUsage } from "../types";

interface SessionState {
  turns: ChatTurn[];
  usage: TokenUsage;
  errorMessage: string | null;
  isStreaming: boolean;
}

const INITIAL: SessionState = {
  turns: [],
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  errorMessage: null,
  isStreaming: false,
};

type Action =
  | { type: "user"; text: string }
  | { type: "event"; event: ClaudeEvent }
  | { type: "reset" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "user": {
      const turnNum = state.turns.length + 1;
      return {
        ...state,
        turns: [...state.turns, {
          turn: turnNum,
          role: "user",
          text: action.text,
          toolUses: [],
          isStreaming: false,
        }],
      };
    }
    case "reset":
      return INITIAL;
    case "event": {
      const e = action.event;
      switch (e.kind) {
        case "message_start": {
          return {
            ...state,
            isStreaming: true,
            turns: [...state.turns, {
              turn: e.turn,
              role: "assistant",
              text: "",
              toolUses: [],
              isStreaming: true,
            }],
          };
        }
        case "partial_text": {
          return {
            ...state,
            turns: state.turns.map(t =>
              t.role === "assistant" && t.isStreaming
                ? { ...t, text: t.text + e.delta }
                : t),
          };
        }
        case "tool_use": {
          return {
            ...state,
            turns: state.turns.map(t =>
              t.role === "assistant" && t.isStreaming
                ? { ...t, toolUses: [...t.toolUses, { tool: e.tool, input: e.input }] }
                : t),
          };
        }
        case "tool_result": {
          return {
            ...state,
            turns: state.turns.map(t => {
              if (t.role !== "assistant" || !t.isStreaming) return t;
              const last = t.toolUses[t.toolUses.length - 1];
              if (!last || last.tool !== e.tool) return t;
              const updated = [...t.toolUses];
              updated[updated.length - 1] = { ...last, output: e.output };
              return { ...t, toolUses: updated };
            }),
          };
        }
        case "message_end": {
          const usage = e.usage
            ? {
                inputTokens: state.usage.inputTokens + (e.usage.inputTokens ?? 0),
                outputTokens: state.usage.outputTokens + (e.usage.outputTokens ?? 0),
                costUsd: (state.usage.costUsd ?? 0) + (e.usage.costUsd ?? 0),
              }
            : state.usage;
          return {
            ...state,
            isStreaming: false,
            usage,
            turns: state.turns.map(t =>
              t.role === "assistant" && t.isStreaming
                ? { ...t, isStreaming: false, endedAt: Date.now() }
                : t),
          };
        }
        case "error": {
          return { ...state, errorMessage: e.message, isStreaming: false };
        }
        case "crashed": {
          return {
            ...state,
            isStreaming: false,
            errorMessage: `Claude crashed: ${e.reason}`,
          };
        }
        case "hook_event":
          return state;
      }
    }
  }
}

export function useClaudeSession() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    void subscribeClaudeEvent((event) => {
      if (!active) return;
      dispatch({ type: "event", event });
    }).then((unsub) => {
      if (active) unsubRef.current = unsub;
      else unsub();
    });
    return () => {
      active = false;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  const send = useCallback(async (text: string) => {
    dispatch({ type: "user", text });
    await claudeSend({ text });
  }, []);

  const interrupt = useCallback(async () => {
    await claudeInterrupt();
  }, []);

  const reset = useCallback(async () => {
    await claudeReset();
    dispatch({ type: "reset" });
  }, []);

  return {
    turns: state.turns,
    usage: state.usage,
    errorMessage: state.errorMessage,
    isStreaming: state.isStreaming,
    send,
    interrupt,
    reset,
  };
}
```

- [ ] **Step 7.3: Run tests to verify they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/hooks/useClaudeSession.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 7.4: Commit**

```bash
git add src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts src/app/knowledge_base/features/claude/hooks/useClaudeSession.test.ts
git commit -m "feat(claude): useClaudeSession reducer (turns + usage + errors)"
```

---

## Task 8: Settings additions — `claude.permissionMode` + `ui.claudeChat.height`

**Files:**
- Modify: `src-tauri/src/settings/store.rs` (extend `Settings` struct)
- Modify: `src-tauri/src/settings/commands.rs` (if accessor surface needs updating)
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.ts`
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.test.ts`

- [ ] **Step 8.1: Extend Rust `Settings` struct**

Open `src-tauri/src/settings/store.rs`. Locate the `Settings` struct. Add fields:

```rust
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    // ... existing fields ...
    pub claude_permission_mode: Option<String>,    // "acceptEdits" | "default"
    pub claude_chat_height: Option<f64>,           // px, default 320
}
```

If MVP-1c already added `claude_chat_height` (per the spec's settings registry mention), don't duplicate — just confirm `claude_permission_mode` is the only new field. Re-grep `claude_chat_height` to verify.

Add accessor methods on `SettingsState` if the existing pattern uses them (mirror `last_path` accessors). Otherwise, the `settings_get(key)` / `settings_set(key, value)` generic surface already covers reads/writes; just plumb the keys.

- [ ] **Step 8.2: Update frontend `settingsStore.ts`**

Open `src/app/knowledge_base/infrastructure/settingsStore.ts`. Add:

```typescript
export type ClaudePermissionMode = "acceptEdits" | "default";

export async function getClaudePermissionMode(): Promise<ClaudePermissionMode> {
  const settings = await getSettings();
  const raw = settings.claudePermissionMode;
  return raw === "default" ? "default" : "acceptEdits";
}

export async function setClaudePermissionMode(mode: ClaudePermissionMode): Promise<void> {
  await setSettings({ claudePermissionMode: mode });
}

export async function getClaudeChatHeight(): Promise<number> {
  const settings = await getSettings();
  const h = settings.claudeChatHeight;
  return typeof h === "number" && h > 0 ? h : 320;
}

export async function setClaudeChatHeight(px: number): Promise<void> {
  await setSettings({ claudeChatHeight: px });
}
```

The exact API depends on what shape `getSettings()` / `setSettings()` already use — match the existing pattern. If the codebase uses `getRecents()` / `pushRecent()` style methods rather than a single `getSettings()`, mirror that pattern.

- [ ] **Step 8.3: Test the new accessors**

Add tests to `src/app/knowledge_base/infrastructure/settingsStore.test.ts` mirroring the existing `getRecents`/`setLastPath` tests.

- [ ] **Step 8.4: Wire `permission_mode` into the runner via `claude_send`**

Update `src-tauri/src/claude/commands.rs::claude_send` to read the setting (re-read the canonical accessor name from `settings/store.rs`). Pass into `runner.ensure_alive(...)`.

- [ ] **Step 8.5: Verify**

```bash
cd src-tauri && cargo check && cd ..
npm run typecheck
npm run test:run -- src/app/knowledge_base/infrastructure/settingsStore.test.ts
```

Expected: 0 type errors; settings tests green.

- [ ] **Step 8.6: Commit**

```bash
git add src-tauri/src/settings/ src/app/knowledge_base/infrastructure/settingsStore.ts src/app/knowledge_base/infrastructure/settingsStore.test.ts src-tauri/src/claude/commands.rs
git commit -m "feat(claude): settings keys claude.permissionMode + ui.claudeChat.height"
```

---

## Task 9: Composer component (textarea + send button)

**Files:**
- Create: `src/app/knowledge_base/features/claude/components/Composer.tsx`
- Create: `src/app/knowledge_base/features/claude/components/Composer.test.tsx`

- [ ] **Step 9.1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Composer } from "./Composer";

describe("Composer", () => {
  it("renders textarea + send button", () => {
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
  });

  it("submits on Enter", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox");
    await userEvent.type(tx, "hello");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello");
  });

  it("inserts newline on Shift+Enter", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(tx, "line1");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    await userEvent.type(tx, "line2");
    expect(onSend).not.toHaveBeenCalled();
    expect(tx.value).toBe("line1\nline2");
  });

  it("clears textarea after send", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    const tx = screen.getByRole("textbox") as HTMLTextAreaElement;
    await userEvent.type(tx, "hi");
    await userEvent.keyboard("{Enter}");
    expect(tx.value).toBe("");
  });

  it("shows stop button while streaming", () => {
    render(<Composer onSend={vi.fn()} onInterrupt={vi.fn()} isStreaming />);
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("fires onInterrupt when stop clicked", async () => {
    const onInterrupt = vi.fn();
    render(<Composer onSend={vi.fn()} onInterrupt={onInterrupt} isStreaming />);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onInterrupt).toHaveBeenCalled();
  });

  it("does not submit empty messages", async () => {
    const onSend = vi.fn();
    render(<Composer onSend={onSend} onInterrupt={vi.fn()} isStreaming={false} />);
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 9.2: Implement Composer**

```typescript
import { useCallback, useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";

interface ComposerProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  isStreaming: boolean;
}

export function Composer({ onSend, onInterrupt, isStreaming }: ComposerProps) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }, [value, onSend]);

  const onKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }, [submit]);

  return (
    <div className="flex items-end gap-2 border-t border-white/10 bg-bg-accent p-2">
      <textarea
        ref={taRef}
        aria-label="Message Claude"
        className="flex-1 resize-none rounded-md bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-mute min-h-9 max-h-32"
        placeholder="Message Claude…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        rows={1}
      />
      {isStreaming ? (
        <button
          type="button"
          aria-label="Stop"
          className="cursor-pointer rounded-md bg-red-500/80 p-2 text-white hover:bg-red-500"
          onClick={onInterrupt}
        >
          <Square className="size-4" fill="currentColor" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Send"
          className="cursor-pointer rounded-md bg-accent p-2 text-white hover:bg-accent/80 disabled:opacity-40"
          onClick={submit}
          disabled={!value.trim()}
        >
          <Send className="size-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 9.3: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/components/Composer.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 9.4: Commit**

```bash
git add src/app/knowledge_base/features/claude/components/Composer.tsx src/app/knowledge_base/features/claude/components/Composer.test.tsx
git commit -m "feat(claude): Composer component (textarea + send/stop)"
```

---

## Task 10: Message rendering — `MessageBubble`, `ToolUseBlock`, `PartialMessageStream`, `MessageList`

This task ships four small components together (each pure / no IPC). TDD per component.

**Files:**
- Create: `src/app/knowledge_base/features/claude/components/MessageBubble.tsx` + test
- Create: `src/app/knowledge_base/features/claude/components/ToolUseBlock.tsx` + test
- Create: `src/app/knowledge_base/features/claude/components/PartialMessageStream.tsx` + test
- Create: `src/app/knowledge_base/features/claude/components/MessageList.tsx` + test

- [ ] **Step 10.1: `MessageBubble` test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders user role label and text", () => {
    render(<MessageBubble role="user" text="hello" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders assistant role label", () => {
    render(<MessageBubble role="assistant" text="hi" />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("preserves newlines in text", () => {
    render(<MessageBubble role="assistant" text={"line1\nline2"} />);
    const body = screen.getByText(/line1/);
    expect(body).toHaveClass("whitespace-pre-wrap");
  });
});
```

- [ ] **Step 10.2: `MessageBubble` impl**

```typescript
interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string;
  children?: React.ReactNode; // used for tool-use blocks + streaming cursor
}

export function MessageBubble({ role, text, children }: MessageBubbleProps) {
  const label = role === "user" ? "You" : "Claude";
  const wrapperClass = role === "user"
    ? "rounded-md bg-accent/30 p-2"
    : "p-2";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-mute">{label}</span>
      <div className={wrapperClass}>
        <div className="whitespace-pre-wrap text-sm text-white">{text}</div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 10.3: `ToolUseBlock` test + impl**

```typescript
// ToolUseBlock.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolUseBlock } from "./ToolUseBlock";

describe("ToolUseBlock", () => {
  it("renders tool name and is collapsed by default", () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByText(/x\.md/)).toBeNull();
  });

  it("expands on click", async () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/x\.md/)).toBeInTheDocument();
  });

  it("renders output when provided + expanded", async () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} output={"file contents"} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("file contents")).toBeInTheDocument();
  });
});
```

```typescript
// ToolUseBlock.tsx
import { useState } from "react";
import { ChevronRight } from "lucide-react";

interface ToolUseBlockProps {
  tool: string;
  input: unknown;
  output?: unknown;
}

function formatBody(value: unknown): string {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function ToolUseBlock({ tool, input, output }: ToolUseBlockProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="my-1 rounded-md border border-white/10 bg-black/20 text-xs">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="flex w-full cursor-pointer items-center gap-1 px-2 py-1 text-left text-mute hover:bg-white/5"
        aria-expanded={expanded}
      >
        <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
        <span className="font-mono">{tool}</span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 p-2">
          <div className="text-mute">input</div>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-white">{formatBody(input)}</pre>
          {output !== undefined && (
            <>
              <div className="mt-2 text-mute">output</div>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-white">{formatBody(output)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10.4: `PartialMessageStream` test + impl**

```typescript
// PartialMessageStream.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartialMessageStream } from "./PartialMessageStream";

describe("PartialMessageStream", () => {
  it("renders blinking cursor when streaming", () => {
    render(<PartialMessageStream isStreaming />);
    const cursor = screen.getByLabelText("streaming");
    expect(cursor).toHaveClass("animate-pulse");
  });

  it("renders nothing when not streaming", () => {
    const { container } = render(<PartialMessageStream isStreaming={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

```typescript
// PartialMessageStream.tsx
interface PartialMessageStreamProps {
  isStreaming: boolean;
}

export function PartialMessageStream({ isStreaming }: PartialMessageStreamProps) {
  if (!isStreaming) return null;
  return (
    <span aria-label="streaming" className="ml-0.5 inline-block animate-pulse text-mute">▍</span>
  );
}
```

- [ ] **Step 10.5: `MessageList` test + impl**

```typescript
// MessageList.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatTurn } from "../types";

describe("MessageList", () => {
  it("renders empty state with no turns", () => {
    render(<MessageList turns={[]} />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it("renders a user + assistant turn pair", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
      { turn: 1, role: "assistant", text: "hello", toolUses: [], isStreaming: false },
    ];
    render(<MessageList turns={turns} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders streaming indicator inside live assistant turn", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "assistant", text: "Hel", toolUses: [], isStreaming: true },
    ];
    render(<MessageList turns={turns} />);
    expect(screen.getByLabelText("streaming")).toBeInTheDocument();
  });

  it("renders tool-use blocks inside assistant turn", () => {
    const turns: ChatTurn[] = [
      {
        turn: 1, role: "assistant", text: "", toolUses: [
          { tool: "Read", input: { path: "a.md" } },
        ], isStreaming: true,
      },
    ];
    render(<MessageList turns={turns} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });
});
```

```typescript
// MessageList.tsx
import { useEffect, useRef } from "react";
import type { ChatTurn } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ToolUseBlock } from "./ToolUseBlock";
import { PartialMessageStream } from "./PartialMessageStream";

interface MessageListProps {
  turns: ChatTurn[];
}

export function MessageList({ turns }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-sm text-mute">
        Start a conversation with Claude. Vault context is delivered via the working directory.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      {turns.map((t, i) => (
        <MessageBubble key={`${t.turn}-${t.role}-${i}`} role={t.role} text={t.text}>
          {t.toolUses.map((u, j) => (
            <ToolUseBlock key={j} tool={u.tool} input={u.input} output={u.output} />
          ))}
          {t.role === "assistant" && t.isStreaming && <PartialMessageStream isStreaming />}
        </MessageBubble>
      ))}
      <div ref={endRef} />
    </div>
  );
}
```

- [ ] **Step 10.6: Run all four test files**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/components/MessageBubble.test.tsx \
                    src/app/knowledge_base/features/claude/components/ToolUseBlock.test.tsx \
                    src/app/knowledge_base/features/claude/components/PartialMessageStream.test.tsx \
                    src/app/knowledge_base/features/claude/components/MessageList.test.tsx
```

Expected: all green.

- [ ] **Step 10.7: Commit**

```bash
git add src/app/knowledge_base/features/claude/components/
git commit -m "feat(claude): MessageList + MessageBubble + ToolUseBlock + PartialMessageStream"
```

---

## Task 11: `useDrawerState` hook + `DrawerResizeHandle`

**Files:**
- Create: `src/app/knowledge_base/features/claude/hooks/useDrawerState.ts` + test
- Create: `src/app/knowledge_base/features/claude/components/DrawerResizeHandle.tsx` + test

- [ ] **Step 11.1: `useDrawerState` test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/app/knowledge_base/infrastructure/settingsStore", () => ({
  getClaudeChatHeight: vi.fn(async () => 320),
  setClaudeChatHeight: vi.fn(async () => undefined),
}));

import { getClaudeChatHeight, setClaudeChatHeight } from "@/app/knowledge_base/infrastructure/settingsStore";
import { useDrawerState } from "./useDrawerState";

describe("useDrawerState", () => {
  it("starts closed (open state not persisted per spec § 7.4)", () => {
    const { result } = renderHook(() => useDrawerState());
    expect(result.current.isOpen).toBe(false);
  });

  it("toggles open/close", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(true);
    await act(async () => { result.current.close(); });
    expect(result.current.isOpen).toBe(false);
  });

  it("loads height from settings on mount", async () => {
    vi.mocked(getClaudeChatHeight).mockResolvedValueOnce(420);
    const { result } = renderHook(() => useDrawerState());
    await waitFor(() => expect(result.current.height).toBe(420));
  });

  it("persists height on setHeight", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { await result.current.setHeight(500); });
    expect(setClaudeChatHeight).toHaveBeenCalledWith(500);
    expect(result.current.height).toBe(500);
  });

  it("clamps height to [120, window.innerHeight - 80]", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { await result.current.setHeight(50); });
    expect(result.current.height).toBe(120);
  });
});
```

- [ ] **Step 11.2: `useDrawerState` impl**

```typescript
import { useCallback, useEffect, useState } from "react";
import { getClaudeChatHeight, setClaudeChatHeight } from "@/app/knowledge_base/infrastructure/settingsStore";

const MIN_HEIGHT = 120;
const TOP_RESERVE = 80; // header + footer

function clamp(h: number): number {
  const max = (typeof window !== "undefined" ? window.innerHeight : 800) - TOP_RESERVE;
  return Math.max(MIN_HEIGHT, Math.min(h, max));
}

export function useDrawerState() {
  const [isOpen, setOpen] = useState(false);
  const [height, setHeightState] = useState(320);

  useEffect(() => {
    void getClaudeChatHeight().then(h => setHeightState(clamp(h)));
  }, []);

  const setHeight = useCallback(async (px: number) => {
    const next = clamp(px);
    setHeightState(next);
    await setClaudeChatHeight(next);
  }, []);

  return {
    isOpen,
    height,
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(o => !o),
    setHeight,
  };
}
```

- [ ] **Step 11.3: `DrawerResizeHandle` test + impl**

```typescript
// DrawerResizeHandle.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { DrawerResizeHandle } from "./DrawerResizeHandle";

describe("DrawerResizeHandle", () => {
  it("invokes onResize on drag", () => {
    const onResize = vi.fn();
    const { getByRole } = render(<DrawerResizeHandle onResize={onResize} initialHeight={300} />);
    const handle = getByRole("separator");
    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 400 });
    expect(onResize).toHaveBeenCalledWith(400); // 300 + (500 - 400) = 400
    fireEvent.mouseUp(window);
  });
});
```

```typescript
// DrawerResizeHandle.tsx
import { useCallback, useEffect, useRef, useState } from "react";

interface DrawerResizeHandleProps {
  onResize: (height: number) => void;
  initialHeight: number;
}

export function DrawerResizeHandle({ onResize, initialHeight }: DrawerResizeHandleProps) {
  const startY = useRef<number | null>(null);
  const startH = useRef<number>(initialHeight);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    function move(e: MouseEvent) {
      if (startY.current === null) return;
      const delta = startY.current - e.clientY;
      onResize(startH.current + delta);
    }
    function up() {
      startY.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onResize]);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    startY.current = e.clientY;
    startH.current = initialHeight;
  }, [initialHeight]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize chat drawer"
      className={`h-1 cursor-ns-resize border-t ${hover ? "bg-accent/40 border-accent" : "border-white/10"}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={onMouseDown}
    />
  );
}
```

- [ ] **Step 11.4: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/hooks/useDrawerState.test.ts \
                    src/app/knowledge_base/features/claude/components/DrawerResizeHandle.test.tsx
```

Expected: green.

- [ ] **Step 11.5: Commit**

```bash
git add src/app/knowledge_base/features/claude/hooks/useDrawerState.ts src/app/knowledge_base/features/claude/hooks/useDrawerState.test.ts src/app/knowledge_base/features/claude/components/DrawerResizeHandle.tsx src/app/knowledge_base/features/claude/components/DrawerResizeHandle.test.tsx
git commit -m "feat(claude): useDrawerState hook + DrawerResizeHandle"
```

---

## Task 12: `ClaudeChatDrawer` + footer chat-toggle button

**Files:**
- Create: `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` + test
- Create: `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx` + test
- Modify: `src/app/knowledge_base/shell/Footer.tsx` (mount ChatToggleButton)
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (mount ClaudeChatDrawer; provide ChatContext)
- Create: `src/app/knowledge_base/features/claude/ChatContext.tsx` (lightweight provider exposing useDrawerState + useClaudeSession to footer + drawer)

- [ ] **Step 12.1: ChatContext provider**

```typescript
// ChatContext.tsx
import { createContext, useContext, ReactNode } from "react";
import { useClaudeSession } from "./hooks/useClaudeSession";
import { useDrawerState } from "./hooks/useDrawerState";

type ChatContextValue = ReturnType<typeof useClaudeSession> & ReturnType<typeof useDrawerState>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const session = useClaudeSession();
  const drawer = useDrawerState();
  return (
    <ChatContext.Provider value={{ ...session, ...drawer }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
```

- [ ] **Step 12.2: ChatToggleButton test + impl**

```typescript
// ChatToggleButton.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/knowledge_base/features/claude/ChatContext", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "@/app/knowledge_base/features/claude/ChatContext";
import { ChatToggleButton } from "./ChatToggleButton";

describe("ChatToggleButton", () => {
  it("toggles drawer when clicked", async () => {
    const toggle = vi.fn();
    vi.mocked(useChat).mockReturnValue({ toggle, isOpen: false, isStreaming: false } as any);
    render(<ChatToggleButton />);
    await userEvent.click(screen.getByRole("button", { name: /chat/i }));
    expect(toggle).toHaveBeenCalled();
  });

  it("pulses while streaming and closed", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: false, isStreaming: true } as any);
    const { container } = render(<ChatToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("animate-pulse");
  });

  it("does not pulse when drawer open even if streaming", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: true, isStreaming: true } as any);
    const { container } = render(<ChatToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).not.toHaveClass("animate-pulse");
  });
});
```

```typescript
// ChatToggleButton.tsx
import { MessageCircle } from "lucide-react";
import { useChat } from "@/app/knowledge_base/features/claude/ChatContext";

export function ChatToggleButton() {
  const { toggle, isOpen, isStreaming } = useChat();
  const pulse = isStreaming && !isOpen ? "animate-pulse" : "";
  return (
    <button
      type="button"
      aria-label="Toggle chat"
      onClick={toggle}
      className="cursor-pointer rounded-md p-1 text-mute hover:bg-white/10 hover:text-white"
    >
      <MessageCircle className={`size-4 ${pulse}`} />
    </button>
  );
}
```

- [ ] **Step 12.3: ClaudeChatDrawer test + impl**

```typescript
// ClaudeChatDrawer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./ChatContext", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "./ChatContext";
import { ClaudeChatDrawer } from "./ClaudeChatDrawer";

describe("ClaudeChatDrawer", () => {
  it("renders nothing when closed", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: false, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    const { container } = render(<ClaudeChatDrawer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders message list + composer when open", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const close = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close,
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("renders error banner when errorMessage present", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: "boom", open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
```

```typescript
// ClaudeChatDrawer.tsx
import { useEffect } from "react";
import { useChat } from "./ChatContext";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { DrawerResizeHandle } from "./components/DrawerResizeHandle";

export function ClaudeChatDrawer() {
  const { isOpen, height, turns, isStreaming, errorMessage, send, interrupt, close, setHeight } = useChat();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-bg-accent/95 backdrop-blur-sm shadow-lg"
      style={{ height }}
      role="region"
      aria-label="Claude chat"
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      {errorMessage && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-400">
          {errorMessage}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <MessageList turns={turns} />
      </div>
      <Composer onSend={send} onInterrupt={interrupt} isStreaming={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 12.4: Mount ChatProvider + drawer in `knowledgeBase.tsx`**

Locate where `<PaneManager />` renders inside `KnowledgeBaseInner`. Wrap the surrounding element so it's `relative`, then add the drawer as a sibling and the `<ChatProvider>` higher in the tree so the footer's toggle and the drawer share state:

```typescript
import { ChatProvider } from "@/app/knowledge_base/features/claude/ChatContext";
import { ClaudeChatDrawer } from "@/app/knowledge_base/features/claude/ClaudeChatDrawer";

// ... inside the component tree (above Footer + PaneManager scope) ...
<ChatProvider>
  <Header />
  <div className="relative flex-1 overflow-hidden">
    <PaneManager ... />
    <ClaudeChatDrawer />
  </div>
  <Footer />
</ChatProvider>
```

The exact JSX is wherever the existing structure puts Header / PaneManager / Footer — re-grep `<Footer` and `<PaneManager` to find the parent and adjust accordingly.

- [ ] **Step 12.5: Mount ChatToggleButton on Footer's left side**

```typescript
// Footer.tsx
import { ChatToggleButton } from "./footer/ChatToggleButton";
// ... in JSX, left side ...
<ChatToggleButton />
```

- [ ] **Step 12.6: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/ClaudeChatDrawer.test.tsx \
                    src/app/knowledge_base/shell/footer/ChatToggleButton.test.tsx
```

Expected: green.

- [ ] **Step 12.7: Manual smoke**

```bash
npm run tauri:dev
```

- Click chat icon in footer → drawer slides up over panes.
- Type "Reply with the single word: pong", press Enter → assistant turn streams in.
- Press Escape → drawer closes.
- Click chat icon again → drawer reopens **empty** (turns persist across open/close — they live in `useClaudeSession` state, which is held by `ChatProvider`. Confirm this in the actual smoke. If turns reset on reopen, the provider is being remounted — check the JSX placement.).

- [ ] **Step 12.8: Commit**

```bash
git add src/app/knowledge_base/features/claude/ChatContext.tsx src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx src/app/knowledge_base/features/claude/ClaudeChatDrawer.test.tsx src/app/knowledge_base/shell/footer/ChatToggleButton.tsx src/app/knowledge_base/shell/footer/ChatToggleButton.test.tsx src/app/knowledge_base/shell/Footer.tsx src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(claude): ClaudeChatDrawer overlay + footer chat toggle

Drawer is absolute-positioned over PaneManager (panes stay full-size + interactive);
default-closed per launch; Esc closes; click-outside does not. ChatProvider lifts
session + drawer state above footer scope so the toggle pulse animation reflects
session.isStreaming."
```

---

## Task 13: Rust `claude_interrupt` + `claude_reset` commands

**Files:**
- Modify: `src-tauri/src/claude/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 13.1: Add commands**

```rust
#[tauri::command]
pub async fn claude_interrupt(state: State<'_, ClaudeState>) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.interrupt().await
}

#[tauri::command]
pub async fn claude_reset(state: State<'_, ClaudeState>) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.reset().await
}
```

- [ ] **Step 13.2: Register + permit both**

Mirror Task 3's pattern: add to `invoke_handler` list and capabilities JSON.

- [ ] **Step 13.3: Smoke**

```bash
npm run tauri:dev
# Send a long-running prompt: "Count slowly to 50, one number per line"
# Click stop button mid-stream → expect "Cancelled" / abrupt end of stream
# Type a new message → confirm subprocess is still alive (response comes back)
# Reset via DevTools: await window.__TAURI__.core.invoke("claude_reset")
# Send a new message → confirm subprocess respawns and replies
```

- [ ] **Step 13.4: Commit**

```bash
git add src-tauri/src/claude/commands.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(claude): claude_interrupt + claude_reset commands"
```

---

## Task 14: Crash recovery UX (footer "failing to start" state + Retry)

**Files:**
- Modify: `src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts` (already handles `crashed` event)
- Modify: `src/app/knowledge_base/shell/footer/ClaudeStatusLine.tsx` (render crashed-state with Retry link)
- Modify: `src/app/knowledge_base/shell/footer/ClaudeStatusLine.test.tsx` (add crashed test)

- [ ] **Step 14.1: Add crashed-state test**

```typescript
it("renders crashed state with Retry button", async () => {
  // Mock useClaudeSession to expose errorMessage + reset()
  // Click Retry → expect reset() called.
  // (Detailed implementation matches existing patterns.)
});
```

Add a thin wrapper hook `useClaudeRunState()` that derives `crashed` from the session's errorMessage + a session ref count, or just consume the session directly if already exposed.

- [ ] **Step 14.2: Update ClaudeStatusLine**

Add a branch:

```typescript
if (errorMessage?.startsWith("Claude crashed")) {
  return (
    <span className="text-xs text-red-400">
      claude: failing to start{" "}
      <button onClick={onRetry} className="cursor-pointer underline hover:text-red-300">Retry</button>
    </span>
  );
}
```

Where `errorMessage` and `onRetry` come from `useChat()` (since both the toggle and the status line consume the same provider).

- [ ] **Step 14.3: Smoke**

Hard to fake on demand; document via comment. Test path: temporarily add a panic to `runner::ensure_alive` after spawn, confirm the crash banner appears after 3 sends.

- [ ] **Step 14.4: Commit**

```bash
git add src/app/knowledge_base/shell/footer/ src/app/knowledge_base/features/claude/
git commit -m "feat(claude): crashed-state footer banner + Retry"
```

---

## Task 15: Full `useClaudeUsage` accumulation (model + token + cost)

**Files:**
- Modify: `src/app/knowledge_base/features/claude/hooks/useClaudeUsage.ts`
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeUsage.test.ts`

- [ ] **Step 15.1: Test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/app/knowledge_base/features/claude/ChatContext", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "@/app/knowledge_base/features/claude/ChatContext";
import { useClaudeUsage } from "./useClaudeUsage";

describe("useClaudeUsage", () => {
  it("returns zero state when no turns", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      turns: [],
    } as any);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current).toEqual({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });

  it("derives model from most recent assistant turn", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 12400, outputTokens: 3200, costUsd: 0.04 },
      turns: [
        { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
        { turn: 1, role: "assistant", text: "hello", toolUses: [], isStreaming: false, model: "sonnet-4-6" },
      ],
    } as any);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current.model).toBe("sonnet-4-6");
    expect(result.current.inputTokens).toBe(12400);
  });
});
```

- [ ] **Step 15.2: Impl**

Replace the stub:

```typescript
import { useChat } from "@/app/knowledge_base/features/claude/ChatContext";

export interface ClaudeUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function useClaudeUsage(): ClaudeUsage {
  const { usage, turns } = useChat();
  const lastAssistant = [...turns].reverse().find(t => t.role === "assistant");
  const model = (lastAssistant as any)?.model ?? null;
  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd ?? 0,
  };
}
```

> **Model field on ChatTurn.** Add `model?: string` to `ChatTurn` in `types.ts`. Update the `useClaudeSession` reducer's `message_start` branch to read `e.model` if the parser supplies it, else inherit from prior assistant turn. (Parser change: extract `model` field from `message_start` line in `parser.rs` if available; emit it in the `MessageStart` event variant. Backfill the type and parser this task.)

- [ ] **Step 15.3: Add `model` to `ClaudeEvent::MessageStart`**

In `src-tauri/src/claude/types.rs`:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeEvent {
    MessageStart { turn: u64, model: Option<String> },
    // ... rest unchanged ...
}
```

In `parser.rs`, update the `message_start` branch to extract `model` (Claude's stream-json includes a `model` field on `message_start`):

```rust
"message_start" => {
    let model = v.pointer("/message/model").and_then(Value::as_str).map(str::to_string);
    Some(ClaudeEvent::MessageStart { turn: current_turn, model })
}
```

In `types.ts`, mirror the change:

```typescript
| { kind: "message_start"; turn: number; model?: string }
```

Reducer update in `useClaudeSession.ts` `message_start` case:

```typescript
turns: [...state.turns, {
  turn: e.turn,
  role: "assistant",
  text: "",
  toolUses: [],
  isStreaming: true,
  model: e.model,
}],
```

- [ ] **Step 15.4: Run tests + manual smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/hooks/useClaudeUsage.test.ts
npm run tauri:dev
```

Confirm footer status line transitions from `claude: idle · vault: <name>` → `sonnet-4-6 · 12.4k in / 3.2k out · $0.04 · vault: <name>` after the first message ends.

- [ ] **Step 15.5: Commit**

```bash
git add src-tauri/src/claude/ src/app/knowledge_base/features/claude/
git commit -m "feat(claude): full usage accumulation in status line + model from message_start"
```

---

## Task 16: Setup screen + api-key banner (auth posture)

**Files:**
- Create: `src/app/knowledge_base/features/claude/components/SetupScreen.tsx` + test
- Modify: `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` (render SetupScreen instead of message list when binary missing)

- [ ] **Step 16.1: SetupScreen test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SetupScreen } from "./SetupScreen";

describe("SetupScreen", () => {
  it("shows install snippet", () => {
    render(<SetupScreen />);
    expect(screen.getByText(/install claude/i)).toBeInTheDocument();
    expect(screen.getByText(/curl.*install\.sh/i)).toBeInTheDocument();
  });

  it("shows Refresh button", () => {
    render(<SetupScreen />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 16.2: SetupScreen impl**

```typescript
import { useClaudeStatus } from "../hooks/useClaudeStatus";

export function SetupScreen() {
  const { refresh } = useClaudeStatus();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm">
      <h2 className="text-base font-semibold text-white">Install Claude</h2>
      <p className="text-mute">
        The <code className="rounded bg-black/30 px-1">claude</code> CLI isn't on your PATH.
      </p>
      <pre className="overflow-x-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs text-white">
        curl -fsSL https://claude.ai/install.sh | sh
      </pre>
      <p className="text-xs text-mute">
        After install, open a new terminal session, then click Refresh.
      </p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="cursor-pointer rounded-md bg-accent px-3 py-1 text-white hover:bg-accent/80"
      >
        Refresh
      </button>
    </div>
  );
}
```

- [ ] **Step 16.3: Render SetupScreen in drawer when binary missing**

In `ClaudeChatDrawer.tsx`, branch on `useClaudeStatus().status.binary`:

```typescript
import { useClaudeStatus } from "./hooks/useClaudeStatus";
import { SetupScreen } from "./components/SetupScreen";
// ...
const { status } = useClaudeStatus();
// ... in render, replace MessageList + Composer with SetupScreen when status.binary === "missing"
{status.binary === "missing" ? (
  <div className="flex-1"><SetupScreen /></div>
) : (
  <>
    <div className="flex-1 overflow-hidden">
      <MessageList turns={turns} />
    </div>
    <Composer onSend={send} onInterrupt={interrupt} isStreaming={isStreaming} />
  </>
)}
```

- [ ] **Step 16.4: API-key banner**

When `status.auth === "api_key"` and binary present, render a yellow banner at the top of the drawer:

```typescript
{status.auth === "api_key" && (
  <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
    Billed per token (api-key auth detected). Subscription users: unset ANTHROPIC_API_KEY.
  </div>
)}
```

- [ ] **Step 16.5: Run tests + manual smoke**

```bash
npm run test:run -- src/app/knowledge_base/features/claude/components/SetupScreen.test.tsx
```

Manually: temporarily mv `~/.local/bin/claude` aside, restart Tauri dev, confirm setup screen shows in drawer + footer says "claude: not installed".

- [ ] **Step 16.6: Commit**

```bash
git add src/app/knowledge_base/features/claude/
git commit -m "feat(claude): SetupScreen + api-key banner

When the binary is missing, the drawer renders a one-line install snippet
instead of MessageList + Composer; footer shows 'claude: not installed'.
When auth is api_key, a yellow banner reminds the user they're billed per
token (subscription path requires ANTHROPIC_API_KEY unset)."
```

---

## Task 17: Settings UI for `claude.permissionMode`

**Files:**
- Modify: existing settings UI surface (find via `rg -l "settings" src/app/knowledge_base/shell` or wherever VaultSwitcher's settings dropdown lives)
- Add a single dropdown entry "Permission mode: [acceptEdits | default]"

- [ ] **Step 17.1: Locate the settings UI surface**

```bash
rg -l "claudePermissionMode|claude.permissionMode|setClaudePermissionMode" src
rg "VaultSwitcher" src/app/knowledge_base/shell/components/
```

If no in-app settings UI exists today (MVP-1c only added `VaultSwitcher`, not a settings panel), this MVP can defer the toggle UI and surface only via DevTools / `settings_set("claude.permissionMode", "default")`. **Decision in this plan:** add a one-line entry to the `VaultSwitcher` dropdown's footer area (below the recents list and before the Initialize Vault row) showing current mode and toggling on click. Document this in `Features.md` § 1.2.

- [ ] **Step 17.2: Add toggle row**

Inside the `VaultSwitcher` dropdown JSX, add a row:

```typescript
const [mode, setMode] = useState<ClaudePermissionMode>("acceptEdits");
useEffect(() => { void getClaudePermissionMode().then(setMode); }, []);
const toggle = useCallback(async () => {
  const next = mode === "acceptEdits" ? "default" : "acceptEdits";
  await setClaudePermissionMode(next);
  setMode(next);
}, [mode]);

// ... in JSX ...
<button type="button" onClick={toggle} className="...">
  Permission: {mode}
</button>
```

- [ ] **Step 17.3: Verify**

```bash
npm run typecheck && npm run test:run -- src/app/knowledge_base/shell/components/VaultSwitcher.test.tsx
```

- [ ] **Step 17.4: Commit**

```bash
git add src/app/knowledge_base/shell/
git commit -m "feat(claude): settings toggle for claude.permissionMode (in VaultSwitcher dropdown)"
```

---

## Task 18: `Features.md` + `test-cases/` updates

**Files:**
- Modify: `Features.md`
- Create: `test-cases/12-claude-chat.md`
- Modify: `test-cases/01-app-shell.md`
- Modify: `test-cases/README.md` (add bucket #12)

- [ ] **Step 18.1: Update `Features.md`**

Add to `Features.md` § 1.4 (Footer):

```markdown
- ✅ Chat toggle button (left edge of footer, `MessageCircle` icon, opens `ClaudeChatDrawer`; pulses when closed-and-streaming) — `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx`
- ✅ Claude status line (right side; idle / active-with-tokens / not-installed / api-key-billing / crashed states) — `src/app/knowledge_base/shell/footer/ClaudeStatusLine.tsx`
```

Add a new top-level § 12 (or extend § 0 if Features.md uses a different convention):

```markdown
## 12. Claude chat surface

- ✅ Bottom-overlay chat drawer over `PaneManager` (absolute-positioned, default 320 px, resizable from top edge, no backdrop, panes stay interactive) — `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx`
- ✅ `useClaudeSession` reducer — turn buffering, partial-text accumulation, tool-use tracking, usage totals — `src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts`
- ✅ Composer (textarea + Enter-sends + Shift+Enter-newline + stop-button-while-streaming) — `src/app/knowledge_base/features/claude/components/Composer.tsx`
- ✅ MessageList + MessageBubble + ToolUseBlock (collapsible) + PartialMessageStream (▍ blinking cursor)
- ✅ DrawerResizeHandle (top-edge drag persists `ui.claudeChat.height`)
- ✅ SetupScreen (rendered when `claude` binary missing) + api-key banner
- ⚙️ Long-lived `claude -p` subprocess via Rust `claude/runner.rs` (stream-json IO, current_dir(vault_root), ANTHROPIC_API_KEY removed) — `src-tauri/src/claude/`
- ⚙️ 4 Tauri commands: `claude_status`, `claude_send`, `claude_interrupt`, `claude_reset` + `claude_event` event channel
- ⚙️ Crash recovery: 3 crashes inside 60s breaks the loop and surfaces "claude: failing to start" with Retry
```

Add to § 0 deferred-line:

```markdown
- ❌ /kb slash-command palette (deferred to MVP-3)
- ❌ "Attach this document/diagram to context" UI (deferred)
- ❌ Saved chats / chat history persistence (deferred)
- ❌ In-pane permission-prompt UI (deferred — when `default` mode selected, unhandled prompts surface in status line only)
- ❌ User-configured `statusLine.command` from `~/.claude/settings.json` (deferred)
```

Add to § 7 settings persistence row (the `tauri-plugin-store` schema):

```markdown
- `claude.permissionMode` — `"acceptEdits" | "default"` (default `acceptEdits`)
- `ui.claudeChat.height` — number, px, default 320
```

- [ ] **Step 18.2: Create `test-cases/12-claude-chat.md`**

```markdown
# Bucket 12 — Claude Chat Surface

> Status legend per `test-cases/README.md`. Test files live in `src/app/knowledge_base/features/claude/**/*.test.tsx` and `src-tauri/src/claude/**/*.rs` (`#[cfg(test)] mod tests`).

## CHAT-12.1 — drawer open/close + state

- CHAT-12.1-01: ❌ When the user clicks the chat toggle button, the drawer slides up over PaneManager.
- CHAT-12.1-02: ❌ When the drawer is open and Escape is pressed, the drawer closes.
- CHAT-12.1-03: ❌ When the drawer is open and a click lands outside the drawer, the drawer stays open.
- CHAT-12.1-04: ❌ When the app launches, the drawer is closed (open/closed state is not persisted).
- CHAT-12.1-05: ❌ When the user resizes the drawer via the top-edge handle, the new height persists across launches.
- CHAT-12.1-06: ❌ When the user clicks the toggle while a response is streaming and the drawer is closed, the drawer opens with streaming visible.

## CHAT-12.2 — message rendering

- CHAT-12.2-01: ❌ When the user sends a message, a "You" labelled bubble appears with the trimmed text.
- CHAT-12.2-02: ❌ When `message_start` arrives, a "Claude" labelled bubble appears with empty text + streaming cursor.
- CHAT-12.2-03: ❌ When `partial_text` arrives, the latest assistant bubble's text grows by the delta.
- CHAT-12.2-04: ❌ When `message_end` arrives, the streaming cursor disappears.
- CHAT-12.2-05: ❌ When `tool_use` arrives, a collapsible block renders inside the assistant bubble showing the tool name.
- CHAT-12.2-06: ❌ When the tool-use block is clicked, it expands to show the JSON input (and output if present).

## CHAT-12.3 — composer

- CHAT-12.3-01: ❌ When the user presses Enter in the textarea, the message is sent and the textarea clears.
- CHAT-12.3-02: ❌ When the user presses Shift+Enter, a newline is inserted and the message is NOT sent.
- CHAT-12.3-03: ❌ When the textarea is empty/whitespace-only, the send button is disabled.
- CHAT-12.3-04: ❌ During streaming, the send button is replaced by a stop button.
- CHAT-12.3-05: ❌ When the stop button is clicked, the active stream is cancelled (subsequent partial_text events stop) and the subprocess stays alive.

## CHAT-12.4 — interrupt + reset

- CHAT-12.4-01: ❌ When `claude_interrupt` is invoked, the active turn ends without further partial text.
- CHAT-12.4-02: ❌ After interrupt, sending another message works (subprocess wasn't killed).
- CHAT-12.4-03: ❌ When `claude_reset` is invoked, all turns clear and usage resets to zero.
- CHAT-12.4-04: ❌ After reset, sending a new message respawns the subprocess transparently.

## CHAT-12.5 — crash recovery

- CHAT-12.5-01: ❌ When the subprocess exits unexpectedly, a `crashed` event fires.
- CHAT-12.5-02: ❌ One unexpected crash in a 60s window triggers a transparent respawn on next send.
- CHAT-12.5-03: ❌ Three unexpected crashes in a 60s window halt respawning and surface "claude: failing to start" in the footer.
- CHAT-12.5-04: ❌ Clicking the Retry link in the crashed footer banner clears the crash counter and respawns.

## CHAT-12.6 — status line

- CHAT-12.6-01: ❌ Footer shows "claude: idle · vault: <name>" when binary is found and no turns yet.
- CHAT-12.6-02: ❌ Footer shows "claude: not installed" (amber) when binary is missing.
- CHAT-12.6-03: ❌ Footer shows "claude: api-key billing (not subscription)" (amber) when ANTHROPIC_API_KEY is set.
- CHAT-12.6-04: ❌ After first turn ends, footer shows "<model> · <input> in / <output> out · $<cost> · vault: <name>".
- CHAT-12.6-05: ❌ Footer status line uses tabular-nums so digits do not jiggle while streaming.

## CHAT-12.7 — setup screen

- CHAT-12.7-01: ❌ When binary missing and drawer opened, the SetupScreen renders with `curl … install.sh` snippet.
- CHAT-12.7-02: ❌ Clicking the Refresh button re-runs claude_status; if binary now found, drawer transitions to chat surface.

## CHAT-12.8 — settings

- CHAT-12.8-01: ❌ Default `claude.permissionMode` is `acceptEdits`.
- CHAT-12.8-02: ❌ Toggling permission mode in the VaultSwitcher dropdown persists across launches.
- CHAT-12.8-03: ❌ Drawer height persists across launches under `ui.claudeChat.height`.
```

- [ ] **Step 18.3: Update `test-cases/01-app-shell.md`**

Add SHELL-1.4 cases for footer chat toggle:

```markdown
- SHELL-1.4-XX: ❌ Footer renders chat toggle button on the left edge.
- SHELL-1.4-YY: ❌ Chat toggle icon pulses (animate-pulse) when drawer is closed and a stream is in flight.
```

(Pick the next free numbers; never renumber existing IDs.)

- [ ] **Step 18.4: Update `test-cases/README.md` legend** to add bucket 12 if it lists buckets.

- [ ] **Step 18.5: Commit**

```bash
git add Features.md test-cases/
git commit -m "docs(test-cases): MVP-2 — Features.md + bucket 12 + chat-related app-shell rows"
```

---

## Task 19: Full local verification

- [ ] **Step 19.1: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 19.2: Lint**

```bash
npm run lint
```

Expected: warning count ≤ post-MVP-1e baseline.

- [ ] **Step 19.3: Vitest**

```bash
npm run test:run
```

Expected: green; new tests counted (~25–30 new tests across components + hooks + types).

- [ ] **Step 19.4: Cargo test**

```bash
cd src-tauri && cargo test && cd ..
```

Expected: all Rust tests green (status::tests, crash::tests, parser::tests).

- [ ] **Step 19.5: Next.js build**

```bash
npm run build
```

Expected: green; `out/` produced.

- [ ] **Step 19.6: Tauri debug bundle**

```bash
cd src-tauri && cargo tauri build --debug --no-bundle && cd ..
```

Expected: green (matches CI's `tauri-build` job).

- [ ] **Step 19.7: Manual smoke (must complete)**

```bash
npm run tauri:dev
```

Run through every CHAT-12.x case manually. Confirm in the actual app:

1. Footer shows `claude: idle · vault: <name>` on launch.
2. Click chat toggle → drawer opens.
3. Send "Reply with the single word: pong" → streaming cursor appears, "pong" streams in, cursor disappears, footer transitions to model/tokens/cost.
4. Send "Count to 50, one per line" → click stop mid-stream → confirm stream halts; subprocess still alive.
5. Send another short prompt → confirms reuse.
6. Click toggle to close, click again to reopen → turns persist.
7. Press Escape with drawer focused → closes.
8. Resize drawer via top edge → new height persists across restart.
9. Open `tauri-plugin-store`'s settings file (or DevTools `await window.__TAURI__.core.invoke('settings_get', { key: 'claude.permissionMode' })`) → confirm default is `acceptEdits`.
10. Mv claude binary aside → restart → footer says "claude: not installed", drawer opens to SetupScreen. Mv binary back → click Refresh → drawer transitions to chat.

**If any of (1)–(10) fails, the PR is not ready.** Capture the failure mode in the open follow-up items in the handoff doc and fix before opening the PR.

- [ ] **Step 19.8: Commit any test-touch fixups**

```bash
git status
# Stage and commit anything discovered:
# git commit -m "test(claude): fix mock for X discovered during verification"
```

---

## Task 20: Open the PR

- [ ] **Step 20.1: Push the branch**

```bash
git push -u origin feat/tauri-mvp2-claude-chat
```

- [ ] **Step 20.2: Confirm CI runs**

```bash
gh run list --branch feat/tauri-mvp2-claude-chat --limit 5
```

CI's three jobs (`checks`, `build`, `tauri-build`) should pick up the push. Wait for them to complete.

- [ ] **Step 20.3: Open the PR**

```bash
gh pr create --title "feat(tauri): MVP-2 — Claude subprocess + chat overlay + footer status line" --body "$(cat <<'EOF'
## Summary

- Long-lived \`claude -p\` subprocess via Rust \`claude/runner.rs\` — stream-json IO, \`current_dir(vault_root)\` (replaces spec's \`--cwd\` flag — \`claude --help\` confirms the flag does not exist), \`ANTHROPIC_API_KEY\` removed to force OAuth subscription path. Crash recovery: 3 crashes in 60s breaks the respawn loop, surfaces "claude: failing to start" with Retry.
- 4 Tauri commands: \`claude_status\`, \`claude_send\`, \`claude_interrupt\` (SIGINT, keep alive), \`claude_reset\` (kill + clear) + \`claude_event\` event channel for stream-json deltas.
- Bottom-overlay chat drawer (\`ClaudeChatDrawer\`) — absolute-positioned over \`PaneManager\`, default 320 px height, resizable from top edge, no backdrop, panes stay full-size and interactive. Default-closed per launch; height persisted under \`ui.claudeChat.height\`. Esc closes; click-outside does not.
- Right-aligned \`ClaudeStatusLine\` in footer — \`<model> · <input> in / <output> out · $<cost> · vault: <name>\` with idle / not-installed / api-key-billing / crashed states. Left-aligned chat toggle (\`MessageCircle\` icon) pulses when closed-and-streaming.
- \`useClaudeSession\` reducer — turn buffering, partial-text accumulation, tool-use tracking, usage totals.
- Composer with Enter-to-send / Shift+Enter newline / stop-button-while-streaming.
- \`SetupScreen\` rendered in drawer when binary missing + amber api-key banner when \`ANTHROPIC_API_KEY\` is set.
- Settings keys: \`claude.permissionMode\` (\`acceptEdits\` / \`default\`, default \`acceptEdits\`); \`ui.claudeChat.height\` (default 320). Permission mode toggle wired into the VaultSwitcher dropdown.
- MVP-1f cleanup folded into Task 0: \`vaultConfig.ts\` (legacy FSA, zero callers) + \`renameSidecar\` (dead code) deleted.

**Out of scope** (per spec § 7.8): \`/kb\` slash-command palette (MVP-3), context-attachment UI, chat history persistence, in-pane permission-prompt UI (when \`default\` mode is selected, unhandled prompts surface in status line only), user-configured \`statusLine.command\`. Real-subprocess integration tests deferred to MVP-4 (\`ClaudeRunner\` trait + stub).

Plan: \`docs/superpowers/plans/2026-05-08-tauri-mvp2-claude-chat-plan.md\`.

## Test plan

- [x] \`npm run typecheck\` — 0 errors
- [x] \`npm run lint\` — ≤ baseline warnings
- [x] \`npm run test:run\` — green (~25–30 new tests across components + hooks + types)
- [x] \`cargo test\` (src-tauri) — green (status / crash / parser unit tests)
- [x] \`npm run build\` — green
- [x] \`cargo tauri build --debug --no-bundle\` — green
- [x] Manual: full CHAT-12.x sweep in tauri:dev (10-step checklist in Task 19.7)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 20.4: Wait for CI green; request review; merge.**

After merge, run the **Post-merge cleanup protocol** in `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`. Next MVP is **MVP-3 (skill bootstrap + `/kb` invocation)**.

---

## Summary

This plan ships MVP-2 in 21 tasks (0–20), sequenced as vertical slices so each task ends with something visibly working in `tauri:dev`. The first two slices (`claude_status` → footer "idle"; `claude_send` → console log of stream-json events) prove the IPC end-to-end before any UI is built. Crash recovery, drawer chrome, status-line accumulation, and auth posture are each isolated tasks rather than tucked under "implement runner.rs". MVP-1f cleanup (Task 0) folds in per the handoff doc decision so the FSA-residue tracking item closes with this MVP.

---

## Test plan

The full Test plan is included in the PR body (Task 20.3). For verification flow, see Task 19.7's 10-step manual sweep — these are the actual cases that gate merge readiness.

---

## Self-review checklist

**Spec coverage (against `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 7.1–7.8):**

- ✅ § 7.1 subprocess strategy → Task 5 (`runner::ensure_alive` with stream-json + env_remove + current_dir + crash tracker).
- ✅ § 7.2 4 commands + ClaudeEvent payload shapes → Tasks 3, 6, 13 + types.ts (Task 2) + parser (Task 5.3).
- ✅ § 7.3 auth posture + first-launch readiness → Task 3 (claude_status auth detection) + Task 16 (SetupScreen + api-key banner).
- ✅ § 7.4 frontend chat surface (overlay + height + esc + drawer chrome) → Tasks 11, 12.
- ✅ § 7.5 status line + chat toggle → Tasks 4, 12, 15.
- ✅ § 7.6 vault context via current_dir → Task 5 (current_dir(vault_root); spec's --cwd flag deviation noted).
- ✅ § 7.7 permission posture (acceptEdits default + settings toggle) → Task 8 settings + Task 17 UI.
- ✅ § 7.8 explicit anti-goals → "Out of scope" section + § 0 Features.md update + lifted into PR body.
- ✅ § 11.4 plan-level decisions resolved: chat-toggle position (left), permission UI when `default` (status-line warning only).

**Placeholder scan:**
- "TODO" / "TBD" / "fill in" / "implement later" — none.
- Every code step has actual code; every command has expected output.
- Notes about ambiguous external surfaces (stream-json field names, settings accessor names, capability JSON shape) are flagged with explicit "re-grep before writing" or "first integration smoke is source of truth" — not deferred work.

**Type consistency:**
- `ClaudeEvent` shape matches between `src-tauri/src/claude/types.rs` (Rust) and `src/app/knowledge_base/features/claude/types.ts` (TS) — same kind discriminant, same field names.
- `ChatTurn` carries `model?: string` consumed by `useClaudeUsage` (Task 15).
- `ClaudeStatus.binary` widened to include `"unknown"` sentinel (Task 4.3 inline-fix); consumers handle the sentinel by rendering nothing.
- `Settings.claudePermissionMode` and `Settings.claudeChatHeight` match between Rust struct (Task 8.1) and TS settings store (Task 8.2).

**Risk surface called out:**
- Stream-json field names (`content_block_delta` vs `message_delta`, etc.) confirmed only by first integration smoke (Task 6.3). If parser tests pass but UI doesn't render, capture raw stream-json lines and adjust parser.
- `record_check_only` placeholder in Task 5.5 must be replaced with `record()` during implementation (note in 5.6).
- `VaultState::get_root` and `SettingsState::get_claude_permission_mode` accessor names must be re-grepped before writing — task notes call this out explicitly.
- The "open/closed state not persisted" decision means turns + drawer state live in `useClaudeSession` / `useDrawerState`, hosted by `ChatProvider`. Provider placement (above Footer + PaneManager) is critical — wrong placement remounts the provider and resets state. Manual smoke step 6 (Task 12.7) verifies this.
