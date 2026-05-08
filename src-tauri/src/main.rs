#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use knowledge_base_lib::claude::{commands as claude_commands, ClaudeState};
use knowledge_base_lib::settings::commands as settings_commands;
use knowledge_base_lib::vault::{commands, Vault, VaultState, Watcher, WatcherState};
use std::sync::Arc;

fn main() {
    let vault: VaultState = Arc::new(Vault::default());
    let watcher: WatcherState = Arc::new(Watcher::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(vault)
        .manage(watcher)
        .manage(ClaudeState::new())
        .invoke_handler(tauri::generate_handler![
            commands::vault_pick,
            commands::vault_set_root,
            commands::vault_read_text,
            commands::vault_write_text,
            commands::vault_read_json,
            commands::vault_write_json,
            commands::vault_list,
            commands::vault_rename,
            commands::vault_delete,
            commands::vault_exists,
            commands::vault_read_bytes,
            commands::vault_write_bytes,
            commands::vault_watch_start,
            commands::vault_watch_stop,
            settings_commands::settings_read,
            settings_commands::settings_write,
            claude_commands::claude_status,
            claude_commands::claude_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
