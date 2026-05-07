# Tauri Shell + In-App Claude Integration

**Status:** Design approved 2026-05-07. Ready for plan.
**Predecessors:** None — this is a new feature axis.
**Handoff context:** No prior handoff doc; this spec creates a new one (`docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`) when MVP-1a's plan lands.

## 1. Goal

Wrap the existing Next.js knowledge-base app in a native macOS desktop shell (Tauri) and embed Claude inside it. After this feature lands the user can:

- Launch a self-contained desktop app instead of a browser tab.
- Pick any folder as a vault — including uninitialized ones — and initialize it from inside the app.
- Hold a multi-turn Claude conversation grounded in the active vault, riding their existing claude.ai subscription auth via the locally-installed `claude` CLI as a subprocess.
- Invoke `/kb` skill subcommands (`document`, `diagram`, `create`, `edit`, `guitar-tabs`, `validate`, `transform`) through a slash-command palette and a structured Skills sheet.
- Run a real automated end-to-end test suite that covers vault flows the FSA directory picker has historically blocked.

## 2. Scope

### In scope

- Tauri 2 shell with a Rust core hosting the existing Next.js frontend (already static-export-capable via `output: "export"`).
- Replacement of the File System Access persistence layer with Rust-backed Tauri commands implementing every existing `domain/repositories.ts` interface.
- Bottom-overlay collapsible chat surface that drives a long-lived `claude -p` subprocess via stream-json IPC.
- Footer-mounted Claude status line (model, tokens, cost, vault).
- Skill bootstrap: install-if-missing for the bundled `<project>/skills/knowledge-base/`.
- In-app `/kb` invocation: slash-command palette in the chat composer plus a Skills sheet with structured forms.
- Vault management: choose, switch, recents, and detect/handle uninitialized folders.
- `ClaudeRunner` trait + stub implementation; `tauri-plugin-webdriver` wired into Playwright; vault tempdir helpers for unit + integration + e2e layers.
- Promotion of every `test-cases/` ❌ entry blocked by the directory picker — promote, mark obsolete, or document-defer.

### Out of scope (deliberate)

- Windows. WebView2 ≠ WebKit, codesigning is non-trivial, filesystem semantics differ. Cost vs. benefit doesn't justify it for private use; explicitly deferred.
- Linux. Code is written cross-platform-clean per § 5 below, but no Linux build target ships in this feature. Linux is a documented future option (~2–3 days of work to add when wanted).
- Mobile (iOS / Android). Tauri 2 supports it, but bundle complexity and UX rework are disproportionate to value here.
- Cloud sync of the vault. Vault stays local, single-user.
- Multi-user. Single-user app.
- Distribution / signed releases / auto-update. Personal use; build locally.
- claude.ai-style "sign in with Claude" inside the app. Anthropic policy explicitly forbids third-party apps reusing subscription OAuth tokens; the subprocess approach is what gives us subscription auth, and it relies on the user having already signed into Claude Code on the same machine.
- Custom-context attachments ("send this open document to Claude as context"). Future MVP.
- Saved chat history persistence. Each session starts fresh until a future MVP.
- Visual regression testing, performance benchmarks, continuous fixture refresh. Useful eventually; not in this feature.

## 3. Five-MVP shape

| MVP | Topic | Outcome |
|---|---|---|
| **MVP-1** | Tauri shell migration | App runs in Tauri window; vault picked via native dialog; persistence via Rust commands. Sub-MVPs 1a → 1d. |
| **MVP-2** | Claude subprocess integration | Bottom-overlay chat surface + footer status line. Multi-turn conversation grounded in vault context. |
| **MVP-3** | Skill bootstrap & `/kb` invocation | Install-if-missing knowledge-base skill. Slash-command palette + skills sheet UI. Vault-init splash gains rich-template option. |
| **MVP-4** | Test infrastructure on the new shell | `ClaudeRunner` trait + stub; `tauri-plugin-webdriver`; vault tempdir helpers. Existing suite ported; first-wave proof set of newly-enabled e2e scenarios. |
| **MVP-5** | Promote all FSA-picker-blocked test cases | Sweep `test-cases/` and convert every ❌ blocked by the directory picker into a real test, an obsolete-in-Tauri 🚫 marker, or a documented defer. |

### Why this order

- **MVP-1 first** because the shell is the substrate everything else needs. It also pays back immediately by making vaults a path-typed string, which is what unblocks MVP-4's testing wins.
- **MVP-2 before MVP-3** because a turn-by-turn chat is a shallower path through the subprocess plumbing than skill invocation. Once chat works, skill invocation is mostly UI on top of the same plumbing.
- **MVP-4 after MVP-2/3** because building the test infrastructure against the real surface produces honest fixtures and avoids "test for what we hope to build."
- **MVP-5 last** because the systematic sweep depends on MVP-4's pipeline being live and the existing suite being green. It's a sustained promotion sweep, not an architectural step.

## 4. Architectural approach (locked decisions)

| Decision | Choice | Rationale (one-liner) |
|---|---|---|
| Browser deploy | Drop GitHub Pages; Tauri-only | Simplest mental model; no dual persistence backends to maintain. |
| MVP-1 shape | Decompose into sub-MVPs 1a → 1d | Mirrors the proven Diagram Flow Enhancements method. |
| Platform | macOS only, code cross-platform-clean | Personal use; Linux a future ~3-day side quest if ever wanted. |
| Rust ↔ frontend boundary | Approach 1: 10 generic VFS primitives | Smallest Rust surface; domain knowledge stays in TS where it already lives. |
| Auth | Subscription via subprocess (no `ANTHROPIC_API_KEY`) | The whole reason to subprocess instead of using Agent SDK. |
| Subprocess lifecycle | One long-lived `claude -p` per session | Avoids 1–2 s cold start per turn; preserves prompt cache + session state. |
| Permission mode | `acceptEdits` default; settings stub for `default` | Personal tool; full prompt UI is real scope, not on critical path. |
| Chat surface | Bottom-edge overlay above PaneManager | No pane reflow, no modal blocking, footer toggle. |
| Status line | Footer-mounted, sourced from event stream | Built-in format for MVP; user-configured `statusLine.command` deferred. |
| Skill install | Install-if-missing only on first launch | Don't clobber user / Claude Code edits to the global skill. |
| Vault selection | Choose/switch any folder; uninitialized splash with Initialize button | Folder creation handled by OS-native picker. |
| Basic vault init | Existing `initVault()` over Tauri VFS | No subprocess dependency for MVP-1c. |
| Rich vault init | `/kb init` from chat (MVP-3, additive) | Layered; basic init still works without it. |
| Test runner abstraction | `ClaudeRunner` trait, env-var-selected real/stub | Deterministic e2e with fixture transcripts; no real-network in CI. |
| macOS e2e driver | `tauri-plugin-webdriver` (Choochmeque) | Cross-platform W3C WebDriver; supports macOS where official tauri-driver doesn't. |

## 5. Cross-platform discipline (non-functional requirement)

Ship target is macOS only. Code is written so the future Linux port is a 2–3 day side quest, not a refactor. Concrete rules:

- All OS paths via `tauri::path::*` or the `dirs` crate. Never hardcode `/Users/...`, `~/Library/...`, or platform-specific separators.
- `claude` binary resolved via `Command::new("claude")` (PATH-based), never an absolute macOS path.
- Cross-platform Tauri plugins only — verify before adoption.
- No macOS-only UI flourishes (menu bar tray, dock badges, etc.) in this feature. They go in a separate `mac-polish` follow-up if desired.
- Frontend keybindings abstract `Cmd` / `Ctrl` through a single util.

## 6. MVP-1 — Tauri shell migration

### 6.1 Sub-MVP 1a — Scaffold + Rust VFS adapter

**Rust source layout** under new `src-tauri/`:

```
src-tauri/
├── Cargo.toml
├── tauri.conf.json
├── icons/
└── src/
    ├── main.rs           # Tauri app entry, command registration
    ├── vault/
    │   ├── mod.rs        # Vault struct (root path, helpers)
    │   ├── commands.rs   # Tauri #[command] handlers
    │   ├── path.rs       # Vault-relative path resolution + sandboxing
    │   ├── io.rs         # Atomic write, read, list, rename, delete
    │   └── error.rs      # VaultError enum + serde
    └── lib.rs
```

**Tauri command surface** — all paths are vault-relative POSIX strings:

```rust
#[tauri::command] async fn vault_pick(app: AppHandle) -> Result<Option<String>>;
#[tauri::command] async fn vault_set_root(path: String, state: State) -> Result<()>;
#[tauri::command] async fn vault_read_text(path: String, state: State) -> Result<String>;
#[tauri::command] async fn vault_write_text(path: String, content: String, state: State) -> Result<()>;
#[tauri::command] async fn vault_read_json(path: String, state: State) -> Result<JsonValue>;
#[tauri::command] async fn vault_write_json(path: String, value: JsonValue, state: State) -> Result<()>;
#[tauri::command] async fn vault_list(dir: String, state: State) -> Result<Vec<DirEntry>>;
#[tauri::command] async fn vault_rename(from: String, to: String, state: State) -> Result<()>;
#[tauri::command] async fn vault_delete(path: String, state: State) -> Result<()>;
#[tauri::command] async fn vault_exists(path: String, state: State) -> Result<bool>;
```

`State` holds `Arc<RwLock<Option<PathBuf>>>` for the current vault root. All commands fail with `VaultError::NoVault` until `vault_set_root` runs.

**Path safety.** Every command goes through `vault::path::resolve(rel: &str, root: &Path)`:

- Reject absolute paths, parent traversal (`..`), Windows-style separators.
- Canonicalize, then verify the resolved absolute path is a prefix of `root`. Reject otherwise.
- One central enforcement point — features can't accidentally bypass it.

**Atomic writes.** `vault_write_text` and `vault_write_json` write to `<path>.tmp`, fsync, then rename atomically. Replaces the FSA `createWritable` semantics.

**Frontend repo implementations.** Ten new files, one per existing repo, each implementing its existing typed interface unchanged:

```
src/app/knowledge_base/infrastructure/
├── attachmentLinksRepoTauri.ts
├── attachmentRepoTauri.ts
├── diagramRepoTauri.ts
├── documentRepoTauri.ts
├── linkIndexRepoTauri.ts
├── svgRepoTauri.ts
├── svgRefsRepoTauri.ts
├── tabRepoTauri.ts
├── tabRefsRepoTauri.ts
├── vaultConfigRepoTauri.ts
└── tauriBridge.ts        # typed invoke wrappers + error mapping
```

**Provider API change.** `src/app/knowledge_base/shell/RepositoryContext.tsx` accepts `vaultPath: string | null` instead of `rootHandle: FileSystemDirectoryHandle | null`. The bag of repos is constructed from the path; existing test isolation pattern (wrapping with stub `Repositories` values) is unaffected.

**Vault picker callsite.** `useFileExplorer.ts` (and any other `showDirectoryPicker` callers — confirmed concentrated in `knowledgeBase.tsx`, `useFileExplorer.ts`, and `idbHandles.ts`) swap to `invoke('vault_pick')`.

**Error model.** `VaultError` serializes to a tagged union TS reads as:

```ts
type VaultError =
  | { kind: 'no_vault' }
  | { kind: 'not_found'; path: string }
  | { kind: 'permission_denied'; path: string }
  | { kind: 'path_escape'; path: string }
  | { kind: 'io'; path: string; message: string }
  | { kind: 'parse'; path: string; message: string };
```

Integrates with the existing `FileSystemError` / `classifyError` surface (Phase 5c typed-errors layer) — same banner, same boundary.

### 6.2 Sub-MVP 1b — File watching

`src/app/knowledge_base/shared/context/FileWatcherContext.tsx` is the existing abstraction. Body changes; shape doesn't.

- Add `notify` crate to Rust. Debounced watcher on the vault root (200 ms coalesce window).
- New commands: `vault_watch_start()`, `vault_watch_stop()`. Watcher emits `vault_change` events with `{ kind: 'created' | 'modified' | 'deleted' | 'renamed', path: string, oldPath?: string }`.
- Frontend `FileWatcherContext` subscribes via `listen('vault_change', ...)` and dispatches to the same downstream consumers.
- Polling/handle-walking logic in `useFileExplorer.ts` is retired here.

### 6.3 Sub-MVP 1c — Settings, vault management, basic init

**Settings store via `tauri-plugin-store`** (one JSON file under `app_config_dir()`):

```ts
{
  vault: {
    lastPath: string | null,
    recents: string[],          // up to 5, MRU-ordered
  },
  ui:    { claudeChat: { height: number } },
  claude:{ /* added in MVP-2 */ }
}
```

Replaces `idbHandles.ts`.

**Vault switcher UI.** A new component in the Header shows the current vault name. Click opens a dropdown:

- **Open Vault…** → invokes `vault_pick` (Tauri's `dialog.open({ directory: true, canCreateDirectories: true })`). The OS-native picker on macOS lets the user create a new folder via its toolbar, so "create folder" needs no separate UI.
- **Recent Vaults** → submenu listing the last 5 from `vault.recents`.
- **Initialize Vault…** → only shown when the current vault is uninitialized.

**Uninitialized vault flow.** After a folder is picked:

```
1. invoke vault_set_root(path)
2. attempt vaultConfig.read()
3. if config exists → normal app load
4. if config absent → render <UninitializedVaultSplash>:
     "<folder-name> is not yet a knowledge-base vault."
     [Initialize this vault]   [Open a different folder]
```

Existing app surfaces (PaneManager, file explorer, Claude chat drawer) are not mounted while uninitialized — only the splash. Keeps every feature's "vault is initialized" assumption true without scattered guards.

**Initialize action.** Calls `vaultConfig.init(vaultName)` — existing TS function in `features/document/utils/vaultConfig.ts`, now backed by `vaultConfigRepoTauri`. Writes whatever it writes today (`.archdesigner/config.json` minimum). Toast: "Vault initialized."

**Switching vaults at runtime.** Selecting a different vault confirms unsaved changes (existing dirty-state machinery), calls `vault_watch_stop`, `vault_set_root(newPath)`, and re-runs the boot flow. No app restart, no window reload.

### 6.4 Sub-MVP 1d — Cleanup, bundle, CI

- Delete the GitHub Pages workflow.
- Delete `src/app/knowledge_base/types/file-system.d.ts`.
- Delete the FSA `*Repo.ts` originals (10 files).
- Delete `idbHandles.ts` and its tests.
- Strip `GITHUB_PAGES`/`isPages` from `next.config.ts` — `output: 'export'` becomes the default since Tauri loads the static build.
- New CI job on `macos-latest`: `cargo tauri build --debug` + run vitest + run any passing Playwright. (Tauri-driver e2e wiring is MVP-4.)
- `tauri.conf.json` finalized: bundle identifier `com.kiro.knowledge-base`, app name, icons, no auto-update.

### 6.5 MVP-1 cross-cutting

- POSIX-relative paths only across IPC. Frontend never sees absolute paths.
- One vault active at a time. Multi-vault support adds state-management complexity for no current need.
- No ambient mutation. Every Rust mutation is a typed command — no auto-save loops in Rust.
- Cross-platform discipline rules from § 5 apply at every commit.

## 7. MVP-2 — Claude subprocess integration

### 7.1 Subprocess strategy

One long-lived `claude -p` per app session. Spawned on first message, kept alive across turns via `--input-format stream-json`.

```rust
// src-tauri/src/claude/runner.rs (RealRunner)
let child = Command::new("claude")
    .args([
        "-p",
        "--input-format",  "stream-json",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--include-hook-events",
        "--cwd",            vault_root_str,
        "--permission-mode", "acceptEdits",
    ])
    .env_remove("ANTHROPIC_API_KEY")  // force OAuth subscription path
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()?;
```

**Crash recovery.** Stdout/stderr drain into Rust tasks. Unexpected exit emits `claude_crashed`; next user message respawns transparently. Three crashes inside 60 s breaks the loop and surfaces "Claude is failing to start" in the UI.

### 7.2 Tauri commands for Claude

```rust
#[tauri::command] async fn claude_status() -> ClaudeStatus;
// { binary: 'found' | 'missing', version?: string, auth: 'oauth' | 'api_key' | 'unknown' }

#[tauri::command] async fn claude_send(message: ClaudeUserMessage) -> Result<()>;
// Pushes one envelope onto stdin. Side effect: stream-json events emitted via 'claude_event'.

#[tauri::command] async fn claude_interrupt() -> Result<()>;
// SIGINT to the subprocess; cancels in-flight generation but keeps the process alive.

#[tauri::command] async fn claude_reset() -> Result<()>;
// Kills the subprocess and clears session state. Next claude_send respawns.
```

Frontend events (`claude_event` payloads):

```ts
type ClaudeEvent =
  | { kind: 'message_start'; turn: number }
  | { kind: 'partial_text'; turn: number; delta: string }
  | { kind: 'tool_use'; turn: number; tool: string; input: unknown }
  | { kind: 'tool_result'; turn: number; tool: string; output: unknown }
  | { kind: 'hook_event'; name: string; payload: unknown }
  | { kind: 'message_end'; turn: number; usage?: TokenUsage }
  | { kind: 'error'; message: string };
```

### 7.3 Auth posture & first-launch readiness

- `claude_status()` runs on app boot and on first message. If `binary: 'missing'`, the UI shows a setup screen with a one-line install snippet — no in-app installer.
- If `auth: 'api_key'`, the UI shows a yellow "billed per token" banner. Informational only.
- The Rust side never sets `ANTHROPIC_API_KEY` and explicitly removes it from the subprocess env.

### 7.4 Frontend chat surface

`ClaudeChatDrawer` is an absolute-positioned **overlay** anchored to the bottom of the `PaneManager` region. PaneManager content stays at full size; the drawer floats above it.

```
┌──────────────────────────────────────────────┐
│  Header (vault switcher)                     │
├──────────────────────────────────────────────┤
│                                              │
│  PaneManager (always full height)            │
│                                              │
│      ┌─────────────────────────────────┐     │
│      │ ░ chat overlay when open ░░░░░░ │     │ ← absolute, z above panes
│      │ ░ panes behind remain visible ░ │     │   no backdrop, no modal
│      │ ░ and still interactive ░░░░░░░ │     │   resizable from top edge
│      └─────────────────────────────────┘     │
├──────────────────────────────────────────────┤
│  [💬]  status line: model · tokens · cost    │ ← Footer
└──────────────────────────────────────────────┘
```

**Files:**

```
src/app/knowledge_base/features/claude/
├── ClaudeChatDrawer.tsx       # absolute-positioned overlay
├── ClaudeChatDrawer.test.tsx
├── components/
│   ├── DrawerResizeHandle.tsx
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── ToolUseBlock.tsx
│   ├── PartialMessageStream.tsx
│   └── Composer.tsx
├── hooks/
│   ├── useClaudeSession.ts
│   ├── useClaudeStatus.ts
│   ├── useClaudeUsage.ts
│   └── useDrawerState.ts
└── types.ts
```

**Behavior:**

- Closed by default on every launch (open/closed state not persisted).
- Footer icon toggles open/closed.
- When open: full PaneManager width; default 320 px height; resizable via top drag handle.
- No backdrop, not modal — panes behind remain visible and interactive.
- No layout reflow — opening/closing never resizes panes.
- **Esc** closes when chat has focus. Click-outside does not close.
- Drawer height persisted in settings (`ui.claudeChat.height`).
- When closed and a streaming response arrives, the footer icon pulses subtly.

### 7.5 Claude status line in the footer

`Footer.tsx` gets a new right-aligned `ClaudeStatusLine` component. Left/middle areas of the footer remain unchanged.

**Format:**

```
sonnet-4-6 · 12.4k in / 3.2k out · $0.04 · vault: knowledge-base
```

Sourced from `useClaudeUsage()` hook subscribing to `claude_event` and accumulating running totals across the session.

**Idle / error states:**

```
claude: idle · vault: knowledge-base
claude: not installed
claude: api-key billing (not subscription)
```

User-configured `statusLine.command` from `~/.claude/settings.json` is **out of scope** for this MVP — built-in format only.

### 7.6 Vault context delivery

Two channels, intentionally minimal:

1. `--cwd <vaultRoot>` at spawn time. Claude's tools (`Read`, `Edit`, `Bash`, `Grep`, `Glob`) automatically scope to the vault. Skills load from `.claude/skills/` under cwd plus `~/.claude/skills/`.
2. **No app-side prompt injection in MVP-2.** User types whatever they want; Claude reads vault files via its tools as needed. Auto-stuffing "current document" into the prompt is a richer feature (context attachments) deferred.

### 7.7 Permission posture

`--permission-mode acceptEdits` default. Settings toggle (`claude.permissionMode`) gates between `acceptEdits` and `default`. Implementing the in-pane permission-prompt UI is **deferred** — when the toggle is `default`, Claude surfaces the same unhandled-prompt state Claude Code shows in headless mode. Acceptable because the default is `acceptEdits`.

### 7.8 What MVP-2 leaves to MVP-3

- No `/kb` skill UI affordances. Users can type `/kb document foo` in the chat composer (skills auto-discover), but no button-driven path yet.
- No "attach this document/diagram to context" UI.
- No saved chats / chat history.

## 8. MVP-3 — Skill bootstrap & `/kb` invocation

### 8.1 Skill bootstrap

The repo already keeps `<project>/skills/knowledge-base/` as the version-controlled source of truth (per `CLAUDE.md` bidirectional-sync rules). MVP-3 wires the Tauri build to bundle this directory and the runtime to install-if-missing.

**Build wiring** in `tauri.conf.json`:

```jsonc
{
  "bundle": {
    "resources": ["../skills/knowledge-base/**"]
  }
}
```

Bundle copy reachable at runtime via `app.path().resource_dir()`. No build-time copying — Tauri's resource pipeline handles it.

**Runtime install flow** on app boot (after vault load, before chat is usable):

```
1. resolve target  := ~/.claude/skills/knowledge-base/
2. resolve bundled := <resource_dir>/skills/knowledge-base/
3. if target/SKILL.md does not exist:
     copy bundled → target  (recursive)
     emit toast: "knowledge-base skill installed."
4. else:
     leave it alone.
```

Install-if-missing only — no auto-update of an existing global skill (user / Claude Code may have edited it). Drift detection deferred.

### 8.2 New Tauri commands

```rust
#[tauri::command] async fn skill_status(name: String, app: AppHandle) -> SkillStatus;
// SkillStatus = { installed: bool, target_path: string, bundled_path: string }

#[tauri::command] async fn skill_install_from_bundle(name: String, app: AppHandle) -> Result<()>;
```

Frontend wraps this in a `useSkillBootstrap()` hook fired once on mount of `ClaudeChatDrawer`.

### 8.3 In-app `/kb` invocation surface

**Slash-command palette.** When the user types `/` at the start of an empty composer, an autocomplete dropdown lists every subcommand present in `<project>/skills/knowledge-base/commands/` (today: `create`, `diagram`, `document`, `edit`, `guitar-tabs`, `svg`, `transform`, `validate` — `init` is excluded per § 8.4). The list is hard-coded in TS for MVP-3 against today's commands; updating the list when a new command lands in the skill is a one-line TS change. Selecting an entry fills the composer with the template; the user fills in the argument and submits.

**Skills sheet.** A "Skills" button on the drawer header opens a sheet with one card per subcommand. Each card has:

- Short description.
- Structured form (text fields, vault file picker).
- "Run" button that submits the formatted slash-command into the chat.

### 8.4 Subcommand input shapes

| Subcommand | Inputs | Form widget |
|---|---|---|
| `/kb document` | `topic` (string) | text field |
| `/kb diagram` | `topic` (string) | text field |
| `/kb create` | `topic` (string) | text field |
| `/kb edit` | `path` (vault-relative `.json` diagram) | vault file picker |
| `/kb svg` | `topic` (string) | text field |
| `/kb guitar-tabs` | `title` (string) | text field |
| `/kb validate` | none | run button only |
| `/kb transform` | `path` | vault file picker |

`init` is intentionally absent from this list — see § 8.6.

### 8.5 Output handling

Claude executes the skill, writes files into the vault via its `Edit` / `Write` tools, and `FileWatcherContext` (MVP-1b) picks up the changes. Live tool-use blocks render in the chat; files appear/update in the explorer because the watcher fired. Same loop as Claude Code today, just inside the app.

### 8.6 MVP-3 hook into MVP-1c's vault-init splash

Once MVP-3 lands, `<UninitializedVaultSplash>` from § 6.3 grows a third action:

- **Initialize with full template** → invokes `/kb init` in the chat after performing the basic init. Layers the skill-driven scaffolding (CLAUDE.md, MEMORY.md, memory/, .graphifyignore) on top of the basic config the MVP-1c button already wrote.

Wiring is purely additive — no change to MVP-1c's basic init path. The Header dropdown's `[Initialize Vault…]` action uses the same surface.

### 8.7 Out of scope for MVP-3

- Custom-context attachments. Future MVP.
- Skill drift detection / one-click reconciliation. Future MVP-3.x.
- Per-feature context-menu integrations ("right-click a diagram → /kb edit"). Future polish.
- User-customizable slash commands.
- Saved chat sessions / chat history persistence.

## 9. MVP-4 — Test infrastructure on the new shell

### 9.1 `ClaudeRunner` trait + stub

```rust
// src-tauri/src/claude/runner.rs
trait ClaudeRunner: Send + Sync {
    async fn status(&self) -> ClaudeStatus;
    async fn send(&self, msg: ClaudeUserMessage) -> Result<EventStream>;
    async fn interrupt(&self) -> Result<()>;
    async fn reset(&self) -> Result<()>;
}

struct RealRunner { /* MVP-2 implementation */ }
struct StubRunner { /* replays canned stream-json transcripts */ }
```

Selection via env var `KB_CLAUDE_MODE` — `real` (default) or `stub`. Tests set `stub`. Tauri command layer is identical regardless — talks to the trait object.

**Stub matching.** Fixtures at `src-tauri/tests/fixtures/claude/<name>.jsonl`. Test setup pre-loads a fixture by name; `StubRunner.send()` replays its events. Tests that don't pre-load get a default "Hi, I'm a stub" response so accidental real-network calls are impossible.

**Capture workflow.** A small CLI (`cargo run --bin capture-fixture -- --name doc-topic-x "/kb document Topic X"`) runs against a real Claude and records the transcript into the fixture directory.

### 9.2 Vault tempdir helpers

**Rust** (`src-tauri/tests/common/vault.rs`):

```rust
pub struct TempVault { pub root: PathBuf, _guard: TempDir }

impl TempVault {
    pub fn fresh() -> Self;                     // tempdir + run vaultConfig.init equivalent
    pub fn from_fixture(name: &str) -> Self;    // copy tests/fixtures/vaults/<name>
    pub fn write(&self, rel: &str, content: &str);
    pub fn read(&self, rel: &str) -> String;
}
```

**TypeScript** (`e2e/helpers/tempVault.ts`):

```ts
export async function makeTempVault(opts?: { fixture?: string }): Promise<{
  path: string;
  cleanup: () => Promise<void>;
}>;
```

The TS helper invokes a `#[cfg(debug_assertions)]` Tauri test command (`make_temp_vault`) so tempdirs live where Rust knows how to clean them up. Both flavours share `tests/fixtures/vaults/<name>/` so unit and e2e tests can use the same starting state.

### 9.3 `tauri-plugin-webdriver` wiring

- Add `tauri-plugin-webdriver` (Choochmeque) as a **dev-only** dependency, behind `#[cfg(debug_assertions)]`. Production bundles do not expose a WebDriver port.
- Plugin listens on `http://localhost:4444` by default.
- Playwright connects via WebDriver protocol. The plugin's W3C endpoints cover everything Playwright needs.
- `playwright.config.ts` gains a `webdriver` project that boots `cargo tauri dev` with `KB_CLAUDE_MODE=stub`, waits for the WebDriver port, runs the e2e specs.

**macOS-only caveat acknowledged.** tauri-plugin-webdriver supports macOS today. If it regresses, fallback is Playwright against `next dev` in `tauri dev` mode — covers ~90% of UI behaviour at the cost of not hitting the actual webview. Decision logged here so future-us doesn't relitigate.

### 9.4 Test pyramid

| Layer | Tool | Covers | Lives at |
|---|---|---|---|
| Rust unit | `cargo test` | VFS primitives, path safety, atomic write, stream-json parser, fixture loader | `src-tauri/src/**/*.rs` (`#[cfg(test)]`) |
| Rust integration | `cargo test --test ...` | Full Tauri command contract with `StubRunner`; subprocess lifecycle | `src-tauri/tests/*.rs` |
| Frontend unit/component | Vitest (existing) | Hooks, components, repos against stubs | `src/**/*.test.{ts,tsx}` |
| Tauri-bridge contract | Vitest + mocked `@tauri-apps/api/core` | Each TS repo's `invoke` translation | `src/app/knowledge_base/infrastructure/*RepoTauri.test.ts` |
| End-to-end | Playwright + tauri-plugin-webdriver | Full app flows, real tempdir vault, `StubRunner` | `e2e/**/*.spec.ts` |

### 9.5 Existing test migration

- **Vitest unit tests using stub `Repositories`** — survive untouched.
- **Vitest tests using FSA `MockDir`** — migrate to the Tauri-bridge contract layer or move to Rust integration. Roughly the existing `*Repo.test.ts` files in `infrastructure/`.
- **Existing Playwright e2e** — most port directly: selectors and assertions stay; setup/teardown swaps to `makeTempVault()`. A small subset that asserts FSA-specific behaviour gets deleted along with FSA itself.
- **❌ cases blocked by the FSA picker** — addressed in MVP-5.

### 9.6 CI changes

Single `macos-latest` job in `.github/workflows/ci.yml`:

1. `nvm use && npm ci` (matches the worktree-baseline preference from MEMORY.md).
2. `npm run typecheck && npm run lint`.
3. `cd src-tauri && cargo fmt -- --check && cargo clippy && cargo test`.
4. `npm run test:run` (Vitest).
5. `cargo tauri build --debug` (build verification only; no signing).
6. `npm run test:e2e` (boots `cargo tauri dev` with `KB_CLAUDE_MODE=stub` + tauri-plugin-webdriver).

GitHub Pages workflow already removed in MVP-1d.

### 9.7 First wave of newly-enabled e2e scenarios (proof set)

MVP-4 ships at least one e2e per category to prove the pipeline:

- Vault picker → app loads with a fresh tempdir.
- Open uninitialized folder → splash → click Initialize → app loads.
- Create document → file appears on disk (asserted via Node `fs` against the tempdir, not just UI state).
- Rename file → wiki-links update across vault (covers `propagateRename`).
- `/kb document "Topic"` from chat → file appears (uses a captured stub fixture; chains MVP-2 + MVP-3).

Systematic sweep across the rest of `test-cases/` is MVP-5.

### 9.8 Out of scope for MVP-4

- Visual regression (screenshot diffs).
- Cross-platform e2e.
- Performance benchmarks.
- Continuous fixture refresh (auto-recapture). Manual recapture for now.

## 10. MVP-5 — Promote previously-blocked test cases

### 10.1 Goal

Walk every ❌ entry in `test-cases/` whose blocker was the File System Access directory picker (or related browser-only constraints) and resolve it.

Each entry lands in one of three buckets:

- **Promoted to ✅ / 🟡 / 🧪** — a real test exists; status flipped in the same commit as the test, per `test-cases/` rules.
- **Marked 🚫 with a one-line reason** — concept is obsolete in Tauri (e.g., FSA permission revocation, `kb-files-v1` browser cache).
- **Documented defer** — still hard for non-FSA reasons (e.g., OS-native sub-pickers other than directory). Stays ❌, with the existing reason note expanded.

### 10.2 Scope

**In scope:**

- All ❌ entries in the eight `test-cases/` files that surfaced FSA/picker references in the planning scan (`01-app-shell.md`, `02-file-system.md`, `04-document.md`, `05-links-and-graph.md`, `06-shared-hooks.md`, `06-svg-editor.md`, `07-persistence.md`, `11-tabs.md`).
- The `test-cases/README.md` ceiling note — updated to reflect the new test ceiling.
- Cross-checked entries in `Features.md` per the same-PR-update rule.

**Out of scope:**

- ❌ entries blocked by reasons unrelated to the FSA picker. Existing notes get expanded but stay ❌.
- New scenarios not currently catalogued. MVP-5 promotes existing entries; new gaps are separate tickets.
- Performance / visual-regression work.

### 10.3 Approach

The MVP plan (written after spec approval) enumerates the cases case-by-case, in `test-cases/` file order. Each case becomes one or two checkbox items: write the test, flip the status marker. Status updates ride with the test commit per the existing rules in CLAUDE.md.

### 10.4 Acceptance

- Every ❌ in the eight target files actioned (promoted, marked 🚫, or documented-defer).
- Full CI pipeline green: typecheck, lint, vitest, cargo test, playwright e2e.
- `test-cases/README.md`'s ceiling note updated.

### 10.5 Out of scope

- Refactoring tests for style, naming, or framework migration. MVP-5 only adds coverage; doesn't modify existing passing tests.
- Re-running flake-prone tests until they pass. Flakes get a real fix or get marked 🚫 with reason; no green-by-luck.

## 11. Cross-cutting concerns

### 11.1 Branch strategy

| Phase | Branch |
|---|---|
| Spec | `feat/tauri-claude-integration` |
| MVP-1a | `feat/tauri-mvp1a-scaffold` |
| MVP-1b | `feat/tauri-mvp1b-file-watcher` |
| MVP-1c | `feat/tauri-mvp1c-settings-vaults` |
| MVP-1d | `feat/tauri-mvp1d-cleanup-bundle` |
| MVP-2 | `feat/tauri-mvp2-claude-chat` |
| MVP-3 | `feat/tauri-mvp3-skills-kb-invocation` |
| MVP-4 | `feat/tauri-mvp4-test-infra` |
| MVP-5 | `feat/tauri-mvp5-test-promotion` |

Each MVP merges via PR (main is protected) before the next begins.

### 11.2 Handoff doc

Created at `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` when MVP-1a's plan lands. Bootstrap commands, "Where we are" tables, recommended order, and the Resume / Doc-update protocols mirror the existing handoffs (`2026-05-05-diagram-flow-enhancements.md` is the reference shape).

### 11.3 Project conventions referenced

- Branch protection on `main` — direct push blocked, PRs only.
- `git checkout -b` BEFORE the first commit on any task; never commit on main.
- No git worktrees for implementations.
- `Features.md` and `test-cases/` updates ride with the source code change in the same PR.
- `nvm use` (matches `.nvmrc`) before `npm ci`.

### 11.4 Open questions / explicit deferrals

- Where exactly the chat-toggle icon lands in `Footer.tsx` (left / right edge) — plan-level UX decision, not spec-level.
- Whether MVP-2's settings toggle for permission mode hides its own UI when set to `default` (since the prompt UI isn't built) — plan-level decision.
- Capture-fixture CLI ergonomics (interactive prompt vs. one-shot CLI) — plan-level decision in MVP-4.
- Linux build target — explicitly deferred; ~2–3 days of work when wanted, contingent on cross-platform discipline being upheld through MVPs 1–5.

## 12. Acceptance criteria for the whole feature

After MVP-5 ships, all of the following must be true:

- Launching the macOS app opens any folder as a vault — including a fresh, uninitialized one — and lets the user initialize it with one click.
- The user can hold a multi-turn chat with Claude inside the app, riding their claude.ai subscription auth via the local `claude` CLI, with vault context delivered via `--cwd`.
- The footer status line shows model / tokens / cost / vault for the active session.
- `/kb document`, `/kb diagram`, `/kb create`, `/kb edit`, `/kb guitar-tabs`, `/kb validate`, `/kb transform` are invokable via the slash-command palette and the Skills sheet, and each writes to the vault via Claude's tools.
- The bundled `knowledge-base` skill installs into `~/.claude/skills/` on first launch if missing.
- CI on `macos-latest` runs vitest, cargo test, and Playwright e2e (via tauri-plugin-webdriver) against a tempdir vault with `KB_CLAUDE_MODE=stub`.
- Every previously-FSA-picker-blocked ❌ entry in `test-cases/` is actioned (promoted, 🚫'd, or documented-defer).
- The GitHub Pages deploy and all FSA code paths are gone.
