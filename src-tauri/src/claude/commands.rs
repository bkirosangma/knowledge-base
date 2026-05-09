use crate::claude::{
    status,
    types::{ClaudeStatus, ClaudeUserMessage},
    ClaudeState,
};
use crate::settings::commands::read_settings;
use crate::vault::Vault;
use crate::vault::VaultState;
use std::path::PathBuf;
use tauri::{AppHandle, State};

// ---------------------------------------------------------------------------
// Inner-impl functions
// ---------------------------------------------------------------------------
//
// See `vault/commands.rs` header for the impl-fn split rationale.
//
// `impl_claude_status` requires no app state; the test_server can call it
// directly. `impl_claude_send` requires both a vault root AND an
// `AppHandle` (the runner emits `claude_event` payloads on it during
// streaming responses). The MVP-4.x proof-set specs do NOT exercise any
// Claude command, so the test_server dispatcher returns
// `claude_status` results truthfully but rejects `claude_send` /
// `claude_interrupt` / `claude_reset` as "unsupported in test_server".
// TODO(MVP-5): real stub-runner integration so e2e specs can exercise
// claude flows without hitting the live `claude` CLI.

pub async fn impl_claude_status() -> Result<ClaudeStatus, String> {
    Ok(status::detect().await)
}

pub async fn impl_claude_send(
    app: AppHandle,
    state: &ClaudeState,
    vault: &Vault,
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

pub async fn impl_claude_interrupt(state: &ClaudeState) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.interrupt().await
}

pub async fn impl_claude_reset(state: &ClaudeState) -> Result<(), String> {
    let mut runner = state.0.lock().await;
    runner.reset().await
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn claude_status() -> Result<ClaudeStatus, String> {
    impl_claude_status().await
}

#[tauri::command]
pub async fn claude_send(
    app: AppHandle,
    state: State<'_, ClaudeState>,
    vault: State<'_, VaultState>,
    message: ClaudeUserMessage,
) -> Result<(), String> {
    impl_claude_send(app, state.inner(), vault.inner().as_ref(), message).await
}

#[tauri::command]
pub async fn claude_interrupt(state: State<'_, ClaudeState>) -> Result<(), String> {
    impl_claude_interrupt(state.inner()).await
}

#[tauri::command]
pub async fn claude_reset(state: State<'_, ClaudeState>) -> Result<(), String> {
    impl_claude_reset(state.inner()).await
}
