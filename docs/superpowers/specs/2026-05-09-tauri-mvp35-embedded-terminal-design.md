# MVP-3.5 — Embedded terminal as primary Claude surface

> **Status:** Spec for the Tauri + Claude integration pivot. Slots between MVP-3 (skill bootstrap + /kb invocation, merged via PR #155) and MVP-4 (test infrastructure).
> **Parent spec:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 7 (MVP-2 chat) is amended by this doc — see § 7 cross-reference note that lands with the seed commit.
> **Branch:** `feat/tauri-mvp35-embedded-terminal` (cut from `main` at `726904b` after PR #155 merged).

## 1. Why this exists

Manual smoke of MVP-3 surfaced two facts:

1. **The custom chat UI is reinventing what `claude` already does well in a terminal.** Slash commands, history, multi-line composition, permission prompts, tool-use rendering — all of that is already polished in claude's TUI. The MVP-2/3 work re-implemented a thinner version on top of stream-json.
2. **The status line and structured-data surface are nice-to-haves, not load-bearing.** The user already sees model / tokens / cost in claude's own status bar inside the terminal; the footer's `ClaudeStatusLine` was duplicate UI.

The pivot: drop the custom chat as the primary surface, embed a real `zsh` PTY running `claude` in the vault directory, and keep MVP-2/3 as a secondary surface behind a settings toggle so we don't throw away working code based on a hypothesis.

## 2. Goals

- Replace the chat drawer body with an embedded terminal that runs `zsh -i -l` in the active vault, then auto-types `claude\n` so claude's TUI appears immediately.
- Persist the PTY across drawer toggles (closing the drawer hides the view; the shell + claude stay alive in the background).
- On vault switch: send Ctrl-C to exit claude, `cd <new-vault>`, then re-launch `claude`. Same zsh process, same scrollback.
- Surface toggle (`claude.surface: 'terminal' | 'chat'`) lives in the existing `CommandRegistry` palette as "Toggle Claude surface (Terminal ↔ Chat)". Default: `'terminal'` for new users.
- Footer's `ClaudeStatusLine` is removed. Binary-presence detection remains (existing `claude_status` → `SetupScreen` path).
- Three small fixes land for the parked chat surface so it's usable when toggled to: dev-mode skill-bootstrap fallback, error-variant install toast, "Claude is thinking…" indicator.

## 3. Non-goals (anti-goals — lift verbatim into PR)

- Multiple parallel terminal sessions / tabs (single PTY per app instance).
- Terminal scrollback persistence across app restarts.
- Custom shell selection (always `zsh -i -l`; bash / fish are out of scope until requested).
- Splitting the terminal pane (no tmux-in-app).
- Claude API mode in the terminal (terminal always uses subscription via the local CLI, same as MVP-2).
- Removing `claude_send` / `claude_interrupt` / `claude_reset` Rust commands from MVP-2 — they stay for the parked chat surface.
- Test infrastructure (still MVP-4) and test promotion (still MVP-5).
- Embedding any other terminal emulator (xterm.js is the choice).

## 4. Architecture

### 4.1 Rust backend — `term` module

New module `src-tauri/src/term/{mod,pty,commands,events}.rs`. Total Tauri commands rises to **26** (22 from MVP-3 + 4 here).

**Crate dep added to `src-tauri/Cargo.toml`:**

```toml
portable-pty = "0.8"
```

`portable-pty` is cross-platform PTY allocation (POSIX `forkpty` on macOS / Linux, ConPTY on Windows). Linux-port-clean per parent spec § 5.

**State holder** registered in `src-tauri/src/main.rs::run` alongside existing state types:

```rust
pub struct TermState(pub Mutex<Option<PtySession>>);

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub child: Box<dyn Child + Send + Sync>,
    pub writer: Box<dyn Write + Send>,
    pub vault_root: PathBuf,
    pub reader_task: tokio::task::JoinHandle<()>,
}
```

The reader task drains the master PTY → emits `term_event` payloads (`{ kind: 'data', bytes: number[] }`) on every read; on EOF emits `{ kind: 'exit' }`.

**4 new Tauri commands:**

```rust
#[tauri::command]
pub async fn term_open(
    vault_path: String,
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
    app: AppHandle,
) -> Result<(), String>;
// First call: spawn `zsh -i -l` in vault_path cwd, auto-type `claude\n`,
// start the reader task. Subsequent calls: if vault_path != current vault_root,
// write \x03 (Ctrl-C) + sleep ~250 ms + write `cd <new>\nclaude\n`. Same PTY.

#[tauri::command]
pub async fn term_write(bytes: Vec<u8>, state: State<'_, TermState>) -> Result<(), String>;
// Frontend keystrokes / paste payloads → master writer.

#[tauri::command]
pub async fn term_resize(rows: u16, cols: u16, state: State<'_, TermState>) -> Result<(), String>;
// SIGWINCH propagation. Called on container resize.

#[tauri::command]
pub async fn term_close(state: State<'_, TermState>) -> Result<(), String>;
// Graceful: write \x03, sleep 500 ms, then SIGTERM the child. State -> None.
// Called on app quit, NOT on drawer close (drawer-close is a frontend hide).
```

### 4.2 PATH inheritance

GUI apps on macOS don't inherit the user's login-shell PATH, which means `claude` (typically installed under `~/.local/bin/` or `/opt/homebrew/bin/`) won't resolve in the spawned shell unless we fix it.

**Approach:** at app boot (in `main.rs::run`, before any Tauri commands fire), run `/bin/zsh -ilc env` once, parse the output, and merge the captured `PATH` into the process env via `std::env::set_var("PATH", ...)`. This makes the spawned `zsh -i -l` inherit the right `PATH`, and also fixes the existing MVP-2 `Runner` (which currently relies on `which::which("claude")` finding the binary). One-time cost (~50 ms on cold boot).

A small `env_bootstrap` module (`src-tauri/src/env_bootstrap.rs`) hosts this so the implementation is testable in isolation.

### 4.3 Frontend — `features/terminal`

New module `src/app/knowledge_base/features/terminal/`:

**Deps added to `package.json`:**

```json
"@xterm/xterm": "^5.5",
"@xterm/addon-fit": "^0.10",
"@xterm/addon-web-links": "^0.11"
```

(npm packages are now under the `@xterm/` scope as of 5.5.0; aliasing not required.)

**Components / hooks:**

- `TerminalSurface.tsx` — owns the `Terminal` instance from xterm.js, ref-mounts to a `<div className="size-full">`. Loads `FitAddon` and `WebLinksAddon`. Subscribes to the `term_event` listener; calls `term.write(bytes)` on each `data` payload. Forwards `term.onData(bytes)` → `term_write`.
- `useTerminalSession.ts` — open / close / resize lifecycle. Reads `vaultPath` from the existing `RepositoryContext`; calls `term_open(vaultPath, rows, cols)` on first mount AND every time `vaultPath` changes. Idempotent — backend handles the same-PTY-different-vault case.
- `useTerminalResize.ts` — debounced (`120 ms`) `ResizeObserver` on the container. Calls `fitAddon.proposeDimensions()` then `term_resize(rows, cols)`.
- `TerminalDrawer.tsx` — drawer body when `claude.surface === 'terminal'`. Reuses MVP-2's `DrawerResizeHandle` and the `ui.claudeDrawer.height` setting (renamed from `ui.claudeChat.height` — see § 4.5).
- `theme.ts` — xterm.js theme object built from the app's design tokens. Reads CSS custom-property values (`--bg-surface`, `--text-ink`, `--accent`, etc.) at instantiation; re-instantiates on dark/light mode toggle.
- `registerSurfaceCommand.ts` — uses the existing `useRegisterCommands` hook to add `claude.toggleSurface` to the palette.

### 4.4 `ClaudeDrawer` — surface picker

New parent file `src/app/knowledge_base/features/claude/ClaudeDrawer.tsx` reads `claude.surface` from the settings store and renders one of:

- `<TerminalDrawer />` (default) — the new module from § 4.3.
- `<ClaudeChatDrawer />` (parked) — the MVP-2/3 file, unchanged except the bug fixes in § 5.

The existing mount point in `knowledgeBase.tsx` switches from `<ClaudeChatDrawer>` to `<ClaudeDrawer>`. `ChatProvider` continues to wrap the inner shell so `useChat()` still works for the parked surface.

`useSkillBootstrap` moves from `ClaudeChatDrawer` to `ClaudeDrawer` so it fires regardless of surface. Per-session module guard preserved.

### 4.5 Settings store

`src-tauri/src/settings/store.rs` — `Settings` struct gains:

```rust
pub claude_surface: ClaudeSurface,  // serde "claude.surface" via #[serde(rename)]
```

with `ClaudeSurface = enum { Terminal, Chat }` defaulting to `Terminal`.

`src/app/knowledge_base/infrastructure/settingsStore.ts` adds:

```typescript
export type ClaudeSurface = 'terminal' | 'chat';
export async function getClaudeSurface(): Promise<ClaudeSurface>;  // default 'terminal'
export async function setClaudeSurface(s: ClaudeSurface): Promise<void>;
```

**Drawer-height key migration:** the existing key `ui.claudeChat.height` is renamed to `ui.claudeDrawer.height` since "chat" is now misleading. Migration is one-shot at read time: `getClaudeDrawerHeight()` reads the new key, falls back to the old key once if the new one is unset, and writes the value forward. Old key is then removed on next save. `useDrawerState` (MVP-2) gets its `getClaudeChatHeight` / `setClaudeChatHeight` calls re-pointed to the renamed accessors as part of the same diff.

### 4.6 Footer cleanup

`src/app/knowledge_base/shell/Footer.tsx` deletes the `<ClaudeStatusLine />` import + render. The component file (`shell/footer/ClaudeStatusLine.tsx`) and its test stay in tree (they may be re-mounted later if the chat surface re-promotes), but Footer no longer references them.

`<ChatToggleButton />` keeps its slot but is renamed to `<DrawerToggleButton />`. Label changes from "Open chat" to "Open Claude". Pulse-on-streaming behavior is gated on `claude.surface === 'chat'` (no-op for terminal mode since there's no `isStreaming` signal).

### 4.7 Lifecycle

```
App boot
  └── env_bootstrap::merge_login_shell_path()
  └── (existing) ClaudeRunner / VaultState / SettingsState / SkillState / TermState created
  └── (existing) settings_get loads ui.claudeDrawer.height (with migration)

ClaudeDrawer mounts
  └── useSkillBootstrap fires (per-session guard, runs once)
  └── reads claude.surface
  └── if 'terminal': mount TerminalDrawer
       ├── TerminalSurface mounts xterm.js
       ├── useTerminalSession: term_open(vaultPath, rows, cols) on mount
       │    └── First call: spawn zsh -i -l, auto-type 'claude\n', start reader task
       │    └── On vaultPath change: same PTY, send Ctrl-C + cd + claude
       └── useTerminalResize: debounced ResizeObserver → term_resize
  └── if 'chat': mount ClaudeChatDrawer (unchanged behavior)

Drawer toggle (close)
  └── DrawerToggleButton → setOpen(false)
  └── TerminalSurface unmounts but PTY stays alive in TermState
  └── Reader task continues; bytes accumulate in xterm's scrollback buffer once it remounts
       (xterm.js's serialize addon is NOT used; we just resync from the live buffer)

Drawer toggle (open)
  └── DrawerToggleButton → setOpen(true)
  └── TerminalSurface remounts; new xterm instance created
  └── useTerminalSession sees existing PTY (term_open is idempotent for same vault)
  └── Backend doesn't re-emit historical bytes; fresh xterm starts blank
       └── Trade-off: scrollback is lost across drawer hides. Acceptable for MVP-3.5.

App quit
  └── Tauri's window-close hook → term_close
  └── Graceful Ctrl-C + 500 ms + SIGTERM
```

### 4.8 Vault-switch sequence (the "feels right" detail)

Triggered by `useTerminalSession` watching `vaultPath`:

```
vaultPath changes from "/foo" to "/bar"
  └── useTerminalSession effect fires, calls term_open("/bar", rows, cols)
  └── Backend: TermState.vault_root === "/foo", new arg is "/bar" → vault changed
  └── Backend writes to PTY master:
       \x03         (Ctrl-C; claude exits, returns to zsh prompt)
       sleep 250ms  (let claude flush exit + zsh re-emit prompt)
       cd /bar\n
       claude\n
  └── PTY master forwards everything to zsh; user sees the Ctrl-C, cd, claude restart
       in their terminal window in real time
  └── TermState.vault_root := "/bar"
```

If claude is mid-response when the vault switches, Ctrl-C interrupts the partial response. Acceptable — same UX as a real terminal.

### 4.9 Scrollback-on-remount trade-off

When the drawer hides + reshows, xterm re-instantiates blank. The PTY has been emitting bytes the whole time, but xterm wasn't there to receive them. Two options considered:

1. **Live serialize** — backend buffers a circular byte ring (e.g. last 1 MiB). On `term_open` re-mount, replay the buffer to the new xterm instance.
2. **Fresh-on-remount** (chosen for MVP-3.5) — accept blank xterm on remount. User can scroll up in the live xterm session as long as the drawer stays open; if they hide + reshow, they see the current claude prompt only.

Option 2 ships in MVP-3.5. Option 1 is a future polish (MVP-3.6 or later) if users ask for it.

## 5. Bug fixes for the parked chat surface

Three small fixes so MVP-2/3's chat surface stays usable when toggled to. All ride in this MVP's PR.

### 5.1 Skill bootstrap dev-mode fallback

`src-tauri/src/skill/commands.rs::bundled_path` currently resolves to `<resource_dir>/_up_/skills/<name>/`. In `tauri dev` the resource_dir doesn't include bundled resources, so `bundled_path` returns a non-existent path and `skill_install_from_bundle` errors out silently in `useSkillBootstrap`'s catch.

**Fix:** add a `#[cfg(debug_assertions)]` fallback that resolves from `env!("CARGO_MANIFEST_DIR")/../skills/<name>/`. Production builds skip the fallback (release builds don't include the workspace dir).

```rust
let prod = resource_dir.join("_up_").join("skills").join(name);
if prod.join("SKILL.md").exists() { return Ok(prod); }
#[cfg(debug_assertions)]
{
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..").join("skills").join(name);
    if dev.join("SKILL.md").exists() { return Ok(dev); }
}
Ok(prod)
```

### 5.2 Error-variant install toast

`SkillInstallToast.tsx` currently renders only on success (`justInstalled === true`). Failed installs are invisible.

**Fix:** add a `tone: 'success' | 'error'` prop (default `'success'`). Error variant uses `role="alert"` + red border + `text-red-700`. `ClaudeDrawer` (and the parked `ClaudeChatDrawer` while it's the active surface) renders the toast for both `justInstalled` AND `error !== null`:

```typescript
{skillBootstrap.justInstalled && <SkillInstallToast show />}
{skillBootstrap.error !== null && <SkillInstallToast show tone="error" message={`Skill install failed: ${skillBootstrap.error}`} />}
```

### 5.3 "Claude is thinking…" indicator

`MessageList.tsx` currently shows nothing during the latency between user-send and first stream-json frame (often 5–15 s). The user has no signal that claude is even running.

**Fix:** when `isStreaming === true` AND the latest assistant turn has no content blocks (or all are empty strings), append a final pulsing-dot row:

```jsx
{isStreaming && latestTurnIsEmpty && (
  <div className="flex items-center gap-2 px-3 py-2 text-xs text-mute" data-testid="thinking-indicator">
    <span className="animate-pulse">●●●</span>
    <span>Claude is thinking…</span>
  </div>
)}
```

`isStreaming` is the same flag the Composer already consumes — no new state.

## 6. Test pyramid

**Vitest:**
- `useTerminalSession` reducer (mock `tauriBridge.termOpen` / `termWrite` / `termResize` / `termClose` and `term_event` listener).
- `TerminalSurface` mounts xterm.js to a div, fits to container, attaches addons.
- `ClaudeDrawer` reads `claude.surface` and renders the right child.
- `registerSurfaceCommand` adds the palette entry; `run` toggles the setting.
- Footer no longer renders `ClaudeStatusLine` (existing Footer test updated).
- Drawer-height key migration: old key set + new key unset → first read returns old value; subsequent state writes the new key.
- All three § 5 bug fixes.

**Cargo:**
- `term::pty` state-machine: vault-switch detection (same vault → no-op; different vault → emits Ctrl-C / cd / claude byte sequence).
- `env_bootstrap`: parses `zsh -ilc env` output correctly even when PATH contains spaces / colons.

**Defer to MVP-4:**
- Real PTY integration tests (need `tauri-plugin-webdriver` for the host-side spawn; same plumbing constraint as MVP-2's deferred subprocess tests).
- Real cross-platform smoke (Windows ConPTY).

## 7. Verification

`npm run typecheck` / `npm run lint` / `npm run test:run` / `npm run build` / `cargo test` / `npm run tauri:build` — same gate as every previous MVP.

**Manual smoke (user runs before merge):**

1. Launch app, open a vault, open the drawer → confirm `zsh` prompt + `claude` auto-launches in the vault cwd.
2. Run `pwd` after Ctrl-C'ing claude → confirm vault path.
3. Resize the drawer height → confirm claude's TUI re-flows (no clipping, no off-screen).
4. Send a real `/kb document foo` to claude → confirm a new file appears in FileExplorer (watcher fires).
5. Switch vault → confirm Ctrl-C / cd / claude restart sequence visible in the terminal in real time.
6. Toggle to chat surface via command palette ("Toggle Claude surface") → confirm chat UI works, install toast fires (dev-mode fallback), thinking indicator appears during latency.
7. Toggle back to terminal → confirm same PTY state preserved (current claude prompt visible if still alive).
8. Quit app → relaunch → confirm fresh terminal spawns.
9. Esc inside terminal closes the drawer (regression check from MVP-2 fix `527e919`).
10. Without `claude` installed (rename binary out of PATH temporarily) → confirm zsh still spawns, "command not found" appears, `SetupScreen`-style banner suggests install.

## 8. Cross-reference to parent spec

The parent spec at `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 7 describes the chat-as-primary surface. This document amends that decision; § 7's plan + MVP-2 implementation are now the parked secondary surface. A one-paragraph note lands at the top of § 7 in the seed commit pointing here.

## 9. Open follow-up items (post-MVP-3.5)

- **Live serialize for scrollback persistence** across drawer hides — see § 4.9 trade-off.
- **Right-click → copy / paste** in the terminal (xterm.js has the primitives; needs a context menu).
- **Search-in-scrollback** (xterm.js search addon).
- **Custom shell** — let users pick `bash` / `fish` (low priority).
- **Multiple terminal panes / tabs** — out of scope, may revisit if requested.
