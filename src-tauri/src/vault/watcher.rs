use notify::event::{EventKind, ModifyKind};
use notify::RecursiveMode;
use notify::Watcher as _;
use notify_debouncer_full::DebouncedEvent;
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

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
        let Some(kind) = classify(&ev.event.kind) else {
            continue;
        };
        let mut paths = ev.event.paths.into_iter();
        let primary = match paths.next() {
            Some(p) => p,
            None => continue,
        };
        let secondary = paths.next();

        let (final_path, old_path) = match (kind, secondary) {
            // notify orders rename pairs as [from, to].
            (ChangeKind::Renamed, Some(to)) => (to, Some(primary)),
            _ => (primary, None),
        };

        let Some(rel) = relativise(&final_path, root) else {
            continue;
        };
        let old_rel = old_path.as_deref().and_then(|p| relativise(p, root));

        out.push(VaultChangeEvent {
            kind,
            path: rel,
            old_path: old_rel,
        });
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
    pub async fn start<R: Runtime>(&self, root: PathBuf, app: AppHandle<R>) -> Result<(), String> {
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

        // Prime the FileIdMap cache for rename-pair stitching on macOS/Windows.
        // Without this, renames of pre-existing files in the vault never
        // produce a paired Renamed event (only a Created for the destination).
        debouncer.cache().add_root(&root, RecursiveMode::Recursive);

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
                let translated = to_vault_changes(events, &root_for_task);
                let changes = postprocess_existence(&translated, &root_for_task).await;
                for change in changes {
                    if let Err(e) = app_handle.emit("vault_change", change) {
                        eprintln!("[vault watcher] emit failed: {e}");
                    }
                }
            }
        });

        *guard = Some(WatcherInner {
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

/// Walk a freshly-translated batch and rewrite `Modified` events whose paths
/// no longer exist on disk into `Deleted`. Works around a notify 6.1.1 +
/// macOS-FSEvents quirk where `unlink(2)` surfaces as `Modify(Data(Content))`
/// rather than `Remove`. Created/Renamed/already-Deleted events pass through
/// unchanged. Permission-denied or other I/O errors leave the kind alone —
/// only the unambiguous `NotFound` signal triggers a rewrite.
///
/// Visibility is `pub` (not `pub(crate)`) because `tests/watcher_integration.rs`
/// compiles as a separate crate and calls this directly to verify the
/// FSEvents-on-delete fix end-to-end (the integration tests build their own
/// debouncer rather than going through `Watcher::start`, so the worker's
/// post-process is never reached along that path).
pub async fn postprocess_existence(
    events: &[VaultChangeEvent],
    root: &std::path::Path,
) -> Vec<VaultChangeEvent> {
    let mut out = Vec::with_capacity(events.len());
    for e in events {
        if e.kind != ChangeKind::Modified {
            out.push(e.clone());
            continue;
        }
        let abs = root.join(&e.path);
        match tokio::fs::metadata(&abs).await {
            Ok(_) => out.push(e.clone()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                out.push(VaultChangeEvent {
                    kind: ChangeKind::Deleted,
                    path: e.path.clone(),
                    old_path: e.old_path.clone(),
                });
            }
            Err(_) => out.push(e.clone()), // permission errors etc. — leave untouched
        }
    }
    out
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

    use notify::event::{CreateKind, EventKind, ModifyKind, RemoveKind, RenameMode};
    use notify::Event;
    use notify_debouncer_full::DebouncedEvent;
    use std::path::PathBuf;
    use std::time::Instant;

    fn synth(kind: EventKind, paths: Vec<PathBuf>) -> DebouncedEvent {
        DebouncedEvent::new(
            Event {
                kind,
                paths,
                attrs: Default::default(),
            },
            Instant::now(),
        )
    }

    #[test]
    fn translator_emits_created_for_create_event() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(
                EventKind::Create(CreateKind::File),
                vec!["/vault/notes/a.md".into()],
            )],
            &root,
        );
        assert_eq!(
            out,
            vec![VaultChangeEvent {
                kind: ChangeKind::Created,
                path: "notes/a.md".into(),
                old_path: None,
            }]
        );
    }

    #[test]
    fn translator_emits_modified_for_data_modify() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(
                EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Content)),
                vec!["/vault/a.md".into()],
            )],
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
            vec![synth(
                EventKind::Remove(RemoveKind::File),
                vec!["/vault/a.md".into()],
            )],
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
            vec![synth(
                EventKind::Create(CreateKind::File),
                vec!["/elsewhere/a.md".into()],
            )],
            &root,
        );
        assert!(out.is_empty(), "expected empty, got {:?}", out);
    }

    #[test]
    fn translator_uses_forward_slashes_for_nested_paths() {
        let root = PathBuf::from("/vault");
        let out = to_vault_changes(
            vec![synth(
                EventKind::Create(CreateKind::File),
                vec!["/vault/a/b/c.md".into()],
            )],
            &root,
        );
        assert_eq!(out[0].path, "a/b/c.md");
    }

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

    #[tokio::test]
    async fn rewrites_modified_to_deleted_when_path_is_gone() {
        use tempfile::TempDir;
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        // Path that does not exist on disk.
        let absent = root.join("ghost.md");

        let translated = vec![VaultChangeEvent {
            kind: ChangeKind::Modified,
            path: "ghost.md".to_string(),
            old_path: None,
        }];

        let post = postprocess_existence(&translated, &root).await;
        assert_eq!(post.len(), 1);
        assert_eq!(
            post[0].kind,
            ChangeKind::Deleted,
            "expected re-emit as Deleted"
        );
        let _ = absent; // sanity: silences unused-binding lint without dead_code attr
    }

    #[tokio::test]
    async fn keeps_modified_when_path_still_exists() {
        use tempfile::TempDir;
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let p = root.join("real.md");
        tokio::fs::write(&p, b"hi").await.unwrap();

        let translated = vec![VaultChangeEvent {
            kind: ChangeKind::Modified,
            path: "real.md".to_string(),
            old_path: None,
        }];

        let post = postprocess_existence(&translated, &root).await;
        assert_eq!(post.len(), 1);
        assert_eq!(post[0].kind, ChangeKind::Modified);
    }

    #[tokio::test]
    async fn does_not_touch_created_or_renamed_or_already_deleted() {
        use tempfile::TempDir;
        let tmp = TempDir::new().unwrap();
        let root = tmp.path().to_path_buf();
        let translated = vec![
            VaultChangeEvent {
                kind: ChangeKind::Created,
                path: "absent-create.md".into(),
                old_path: None,
            },
            VaultChangeEvent {
                kind: ChangeKind::Deleted,
                path: "absent-delete.md".into(),
                old_path: None,
            },
            VaultChangeEvent {
                kind: ChangeKind::Renamed,
                path: "absent-rename-to.md".into(),
                old_path: Some("absent-rename-from.md".into()),
            },
        ];
        let post = postprocess_existence(&translated, &root).await;
        assert_eq!(post.len(), 3);
        assert_eq!(post[0].kind, ChangeKind::Created);
        assert_eq!(post[1].kind, ChangeKind::Deleted);
        assert_eq!(post[2].kind, ChangeKind::Renamed);
    }
}
