//! Test-only filesystem watcher for the test_server. Mirrors the
//! production `vault::watcher::Watcher` debouncer setup but emits
//! `VaultChangeEvent`s through the test_server's `EventBus` (SSE on
//! `/events`) instead of `app.emit("vault_change", _)`.
//!
//! Lives entirely under `#[cfg(debug_assertions)]` (the whole
//! `test_server` mod) — production code paths are untouched.
//!
//! Why a parallel watcher instead of refactoring `vault::watcher::Watcher`
//! to take an emitter trait? The production `Watcher::start` signature
//! (`start<R: Runtime>(root, app: AppHandle<R>)`) is hot-path code.
//! Refactoring it for a test-only concern would put a generic emitter
//! seam in production. Duplicating ~60 lines of debouncer wiring here
//! is a smaller surface change with zero blast radius outside test_server.

use std::path::PathBuf;
use std::time::Duration;

use notify::RecursiveMode;
use notify::Watcher as _;
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use super::events::EventBus;
use crate::vault::watcher::{postprocess_existence, to_vault_changes};

const DEBOUNCE_MS: u64 = 200;

/// Owns the active filesystem debouncer + the forwarder task that
/// translates notify events into `vault_change` SSE broadcasts.
#[derive(Default)]
pub struct TestWatcher {
    inner: Mutex<Option<TestWatcherInner>>,
}

struct TestWatcherInner {
    /// Holding the debouncer alive keeps the underlying notify watcher alive.
    _debouncer: Debouncer<notify::RecommendedWatcher, FileIdMap>,
    forwarder: JoinHandle<()>,
    root: PathBuf,
}

impl TestWatcher {
    /// Start watching `root`. Idempotent on the same root; switching to
    /// a different root stops the existing watcher first.
    pub async fn start(&self, root: PathBuf, events: EventBus) -> Result<(), String> {
        let root = root
            .canonicalize()
            .map_err(|e| format!("canonicalize failed: {e}"))?;

        let mut guard = self.inner.lock().await;
        if let Some(existing) = guard.as_ref() {
            if existing.root == root {
                return Ok(());
            }
        }
        if let Some(old) = guard.take() {
            old.forwarder.abort();
        }

        let (tx, mut rx) =
            tokio::sync::mpsc::unbounded_channel::<notify_debouncer_full::DebounceEventResult>();

        let mut debouncer = new_debouncer(
            Duration::from_millis(DEBOUNCE_MS),
            None,
            move |res: notify_debouncer_full::DebounceEventResult| {
                let _ = tx.send(res);
            },
        )
        .map_err(|e| format!("debouncer init failed: {e}"))?;

        debouncer
            .watcher()
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("watch failed: {e}"))?;

        // Prime FileIdMap for rename-pair stitching (matches production).
        debouncer.cache().add_root(&root, RecursiveMode::Recursive);

        let events_for_task = events.clone();
        let root_for_task = root.clone();
        let forwarder = tokio::spawn(async move {
            while let Some(batch_result) = rx.recv().await {
                let raw_events = match batch_result {
                    Ok(events) => events,
                    Err(errs) => {
                        eprintln!("[test_server watcher] notify errors: {errs:?}");
                        continue;
                    }
                };
                let translated = to_vault_changes(raw_events, &root_for_task);
                let changes = postprocess_existence(&translated, &root_for_task).await;
                for change in changes {
                    events_for_task.emit("vault_change", change);
                }
            }
        });

        *guard = Some(TestWatcherInner {
            _debouncer: debouncer,
            forwarder,
            root,
        });
        Ok(())
    }

    pub async fn stop(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(inner) = guard.take() {
            inner.forwarder.abort();
        }
    }
}
