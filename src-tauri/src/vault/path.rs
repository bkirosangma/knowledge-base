use std::path::{Path, PathBuf};

use super::error::VaultError;

/// Resolve a vault-relative POSIX path against `root`. Rejects absolute
/// paths, parent traversal (`..`), and Windows-style separators. Returns
/// the absolute path under `root` with `.` segments preserved literally —
/// does NOT canonicalize (callers that need symlink-aware normalization
/// should use `fs::canonicalize`, which requires the file to exist).
/// Used by every command before touching the filesystem.
pub fn resolve(rel: &str, root: &Path) -> Result<PathBuf, VaultError> {
    if rel.contains('\\') {
        return Err(VaultError::PathEscape { path: rel.to_string() });
    }
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(VaultError::PathEscape { path: rel.to_string() });
    }
    for component in p.components() {
        use std::path::Component;
        match component {
            Component::Normal(_) | Component::CurDir => continue,
            Component::ParentDir => {
                return Err(VaultError::PathEscape { path: rel.to_string() })
            }
            // Reject RootDir, Prefix (Windows), and any future unsafe variants.
            _ => return Err(VaultError::PathEscape { path: rel.to_string() }),
        }
    }
    let joined = root.join(p);
    Ok(joined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from("/tmp/vault")
    }

    #[test]
    fn resolves_simple_relative_path() {
        let got = resolve("docs/topic.md", &root()).unwrap();
        assert_eq!(got, PathBuf::from("/tmp/vault/docs/topic.md"));
    }

    #[test]
    fn rejects_absolute_path() {
        let err = resolve("/etc/passwd", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_parent_traversal() {
        let err = resolve("docs/../../secret", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_leading_parent_traversal() {
        let err = resolve("../escape", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_windows_separators() {
        let err = resolve("docs\\topic.md", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn allows_curdir_segments() {
        let got = resolve("docs/./topic.md", &root()).unwrap();
        assert_eq!(got, PathBuf::from("/tmp/vault/docs/./topic.md"));
    }
}
