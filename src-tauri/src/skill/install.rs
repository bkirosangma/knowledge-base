use std::io;
use std::path::Path;

/// Recursively copy a skill source directory to a target.
/// Returns Ok(()) on success. If `target` already exists, the function
/// is a no-op (the caller is responsible for the install-if-missing decision).
pub fn copy_skill(source: &Path, target: &Path) -> io::Result<()> {
    if target.exists() {
        return Ok(());
    }
    copy_recursive(source, target)
}

fn copy_recursive(src: &Path, dst: &Path) -> io::Result<()> {
    if src.is_file() {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dst)?;
        return Ok(());
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let entry_name = entry.file_name();
        // Skip cache dirs that local dev environments accumulate.
        if matches!(entry_name.to_str(), Some("__pycache__" | ".pytest_cache" | ".DS_Store")) {
            continue;
        }
        copy_recursive(&entry.path(), &dst.join(entry_name))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_file(path: &Path, content: &str) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, content).unwrap();
    }

    #[test]
    fn copy_skill_copies_recursive() {
        let src_dir = TempDir::new().unwrap();
        let dst_dir = TempDir::new().unwrap();
        let src = src_dir.path().join("skill");
        let dst = dst_dir.path().join("skill");
        write_file(&src.join("SKILL.md"), "skill body");
        write_file(&src.join("commands/document.md"), "doc body");
        write_file(&src.join("scripts/.pytest_cache/v/cachedir.tag"), "cache");
        copy_skill(&src, &dst).unwrap();
        assert!(dst.join("SKILL.md").exists());
        assert!(dst.join("commands/document.md").exists());
        assert!(!dst.join("scripts/.pytest_cache").exists(),
            "cache dirs must be skipped");
    }

    #[test]
    fn copy_skill_no_op_when_target_exists() {
        let src_dir = TempDir::new().unwrap();
        let dst_dir = TempDir::new().unwrap();
        let src = src_dir.path().join("skill");
        let dst = dst_dir.path().join("skill");
        write_file(&src.join("SKILL.md"), "new body");
        write_file(&dst.join("SKILL.md"), "existing body");
        copy_skill(&src, &dst).unwrap();
        let contents = std::fs::read_to_string(dst.join("SKILL.md")).unwrap();
        assert_eq!(contents, "existing body", "must not overwrite");
    }
}
