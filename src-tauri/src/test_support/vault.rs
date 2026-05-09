use std::path::{Path, PathBuf};
use tempfile::TempDir;

/// A self-cleaning vault tempdir. Holding `_guard` keeps the directory
/// alive for the lifetime of the `TempVault`; drop the struct to remove
/// it. `root` is canonicalized so callers can compare against
/// `vault::Vault.root` without worrying about `/private/var` vs `/var`
/// on macOS.
pub struct TempVault {
    pub root: PathBuf,
    _guard: TempDir,
}

impl TempVault {
    /// Empty tempdir with `.kb/config.json` pre-seeded so
    /// `vault_set_root` treats it as initialized.
    pub fn fresh() -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard
            .path()
            .canonicalize()
            .map_err(|e| format!("canonicalize: {e}"))?;
        let kb = root.join(".kb");
        std::fs::create_dir_all(&kb).map_err(|e| format!("mkdir .kb: {e}"))?;
        std::fs::write(kb.join("config.json"), b"{\"version\":1}\n")
            .map_err(|e| format!("write config: {e}"))?;
        Ok(Self {
            root,
            _guard: guard,
        })
    }

    /// Tempdir with NO `.kb/config.json` — `vault_set_root` will treat
    /// it as uninitialized.
    pub fn fresh_uninitialized() -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard
            .path()
            .canonicalize()
            .map_err(|e| format!("canonicalize: {e}"))?;
        Ok(Self {
            root,
            _guard: guard,
        })
    }

    /// Tempdir seeded by recursively copying `tests/fixtures/vaults/<name>`.
    /// Fixture must exist; missing fixture is an error.
    pub fn from_fixture(name: &str) -> Result<Self, String> {
        let guard = TempDir::new().map_err(|e| format!("tempdir: {e}"))?;
        let root = guard
            .path()
            .canonicalize()
            .map_err(|e| format!("canonicalize: {e}"))?;
        let manifest = env!("CARGO_MANIFEST_DIR");
        let src = Path::new(manifest)
            .join("tests")
            .join("fixtures")
            .join("vaults")
            .join(name);
        if !src.is_dir() {
            return Err(format!("fixture not found: {}", src.display()));
        }
        copy_dir_recursive(&src, &root)?;
        Ok(Self {
            root,
            _guard: guard,
        })
    }

    pub fn write(&self, rel: &str, content: &str) -> Result<(), String> {
        let target = self.root.join(rel);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
        }
        std::fs::write(target, content).map_err(|e| format!("write: {e}"))
    }

    pub fn read(&self, rel: &str) -> Result<String, String> {
        std::fs::read_to_string(self.root.join(rel)).map_err(|e| format!("read: {e}"))
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in std::fs::read_dir(src).map_err(|e| format!("read_dir: {e}"))? {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let path = entry.path();
        let rel = path
            .strip_prefix(src)
            .map_err(|e| format!("strip prefix: {e}"))?;
        let target = dst.join(rel);
        if path.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| format!("mkdir: {e}"))?;
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
            }
            std::fs::copy(&path, &target).map_err(|e| format!("copy: {e}"))?;
        }
    }
    Ok(())
}

/// Debug-only Tauri command. Takes an optional fixture name; when omitted,
/// returns a `fresh()` tempdir. Returns the canonical absolute path so the
/// frontend can pass it straight to `vault_set_root`. The `TempDir` guard
/// is leaked via `std::mem::forget` (see body, below) — there is no
/// destructor-driven cleanup. The OS reaps `/tmp` between sessions; that
/// is the only thing the directory's lifetime is bounded by.
///
/// **Cleanup trade-off:** we deliberately do not register a
/// `temp_vault_destroy(path)` command. Tests rely on the OS reaping
/// `/tmp` between CI runs (Linux: `tmpfs` flushed on reboot or via
/// `systemd-tmpfiles`; macOS: `/var/folders/.../T/` reaped on logout).
/// If a single test needs eager cleanup it can exit via
/// `app.handle().exit(0)`, which still doesn't run the leaked destructor
/// — only OS-level cleanup runs after that. Adding a `temp_vault_destroy`
/// command is a follow-up once we have data on tempdir leakage.
#[cfg(debug_assertions)]
#[tauri::command]
pub async fn make_temp_vault(
    fixture: Option<String>,
    initialized: Option<bool>,
) -> Result<String, String> {
    let init = initialized.unwrap_or(true);
    let v = match fixture {
        Some(name) => TempVault::from_fixture(&name)?,
        None if !init => TempVault::fresh_uninitialized()?,
        None => TempVault::fresh()?,
    };
    let path = v.root.to_string_lossy().to_string();
    // Leak the guard so the directory survives this command's return.
    // The OS reaps /tmp between sessions; explicit destroy is the
    // follow-up tracked above.
    std::mem::forget(v);
    Ok(path)
}
