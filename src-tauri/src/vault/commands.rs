use std::path::PathBuf;
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::VaultError;
use super::io::{self, DirEntry};
use super::watcher::Watcher;
use super::{Vault, VaultState};
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Inner-impl functions
// ---------------------------------------------------------------------------
//
// Each `#[tauri::command]` below has a sibling `pub async fn impl_<name>(...)`
// holding the actual body. The Tauri wrapper stays a thin 1–3 line forwarder
// (extracts `state.inner()` then awaits the impl). The split is what
// enables `src-tauri/src/bin/test_server.rs` (MVP-4.x phase 3.C task 1) to
// re-invoke the same command bodies over HTTP without forking the logic.
// Behaviour is byte-identical with the pre-split #[tauri::command] body.

/// Open a folder picker dialog. Production-only (test_server cannot drive
/// a folder picker — Playwright e2e bypasses this via `make_temp_vault`).
pub async fn impl_vault_pick<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, VaultError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |result| {
        let _ = tx.send(result);
    });
    let result = rx.await.map_err(|e| VaultError::Io {
        path: String::new(),
        message: e.to_string(),
    })?;
    Ok(result.and_then(|fp| match fp {
        FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        FilePath::Url(_) => None,
    }))
}

pub async fn impl_vault_set_root(state: &Vault, path: String) -> Result<(), VaultError> {
    // Canonicalize to match Watcher::start's path normalization (handles
    // macOS /var → /private/var symlinks). Without this, Vault.root and
    // WatcherInner.root diverge silently and any future path comparison
    // (e.g. MVP-1c idempotency checks) will misfire.
    let resolved = PathBuf::from(&path)
        .canonicalize()
        .map_err(|e| VaultError::Io {
            path,
            message: e.to_string(),
        })?;
    state.set_root(resolved).await;
    Ok(())
}

pub async fn impl_vault_read_text(state: &Vault, path: String) -> Result<String, VaultError> {
    let root = state.root_or_error().await?;
    io::read_text(&path, &root).await
}

pub async fn impl_vault_write_text(
    state: &Vault,
    path: String,
    content: String,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_text_atomic(&path, &content, &root).await
}

pub async fn impl_vault_read_json(
    state: &Vault,
    path: String,
) -> Result<serde_json::Value, VaultError> {
    let root = state.root_or_error().await?;
    io::read_json(&path, &root).await
}

pub async fn impl_vault_write_json(
    state: &Vault,
    path: String,
    value: serde_json::Value,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_json_atomic(&path, &value, &root).await
}

pub async fn impl_vault_list(state: &Vault, dir: String) -> Result<Vec<DirEntry>, VaultError> {
    let root = state.root_or_error().await?;
    io::list(&dir, &root).await
}

pub async fn impl_vault_rename(state: &Vault, from: String, to: String) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::rename(&from, &to, &root).await
}

pub async fn impl_vault_delete(state: &Vault, path: String) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::delete(&path, &root).await
}

pub async fn impl_vault_exists(state: &Vault, path: String) -> Result<bool, VaultError> {
    let root = state.root_or_error().await?;
    io::exists(&path, &root).await
}

pub async fn impl_vault_read_bytes(state: &Vault, path: String) -> Result<Vec<u8>, VaultError> {
    let root = state.root_or_error().await?;
    io::read_bytes(&path, &root).await
}

pub async fn impl_vault_write_bytes(
    state: &Vault,
    path: String,
    bytes: Vec<u8>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_bytes_atomic(&path, &bytes, &root).await
}

/// Start the filesystem watcher. Generic over `R: Runtime` so the
/// `#[tauri::command]` wrapper can pass a real `AppHandle` while
/// integration tests can supply a `MockRuntime` handle.
pub async fn impl_vault_watch_start<R: Runtime>(
    state: &Vault,
    watcher: &Arc<Watcher>,
    app: AppHandle<R>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    watcher
        .start(root, app)
        .await
        .map_err(|message| VaultError::Io {
            path: String::new(),
            message,
        })
}

pub async fn impl_vault_watch_stop(watcher: &Arc<Watcher>) -> Result<(), VaultError> {
    watcher.stop().await;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn vault_pick(app: AppHandle) -> Result<Option<String>, VaultError> {
    impl_vault_pick(app).await
}

#[tauri::command]
pub async fn vault_set_root(path: String, state: State<'_, VaultState>) -> Result<(), VaultError> {
    impl_vault_set_root(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_read_text(
    path: String,
    state: State<'_, VaultState>,
) -> Result<String, VaultError> {
    impl_vault_read_text(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_write_text(
    path: String,
    content: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    impl_vault_write_text(state.inner().as_ref(), path, content).await
}

#[tauri::command]
pub async fn vault_read_json(
    path: String,
    state: State<'_, VaultState>,
) -> Result<serde_json::Value, VaultError> {
    impl_vault_read_json(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_write_json(
    path: String,
    value: serde_json::Value,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    impl_vault_write_json(state.inner().as_ref(), path, value).await
}

#[tauri::command]
pub async fn vault_list(
    dir: String,
    state: State<'_, VaultState>,
) -> Result<Vec<DirEntry>, VaultError> {
    impl_vault_list(state.inner().as_ref(), dir).await
}

#[tauri::command]
pub async fn vault_rename(
    from: String,
    to: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    impl_vault_rename(state.inner().as_ref(), from, to).await
}

#[tauri::command]
pub async fn vault_delete(path: String, state: State<'_, VaultState>) -> Result<(), VaultError> {
    impl_vault_delete(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_exists(path: String, state: State<'_, VaultState>) -> Result<bool, VaultError> {
    impl_vault_exists(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_read_bytes(
    path: String,
    state: State<'_, VaultState>,
) -> Result<Vec<u8>, VaultError> {
    impl_vault_read_bytes(state.inner().as_ref(), path).await
}

#[tauri::command]
pub async fn vault_write_bytes(
    path: String,
    bytes: Vec<u8>,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    impl_vault_write_bytes(state.inner().as_ref(), path, bytes).await
}

#[tauri::command]
pub async fn vault_watch_start(
    app: AppHandle,
    state: State<'_, VaultState>,
    watcher: State<'_, Arc<Watcher>>,
) -> Result<(), VaultError> {
    impl_vault_watch_start(state.inner().as_ref(), watcher.inner(), app).await
}

#[tauri::command]
pub async fn vault_watch_stop(watcher: State<'_, Arc<Watcher>>) -> Result<(), VaultError> {
    impl_vault_watch_stop(watcher.inner()).await
}
