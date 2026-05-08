use notify::event::{EventKind, ModifyKind};
use notify_debouncer_full::DebouncedEvent;
use serde::Serialize;
use std::path::Path;

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
}
