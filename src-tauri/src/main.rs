#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use knowledge_base_lib::claude::{commands as claude_commands, ClaudeState};
use knowledge_base_lib::settings::commands as settings_commands;
use knowledge_base_lib::skill::commands as skill_commands;
use knowledge_base_lib::term::commands as term_commands;
use knowledge_base_lib::vault::{commands, Vault, VaultState, Watcher, WatcherState};
use std::sync::Arc;

fn main() {
    knowledge_base_lib::env_bootstrap::merge_login_shell_path();
    let vault: VaultState = Arc::new(Vault::default());
    let watcher: WatcherState = Arc::new(Watcher::default());
    // `mut` is only used by the debug-only `.plugin(...)` re-assignment below; in
    // release the binding is never mutated, so silence the (correct but noisy)
    // unused_mut warning rather than splitting the binding across cfgs.
    #[cfg_attr(not(debug_assertions), allow(unused_mut))]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build());

    // tauri-plugin-webdriver is compiled into release bundles (~200KB) but only
    // registered in debug builds; the WebDriver port is a dev-only test seam used
    // by Playwright in MVP-4 Task 10. Production never opens it.
    //
    // The plugin's DEFAULT_PORT is 4445 (see tauri-plugin-webdriver 0.2.1 src/lib.rs:19);
    // our Playwright readiness probe and the rest of the e2e harness are pinned to
    // :4444 (playwright.config.ts `webServer.url`). MVP-4's CI rollout failed for this
    // exact reason — the plugin bound 4445 silently while Playwright's webServer block
    // waited 180 s for 4444. `init_with_port(4444)` aligns the plugin to our fixed port
    // contract; the readiness check is the source of truth, not the plugin's default.
    #[cfg(debug_assertions)]
    {
        builder = builder.plugin(tauri_plugin_webdriver::init_with_port(4444));
    }

    builder
        .manage(vault)
        .manage(watcher)
        .manage(ClaudeState::new())
        .manage(knowledge_base_lib::term::TermState::new())
        // The two `tauri::generate_handler!` lists below MUST stay in sync — when adding
        // or removing a production command, edit BOTH branches. The macro can't accept
        // `#[cfg]` attributes on its inner entries, so debug-only commands (currently
        // just `make_temp_vault`) live only in the debug branch and the rest are
        // mirrored verbatim. See MVP-4 plan Task 1.
        .invoke_handler({
            #[cfg(debug_assertions)]
            {
                tauri::generate_handler![
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
                    claude_commands::claude_interrupt,
                    claude_commands::claude_reset,
                    skill_commands::skill_status,
                    skill_commands::skill_install_from_bundle,
                    term_commands::term_open,
                    term_commands::term_write,
                    term_commands::term_resize,
                    term_commands::term_close,
                    knowledge_base_lib::test_support::vault::make_temp_vault,
                ]
            }
            #[cfg(not(debug_assertions))]
            {
                tauri::generate_handler![
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
                    claude_commands::claude_interrupt,
                    claude_commands::claude_reset,
                    skill_commands::skill_status,
                    skill_commands::skill_install_from_bundle,
                    term_commands::term_open,
                    term_commands::term_write,
                    term_commands::term_resize,
                    term_commands::term_close,
                ]
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
