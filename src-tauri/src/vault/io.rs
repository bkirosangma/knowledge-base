use std::path::Path;
use tokio::fs;

use super::error::VaultError;
use super::path::resolve;
use serde::Serialize;

/// Read a UTF-8 text file at vault-relative `rel`.
pub async fn read_text(rel: &str, root: &Path) -> Result<String, VaultError> {
    let abs = resolve(rel, root)?;
    fs::read_to_string(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))
}

/// Atomically write UTF-8 text to vault-relative `rel`. Writes to
/// `<rel>.tmp`, fsyncs, then renames. Creates parent directories as needed.
pub async fn write_text_atomic(rel: &str, content: &str, root: &Path) -> Result<(), VaultError> {
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

/// Read and parse a JSON file at vault-relative `rel`.
pub async fn read_json(rel: &str, root: &Path) -> Result<serde_json::Value, VaultError> {
    let text = read_text(rel, root).await?;
    serde_json::from_str(&text).map_err(|e| VaultError::Parse {
        path: rel.to_string(),
        message: e.to_string(),
    })
}

/// Atomically write `value` as pretty-printed JSON to vault-relative `rel`.
pub async fn write_json_atomic(
    rel: &str,
    value: &serde_json::Value,
    root: &Path,
) -> Result<(), VaultError> {
    let text = serde_json::to_string_pretty(value).map_err(|e| VaultError::Parse {
        path: rel.to_string(),
        message: e.to_string(),
    })?;
    write_text_atomic(rel, &text, root).await
}

/// One directory entry, vault-relative-pathed and OS-neutral.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DirEntry {
    pub name: String,
    /// `"file"` or `"directory"`. Symlinks resolved.
    pub kind: String,
    /// Vault-relative POSIX path, e.g. `docs/topic.md`.
    pub path: String,
}

/// List a directory's immediate entries (non-recursive). Returns entries
/// sorted by name. The vault-relative `dir` may be `""` for the root.
pub async fn list(dir: &str, root: &Path) -> Result<Vec<DirEntry>, VaultError> {
    let abs = if dir.is_empty() {
        root.to_path_buf()
    } else {
        resolve(dir, root)?
    };
    let mut rd = fs::read_dir(&abs)
        .await
        .map_err(|e| VaultError::io(dir, e))?;
    let mut out = Vec::new();
    while let Some(entry) = rd.next_entry().await.map_err(|e| VaultError::io(dir, e))? {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let metadata = entry.metadata().await.map_err(|e| VaultError::io(dir, e))?;
        let kind = if metadata.is_dir() {
            "directory"
        } else {
            "file"
        };
        let path = if dir.is_empty() {
            file_name.clone()
        } else {
            format!("{dir}/{file_name}")
        };
        out.push(DirEntry {
            name: file_name,
            kind: kind.to_string(),
            path,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Rename a vault-relative file or directory.
pub async fn rename(from: &str, to: &str, root: &Path) -> Result<(), VaultError> {
    let from_abs = resolve(from, root)?;
    let to_abs = resolve(to, root)?;
    if let Some(parent) = to_abs.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| VaultError::io(to, e))?;
    }
    fs::rename(&from_abs, &to_abs)
        .await
        .map_err(|e| VaultError::io(from, e))
}

/// Delete a vault-relative file or directory (recursive for directories).
pub async fn delete(rel: &str, root: &Path) -> Result<(), VaultError> {
    let abs = resolve(rel, root)?;
    let metadata = fs::metadata(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&abs)
            .await
            .map_err(|e| VaultError::io(rel, e))
    } else {
        fs::remove_file(&abs)
            .await
            .map_err(|e| VaultError::io(rel, e))
    }
}

/// Check whether a vault-relative path exists. Path traversal still rejects.
pub async fn exists(rel: &str, root: &Path) -> Result<bool, VaultError> {
    let abs = resolve(rel, root)?;
    fs::try_exists(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))
}

/// Read raw bytes at vault-relative `rel`.
pub async fn read_bytes(rel: &str, root: &Path) -> Result<Vec<u8>, VaultError> {
    let abs = resolve(rel, root)?;
    fs::read(&abs).await.map_err(|e| VaultError::io(rel, e))
}

/// Atomically write raw bytes to vault-relative `rel`. Creates parent
/// directories as needed.
pub async fn write_bytes_atomic(rel: &str, bytes: &[u8], root: &Path) -> Result<(), VaultError> {
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
    fs::write(&tmp, bytes)
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
        write_text_atomic("a/b/c/d.md", "x", td.path())
            .await
            .unwrap();
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

    #[tokio::test]
    async fn round_trips_json() {
        let td = TempDir::new().unwrap();
        let value = serde_json::json!({ "name": "alpha", "n": 42 });
        write_json_atomic("config.json", &value, td.path())
            .await
            .unwrap();
        let got = read_json("config.json", td.path()).await.unwrap();
        assert_eq!(got, value);
    }

    #[tokio::test]
    async fn read_json_returns_parse_error_on_garbage() {
        let td = TempDir::new().unwrap();
        write_text_atomic("config.json", "not json", td.path())
            .await
            .unwrap();
        let err = read_json("config.json", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::Parse { .. }));
    }

    #[tokio::test]
    async fn lists_root_entries_sorted() {
        let td = TempDir::new().unwrap();
        write_text_atomic("b.md", "x", td.path()).await.unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        std::fs::create_dir(td.path().join("docs")).unwrap();
        let got = list("", td.path()).await.unwrap();
        let names: Vec<_> = got.iter().map(|e| &e.name).collect();
        assert_eq!(names, vec!["a.md", "b.md", "docs"]);
    }

    #[tokio::test]
    async fn lists_subdirectory() {
        let td = TempDir::new().unwrap();
        write_text_atomic("docs/x.md", "x", td.path())
            .await
            .unwrap();
        let got = list("docs", td.path()).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].path, "docs/x.md");
        assert_eq!(got[0].kind, "file");
    }

    #[tokio::test]
    async fn list_missing_directory_returns_not_found() {
        let td = TempDir::new().unwrap();
        let err = list("nope", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::NotFound { .. }));
    }

    #[tokio::test]
    async fn renames_file_creating_parents() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        rename("a.md", "docs/b.md", td.path()).await.unwrap();
        assert!(!td.path().join("a.md").exists());
        assert!(td.path().join("docs/b.md").exists());
    }

    #[tokio::test]
    async fn deletes_file() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        delete("a.md", td.path()).await.unwrap();
        assert!(!td.path().join("a.md").exists());
    }

    #[tokio::test]
    async fn deletes_directory_recursively() {
        let td = TempDir::new().unwrap();
        write_text_atomic("d/x.md", "x", td.path()).await.unwrap();
        write_text_atomic("d/y.md", "y", td.path()).await.unwrap();
        delete("d", td.path()).await.unwrap();
        assert!(!td.path().join("d").exists());
    }

    #[tokio::test]
    async fn exists_reports_present_and_absent() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        assert!(exists("a.md", td.path()).await.unwrap());
        assert!(!exists("b.md", td.path()).await.unwrap());
    }

    #[tokio::test]
    async fn round_trips_bytes() {
        let td = TempDir::new().unwrap();
        let bytes = vec![0u8, 1, 2, 3, 255];
        write_bytes_atomic("bin/x.dat", &bytes, td.path())
            .await
            .unwrap();
        let got = read_bytes("bin/x.dat", td.path()).await.unwrap();
        assert_eq!(got, bytes);
    }
}
