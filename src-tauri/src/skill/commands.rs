use crate::skill::types::SkillStatus;
use tauri::AppHandle;

#[tauri::command]
pub async fn skill_status(_name: String, _app: AppHandle) -> Result<SkillStatus, String> {
    Err("not implemented".into())
}

#[tauri::command]
pub async fn skill_install_from_bundle(_name: String, _app: AppHandle) -> Result<(), String> {
    Err("not implemented".into())
}
