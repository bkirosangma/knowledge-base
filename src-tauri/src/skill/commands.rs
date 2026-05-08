use crate::skill::install::copy_skill;
use crate::skill::types::SkillStatus;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn target_path(name: &str) -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "no home directory".to_string())?;
    Ok(home.join(".claude").join("skills").join(name))
}

fn bundled_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir: {e}"))?;
    // Tauri prefixes parent-of-srcTauri resources with `_up_`.
    Ok(resource_dir.join("_up_").join("skills").join(name))
}

#[tauri::command]
pub async fn skill_status(name: String, app: AppHandle) -> Result<SkillStatus, String> {
    let target = target_path(&name)?;
    let bundled = bundled_path(&app, &name)?;
    let installed = target.join("SKILL.md").exists();
    Ok(SkillStatus {
        installed,
        target_path: target.to_string_lossy().to_string(),
        bundled_path: bundled.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn skill_install_from_bundle(name: String, app: AppHandle) -> Result<(), String> {
    let target = target_path(&name)?;
    let bundled = bundled_path(&app, &name)?;
    if !bundled.join("SKILL.md").exists() {
        return Err(format!(
            "bundled skill source missing at {}",
            bundled.display()
        ));
    }
    copy_skill(&bundled, &target).map_err(|e| format!("copy failed: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::target_path;

    #[test]
    fn target_path_uses_home_claude_skills() {
        let path = target_path("knowledge-base").unwrap();
        // Path includes the "knowledge-base" component and is anchored at .claude/skills.
        let s = path.to_string_lossy();
        assert!(
            s.ends_with(".claude/skills/knowledge-base") || s.ends_with(".claude\\skills\\knowledge-base"),
            "got: {s}"
        );
    }
}
