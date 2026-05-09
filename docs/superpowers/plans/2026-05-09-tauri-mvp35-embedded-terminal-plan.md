# MVP-3.5 — Embedded terminal as primary Claude surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the custom Claude chat UI as the primary surface with a real `zsh -i -l` PTY running `claude` in the active vault directory. Chat UI demoted to secondary behind a `claude.surface` setting, with three small fixes so it stays usable when toggled to.

**Architecture:** New Rust `term` module wrapping `portable-pty`, frontend `features/terminal` module with `xterm.js`, parent `ClaudeDrawer` component reading `claude.surface` and rendering `TerminalDrawer` or `ClaudeChatDrawer`. Settings toggle exposed via the existing `CommandRegistry` palette. PATH inheritance fixed at app boot via login-shell `env` capture.

**Tech Stack:** Rust + Tauri 2 + `portable-pty 0.8`, React 19 + Next.js 16 + Tailwind 4, `@xterm/xterm 5.5` + `@xterm/addon-fit 0.10` + `@xterm/addon-web-links 0.11`, Vitest, Cargo test.

> **Branch:** `feat/tauri-mvp35-embedded-terminal` (cut from `main` at `726904b` after PR #155 / MVP-3 merged). Seed commit `e6dc514` carries the spec.
> **Spec reference:** `docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md` (MVP-3.5).
> **Parent spec:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 7 (now amended with a pivot note pointing to MVP-3.5).

---

## Decisions baked into this plan (pinned, do not relitigate mid-MVP)

1. **Terminal experience model:** `zsh -i -l` spawned in vault cwd, with `claude\n` auto-typed to the master writer immediately after spawn ("C" choice from brainstorming). User sees claude's TUI on first open; can Ctrl-C out and use zsh freely.
2. **Lifecycle:** PTY persists across drawer toggles. Drawer-close hides the xterm view; PTY stays alive in `TermState`. PTY only dies on app quit (graceful Ctrl-C + 500ms + SIGTERM) or vault-switch (in-place restart, NOT kill).
3. **Vault switch:** `term_open` is idempotent. Same vault → no-op. Different vault → write `\x03` (Ctrl-C) + sleep 250ms + `cd <new>\nclaude\n` to the master writer. Same PTY, same scrollback.
4. **Surface toggle:** `claude.surface: 'terminal' | 'chat'`. Default `'terminal'` for new users. Exposed via the existing `CommandRegistry` palette as `claude.toggleSurface`.
5. **Footer:** `<ClaudeStatusLine />` removed entirely (claude's TUI status bar replaces it). Binary-presence detection survives via existing `claude_status` → `SetupScreen` path.
6. **`<ChatToggleButton />` renamed `<DrawerToggleButton />`** with label "Open Claude". Pulse-on-streaming gated on `claude.surface === 'chat'`.
7. **Skill bootstrap (`useSkillBootstrap`)** moves from `ClaudeChatDrawer` to the new parent `ClaudeDrawer` so it fires regardless of surface. Per-session module guard preserved.
8. **Settings drawer-height key rename:** `ui.claudeChat.height` → `ui.claudeDrawer.height`. One-shot read-time migration: read new key, fall back to old once if unset, write forward.
9. **PATH inheritance:** at app boot, run `/bin/zsh -ilc env` once and merge captured `PATH` into the process env. Fixes both the new terminal and the existing MVP-2 `Runner`'s `which::which("claude")`.
10. **xterm.js theme:** built from the app's CSS custom properties at instantiation. Re-instantiated on dark/light mode toggle.
11. **Scrollback on remount:** xterm re-instantiates blank when the drawer hides + reshows. Acceptable for MVP-3.5; live-serialize buffer is a future polish.
12. **Three chat-UI bug fixes** ride along (they keep the parked chat surface usable):
    - Dev-mode `bundled_path` fallback in `skill::commands` (resolves from `env!("CARGO_MANIFEST_DIR")/../skills/<name>/` when resource_dir doesn't have SKILL.md).
    - Error-variant `SkillInstallToast` (renders on `error !== null`, not just `justInstalled`).
    - "Claude is thinking…" indicator in `MessageList` while `isStreaming` is true and the latest assistant turn has no content yet.

---

## Out of scope (anti-goals — lift verbatim into PR description)

- Multiple parallel terminal sessions / tabs.
- Terminal scrollback persistence across app restarts.
- Custom shell selection (always `zsh -i -l`).
- Splitting the terminal pane (no tmux-in-app).
- Removing `claude_send` / `claude_interrupt` / `claude_reset` MVP-2 commands (parked, kept for the chat surface).
- Test infrastructure (still MVP-4) and test promotion (still MVP-5).
- Right-click context menu in terminal (no copy/paste menu); xterm.js's native selection + Cmd-C / Cmd-V works.
- Search-in-scrollback (xterm.js search addon).

---

## File map (what changes)

### Added (Rust)

- `src-tauri/src/term/mod.rs` — module re-exports + `TermState`.
- `src-tauri/src/term/pty.rs` — `PtySession` struct + spawn / write / resize / close logic.
- `src-tauri/src/term/commands.rs` — 4 Tauri commands (`term_open`, `term_write`, `term_resize`, `term_close`).
- `src-tauri/src/env_bootstrap.rs` — `merge_login_shell_path()` helper.

### Modified (Rust)

- `src-tauri/Cargo.toml` — add `portable-pty = "0.8"`.
- `src-tauri/src/lib.rs` — `pub mod term; pub mod env_bootstrap;`.
- `src-tauri/src/main.rs` — register `TermState`, register 4 new commands in `generate_handler!`, call `env_bootstrap::merge_login_shell_path()` early in `run`.
- `src-tauri/src/settings/store.rs` — add `claude_surface: ClaudeSurface` field; rename `claude_chat_height` → `claude_drawer_height` with one-shot migration on read.
- `src-tauri/src/settings/commands.rs` — surface accessors via the existing `settings_get` / `settings_set` round-trip (no new commands; the typed struct change carries through).
- `src-tauri/src/skill/commands.rs` — `bundled_path` dev-mode fallback (chat-bug-fix #1).

### Added (frontend)

- `src/app/knowledge_base/features/terminal/TerminalSurface.tsx`
- `src/app/knowledge_base/features/terminal/TerminalSurface.test.tsx`
- `src/app/knowledge_base/features/terminal/TerminalDrawer.tsx`
- `src/app/knowledge_base/features/terminal/TerminalDrawer.test.tsx`
- `src/app/knowledge_base/features/terminal/hooks/useTerminalSession.ts`
- `src/app/knowledge_base/features/terminal/hooks/useTerminalSession.test.ts`
- `src/app/knowledge_base/features/terminal/hooks/useTerminalResize.ts`
- `src/app/knowledge_base/features/terminal/theme.ts`
- `src/app/knowledge_base/features/terminal/registerSurfaceCommand.ts`
- `src/app/knowledge_base/features/terminal/registerSurfaceCommand.test.tsx`
- `src/app/knowledge_base/features/claude/ClaudeDrawer.tsx` — surface picker.
- `src/app/knowledge_base/features/claude/ClaudeDrawer.test.tsx`

### Modified (frontend)

- `package.json` — add `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`.
- `src/app/knowledge_base/infrastructure/tauriBridge.ts` — `termOpen` / `termWrite` / `termResize` / `termClose` wrappers + `term_event` listener helper.
- `src/app/knowledge_base/infrastructure/settingsStore.ts` — `getClaudeSurface` / `setClaudeSurface`; rename height accessors with migration.
- `src/app/knowledge_base/features/claude/hooks/useDrawerState.ts` — point to renamed height accessors.
- `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx` — `tone: 'success' | 'error'` prop (chat-bug-fix #2).
- `src/app/knowledge_base/features/claude/components/SkillInstallToast.test.tsx` — error-variant cases.
- `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` — render error toast, move `useSkillBootstrap` out (it now lives in `ClaudeDrawer`).
- `src/app/knowledge_base/features/claude/components/MessageList.tsx` — thinking indicator (chat-bug-fix #3).
- `src/app/knowledge_base/features/claude/components/MessageList.test.tsx` — thinking indicator cases.
- `src/app/knowledge_base/shell/Footer.tsx` — remove `<ClaudeStatusLine />`.
- `src/app/knowledge_base/shell/Footer.test.tsx` — drop the status-line assertion.
- `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx` → renamed to `DrawerToggleButton.tsx` (label change, surface-gated pulse).
- `src/app/knowledge_base/shell/footer/ChatToggleButton.test.tsx` → renamed accordingly.
- `src/app/knowledge_base/knowledgeBase.tsx` — mount `<ClaudeDrawer>` instead of `<ClaudeChatDrawer>`.
- `src/app/knowledge_base/knowledgeBase.initGuard.test.tsx` — adjust if it referenced `ChatToggleButton` or `ClaudeChatDrawer` directly.

### Added (docs / tests)

- `test-cases/14-terminal.md` — new bucket.

### Modified (docs)

- `Features.md` — extend §11 with terminal surface section; demote chat-surface bullets to a "secondary" sub-heading.
- `test-cases/01-app-shell.md` — note `<DrawerToggleButton>` rename.
- `test-cases/12-claude-chat.md` — note demotion + cross-reference.
- `test-cases/README.md` — register §14.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — already bumped on this branch's seed commit; will be re-bumped on PR-merge per protocol.

---

## Bootstrap (read-only)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use                                # match .nvmrc
npm ci                                 # match lockfile (do NOT npm install)
npm run typecheck                      # baseline green
npm run test:run                       # baseline green (2615 from MVP-3)
npm run lint                           # baseline green
git log --oneline -3                   # confirms branch tip is e6dc514 (spec seed)
which claude                           # verify claude CLI is on PATH for manual smoke later
ls skills/knowledge-base/SKILL.md      # confirm bundled skill source for the dev-fallback fix
```

---

## Task 1: `env_bootstrap` module — login-shell PATH capture

**Goal:** GUI apps on macOS don't inherit the user's `~/.zshrc` PATH. Capture it once at boot via `/bin/zsh -ilc env` and merge into the process env so `which::which("claude")` (MVP-2) and the new `zsh -i -l` PTY both find binaries from `~/.local/bin`, `/opt/homebrew/bin`, etc.

**Files:**
- Create: `src-tauri/src/env_bootstrap.rs`
- Modify: `src-tauri/src/lib.rs` (add `pub mod env_bootstrap;`)
- Modify: `src-tauri/src/main.rs` (call early in `run`)

### Step 1 — Write the module (with tests)

Create `src-tauri/src/env_bootstrap.rs`:

```rust
//! Captures the user's login-shell PATH once at app boot and merges it into
//! the current process env. macOS / Linux GUI apps don't inherit dotfile-
//! defined PATH otherwise, which breaks `which::which("claude")` and any
//! spawned `zsh -i -l` PTY that needs to resolve user-installed binaries.

use std::process::Command;

/// Run `/bin/zsh -ilc env`, parse the output, and merge any captured PATH
/// into the current process. Errors are logged-and-swallowed: if the shell
/// command fails or produces no PATH line, we keep the inherited env.
pub fn merge_login_shell_path() {
    let output = match Command::new("/bin/zsh").args(["-ilc", "env"]).output() {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            eprintln!(
                "env_bootstrap: zsh -ilc env failed with status {:?}",
                o.status
            );
            return;
        }
        Err(e) => {
            eprintln!("env_bootstrap: failed to spawn /bin/zsh: {e}");
            return;
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Some(path) = parse_path(&stdout) {
        std::env::set_var("PATH", path);
    }
}

/// Extract the PATH line from `env` output. Returns the raw value (everything
/// after `PATH=`), preserving colons, spaces, and any quirks.
fn parse_path(env_output: &str) -> Option<String> {
    for line in env_output.lines() {
        if let Some(rest) = line.strip_prefix("PATH=") {
            return Some(rest.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_path;

    #[test]
    fn parse_path_basic() {
        let env = "HOME=/Users/alice\nPATH=/usr/local/bin:/usr/bin:/bin\nSHELL=/bin/zsh\n";
        assert_eq!(
            parse_path(env).as_deref(),
            Some("/usr/local/bin:/usr/bin:/bin")
        );
    }

    #[test]
    fn parse_path_with_spaces() {
        let env = "PATH=/Users/alice/bin:/Applications/Some App.app/Contents/bin:/usr/bin\n";
        assert_eq!(
            parse_path(env).as_deref(),
            Some("/Users/alice/bin:/Applications/Some App.app/Contents/bin:/usr/bin")
        );
    }

    #[test]
    fn parse_path_missing_returns_none() {
        let env = "HOME=/Users/alice\nSHELL=/bin/zsh\n";
        assert!(parse_path(env).is_none());
    }

    #[test]
    fn parse_path_first_match_wins_when_duplicated() {
        // env's man page promises one PATH= line per process, but if there are
        // multiple (e.g. via subshell quirks), take the first.
        let env = "PATH=/first\nPATH=/second\n";
        assert_eq!(parse_path(env).as_deref(), Some("/first"));
    }
}
```

### Step 2 — Register in `lib.rs`

Edit `src-tauri/src/lib.rs` to add `pub mod env_bootstrap;` alongside the existing module list (alphabetical placement):

```rust
pub mod claude;
pub mod env_bootstrap;     // <-- add
pub mod settings;
pub mod skill;
pub mod vault;
```

### Step 3 — Call in `main.rs::run`

Read `src-tauri/src/main.rs` to find the `run()` function (Tauri 2 pattern). Add the call **before** any state setup:

```rust
pub fn run() {
    knowledge_base_lib::env_bootstrap::merge_login_shell_path();
    // ... existing tauri::Builder::default().setup(...) chain
}
```

The call is sync and runs once at startup — adds ~50ms cold boot. Acceptable.

### Step 4 — Verify

```bash
cd src-tauri && cargo test env_bootstrap::
# Expected: 4 passed
cd src-tauri && cargo build
# Expected: clean compile
```

### Step 5 — Commit

```bash
git add src-tauri/src/env_bootstrap.rs src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "$(cat <<'EOF'
feat(tauri): capture login-shell PATH at boot for claude resolution (mvp-3.5 task 1)

GUI apps on macOS / Linux don't inherit ~/.zshrc PATH. Run `/bin/zsh -ilc env`
once at app boot, parse PATH from the output, merge into the process env via
std::env::set_var. Errors are logged-and-swallowed so a missing zsh / failing
shell doesn't crash the app.

Fixes which::which("claude") in MVP-2's runner and unblocks the upcoming
PTY-spawned `zsh -i -l` from finding user-installed binaries.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rust `term` module skeleton + state registration

**Goal:** Create the module surface and register `TermState` + 4 command stubs (`Err("not implemented")`). Wires the dependency tree without writing any PTY logic — that lands in Tasks 3-5.

**Files:**
- Create: `src-tauri/src/term/mod.rs`
- Create: `src-tauri/src/term/pty.rs` (skeleton)
- Create: `src-tauri/src/term/commands.rs` (stubs)
- Modify: `src-tauri/Cargo.toml` (add `portable-pty = "0.8"`)
- Modify: `src-tauri/src/lib.rs` (`pub mod term;`)
- Modify: `src-tauri/src/main.rs` (manage `TermState`, register 4 commands)

### Step 1 — Add `portable-pty` to `Cargo.toml`

Edit `src-tauri/Cargo.toml` `[dependencies]` block, alphabetical placement:

```toml
[dependencies]
# ...
portable-pty = "0.8"
```

### Step 2 — Create `term/mod.rs`

```rust
pub mod commands;
pub mod pty;

use std::sync::Mutex;

use crate::term::pty::PtySession;

pub use commands::*;

/// App-managed state holding at most one live PTY session.
pub struct TermState(pub Mutex<Option<PtySession>>);

impl TermState {
    pub fn new() -> Self {
        TermState(Mutex::new(None))
    }
}

impl Default for TermState {
    fn default() -> Self {
        Self::new()
    }
}
```

### Step 3 — Create `term/pty.rs` (skeleton)

```rust
//! PTY session management. Tasks 3-5 fill in spawn / write / resize / close.

use std::path::PathBuf;

/// A live PTY session: the master, the spawned child (zsh), the writer
/// handle for stdin, the vault root we spawned in (for vault-switch
/// detection), and the JoinHandle for the byte-drain reader task.
pub struct PtySession {
    pub vault_root: PathBuf,
    // master + child + writer + reader_task fields land in Task 3.
}
```

### Step 4 — Create `term/commands.rs` (stubs)

```rust
use crate::term::TermState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn term_open(
    _vault_path: String,
    _rows: u16,
    _cols: u16,
    _state: State<'_, TermState>,
    _app: AppHandle,
) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_write(_bytes: Vec<u8>, _state: State<'_, TermState>) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_resize(
    _rows: u16,
    _cols: u16,
    _state: State<'_, TermState>,
) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_close(_state: State<'_, TermState>) -> Result<(), String> {
    Err("not implemented".into())
}
```

### Step 5 — Register in `lib.rs`

```rust
pub mod claude;
pub mod env_bootstrap;
pub mod settings;
pub mod skill;
pub mod term;          // <-- add
pub mod vault;
```

### Step 6 — Register `TermState` + commands in `main.rs`

Edit `src-tauri/src/main.rs`:
1. Add `use knowledge_base_lib::term;` near the existing module imports.
2. In the `tauri::Builder::default().setup(...)` block, manage `TermState`: `app.manage(term::TermState::new());` alongside existing `manage` calls.
3. In the `tauri::generate_handler!(...)` macro, append the 4 new commands:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing 22 from MVP-3 ...
    term::commands::term_open,
    term::commands::term_write,
    term::commands::term_resize,
    term::commands::term_close,
])
```

Total: **26 commands** (22 from MVP-3 + 4 here).

### Step 7 — Verify

```bash
cd src-tauri && cargo build
# Expected: clean compile (warnings about unused fields are OK; Task 3 fills them)
cd src-tauri && cargo test
# Expected: 72 (existing) passed, no new tests yet
```

### Step 8 — Commit

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/term src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "$(cat <<'EOF'
feat(tauri): scaffold term module — TermState + command stubs (mvp-3.5 task 2)

Adds src-tauri/src/term/{mod,pty,commands.rs} with:
- TermState (Mutex<Option<PtySession>>) holding at most one live PTY.
- PtySession skeleton (fields fill in during Task 3 alongside portable-pty
  spawn).
- 4 command stubs (term_open / term_write / term_resize / term_close)
  returning Err("not implemented").

portable-pty 0.8 added to Cargo.toml. State + commands registered in
lib.rs and main.rs::generate_handler! (26 commands total).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `term_open` + `term_close` + reader task

**Goal:** Real bodies for `term_open` (first-spawn case only — vault-switch lands in Task 5) and `term_close`. Spawns `zsh -i -l` in vault cwd via `portable-pty`, auto-types `claude\n`, starts a Tokio task draining the master reader → `term_event` events.

**Files:**
- Modify: `src-tauri/src/term/pty.rs`
- Modify: `src-tauri/src/term/commands.rs`

### Step 1 — Fill in `pty.rs`

Replace the skeleton with:

```rust
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

/// A live PTY session: the master end (read + resize), the writer for
/// stdin, the spawned child handle (for graceful close), the vault root
/// (for switch detection in Task 5), and the reader-task handle.
pub struct PtySession {
    pub vault_root: PathBuf,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub reader_task: JoinHandle<()>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TermEventPayload {
    /// Bytes streamed from the PTY master. Frontend pipes into xterm.write().
    Data { bytes: Vec<u8> },
    /// Child exited. Frontend may surface "claude exited" / re-spawn.
    Exit,
}

/// Spawn `zsh -i -l` in the given vault, auto-type `claude\n`, start the
/// reader task. Caller must hold the TermState lock.
pub fn spawn(vault_root: PathBuf, rows: u16, cols: u16, app: AppHandle) -> Result<PtySession, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new("zsh");
    cmd.args(["-i", "-l"]);
    cmd.cwd(&vault_root);
    // ANTHROPIC_API_KEY is scrubbed by MVP-2 already at process level. No
    // re-scrub here — same env reaches both surfaces.

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn zsh: {e}"))?;

    let mut writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer: {e}"))?;

    // Auto-type `claude\n` to launch claude inside the freshly-spawned shell.
    // Sleep a tiny bit so zsh has time to print its prompt first; the user
    // sees "$ claude\n" in their scrollback as if they typed it.
    std::thread::sleep(Duration::from_millis(150));
    writer.write_all(b"claude\n").map_err(|e| format!("auto-type claude: {e}"))?;
    writer.flush().ok();

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("try_clone_reader: {e}"))?;

    let reader_app = app.clone();
    let reader_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) => {
                    let _ = reader_app.emit("term_event", TermEventPayload::Exit);
                    break;
                }
                Ok(n) => {
                    let payload = TermEventPayload::Data {
                        bytes: buf[..n].to_vec(),
                    };
                    let _ = reader_app.emit("term_event", payload);
                }
                Err(e) => {
                    eprintln!("term reader: {e}");
                    let _ = reader_app.emit("term_event", TermEventPayload::Exit);
                    break;
                }
            }
        }
    });

    Ok(PtySession {
        vault_root,
        master: pair.master,
        writer,
        child,
        reader_task,
    })
}

/// Graceful close: write Ctrl-C, wait 500ms, then kill the child + abort the
/// reader task.
pub fn close(mut session: PtySession) {
    // Best-effort Ctrl-C — ignore write errors (child may already be dead).
    let _ = session.writer.write_all(&[0x03]);
    let _ = session.writer.flush();

    std::thread::sleep(Duration::from_millis(500));

    let _ = session.child.kill();
    session.reader_task.abort();
}
```

### Step 2 — Fill in `term_open` + `term_close` in `commands.rs`

Replace the stubs:

```rust
use std::path::PathBuf;

use crate::term::pty::{close as pty_close, spawn as pty_spawn};
use crate::term::TermState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn term_open(
    vault_path: String,
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;

    let vault_root = PathBuf::from(&vault_path);
    if !vault_root.is_dir() {
        return Err(format!("vault path is not a directory: {vault_path}"));
    }

    if guard.is_some() {
        // Vault-switch handling lands in Task 5. For now, idempotent same-
        // vault case: drop the request silently (the existing session is fine).
        let session = guard.as_ref().unwrap();
        if session.vault_root == vault_root {
            return Ok(());
        }
        return Err("vault-switch not yet implemented (Task 5)".into());
    }

    let session = pty_spawn(vault_root, rows, cols, app)?;
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn term_write(_bytes: Vec<u8>, _state: State<'_, TermState>) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_resize(
    _rows: u16,
    _cols: u16,
    _state: State<'_, TermState>,
) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_close(state: State<'_, TermState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    if let Some(session) = guard.take() {
        pty_close(session);
    }
    Ok(())
}
```

### Step 3 — Verify compilation

```bash
cd src-tauri && cargo build
# Expected: clean compile.
cd src-tauri && cargo test
# Expected: 72 passed (no new tests — pty integration deferred to MVP-4).
```

PTY integration tests (real zsh, real reader bytes) need a host-side spawn that's hard to unit-test from Cargo. Per parent spec § 9, real subprocess + bundled-resource integration coverage stays deferred to MVP-4.

### Step 4 — Commit

```bash
git add src-tauri/src/term/pty.rs src-tauri/src/term/commands.rs
git commit -m "$(cat <<'EOF'
feat(tauri): term_open + term_close + reader task (mvp-3.5 task 3)

PtySession owns master / writer / child / reader-task. spawn() opens a
PTY via portable-pty, runs `zsh -i -l` with cwd=<vault>, auto-types
`claude\n` (150ms sleep first so zsh emits the prompt), then starts a
spawn_blocking task draining the master reader and emitting `term_event`
payloads ({ kind: "data", bytes } or { kind: "exit" }).

term_open: rejects non-directory paths; idempotent for same vault;
errors out on vault-switch (Task 5 plumbs that). term_close: Ctrl-C +
500ms wait + child.kill + reader-task abort.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `term_write` + `term_resize` command bodies

**Goal:** Forward frontend keystrokes to the PTY's stdin (write) and propagate container-resize → SIGWINCH (resize).

**Files:**
- Modify: `src-tauri/src/term/commands.rs`

### Step 1 — Fill in `term_write`

In `term/commands.rs`, replace the stub:

```rust
#[tauri::command]
pub async fn term_write(bytes: Vec<u8>, state: State<'_, TermState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    let session = guard.as_mut().ok_or_else(|| "no live term session".to_string())?;
    use std::io::Write;
    session
        .writer
        .write_all(&bytes)
        .map_err(|e| format!("term write: {e}"))?;
    session.writer.flush().ok();
    Ok(())
}
```

### Step 2 — Fill in `term_resize`

```rust
#[tauri::command]
pub async fn term_resize(
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    let session = guard.as_ref().ok_or_else(|| "no live term session".to_string())?;
    session
        .master
        .resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("term resize: {e}"))?;
    Ok(())
}
```

### Step 3 — Verify

```bash
cd src-tauri && cargo build
# Expected: clean.
cd src-tauri && cargo test
# Expected: 72 passed.
```

### Step 4 — Commit

```bash
git add src-tauri/src/term/commands.rs
git commit -m "$(cat <<'EOF'
feat(tauri): term_write + term_resize command bodies (mvp-3.5 task 4)

term_write forwards arbitrary bytes (keystrokes / paste payloads) to the
PTY master writer + flush. term_resize calls master.resize(rows, cols),
which propagates SIGWINCH so claude's TUI re-flows.

Both error out cleanly when no session is live ("no live term session"
— frontend should call term_open first).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Vault-switch handling in `term_open`

**Goal:** When `term_open` is called with a `vault_path` different from the live session's `vault_root`, write `\x03` (Ctrl-C) + 250ms sleep + `cd <new_vault>\nclaude\n` to the master writer. Same PTY, same scrollback. Update `vault_root` in state.

**Files:**
- Modify: `src-tauri/src/term/commands.rs`
- Modify: `src-tauri/src/term/pty.rs` (add the `restart_in_new_vault` helper)

### Step 1 — Add helper in `pty.rs`

```rust
/// Send Ctrl-C + cd + claude\n to an existing session's writer. Updates
/// vault_root in place. Caller holds the TermState lock.
pub fn restart_in_new_vault(session: &mut PtySession, new_vault: PathBuf) -> Result<(), String> {
    use std::io::Write;
    // Step 1: Ctrl-C — exits claude, returns control to zsh.
    session.writer.write_all(&[0x03]).map_err(|e| format!("ctrl-c: {e}"))?;
    session.writer.flush().ok();
    // Step 2: small sleep so claude finishes flushing exit + zsh re-emits prompt.
    std::thread::sleep(std::time::Duration::from_millis(250));
    // Step 3: cd to new vault.
    let cd_line = format!("cd {}\n", shell_escape(&new_vault.display().to_string()));
    session.writer.write_all(cd_line.as_bytes()).map_err(|e| format!("cd: {e}"))?;
    // Step 4: re-launch claude.
    session.writer.write_all(b"claude\n").map_err(|e| format!("claude: {e}"))?;
    session.writer.flush().ok();

    session.vault_root = new_vault;
    Ok(())
}

/// Quote a path for use in a shell command. Escapes single quotes by ending
/// the quote, escaping the quote, and reopening it. Vault paths shouldn't
/// contain wild characters but this is the safe shape.
fn shell_escape(s: &str) -> String {
    if !s.contains('\'') {
        return format!("'{s}'");
    }
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::shell_escape;

    #[test]
    fn shell_escape_basic() {
        assert_eq!(shell_escape("/Users/kiro/notes"), "'/Users/kiro/notes'");
    }

    #[test]
    fn shell_escape_with_spaces() {
        assert_eq!(
            shell_escape("/Users/kiro/My Vault"),
            "'/Users/kiro/My Vault'"
        );
    }

    #[test]
    fn shell_escape_with_apostrophe() {
        assert_eq!(
            shell_escape("/Users/joe's vault"),
            r"'/Users/joe'\''s vault'"
        );
    }
}
```

### Step 2 — Wire into `term_open`

Replace the Task 3 stub-error path in `term_open`:

```rust
#[tauri::command]
pub async fn term_open(
    vault_path: String,
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;

    let vault_root = PathBuf::from(&vault_path);
    if !vault_root.is_dir() {
        return Err(format!("vault path is not a directory: {vault_path}"));
    }

    if let Some(session) = guard.as_mut() {
        if session.vault_root == vault_root {
            return Ok(()); // same vault: idempotent no-op
        }
        // vault changed: restart in place
        return crate::term::pty::restart_in_new_vault(session, vault_root);
    }

    let session = pty_spawn(vault_root, rows, cols, app)?;
    *guard = Some(session);
    Ok(())
}
```

### Step 3 — Verify

```bash
cd src-tauri && cargo test term::pty::tests
# Expected: 3 passed (shell_escape cases)
cd src-tauri && cargo test
# Expected: 75 passed (72 + 3 new)
cd src-tauri && cargo build
# Expected: clean
```

### Step 4 — Commit

```bash
git add src-tauri/src/term/pty.rs src-tauri/src/term/commands.rs
git commit -m "$(cat <<'EOF'
feat(tauri): term_open vault-switch keeps PTY alive (mvp-3.5 task 5)

Same vault → idempotent no-op. Different vault → write Ctrl-C, sleep 250ms,
write `cd <new>\nclaude\n` to the master writer. PTY itself stays alive,
scrollback preserved. shell_escape protects against vault paths with
spaces or apostrophes.

3 unit tests cover shell_escape (basic / spaces / apostrophe).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend bridge + xterm.js deps

**Goal:** Add `@xterm/*` packages, wrap the 4 new Rust commands in `tauriBridge`, add a `term_event` listener helper.

**Files:**
- Modify: `package.json`
- Modify: `src/app/knowledge_base/infrastructure/tauriBridge.ts`

### Step 1 — Install xterm packages

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use
npm install @xterm/xterm@^5.5.0 @xterm/addon-fit@^0.10.0 @xterm/addon-web-links@^0.11.0
```

This produces a `package.json` + `package-lock.json` diff; commit both.

### Step 2 — Extend `tauriBridge.ts`

Read the existing file. Add type and method definitions alongside the existing `claudeStatus` / `skillStatus` block:

```typescript
// Near the top, alongside other type exports:
export type TermEventPayload =
  | { kind: 'data'; bytes: number[] }
  | { kind: 'exit' };

// Inside the tauriBridge object literal:
termOpen(vaultPath: string, rows: number, cols: number): Promise<void> {
  return call<void>("term_open", { vaultPath, rows, cols }, vaultPath);
},

termWrite(bytes: number[]): Promise<void> {
  return call<void>("term_write", { bytes }, "");
},

termResize(rows: number, cols: number): Promise<void> {
  return call<void>("term_resize", { rows, cols }, "");
},

termClose(): Promise<void> {
  return call<void>("term_close", {}, "");
},

/** Subscribe to term_event payloads. Returns an unsubscribe function. */
subscribeTermEvent(handler: (e: TermEventPayload) => void): Promise<() => void> {
  return listenEvent<TermEventPayload>("term_event", handler);
},
```

(Use the same `listenEvent` helper that MVP-2's `subscribeClaudeEvent` uses — read the existing impl to confirm the signature, likely `(channel: string, handler: (p: T) => void) => Promise<() => void>`.)

### Step 3 — Verify

```bash
npm run typecheck
# Expected: clean
npm run build
# Expected: clean
```

(No new tests yet — the bridge is exercised end-to-end in Task 7.)

### Step 4 — Commit

```bash
git add package.json package-lock.json src/app/knowledge_base/infrastructure/tauriBridge.ts
git commit -m "$(cat <<'EOF'
feat(claude): xterm.js deps + tauriBridge.term* wrappers (mvp-3.5 task 6)

Adds @xterm/xterm 5.5, @xterm/addon-fit 0.10, @xterm/addon-web-links 0.11.
tauriBridge gains termOpen / termWrite / termResize / termClose around the
4 new Rust commands plus subscribeTermEvent for the data/exit byte stream.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `TerminalSurface` + `useTerminalSession` + `useTerminalResize`

**Goal:** Mount xterm.js, connect it to the bridge, debounce resize → `term_resize`. The hook owns the lifecycle (open on mount + on `vaultPath` change; close on unmount).

**Files:**
- Create: `src/app/knowledge_base/features/terminal/theme.ts`
- Create: `src/app/knowledge_base/features/terminal/hooks/useTerminalSession.ts`
- Create: `src/app/knowledge_base/features/terminal/hooks/useTerminalSession.test.ts`
- Create: `src/app/knowledge_base/features/terminal/hooks/useTerminalResize.ts`
- Create: `src/app/knowledge_base/features/terminal/TerminalSurface.tsx`
- Create: `src/app/knowledge_base/features/terminal/TerminalSurface.test.tsx`

### Step 1 — `theme.ts`

```typescript
import type { ITheme } from "@xterm/xterm";

/** Build an xterm.js theme from the app's CSS custom properties. */
export function buildTerminalTheme(): ITheme {
  if (typeof window === "undefined") return {};
  const cs = window.getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => {
    const v = cs.getPropertyValue(name).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    background: get("--bg-surface", "#0e0f12"),
    foreground: get("--text-ink", "#e6e6e6"),
    cursor: get("--accent", "#7aa2f7"),
    cursorAccent: get("--bg-surface", "#0e0f12"),
    selectionBackground: get("--accent", "#7aa2f7") + "33", // 20% alpha
  };
}
```

If the project's design tokens don't expose these specific custom properties (read `src/app/globals.css` to check), the fallbacks ship a reasonable Tokyo Night–ish palette. Refine in Task 12 if visual review demands.

### Step 2 — `useTerminalSession.ts`

```typescript
import { useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

interface Options {
  vaultPath: string | null;
  /** xterm Terminal instance to write incoming bytes into. */
  term: Terminal | null;
}

/** Owns the PTY lifecycle: open on mount + vaultPath change, close on unmount. */
export function useTerminalSession({ vaultPath, term }: Options) {
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!term || !vaultPath) return;

    const { rows, cols } = term;

    // Subscribe to byte stream first so we don't miss the auto-typed
    // `claude\n` echo or claude's banner.
    let unsub: (() => void) | null = null;
    void tauriBridge.subscribeTermEvent((e) => {
      if (e.kind === "data") {
        const bytes = new Uint8Array(e.bytes);
        term.write(bytes);
      } else if (e.kind === "exit") {
        // Surface exit to the user; backend may have crashed or claude
        // exited while drawer was hidden.
        term.write("\r\n[claude exited]\r\n");
      }
    }).then((u) => {
      unsub = u;
      unsubRef.current = u;
    });

    // Forward keystrokes to the PTY.
    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      void tauriBridge.termWrite(bytes);
    });

    // Open / restart in this vault.
    void tauriBridge.termOpen(vaultPath, rows, cols);

    return () => {
      dataDisposable.dispose();
      if (unsub) unsub();
    };
  }, [term, vaultPath]);

  // term_close fires on app quit (Tauri's window-close hook in main.rs); we
  // don't kill on hook unmount because the PTY persists across drawer hides.
  // The CLEANUP function above only unsubscribes / disposes the listener.
}
```

### Step 3 — `useTerminalResize.ts`

```typescript
import { useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

const DEBOUNCE_MS = 120;

export function useTerminalResize(
  container: HTMLDivElement | null,
  term: Terminal | null,
  fitAddon: FitAddon | null,
) {
  useEffect(() => {
    if (!container || !term || !fitAddon) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          fitAddon.fit();
          void tauriBridge.termResize(term.rows, term.cols);
        } catch {
          // Container detached during the timeout; ignore.
        }
      }, DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [container, term, fitAddon]);
}
```

### Step 4 — `TerminalSurface.tsx`

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { useRepositories } from "../../shell/RepositoryContext";
import { useTerminalSession } from "./hooks/useTerminalSession";
import { useTerminalResize } from "./hooks/useTerminalResize";
import { buildTerminalTheme } from "./theme";

export function TerminalSurface() {
  const { vaultPath } = useRepositories();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [term, setTerm] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const initOnce = useRef(false);

  useEffect(() => {
    if (!container || initOnce.current) return;
    initOnce.current = true;
    const t = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      theme: buildTerminalTheme(),
      scrollback: 5000,
      allowTransparency: false,
    });
    const fa = new FitAddon();
    const wla = new WebLinksAddon();
    t.loadAddon(fa);
    t.loadAddon(wla);
    t.open(container);
    fa.fit();
    setTerm(t);
    setFitAddon(fa);

    return () => {
      t.dispose();
    };
  }, [container]);

  useTerminalSession({ vaultPath, term });
  useTerminalResize(container, term, fitAddon);

  return (
    <div
      ref={setContainer}
      className="size-full bg-surface"
      role="region"
      aria-label="Claude terminal"
      data-testid="terminal-surface"
    />
  );
}
```

### Step 5 — Tests

`useTerminalSession.test.ts`:

```typescript
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    termOpen: vi.fn(() => Promise.resolve()),
    termWrite: vi.fn(() => Promise.resolve()),
    subscribeTermEvent: vi.fn(() => Promise.resolve(() => {})),
  },
}));

import { tauriBridge } from "../../../infrastructure/tauriBridge";
import { useTerminalSession } from "./useTerminalSession";

const open = vi.mocked(tauriBridge.termOpen);
const sub = vi.mocked(tauriBridge.subscribeTermEvent);

function fakeTerm() {
  return {
    rows: 24,
    cols: 80,
    write: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as import("@xterm/xterm").Terminal;
}

describe("useTerminalSession", () => {
  beforeEach(() => {
    open.mockClear();
    sub.mockClear();
    sub.mockResolvedValue(() => {});
  });

  it("TERM-14.1-01: skips open when vaultPath null", () => {
    renderHook(() =>
      useTerminalSession({ vaultPath: null, term: fakeTerm() }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-02: skips open when term null", () => {
    renderHook(() =>
      useTerminalSession({ vaultPath: "/v", term: null }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-03: calls termOpen with rows/cols once both ready", async () => {
    renderHook(() =>
      useTerminalSession({ vaultPath: "/v", term: fakeTerm() }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/v", 24, 80);
  });

  it("TERM-14.1-04: re-opens on vaultPath change", async () => {
    const term = fakeTerm();
    const { rerender } = renderHook(
      ({ vaultPath }) => useTerminalSession({ vaultPath, term }),
      { initialProps: { vaultPath: "/a" } },
    );
    await act(async () => { await Promise.resolve(); });
    expect(open).toHaveBeenCalledWith("/a", 24, 80);
    rerender({ vaultPath: "/b" });
    await act(async () => { await Promise.resolve(); });
    expect(open).toHaveBeenCalledWith("/b", 24, 80);
  });
});
```

`TerminalSurface.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    rows: 24,
    cols: 80,
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
  })),
}));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: vi.fn().mockImplementation(() => ({ fit: vi.fn() })) }));
vi.mock("@xterm/addon-web-links", () => ({ WebLinksAddon: vi.fn().mockImplementation(() => ({})) }));
vi.mock("../../shell/RepositoryContext", () => ({
  useRepositories: () => ({ vaultPath: "/v" }),
}));
vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    termOpen: vi.fn(() => Promise.resolve()),
    subscribeTermEvent: vi.fn(() => Promise.resolve(() => {})),
  },
}));

import { TerminalSurface } from "./TerminalSurface";

describe("TerminalSurface", () => {
  it("TERM-14.1-05: renders the container with role=region", () => {
    render(<TerminalSurface />);
    expect(screen.getByRole("region", { name: "Claude terminal" })).toBeInTheDocument();
  });
});
```

### Step 6 — Verify

```bash
npm run typecheck
npm run lint
npm run test:run
# Expected: 5 new tests added, full suite green
npm run build
```

### Step 7 — Commit

```bash
git add src/app/knowledge_base/features/terminal package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(claude): TerminalSurface + useTerminalSession + useTerminalResize (mvp-3.5 task 7)

xterm.js mount with FitAddon + WebLinksAddon, themed from app CSS custom
properties. useTerminalSession owns the PTY lifecycle: subscribes to
term_event, pipes data bytes into term.write, forwards term.onData →
termWrite. Re-fires termOpen on vaultPath change (backend handles the
in-place vault-switch). useTerminalResize debounces ResizeObserver →
fitAddon.fit + termResize.

Tests: 4 useTerminalSession (null guards, opens on ready, re-opens on
change), 1 TerminalSurface (renders region).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Settings additions + drawer-height key migration

**Goal:** Add `claude.surface` enum + accessors. Rename `ui.claudeChat.height` → `ui.claudeDrawer.height` with one-shot read-time migration. Re-point `useDrawerState` to the renamed accessors.

**Files:**
- Modify: `src-tauri/src/settings/store.rs`
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.ts`
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.test.ts`
- Modify: `src/app/knowledge_base/features/claude/hooks/useDrawerState.ts`

### Step 1 — Rust `Settings` struct

Read `src-tauri/src/settings/store.rs`. Find the `Settings` struct and add a `claude_surface` field, plus rename the height field.

Approximate diff (exact field placement depends on existing struct):

```rust
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "snake_case")]
pub struct ClaudeSettings {
    pub permission_mode: ClaudePermissionMode,
    #[serde(default)]
    pub surface: ClaudeSurface,         // <-- new
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeSurface {
    #[default]
    Terminal,
    Chat,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "snake_case")]
pub struct UiSettings {
    pub claude_drawer: ClaudeDrawerUiSettings, // renamed from claude_chat
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default, rename_all = "snake_case")]
pub struct ClaudeDrawerUiSettings {
    pub height: u32,
}
```

If `Settings` has a `From` conversion from a "raw" JSON shape to handle migration, fold the `claude_chat → claude_drawer` rename into it. Otherwise add a one-shot migration in the `read` function:

```rust
// Read raw JSON value first, migrate the height key if present, then deserialize.
let mut raw: serde_json::Value = serde_json::from_str(&content).unwrap_or_default();
if let Some(ui) = raw.get_mut("ui").and_then(|u| u.as_object_mut()) {
    if let Some(old_chat) = ui.remove("claudeChat") {
        ui.insert("claudeDrawer".to_string(), old_chat);
    }
}
let settings: Settings = serde_json::from_value(raw)?;
```

(Adjust to the existing settings file format — JSON keys are camelCase via `rename_all` per existing MVP-1c convention.)

### Step 2 — Frontend accessors

Edit `src/app/knowledge_base/infrastructure/settingsStore.ts`. Add:

```typescript
export type ClaudeSurface = 'terminal' | 'chat';

export async function getClaudeSurface(): Promise<ClaudeSurface> {
  const s = await getSettings();
  return s.claude.surface ?? 'terminal';
}

export async function setClaudeSurface(surface: ClaudeSurface): Promise<void> {
  const s = await getSettings();
  await writeSettings({ ...s, claude: { ...s.claude, surface } });
}

// Renamed from getClaudeChatHeight / setClaudeChatHeight.
// Internal migration: if new key is missing but old (`claudeChat.height`)
// exists, return the old value AND write it forward.
export async function getClaudeDrawerHeight(): Promise<number> {
  const s = await getSettings();
  const newKey = (s.ui as { claudeDrawer?: { height?: number } }).claudeDrawer?.height;
  if (typeof newKey === "number" && newKey > 0) return newKey;
  const oldKey = (s.ui as { claudeChat?: { height?: number } }).claudeChat?.height;
  if (typeof oldKey === "number" && oldKey > 0) {
    await setClaudeDrawerHeight(oldKey);
    return oldKey;
  }
  return 320;
}

export async function setClaudeDrawerHeight(height: number): Promise<void> {
  const s = await getSettings();
  await writeSettings({
    ...s,
    ui: { ...s.ui, claudeDrawer: { ...(s.ui as { claudeDrawer?: object }).claudeDrawer, height } },
  });
}
```

The old `getClaudeChatHeight` / `setClaudeChatHeight` functions are removed in this task.

### Step 3 — Update `useDrawerState`

Edit `src/app/knowledge_base/features/claude/hooks/useDrawerState.ts`. Replace the two import lines:

```typescript
import { getClaudeDrawerHeight, setClaudeDrawerHeight } from "../../../infrastructure/settingsStore";
```

Replace `getClaudeChatHeight()` and `setClaudeChatHeight(...)` call sites with the renamed versions.

### Step 4 — Tests

Extend `settingsStore.test.ts` with migration cases:

```typescript
it("SETTINGS-8.x-01: getClaudeSurface defaults to terminal", async () => {
  // Mock getSettings to return claude object without surface.
  // Expected: 'terminal'.
});
it("SETTINGS-8.x-02: getClaudeDrawerHeight reads new key when present", async () => { /* ... */ });
it("SETTINGS-8.x-03: getClaudeDrawerHeight migrates old key when new missing", async () => {
  // getSettings returns { ui: { claudeChat: { height: 400 } } }.
  // Expected: returns 400 AND fires setClaudeDrawerHeight(400) write-forward.
});
it("SETTINGS-8.x-04: getClaudeDrawerHeight defaults to 320 when both keys absent", async () => { /* ... */ });
```

Pick free SETTINGS-X.Y-NN IDs by reading `test-cases/07-persistence.md`.

### Step 5 — Verify

```bash
cd src-tauri && cargo build && cargo test
# Expected: clean + 75 passed (no Rust test changes)
npm run typecheck
npm run test:run
# Expected: ~2620 tests pass (+ 4 new settings, useDrawerState existing tests still green)
npm run build
```

If any existing test references `getClaudeChatHeight` directly, update those call sites in the same commit.

### Step 6 — Commit

```bash
git add src-tauri/src/settings/store.rs src/app/knowledge_base/infrastructure/settingsStore.ts src/app/knowledge_base/infrastructure/settingsStore.test.ts src/app/knowledge_base/features/claude/hooks/useDrawerState.ts
git commit -m "$(cat <<'EOF'
feat(settings): claude.surface + drawer-height key rename + migration (mvp-3.5 task 8)

Settings struct gains claude.surface (enum 'terminal' | 'chat', default
'terminal'). ui.claudeChat.height renamed to ui.claudeDrawer.height with
a one-shot read-time migration: if the new key is missing but the old
one is set, return the old value and write it forward (idempotent on
subsequent reads).

useDrawerState re-pointed to getClaudeDrawerHeight / setClaudeDrawerHeight.
Old getClaudeChatHeight / setClaudeChatHeight removed.

Tests: 4 settingsStore migration cases.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `ClaudeDrawer` surface picker + `TerminalDrawer` + register palette command

**Goal:** Parent component reading `claude.surface` and rendering `<TerminalDrawer />` or `<ClaudeChatDrawer />`. `useSkillBootstrap` moves here. Palette command `claude.toggleSurface` registered.

**Files:**
- Create: `src/app/knowledge_base/features/terminal/TerminalDrawer.tsx`
- Create: `src/app/knowledge_base/features/terminal/TerminalDrawer.test.tsx`
- Create: `src/app/knowledge_base/features/terminal/registerSurfaceCommand.ts`
- Create: `src/app/knowledge_base/features/terminal/registerSurfaceCommand.test.tsx`
- Create: `src/app/knowledge_base/features/claude/ClaudeDrawer.tsx`
- Create: `src/app/knowledge_base/features/claude/ClaudeDrawer.test.tsx`
- Modify: `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` (move `useSkillBootstrap` out)
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (mount `<ClaudeDrawer>`)

### Step 1 — `TerminalDrawer.tsx`

```typescript
"use client";

import { useEffect } from "react";
import { useChat } from "../claude/ChatContext";
import { DrawerResizeHandle } from "../claude/components/DrawerResizeHandle";
import { TerminalSurface } from "./TerminalSurface";

export function TerminalDrawer() {
  const { isOpen, height, close, setHeight } = useChat();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Stop browser fullscreen exit (matches MVP-2 fix 527e919).
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-surface border-t border-line shadow-lg"
      style={{ height }}
      role="region"
      aria-label="Claude terminal drawer"
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      <div className="flex-1 min-h-0">
        <TerminalSurface />
      </div>
    </div>
  );
}
```

`useChat()` exposes `isOpen` / `height` / `close` / `setHeight` from MVP-2's `useDrawerState`. The terminal doesn't use the chat session slice at all, but reusing the drawer-state slice keeps the mount/close UX identical to the chat surface.

### Step 2 — `registerSurfaceCommand.ts`

```typescript
"use client";

import { useEffect } from "react";
import { useRegisterCommands } from "../../shared/context/CommandRegistry";
import { getClaudeSurface, setClaudeSurface, type ClaudeSurface } from "../../infrastructure/settingsStore";

interface Props {
  /** Notifies parent when the surface flips so it re-reads the setting. */
  onSurfaceChange?: (next: ClaudeSurface) => void;
}

export function RegisterSurfaceCommand({ onSurfaceChange }: Props) {
  useRegisterCommands([
    {
      id: "claude.toggleSurface",
      title: "Toggle Claude surface (Terminal ↔ Chat)",
      group: "Claude",
      run: async () => {
        const current = await getClaudeSurface();
        const next: ClaudeSurface = current === "terminal" ? "chat" : "terminal";
        await setClaudeSurface(next);
        onSurfaceChange?.(next);
      },
    },
  ]);
  // Render nothing — pure registration component.
  return null;
}
```

(Adjust `useRegisterCommands` import path if `CommandRegistry.tsx` exports a different hook name — read the file to confirm.)

### Step 3 — `ClaudeDrawer.tsx` (the surface picker)

```typescript
"use client";

import { useEffect, useState } from "react";
import { useSkillBootstrap } from "../claude/hooks/useSkillBootstrap";
import { SkillInstallToast } from "../claude/components/SkillInstallToast";
import { ClaudeChatDrawer } from "../claude/ClaudeChatDrawer";
import { TerminalDrawer } from "../terminal/TerminalDrawer";
import { RegisterSurfaceCommand } from "../terminal/registerSurfaceCommand";
import { getClaudeSurface, type ClaudeSurface } from "../../infrastructure/settingsStore";

export function ClaudeDrawer() {
  const [surface, setSurface] = useState<ClaudeSurface>("terminal");
  const skillBootstrap = useSkillBootstrap("knowledge-base");

  useEffect(() => {
    void getClaudeSurface().then(setSurface);
  }, []);

  return (
    <>
      <RegisterSurfaceCommand onSurfaceChange={setSurface} />
      {skillBootstrap.justInstalled && <SkillInstallToast show />}
      {skillBootstrap.error !== null && (
        <SkillInstallToast
          show
          tone="error"
          message={`Skill install failed: ${skillBootstrap.error}`}
        />
      )}
      {surface === "terminal" ? <TerminalDrawer /> : <ClaudeChatDrawer />}
    </>
  );
}
```

### Step 4 — Move `useSkillBootstrap` out of `ClaudeChatDrawer`

In `ClaudeChatDrawer.tsx`, remove the line `const skillBootstrap = useSkillBootstrap("knowledge-base");` and the toast render (`{skillBootstrap.justInstalled && <SkillInstallToast show />}`). Both now live in `ClaudeDrawer`.

### Step 5 — Mount `<ClaudeDrawer>` in `knowledgeBase.tsx`

Find the existing `<ClaudeChatDrawer />` mount in `knowledgeBase.tsx` (or its inner shell). Replace with `<ClaudeDrawer />`. Update import.

### Step 6 — Tests

`TerminalDrawer.test.tsx` — basic mount, esc closes, hidden when `isOpen=false`. Mock `useChat` and `TerminalSurface`.

`ClaudeDrawer.test.tsx`:
- Default surface 'terminal' renders `<TerminalDrawer />` (mocked).
- Surface 'chat' renders `<ClaudeChatDrawer />` (mocked).
- Toast fires on `justInstalled` (mock useSkillBootstrap).
- Error toast fires on `error !== null`.
- Surface flip via `onSurfaceChange` callback re-renders the right child.

`registerSurfaceCommand.test.tsx` — mount inside a `CommandRegistryProvider`, assert command appears, run it, assert `setClaudeSurface` called with the toggled value.

### Step 7 — Verify

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
```

### Step 8 — Commit

```bash
git add src/app/knowledge_base/features/terminal/TerminalDrawer.tsx src/app/knowledge_base/features/terminal/TerminalDrawer.test.tsx src/app/knowledge_base/features/terminal/registerSurfaceCommand.ts src/app/knowledge_base/features/terminal/registerSurfaceCommand.test.tsx src/app/knowledge_base/features/claude/ClaudeDrawer.tsx src/app/knowledge_base/features/claude/ClaudeDrawer.test.tsx src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx src/app/knowledge_base/knowledgeBase.tsx
git commit -m "$(cat <<'EOF'
feat(claude): ClaudeDrawer surface picker + TerminalDrawer + palette toggle (mvp-3.5 task 9)

ClaudeDrawer reads claude.surface and renders TerminalDrawer (default) or
ClaudeChatDrawer (parked). useSkillBootstrap and the install/error toasts
move here so they fire regardless of surface. RegisterSurfaceCommand adds
"Toggle Claude surface (Terminal ↔ Chat)" to the existing CommandRegistry
palette and notifies the parent on flip.

knowledgeBase.tsx mounts <ClaudeDrawer/> instead of <ClaudeChatDrawer/>.
ClaudeChatDrawer no longer owns the skill-bootstrap hook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Footer cleanup + `ChatToggleButton` → `DrawerToggleButton` rename

**Goal:** Remove `<ClaudeStatusLine />` from the footer entirely. Rename `ChatToggleButton` to `DrawerToggleButton`, change its label, gate pulse-on-streaming to `claude.surface === 'chat'`.

**Files:**
- Modify: `src/app/knowledge_base/shell/Footer.tsx`
- Modify: `src/app/knowledge_base/shell/Footer.test.tsx`
- Rename + modify: `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx` → `DrawerToggleButton.tsx`
- Rename + modify: `src/app/knowledge_base/shell/footer/ChatToggleButton.test.tsx` → `DrawerToggleButton.test.tsx`

### Step 1 — Rename the toggle button

```bash
git mv src/app/knowledge_base/shell/footer/ChatToggleButton.tsx \
       src/app/knowledge_base/shell/footer/DrawerToggleButton.tsx
git mv src/app/knowledge_base/shell/footer/ChatToggleButton.test.tsx \
       src/app/knowledge_base/shell/footer/DrawerToggleButton.test.tsx
```

Then edit the new file. Update:
- Component export: `export function DrawerToggleButton(...) { ... }`
- Visible label: `"Open chat"` → `"Open Claude"` (and matching `aria-label`).
- Pulse-on-streaming: read `claude.surface` via `getClaudeSurface` lazily (or via a passed prop), and gate the pulse: `const shouldPulse = surface === 'chat' && isStreaming;`. Default to no-pulse for terminal mode.

If the simplest gating is "always pulse when `useChat().isStreaming` is true and the surface happens to be chat", you can read the surface once on mount and stash it in state — but this introduces a stale-state risk. Cleanest: pass surface as a prop from the parent (`Footer.tsx`) which already knows.

`DrawerToggleButton.test.tsx` — update import + component name. Existing tests should still pass with the rename.

### Step 2 — Edit `Footer.tsx`

Read the current Footer. Remove:
- The `<ClaudeStatusLine />` import.
- The `<ClaudeStatusLine />` render call.

Update:
- Replace `<ChatToggleButton />` with `<DrawerToggleButton surface={surface} />`.
- Footer reads `surface` once via `getClaudeSurface()` (in a `useEffect`) and re-fetches when the palette command flips it. The cheapest cross-component sync: lift `surface` into a context shared by `ClaudeDrawer` + `Footer`, OR have both read it independently and a `surface_changed` window event that both subscribe to.

Pragmatic approach: a tiny `SurfaceContext` (~20 LOC) in `src/app/knowledge_base/features/claude/SurfaceContext.tsx` that exposes `{ surface, setSurface }`. Provider mounted alongside `ChatProvider` in `knowledgeBase.tsx`. `ClaudeDrawer` uses it; `Footer` consumes it via `useSurface()`.

### Step 3 — `SurfaceContext.tsx` (new)

```typescript
"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getClaudeSurface, type ClaudeSurface } from "../../infrastructure/settingsStore";

interface Value {
  surface: ClaudeSurface;
  setSurface: (next: ClaudeSurface) => void;
}

const SurfaceContext = createContext<Value | null>(null);

export function SurfaceProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<ClaudeSurface>("terminal");
  useEffect(() => {
    void getClaudeSurface().then(setSurface);
  }, []);
  return (
    <SurfaceContext.Provider value={{ surface, setSurface }}>
      {children}
    </SurfaceContext.Provider>
  );
}

export function useSurface(): Value {
  const ctx = useContext(SurfaceContext);
  if (!ctx) throw new Error("useSurface must be used inside <SurfaceProvider>");
  return ctx;
}
```

Add `<SurfaceProvider>` to `knowledgeBase.tsx`'s provider stack (sibling of `ChatProvider`). Update `ClaudeDrawer.tsx` and `RegisterSurfaceCommand` to use `useSurface()` instead of local `useState`.

### Step 4 — Update `Footer.test.tsx`

Drop the `<ClaudeStatusLine />` assertion. Add an assertion that `<DrawerToggleButton />` renders with the new label.

### Step 5 — Verify

```bash
npm run typecheck && npm run lint && npm run test:run && npm run build
# Expected: full suite green; ChatToggleButton tests pass under the new name; ClaudeStatusLine tests still pass on their own (file is parked).
```

### Step 6 — Commit

```bash
git add src/app/knowledge_base/shell/Footer.tsx src/app/knowledge_base/shell/Footer.test.tsx src/app/knowledge_base/shell/footer/DrawerToggleButton.tsx src/app/knowledge_base/shell/footer/DrawerToggleButton.test.tsx src/app/knowledge_base/features/claude/SurfaceContext.tsx src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/features/claude/ClaudeDrawer.tsx src/app/knowledge_base/features/terminal/registerSurfaceCommand.ts
git commit -m "$(cat <<'EOF'
feat(claude): footer cleanup + DrawerToggleButton rename + SurfaceContext (mvp-3.5 task 10)

Footer no longer renders ClaudeStatusLine — the embedded terminal exposes
its own status bar via claude's TUI. ClaudeStatusLine.tsx and its tests
stay in tree for the parked chat surface.

ChatToggleButton renamed to DrawerToggleButton ("Open Claude" label).
Pulse-on-streaming gated on surface === 'chat' (no-op for terminal).

Lightweight SurfaceContext (read once on mount) shared between
ClaudeDrawer (renders the right surface), Footer (gates the pulse), and
RegisterSurfaceCommand (flips the value).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Chat-UI bug fixes (3 small fixes for the parked surface)

**Goal:** Apply the three fixes from spec § 5 so the chat surface stays usable when toggled to.

**Files:**
- Modify: `src-tauri/src/skill/commands.rs` (Fix 1)
- Modify: `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx` (Fix 2)
- Modify: `src/app/knowledge_base/features/claude/components/SkillInstallToast.test.tsx`
- Modify: `src/app/knowledge_base/features/claude/components/MessageList.tsx` (Fix 3)
- Modify: `src/app/knowledge_base/features/claude/components/MessageList.test.tsx`

### Step 1 — Fix 1: dev-mode skill bootstrap fallback

Edit `src-tauri/src/skill/commands.rs::bundled_path`:

```rust
fn bundled_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    let prod = resource_dir.join("_up_").join("skills").join(name);
    if prod.join("SKILL.md").exists() {
        return Ok(prod);
    }
    // Dev-mode fallback: tauri dev's resource_dir doesn't include bundled
    // resources. CARGO_MANIFEST_DIR is the workspace's src-tauri/ at compile
    // time. Resolve from there.
    #[cfg(debug_assertions)]
    {
        let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("skills")
            .join(name);
        if dev.join("SKILL.md").exists() {
            return Ok(dev);
        }
    }
    Ok(prod) // production-style path; install will error with a clear message
}
```

### Step 2 — Fix 2: error-variant `SkillInstallToast`

Edit `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx`:

```typescript
import { useEffect, useState } from "react";

interface Props {
  show: boolean;
  message?: string;
  /** 'success' (default) — green/neutral; 'error' — red + role="alert" */
  tone?: 'success' | 'error';
}

export function SkillInstallToast({
  show,
  message = "knowledge-base skill installed.",
  tone = 'success',
}: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;
  const isError = tone === 'error';
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live="polite"
      className={
        "absolute right-4 top-4 z-50 rounded-md px-3 py-2 text-xs shadow-lg " +
        (isError
          ? "border border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400"
          : "border border-line bg-surface-2 text-ink")
      }
    >
      {message}
    </div>
  );
}
```

Tests: extend `SkillInstallToast.test.tsx` with two cases:

```typescript
it("SKILLS-13.1-08: error tone renders role=alert with red styling", () => {
  render(<SkillInstallToast show tone="error" message="boom" />);
  expect(screen.getByRole("alert")).toHaveTextContent("boom");
});

it("SKILLS-13.1-09: error tone still auto-dismisses after 3 s", () => {
  render(<SkillInstallToast show tone="error" message="boom" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  act(() => { vi.advanceTimersByTime(3000); });
  expect(screen.queryByRole("alert")).toBeNull();
});
```

### Step 3 — Fix 3: thinking indicator in `MessageList`

Read `MessageList.tsx`. After the existing turns map (and before any closing tag), add:

```typescript
{isStreaming && (turns.length === 0 || latestTurnIsEmpty(turns)) && (
  <div
    className="flex items-center gap-2 px-3 py-2 text-xs text-mute"
    data-testid="thinking-indicator"
  >
    <span className="animate-pulse">●●●</span>
    <span>Claude is thinking…</span>
  </div>
)}
```

Add the `latestTurnIsEmpty` helper at the bottom of the file:

```typescript
function latestTurnIsEmpty(turns: Turn[]): boolean {
  const last = turns.at(-1);
  if (!last || last.role !== "assistant") return true; // user just sent
  const blocks = last.contentBlocks ?? [];
  if (blocks.length === 0) return true;
  return blocks.every((b) => b.type === "text" && b.text.trim().length === 0);
}
```

Adjust types to match the existing `Turn` shape (read `features/claude/types.ts` for the actual property names).

`MessageList` props: pass `isStreaming` from the consumer. Update consumers (`ClaudeChatDrawer.tsx`) — `isStreaming` is already in scope from `useChat()`, so pass it explicitly: `<MessageList turns={turns} isStreaming={isStreaming} />`.

Tests: extend `MessageList.test.tsx`:

```typescript
it("CHAT-12.2-XX: shows thinking indicator while streaming with no content", () => {
  render(<MessageList turns={[]} isStreaming />);
  expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
});

it("CHAT-12.2-YY: hides thinking indicator once content arrives", () => {
  const turns = [{ role: "assistant", contentBlocks: [{ type: "text", text: "hello" }] }];
  render(<MessageList turns={turns} isStreaming />);
  expect(screen.queryByTestId("thinking-indicator")).toBeNull();
});

it("CHAT-12.2-ZZ: hides thinking indicator when not streaming", () => {
  render(<MessageList turns={[]} isStreaming={false} />);
  expect(screen.queryByTestId("thinking-indicator")).toBeNull();
});
```

Pick free CHAT-12.2-NN IDs by reading `test-cases/12-claude-chat.md`.

### Step 4 — Verify

```bash
cd src-tauri && cargo build && cargo test
npm run typecheck && npm run lint && npm run test:run && npm run build
```

### Step 5 — Commit

```bash
git add src-tauri/src/skill/commands.rs src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx src/app/knowledge_base/features/claude/components/SkillInstallToast.test.tsx src/app/knowledge_base/features/claude/components/MessageList.tsx src/app/knowledge_base/features/claude/components/MessageList.test.tsx src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx
git commit -m "$(cat <<'EOF'
fix(claude): three chat-UI bug fixes for the parked surface (mvp-3.5 task 11)

1. skill::commands::bundled_path falls back to env!("CARGO_MANIFEST_DIR")/
   ../skills/<name>/ in debug builds when the resource_dir path is missing
   SKILL.md. Toast now fires correctly in `tauri dev`.

2. SkillInstallToast accepts tone='success'|'error'. Error variant uses
   role=alert + red border. ClaudeDrawer (Task 9) renders the error toast
   when useSkillBootstrap.error !== null.

3. MessageList shows a "Claude is thinking…" pulsing-dot row while
   isStreaming is true and the latest assistant turn has no rendered
   content. Closes the latency-without-signal gap.

Tests: 2 SkillInstallToast (error tone / auto-dismiss), 3 MessageList
(thinking shown / hidden on content / hidden when not streaming).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Features.md + `test-cases/14-terminal.md` sweep

**Goal:** Catalogue the new terminal surface in Features.md, demote chat-surface bullets, create the test-cases bucket.

**Files:**
- Modify: `Features.md`
- Create: `test-cases/14-terminal.md`
- Modify: `test-cases/01-app-shell.md` (cross-reference for `<DrawerToggleButton>` rename)
- Modify: `test-cases/12-claude-chat.md` (demotion note)
- Modify: `test-cases/README.md` (register §14)

### Step 1 — Discovery

```bash
grep -n "Skill bootstrap\|Slash-command palette\|Skills sheet\|Claude chat surface\|ClaudeStatusLine\|ChatToggleButton" Features.md
grep -n "^## §11\|^## 11\|^### §11\|^### 11\." Features.md
```

Read the existing §11 structure to know how to insert.

### Step 2 — Features.md edits

Add a new top-level subsection §11.0 (or before existing §11.1) for the terminal surface, and **demote** the existing chat-surface entries with a "(secondary)" suffix:

```markdown
### §11.0 Claude terminal surface (primary, default)

- **Embedded terminal** — `zsh -i -l` PTY running in the active vault directory, with `claude` auto-launched. Backed by `portable-pty` + xterm.js. PTY persists across drawer toggles; vault switch sends Ctrl-C + cd + claude restart in-place.
  - `src/app/knowledge_base/features/terminal/TerminalSurface.tsx`
  - `src/app/knowledge_base/features/terminal/TerminalDrawer.tsx`
  - `src/app/knowledge_base/features/terminal/hooks/{useTerminalSession,useTerminalResize}.ts`
  - Backed by Rust `term_open` / `term_write` / `term_resize` / `term_close` in `src-tauri/src/term/`.
- **Login-shell PATH inheritance** — `/bin/zsh -ilc env` capture at app boot merges the user's dotfile-defined PATH into the process so claude (and any user-installed binaries) resolve correctly.
  - `src-tauri/src/env_bootstrap.rs`
- **Surface toggle** — `claude.surface: 'terminal' | 'chat'` setting (default `'terminal'`). Exposed via the existing CommandRegistry palette as "Toggle Claude surface".
  - `src/app/knowledge_base/features/terminal/registerSurfaceCommand.ts`
  - `src/app/knowledge_base/features/claude/SurfaceContext.tsx`
- **Drawer surface picker** — `ClaudeDrawer` reads `claude.surface` and renders TerminalDrawer (default) or ClaudeChatDrawer (parked).
  - `src/app/knowledge_base/features/claude/ClaudeDrawer.tsx`

### §11.1 Claude chat surface (secondary, parked)

[existing bullets stay with a one-line lead-in noting they're now the secondary surface]
```

(Adjust headings to match Features.md's actual numbering convention.)

Update §7 persistence table: add `claude.surface` row alongside the existing `claude.permissionMode`. Rename the `claudeChat.height` row to `claudeDrawer.height`.

### Step 3 — `test-cases/14-terminal.md`

```markdown
# 14 Terminal

The embedded terminal surface — `zsh -i -l` PTY running `claude` in the active vault directory. MVP-3.5 surface — see `Features.md` §11.0 and `docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md` for the spec.

## TERM-14.1 Lifecycle + bridge

- TERM-14.1-01 ✅ useTerminalSession skips open when vaultPath null.
- TERM-14.1-02 ✅ useTerminalSession skips open when term null.
- TERM-14.1-03 ✅ useTerminalSession calls termOpen with rows/cols once both ready.
- TERM-14.1-04 ✅ useTerminalSession re-opens on vaultPath change.
- TERM-14.1-05 ✅ TerminalSurface renders the container with role="region".

## TERM-14.2 Drawer + surface picker

- TERM-14.2-01 ✅ ClaudeDrawer defaults to terminal surface when setting unset.
- TERM-14.2-02 ✅ ClaudeDrawer renders TerminalDrawer when surface='terminal'.
- TERM-14.2-03 ✅ ClaudeDrawer renders ClaudeChatDrawer when surface='chat'.
- TERM-14.2-04 ✅ TerminalDrawer renders nothing when isOpen=false.
- TERM-14.2-05 ✅ TerminalDrawer Esc closes (without exiting fullscreen).

## TERM-14.3 Surface toggle command

- TERM-14.3-01 ✅ "Toggle Claude surface" appears in the command palette under Claude group.
- TERM-14.3-02 ✅ Running the command flips claude.surface terminal ↔ chat.
- TERM-14.3-03 ✅ Surface flip propagates to ClaudeDrawer + Footer via SurfaceContext.

## TERM-14.4 Vault-switch behavior

- TERM-14.4-01 🚫 Real PTY in-place restart on vault change — deferred to MVP-4 integration coverage. Unit-level: shell_escape (3 cargo cases).

## TERM-14.5 Settings + key migration

- SETTINGS-7.X-01 ✅ getClaudeSurface defaults to 'terminal' when unset.
- SETTINGS-7.X-02 ✅ getClaudeDrawerHeight reads new key when present.
- SETTINGS-7.X-03 ✅ getClaudeDrawerHeight migrates ui.claudeChat.height → ui.claudeDrawer.height write-forward.
- SETTINGS-7.X-04 ✅ getClaudeDrawerHeight defaults to 320 when both keys absent.

## TERM-14.6 Footer cleanup + rename

- SHELL-1.6-XX ✅ Footer no longer renders ClaudeStatusLine.
- SHELL-1.6-YY ✅ DrawerToggleButton replaces ChatToggleButton with "Open Claude" label.
```

Pick free SHELL- IDs by reading `test-cases/01-app-shell.md`.

### Step 4 — Cross-references

`test-cases/01-app-shell.md`: add a one-line note where ChatToggleButton is mentioned: "Renamed `<DrawerToggleButton>` per MVP-3.5 — see `test-cases/14-terminal.md`."

`test-cases/12-claude-chat.md`: add a header note: "Chat surface is the **secondary** surface as of MVP-3.5. The default is the embedded terminal — see `test-cases/14-terminal.md`."

`test-cases/README.md`: register §14 in the index table.

### Step 5 — Verify

```bash
grep -rn "TERM-14" test-cases/  # confirm IDs present, no orphans
npm run test:run                # docs-only, should still be green
```

### Step 6 — Commit

```bash
git add Features.md test-cases/14-terminal.md test-cases/01-app-shell.md test-cases/12-claude-chat.md test-cases/README.md
git commit -m "$(cat <<'EOF'
docs(mvp-3.5): Features.md §11.0 + test-cases/14-terminal.md (mvp-3.5 task 12)

Catalogues the embedded terminal surface in Features.md as the primary
Claude UI (§11.0). Existing chat-surface bullets demoted to §11.1 with a
"secondary, parked" note.

Creates test-cases/14-terminal.md indexing TERM-14.1 (lifecycle), TERM-
14.2 (drawer surface picker), TERM-14.3 (toggle command), TERM-14.4
(vault-switch — defer-to-MVP-4 line), TERM-14.5 (settings migration),
TERM-14.6 (footer rename). Cross-references in 01-app-shell.md +
12-claude-chat.md. README.md registers §14.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Full local verification + open the PR

**Goal:** Run every CI gate, confirm Tauri bundle includes both the skill resources (MVP-3 carry-over) and the new terminal module compiles + bundles. Open the PR with the structured body.

**Files:** none changed (verification only).

### Step 1 — Verification commands

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git status                              # clean tree
git log --oneline e6dc514..HEAD         # 12 commits expected (Tasks 1-12)

nvm use
npm ci

npm run typecheck                       # clean
npm run lint                            # 76 baseline warnings, 0 errors expected
npm run test:run                        # baseline 2615 + ~25 new = ~2640 passed
npm run build                           # clean Next.js export

cd src-tauri
cargo test                              # 75 lib + 4 watcher_integration = 79 passed
cd ..

npm run tauri:build                     # ~2-5 min, produces .app + .dmg

# Bundle sanity
find src-tauri/target/release/bundle -name "SKILL.md" | head -3
ls "src-tauri/target/release/bundle/macos/Knowledge Base.app/Contents/Resources/_up_/skills/knowledge-base/SKILL.md"
```

### Step 2 — Manual smoke (user runs)

10 steps from spec § 7 — paste verbatim into the PR body so reviewers + you have the same checklist.

### Step 3 — Push + open PR

```bash
git push -u origin feat/tauri-mvp35-embedded-terminal

gh pr create \
  --title "feat(tauri): MVP-3.5 — embedded terminal as primary Claude surface" \
  --body "$(cat <<'EOF'
## Summary

- **Embedded terminal** as primary Claude surface — `zsh -i -l` PTY running `claude` in the active vault, via `portable-pty` (Rust) + `xterm.js` 5.5 (frontend). PTY persists across drawer toggles; vault switch sends Ctrl-C + `cd` + `claude\n` to the existing master writer (same PTY, same scrollback).
- **Surface toggle** — `claude.surface: 'terminal' | 'chat'` setting (default `'terminal'`). Exposed via the existing `CommandRegistry` palette as "Toggle Claude surface (Terminal ↔ Chat)".
- **Footer cleanup** — `<ClaudeStatusLine />` removed; claude's TUI status bar replaces it. `<ChatToggleButton />` renamed `<DrawerToggleButton />` ("Open Claude").
- **Login-shell PATH inheritance** — `/bin/zsh -ilc env` captured at app boot, merged into process env. Fixes both the new terminal AND MVP-2's existing `which::which("claude")`.
- **Three small fixes for the parked chat surface** so it stays usable when toggled to: dev-mode skill-bootstrap fallback, error-variant install toast, "Claude is thinking…" indicator.
- **Drawer-height key rename** — `ui.claudeChat.height` → `ui.claudeDrawer.height` with one-shot read-time migration.
- **Skill bootstrap** moves from `ClaudeChatDrawer` to `ClaudeDrawer` so it fires regardless of surface.

## Anti-goals (out of scope)

- Multiple parallel terminal sessions / tabs.
- Terminal scrollback persistence across app restarts.
- Custom shell selection (always `zsh -i -l`).
- Splitting the terminal pane.
- Removing MVP-2's `claude_send` / `claude_interrupt` / `claude_reset` (parked).
- Test infrastructure (still MVP-4) and test promotion (still MVP-5).

## Architecture surface

**New (Rust):** `src-tauri/src/term/{mod,pty,commands.rs}` (4 new commands → 26 total) + `src-tauri/src/env_bootstrap.rs`. `portable-pty 0.8` added.

**New (frontend):** `src/app/knowledge_base/features/terminal/{TerminalSurface,TerminalDrawer,registerSurfaceCommand,theme}.{tsx,ts}` + `hooks/{useTerminalSession,useTerminalResize}.ts`. `src/app/knowledge_base/features/claude/{ClaudeDrawer,SurfaceContext}.tsx`. `@xterm/xterm 5.5` + `@xterm/addon-fit 0.10` + `@xterm/addon-web-links 0.11` added.

**Modified (frontend):** `tauriBridge.ts` (4 new wrappers + `subscribeTermEvent`), `settingsStore.ts` (`claude.surface` + height key migration), `useDrawerState.ts` (renamed accessor calls), `Footer.tsx` (status line removed), `footer/DrawerToggleButton.tsx` (renamed), `ClaudeChatDrawer.tsx` (`useSkillBootstrap` extracted out), `MessageList.tsx` (thinking indicator), `SkillInstallToast.tsx` (error variant).

**Modified (Rust):** `lib.rs` + `main.rs` (state + handlers + env bootstrap call), `settings/store.rs` (settings struct + migration), `skill/commands.rs` (dev-mode fallback).

## Plan-level decisions (pinned)

- PTY persists across drawer toggles; only dies on app quit or vault-switch (in-place restart).
- xterm re-instantiates blank on remount — scrollback persistence deferred.
- Surface toggle accessed via the command palette; no footer or VaultSwitcher entry.
- `dirs::home_dir()` already resolves the skill install target (MVP-3 carry-over).
- Login-shell PATH capture is best-effort; failures are logged-and-swallowed.

## Test plan

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean (76 pre-existing warnings)
- [ ] `npm run test:run` — ~2640 passed (baseline 2615 + ~25 new)
- [ ] `npm run build` clean
- [ ] `cargo test` — 79 passed (lib + watcher_integration; Task 1 env_bootstrap +4, Task 5 shell_escape +3)
- [ ] `npm run tauri:build` — `.app` + `.dmg` produced; `_up_/skills/knowledge-base/SKILL.md` still present in bundle
- [ ] **Manual smoke (run before merge):**
  1. Launch app → open vault → open drawer → confirm `zsh` prompt + `claude` auto-launches in vault cwd.
  2. Run `pwd` after Ctrl-C'ing claude → confirm vault path.
  3. Resize drawer height → confirm claude TUI re-flows.
  4. Send `/kb document foo` → confirm new file appears in FileExplorer.
  5. Switch vault → confirm Ctrl-C / cd / claude restart sequence visible in real time.
  6. Cmd-K → "Toggle Claude surface" → confirm chat UI works, install toast fires (dev-mode fallback), thinking indicator appears during latency.
  7. Toggle back to terminal → confirm same PTY state preserved.
  8. Quit + relaunch → confirm fresh terminal spawns.
  9. Esc inside terminal closes drawer + does NOT exit fullscreen.
  10. Without `claude` on PATH (rename binary out temporarily) → confirm zsh still spawns, "command not found" appears.

## Spec + plan

- Spec: `docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-tauri-mvp35-embedded-terminal-plan.md`
- Parent spec § 7 amended with a pivot note pointing to MVP-3.5.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 4 — Report PR URL

Capture the URL gh prints; share with the user.

---

## Self-Review (against spec)

| Spec section | Plan task |
|---|---|
| § 1 Why | Plan preamble |
| § 2 Goals | Tasks 1–12 |
| § 3 Non-goals | Anti-goals block at top |
| § 4.1 Rust term module | Tasks 2–5 |
| § 4.2 PATH inheritance | Task 1 |
| § 4.3 Frontend xterm | Tasks 6–7 |
| § 4.4 ClaudeDrawer surface picker | Task 9 |
| § 4.5 Settings + key migration | Task 8 |
| § 4.6 Footer cleanup | Task 10 |
| § 4.7 Lifecycle | Tasks 3 + 5 (covered in code paths) |
| § 4.8 Vault-switch sequence | Task 5 |
| § 4.9 Scrollback trade-off | Documented; no task (acceptance) |
| § 5.1–5.3 Bug fixes | Task 11 |
| § 6 Test pyramid | Tasks 1, 5, 7, 8, 9, 10, 11 |
| § 7 Verification | Task 13 |
| § 8 Cross-reference parent spec | Already in seed commit (e6dc514) |
| § 9 Open follow-up items | PR body / future work |

All sections covered. Type consistency check: `useTerminalSession` / `useTerminalResize` / `TerminalSurface` / `TerminalDrawer` / `ClaudeDrawer` / `SurfaceContext` / `useSurface` are referenced consistently across Tasks 7, 9, 10. `ClaudeSurface` enum used consistently in Task 8 + 9 + 10. PTY lifecycle (`spawn` / `restart_in_new_vault` / `close`) named consistently in Tasks 3 + 5.

No placeholders, no TBD, no "implement appropriate error handling".
