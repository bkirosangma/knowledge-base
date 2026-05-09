//! Command dispatcher. Maps a `{ "cmd": "...", "args": {...} }` JSON
//! body to the matching impl-fn on production state. Stays in sync with
//! the `tauri::generate_handler![...]` list in `main.rs` — adding a new
//! production command means adding a match arm here.
//!
//! Two error categories:
//!   • `unsupported in test_server`: command requires a live `AppHandle`
//!     (Tauri runtime) we cannot construct without `tauri::App`. The four
//!     MVP-4.x proof-set specs do not exercise these. Returned as
//!     `{ ok:false, error:"unsupported …" }` with HTTP 200 so Playwright
//!     surfaces a readable assertion rather than a transport failure.
//!   • impl-fn errors: the underlying command failed (FS, vault, etc.).
//!     Same envelope shape; the message comes from the impl-fn.

use std::sync::Arc;

use axum::{extract::State, response::IntoResponse, response::Response, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::claude::commands as claude_cmds;
use crate::settings::store::Settings;
use crate::test_support::vault as test_support_vault;
use crate::vault::commands as vault_cmds;

use super::TestServerState;

#[derive(Deserialize)]
pub struct InvokeBody {
    pub cmd: String,
    #[serde(default)]
    pub args: Value,
}

fn arg_str(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

fn arg_str_opt(args: &Value, key: &str) -> Option<String> {
    args.get(key).and_then(|v| v.as_str()).map(String::from)
}

fn arg_bool_opt(args: &Value, key: &str) -> Option<bool> {
    args.get(key).and_then(|v| v.as_bool())
}

fn unsupported(cmd: &str) -> Result<Value, String> {
    Err(format!(
        "{cmd}: unsupported in test_server (needs live AppHandle); see src-tauri/src/test_server/dispatch.rs"
    ))
}

pub async fn invoke_handler(
    State(state): State<Arc<TestServerState>>,
    Json(body): Json<InvokeBody>,
) -> Response {
    let result: Result<Value, String> = match body.cmd.as_str() {
        // ----- vault (filesystem-only) ---------------------------------
        "vault_set_root" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_set_root(&state.vault, path)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_read_text" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_read_text(&state.vault, path)
                .await
                .map(Value::String)
                .map_err(|e| e.to_string())
        }
        "vault_write_text" => {
            let path = arg_str(&body.args, "path");
            let content = arg_str(&body.args, "content");
            vault_cmds::impl_vault_write_text(&state.vault, path, content)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_read_json" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_read_json(&state.vault, path)
                .await
                .map_err(|e| e.to_string())
        }
        "vault_write_json" => {
            let path = arg_str(&body.args, "path");
            let value = body.args.get("value").cloned().unwrap_or(Value::Null);
            vault_cmds::impl_vault_write_json(&state.vault, path, value)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_list" => {
            let dir = arg_str(&body.args, "dir");
            vault_cmds::impl_vault_list(&state.vault, dir)
                .await
                .map(|files| serde_json::to_value(files).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        "vault_rename" => {
            let from = arg_str(&body.args, "from");
            let to = arg_str(&body.args, "to");
            vault_cmds::impl_vault_rename(&state.vault, from, to)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_delete" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_delete(&state.vault, path)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_exists" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_exists(&state.vault, path)
                .await
                .map(Value::Bool)
                .map_err(|e| e.to_string())
        }
        "vault_read_bytes" => {
            let path = arg_str(&body.args, "path");
            vault_cmds::impl_vault_read_bytes(&state.vault, path)
                .await
                .map(|bytes| Value::Array(bytes.into_iter().map(|b| json!(b)).collect::<Vec<_>>()))
                .map_err(|e| e.to_string())
        }
        "vault_write_bytes" => {
            let path = arg_str(&body.args, "path");
            let bytes: Vec<u8> = body
                .args
                .get("bytes")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|n| n.as_u64().map(|u| u as u8))
                        .collect()
                })
                .unwrap_or_default();
            vault_cmds::impl_vault_write_bytes(&state.vault, path, bytes)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        // vault_pick + vault_watch_start need a Tauri AppHandle; they no-op
        // gracefully so the frontend's mount-time `vault_watch_start` call
        // (FileWatcherContext) doesn't reject and break the proof-set
        // specs.
        "vault_pick" => unsupported("vault_pick"),
        "vault_watch_start" => Ok(Value::Null),
        "vault_watch_stop" => vault_cmds::impl_vault_watch_stop(&state.watcher)
            .await
            .map(|_| Value::Null)
            .map_err(|e| e.to_string()),

        // ----- claude (status only — send/interrupt/reset need AppHandle)
        "claude_status" => claude_cmds::impl_claude_status()
            .await
            .map(|s| serde_json::to_value(s).unwrap_or(Value::Null)),
        "claude_send" => unsupported("claude_send"),
        "claude_interrupt" => unsupported("claude_interrupt"),
        "claude_reset" => unsupported("claude_reset"),

        // ----- settings (need AppHandle for tauri-plugin-store) ---------
        // The frontend's mount path calls `settings_read` from several
        // hooks (useFileExplorer, getRecents, getClaudeDrawerHeight,
        // getClaudeSurface). Returning "unsupported" rejected all of
        // them, leaving the explorer unmounted. The 4 proof-set specs
        // never need to *persist* settings — they just need a default
        // shape for the read path. Hand back `Settings::default()` with
        // `vault.lastPath` synthesized from the test_server's current
        // vault root (set by the prior `vault_set_root` invoke) so the
        // mount-time boot effect (`useFileExplorer.tsx` line ~78)
        // restores into the explorer. Writes accepted as no-op.
        "settings_read" => {
            let mut settings = Settings::default();
            if let Some(root) = state.vault.root.read().await.clone() {
                settings.vault.last_path = Some(root.to_string_lossy().to_string());
            }
            Ok(serde_json::to_value(settings).unwrap_or(Value::Null))
        }
        "settings_write" => Ok(Value::Null),

        // ----- skill (need AppHandle for resource_dir) ------------------
        "skill_status" => unsupported("skill_status"),
        "skill_install_from_bundle" => unsupported("skill_install_from_bundle"),

        // ----- term (PTY emits Tauri events on AppHandle) ---------------
        "term_open" => unsupported("term_open"),
        "term_write" => unsupported("term_write"),
        "term_resize" => unsupported("term_resize"),
        "term_close" => unsupported("term_close"),

        // ----- test_support --------------------------------------------
        "make_temp_vault" => {
            let fixture = arg_str_opt(&body.args, "fixture");
            let initialized = arg_bool_opt(&body.args, "initialized");
            test_support_vault::impl_make_temp_vault(fixture, initialized)
                .await
                .map(Value::String)
                .map_err(|e| e.to_string())
        }

        // ----- Tauri 2 event bridge stubs ------------------------------
        // The high-level `@tauri-apps/api/event::listen` / `unlisten` go
        // through `__TAURI_INTERNALS__.invoke('plugin:event|listen', ...)`
        // — not a regular `#[tauri::command]`. The proof-set specs don't
        // assert on event delivery, so we accept the registration with a
        // numeric id (Tauri returns a u32 listener handle) and accept
        // unlisten as a no-op. When future specs need real event delivery
        // they should switch to consuming `/events` (SSE) directly via
        // an EventSource registered in the shim.
        "plugin:event|listen" => Ok(json!(0_u32)),
        "plugin:event|unlisten" => Ok(Value::Null),

        _ => Err(format!("unknown command: {}", body.cmd)),
    };

    match result {
        Ok(value) => Json(json!({ "ok": true, "value": value })).into_response(),
        Err(msg) => Json(json!({ "ok": false, "error": msg })).into_response(),
    }
}
