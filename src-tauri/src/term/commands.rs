use std::io::Write;
use std::path::PathBuf;

use crate::term::pty::{close as pty_close, spawn as pty_spawn};
use crate::term::TermState;
use tauri::{AppHandle, State};

// ---------------------------------------------------------------------------
// Inner-impl functions
// ---------------------------------------------------------------------------
//
// See `vault/commands.rs` header comment for the rationale of the
// impl-fn + thin-wrapper split. `impl_term_open` keeps a concrete
// `AppHandle` because `pty::spawn` emits production Tauri events directly
// on it (see `term/pty.rs`). The test_server dispatcher (Phase 3.C.1)
// therefore cannot invoke this path without a real Tauri runtime —
// `term_open`/`term_write`/`term_resize`/`term_close` are returned as
// "unsupported in test_server" by the dispatcher; none of the four
// proof-set specs touch the terminal.

pub async fn impl_term_open(
    state: &TermState,
    vault_path: String,
    rows: u16,
    cols: u16,
    app: AppHandle,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;

    let vault_root = PathBuf::from(&vault_path);
    if !vault_root.is_dir() {
        return Err(format!("vault path is not a directory: {vault_path}"));
    }

    if let Some(session) = guard.as_mut() {
        if session.vault_root == vault_root {
            return Ok(()); // same vault: idempotent no-op
        }
        // vault changed: restart in place
        return crate::term::pty::restart_in_new_vault(session, vault_root);
    }

    let session = pty_spawn(vault_root, rows, cols, app)?;
    *guard = Some(session);
    Ok(())
}

pub async fn impl_term_write(state: &TermState, bytes: Vec<u8>) -> Result<(), String> {
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

pub async fn impl_term_resize(state: &TermState, rows: u16, cols: u16) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    // Silent no-op when no session — `useTerminalResize`'s ResizeObserver
    // fires on mount before `term_open` lands; a missing PTY is benign here
    // (the next `term_open` will use the right dims). `term_write` keeps the
    // strict error to surface genuine data-loss bugs.
    let Some(session) = guard.as_ref() else {
        return Ok(());
    };
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

pub async fn impl_term_close(state: &TermState) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("term lock: {e}"))?;
    if let Some(session) = guard.take() {
        pty_close(session);
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn term_open(
    vault_path: String,
    rows: u16,
    cols: u16,
    state: State<'_, TermState>,
    app: AppHandle,
) -> Result<(), String> {
    impl_term_open(state.inner(), vault_path, rows, cols, app).await
}

#[tauri::command]
pub async fn term_write(bytes: Vec<u8>, state: State<'_, TermState>) -> Result<(), String> {
    impl_term_write(state.inner(), bytes).await
}

#[tauri::command]
pub async fn term_resize(rows: u16, cols: u16, state: State<'_, TermState>) -> Result<(), String> {
    impl_term_resize(state.inner(), rows, cols).await
}

#[tauri::command]
pub async fn term_close(state: State<'_, TermState>) -> Result<(), String> {
    impl_term_close(state.inner()).await
}
