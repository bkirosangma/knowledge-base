use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::VaultError;
use super::io::{self, DirEntry};
use super::VaultState;

#[tauri::command]
pub async fn vault_pick(app: AppHandle) -> Result<Option<String>, VaultError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |result| {
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

#[tauri::command]
pub async fn vault_set_root(
    path: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    state.set_root(PathBuf::from(path)).await;
    Ok(())
}

#[tauri::command]
pub async fn vault_read_text(
    path: String,
    state: State<'_, VaultState>,
) -> Result<String, VaultError> {
    let root = state.root_or_error().await?;
    io::read_text(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_text(
    path: String,
    content: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_text_atomic(&path, &content, &root).await
}

#[tauri::command]
pub async fn vault_read_json(
    path: String,
    state: State<'_, VaultState>,
) -> Result<serde_json::Value, VaultError> {
    let root = state.root_or_error().await?;
    io::read_json(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_json(
    path: String,
    value: serde_json::Value,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_json_atomic(&path, &value, &root).await
}

#[tauri::command]
pub async fn vault_list(
    dir: String,
    state: State<'_, VaultState>,
) -> Result<Vec<DirEntry>, VaultError> {
    let root = state.root_or_error().await?;
    io::list(&dir, &root).await
}

#[tauri::command]
pub async fn vault_rename(
    from: String,
    to: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::rename(&from, &to, &root).await
}

#[tauri::command]
pub async fn vault_delete(
    path: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::delete(&path, &root).await
}

#[tauri::command]
pub async fn vault_exists(
    path: String,
    state: State<'_, VaultState>,
) -> Result<bool, VaultError> {
    let root = state.root_or_error().await?;
    io::exists(&path, &root).await
}

#[tauri::command]
pub async fn vault_read_bytes(
    path: String,
    state: State<'_, VaultState>,
) -> Result<Vec<u8>, VaultError> {
    let root = state.root_or_error().await?;
    io::read_bytes(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_bytes(
    path: String,
    bytes: Vec<u8>,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_bytes_atomic(&path, &bytes, &root).await
}
