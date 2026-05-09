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
