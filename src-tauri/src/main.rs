#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Arc;
use knowledge_base_lib::vault::{commands, Vault, VaultState};

fn main() {
    let state: VaultState = Arc::new(Vault::default());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(state)
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
