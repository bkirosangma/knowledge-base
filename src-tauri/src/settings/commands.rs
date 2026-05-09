use tauri::{AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

use super::store::Settings;

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

/// Shared reader used by both the `settings_read` command and any other
/// Tauri command that needs to inspect settings at runtime (e.g. `claude_send`).
pub async fn read_settings<R: Runtime>(app: &AppHandle<R>) -> Result<Settings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .unwrap_or_else(|| serde_json::to_value(Settings::default()).unwrap());
    let settings: Settings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(settings)
}

// ---------------------------------------------------------------------------
// Inner-impl functions
// ---------------------------------------------------------------------------
//
// See `vault/commands.rs` header. Settings impl-fns delegate to
// `read_settings` / `tauri-plugin-store`. `impl_settings_*` are generic
// over `R: Runtime` so the test_server can pass a `MockRuntime`-backed
// AppHandle if it ever needs settings; the four MVP-4.x proof-set specs
// don't touch settings, so the dispatcher returns "unsupported" today.

pub async fn impl_settings_read<R: Runtime>(app: &AppHandle<R>) -> Result<Settings, String> {
    read_settings(app).await
}

pub async fn impl_settings_write<R: Runtime>(
    app: &AppHandle<R>,
    settings: Settings,
) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    store.set(SETTINGS_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Settings, String> {
    impl_settings_read(&app).await
}

#[tauri::command]
pub async fn settings_write(app: AppHandle, settings: Settings) -> Result<(), String> {
    impl_settings_write(&app, settings).await
}
