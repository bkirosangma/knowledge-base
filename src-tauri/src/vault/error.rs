use serde::Serialize;
use std::io;
use thiserror::Error;

/// Errors emitted across the Tauri IPC boundary. Serialized as a tagged
/// union (`{ "kind": "...", ... }`) consumed by `tauriBridge.ts` and
/// translated into the existing TS `FileSystemError`.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VaultError {
    #[error("no vault root configured")]
    NoVault,

    #[error("path not found: {path}")]
    NotFound { path: String },

    #[error("permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("path escapes vault root: {path}")]
    PathEscape { path: String },

    #[error("io error at {path}: {message}")]
    Io { path: String, message: String },

    #[error("parse error at {path}: {message}")]
    Parse { path: String, message: String },
}

impl VaultError {
    pub fn io(path: impl Into<String>, e: io::Error) -> Self {
        let path = path.into();
        match e.kind() {
            io::ErrorKind::NotFound => Self::NotFound { path },
            io::ErrorKind::PermissionDenied => Self::PermissionDenied { path },
            _ => Self::Io { path, message: e.to_string() },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_no_vault_as_tagged_union() {
        let err = VaultError::NoVault;
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "no_vault" }));
    }

    #[test]
    fn serializes_not_found_with_path() {
        let err = VaultError::NotFound { path: "docs/missing.md".into() };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, serde_json::json!({
            "kind": "not_found",
            "path": "docs/missing.md"
        }));
    }

    #[test]
    fn io_helper_classifies_not_found() {
        let io_err = io::Error::from(io::ErrorKind::NotFound);
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::NotFound { .. }));
    }

    #[test]
    fn io_helper_classifies_permission_denied() {
        let io_err = io::Error::from(io::ErrorKind::PermissionDenied);
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::PermissionDenied { .. }));
    }

    #[test]
    fn io_helper_falls_back_to_io_kind() {
        let io_err = io::Error::new(io::ErrorKind::Other, "disk full");
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::Io { .. }));
    }
}
