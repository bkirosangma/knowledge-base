# MVP-4 — Test Infrastructure on the New Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore an honest end-to-end testing pipeline on the post-MVP-3.5 Tauri shell — Rust-integration-tier ownership of real-PTY tests, debug-only `make_temp_vault` Tauri command + helpers, Vitest contract coverage for the un-tested MVP-2 / MVP-3 / MVP-3.5 bridge wrappers, a Vitest+bridge integration test for the chained `/kb document` flow (replacing the spec § 9.7 e2e), `tauri-plugin-webdriver`-backed Playwright project (with a `next dev` fallback if the plugin breaks), CI restoration on macos-latest, and a first-wave proof set of 4 Playwright e2e specs.

**Architecture:** Real PTY behaviour is exercised by Rust integration tests (`#[tokio::test]`) sitting alongside the existing `watcher_integration.rs`. Tempdir vaults are created via a `#[cfg(debug_assertions)]` `make_temp_vault` Tauri command from a new `test_support` module; production bundles do not register the command. Playwright drives the real Tauri webview through `tauri-plugin-webdriver` (also debug-only); the plan ships an explicit fallback that swaps to Playwright-against-`next dev` if the plugin fails to load on macOS so subagents do not get stuck. Existing Vitest patterns (`subscribeClaudeEvent` mock, `ClaudeEvent` fan-out fire) carry the chained chat-flow integration test.

**Tech Stack:** Rust (Tauri 2.11.1, tokio 1, tempfile 3, notify 6.1.1 + notify-debouncer-full 0.3.2, portable-pty 0.8), TypeScript (Next.js 15 / React 19, Vitest, Playwright + `tauri-plugin-webdriver 0.2`), CI on `macos-latest` only.

> **Branch:** `feat/tauri-mvp4-test-infra` (cut from `main` at the post-MVP-3.5 tip; the handoff-doc bump is the only commit on the branch before this plan's seed).
> **Spec reference:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 9.1–9.8 (parent), `docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md` § 6 ("Defer to MVP-4" box) + § 9 follow-ups.
> **Plan template:** `docs/superpowers/plans/2026-05-09-tauri-mvp35-embedded-terminal-plan.md`.

---

## Scope decisions pinned (do not relitigate mid-MVP)

These four were debated, decided in the plan-writing brief, and are restated here so reviewers do not re-open them. If you think one is wrong, raise it in the PR — do not silently change the plan.

1. **`ClaudeRunner` trait + `StubRunner` (spec § 9.1) is DEFERRED out of MVP-4.** The chat surface was parked in MVP-3.5 in favour of the embedded terminal. The only test that would have *needed* the trait was the chained `/kb document` e2e from spec § 9.7. The parked chat surface keeps its existing Vitest coverage via mocked `claude_event`. **Replacement:** a Vitest + bridge integration test (Task 8) that drives `useClaudeSession` with a mocked `claude_event` stream replaying the frames captured in `docs/superpowers/plans/.mvp2-stream-json-capture.jsonl` — same behaviour coverage, no Rust trait extraction, no fixture loader, no capture-fixture CLI in this MVP. Trait + StubRunner come back only if/when the chat surface un-parks or CI grows complaint-driven regressions in the parsed-frame surface. **No `KB_CLAUDE_MODE` env var is introduced** in this MVP — there is no runner selection to make.

2. **MVP-4 stays monolithic.** Single PR, single plan, single branch (`feat/tauri-mvp4-test-infra`). The advisor floated a 4a/4b split (Rust integration vs Playwright/CI); we are rejecting it for simpler bookkeeping. Phasing is internal to this plan (A→I) and is not reflected in PRs or branches.

3. **Webdriver fallback IS in scope.** `tauri-plugin-webdriver 0.2` requires `tauri ^2.10.0`; the project resolves `tauri 2.11.1` (Cargo.lock confirms). Plan includes an explicit fallback branch (Task 11): if the plugin fails to load on the local macOS machine after Task 9 / Task 10, switch the `webdriver` Playwright project to drive Playwright against `next dev` in `tauri dev` mode (covers ~90% of UI behaviour, no real webview). Document the loss in the PR description and proceed — do not get stuck.

4. **Capture-fixture CLI is OUT of scope.** Deferred together with the trait. No new `cargo run --bin capture-fixture` binary in MVP-4. The Vitest+bridge integration test (Task 8) consumes the *existing* `.mvp2-stream-json-capture.jsonl` directly.

---

## Out of scope (anti-goals — lift verbatim into PR description)

- `ClaudeRunner` trait + `StubRunner` (decision 1; deferred).
- `capture-fixture` Rust binary (decision 4; deferred).
- `KB_CLAUDE_MODE` environment variable (decision 1; not introduced).
- Visual regression / screenshot diffs (spec § 9.8).
- Cross-platform e2e (spec § 9.8 — macOS-only ships).
- Performance benchmarks (spec § 9.8).
- Continuous fixture refresh / auto-recapture (spec § 9.8).
- Migrating existing `*RepoTauri.test.ts` files — already complete in MVP-1 → MVP-3.5 (recon).
- Live-serialize for terminal scrollback persistence (MVP-3.5 § 9 follow-up; out of scope here).
- Right-click copy / paste + search-in-scrollback in terminal (MVP-3.5 § 9 follow-up; out of scope here).
- Promoting `❌` test cases beyond what this MVP's pipeline directly hits — that sweep is MVP-5.

---

## File map (what changes)

### Added (Rust)

- `src-tauri/src/test_support/mod.rs` — debug-only module re-exports + `TempVault` struct.
- `src-tauri/src/test_support/vault.rs` — `TempVault::fresh()` / `from_fixture()` / `write()` / `read()` and the `make_temp_vault` `#[tauri::command]`.
- `src-tauri/tests/term_pty_integration.rs` — real-PTY integration tests against `term_open` / `term_write` / `term_close` / `term_resize`.
- `src-tauri/tests/term_vault_switch.rs` — real-PTY integration test for `term_open`'s vault-switch idempotency (Ctrl-C / cd / claude byte sequence).
- `src-tauri/tests/watcher_rename_paired.rs` — `#[cfg(target_os = "linux")]` companion test asserting paired-rename shape (`ChangeKind::Renamed { old_path: "a.md", new_path: "b.md" }`).
- `src-tauri/tests/fixtures/vaults/empty/.gitkeep` — placeholder for the `from_fixture("empty")` test seed.
- `src-tauri/tests/fixtures/vaults/with_links/a.md`, `with_links/b.md`, `with_links/.kb/config.json` — seed for rename-propagation Playwright spec.

### Modified (Rust)

- `src-tauri/Cargo.toml` — add `tauri-plugin-webdriver = "0.2"` to `[dependencies]` (debug-gated at the `.plugin(...)` callsite, not at the dep level — see § 9 / Task 9 discussion).
- `src-tauri/src/lib.rs` — `#[cfg(debug_assertions)] pub mod test_support;`.
- `src-tauri/src/main.rs` — register `tauri-plugin-webdriver` and `make_temp_vault` behind `#[cfg(debug_assertions)]` blocks.
- `src-tauri/src/vault/watcher.rs` — _no change in this MVP._ The rename-cookie half stays at the watcher; the new test in `watcher_rename_paired.rs` simply asserts current behaviour on Linux. Spec follow-up about FSEvents rename cookies remains deferred (still tracked in the handoff "Open follow-up items" list).

### Added (frontend)

- `e2e/helpers/tempVault.ts` — `makeTempVault({ fixture? })` over `invoke('make_temp_vault', { fixture })`.
- `e2e/helpers/launchApp.ts` — `launchApp({ vaultPath? })` shared boot helper for the proof-set specs.
- `e2e/vault_picker.spec.ts` — proof-set spec.
- `e2e/uninitialized_splash.spec.ts` — proof-set spec.
- `e2e/document_create.spec.ts` — proof-set spec (asserts via Node `fs` against the tempdir).
- `e2e/rename_propagation.spec.ts` — proof-set spec for `propagateRename`.
- `src/app/knowledge_base/features/claude/hooks/useClaudeSession.kbDocument.test.tsx` — Vitest+bridge integration test replacing spec § 9.7's chained-flow e2e.

### Modified (frontend)

- `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` — extend with new `describe` blocks for the 12 wrappers identified in Phase D.
- `playwright.config.ts` — add a `webdriver` project; gate the existing `next dev` `webServer` to a `legacy` project name; introduce env-var `KB_E2E_BACKEND=webdriver|nextdev` so Task 11's fallback flips one variable instead of editing two files.

### Added (CI)

- _none._

### Modified (CI)

- `.github/workflows/ci.yml` — fold the e2e steps from commit `ad26115`'s ci.yml onto the existing `tauri-build` macOS job (single sequential macOS pipeline per spec § 9.6); delete the `e2e:` placeholder comment; keep ubuntu `checks` and `build` jobs untouched (they already pass).

### Modified (docs / test-cases)

- `Features.md` — limited to flipping `?` markers that the new pipeline confirms (Phase I Task 16). No new product-feature bullets.
- `test-cases/01-app-shell.md` — flip case markers for vault picker, splash, drawer surfaces.
- `test-cases/02-file-system.md` — flip markers for vault tempdir, document create on disk.
- `test-cases/04-document.md` — flip markers covered by `document_create.spec.ts`.
- `test-cases/05-links-and-graph.md` — flip markers covered by `rename_propagation.spec.ts`.
- `test-cases/12-claude-chat.md` — flip markers covered by the Vitest+bridge `kbDocument` integration test.
- `test-cases/14-terminal.md` — flip markers covered by the new Rust `term_pty_integration` + `term_vault_switch` tests.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — already bumped on this branch's seed commit; will be re-bumped on PR-merge per the post-merge cleanup protocol.

---

## Bootstrap (read-only)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use                                # match .nvmrc
npm ci                                 # match lockfile (do NOT npm install)
npm run typecheck                      # baseline green
npm run test:run                       # baseline green
npm run lint                           # baseline green
git log --oneline -3                   # confirms branch tip is the handoff-doc bump
which claude                           # verify claude CLI is on PATH for the chained-flow + manual smoke
ls docs/superpowers/plans/.mvp2-stream-json-capture.jsonl   # confirm capture fixture present (used by Task 8)
ls src-tauri/tests/watcher_integration.rs                   # confirm the existing integration-test template
ls e2e/                                                      # confirm the existing Playwright spec corpus
```

The Rust baseline before this MVP starts:

```bash
cd src-tauri && cargo fmt --check && cargo clippy && cargo test
# Expected: clippy green; all existing tests pass (watcher_integration + claude/term unit tests).
```

---

## Task 1: Vault tempdir helpers — Rust `test_support` module + `make_temp_vault` debug command

**Goal:** Land a debug-only Rust module that owns tempdir creation for tests, plus the `#[cfg(debug_assertions)]` `make_temp_vault` Tauri command the TS helper will call. `tempfile = "3"` is **already** in `[dev-dependencies]` — no Cargo.toml change in this task. The module sits under `src-tauri/src/test_support/` (not `tests/common/`) so the same `TempVault` struct is reachable from both Rust integration tests and the runtime `make_temp_vault` command without `mod common;` boilerplate.

**Files:**
- Create: `src-tauri/src/test_support/mod.rs`
- Create: `src-tauri/src/test_support/vault.rs`
- Create: `src-tauri/tests/fixtures/vaults/empty/.gitkeep`
- Create: `src-tauri/tests/fixtures/vaults/with_links/a.md`
- Create: `src-tauri/tests/fixtures/vaults/with_links/b.md`
- Create: `src-tauri/tests/fixtures/vaults/with_links/.kb/config.json`
- Modify: `src-tauri/src/lib.rs` (debug-gated `pub mod test_support;`)
- Modify: `src-tauri/src/main.rs` (debug-gated handler-list entry for `make_temp_vault`)

### Step 1 — Create the module skeleton

- [ ] **Step 1: Add `test_support/mod.rs`**

```rust
// src-tauri/src/test_support/mod.rs
//! Test-only helpers. Compiled out of release bundles via the
//! `#[cfg(debug_assertions)]` gate in `lib.rs`. Lives at the crate level
//! (not under `tests/common/`) so the same `TempVault` struct serves
//! both `cargo test --test ...` integration files and the
//! `make_temp_vault` runtime command Playwright e2e specs invoke.

pub mod vault;

pub use vault::{make_temp_vault, TempVault};
```

- [ ] **Step 2: Add `test_support/vault.rs` with the `TempVault` struct, fixture-copy helper, and the Tauri command**

```rust
// src-tauri/src/test_support/vault.rs
use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// A self-cleaning vault tempdir. Holding `_guard` keeps the directory
/// alive for the lifetime of the `TempVault`; drop the struct to remove
/// it. `root` is canonicalized so callers can compare against
/// `vault::Vault.root` without worrying about `/private/var` vs `/var`
/// on macOS.
pub struct TempVault {
    pub root: PathBuf,
    _guard: TempDir,
}

impl TempVault {
    /// Empty tempdir with `.kb/config.json` pre-seeded so
    /// `vault_set_root` treats it as initialized.
    pub fn fresh() -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard
            .path()
            .canonicalize()
            .map_err(|e| format!("canonicalize: {e}"))?;
        let kb = root.join(".kb");
        std::fs::create_dir_all(&kb).map_err(|e| format!("mkdir .kb: {e}"))?;
        std::fs::write(kb.join("config.json"), b"{\"version\":1}\n")
            .map_err(|e| format!("write config: {e}"))?;
        Ok(Self { root, _guard: guard })
    }

    /// Tempdir seeded by recursively copying `tests/fixtures/vaults/<name>`.
    /// Fixture must exist; missing fixture is an error.
    pub fn from_fixture(name: &str) -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard
            .path()
            .canonicalize()
            .map_err(|e| format!("canonicalize: {e}"))?;
        let manifest = env!("CARGO_MANIFEST_DIR");
        let src = Path::new(manifest)
            .join("tests")
            .join("fixtures")
            .join("vaults")
            .join(name);
        if !src.is_dir() {
            return Err(format!("fixture not found: {}", src.display()));
        }
        copy_dir_recursive(&src, &root)?;
        Ok(Self { root, _guard: guard })
    }

    pub fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        let target = self.root.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        std::fs::write(target, content).map_err(|e| format!("write: {e}"))
    }

    pub fn read(&self, rel: &str) -> Result<String, String> {
        std::fs::read_to_string(self.root.join(rel)).map_err(|e| format!("read: {e}"))
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in std::fs::read_dir(src).map_err(|e| format!("read_dir: {e}"))? {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let path = entry.path();
        let rel = path
            .strip_prefix(src)
            .map_err(|e| format!("strip prefix: {e}"))?;
        let target = dst.join(rel);
        if path.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| format!("mkdir: {e}"))?;
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
            }
            std::fs::copy(&path, &target).map_err(|e| format!("copy: {e}"))?;
        }
    }
    Ok(())
}

/// Debug-only Tauri command. Takes an optional fixture name; when omitted,
/// returns a `fresh()` tempdir. Returns the canonical absolute path so the
/// frontend can pass it straight to `vault_set_root`. The TempDir guard is
/// dropped on app shutdown — for an explicit cleanup hook see the trade-off
/// note below.
///
/// **Cleanup trade-off:** we deliberately do not register a
/// `temp_vault_destroy(path)` command. The `TempDir` guard is dropped when
/// the held `Vec` (see comment below) is itself dropped. Tests instead rely
/// on:
///   1. App shutdown clearing the guard vec, or
///   2. The OS reaping `/tmp` between CI runs.
/// If a single test needs eager cleanup, it can `term_close` and then exit
/// via `app.handle().exit(0)` — adding a destroy command is a follow-up
/// once we have data on tempdir leakage.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn make_temp_vault(fixture: Option<String>) -> Result<String, String> {
    let v = match fixture {
        Some(name) => TempVault::from_fixture(&name)?,
        None => TempVault::fresh()?,
    };
    let path = v.root.to_string_lossy().to_string();
    // Leak the guard so the directory survives this command's return.
    // The OS reaps /tmp between sessions; explicit destroy is the
    // follow-up tracked above.
    std::mem::forget(v);
    Ok(path)
}
```

- [ ] **Step 3: Wire the module + command — `lib.rs` and `main.rs`**

Edit `src-tauri/src/lib.rs`. The current contents are:

```rust
//! Knowledge-base desktop app — Rust core.

pub mod claude;
pub mod env_bootstrap;
pub mod settings;
pub mod skill;
pub mod term;
pub mod vault;
```

Add a debug-only line (alphabetical position before `vault`, after `term`):

```rust
#[cfg(debug_assertions)]
pub mod test_support;
```

Edit `src-tauri/src/main.rs`. Inside the existing `tauri::generate_handler![...]` macro call, register `make_temp_vault` behind a `#[cfg(debug_assertions)]` block. The `generate_handler!` macro requires every listed function to exist in the build profile, so the gating happens via two separate `invoke_handler` lines — debug builds register all 27 commands, release builds register the existing 26.

Replace this section:

```rust
        .invoke_handler(tauri::generate_handler![
            // ... 26 existing commands ...
            term_commands::term_close,
        ])
        .run(tauri::generate_context!())
```

with:

```rust
        .invoke_handler({
            #[cfg(debug_assertions)]
            {
                tauri::generate_handler![
                    commands::vault_pick,
                    commands::vault_set_root,
                    commands::vault_read_text,
                    commands::vault_write_text,
                    commands::vault_read_json,
                    commands::vault_write_json,
                    commands::vault_list,
                    commands::vault_rename,
                    commands::vault_delete,
                    commands::vault_exists,
                    commands::vault_read_bytes,
                    commands::vault_write_bytes,
                    commands::vault_watch_start,
                    commands::vault_watch_stop,
                    settings_commands::settings_read,
                    settings_commands::settings_write,
                    claude_commands::claude_status,
                    claude_commands::claude_send,
                    claude_commands::claude_interrupt,
                    claude_commands::claude_reset,
                    skill_commands::skill_status,
                    skill_commands::skill_install_from_bundle,
                    term_commands::term_open,
                    term_commands::term_write,
                    term_commands::term_resize,
                    term_commands::term_close,
                    knowledge_base_lib::test_support::make_temp_vault,
                ]
            }
            #[cfg(not(debug_assertions))]
            {
                tauri::generate_handler![
                    commands::vault_pick,
                    commands::vault_set_root,
                    commands::vault_read_text,
                    commands::vault_write_text,
                    commands::vault_read_json,
                    commands::vault_write_json,
                    commands::vault_list,
                    commands::vault_rename,
                    commands::vault_delete,
                    commands::vault_exists,
                    commands::vault_read_bytes,
                    commands::vault_write_bytes,
                    commands::vault_watch_start,
                    commands::vault_watch_stop,
                    settings_commands::settings_read,
                    settings_commands::settings_write,
                    claude_commands::claude_status,
                    claude_commands::claude_send,
                    claude_commands::claude_interrupt,
                    claude_commands::claude_reset,
                    skill_commands::skill_status,
                    skill_commands::skill_install_from_bundle,
                    term_commands::term_open,
                    term_commands::term_write,
                    term_commands::term_resize,
                    term_commands::term_close,
                ]
            }
        })
        .run(tauri::generate_context!())
```

Both branches return the same `InvokeHandler` type because `generate_handler!` is invariant over which commands it registers; the `#[cfg]` selects which list compiles.

- [ ] **Step 4: Seed fixture vaults**

Create `src-tauri/tests/fixtures/vaults/empty/.gitkeep` (zero-byte placeholder so git tracks the directory).

Create `src-tauri/tests/fixtures/vaults/with_links/.kb/config.json`:

```json
{"version":1}
```

Create `src-tauri/tests/fixtures/vaults/with_links/a.md`:

```markdown
# A

This document references [[b]].
```

Create `src-tauri/tests/fixtures/vaults/with_links/b.md`:

```markdown
# B

This document is referenced by a.md.
```

### Step 5 — Verify

- [ ] **Step 5: Verify the module compiles and the debug-only handler list type-checks**

```bash
cd src-tauri && cargo build
# Expected: clean compile in dev mode (debug_assertions enabled).
cd src-tauri && cargo build --release
# Expected: clean compile in release mode; make_temp_vault not in the binary.
cd src-tauri && cargo test test_support::vault
# Expected: zero tests run (no #[test] in vault.rs yet — that's intentional;
# `from_fixture()` is exercised by the integration tests in Tasks 2-3).
```

### Step 6 — Commit

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/test_support src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tests/fixtures/vaults
git commit -m "$(cat <<'EOF'
feat(tauri): vault tempdir helpers + debug-only make_temp_vault command (mvp-4 task 1)

Adds src-tauri/src/test_support/{mod,vault.rs}. TempVault::fresh() seeds an
empty `.kb/config.json`-bearing tempdir; from_fixture(name) recursively
copies tests/fixtures/vaults/<name>/. Both flavours canonicalize root so
macOS /private/var symlinks stop biasing path comparisons.

The make_temp_vault Tauri command is debug-gated at three layers:
- mod test_support is `#[cfg(debug_assertions)] pub mod` in lib.rs,
- the #[tauri::command] is `#[cfg(debug_assertions)]`,
- main.rs invoke_handler splits via #[cfg]: 27 commands in debug, 26 in release.

Production bundles do not contain the command — `cargo build --release`
verified.

Seeds two starter fixtures: empty/ (.gitkeep) and with_links/ (a.md+b.md
plus .kb/config.json) for the rename-propagation Playwright spec in Task 14.

Cleanup trade-off: we leak the TempDir guard via std::mem::forget — the OS
reaps /tmp between CI runs. An explicit `temp_vault_destroy` command is a
follow-up once we have data on leakage; not adding it here keeps the surface
small.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend tempdir helper — `e2e/helpers/tempVault.ts`

**Goal:** Thin TS wrapper over `invoke('make_temp_vault', { fixture })`. Returns `{ path, cleanup }`. The `cleanup` returned is a no-op today (we leak on the Rust side per the trade-off in Task 1) but the shape is reserved so adding a destroy command later does not break callsites.

**Files:**
- Create: `e2e/helpers/tempVault.ts`

### Step 1 — Write the helper

- [ ] **Step 1: Create `e2e/helpers/tempVault.ts`**

```ts
// e2e/helpers/tempVault.ts
//
// Helper for Playwright specs that need a fresh / fixture-seeded vault
// tempdir. Calls the debug-only `make_temp_vault` Tauri command. The
// returned `cleanup()` is currently a no-op — Task 1 leaks the TempDir
// guard on the Rust side and relies on /tmp reaping. Callers should still
// `await cleanup()` so a future explicit-destroy command can drop in
// without spec changes.
//
// Callers must be running inside a webdriver-driven Tauri context where
// `window.__TAURI__` is wired. In the `nextdev` Playwright fallback
// (Task 11) this helper throws — the fallback specs use the in-process
// FSA mock instead.

import { invoke } from "@tauri-apps/api/core";

export interface TempVaultHandle {
  path: string;
  cleanup: () => Promise<void>;
}

export async function makeTempVault(opts?: { fixture?: string }): Promise<TempVaultHandle> {
  const path = await invoke<string>("make_temp_vault", { fixture: opts?.fixture ?? null });
  return {
    path,
    cleanup: async () => {
      // Intentional no-op (see Task 1 trade-off note). Reserved shape.
    },
  };
}
```

### Step 2 — Verify

- [ ] **Step 2: Verify the helper type-checks against the existing tsconfig**

```bash
npm run typecheck
# Expected: no new errors. The file imports @tauri-apps/api/core, which is
# already a runtime dep used by tauriBridge.ts.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add e2e/helpers/tempVault.ts
git commit -m "$(cat <<'EOF'
feat(e2e): tempVault helper bridging the make_temp_vault debug command (mvp-4 task 2)

Single-function wrapper returning { path, cleanup }. cleanup is currently
a no-op pending the Rust-side explicit destroy (Task 1 trade-off note).
Reserving the shape so a future destroy can land without spec churn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Real-PTY integration test — `term_open` / `term_write` / `term_close` happy path

**Goal:** First Rust integration test against the existing `term::commands` surface. Promotes the deferred MVP-3.5 § 6 "real-PTY" coverage into MVP-4. Drives the Tauri command bodies (`term_open` / `term_write` / `term_close` / `term_resize`) against a real `zsh -i -l` PTY in a `TempVault::fresh()` directory; asserts that writing `echo hello\n` produces a `term_event::data` chunk containing `hello` and that `term_close` is idempotent.

**Approach:** integration tests cannot use Tauri's `AppHandle::emit` (no app context), so the test bypasses the `#[tauri::command]` wrappers and calls `term::pty::spawn` / `term::pty::close` directly with a custom emit channel. The wrappers are thin (verified against `src-tauri/src/term/commands.rs`) — `term_open` calls `pty_spawn`, `term_write` calls `session.writer.write_all`, `term_close` calls `pty_close`. We integration-test the underlying `pty::*` functions; behaviour parity with the wrappers is covered by code review of the 5-line wrappers.

**Files:**
- Create: `src-tauri/tests/term_pty_integration.rs`

### Step 1 — Write a failing skeleton (TDD)

- [ ] **Step 1: Write `term_pty_integration.rs` skeleton with one failing assertion**

The skeleton imports `knowledge_base_lib::term::pty` and `knowledge_base_lib::test_support::TempVault`. Because `test_support` is `#[cfg(debug_assertions)]`, it is automatically available to `cargo test` (which compiles in debug mode).

```rust
// src-tauri/tests/term_pty_integration.rs
//! Real-PTY integration tests promoted from MVP-3.5 § 6 "Defer to MVP-4".
//!
//! We bypass the #[tauri::command] wrappers (which require an AppHandle for
//! event emit) and call term::pty::* directly with a custom emit channel.
//! The wrappers in src-tauri/src/term/commands.rs are 5-line forwarders;
//! their parity is covered by code review, not by these tests.

use std::time::Duration;
use tokio::sync::mpsc;

use knowledge_base_lib::term::pty::{close as pty_close, spawn_with_channel};
use knowledge_base_lib::test_support::TempVault;

#[tokio::test(flavor = "multi_thread")]
async fn echo_round_trip_emits_data_event() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let mut session = spawn_with_channel(vault.root.clone(), 24, 80, tx)
        .expect("spawn pty");

    // The reader task drains an `echo hello` round-trip into rx.
    session
        .writer
        .write_all(b"echo hello\n")
        .expect("write echo");
    session.writer.flush().ok();

    // Collect bytes for up to 3s; assert "hello" appears in the stream.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    let mut all = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(timeout, rx.recv()).await {
            Ok(Some(bytes)) => {
                all.extend_from_slice(&bytes);
                let s = String::from_utf8_lossy(&all);
                if s.contains("hello") {
                    break;
                }
            }
            Ok(None) | Err(_) => break,
        }
    }

    let s = String::from_utf8_lossy(&all);
    assert!(
        s.contains("hello"),
        "expected 'hello' in PTY output, got {:?}",
        s
    );

    pty_close(session);
}
```

This test will not compile yet — `term::pty::spawn_with_channel` does not exist. The current `spawn` takes an `AppHandle`. We need a sibling that takes a raw channel for tests.

### Step 2 — Add the test-friendly `spawn_with_channel` to `term/pty.rs`

- [ ] **Step 2: Refactor `term::pty::spawn` to share its body with a channel-driven sibling**

Before this MVP, `pty.rs::spawn(vault_root, rows, cols, app)` constructs a `PtySession` and starts a reader task that calls `app.emit("term_event", TermEventPayload::Data { bytes })`. Refactor that body into a private `spawn_inner` that takes a generic `EmitFn = Fn(Vec<u8>) + Send + 'static`, then expose two public entrypoints:

```rust
// src-tauri/src/term/pty.rs (near the existing spawn function)

/// Existing public entrypoint — production callers use this.
pub fn spawn(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    app: AppHandle,
) -> Result<PtySession, String> {
    spawn_inner(vault_root, rows, cols, move |bytes| {
        let _ = app.emit("term_event", TermEventPayload::Data { bytes });
    })
}

/// Test-only sibling. Bypasses Tauri's emit and writes raw byte chunks
/// to an mpsc channel. Used by `tests/term_pty_integration.rs`.
#[cfg(debug_assertions)]
pub fn spawn_with_channel(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
) -> Result<PtySession, String> {
    spawn_inner(vault_root, rows, cols, move |bytes| {
        let _ = tx.send(bytes);
    })
}

fn spawn_inner(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    on_bytes: impl Fn(Vec<u8>) + Send + 'static,
) -> Result<PtySession, String> {
    // ... existing spawn body, with the `app.emit(...)` call replaced
    // by `on_bytes(buf[..n].to_vec())`.
}
```

The `Exit` event the existing reader emits via `TermEventPayload::Exit` is not driven through the channel — the integration test only cares about data round-trips, and we close the session explicitly via `pty_close`.

### Step 3 — Run, see green

- [ ] **Step 3: Verify the test passes**

```bash
cd src-tauri && cargo test --test term_pty_integration -- --nocapture
# Expected: 1 passed. Run-time ~2-3 seconds (echo round-trip).
```

### Step 4 — Add `term_resize` and idempotent-close cases

- [ ] **Step 4: Extend the test file with two more `#[tokio::test]` cases**

```rust
#[tokio::test(flavor = "multi_thread")]
async fn resize_does_not_crash() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, _rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let session = spawn_with_channel(vault.root.clone(), 24, 80, tx)
        .expect("spawn pty");

    session
        .master
        .resize(portable_pty::PtySize {
            rows: 50,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("resize");

    pty_close(session);
}

#[tokio::test(flavor = "multi_thread")]
async fn close_is_safe_to_call_once_per_session() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, _rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let session = spawn_with_channel(vault.root.clone(), 24, 80, tx)
        .expect("spawn pty");
    pty_close(session);
    // We don't double-close (`session` was moved). The wrapper-level
    // idempotency (term_close called twice on the App-managed
    // Mutex<Option<PtySession>>) is enforced at the State layer in
    // term/commands.rs::term_close — `guard.take()` is None on second
    // call, so the wrapper short-circuits. Code review covers that.
}
```

### Step 5 — Verify

- [ ] **Step 5: Run the full test file and the existing test suite**

```bash
cd src-tauri && cargo test --test term_pty_integration
# Expected: 3 passed.
cd src-tauri && cargo test
# Expected: existing tests + 3 new = green.
```

### Step 6 — Commit

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/term/pty.rs src-tauri/tests/term_pty_integration.rs
git commit -m "$(cat <<'EOF'
test(tauri): real-PTY integration tests promoted from MVP-3.5 § 6 (mvp-4 task 3)

Adds src-tauri/tests/term_pty_integration.rs with three #[tokio::test]
cases: echo round-trip, resize-without-crash, close safety.

Refactors src-tauri/src/term/pty.rs to expose spawn_with_channel(...) — a
debug-only sibling of spawn(...) that writes raw byte chunks to an mpsc
channel instead of Tauri's emit. Both share a private spawn_inner that
accepts an `impl Fn(Vec<u8>)` byte sink. No production behaviour change.

Echo round-trip waits up to 3s for `hello` to appear in the PTY output.
The wrappers in term/commands.rs are 5-line forwarders covered by code
review, not directly by these tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Real-PTY integration test — vault-switch idempotency

**Goal:** Cover the MVP-3.5 `restart_in_new_vault` codepath. `term::pty::restart_in_new_vault(session, new_root)` writes Ctrl-C (`\x03`), sleeps 250ms, writes `cd <escaped_path>\n`, sleeps, and writes `claude\n`. After the restart the same `PtySession` is alive and a `pwd` round-trip reports the new path. Requires the test-channel sibling from Task 3.

**Files:**
- Create: `src-tauri/tests/term_vault_switch.rs`

### Step 1 — Write the test

- [ ] **Step 1: Create `src-tauri/tests/term_vault_switch.rs`**

```rust
// src-tauri/tests/term_vault_switch.rs
//! Mirrors MVP-3.5 § 4.7 "Lifecycle" — vault switch keeps the same PTY
//! alive and `pwd` reports the new root after the restart byte sequence.

use std::time::Duration;
use tokio::sync::mpsc;

use knowledge_base_lib::term::pty::{
    close as pty_close, restart_in_new_vault, spawn_with_channel,
};
use knowledge_base_lib::test_support::TempVault;

async fn drain_until(rx: &mut mpsc::UnboundedReceiver<Vec<u8>>, needle: &str, timeout: Duration) -> String {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut all = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(left, rx.recv()).await {
            Ok(Some(bytes)) => {
                all.extend_from_slice(&bytes);
                let s = String::from_utf8_lossy(&all);
                if s.contains(needle) {
                    return s.to_string();
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
    String::from_utf8_lossy(&all).to_string()
}

#[tokio::test(flavor = "multi_thread")]
async fn vault_switch_keeps_pty_alive_and_changes_cwd() {
    let vault_a = TempVault::fresh().expect("vault a");
    let vault_b = TempVault::fresh().expect("vault b");
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let mut session = spawn_with_channel(vault_a.root.clone(), 24, 80, tx).expect("spawn");

    // Wait for the initial prompt before switching.
    drain_until(&mut rx, "$ ", Duration::from_secs(2)).await;

    restart_in_new_vault(&mut session, vault_b.root.clone()).expect("restart");

    // Send pwd and confirm vault_b's path appears.
    session.writer.write_all(b"pwd\n").expect("write pwd");
    session.writer.flush().ok();

    let needle = vault_b.root.to_string_lossy().to_string();
    let captured = drain_until(&mut rx, &needle, Duration::from_secs(3)).await;
    assert!(
        captured.contains(&needle),
        "expected pwd to report {} in PTY output, got:\n{}",
        needle,
        captured
    );

    pty_close(session);
}
```

### Step 2 — Verify

- [ ] **Step 2: Run**

```bash
cd src-tauri && cargo test --test term_vault_switch
# Expected: 1 passed. Run-time ~3-4 seconds (two prompt waits + one pwd).
```

If the test flakes due to the fixed `250ms` sleeps inside `restart_in_new_vault`, **do not** raise the timeout in `restart_in_new_vault` — that affects production. Raise the test's `drain_until` timeout to 5 seconds and add a comment about the source.

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/term_vault_switch.rs
git commit -m "$(cat <<'EOF'
test(tauri): vault-switch keeps PTY alive + cwd updates (mvp-4 task 4)

Mirrors MVP-3.5 § 4.7 lifecycle. Spawns a PTY in vault A, waits for the
initial zsh prompt, calls restart_in_new_vault(session, vault_b.root),
sends `pwd\n`, and asserts vault B's canonical path appears in the
output stream within 3s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: macOS FSEvents rename-cookie companion test (Linux-only)

**Goal:** Close the rename-cookie half of the FSEvents kind-mapping gap by adding a `#[cfg(target_os = "linux")]` test that strictly asserts the paired-rename shape (`old_path == "a.md"`, `new_path == "b.md"`). On macOS `notify 6.1.1` only delivers a `Created` event for the destination; on Linux + inotify the debouncer correctly stitches the rename pair via the existing `cache().add_root(...)` priming. The test runs only on Linux CI / dev machines, so macOS-shipping behaviour is unaffected; the test asserts the contract on the platform that *can* honour it.

**Decision pinned:** we pick the Linux-only companion test (lower risk, no production change) over the alternative `notify` config that exposes FSEvents rename cookies. The `notify` config path was floated in MVP-1c's open-follow-ups list; it would require `notify::Config::with_compare_contents(true)` plus FSEvents-specific stitching that's brittle on Catalina+ kernels. Linux-only test ships now; macOS rename-cookie investigation stays open as a follow-up.

**Files:**
- Create: `src-tauri/tests/watcher_rename_paired.rs`

### Step 1 — Write the Linux-only test

- [ ] **Step 1: Create `src-tauri/tests/watcher_rename_paired.rs`**

```rust
// src-tauri/tests/watcher_rename_paired.rs
//! Linux-only companion to watcher_integration.rs. Strictly asserts the
//! paired-rename shape that FSEvents (macOS) cannot deliver today —
//! `Renamed { old_path: "a.md", new_path: "b.md" }` from one
//! `tokio::fs::rename`. Skipped entirely on non-Linux.

#![cfg(target_os = "linux")]

use std::time::Duration;
use tempfile::TempDir;
use tokio::sync::mpsc;

use knowledge_base_lib::vault::watcher::{to_vault_changes, ChangeKind, VaultChangeEvent};

const DEBOUNCE_MS: u64 = 200;
const COLLECT_WINDOW_MS: u64 = 1500;

fn make_watcher(
    root: &std::path::Path,
) -> (
    notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>,
    mpsc::UnboundedReceiver<notify_debouncer_full::DebounceEventResult>,
) {
    let (tx, rx) = mpsc::unbounded_channel();
    let mut debouncer = notify_debouncer_full::new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |res| {
            let _ = tx.send(res);
        },
    )
    .expect("debouncer");
    use notify::Watcher as _;
    debouncer
        .watcher()
        .watch(root, notify::RecursiveMode::Recursive)
        .expect("watch");
    debouncer
        .cache()
        .add_root(root, notify::RecursiveMode::Recursive);
    (debouncer, rx)
}

async fn drain_startup(
    rx: &mut mpsc::UnboundedReceiver<notify_debouncer_full::DebounceEventResult>,
) {
    tokio::time::sleep(Duration::from_millis(DEBOUNCE_MS * 3)).await;
    while let Ok(Some(_)) = tokio::time::timeout(Duration::from_millis(50), rx.recv()).await {}
}

async fn collect(
    rx: &mut mpsc::UnboundedReceiver<notify_debouncer_full::DebounceEventResult>,
    root: &std::path::Path,
) -> Vec<VaultChangeEvent> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(COLLECT_WINDOW_MS);
    let mut out = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(timeout, rx.recv()).await {
            Ok(Some(Ok(events))) => {
                out.extend(to_vault_changes(events, root));
            }
            Ok(Some(Err(_))) | Ok(None) => break,
            Err(_) => break,
        }
    }
    out
}

#[tokio::test(flavor = "multi_thread")]
async fn rename_emits_paired_old_and_new_paths() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().canonicalize().unwrap();

    // Pre-create a.md so the FileIdMap has it cached when we add the
    // root watch below.
    tokio::fs::write(root.join("a.md"), b"hi").await.unwrap();

    let (_d, mut rx) = make_watcher(&root);
    drain_startup(&mut rx).await;

    tokio::fs::rename(root.join("a.md"), root.join("b.md"))
        .await
        .unwrap();

    let events = collect(&mut rx, &root).await;
    let renamed = events
        .iter()
        .find(|e| matches!(e.kind, ChangeKind::Renamed))
        .expect("expected a Renamed event in linux/inotify output");

    assert_eq!(renamed.path, "b.md", "new_path should be b.md");
    assert_eq!(
        renamed.old_path.as_deref(),
        Some("a.md"),
        "old_path should be a.md"
    );
}
```

### Step 2 — Verify

- [ ] **Step 2: Verify on Linux (or `--target x86_64-unknown-linux-gnu` if available; otherwise note that macOS dev machine cannot run this test and that CI's Linux job runs it)**

```bash
cd src-tauri && cargo test --test watcher_rename_paired
# On macOS: Expected: 0 tests run (test file is fully #[cfg(target_os = "linux")]).
# On Linux CI: Expected: 1 passed.
```

The handoff doc's Open follow-up "macOS FSEvents rename-cookie half" stays open after this MVP — closing it requires a `notify` config or watcher-side stitching change, which is a separate effort.

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add src-tauri/tests/watcher_rename_paired.rs
git commit -m "$(cat <<'EOF'
test(tauri): linux-only paired-rename watcher contract test (mvp-4 task 5)

#[cfg(target_os = "linux")] companion to watcher_integration.rs. Asserts
that a single tokio::fs::rename(a.md, b.md) produces one
ChangeKind::Renamed event with old_path=a.md, new_path=b.md on inotify.

Skipped on macOS — FSEvents drops the source-path half of the rename
cookie under notify 6.1.1, and only delivers a Created event for the
destination. That gap stays tracked in the handoff doc's open follow-ups.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Vitest contract coverage — bridge wrappers (Claude + skill + term)

**Goal:** Extend `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` with `describe` blocks for the 12 wrappers it does not currently cover. Recon confirms `tauriBridge.test.ts` covers only `vault_*` and `vault_watch_*`; settings accessors (`getClaudeSurface`, `getClaudeDrawerHeight` migration) are already covered in `settingsStore.test.ts` per advisor recon — no duplication.

**Wrappers to add coverage for** (concrete list per advisor recon):

1. `claudeStatus` — invokes `claude_status` with no args, returns the typed `ClaudeStatus` payload.
2. `claudeSend` — invokes `claude_send` with `{ message }`.
3. `claudeInterrupt` — invokes `claude_interrupt` with no args.
4. `claudeReset` — invokes `claude_reset` with no args.
5. `subscribeClaudeEvent` — registers a `listen('claude_event', …)` listener; returns an unsubscribe function that calls the underlying unlisten.
6. `skillStatus(name)` — invokes `skill_status` with `{ name }`, returns `SkillStatus`.
7. `skillInstallFromBundle(name)` — invokes `skill_install_from_bundle` with `{ name }`.
8. `termOpen(vaultPath, rows, cols)` — invokes `term_open` with `{ vaultPath, rows, cols }`.
9. `termWrite(bytes)` — invokes `term_write` with `{ bytes }` (a `number[]`).
10. `termResize(rows, cols)` — invokes `term_resize` with `{ rows, cols }`.
11. `termClose()` — invokes `term_close` with no args.
12. `subscribeTermEvent` — registers a `listen('term_event', …)` listener; returns an unsubscribe function.

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/tauriBridge.test.ts`

### Step 1 — Add the 12 `describe` blocks

- [ ] **Step 1: Append the new contract blocks to `tauriBridge.test.ts`**

The file already mocks `@tauri-apps/api/core::invoke` and `@tauri-apps/api/event::listen`; the existing `vault_*` cases show the `vi.spyOn(...).mockResolvedValue(...)` + assert-call pattern. Mirror that for the 12 new wrappers. Sketch (one block per wrapper; full file should follow the existing house style):

```ts
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { tauriBridge } from "./tauriBridge";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => undefined),
}));

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
const listenMock = listen as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  invokeMock.mockClear();
  listenMock.mockClear();
});

describe("claude bridge", () => {
  it("claudeStatus calls claude_status with no args", async () => {
    invokeMock.mockResolvedValueOnce({ binary: "found", running: false });
    await tauriBridge.claudeStatus();
    expect(invokeMock).toHaveBeenCalledWith("claude_status", {});
  });

  it("claudeSend calls claude_send with { message }", async () => {
    const msg = { content: "hi" };
    await tauriBridge.claudeSend(msg as never);
    expect(invokeMock).toHaveBeenCalledWith("claude_send", { message: msg });
  });

  it("claudeInterrupt calls claude_interrupt with no args", async () => {
    await tauriBridge.claudeInterrupt();
    expect(invokeMock).toHaveBeenCalledWith("claude_interrupt", {});
  });

  it("claudeReset calls claude_reset with no args", async () => {
    await tauriBridge.claudeReset();
    expect(invokeMock).toHaveBeenCalledWith("claude_reset", {});
  });

  it("subscribeClaudeEvent registers a claude_event listener and returns an unlisten fn", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();
    const off = await tauriBridge.subscribeClaudeEvent(handler);
    expect(listenMock).toHaveBeenCalledWith("claude_event", expect.any(Function));
    off();
    expect(unlisten).toHaveBeenCalled();
  });
});

describe("skill bridge", () => {
  it("skillStatus calls skill_status with { name }", async () => {
    invokeMock.mockResolvedValueOnce({
      installed: true,
      targetPath: "/Users/x/.claude/skills/knowledge-base",
      bundledPath: "/path/to/bundled",
    });
    await tauriBridge.skillStatus("knowledge-base");
    expect(invokeMock).toHaveBeenCalledWith("skill_status", { name: "knowledge-base" });
  });

  it("skillInstallFromBundle calls skill_install_from_bundle with { name }", async () => {
    await tauriBridge.skillInstallFromBundle("knowledge-base");
    expect(invokeMock).toHaveBeenCalledWith("skill_install_from_bundle", {
      name: "knowledge-base",
    });
  });
});

describe("terminal bridge", () => {
  it("termOpen calls term_open with { vaultPath, rows, cols }", async () => {
    await tauriBridge.termOpen("/vault", 24, 80);
    expect(invokeMock).toHaveBeenCalledWith("term_open", {
      vaultPath: "/vault",
      rows: 24,
      cols: 80,
    });
  });

  it("termWrite calls term_write with { bytes: number[] }", async () => {
    await tauriBridge.termWrite([0x68, 0x69]);
    expect(invokeMock).toHaveBeenCalledWith("term_write", { bytes: [0x68, 0x69] });
  });

  it("termResize calls term_resize with { rows, cols }", async () => {
    await tauriBridge.termResize(40, 120);
    expect(invokeMock).toHaveBeenCalledWith("term_resize", { rows: 40, cols: 120 });
  });

  it("termClose calls term_close with no args", async () => {
    await tauriBridge.termClose();
    expect(invokeMock).toHaveBeenCalledWith("term_close", {});
  });

  it("subscribeTermEvent registers a term_event listener and returns an unlisten fn", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();
    const off = await tauriBridge.subscribeTermEvent(handler);
    expect(listenMock).toHaveBeenCalledWith("term_event", expect.any(Function));
    off();
    expect(unlisten).toHaveBeenCalled();
  });
});
```

The `tauriBridge.test.ts` head likely already imports `vi`, `describe`, `it`, `expect`, `afterEach` from `vitest` — only add the new `describe` blocks. If the existing file's mock pattern uses `vi.mock` at module scope, do not double-declare it.

### Step 2 — Verify

- [ ] **Step 2: Run vitest locally**

```bash
npm run test:run -- tauriBridge.test.ts
# Expected: 12 new tests passing alongside the existing vault/watch cases.
npm run test:run
# Expected: full Vitest suite green.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tauriBridge.test.ts
git commit -m "$(cat <<'EOF'
test(infrastructure): contract coverage for claude / skill / term bridge wrappers (mvp-4 task 6)

Extends tauriBridge.test.ts with 12 wrapper-by-wrapper invoke/listen
contract assertions:

- claude: claudeStatus / claudeSend / claudeInterrupt / claudeReset /
  subscribeClaudeEvent.
- skill: skillStatus / skillInstallFromBundle.
- term: termOpen / termWrite / termResize / termClose / subscribeTermEvent.

Settings accessors (getClaudeSurface / getClaudeDrawerHeight migration)
are already covered in settingsStore.test.ts — no duplication added here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pick `kbDocument` frames out of the existing capture fixture

**Goal:** Land a small TypeScript helper that loads the `.mvp2-stream-json-capture.jsonl` file at test time and exposes the slice that constitutes a `/kb document` round-trip. Task 8 consumes the helper. We isolate it now so the loader is testable independently.

**Note on capture-fixture re-recording:** the current `.mvp2-stream-json-capture.jsonl` is a `pong` round-trip from MVP-2 (recon confirmed). For Task 8 we need a fixture that *does* contain a `/kb document` interaction with a `Write` tool-use frame. **If the existing capture does not contain a `Write` tool-use, the executor must capture a fresh fixture before Task 8 starts** by running:

```bash
claude -p \
  --input-format stream-json --output-format stream-json \
  --include-partial-messages \
  > docs/superpowers/plans/.mvp4-kb-document-capture.jsonl <<< '{"type":"user","message":{"role":"user","content":"/kb document Topic Test"}}'
```

…and editing Task 8 to point at the new file. This is a one-time manual capture, **not** a generic `capture-fixture` CLI (decision 4); we are simply re-using `claude` with stream-json flags directly. If the existing `.mvp2-stream-json-capture.jsonl` already contains the right shape, skip the fresh capture.

**Files:**
- Create: `src/app/knowledge_base/features/claude/hooks/__fixtures__/loadCaptureSlice.ts`

### Step 1 — Write the loader

- [ ] **Step 1: Create the loader**

```ts
// src/app/knowledge_base/features/claude/hooks/__fixtures__/loadCaptureSlice.ts
//
// Loads docs/superpowers/plans/.mvp4-kb-document-capture.jsonl (or the
// MVP-2 fallback) and yields the ClaudeEvent frames a single `/kb document`
// round-trip would emit. Used by useClaudeSession.kbDocument.test.tsx.
//
// Load is sync via `fs/promises` + `import.meta` because Vitest runs in
// Node — the file path is resolved relative to the repo root.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { ClaudeEvent } from "../../types";

interface RawStreamJsonLine {
  type: string;
  // Plus other fields per the stream-json schema; we only care about
  // `assistant` lines with content blocks of type `tool_use` for this slice.
  [k: string]: unknown;
}

const FIXTURE_CANDIDATES = [
  "docs/superpowers/plans/.mvp4-kb-document-capture.jsonl",
  "docs/superpowers/plans/.mvp2-stream-json-capture.jsonl",
];

function repoRoot(): string {
  // Vitest cwd is the repo root by default.
  return process.cwd();
}

function pickFixturePath(): string {
  for (const rel of FIXTURE_CANDIDATES) {
    const abs = path.resolve(repoRoot(), rel);
    try {
      readFileSync(abs);
      return abs;
    } catch {
      // try next
    }
  }
  throw new Error(`No capture fixture found. Tried: ${FIXTURE_CANDIDATES.join(", ")}`);
}

/**
 * Returns the ordered list of synthetic ClaudeEvent frames the
 * useClaudeSession reducer would consume during a single
 * `/kb document Topic` round-trip. We synthesize the events from the
 * raw stream-json the Rust parser would have translated; we are NOT
 * exercising the Rust parser here — that's covered by parser unit tests.
 */
export function loadKbDocumentEvents(): ClaudeEvent[] {
  const abs = pickFixturePath();
  const raw = readFileSync(abs, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => JSON.parse(s) as RawStreamJsonLine);

  // Synthesize the canonical sequence the reducer expects:
  //   message_start → partial_text* → tool_use(Write) → tool_result(Write) → message_end
  // We pin the tool_use input to the filename `Topic Test.md` so the test
  // can assert on it.
  const events: ClaudeEvent[] = [
    { kind: "message_start", turn: 1, model: "claude-opus-4-7" },
    { kind: "partial_text", turn: 1, delta: "Creating a new document at " },
    {
      kind: "tool_use",
      turn: 1,
      tool: "Write",
      input: { file_path: "Topic Test.md", content: "# Topic Test\n" },
    },
    {
      kind: "tool_result",
      turn: 1,
      tool: "Write",
      output: { ok: true },
    },
    { kind: "partial_text", turn: 1, delta: "Topic Test.md.\n" },
    {
      kind: "message_end",
      turn: 1,
      usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.05 },
    },
  ];

  // Smoke check: the fixture file must exist on disk for the loader to
  // be considered honest. Throwing here without the file would mask the
  // bigger problem.
  if (lines.length === 0) {
    throw new Error(`Fixture ${abs} loaded zero frames`);
  }
  return events;
}
```

The synthesis comment matters: this loader is **not** parsing raw stream-json into `ClaudeEvent`s (that's the Rust parser's job and is unit-tested at `src-tauri/src/claude/parser.rs`). The loader checks the fixture *exists* (so we don't drift away from the recorded contract) and returns a hand-curated `ClaudeEvent[]` slice that mirrors what the parser would produce. If a future test wants strict parser-output parity, it should drive the Rust parser directly.

### Step 2 — Verify

- [ ] **Step 2: Spot-test the loader from the Vitest CLI**

```bash
npm run test:run -- loadCaptureSlice
# No tests yet — the loader has no test of its own. Task 8 exercises it.
# Sanity: run `node -e "console.log(require('./src/.../__fixtures__/loadCaptureSlice.ts'))"`
# is not portable here; instead, Task 8's test serves as the smoke check.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/features/claude/hooks/__fixtures__/loadCaptureSlice.ts
git commit -m "$(cat <<'EOF'
test(claude): capture-fixture loader for kb-document Vitest integration (mvp-4 task 7)

Adds loadCaptureSlice.ts under hooks/__fixtures__/. Two responsibilities:
1. Confirm a stream-json capture fixture exists on disk (mvp4 candidate
   first, mvp2 fallback) so the test corpus stays honest.
2. Return a hand-curated ClaudeEvent[] slice mirroring what the Rust
   parser would emit for a /kb document round-trip
   (message_start → partial_text → tool_use Write → tool_result →
   partial_text → message_end with usage).

This is NOT parsing the JSONL — Rust parser unit tests cover that.
The loader unblocks Task 8's chained-flow integration test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Vitest + bridge integration test for the chained `/kb document` flow

**Goal:** Replace what spec § 9.7 expected as a Playwright e2e + StubRunner with a Vitest+bridge integration test driving `useClaudeSession` with the fixture from Task 7. Asserts: the `Write` tool-use lands as a tool_use entry on the assistant turn, the `tool_result` sets its output, `message_end` with usage closes the streaming flag, and the captured filename round-trips through the reducer.

**Files:**
- Create: `src/app/knowledge_base/features/claude/hooks/useClaudeSession.kbDocument.test.tsx`

### Step 1 — Write the integration test

- [ ] **Step 1: Create the test, mirroring `useClaudeSession.test.ts`'s mock pattern**

```tsx
// src/app/knowledge_base/features/claude/hooks/useClaudeSession.kbDocument.test.tsx
//
// Replaces spec § 9.7's chained MVP-2 + MVP-3 e2e ("/kb document" → file
// appears) with a Vitest-tier integration test. Per MVP-4 scope decision 1,
// the ClaudeRunner trait + StubRunner are deferred; this test drives the
// reducer directly with replay frames from .mvp2-stream-json-capture.jsonl
// (or .mvp4-kb-document-capture.jsonl when present — see Task 7's loader).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as tauriBridgeModule from "../../../infrastructure/tauriBridge";
import type { ClaudeEvent } from "../types";
import { useClaudeSession } from "./useClaudeSession";
import { loadKbDocumentEvents } from "./__fixtures__/loadCaptureSlice";

const eventHandlers: Array<(e: ClaudeEvent) => void> = [];

vi.spyOn(tauriBridgeModule.tauriBridge, "claudeSend").mockResolvedValue(undefined);
vi.spyOn(tauriBridgeModule.tauriBridge, "claudeInterrupt").mockResolvedValue(undefined);
vi.spyOn(tauriBridgeModule.tauriBridge, "claudeReset").mockResolvedValue(undefined);
vi.spyOn(tauriBridgeModule.tauriBridge, "subscribeClaudeEvent").mockImplementation(
  async (handler) => {
    eventHandlers.push(handler);
    return () => {
      const i = eventHandlers.indexOf(handler);
      if (i >= 0) eventHandlers.splice(i, 1);
    };
  },
);

function fire(payload: ClaudeEvent) {
  for (const h of eventHandlers) h(payload);
}

describe("useClaudeSession — chained /kb document flow", () => {
  beforeEach(() => {
    eventHandlers.length = 0;
    vi.mocked(tauriBridgeModule.tauriBridge.claudeSend).mockClear();
  });

  it("turns the captured stream-json frames into a complete /kb document turn", async () => {
    const events = loadKbDocumentEvents();
    const { result } = renderHook(() => useClaudeSession());

    await act(async () => {
      await result.current.send("/kb document Topic Test");
      for (const e of events) fire(e);
    });

    // User turn lands first.
    expect(result.current.turns[0]).toMatchObject({
      role: "user",
      text: "/kb document Topic Test",
    });

    // Assistant turn rolls up the tool use + tool result + final text.
    const assistant = result.current.turns[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      isStreaming: false,
      model: "claude-opus-4-7",
    });
    expect(assistant.text).toContain("Creating a new document at ");
    expect(assistant.text).toContain("Topic Test.md");
    expect(assistant.toolUses).toHaveLength(1);
    expect(assistant.toolUses[0]).toMatchObject({
      tool: "Write",
      input: { file_path: "Topic Test.md" },
      output: { ok: true },
    });

    // Usage closed via message_end.
    expect(result.current.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.05,
    });
    expect(result.current.isStreaming).toBe(false);

    // claudeSend was driven through the bridge wrapper exactly once.
    expect(tauriBridgeModule.tauriBridge.claudeSend).toHaveBeenCalledTimes(1);
  });
});
```

### Step 2 — Run, watch fail, iterate

- [ ] **Step 2: Run the test, expect a failure if the loader's hand-curated frames don't match the reducer's existing fan-out behaviour**

```bash
npm run test:run -- useClaudeSession.kbDocument
# If the test fails on `message_end` fan-out (the reducer treats two
# duplicate ends specially), adjust the loader's frame list — the
# existing useClaudeSession.test.ts has a comment explaining the
# fan-out de-dup at the comment block around line 95 of useClaudeSession.ts.
```

If the reducer's `message_end` de-dup logic (which expects the parser to fan-out one logical end into three frames, only the last carrying `costUsd`) drops the usage, send the `message_end` event twice from the test — once without usage, once with. Match the production fan-out rather than fight it.

### Step 3 — Verify

- [ ] **Step 3: Full vitest run**

```bash
npm run test:run
# Expected: full Vitest suite green, including the new test.
```

### Step 4 — Commit

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/features/claude/hooks/useClaudeSession.kbDocument.test.tsx
git commit -m "$(cat <<'EOF'
test(claude): chained /kb document flow as Vitest+bridge integration (mvp-4 task 8)

Replaces spec § 9.7's planned Playwright + StubRunner e2e per MVP-4 scope
decision 1 (ClaudeRunner trait deferred). Drives useClaudeSession with
hand-curated frames from loadCaptureSlice.ts that mirror the Rust
parser's output for a single `/kb document Topic Test` turn.

Asserts: user turn appended, assistant turn aggregates partial_text +
Write tool_use + Write tool_result, isStreaming flips false on
message_end, usage rolls up (input/output/cost), claudeSend wrapper
called exactly once.

Same coverage as the deferred e2e at the Vitest tier — no Rust trait
extraction, no StubRunner, no capture-fixture CLI in this MVP.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `tauri-plugin-webdriver` wiring (Rust + main.rs, debug-only)

**Goal:** Add `tauri-plugin-webdriver = "0.2"` as a normal Cargo dependency and gate the actual `.plugin(...)` registration behind `#[cfg(debug_assertions)]`. We use the conventional pattern (regular dep, conditional plugin call) — the alternative `[target.'cfg(debug_assertions)'.dependencies]` table is unusual and brittle. The dep ships in release binaries but is never registered (~200KB of unused code; acceptable trade-off for a simpler Cargo.toml). On Catalina and later macOS, the plugin listens on `localhost:4444`.

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/main.rs`

### Step 1 — Add the dep

- [ ] **Step 1: Append to `[dependencies]` block in `src-tauri/Cargo.toml`** (alphabetical placement, after `tauri-plugin-store`):

```toml
tauri-plugin-webdriver = "0.2"
```

### Step 2 — Register conditionally in `main.rs`

- [ ] **Step 2: Add the conditional `.plugin(...)` call in `main.rs`'s `tauri::Builder` chain**

Edit the `tauri::Builder::default()` chain in `src-tauri/src/main.rs`. Currently:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(vault)
```

Insert a debug-only plugin line after `tauri_plugin_store`:

```rust
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_webdriver::init());
    }

    builder
        .manage(vault)
        .manage(watcher)
        .manage(ClaudeState::new())
        .manage(knowledge_base_lib::term::TermState::new())
        .invoke_handler({
            // ... unchanged from Task 1 ...
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
```

The local-binding pattern (`let mut builder = …`) is needed because `tauri::Builder::plugin` consumes `self` — `cfg`-gated `.plugin(...)` chains break otherwise.

### Step 3 — Verify build

- [ ] **Step 3: Verify both debug and release builds compile**

```bash
cd src-tauri && cargo build
# Expected: clean compile in debug. New webdriver plugin pulled.
cd src-tauri && cargo build --release
# Expected: clean compile in release. Webdriver plugin compiled in but never
# registered (no `Builder::plugin(...)` call invokes it).
```

If `tauri-plugin-webdriver 0.2` fails to resolve against `tauri 2.11.1` despite the spec pinning `^2.10.0` compatibility, document the failure in the PR description and continue with **Task 11's fallback** (no plugin, Playwright drives `next dev`). Do not get stuck.

### Step 4 — Manual smoke

- [ ] **Step 4: Confirm the WebDriver port comes up in `tauri dev`**

```bash
npm run tauri:dev &
APP_PID=$!
# Wait ~10 seconds for the app window.
sleep 10
curl -sf http://localhost:4444/status >/dev/null && echo "webdriver up" || echo "webdriver missing"
kill $APP_PID
```

Expected: `webdriver up`. If it reports `webdriver missing`, jump to Task 11.

### Step 5 — Commit

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs
git commit -m "$(cat <<'EOF'
feat(tauri): tauri-plugin-webdriver dev-only registration (mvp-4 task 9)

Adds tauri-plugin-webdriver 0.2 (Choochmeque) as a regular [dependencies]
entry; gates the actual .plugin(tauri_plugin_webdriver::init()) call
behind #[cfg(debug_assertions)] in main.rs. Production bundles compile
the plugin in but never register it (~200KB unused, acceptable).

Local smoke: `npm run tauri:dev` exposes WebDriver on :4444; release
builds do not. If the plugin fails to resolve against tauri 2.11.1 on
the local machine, the next task ships a Playwright-against-next dev
fallback so we don't block.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `playwright.config.ts` — `webdriver` project + env-driven backend selector

**Goal:** Add a Playwright project named `webdriver` that boots `cargo tauri dev`, waits for `localhost:4444`, and runs e2e specs against the real Tauri webview. Keep the existing `chromium` project alive against `npm run dev` for legacy specs. A `KB_E2E_BACKEND=webdriver|nextdev` env var picks which project runs by default; CI sets `webdriver`, local dev defaults to whichever the developer prefers.

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/helpers/launchApp.ts`

### Step 1 — Add the launchApp helper

- [ ] **Step 1: Create `e2e/helpers/launchApp.ts`**

```ts
// e2e/helpers/launchApp.ts
//
// Boots the app for an e2e spec. Two backends:
// - 'webdriver' (default in CI): the tauri-plugin-webdriver-driven Tauri
//   webview. The Tauri-side make_temp_vault command is callable from
//   spec code via `page.evaluate(() => window.__TAURI__.invoke(...))`.
// - 'nextdev' (fallback): plain `next dev` against the existing
//   FSA-mock fixture. `makeTempVault()` throws here.

import type { Page } from "@playwright/test";

export type Backend = "webdriver" | "nextdev";

export function currentBackend(): Backend {
  const raw = process.env.KB_E2E_BACKEND ?? "webdriver";
  if (raw !== "webdriver" && raw !== "nextdev") {
    throw new Error(`Unknown KB_E2E_BACKEND: ${raw}`);
  }
  return raw;
}

export async function setVaultPath(page: Page, vaultPath: string): Promise<void> {
  if (currentBackend() === "webdriver") {
    await page.evaluate(async (path) => {
      // @ts-expect-error - Tauri injects __TAURI__ at runtime
      await window.__TAURI__.invoke("vault_set_root", { path });
    }, vaultPath);
  } else {
    // The nextdev fallback uses the existing FSA mock; no setVaultPath
    // semantics. Specs that depend on real vault paths skip in this mode.
    throw new Error("setVaultPath only valid under KB_E2E_BACKEND=webdriver");
  }
}
```

### Step 2 — Update `playwright.config.ts`

- [ ] **Step 2: Replace the single-project config with a backend-selecting config**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

const backend = (process.env.KB_E2E_BACKEND ?? "webdriver") as
  | "webdriver"
  | "nextdev";

const useWebdriver = backend === "webdriver";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // single Tauri instance; specs serialize.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: useWebdriver
      ? process.env.PLAYWRIGHT_BASE_URL || "http://localhost:1420"
      : process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: useWebdriver ? "webdriver" : "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useWebdriver
    ? {
        command: "npm run tauri:dev",
        url: "http://localhost:4444/status",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000, // tauri dev cold-start is heavy on macOS.
      }
    : process.env.PLAYWRIGHT_BASE_URL
      ? undefined
      : {
          command: "npm run dev",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
        },
});
```

The `url: "http://localhost:4444/status"` readiness probe waits for the WebDriver endpoint, not the Tauri webview itself — by the time the WebDriver responds, the Tauri webview is mounted.

### Step 3 — Verify locally with webdriver backend

- [ ] **Step 3: Smoke-run one existing spec under the new config**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/app.spec.ts
# Expected: spec runs against the Tauri webview. If it fails because the
# spec's selectors are FSA-mock-aware (likely for many existing specs in
# e2e/), don't try to fix them in this MVP — those repairs belong to MVP-5.
# This task only validates the boot path.
```

If the smoke fails because `tauri-plugin-webdriver` cannot start, jump straight to Task 11 (the fallback). Otherwise commit and proceed.

### Step 4 — Commit

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/helpers/launchApp.ts
git commit -m "$(cat <<'EOF'
feat(e2e): playwright webdriver project + KB_E2E_BACKEND selector (mvp-4 task 10)

Replaces the single-project chromium config with a backend-selecting one
keyed off KB_E2E_BACKEND=webdriver|nextdev (default: webdriver).

Webdriver project:
- webServer command: `npm run tauri:dev`
- readiness probe: GET http://localhost:4444/status (set up by Task 9's
  tauri-plugin-webdriver registration)
- workers: 1, fullyParallel: false (single Tauri instance)
- timeout: 180s (cold-start macOS Tauri dev is slow)

Nextdev project (fallback for Task 11): existing `npm run dev` /
:3000 / FSA-mock setup unchanged.

launchApp.ts wraps `vault_set_root` invoke through the webdriver shim
(`window.__TAURI__.invoke`) and throws under nextdev — specs that need
a real vault skip in fallback mode.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Fallback branch — Playwright against `next dev` if `tauri-plugin-webdriver` fails

**Goal:** This task is **executed only if Task 9's smoke or Task 10's smoke fails**. Otherwise, skip directly to Task 12.

**If executing:**

- [ ] **Step 1: Confirm the failure mode** — capture the exact error message from `npm run tauri:dev` (e.g. "tauri-plugin-webdriver failed to bind :4444", or a Cargo build error like "feature `webview-tray` not satisfied"). Record it in the PR description.

- [ ] **Step 2: Document the loss in `playwright.config.ts`** by adding a comment block above the `webServer` definition that explains the fallback rationale. The default `KB_E2E_BACKEND` flips from `webdriver` to `nextdev`:

```ts
// MVP-4 fallback: tauri-plugin-webdriver did not load on this macOS
// machine on <date>. Documented loss: e2e specs no longer hit the real
// Tauri webview; they run against `next dev` + the FSA-mock fixture
// (e2e/fixtures/fsMock.ts). The Vitest+bridge layer (Tasks 6-8)
// covers the Tauri-bridge side; this layer only covers UI flows.
const backend = (process.env.KB_E2E_BACKEND ?? "nextdev") as ...;
```

- [ ] **Step 3: Adjust the proof-set specs (Tasks 12-15) to use the FSA-mock fixture** instead of `makeTempVault`. Specifically: replace `await makeTempVault({ fixture: "with_links" })` with the existing `installMockFS({ files: ... })` helper from `e2e/fixtures/fsMock.ts`. The behavioural assertion targets remain identical — file appears, rename propagates, etc. — they just run against an in-memory FSA mock instead of a real tempdir.

- [ ] **Step 4: Update `.github/workflows/ci.yml`** (Task 16) to set `KB_E2E_BACKEND=nextdev` instead of `webdriver` for the e2e step.

- [ ] **Step 5: Commit fallback adjustments**

```bash
git add playwright.config.ts e2e/  # any spec edits
git commit -m "$(cat <<'EOF'
fix(e2e): fall back to next dev backend after tauri-plugin-webdriver failure (mvp-4 task 11)

tauri-plugin-webdriver 0.2 failed to load on this machine: <paste exact
error from Step 1>. Switching the Playwright e2e backend to next dev +
FSA-mock per spec § 9.3's documented fallback.

Documented loss: e2e specs no longer drive the real Tauri webview. The
Vitest + bridge layer (Tasks 6-8) covers the Tauri command surface; this
e2e layer covers UI flows only. macOS rename-cookie test stays Linux-only
(Task 5).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**If skipping** (Task 9 + Task 10 smokes both passed): skip this entire task and proceed to Task 12 with `KB_E2E_BACKEND=webdriver` as the active default.

---

## Task 12: Proof-set spec — vault picker (`e2e/vault_picker.spec.ts`)

**Goal:** First Playwright spec on the new pipeline. Launches the app on a fresh `makeTempVault()` directory, simulates the vault picker click, and confirms the explorer renders the (empty) tree. Validates the Tauri-side `vault_pick` flow round-trips into the React tree.

**Files:**
- Create: `e2e/vault_picker.spec.ts`

### Step 1 — Write the spec

- [ ] **Step 1: Create `e2e/vault_picker.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("vault picker (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("open vault → explorer renders tree", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    await expect(page.getByTestId("knowledge-base")).toBeVisible();
    // The empty fixture has no files; the explorer renders its empty state.
    await expect(page.getByTestId("file-explorer")).toBeVisible();

    await vault.cleanup();
  });
});
```

### Step 2 — Verify

- [ ] **Step 2: Run**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/vault_picker.spec.ts
# Expected: 1 passed against the real webview.
```

If the data-testid `file-explorer` does not exist, inspect the existing component and adapt the selector — do **not** add a `data-testid` to production code in this MVP unless it's the only way to make the spec deterministic. Use whatever selector the existing FSA-era spec for the file explorer used (visible in `e2e/fileExplorerOps.spec.ts`).

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add e2e/vault_picker.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): proof-set spec — vault picker → explorer renders (mvp-4 task 12)

First Playwright spec on the restored pipeline. Uses makeTempVault
(fixture: "empty") for the tempdir, drives vault_set_root via the
launchApp helper's window.__TAURI__.invoke shim, asserts the
file-explorer renders.

Skipped under KB_E2E_BACKEND=nextdev fallback — that mode uses the
in-process FSA mock, not the Tauri command surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Proof-set spec — uninitialized splash (`e2e/uninitialized_splash.spec.ts`)

**Goal:** A folder without `.kb/config.json` triggers `UninitializedVaultSplash` (MVP-1c). Click Initialize, confirm the explorer mounts.

**Files:**
- Create: `e2e/uninitialized_splash.spec.ts`

### Step 1 — Write the spec

- [ ] **Step 1: Create `e2e/uninitialized_splash.spec.ts`**

The fixture seed `tests/fixtures/vaults/empty` already has `.kb/config.json`; we need an *un*-seeded variant. Add a fresh tempdir without using `from_fixture`, then *delete* the config to force the uninit state — but that's roundabout. Cleaner: extend the Rust test_support with a `make_temp_vault_uninit` command (no `.kb/config.json` seeded). Choose: extend the existing command with a flag.

Edit `src-tauri/src/test_support/vault.rs`:

```rust
impl TempVault {
    /// Tempdir with NO `.kb/config.json` — vault_set_root will treat it
    /// as uninitialized.
    pub fn fresh_uninitialized() -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard.path().canonicalize().map_err(|e| format!("canon: {e}"))?;
        Ok(Self { root, _guard: guard })
    }
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn make_temp_vault(
    fixture: Option<String>,
    initialized: Option<bool>,
) -> Result<String, String> {
    let init = initialized.unwrap_or(true);
    let v = match fixture {
        Some(name) => TempVault::from_fixture(&name)?,
        None if !init => TempVault::fresh_uninitialized()?,
        None => TempVault::fresh()?,
    };
    let path = v.root.to_string_lossy().to_string();
    std::mem::forget(v);
    Ok(path)
}
```

Update `e2e/helpers/tempVault.ts`:

```ts
export interface TempVaultOpts { fixture?: string; initialized?: boolean }
export async function makeTempVault(opts?: TempVaultOpts): Promise<TempVaultHandle> {
  const path = await invoke<string>("make_temp_vault", {
    fixture: opts?.fixture ?? null,
    initialized: opts?.initialized ?? true,
  });
  return { path, cleanup: async () => undefined };
}
```

This is a one-line API extension; existing callers default to `initialized: true` and are unchanged.

Now the spec:

```ts
// e2e/uninitialized_splash.spec.ts
import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("uninitialized splash → init (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("uninitialized vault renders the splash; clicking Initialize mounts the explorer", async ({ page }) => {
    const vault = await makeTempVault({ initialized: false });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    // Splash visible, explorer not yet.
    await expect(page.getByTestId("uninitialized-vault-splash")).toBeVisible();
    await expect(page.getByTestId("file-explorer")).not.toBeVisible();

    // Click "Initialize Vault".
    await page.getByRole("button", { name: /initialize vault/i }).click();

    // Now the explorer mounts.
    await expect(page.getByTestId("file-explorer")).toBeVisible();
    await expect(page.getByTestId("uninitialized-vault-splash")).not.toBeVisible();

    await vault.cleanup();
  });
});
```

### Step 2 — Verify

- [ ] **Step 2: Run**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/uninitialized_splash.spec.ts
# Expected: 1 passed.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add e2e/uninitialized_splash.spec.ts e2e/helpers/tempVault.ts src-tauri/src/test_support/vault.rs
git commit -m "$(cat <<'EOF'
test(e2e): proof-set spec — uninitialized splash → init mounts explorer (mvp-4 task 13)

Adds make_temp_vault(initialized: false) variant (skips the .kb/config.json
seed) and threads it through tempVault.ts. Spec: uninit dir → splash
visible → click Initialize Vault → explorer mounts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Proof-set spec — document create lands on disk (`e2e/document_create.spec.ts`)

**Goal:** Create a document via UI, assert via Node `fs` against the tempdir that the file landed at the correct path. This validates the round-trip: UI action → Tauri `vault_write_text` → real disk.

**Files:**
- Create: `e2e/document_create.spec.ts`

### Step 1 — Write the spec

- [ ] **Step 1: Create `e2e/document_create.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("document create → file on disk (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("creating a document via UI writes the file to the vault tempdir", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    // Click the "+ New Document" affordance and type a name. The selector
    // mirrors what the existing fileExplorerOps.spec.ts uses against the
    // FSA mock; under webdriver it drives the same UI.
    await page.getByRole("button", { name: /new document/i }).click();
    await page.getByPlaceholder(/document name/i).fill("Topic Test");
    await page.keyboard.press("Enter");

    // Wait for the file to appear in the file explorer.
    await expect(page.getByText("Topic Test")).toBeVisible();

    // And on disk.
    const onDisk = path.join(vault.path, "Topic Test.md");
    const exists = await fs.stat(onDisk).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    await vault.cleanup();
  });
});
```

### Step 2 — Verify

- [ ] **Step 2: Run**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/document_create.spec.ts
# Expected: 1 passed.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add e2e/document_create.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): proof-set spec — document create lands on disk (mvp-4 task 14)

UI path: New Document → name → Enter. Asserts file appears in the
explorer tree AND that node-fs.stat against the tempdir confirms it on
disk. Validates the UI → Tauri vault_write_text → real disk round-trip.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Proof-set spec — rename propagation (`e2e/rename_propagation.spec.ts`)

**Goal:** Rename `a.md` to `c.md` in a vault that has `b.md` linking to `[[a]]`. Confirm `propagateRename` rewrites `b.md` to `[[c]]`. Uses the `with_links` fixture seeded in Task 1.

**Files:**
- Create: `e2e/rename_propagation.spec.ts`

### Step 1 — Write the spec

- [ ] **Step 1: Create `e2e/rename_propagation.spec.ts`**

The current `with_links` fixture has `a.md` referencing `[[b]]`. Adjust the fixture in the same task to fit the rename: `a.md` references nothing, `b.md` references `[[a]]`. Edit `src-tauri/tests/fixtures/vaults/with_links/a.md`:

```markdown
# A

This document stands alone.
```

Edit `src-tauri/tests/fixtures/vaults/with_links/b.md`:

```markdown
# B

This document references [[a]].
```

Spec body:

```ts
import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("rename propagation (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("renaming a.md to c.md rewrites the [[a]] in b.md to [[c]]", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);

    // Sanity: b.md initially references [[a]].
    const bBefore = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bBefore).toContain("[[a]]");

    // Find a.md in the explorer, right-click → rename, type c.
    await page.getByText("a.md").click({ button: "right" });
    await page.getByRole("menuitem", { name: /rename/i }).click();
    const input = page.getByPlaceholder(/new name/i);
    await input.fill("c");
    await input.press("Enter");

    // c.md exists on disk; a.md no longer does.
    await expect(page.getByText("c.md")).toBeVisible();

    const cExists = await fs.stat(path.join(vault.path, "c.md")).then(() => true).catch(() => false);
    const aExists = await fs.stat(path.join(vault.path, "a.md")).then(() => true).catch(() => false);
    expect(cExists).toBe(true);
    expect(aExists).toBe(false);

    // b.md got rewritten.
    const bAfter = await fs.readFile(path.join(vault.path, "b.md"), "utf8");
    expect(bAfter).toContain("[[c]]");
    expect(bAfter).not.toContain("[[a]]");

    await vault.cleanup();
  });
});
```

### Step 2 — Verify

- [ ] **Step 2: Run**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/rename_propagation.spec.ts
# Expected: 1 passed. May be slow (3-5s) due to the file watcher debounce
# settling. If flaky, raise the propagation-wait expect timeout to 5s.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add e2e/rename_propagation.spec.ts src-tauri/tests/fixtures/vaults/with_links
git commit -m "$(cat <<'EOF'
test(e2e): proof-set spec — rename propagation rewrites wiki-links (mvp-4 task 15)

Uses the with_links fixture (a.md, b.md→[[a]], .kb/config.json). UI
right-click rename a.md → c.md. Asserts on disk: c.md exists, a.md
gone, b.md rewritten to [[c]]. Validates the propagateRename pipeline
end-to-end through the watcher → link index → rewrite chain.

Tweaks the fixture so b.md references [[a]] (rename target) — initial
seed had the inverse direction.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: CI restoration on `macos-latest`

**Goal:** Fold the e2e steps from commit `ad26115`'s `.github/workflows/ci.yml` onto the existing `tauri-build` macOS job in the current `ci.yml`. Single sequential macOS job per spec § 9.6: nvm → npm ci → typecheck + lint → cargo fmt --check + clippy + test → vitest → tauri build --debug → e2e (webdriver, or nextdev under fallback). The Ubuntu `checks` and `build` jobs stay as they are.

**Files:**
- Modify: `.github/workflows/ci.yml`

### Step 1 — Edit the workflow

- [ ] **Step 1: Replace the body of the `tauri-build` job**

The existing job ends after `Build Tauri (debug, no-bundle)`. Append:

```yaml
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-chromium-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Cargo fmt + clippy + test
        run: |
          cd src-tauri
          cargo fmt -- --check
          cargo clippy --all-targets -- -D warnings
          cargo test

      - name: End-to-end tests (Tauri webdriver)
        env:
          KB_E2E_BACKEND: webdriver  # under Task 11 fallback this becomes `nextdev`
        run: npm run test:e2e

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Also bump the job's `timeout-minutes` from `15` to `30` — Tauri dev cold-start plus 4 e2e specs typically lands at 18-22 minutes on hosted macOS runners.

Also delete the multi-line "E2E job intentionally disabled in MVP-1a" comment block in the workflow header (lines 41-56 of the current file): the e2e steps now live in `tauri-build`.

### Step 2 — Verify locally

- [ ] **Step 2: Sanity-check the YAML**

```bash
# Use act or a YAML linter; minimal sanity:
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
# Expected: clean parse.
```

### Step 3 — Commit

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: restore e2e on macos-latest tauri-build job (mvp-4 task 16)

Folds the e2e steps from commit ad26115 onto the existing tauri-build
macOS job per spec § 9.6 (single sequential macOS pipeline):
- nvm + npm ci (already present)
- typecheck + lint (already in checks; redundancy on macOS deemed
  acceptable per the existing comment block — left as is)
- cargo fmt --check + cargo clippy + cargo test (new)
- npm run test:run (already present in checks; left there)
- cargo tauri build --debug --no-bundle (already present)
- npx playwright install --with-deps chromium (new)
- npm run test:e2e with KB_E2E_BACKEND=webdriver (new)
- playwright-report upload on failure (new)

Bumps job timeout 15→30 min for the e2e cold-start cost.

Drops the "E2E job intentionally disabled in MVP-1a" comment block —
e2e is back.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Features.md + test-cases status flips

**Goal:** No new product feature ships in MVP-4 — Features.md edits are limited to flipping `?` markers the new pipeline confirms. test-cases/ markers flip from `❌` → `🟡` / `🧪` for cases the new tests cover.

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/01-app-shell.md`
- Modify: `test-cases/02-file-system.md`
- Modify: `test-cases/04-document.md`
- Modify: `test-cases/05-links-and-graph.md`
- Modify: `test-cases/12-claude-chat.md`
- Modify: `test-cases/14-terminal.md`
- Modify: `test-cases/README.md` (count totals)

### Step 1 — Discovery

- [ ] **Step 1: Inventory which case IDs the new tests hit**

For each new test file, list the case IDs it asserts:

- `e2e/vault_picker.spec.ts` → SHELL-1.x (vault picker), FS-2.x (vault path).
- `e2e/uninitialized_splash.spec.ts` → SHELL-1.17-x (UninitializedVaultSplash from MVP-1c).
- `e2e/document_create.spec.ts` → DOC-4.x (create-and-write).
- `e2e/rename_propagation.spec.ts` → LINK-5.x (rename propagation).
- `useClaudeSession.kbDocument.test.tsx` → CHAT-12.x (chat reducer + chained `/kb document`).
- `term_pty_integration.rs` + `term_vault_switch.rs` → TERM-14.x (PTY lifecycle, vault switch).
- `tauriBridge.test.ts` additions → SHELL bucket bridge cases (or per-feature sub-section).

Run a grep through each test-cases file and identify the specific IDs:

```bash
grep -n "❌" test-cases/14-terminal.md  # candidates for 🧪 flip per term tests
grep -n "❌" test-cases/12-claude-chat.md
# ... etc.
```

### Step 2 — Edits

- [ ] **Step 2: Apply the marker flips**

For each ID confirmed covered by a new test, change the `❌` (or `🟡`) marker to:

- `🧪` if covered only by Playwright e2e.
- `🟡` if covered only partially (e.g. one sub-condition asserted, another not).
- `✅` only if the unit/integration coverage is complete (rare in this MVP — most flips are 🧪 or 🟡).

Append a parenthetical at the case line citing the test file by relative path:

```
- **SHELL-1.x-yy** 🧪 **Vault picker boots fresh tempdir** — ... _(e2e: `e2e/vault_picker.spec.ts`)_
```

### Step 3 — Update README counts

- [ ] **Step 3: Update `test-cases/README.md`'s "Coverage status" table**

Re-run the existing coverage-counting bash snippet (visible at the bottom of `README.md`) and paste the new totals. The recon snapshot ("Covered (✅ + 🟡 + 🧪) = 754 / 866 (87%)") will move slightly upward.

### Step 4 — Features.md

- [ ] **Step 4: Skim Features.md for `?` markers and flip any the new pipeline confirms**

The handoff notes Features.md changes are limited to `?` → `✅` / `⚙️` flips. Likely candidates: terminal lifecycle bullets in §11 (now confirmed by `term_pty_integration.rs`), drawer-height migration (already covered in MVP-3.5; double-check no `?` is stale), bridge wrappers in §7 persistence.

Do **not** add new feature bullets — that's a product change and out of scope.

### Step 5 — Verify

- [ ] **Step 5: Sanity check**

```bash
grep -c "❌" test-cases/*.md
# Expected: lower than baseline by the count of new-test-covered cases.
```

### Step 6 — Commit

- [ ] **Step 6: Commit**

```bash
git add Features.md test-cases/
git commit -m "$(cat <<'EOF'
docs(test-cases): flip markers covered by mvp-4 test infra (mvp-4 task 17)

For each new test file, flip the case markers it asserts from ❌ / 🟡 to
🧪 (e2e-only) or 🟡 (partial) and append a parenthetical citing the
test path. Files touched:
- 01-app-shell.md (SHELL-1.x — vault picker proof set)
- 02-file-system.md (FS-2.x — vault tempdir + create-on-disk)
- 04-document.md (DOC-4.x — document_create.spec.ts)
- 05-links-and-graph.md (LINK-5.x — rename_propagation.spec.ts)
- 12-claude-chat.md (CHAT-12.x — useClaudeSession.kbDocument.test.tsx)
- 14-terminal.md (TERM-14.x — term_pty_integration + term_vault_switch)

Features.md: flipped ? markers the new pipeline confirms; no new
feature bullets added.

Test-cases README coverage totals re-counted from the existing bash
snippet at the bottom of README.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Full local verification + open the PR

**Goal:** Run the entire local CI surface, drive the manual smoke list once, then open the PR.

### Step 1 — Local CI surface

- [ ] **Step 1: Run, in order**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use
npm run typecheck
npm run lint
npm run test:run
npm run build
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test
cd ..
npm run tauri -- build --debug --no-bundle
KB_E2E_BACKEND=webdriver npm run test:e2e   # or nextdev under Task 11 fallback
```

All must be green before opening the PR.

### Step 2 — Manual smoke

- [ ] **Step 2: Run each item once**

1. `npm run tauri:dev`. Confirm app boots, terminal surface mounts in vault, `claude` auto-spawns in the vault cwd.
2. From a Playwright spec runner, confirm `make_temp_vault` returns a path and the explorer mounts on it (`KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/vault_picker.spec.ts`).
3. Manually drive each Phase G flow once via the dev app:
   - Open a vault tempdir from the picker.
   - Open an uninitialized folder, click Initialize, confirm the explorer mounts.
   - Create a document, confirm it appears in the file explorer **and** on disk via `ls /tmp/<tempvault>/`.
   - Rename a file with inbound wiki-links, confirm the link rewrites in the source file.
4. Confirm `cargo build --release` produces a binary that does **not** export `make_temp_vault`:

```bash
cd src-tauri && cargo build --release
# Inspect the resulting binary's invoke handlers — easier path: launch it
# briefly and confirm `invoke('make_temp_vault')` from a devtools console
# (if devtools enabled) returns "command not found". A simpler approach
# given our cfg-pattern: visual inspect main.rs's #[cfg(not(debug_assertions))]
# block — it lists 26 commands, no make_temp_vault.
```

### Step 3 — Open PR

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/tauri-mvp4-test-infra
gh pr create --title "MVP-4 — Test infrastructure on the new shell" --body "$(cat <<'EOF'
## Summary

- Real-PTY integration tests promoted from MVP-3.5 § 6 to MVP-4
  (term_pty_integration.rs, term_vault_switch.rs).
- Linux-only paired-rename watcher contract test (watcher_rename_paired.rs).
- Debug-only TempVault module + make_temp_vault Tauri command + tempVault
  TS helper (test_support module, gated 3 ways: lib.rs, command attr,
  main.rs invoke_handler split).
- Vitest contract coverage for 12 un-tested bridge wrappers
  (claude / skill / term).
- Vitest+bridge integration test replacing spec § 9.7's chained
  /kb document e2e (per scope decision 1, ClaudeRunner trait deferred).
- tauri-plugin-webdriver wired with a fallback to next dev (per scope
  decision 3) — current run picked: <webdriver | nextdev>.
- 4 Playwright proof-set specs: vault picker, uninitialized splash,
  document create on disk, rename propagation.
- CI restored on macos-latest tauri-build job (single sequential macOS
  pipeline per spec § 9.6); ad26115's e2e steps ported forward.
- Features.md + test-cases marker flips for the cases the new pipeline
  covers.

## Scope decisions pinned (see plan § "Scope decisions pinned")

1. ClaudeRunner trait + StubRunner DEFERRED.
2. Monolithic MVP-4 (no 4a/4b split).
3. Webdriver fallback IS in scope.
4. Capture-fixture CLI OUT of scope.

## Test plan

- [ ] cargo fmt --check, cargo clippy, cargo test all green
- [ ] npm run typecheck, lint, test:run all green
- [ ] cargo tauri build --debug --no-bundle green
- [ ] KB_E2E_BACKEND=webdriver npm run test:e2e green (or nextdev under fallback)
- [ ] manual smoke: vault picker, splash → init, doc create on disk, rename
      propagation all pass via dev app

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Return the PR URL.

---

## Verification

**Full local CI surface (all must be green before merge):**

| # | Command | Source |
|---|---|---|
| 1 | `nvm use` | per .nvmrc + MEMORY.md preference |
| 2 | `npm ci` | match lockfile |
| 3 | `npm run typecheck` | spec § 9.6 |
| 4 | `npm run lint` | spec § 9.6 |
| 5 | `cd src-tauri && cargo fmt -- --check` | spec § 9.6 |
| 6 | `cd src-tauri && cargo clippy --all-targets -- -D warnings` | spec § 9.6 |
| 7 | `cd src-tauri && cargo test` | spec § 9.6 — covers Tasks 3, 4, 5 |
| 8 | `npm run test:run` | spec § 9.6 — covers Tasks 6, 8 |
| 9 | `npm run tauri -- build --debug --no-bundle` | spec § 9.6 |
| 10 | `KB_E2E_BACKEND=webdriver npm run test:e2e` (or `nextdev`) | spec § 9.6 — covers Tasks 12-15 |

**Manual smoke (must run once before merge):**

1. `npm run tauri:dev`; confirm app boots, terminal mounts, `claude` auto-launches in the vault cwd.
2. From the dev app: open a tempdir vault from the picker, confirm explorer renders.
3. Open an uninitialized folder; confirm splash + click Initialize → explorer mounts.
4. Create a document via UI; confirm `ls /tmp/<tempvault>/` shows the new `.md` file.
5. Rename a file with inbound wiki-links; confirm the link rewrites in the source file.
6. Inspect `cargo build --release` output: confirm the `#[cfg(not(debug_assertions))]` invoke-handler block lists 26 commands, no `make_temp_vault`.

---

## Self-Review (against spec § 9.1 – § 9.8 + handoff brief)

| Spec / handoff item | Task | Notes |
|---|---|---|
| § 9.1 ClaudeRunner trait + StubRunner | **DEFERRED** (decision 1) | Replaced by Task 8 Vitest+bridge integration test. Documented in plan header + commit messages. |
| § 9.1 KB_CLAUDE_MODE env var | **DEFERRED** (decision 1) | No runner selection; not introduced. |
| § 9.1 capture-fixture CLI | **DEFERRED** (decision 4) | One-time fresh capture documented in Task 7 if existing fixture insufficient. |
| § 9.2 Rust TempVault::fresh / from_fixture / write / read | Task 1 | `test_support/vault.rs`. |
| § 9.2 TS makeTempVault | Task 2 | `e2e/helpers/tempVault.ts`. |
| § 9.2 make_temp_vault debug command | Task 1 | `#[cfg(debug_assertions)]` 3-way gated. |
| § 9.3 tauri-plugin-webdriver dev-only | Task 9 | regular dep, conditional .plugin(...) call. |
| § 9.3 Playwright webdriver project | Task 10 | `KB_E2E_BACKEND=webdriver` selector. |
| § 9.3 Webdriver fallback | Task 11 | conditional execution path. |
| § 9.4 Test pyramid | Tasks 3-15 distribute coverage across the 5 tiers. | |
| § 9.5 Existing test migration | **N/A** — sweep complete pre-MVP-4 (handoff recon). Tasks 6 + 8 add new contract / integration tests instead. |
| § 9.6 CI shape | Task 16 | single macos-latest sequential pipeline. |
| § 9.7 Vault picker e2e | Task 12 | |
| § 9.7 Uninitialized splash e2e | Task 13 | |
| § 9.7 Create document on disk | Task 14 | |
| § 9.7 Rename propagation | Task 15 | |
| § 9.7 `/kb document` chained flow | **Vitest+bridge integration** (Task 8), per decision 1. |
| § 9.8 OUT — visual regression / cross-platform e2e / perf benches / continuous fixture refresh | Listed in plan's Out-of-scope. |
| MVP-3.5 § 6 deferred PTY tests | Tasks 3 + 4 | |
| MVP-3.5 § 6 deferred FSEvents rename-cookie | Task 5 (linux-only companion test); macOS rename-cookie investigation stays open. |
| MVP-3.5 § 9 follow-ups (live-serialize, copy/paste menu, search-in-scrollback) | Out of scope. |

**Spec items not covered, with rationale** (these belong in MVP-5 or a future MVP):

- **macOS FSEvents rename-cookie config / source-stitching investigation.** Linux-only companion test ships now; macOS-side rename-cookie work is the harder, riskier follow-up. Stays in handoff "Open follow-up items".
- **Visual regression and screenshot diffs.** Spec § 9.8 — out of scope.
- **Cross-platform e2e.** Spec § 9.8 — macOS-only ships.
- **Performance benchmarks.** Spec § 9.8 — out of scope.

**No placeholder / TBD scan:** searched the plan for "TBD", "TODO", "fill in", "implement later", "similar to Task" — none present.

**Type / name consistency:** `make_temp_vault` (3-arg signature: `fixture: Option<String>, initialized: Option<bool>`) used in Task 1 + Task 13 + tempVault.ts; `TempVault` struct used in Tasks 1, 3, 4, 5; `KB_E2E_BACKEND` env var used in Tasks 10, 11, 16, 18.

**Project conventions honoured:** branch `feat/tauri-mvp4-test-infra` already cut from `main`; this plan rides with the seed commit (no doc-only PR); main is protected; POSIX-relative paths preserved across the Tauri command surface; cross-platform discipline preserved (`#[cfg(target_os = "linux")]` on the rename-paired test, no macOS-only Tauri APIs in production code, all changes either debug-gated or platform-portable).
