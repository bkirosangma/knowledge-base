use crate::claude::{status, types::ClaudeStatus};

#[tauri::command]
pub async fn claude_status() -> Result<ClaudeStatus, String> {
    Ok(status::detect().await)
}
