use crate::term::TermState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn term_open(
    _vault_path: String,
    _rows: u16,
    _cols: u16,
    _state: State<'_, TermState>,
    _app: AppHandle,
) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_write(_bytes: Vec<u8>, _state: State<'_, TermState>) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_resize(
    _rows: u16,
    _cols: u16,
    _state: State<'_, TermState>,
) -> Result<(), String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn term_close(_state: State<'_, TermState>) -> Result<(), String> {
    Err("not implemented".into())
}
