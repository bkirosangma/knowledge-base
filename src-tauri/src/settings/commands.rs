use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::store::Settings;

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

/// Shared reader used by both the `settings_read` command and any other
/// Tauri command that needs to inspect settings at runtime (e.g. `claude_send`).
pub async fn read_settings(app: &AppHandle) -> Result<Settings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store
        .get(SETTINGS_KEY)
        .unwrap_or_else(|| serde_json::to_value(Settings::default()).unwrap());
    let settings: Settings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(settings)
}

#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Settings, String> {
    read_settings(&app).await
}

#[tauri::command]
pub async fn settings_write(app: AppHandle, settings: Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    store.set(SETTINGS_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
