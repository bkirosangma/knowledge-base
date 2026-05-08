use crate::claude::{status, types::{ClaudeStatus, ClaudeUserMessage}, ClaudeState};
use crate::settings::commands::read_settings;
use crate::vault::VaultState;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn claude_status() -> Result<ClaudeStatus, String> {
    Ok(status::detect().await)
}

#[tauri::command]
pub async fn claude_send(
    app: AppHandle,
    state: State<'_, ClaudeState>,
    vault: State<'_, VaultState>,
    message: ClaudeUserMessage,
) -> Result<(), String> {
    let vault_root: PathBuf = vault
        .root
        .read()
        .await
        .clone()
        .ok_or("no vault mounted; open a vault before sending")?;
    let permission_mode = read_settings(&app).await?.claude.permission_mode;
    let mut runner = state.0.lock().await;
    // Ensure subprocess is alive (lazy spawn) before sending. send() also
    // respawns on crash; this guard re-reads the user-selected permission_mode
    // each time the subprocess needs to be (re)spawned.
    runner
        .ensure_alive(app.clone(), vault_root.clone(), permission_mode)
        .await?;
    runner.send(app, vault_root, message).await
}

#[tauri::command]
pub async fn claude_interrupt(state: State<'_, ClaudeState>) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.interrupt().await
}

#[tauri::command]
pub async fn claude_reset(state: State<'_, ClaudeState>) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.reset().await
}
