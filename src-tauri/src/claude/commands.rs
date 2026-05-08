use crate::claude::{status, types::{ClaudeStatus, ClaudeUserMessage}, ClaudeState};
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
    // Task 8 will read this from settings; hardcoded for now.
    let permission_mode = "acceptEdits".to_string();
    let mut runner = state.0.lock().await;
    // Ensure subprocess is alive (lazy spawn) before sending. send() also
    // respawns on crash; this guard is the seam Task 8 uses to thread the
    // user-selected permission mode through on first spawn.
    runner
        .ensure_alive(app.clone(), vault_root.clone(), permission_mode)
        .await?;
    runner.send(app, vault_root, message).await
}
