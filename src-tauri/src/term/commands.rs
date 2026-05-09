use std::io::Write;
use std::path::PathBuf;

use crate::term::pty::{close as pty_close, spawn as pty_spawn};
use crate::term::TermState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn term_open(
    vault_path: String,
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;

    let vault_root = PathBuf::from(&vault_path);
    if !vault_root.is_dir() {
        return Err(format!("vault path is not a directory: {vault_path}"));
    }

    if guard.is_some() {
        // Vault-switch handling lands in Task 5. For now, idempotent same-
        // vault case: drop the request silently (the existing session is fine).
        let session = guard.as_ref().unwrap();
        if session.vault_root == vault_root {
            return Ok(());
        }
        return Err("vault-switch not yet implemented (Task 5)".into());
    }

    let session = pty_spawn(vault_root, rows, cols, app)?;
    *guard = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn term_write(bytes: Vec<u8>, state: State<'_, TermState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    let session = guard
        .as_mut()
        .ok_or_else(|| "no live term session".to_string())?;
    session
        .writer
        .write_all(&bytes)
        .map_err(|e| format!("term write: {e}"))?;
    session.writer.flush().ok();
    Ok(())
}

#[tauri::command]
pub async fn term_resize(
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    let session = guard
        .as_ref()
        .ok_or_else(|| "no live term session".to_string())?;
    session
        .master
        .resize(portable_pty::PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("term resize: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn term_close(state: State<'_, TermState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    if let Some(session) = guard.take() {
        pty_close(session);
    }
    Ok(())
}
