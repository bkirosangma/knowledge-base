# MVP-1b — File Watching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the timer-based polling loop in `FileWatcherContext` with a native, debounced filesystem watcher driven by Rust's `notify` crate, so the UI reacts to disk changes within ~200 ms instead of 5–30 s.

**Architecture:** Add a `WatcherState` to the Rust side that owns a `notify-debouncer-full` debouncer (200 ms coalesce) bound to the active vault root. Two new Tauri commands (`vault_watch_start`, `vault_watch_stop`) start and stop the watcher; the debouncer's worker task forwards each batch as a `vault_change` Tauri event with `{ kind, path, oldPath? }` payload. The frontend `FileWatcherContext` keeps its public shape (`subscribe / unsubscribe / refresh / lastSyncedAt`) but its body is body-swapped to: call `tauriBridge.watchStart()` when a vault is active, listen for `vault_change` via `@tauri-apps/api/event`, and fire registered subscribers on each event.

**Tech Stack:**
- Rust: `notify = "=6.1.1"`, `notify-debouncer-full = "=0.3.2"` (verified-resolved versions, pinned exactly so subagents don't bisect minor diffs in API shape), existing `tokio`, `tauri 2.11`, `serde`.
- Frontend: existing `@tauri-apps/api/core` (`invoke`) and `@tauri-apps/api/event` (`listen`).
- Tests: `cargo test` (Rust, pure translator + real-FS bypass-emit integration via `tempfile` + `tokio::sync::mpsc`; we deliberately do *not* depend on `tauri::test::mock_app` so the `test` feature flag stays off and FSEvents flake doesn't show up in unit-test runs), Vitest (frontend, with `vi.mock` of `@tauri-apps/api/core` + `@tauri-apps/api/event`).

---

## 1. Goal

Replace the periodic poll in `FileWatcherContext.tsx` (5 s active / 30 s idle) with native filesystem events emitted from a Rust-side `notify`-backed watcher. UX outcome: edits made outside the app surface in the UI within ~200 ms; CPU drops on idle. The watcher is started and stopped explicitly by the frontend so no ambient mutation runs in Rust.

## 2. Scope

**In scope:**
- Rust crate dependency on `notify` + `notify-debouncer-full`.
- New module `src-tauri/src/vault/watcher.rs` with a `Watcher` state struct, `start`/`stop` methods, and a debouncer-events forwarding task.
- Two new Tauri commands `vault_watch_start` / `vault_watch_stop` registered alongside the existing 12.
- A serializable `VaultChangeEvent { kind, path, oldPath? }` payload shape that matches the spec.
- Body swap of `FileWatcherContext.tsx` to event-driven, keeping its public API intact.
- New `tauriBridge.watchStart()` / `tauriBridge.watchStop()` typed wrappers.
- Update or replace `FileWatcherContext.test.tsx` to cover the event-driven behaviour.
- Audit `useFileExplorer.ts` for any leftover polling/handle-walking logic that is dead after this MVP and remove it. (Spec § 6.2.)
- `Features.md` + `test-cases/` updates for the new file-watcher semantics.

**Out of scope (explicitly):**
- Vault switching (changing the watched root mid-session) — MVP-1c will compose start/stop around vault changes; MVP-1b only wires single-vault.
- Per-event tree diff in `useFileExplorer` — subscribers continue to do a full `watcherRescan`; targeted invalidation is a future optimisation.
- Cross-platform e2e of the watcher — restoring Playwright is MVP-4.
- Rate limiting or backpressure tuning beyond the 200 ms debouncer.

## 3. File structure

**New (Rust):**
- `src-tauri/src/vault/watcher.rs` — `Watcher` state struct, `start(root, app_handle)`, `stop()`, `VaultChangeEvent` payload, `kind_from_notify_kind()` translator, `#[cfg(test)]` mod with tempdir-based tests.

**Modified (Rust):**
- `src-tauri/Cargo.toml` — add `notify = "6"` and `notify-debouncer-full = "0.3"` to `[dependencies]`.
- `src-tauri/src/vault/mod.rs` — `pub mod watcher;` and `pub use watcher::Watcher;`.
- `src-tauri/src/vault/commands.rs` — add `vault_watch_start` and `vault_watch_stop`.
- `src-tauri/src/main.rs` — register the 2 new commands in `generate_handler!` and add `Watcher::default()` to `manage()`.

**Modified (Frontend):**
- `src/app/knowledge_base/infrastructure/tauriBridge.ts` — add `watchStart()` and `watchStop()` to the exported `tauriBridge` object.
- `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` — add contract tests for the two new wrappers.
- `src/app/knowledge_base/shared/context/FileWatcherContext.tsx` — body swap; remove polling timers, idle backoff, visibility handling, input-activity tracker. Keep `subscribe / unsubscribe / refresh / lastSyncedAt`. Wire `bridge.watchStart()` on mount when `vaultPath` is non-null and `bridge.watchStop()` on unmount.
- `src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx` — replace polling-cadence tests with event-driven tests.
- `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` — audit; remove anything that was only there to compensate for slow polling (e.g. eager `setTree` calls coupled to the polling cycle). Concrete diff is determined during Task 11.
- `src/app/knowledge_base/knowledgeBase.tsx` — pass `vaultPath` (already in scope at the provider site post-MVP-1a) to `FileWatcherProvider`.

**Updated (docs / catalogues):**
- `Features.md` — replace the polling description with the native-watcher description (move from `?` if any, keep `⚙️`).
- `test-cases/` — flip any polling-cadence cases to reflect event-driven semantics; leave broader vault-watcher e2e cases at ❌ (still gated on MVP-4).

---

## 4. Cross-cutting rules

- **Branch:** `feat/tauri-mvp1b-file-watcher`, already created off `main` at `844a474`.
- **Commits:** small, frequent, prefixed `feat(tauri):` / `feat(infra):` / `feat(shell):` / `test(...)` / `chore(tauri):` to match the MVP-1a history.
- **Testing discipline:** TDD — write the failing Rust unit / Vitest test first, run, see RED, implement, run, see GREEN.
- **POSIX-relative paths in IPC:** the watcher emits paths *relative to the vault root* using forward slashes, just like `vault_list` does today.
- **No ambient mutation:** the watcher is started and stopped only via explicit commands. Rust never auto-starts.
- **Cross-platform discipline:** `notify` already abstracts FSEvents / inotify / ReadDirectoryChangesW. Don't add platform `cfg` branches without a documented reason.

---

## Task 1: Add `notify` + `notify-debouncer-full` to `Cargo.toml`

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add the dependencies (exact pins)**

In `[dependencies]`, after `tokio = { … }`, append:

```toml
notify = "=6.1.1"
notify-debouncer-full = "=0.3.2"
```

These are the versions the plan was written and validated against. Pin exactly with `=` so the executing engineer can't accidentally pull a minor with a renamed API (`tracker()`, `DebouncedEvent`, the closure type expected by `new_debouncer`).

- [ ] **Step 2: Verify the build resolves**

```bash
cd src-tauri && cargo build --tests 2>&1 | tail -20
```

Expected: build succeeds. The compile pulls `notify v6.1.1` + `notify-debouncer-full v0.3.2` plus their transitive deps (`fsevent-sys` on macOS, `inotify` on Linux, `file-id`, `filetime`).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "feat(tauri): add notify + notify-debouncer-full deps for MVP-1b"
```

---

## Task 2: Define the `VaultChangeEvent` payload

**Files:**
- Create: `src-tauri/src/vault/watcher.rs`
- Modify: `src-tauri/src/vault/mod.rs`

- [ ] **Step 1: Write the failing test**

Create `src-tauri/src/vault/watcher.rs` with only the test module first:

```rust
use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VaultChangeEvent {
    pub kind: ChangeKind,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChangeKind {
    Created,
    Modified,
    Deleted,
    Renamed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialises_with_camel_case_keys_and_snake_case_kind() {
        let evt = VaultChangeEvent {
            kind: ChangeKind::Renamed,
            path: "notes/b.md".into(),
            old_path: Some("notes/a.md".into()),
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert_eq!(
            json,
            r#"{"kind":"renamed","path":"notes/b.md","oldPath":"notes/a.md"}"#
        );
    }

    #[test]
    fn omits_old_path_when_none() {
        let evt = VaultChangeEvent {
            kind: ChangeKind::Created,
            path: "notes/c.md".into(),
            old_path: None,
        };
        let json = serde_json::to_string(&evt).unwrap();
        assert_eq!(json, r#"{"kind":"created","path":"notes/c.md"}"#);
    }
}
```

Place the `pub(crate) fn _root_marker(_: &PathBuf) {}` sentinel **above** the `#[cfg(test)] mod tests { … }` block (clippy's `items_after_test_module` lint fires on production items placed below a test module). The full layout, top-to-bottom, becomes: `use` imports → `VaultChangeEvent` struct → `ChangeKind` enum → sentinel `_root_marker` → `#[cfg(test)] mod tests`.

- [ ] **Step 2: Wire the module**

In `src-tauri/src/vault/mod.rs`, add after `pub mod path;`:

```rust
pub mod watcher;
```

- [ ] **Step 3: Run the tests; expect GREEN immediately**

```bash
cd src-tauri && cargo test --lib watcher::tests
```

Expected: `2 passed`. (Both tests are about pure serde shape, so they pass on first compile.)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/watcher.rs src-tauri/src/vault/mod.rs
git commit -m "feat(tauri): VaultChangeEvent payload for vault_change events"
```

---

## Task 3: Pure translator `to_vault_changes` (synthetic-input tests)

**Files:**
- Modify: `src-tauri/src/vault/watcher.rs`

> **Why pure first:** the watcher pipeline is `notify-debouncer-full → tokio mpsc → translator → tauri::AppHandle::emit`. Three of those four pieces (the debouncer, the channel, `emit`) are well-tested upstream; the only project-owned logic with non-trivial branching is `to_vault_changes`. We test it with synthetic `notify::Event` inputs in this task. Task 4 then validates the full real-FS path *up to but not including* `emit` via a real `notify-debouncer-full` watcher fed into the same translator.

- [ ] **Step 1: Write the failing tests**

Replace the `_root_marker` sentinel and append (above the existing `#[cfg(test)] mod tests`):

```rust
use notify::event::{EventKind, ModifyKind};
use notify_debouncer_full::DebouncedEvent;
use std::path::{Path, PathBuf};

/// Translate a debounced batch into 0..N `VaultChangeEvent`s with vault-relative POSIX paths.
/// Pure (no I/O, no Tauri).
///
/// Visibility is `pub` (not `pub(crate)`) because Task 4's `tests/watcher_integration.rs`
/// integration test compiles as a separate crate and would otherwise fail to link.
/// Clippy's `dead_code` lint also fires on `pub(crate)` symbols whose only callers are
/// `#[cfg(test)]` blocks under `cargo clippy --lib`.
pub fn to_vault_changes(events: Vec<DebouncedEvent>, root: &Path) -> Vec<VaultChangeEvent> {
    let mut out = Vec::with_capacity(events.len());
    for ev in events {
        let Some(kind) = classify(&ev.event.kind) else { continue };
        let mut paths = ev.event.paths.into_iter();
        let primary = match paths.next() { Some(p) => p, None => continue };
        let secondary = paths.next();

        let (final_path, old_path) = match (kind, secondary) {
            // notify orders rename pairs as [from, to].
            (ChangeKind::Renamed, Some(to)) => (to, Some(primary)),
            _ => (primary, None),
        };

        let Some(rel) = relativise(&final_path, root) else { continue };
        let old_rel = old_path.as_deref().and_then(|p| relativise(p, root));

        out.push(VaultChangeEvent { kind, path: rel, old_path: old_rel });
    }
    out
}

fn classify(kind: &EventKind) -> Option<ChangeKind> {
    match kind {
        EventKind::Create(_) => Some(ChangeKind::Created),
        EventKind::Modify(ModifyKind::Name(_)) => Some(ChangeKind::Renamed),
        EventKind::Modify(_) => Some(ChangeKind::Modified),
        EventKind::Remove(_) => Some(ChangeKind::Deleted),
        _ => None,
    }
}

fn relativise(p: &Path, root: &Path) -> Option<String> {
    p.strip_prefix(root).ok().map(|rel| {
        rel.components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/")
    })
}
```

Then in the existing `#[cfg(test)] mod tests` block, append after the existing serde tests:

```rust
    use notify::Event;
    use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode};
    use notify_debouncer_full::DebouncedEvent;
    use std::path::PathBuf;
    use std::time::Instant;

    fn synth(kind: EventKind, paths: Vec<PathBuf>) -> DebouncedEvent {
        DebouncedEvent::new(Event { kind, paths, attrs: Default::default() }, Instant::now())
    }

    #[test]
    fn translator_emits_created_for_create_event() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(EventKind::Create(CreateKind::File), vec!["/vault/notes/a.md".into()])],
            &root,
        );
        assert_eq!(out, vec![VaultChangeEvent {
            kind: ChangeKind::Created,
            path: "notes/a.md".into(),
            old_path: None,
        }]);
    }

    #[test]
    fn translator_emits_modified_for_data_modify() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Content)),
                       vec!["/vault/a.md".into()])],
            &root,
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, ChangeKind::Modified);
        assert_eq!(out[0].path, "a.md");
    }

    #[test]
    fn translator_emits_deleted_for_remove_event() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(EventKind::Remove(RemoveKind::File), vec!["/vault/a.md".into()])],
            &root,
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, ChangeKind::Deleted);
    }

    #[test]
    fn translator_emits_renamed_with_old_and_new_path() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                vec!["/vault/a.md".into(), "/vault/b.md".into()],
            )],
            &root,
        );
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].kind, ChangeKind::Renamed);
        assert_eq!(out[0].path, "b.md");
        assert_eq!(out[0].old_path.as_deref(), Some("a.md"));
    }

    #[test]
    fn translator_drops_paths_outside_root() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(EventKind::Create(CreateKind::File), vec!["/elsewhere/a.md".into()])],
            &root,
        );
        assert!(out.is_empty(), "expected empty, got {:?}", out);
    }

    #[test]
    fn translator_uses_forward_slashes_for_nested_paths() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(EventKind::Create(CreateKind::File), vec!["/vault/a/b/c.md".into()])],
            &root,
        );
        assert_eq!(out[0].path, "a/b/c.md");
    }
```

- [ ] **Step 2: Run — expect compile error**

```bash
cd src-tauri && cargo test --lib watcher::tests
```

Expected: `error[E0432]` because `notify`/`notify-debouncer-full` types aren't yet pulled into scope, OR the original `_root_marker` collides. Resolve by deleting the `_root_marker` sentinel.

- [ ] **Step 3: Run again — expect GREEN**

```bash
cd src-tauri && cargo test --lib watcher::tests
```

Expected: `2 (serde) + 6 (translator) = 8 passed`. If the renamed-pair test fails because the resolved version of `notify` constructs `RenameMode::Both` paths differently (`[from, to]` vs `[to, from]`), flip the order in the synth call AND in the production code (the translator's order assumption is the only knob).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/watcher.rs
git commit -m "feat(tauri): pure translator to_vault_changes for create/modify/delete/rename"
```

---

## Task 4: `Watcher::start` / `stop` + real-FS bypass-emit integration test

**Files:**
- Modify: `src-tauri/src/vault/watcher.rs`
- Create: `src-tauri/tests/watcher_integration.rs`

> **Why a separate integration test:** unit tests live in the library and don't need `tauri::AppHandle`. By putting the real-FS test in `tests/`, we can exercise the `notify-debouncer-full` ↔ `tokio::sync::mpsc` ↔ `to_vault_changes` chain end-to-end without standing up a `tauri::test::mock_app`. The only piece this leaves un-asserted is `app_handle.emit()` itself, which Tauri tests upstream and Task 12 (manual smoke) verifies in practice.

- [ ] **Step 1: Implement `Watcher::start`/`stop` (production)**

Append to `watcher.rs` after the translator (still above `#[cfg(test)] mod tests`):

```rust
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

const DEBOUNCE_MS: u64 = 200;

/// Owns the active filesystem debouncer and the task that forwards events
/// onto the `vault_change` Tauri event channel. `Default` constructs an
/// empty (not-yet-started) watcher; `start` arms it; `stop` disarms it.
#[derive(Default)]
pub struct Watcher {
    inner: Mutex<Option<WatcherInner>>,
}

struct WatcherInner {
    /// Holding the debouncer alive keeps the underlying `notify::RecommendedWatcher` alive.
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
    forwarder: JoinHandle<()>,
    root: PathBuf,
}

impl Watcher {
    /// Start watching `root`. Idempotent — calling `start` while already
    /// watching the same root is a no-op; calling it with a different root
    /// stops the existing watcher first.
    pub async fn start<R: Runtime>(
        &self,
        root: PathBuf,
        app: AppHandle<R>,
    ) -> Result<(), String> {
        let mut guard = self.inner.lock().await;
        if let Some(existing) = guard.as_ref() {
            if existing.root == root { return Ok(()); }
        }
        if let Some(old) = guard.take() {
            old.forwarder.abort();
        }

        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<notify_debouncer_full::DebounceEventResult>();

        let mut debouncer = new_debouncer(
            Duration::from_millis(DEBOUNCE_MS),
            None,
            move |res: notify_debouncer_full::DebounceEventResult| { let _ = tx.send(res); },
        )
        .map_err(|e| format!("debouncer init failed: {e}"))?;

        debouncer
            .watcher()
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("watch failed: {e}"))?;

        let app_handle = app.clone();
        let root_for_task = root.clone();
        let forwarder = tokio::spawn(async move {
            while let Some(batch_result) = rx.recv().await {
                let events = match batch_result {
                    Ok(events) => events,
                    Err(errs) => {
                        eprintln!("[vault watcher] notify errors: {errs:?}");
                        continue;
                    }
                };
                for change in to_vault_changes(events, &root_for_task) {
                    if let Err(e) = app_handle.emit("vault_change", change) {
                        eprintln!("[vault watcher] emit failed: {e}");
                    }
                }
            }
        });

        *guard = Some(WatcherInner { _debouncer: debouncer, forwarder, root });
        Ok(())
    }

    pub async fn stop(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(inner) = guard.take() {
            inner.forwarder.abort();
        }
    }
}
```

`Watcher::start` is `&self` (not `self: &Arc<Self>`) so tests and production can both call it on a plain `&Watcher` — the `Arc` wrapping happens at the manage-state callsite (Task 7) via the `WatcherState = Arc<Watcher>` alias defined in Task 6. Keep `to_vault_changes` `pub(crate)` so the `tests/watcher_integration.rs` integration test can reach it (it's already declared `pub(crate)` in Task 3 Step 1). Note that the integration test imports it as `knowledge_base_lib::vault::watcher::to_vault_changes` — confirm `pub mod watcher;` in `vault/mod.rs` (Task 2 Step 2) makes that path public.

- [ ] **Step 2: Sanity-build**

```bash
cd src-tauri && cargo build --tests 2>&1 | tail -10
```

Expected: green. If the resolved `notify-debouncer-full` 0.3.2 closure type isn't `DebounceEventResult`, look at `~/.cargo/registry/src/index.crates.io-*/notify-debouncer-full-0.3.2/src/lib.rs` and adjust the closure annotation.

- [ ] **Step 3: Write the failing real-FS integration test**

Create `src-tauri/tests/watcher_integration.rs`:

```rust
//! Real-FS integration tests for the watcher pipeline up to (but not
//! including) `tauri::AppHandle::emit`. We instantiate a real
//! `notify-debouncer-full` debouncer and feed its output through the
//! production `to_vault_changes` translator. This catches the parts of
//! the pipeline that pure unit tests can't (FSEvents/inotify quirks,
//! debounce window timing, rename-pair shape) without depending on
//! `tauri::test::mock_app`.

use std::time::Duration;
use tempfile::TempDir;
use tokio::sync::mpsc;

use knowledge_base_lib::vault::watcher::{to_vault_changes, ChangeKind, VaultChangeEvent};

const DEBOUNCE_MS: u64 = 200;
const COLLECT_WINDOW_MS: u64 = 800;

async fn collect(rx: &mut mpsc::UnboundedReceiver<notify_debouncer_full::DebounceEventResult>, root: &std::path::Path) -> Vec<VaultChangeEvent> {
    let deadline = tokio::time::Instant::now() + Duration::from_millis(COLLECT_WINDOW_MS);
    let mut out = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(timeout, rx.recv()).await {
            Ok(Some(Ok(events))) => out.extend(to_vault_changes(events, root)),
            Ok(Some(Err(_))) | Ok(None) => break,
            Err(_) => break,
        }
    }
    out
}

fn make_watcher(root: &std::path::Path) -> (notify_debouncer_full::Debouncer<notify::RecommendedWatcher, notify_debouncer_full::FileIdMap>, mpsc::UnboundedReceiver<notify_debouncer_full::DebounceEventResult>) {
    let (tx, rx) = mpsc::unbounded_channel();
    let mut debouncer = notify_debouncer_full::new_debouncer(
        Duration::from_millis(DEBOUNCE_MS),
        None,
        move |res| { let _ = tx.send(res); },
    ).expect("debouncer");
    debouncer.watcher().watch(root, notify::RecursiveMode::Recursive).expect("watch");
    (debouncer, rx)
}

#[tokio::test(flavor = "multi_thread")]
async fn create_emits_created() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    let (_d, mut rx) = make_watcher(&root);
    tokio::time::sleep(Duration::from_millis(50)).await;

    tokio::fs::write(root.join("a.md"), b"hi").await.unwrap();
    let events = collect(&mut rx, &root).await;
    assert!(events.iter().any(|e| e.kind == ChangeKind::Created && e.path == "a.md"),
        "expected created for a.md, got {:?}", events);
}

#[tokio::test(flavor = "multi_thread")]
async fn modify_emits_modified() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    tokio::fs::write(root.join("a.md"), b"v1").await.unwrap();
    let (_d, mut rx) = make_watcher(&root);
    tokio::time::sleep(Duration::from_millis(50)).await;

    tokio::fs::write(root.join("a.md"), b"v2").await.unwrap();
    let events = collect(&mut rx, &root).await;
    assert!(events.iter().any(|e| e.kind == ChangeKind::Modified && e.path == "a.md"),
        "expected modified for a.md, got {:?}", events);
}

#[tokio::test(flavor = "multi_thread")]
async fn delete_emits_deleted() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    tokio::fs::write(root.join("a.md"), b"x").await.unwrap();
    let (_d, mut rx) = make_watcher(&root);
    tokio::time::sleep(Duration::from_millis(50)).await;

    tokio::fs::remove_file(root.join("a.md")).await.unwrap();
    let events = collect(&mut rx, &root).await;
    assert!(events.iter().any(|e| e.kind == ChangeKind::Deleted),
        "expected deleted, got {:?}", events);
}

#[tokio::test(flavor = "multi_thread")]
async fn rename_emits_renamed_with_old_and_new_paths() {
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    tokio::fs::write(root.join("a.md"), b"x").await.unwrap();
    let (_d, mut rx) = make_watcher(&root);
    tokio::time::sleep(Duration::from_millis(50)).await;

    tokio::fs::rename(root.join("a.md"), root.join("b.md")).await.unwrap();
    let events = collect(&mut rx, &root).await;

    // Some platforms emit a single Modify(Name(Both)) carrying both paths;
    // others emit Remove(a.md) + Create(b.md). Accept both shapes — the
    // user-observable contract is that *some* event surfaces the move.
    let saw_paired_rename = events.iter().any(|e|
        e.kind == ChangeKind::Renamed && e.path == "b.md" && e.old_path.as_deref() == Some("a.md"));
    let saw_remove_plus_create = events.iter().any(|e| e.kind == ChangeKind::Deleted && e.path == "a.md")
        && events.iter().any(|e| e.kind == ChangeKind::Created && e.path == "b.md");
    assert!(saw_paired_rename || saw_remove_plus_create,
        "expected either paired rename or remove+create, got {:?}", events);
}
```

- [ ] **Step 4: Run; expect GREEN**

```bash
cd src-tauri && cargo test --test watcher_integration -- --nocapture
```

Expected: `4 passed` within ~5 seconds total. If a test times out on macOS (FSEvents cold-start latency), bump `COLLECT_WINDOW_MS` to 1500.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/vault/watcher.rs src-tauri/tests/watcher_integration.rs
git commit -m "feat(tauri): Watcher.start/stop + real-FS integration tests for translator"
```

---

## Task 5: State-machine idempotency tests

**Files:**
- Modify: `src-tauri/src/vault/watcher.rs` (tests only)

> **Scope note:** these are pure state-machine tests — they don't assert events emit anywhere. They confirm `stop` without `start` doesn't panic, double-stop doesn't panic, and `start → stop → start` cleanly re-arms the inner state. The "events fire after restart" claim is covered by the manual smoke (Task 12); Task 4's integration tests already prove the underlying watcher-spawn path works.

- [ ] **Step 1: Write the failing tests**

In `watcher.rs`'s `#[cfg(test)] mod tests`, append:

```rust
    use std::sync::Arc as TestArc; // alias because production uses `Arc` too

    /// Idempotency at the state-machine level: `stop` without prior `start` is a no-op.
    /// This test exercises only `Watcher::stop` — which doesn't take an AppHandle —
    /// and is sufficient because `stop`'s logic is `take()`-and-abort, with no
    /// dependence on whether `start` ever ran.
    #[tokio::test]
    async fn stop_without_start_is_a_noop() {
        let watcher = Watcher::default();
        watcher.stop().await; // must not panic
        watcher.stop().await; // double-stop must not panic
    }

    /// `Arc<Watcher>` is the production state shape. Confirm it cheaply.
    #[test]
    fn watcher_default_is_arc_clonable() {
        let w = TestArc::new(Watcher::default());
        let _w2 = TestArc::clone(&w);
    }
```

Note: the "start → stop → start re-arms cleanly" claim is **not** unit-testable without a `tauri::AppHandle`. Coverage:
- The inner state-replacement logic in `start` is verified by code review during Task 4 (you read the implementation while writing the integration tests).
- The end-to-end re-arm behaviour is verified by Task 12's manual smoke (start app → kill watcher → toggle vault → confirm events resume).
- If MVP-1c needs programmatic restart-on-vault-switch, that MVP can add a `tauri::test`-backed test there with the `test` feature gated on dev-deps.

- [ ] **Step 2: Run; expect GREEN**

```bash
cd src-tauri && cargo test --lib watcher::tests
```

Expected: `8 (translator + serde) + 2 (idempotency) = 10 passed`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/vault/watcher.rs
git commit -m "test(tauri): watcher stop is idempotent without prior start"
```

---

## Task 6: `vault_watch_start` / `vault_watch_stop` Tauri commands

**Files:**
- Modify: `src-tauri/src/vault/commands.rs`
- Modify: `src-tauri/src/vault/mod.rs`

- [ ] **Step 1: Re-export `Watcher` from `vault` and define a state alias**

In `src-tauri/src/vault/mod.rs`, add at the bottom:

```rust
pub use watcher::Watcher;
pub type WatcherState = Arc<Watcher>;
```

- [ ] **Step 2: Add the commands**

Append to `src-tauri/src/vault/commands.rs`:

```rust
use super::watcher::Watcher;
use std::sync::Arc;
use tauri::AppHandle;

#[tauri::command]
pub async fn vault_watch_start(
    app: AppHandle,
    state: State<'_, VaultState>,
    watcher: State<'_, Arc<Watcher>>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    watcher
        .start(root, app)
        .await
        .map_err(|message| VaultError::Io { path: String::new(), message })
}

#[tauri::command]
pub async fn vault_watch_stop(
    watcher: State<'_, Arc<Watcher>>,
) -> Result<(), VaultError> {
    watcher.stop().await;
    Ok(())
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd src-tauri && cargo build
```

Expected: success. If `cargo` complains that `Arc<Watcher>` isn't managed yet, that's fine — Task 7 wires it.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/commands.rs src-tauri/src/vault/mod.rs
git commit -m "feat(tauri): vault_watch_start and vault_watch_stop commands"
```

---

## Task 7: Register the new commands and watcher state in `main.rs`

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Manage `Watcher` state and register commands**

Replace the file's body with:

```rust
use knowledge_base_lib::vault::{commands, Vault, VaultState, Watcher, WatcherState};
use std::sync::Arc;

fn main() {
    let vault: VaultState = Arc::new(Vault::default());
    let watcher: WatcherState = Arc::new(Watcher::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(vault)
        .manage(watcher)
        .invoke_handler(tauri::generate_handler![
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify build + tests**

```bash
cd src-tauri && cargo build && cargo test
```

Expected: green; 7+ vault tests still pass and the new commands compile.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(tauri): register watcher state and watch_start/stop commands"
```

---

## Task 8: `tauriBridge.watchStart` / `watchStop` typed wrappers + tests

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/tauriBridge.ts`
- Modify: `src/app/knowledge_base/infrastructure/tauriBridge.test.ts`

- [ ] **Step 1: Write the failing contract tests**

In `tauriBridge.test.ts`, add:

```ts
describe("watchStart / watchStop", () => {
  it("invokes vault_watch_start with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.watchStart();
    expect(invokeMock).toHaveBeenCalledWith("vault_watch_start", {});
  });

  it("invokes vault_watch_stop with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.watchStop();
    expect(invokeMock).toHaveBeenCalledWith("vault_watch_stop", {});
  });

  it("translates raw VaultError on watch_start failure", async () => {
    invokeMock.mockRejectedValueOnce({ kind: "no_vault" });
    await expect(tauriBridge.watchStart()).rejects.toMatchObject({
      kind: "unknown",
      message: expect.stringContaining("No vault configured"),
    });
  });
});
```

(`invokeMock` is the existing `vi.mock`'d `invoke` from `@tauri-apps/api/core` — match the pattern used in the surrounding tests.)

- [ ] **Step 2: Run; expect FAIL**

```bash
npx vitest run src/app/knowledge_base/infrastructure/tauriBridge.test.ts
```

Expected: 3 fails citing `tauriBridge.watchStart is not a function`.

- [ ] **Step 3: Implement the wrappers**

In `tauriBridge.ts`, append two new methods to the `tauriBridge` export, keeping the same `call()` helper used by everything else:

```ts
  watchStart(): Promise<void> {
    return call<void>("vault_watch_start", {}, "");
  },
  watchStop(): Promise<void> {
    return call<void>("vault_watch_stop", {}, "");
  },
```

- [ ] **Step 4: Run; expect GREEN**

```bash
npx vitest run src/app/knowledge_base/infrastructure/tauriBridge.test.ts
```

Expected: all tests pass (the 3 new + everything that was passing before).

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tauriBridge.ts src/app/knowledge_base/infrastructure/tauriBridge.test.ts
git commit -m "feat(infra): tauriBridge.watchStart / watchStop wrappers"
```

---

## Task 9: Body-swap `FileWatcherContext.tsx` to event-driven

**Files:**
- Modify: `src/app/knowledge_base/shared/context/FileWatcherContext.tsx`
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 1: Update the provider to accept `vaultPath` and use events**

Rewrite `FileWatcherContext.tsx`. Keep the public types unchanged; replace the body. The new file:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { tauriBridge } from "../../infrastructure/tauriBridge";

interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
  /**
   * Epoch ms of the most recent dispatched event (or mount time before
   * any event). Consumer chips like "Last synced N s ago" read this.
   */
  lastSyncedAt: number;
}

const FileWatcherContext = createContext<FileWatcherContextValue | null>(null);

export function useFileWatcher(): FileWatcherContextValue {
  const ctx = useContext(FileWatcherContext);
  if (!ctx) throw new Error("useFileWatcher must be used within FileWatcherProvider");
  return ctx;
}

interface ProviderProps {
  vaultPath: string | null;
  children: ReactNode;
}

export function FileWatcherProvider({ vaultPath, children }: ProviderProps) {
  const subscribersRef = useRef(new Map<string, () => Promise<void>>());
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now());

  const fanOut = useCallback(async () => {
    const subs = [...subscribersRef.current.values()];
    await Promise.allSettled(subs.map((fn) => fn()));
    setLastSyncedAt(Date.now());
  }, []);

  // Start/stop the Rust watcher around vault lifecycle.
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void tauriBridge.watchStart().catch((err) => {
      if (!cancelled) {
        // Log only; fall back to manual refreshes via subscribers.
        // Typed FileSystemError surface from MVP-1a's Phase 5c carries the kind.
        console.warn("[FileWatcher] watchStart failed:", err);
      }
    });
    return () => {
      cancelled = true;
      void tauriBridge.watchStop().catch(() => undefined);
    };
  }, [vaultPath]);

  // Listen for vault_change events and fan out to subscribers.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen("vault_change", () => { void fanOut(); }).then((fn) => {
      if (cancelled) { fn(); } else { unlisten = fn; }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fanOut]);

  const subscribe = useCallback((id: string, fn: () => Promise<void>) => {
    subscribersRef.current.set(id, fn);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const refresh = useCallback(() => { void fanOut(); }, [fanOut]);

  const value = useMemo<FileWatcherContextValue>(
    () => ({ subscribe, unsubscribe, refresh, lastSyncedAt }),
    [subscribe, unsubscribe, refresh, lastSyncedAt],
  );

  return <FileWatcherContext.Provider value={value}>{children}</FileWatcherContext.Provider>;
}
```

- [ ] **Step 2: Pass `vaultPath` from `knowledgeBase.tsx`**

Find the `<FileWatcherProvider>` mount in `src/app/knowledge_base/knowledgeBase.tsx` and add the `vaultPath` prop sourced from the same place `RepositoryProvider` reads it. The exact diff depends on the surrounding context, but it must look like:

```tsx
<FileWatcherProvider vaultPath={vaultPath}>
  …
</FileWatcherProvider>
```

If there's no obvious `vaultPath` in scope, lift it from the parent component or pull it from `useRepositories()` — whichever matches the existing pattern for `RepositoryProvider`.

- [ ] **Step 3: Run typecheck — expect existing test failures, not type errors**

```bash
npm run typecheck
```

Expected: no type errors. If there are call-site mismatches (e.g. `<FileWatcherProvider>` rendered without `vaultPath`), fix them — the prop is now required.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/context/FileWatcherContext.tsx src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(shell): FileWatcherContext body-swapped to vault_change events"
```

---

## Task 10: Replace `FileWatcherContext.test.tsx` with event-driven tests

**Files:**
- Modify: `src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx`

- [ ] **Step 1: Replace the file**

Overwrite with the event-driven tests. Mock `@tauri-apps/api/event`'s `listen` and the `tauriBridge` module:

```tsx
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileWatcherProvider,
  useFileWatcher,
} from "./FileWatcherContext";

// Capture the registered event handler so tests can fire it.
let registeredHandler: ((event: { payload: unknown }) => void) | null = null;
const unlistenMock = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_name: string, handler: (e: { payload: unknown }) => void) => {
    registeredHandler = handler;
    return unlistenMock;
  }),
}));

const watchStartMock = vi.fn().mockResolvedValue(undefined);
const watchStopMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    watchStart: watchStartMock,
    watchStop: watchStopMock,
  },
}));

describe("FileWatcherContext", () => {
  beforeEach(() => {
    registeredHandler = null;
    watchStartMock.mockClear();
    watchStopMock.mockClear();
    unlistenMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function wrapper(vaultPath: string | null) {
    return ({ children }: { children: React.ReactNode }) => (
      <FileWatcherProvider vaultPath={vaultPath}>{children}</FileWatcherProvider>
    );
  }

  it("calls watchStart when vaultPath is set and watchStop on unmount", async () => {
    const { unmount } = render(
      <FileWatcherProvider vaultPath="/tmp/vault">{null}</FileWatcherProvider>,
    );
    // microtask flush
    await Promise.resolve();
    expect(watchStartMock).toHaveBeenCalledTimes(1);

    unmount();
    await Promise.resolve();
    expect(watchStopMock).toHaveBeenCalledTimes(1);
  });

  it("does not call watchStart when vaultPath is null", async () => {
    render(<FileWatcherProvider vaultPath={null}>{null}</FileWatcherProvider>);
    await Promise.resolve();
    expect(watchStartMock).not.toHaveBeenCalled();
  });

  it("fires every subscriber on each vault_change event and updates lastSyncedAt", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve(); // let listen() resolve

    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    act(() => {
      result.current.subscribe("a", a);
      result.current.subscribe("b", b);
    });

    const beforeAt = result.current.lastSyncedAt;
    await act(async () => {
      registeredHandler?.({ payload: { kind: "modified", path: "a.md" } });
      // allow Promise.allSettled to flush
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(result.current.lastSyncedAt).toBeGreaterThanOrEqual(beforeAt);
  });

  it("refresh() triggers an immediate fan-out", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve();

    const fn = vi.fn().mockResolvedValue(undefined);
    act(() => result.current.subscribe("x", fn));

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes the callback", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve();

    const fn = vi.fn().mockResolvedValue(undefined);
    act(() => result.current.subscribe("x", fn));
    act(() => result.current.unsubscribe("x"));

    await act(async () => {
      registeredHandler?.({ payload: { kind: "modified", path: "a.md" } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run; expect GREEN**

```bash
npx vitest run src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx
```

Expected: all 5 tests pass. If `useFileWatcher` throws because the mock's `listen` resolves on a later tick, add an extra `await Promise.resolve()` in the test setup before reading `result.current`.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/shared/context/FileWatcherContext.test.tsx
git commit -m "test(shell): event-driven FileWatcherContext spec replaces polling tests"
```

---

## Task 11: Audit and trim `useFileExplorer.ts`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` (only if dead code is found)

- [ ] **Step 1: Audit**

Re-read the hook end-to-end. Spec § 6.2 says "polling/handle-walking logic in `useFileExplorer.ts` is retired here" — most of the FSA handle-walking already came out in MVP-1a, so the audit is for residue. Look for:
- Manual `setInterval`/`setTimeout` polling outside the new event flow.
- Code that exists only because the old context polled at 5–30 s cadence (e.g. eager `setTree` after writes, double-rescan on visibility change).
- Imports left over from the previous polling abstraction (e.g. `IDLE_POLL_MS` references).

- [ ] **Step 2: Remove what's dead; keep `watcherRescan`**

`watcherRescan` (line ~147) is the registered subscriber callback — it stays. Remove only code that's redundant with the new event-driven watcher.

- [ ] **Step 3: Verify nothing regressed**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useFileExplorer
```

Expected: all `useFileExplorer` tests pass. If a test relied on the old polling cadence, update or delete it; new file-watcher behaviour is covered by the FileWatcherContext suite.

- [ ] **Step 4: Commit (if anything changed)**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts
git commit -m "refactor(shell): trim residual polling logic from useFileExplorer"
```

If nothing changed, skip the commit and note in the PR description.

---

## Task 12: End-to-end smoke

**Files:** none changed (manual verification).

- [ ] **Step 1: Boot the app**

```bash
npx tauri dev
```

- [ ] **Step 2: Pick a test vault** through the existing dialog.

- [ ] **Step 3: From a separate terminal, perform each operation against the vault directory:**

```bash
echo "hello" > /path/to/vault/notes/new.md           # created
echo "world" >> /path/to/vault/notes/new.md          # modified
mv /path/to/vault/notes/new.md /path/to/vault/notes/renamed.md   # renamed
rm /path/to/vault/notes/renamed.md                   # deleted
```

For each, confirm the UI's file tree refreshes within ~1 second and the "Last synced" chip in the footer updates. Open the devtools console: `vault_change` events should be visible without errors.

- [ ] **Step 4: Stop the app and confirm no orphan watcher process** (`ps -ef | grep notify` returns nothing).

This is a manual gate; no commit. If anything fails, return to the offending Rust task and fix.

---

## Task 13: Run the full local CI surface

**Files:** none changed (verification).

- [ ] **Step 1: Run all gates**

```bash
npm run typecheck
npm run lint
npm run test:run
(cd src-tauri && cargo fmt -- --check && cargo clippy -- -D warnings && cargo test)
GITHUB_PAGES=true npm run build
(cd src-tauri && cargo tauri build --debug)
```

Expected: every step green. The Tauri release build should still produce a `.app` under `src-tauri/target/debug/bundle/macos/`.

- [ ] **Step 2: Fix any hits, commit them as small targeted commits.**

---

## Task 14: Update `Features.md`, `test-cases/`, push, and open PR

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/01-app-shell.md` (or whichever bucket owns "file watcher")
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Update `Features.md`**

Find the "file watching" entry under the Desktop Shell section (added in MVP-1a). Replace its body to reflect native event-driven watching, ~200 ms debounce, and reference `src-tauri/src/vault/watcher.rs`. Remove any mention of 5 s / 30 s polling.

- [ ] **Step 2: Update `test-cases/`**

Locate cases that describe polling cadence; rewrite them to describe event-driven semantics. Don't flip ❌ → ✅ markers — restoring Playwright is MVP-4. Cases that were 🚫 because they required real disk events stay 🚫 with their existing reason; promotion is MVP-5.

- [ ] **Step 3: Update the handoff doc**

Edit `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`:
- Bump `Last updated` to today's date with a short summary ("MVP-1b file watcher merged via PR #N").
- In the **Where we are → Plans** table, flip MVP-1b to ✅ Merged with PR number once the PR lands. (You'll need a follow-up commit to fill in the PR number; that's fine, push it before merging.)
- Add to **Reference architecture**: `src-tauri/src/vault/watcher.rs`, the two new commands, and the new `FileWatcherProvider({ vaultPath })` shape.
- Replace **Next Action** with the bootstrap instructions for MVP-1c (write its plan, base off main, etc.).

- [ ] **Step 4: Final commit**

```bash
git add Features.md test-cases/ docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "docs(kb): native file watcher in Features.md, test-cases, handoff"
```

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/tauri-mvp1b-file-watcher
gh pr create --title "feat(tauri): MVP-1b — native debounced file watcher" --body "$(cat <<'EOF'
## Summary
- Rust `notify-debouncer-full` watcher on the vault root (200 ms coalesce)
- 2 new Tauri commands: `vault_watch_start`, `vault_watch_stop`
- `vault_change` events with `{ kind, path, oldPath? }` payload (POSIX-relative paths)
- `FileWatcherContext` body-swapped to event-driven; public API unchanged
- Polling timers (5 s / 30 s) and visibility/idle backoff retired

## Out of scope (next MVPs)
- Vault switching (start/stop around vault changes) → MVP-1c
- Per-event tree diffs in subscribers → future optimisation
- Playwright e2e restoration → MVP-4

## Test plan
- [ ] `npm run typecheck && npm run lint && npm run test:run`
- [ ] `cd src-tauri && cargo fmt -- --check && cargo clippy -- -D warnings && cargo test`
- [ ] Manual smoke: `npx tauri dev`, edit/create/rename/delete files in the vault from a separate terminal, observe UI updates within ~1 s

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR review + merge, run the **Post-merge cleanup protocol** in the handoff doc, then write the MVP-1c plan and start it.

---

## Summary

14 tasks, decomposed:
- **Task 1** — Pin and add `notify` + `notify-debouncer-full` deps.
- **Task 2** — Pure `VaultChangeEvent` payload + serde shape tests.
- **Task 3** — Pure `to_vault_changes` translator with synthetic-input tests (no I/O, no Tauri).
- **Task 4** — `Watcher::start`/`stop` production + real-FS bypass-emit integration tests in `tests/watcher_integration.rs`.
- **Task 5** — State-machine idempotency (stop-without-start no-op; arc-clonable).
- **Task 6** — `vault_watch_start` / `vault_watch_stop` Tauri commands.
- **Task 7** — Register the watcher state + commands in `main.rs`.
- **Task 8** — `tauriBridge.watchStart` / `watchStop` typed wrappers, contract-tested.
- **Task 9** — Body-swap `FileWatcherContext.tsx` to event-driven (`listen('vault_change', ...)` + lifecycle).
- **Task 10** — Replace `FileWatcherContext.test.tsx` with event-driven tests.
- **Task 11** — Audit `useFileExplorer.ts` for residual polling logic; trim if found.
- **Task 12** — Manual `npx tauri dev` smoke for the four event kinds + clean shutdown.
- **Task 13** — Full local CI surface (typecheck, lint, vitest, cargo fmt/clippy/test, build, tauri build).
- **Task 14** — Update `Features.md`, `test-cases/`, handoff doc; push and open PR.

**Test totals after Task 5:** 12 Rust tests (2 serde + 6 translator + 4 real-FS integration + 2 idempotency) + 3 new Vitest tests in `tauriBridge.test.ts` (Task 8) + 5 in `FileWatcherContext.test.tsx` (Task 10) = +20 across the suite.

## Out of scope (next MVPs)

- **MVP-1c** — settings persistence, last-vault recall, vault switcher dropdown, uninitialised-folder splash. Composes start/stop around vault changes.
- **MVP-1d** — FSA repo deletions, GitHub Pages workflow removal, lingering `useOfflineCache` and `historyPersistence` cleanup, restoring docs.
- **MVP-4** — restore Playwright on `tauri-plugin-webdriver`; this is when `vault_change`-driven UI flows become e2e-testable.

## Self-Review

**Spec coverage check** — every § 6.2 line maps to a task:
- "Add `notify` crate to Rust. Debounced watcher on the vault root (200 ms coalesce window)." → Tasks 1, 4.
- "New commands: `vault_watch_start()`, `vault_watch_stop()`." → Tasks 6, 7.
- "Watcher emits `vault_change` events with `{ kind, path, oldPath? }`." → Tasks 2, 3 (translator), 4 (real-FS pipeline).
- "Frontend `FileWatcherContext` subscribes via `listen('vault_change', ...)` and dispatches to the same downstream consumers." → Tasks 9, 10.
- "Polling/handle-walking logic in `useFileExplorer.ts` is retired here." → Task 11.

**Placeholder scan:** "TBD"/"TODO"/"appropriate error handling"/"similar to" — none introduced. Task 4's rename test deliberately accepts both "paired rename" and "remove+create" event shapes because notify's behaviour varies by platform; this is documented branching, not a placeholder.

**Test approach (deliberate departure from mock_app):**
- Task 3 covers `to_vault_changes` with synthetic `notify::Event` inputs. 6 tests, no I/O, no Tauri.
- Task 4 covers the real `notify-debouncer-full` ↔ `tokio::sync::mpsc` ↔ `to_vault_changes` chain via `tests/watcher_integration.rs`. 4 tests using `tempfile::TempDir`. Bypasses `tauri::AppHandle::emit` so the `tauri = features = ["test"]` flag stays off.
- Task 5 covers state-machine idempotency (stop without start; arc-clonable). 2 tests.
- Task 12 (manual smoke) is the only check on the `app_handle.emit("vault_change", ...)` line — Tauri tests upstream that an emitted event reaches `listen()` consumers, so this is fine.

**Type consistency:**
- `VaultChangeEvent { kind: "created"|"modified"|"deleted"|"renamed", path, oldPath? }` matches spec § 6.2 and is consistent across Tasks 2 (Rust serde), 8 (TS contract test), 10 (Vitest payload).
- `tauriBridge.watchStart` / `watchStop` names are stable across Tasks 8, 9, 10.
- `Watcher::start(root, app)` / `Watcher::stop()` names are stable across Tasks 4–7. `start` is `&self` (not `self: &Arc<Self>`); the `Arc` wrapping happens at the manage-state callsite via `WatcherState = Arc<Watcher>`.
- `VaultError::Io { path, message }` translation for watcher-init failures (Task 6) matches the existing `VaultError` shape from MVP-1a.

**Pinned versions (verified locally):**
- `notify = "=6.1.1"` and `notify-debouncer-full = "=0.3.2"` resolved on `cargo build --tests` against `tauri = "=2.11.1"`. The exact pin prevents subagents from bisecting silent API drift.

**Scope check:** every task is tightly bounded; only Task 11 is potentially open-ended (audit) — the step explicitly says "skip the commit if nothing changed".
