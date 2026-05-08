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

// Sentinel so the production module is non-empty until Task 3 lands more code.
pub(crate) fn _root_marker(_: &PathBuf) {}
