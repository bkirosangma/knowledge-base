use std::path::Path;
use tokio::fs;

use super::error::VaultError;
use super::path::resolve;

/// Read a UTF-8 text file at vault-relative `rel`.
pub async fn read_text(rel: &str, root: &Path) -> Result<String, VaultError> {
    let abs = resolve(rel, root)?;
    fs::read_to_string(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))
}

/// Atomically write UTF-8 text to vault-relative `rel`. Writes to
/// `<rel>.tmp`, fsyncs, then renames. Creates parent directories as needed.
pub async fn write_text_atomic(
    rel: &str,
    content: &str,
    root: &Path,
) -> Result<(), VaultError> {
    let abs = resolve(rel, root)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| VaultError::io(rel, e))?;
    }
    let tmp = abs.with_extension(
        abs.extension()
            .map(|e| format!("{}.tmp", e.to_string_lossy()))
            .unwrap_or_else(|| "tmp".to_string()),
    );
    fs::write(&tmp, content.as_bytes())
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    let f = fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    f.sync_all().await.map_err(|e| VaultError::io(rel, e))?;
    drop(f);
    fs::rename(&tmp, &abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn round_trips_text() {
        let td = TempDir::new().unwrap();
        write_text_atomic("docs/topic.md", "hello", td.path())
            .await
            .unwrap();
        let got = read_text("docs/topic.md", td.path()).await.unwrap();
        assert_eq!(got, "hello");
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a/b/c/d.md", "x", td.path()).await.unwrap();
        assert!(td.path().join("a/b/c/d.md").exists());
    }

    #[tokio::test]
    async fn write_does_not_leave_tmp_file_on_success() {
        let td = TempDir::new().unwrap();
        write_text_atomic("topic.md", "x", td.path()).await.unwrap();
        let tmp = td.path().join("topic.md.tmp");
        assert!(!tmp.exists(), "stale .tmp file left behind");
    }

    #[tokio::test]
    async fn read_missing_returns_not_found() {
        let td = TempDir::new().unwrap();
        let err = read_text("nope.md", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::NotFound { .. }));
    }

    #[tokio::test]
    async fn rejects_traversal_in_read() {
        let td = TempDir::new().unwrap();
        let err = read_text("../escape.md", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }
}
