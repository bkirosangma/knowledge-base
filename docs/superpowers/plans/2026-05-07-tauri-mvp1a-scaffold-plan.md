# MVP-1a — Tauri Scaffold + Rust VFS Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Tauri 2 desktop shell hosting the existing Next.js knowledge-base app, with a Rust-backed vault filesystem adapter that satisfies every existing `domain/repositories.ts` interface. App boots, user picks a vault via the OS-native dialog, and existing read/write/list/rename/delete editing flows work over Tauri commands instead of the File System Access API.

**Architecture:** Approach 1 from the spec — 10 generic VFS primitives in Rust (`vault_pick`, `vault_set_root`, `vault_read_text`, `vault_write_text`, `vault_read_json`, `vault_write_json`, `vault_list`, `vault_rename`, `vault_delete`, `vault_exists`). Each TS repo gets a `*RepoTauri.ts` sibling implementing the same typed interface against those primitives via a shared `tauriBridge.ts`. `RepositoryContext`'s `rootHandle` prop becomes `vaultPath: string | null`. File watching, settings persistence, vault switcher UI, uninitialized-folder splash, FSA cleanup, and CI changes all land in MVP-1b/1c/1d.

**Tech Stack:** Tauri 2, Rust (`tokio`, `serde`, `serde_json`, `thiserror`, `tempfile`), `tauri-plugin-dialog`, `@tauri-apps/api`, TypeScript, Vitest + jsdom + @testing-library/react, existing `domain/repositories.ts` contracts.

**Spec:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md`

**Branch:** `feat/tauri-mvp1a-scaffold` (created at the start of execution; spec + plan + handoff live on `feat/tauri-claude-integration`).

**Depends on:** None — first MVP of the feature.

**Out of scope (deferred):**
- File watching → MVP-1b
- Settings/preferences (`tauri-plugin-store`, last-vault persistence) → MVP-1c
- Vault switcher dropdown, recents, uninitialized-folder splash → MVP-1c
- GitHub Pages workflow removal, FSA repo deletion, CI on macos-latest → MVP-1d
- Bottom-overlay chat surface → MVP-2
- Skill bootstrap → MVP-3
- `tauri-plugin-webdriver`, `ClaudeRunner` stub → MVP-4

**During-MVP regressions accepted (cleaned up in 1b/1d):**
- File watching becomes a no-op (no FSA root → existing polling sees nothing). Resolved when `notify`-backed `vault_watch` lands in MVP-1b.
- Vault path is held in memory only; the user re-picks on every launch. Resolved by `tauri-plugin-store` in MVP-1c.
- Existing FSA `*Repo.ts` files stay on disk and unused; `next.config.ts` keeps its `GITHUB_PAGES` branch. Both removed in MVP-1d.

---

## File Map

### Created

| File | Responsibility |
|---|---|
| `package.json` | _Modify_ — add `@tauri-apps/api`, `@tauri-apps/cli` deps; new `tauri:dev` and `tauri:build` scripts. |
| `.gitignore` | _Modify_ — exclude `src-tauri/target/`, `src-tauri/Cargo.lock` stays tracked. |
| `src-tauri/Cargo.toml` | Rust manifest; pins Tauri 2, plugins, async + serde + thiserror + tempfile (dev). |
| `src-tauri/tauri.conf.json` | Tauri config: window, bundle identifier, frontend dist + devUrl, security CSP. |
| `src-tauri/build.rs` | Standard `tauri_build::build()` invocation. |
| `src-tauri/src/main.rs` | Application entry: builder, plugin registration, command list, run. |
| `src-tauri/src/lib.rs` | Module wiring (`pub mod vault`). |
| `src-tauri/src/vault/mod.rs` | `Vault` struct (root path holder) + `VaultState` type alias. |
| `src-tauri/src/vault/error.rs` | `VaultError` enum + `serde::Serialize` for tagged-union TS contract. |
| `src-tauri/src/vault/path.rs` | `resolve(rel, root) → Result<PathBuf, VaultError>` plus traversal-safety unit tests. |
| `src-tauri/src/vault/io.rs` | `read_text` / `write_text_atomic` / `read_json` / `write_json_atomic` / `list` / `rename` / `delete` / `exists` async fns + unit tests. |
| `src-tauri/src/vault/commands.rs` | Ten `#[tauri::command]` handlers wrapping `io.rs` and `path.rs`. |
| `src-tauri/icons/` | Default Tauri icon set (placeholder; real assets in MVP-1d). |
| `src/app/knowledge_base/infrastructure/tauriBridge.ts` | Typed `invoke` wrappers for the 10 commands; converts `VaultError` payload → `FileSystemError`. |
| `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` | Contract tests against a mocked `@tauri-apps/api/core`. |
| `src/app/knowledge_base/infrastructure/documentRepoTauri.ts` | `DocumentRepository` over `tauriBridge`. |
| `src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts` | Tests for above. |
| `src/app/knowledge_base/infrastructure/diagramRepoTauri.ts` | `DiagramRepository` over `tauriBridge`. |
| `src/app/knowledge_base/infrastructure/diagramRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/svgRepoTauri.ts` | `SVGRepository` over `tauriBridge`. |
| `src/app/knowledge_base/infrastructure/svgRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/tabRepoTauri.ts` | `TabRepository` over `tauriBridge`. |
| `src/app/knowledge_base/infrastructure/tabRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/attachmentRepoTauri.ts` | `AttachmentRepository` over `tauriBridge`. |
| `src/app/knowledge_base/infrastructure/attachmentRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.ts` | `AttachmentLinksRepository`. |
| `src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/linkIndexRepoTauri.ts` | `LinkIndexRepository`. |
| `src/app/knowledge_base/infrastructure/linkIndexRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.ts` | `VaultConfigRepository`. |
| `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/svgRefsRepoTauri.ts` | `SvgRefsRepository`. |
| `src/app/knowledge_base/infrastructure/svgRefsRepoTauri.test.ts` | Tests. |
| `src/app/knowledge_base/infrastructure/tabRefsRepoTauri.ts` | `TabRefsRepository`. |
| `src/app/knowledge_base/infrastructure/tabRefsRepoTauri.test.ts` | Tests. |

### Modified

| File | Change |
|---|---|
| `src/app/knowledge_base/shell/RepositoryContext.tsx` | Provider prop `rootHandle: FileSystemDirectoryHandle \| null` → `vaultPath: string \| null`; switch repo factories from `createXRepository(rootHandle)` to `createXRepositoryTauri(vaultPath)`. |
| `src/app/knowledge_base/shell/RepositoryContext.test.tsx` | Update existing tests for the new prop shape. |
| `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` | Replace `showDirectoryPicker()` with `invoke('vault_pick')`. Hook still exposes the same shape to callers, but `dirHandleRef`-style state is replaced with a `vaultPath: string \| null` ref. |
| `src/app/knowledge_base/knowledgeBase.tsx` | Pass `vaultPath` (not `rootHandle`) to `RepositoryProvider`; update any inline `createXRepository` calls if present. |

---

## Task 1: Add Tauri tooling to package.json

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Add Tauri dev dependencies**

```bash
npm install --save-dev @tauri-apps/cli@^2 @tauri-apps/api@^2
```

- [ ] **Step 2: Add Tauri scripts to `package.json`**

In the `"scripts"` block, add:

```json
"tauri": "tauri",
"tauri:dev": "tauri dev",
"tauri:build": "tauri build"
```

- [ ] **Step 3: Update `.gitignore` to exclude Rust build output**

Append to `.gitignore`:

```
# Tauri
src-tauri/target/
```

`src-tauri/Cargo.lock` stays committed (binary crate convention).

- [ ] **Step 4: Verify install**

Run: `npx tauri --version`
Expected: prints a version like `tauri-cli 2.x.y`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore(tauri): add @tauri-apps/cli + api dev deps and scripts"
```

---

## Task 2: Scaffold `src-tauri/Cargo.toml`

**Files:**
- Create: `src-tauri/Cargo.toml`

- [ ] **Step 1: Create the Rust manifest**

```toml
[package]
name = "knowledge-base"
version = "0.1.0"
description = "Knowledge Base desktop app"
authors = ["Banchan Kiro A Sangma <bkirosangma@gmail.com>"]
edition = "2021"

[lib]
name = "knowledge_base_lib"
path = "src/lib.rs"

[[bin]]
name = "knowledge-base"
path = "src/main.rs"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
tokio = { version = "1", features = ["fs", "io-util", "rt-multi-thread", "macros", "sync"] }

[dev-dependencies]
tempfile = "3"
tokio = { version = "1", features = ["full", "test-util"] }

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "chore(tauri): add Cargo.toml with tauri 2 + plugin-dialog deps"
```

---

## Task 3: Scaffold `src-tauri/tauri.conf.json`

**Files:**
- Create: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Create the Tauri config**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Knowledge Base",
  "version": "0.1.0",
  "identifier": "com.kiro.knowledge-base",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../out"
  },
  "app": {
    "windows": [
      {
        "title": "Knowledge Base",
        "width": 1280,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "Productivity",
    "shortDescription": "Knowledge Base desktop app"
  },
  "plugins": {}
}
```

- [ ] **Step 2: Generate placeholder icons**

```bash
cd src-tauri && npx @tauri-apps/cli icon ../public/favicon.ico
```

This populates `src-tauri/icons/` with the standard set derived from the existing favicon. (Real icon assets land in MVP-1d.)

- [ ] **Step 3: Verify the config schema**

Run: `cd src-tauri && npx tauri info`
Expected: prints app + Tauri toolchain info without "config error".

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/icons/
git commit -m "chore(tauri): add tauri.conf.json + placeholder icons"
```

---

## Task 4: Stub `src-tauri/src/main.rs`, `lib.rs`, `build.rs`

**Files:**
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Create: `src-tauri/build.rs`

- [ ] **Step 1: Create `build.rs`**

```rust
fn main() {
    tauri_build::build()
}
```

- [ ] **Step 2: Create `src/lib.rs`**

```rust
//! Knowledge-base desktop app — Rust core.

pub mod vault;
```

- [ ] **Step 3: Create empty `src/vault/mod.rs` to satisfy the lib reference**

```rust
//! Vault filesystem adapter (commands, IO, path safety, errors).
//!
//! Submodules land in subsequent tasks.
```

- [ ] **Step 4: Create `src/main.rs` with an empty command list**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 5: Verify the project compiles**

Run: `cd src-tauri && cargo build`
Expected: `Finished dev [unoptimized + debuginfo] target(s)` with no errors. (Warnings about unused modules are fine — they go away once vault submodules land.)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/build.rs src-tauri/src/main.rs src-tauri/src/lib.rs src-tauri/src/vault/mod.rs
git commit -m "chore(tauri): stub main.rs + lib.rs with empty command list"
```

---

## Task 5: Verify Tauri build pipeline end-to-end

**Files:** none changed (smoke check only).

- [ ] **Step 1: Verify Next.js can produce a static build at `../out`**

Run: `npm run build` (with `GITHUB_PAGES=true` to force static export, since MVP-1d hasn't made export the default yet).

```bash
GITHUB_PAGES=true npm run build
ls out/index.html
```

Expected: `out/index.html` exists.

- [ ] **Step 2: Run `tauri dev` and confirm the window opens**

Run: `npx tauri dev`
Expected: a Tauri window opens showing the Next.js app at `http://localhost:3000`. The existing app appears (still using FSA — that's fine, it's untouched). Close the window.

- [ ] **Step 3: Commit (no code changes; this is a smoke checkpoint)**

```bash
git commit --allow-empty -m "chore(tauri): MVP-1a checkpoint — scaffold builds and launches"
```

---

## Task 6: `VaultError` enum with serde tagged-union output

**Files:**
- Create: `src-tauri/src/vault/error.rs`
- Modify: `src-tauri/src/vault/mod.rs` (export the module)

- [ ] **Step 1: Add `pub mod error;` and `pub use error::VaultError;` to `src/vault/mod.rs`**

```rust
//! Vault filesystem adapter (commands, IO, path safety, errors).

pub mod error;
pub use error::VaultError;
```

- [ ] **Step 2: Write failing tests for `VaultError` serde shape**

Create `src-tauri/src/vault/error.rs`:

```rust
use serde::Serialize;
use std::io;
use thiserror::Error;

/// Errors emitted across the Tauri IPC boundary. Serialized as a tagged
/// union (`{ "kind": "...", ... }`) consumed by `tauriBridge.ts` and
/// translated into the existing TS `FileSystemError`.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum VaultError {
    #[error("no vault root configured")]
    NoVault,

    #[error("path not found: {path}")]
    NotFound { path: String },

    #[error("permission denied: {path}")]
    PermissionDenied { path: String },

    #[error("path escapes vault root: {path}")]
    PathEscape { path: String },

    #[error("io error at {path}: {message}")]
    Io { path: String, message: String },

    #[error("parse error at {path}: {message}")]
    Parse { path: String, message: String },
}

impl VaultError {
    pub fn io(path: impl Into<String>, e: io::Error) -> Self {
        let path = path.into();
        match e.kind() {
            io::ErrorKind::NotFound => Self::NotFound { path },
            io::ErrorKind::PermissionDenied => Self::PermissionDenied { path },
            _ => Self::Io { path, message: e.to_string() },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_no_vault_as_tagged_union() {
        let err = VaultError::NoVault;
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "no_vault" }));
    }

    #[test]
    fn serializes_not_found_with_path() {
        let err = VaultError::NotFound { path: "docs/missing.md".into() };
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json, serde_json::json!({
            "kind": "not_found",
            "path": "docs/missing.md"
        }));
    }

    #[test]
    fn io_helper_classifies_not_found() {
        let io_err = io::Error::from(io::ErrorKind::NotFound);
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::NotFound { .. }));
    }

    #[test]
    fn io_helper_classifies_permission_denied() {
        let io_err = io::Error::from(io::ErrorKind::PermissionDenied);
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::PermissionDenied { .. }));
    }

    #[test]
    fn io_helper_falls_back_to_io_kind() {
        let io_err = io::Error::new(io::ErrorKind::Other, "disk full");
        let err = VaultError::io("docs/x.md", io_err);
        assert!(matches!(err, VaultError::Io { .. }));
    }
}
```

- [ ] **Step 3: Run tests — expect PASS (this task is data + serde, no implementation gap)**

Run: `cd src-tauri && cargo test --lib vault::error`
Expected: 5 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/error.rs src-tauri/src/vault/mod.rs
git commit -m "feat(vault): VaultError tagged-union + io classifier"
```

---

## Task 7: `vault::path::resolve` with traversal-safety tests

**Files:**
- Create: `src-tauri/src/vault/path.rs`
- Modify: `src-tauri/src/vault/mod.rs`

- [ ] **Step 1: Add `pub mod path;` to `src/vault/mod.rs`**

```rust
pub mod error;
pub mod path;
pub use error::VaultError;
```

- [ ] **Step 2: Write failing tests for path resolution**

Create `src-tauri/src/vault/path.rs`:

```rust
use std::path::{Path, PathBuf};

use super::error::VaultError;

/// Resolve a vault-relative POSIX path against `root`. Rejects absolute
/// paths, parent traversal (`..`), and Windows-style separators. Returns
/// the canonical absolute path under `root`. Used by every command before
/// touching the filesystem.
pub fn resolve(rel: &str, root: &Path) -> Result<PathBuf, VaultError> {
    if rel.contains('\\') {
        return Err(VaultError::PathEscape { path: rel.to_string() });
    }
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(VaultError::PathEscape { path: rel.to_string() });
    }
    for component in p.components() {
        use std::path::Component;
        match component {
            Component::Normal(_) | Component::CurDir => continue,
            Component::ParentDir => {
                return Err(VaultError::PathEscape { path: rel.to_string() })
            }
            _ => return Err(VaultError::PathEscape { path: rel.to_string() }),
        }
    }
    let joined = root.join(p);
    Ok(joined)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn root() -> PathBuf {
        PathBuf::from("/tmp/vault")
    }

    #[test]
    fn resolves_simple_relative_path() {
        let got = resolve("docs/topic.md", &root()).unwrap();
        assert_eq!(got, PathBuf::from("/tmp/vault/docs/topic.md"));
    }

    #[test]
    fn rejects_absolute_path() {
        let err = resolve("/etc/passwd", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_parent_traversal() {
        let err = resolve("docs/../../secret", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_leading_parent_traversal() {
        let err = resolve("../escape", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn rejects_windows_separators() {
        let err = resolve("docs\\topic.md", &root()).unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }

    #[test]
    fn allows_curdir_segments() {
        let got = resolve("docs/./topic.md", &root()).unwrap();
        assert_eq!(got, PathBuf::from("/tmp/vault/docs/./topic.md"));
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test --lib vault::path`
Expected: 6 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/path.rs src-tauri/src/vault/mod.rs
git commit -m "feat(vault): path::resolve with traversal-safety tests"
```

---

## Task 8: `vault::io` — `read_text` and atomic `write_text`

**Files:**
- Create: `src-tauri/src/vault/io.rs`
- Modify: `src-tauri/src/vault/mod.rs`

- [ ] **Step 1: Add `pub mod io;` to `src/vault/mod.rs`**

```rust
pub mod error;
pub mod io;
pub mod path;
pub use error::VaultError;
```

- [ ] **Step 2: Write failing tests + implementation for `read_text` and atomic `write_text`**

Create `src-tauri/src/vault/io.rs`:

```rust
use std::path::Path;
use tokio::fs;

use super::error::VaultError;
use super::path::resolve;

/// Read a UTF-8 text file at vault-relative `rel`.
pub async fn read_text(rel: &str, root: &Path) -> Result<String, VaultError> {
    let abs = resolve(rel, root)?;
    fs::read_to_string(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))
}

/// Atomically write UTF-8 text to vault-relative `rel`. Writes to
/// `<rel>.tmp`, fsyncs, then renames. Creates parent directories as needed.
pub async fn write_text_atomic(
    rel: &str,
    content: &str,
    root: &Path,
) -> Result<(), VaultError> {
    let abs = resolve(rel, root)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| VaultError::io(rel, e))?;
    }
    let tmp = abs.with_extension(
        abs.extension()
            .map(|e| format!("{}.tmp", e.to_string_lossy()))
            .unwrap_or_else(|| "tmp".to_string()),
    );
    fs::write(&tmp, content.as_bytes())
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    let f = fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    f.sync_all().await.map_err(|e| VaultError::io(rel, e))?;
    drop(f);
    fs::rename(&tmp, &abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn round_trips_text() {
        let td = TempDir::new().unwrap();
        write_text_atomic("docs/topic.md", "hello", td.path())
            .await
            .unwrap();
        let got = read_text("docs/topic.md", td.path()).await.unwrap();
        assert_eq!(got, "hello");
    }

    #[tokio::test]
    async fn write_creates_parent_dirs() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a/b/c/d.md", "x", td.path()).await.unwrap();
        assert!(td.path().join("a/b/c/d.md").exists());
    }

    #[tokio::test]
    async fn write_does_not_leave_tmp_file_on_success() {
        let td = TempDir::new().unwrap();
        write_text_atomic("topic.md", "x", td.path()).await.unwrap();
        let tmp = td.path().join("topic.md.tmp");
        assert!(!tmp.exists(), "stale .tmp file left behind");
    }

    #[tokio::test]
    async fn read_missing_returns_not_found() {
        let td = TempDir::new().unwrap();
        let err = read_text("nope.md", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::NotFound { .. }));
    }

    #[tokio::test]
    async fn rejects_traversal_in_read() {
        let td = TempDir::new().unwrap();
        let err = read_text("../escape.md", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::PathEscape { .. }));
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cd src-tauri && cargo test --lib vault::io`
Expected: 5 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/io.rs src-tauri/src/vault/mod.rs
git commit -m "feat(vault): read_text + atomic write_text with traversal safety"
```

---

## Task 9: `vault::io` — `read_json` and `write_json`

**Files:**
- Modify: `src-tauri/src/vault/io.rs`

- [ ] **Step 1: Append JSON helpers + tests to `src/vault/io.rs`**

After the existing `pub async fn write_text_atomic`, add:

```rust
/// Read and parse a JSON file at vault-relative `rel`.
pub async fn read_json(
    rel: &str,
    root: &Path,
) -> Result<serde_json::Value, VaultError> {
    let text = read_text(rel, root).await?;
    serde_json::from_str(&text).map_err(|e| VaultError::Parse {
        path: rel.to_string(),
        message: e.to_string(),
    })
}

/// Atomically write `value` as pretty-printed JSON to vault-relative `rel`.
pub async fn write_json_atomic(
    rel: &str,
    value: &serde_json::Value,
    root: &Path,
) -> Result<(), VaultError> {
    let text = serde_json::to_string_pretty(value).map_err(|e| VaultError::Parse {
        path: rel.to_string(),
        message: e.to_string(),
    })?;
    write_text_atomic(rel, &text, root).await
}
```

Append to the `mod tests` block:

```rust
    #[tokio::test]
    async fn round_trips_json() {
        let td = TempDir::new().unwrap();
        let value = serde_json::json!({ "name": "alpha", "n": 42 });
        write_json_atomic("config.json", &value, td.path())
            .await
            .unwrap();
        let got = read_json("config.json", td.path()).await.unwrap();
        assert_eq!(got, value);
    }

    #[tokio::test]
    async fn read_json_returns_parse_error_on_garbage() {
        let td = TempDir::new().unwrap();
        write_text_atomic("config.json", "not json", td.path())
            .await
            .unwrap();
        let err = read_json("config.json", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::Parse { .. }));
    }
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib vault::io`
Expected: 7 tests passing (5 from Task 8 + 2 new).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/vault/io.rs
git commit -m "feat(vault): read_json + atomic write_json"
```

---

## Task 10: `vault::io` — `list` directory entries

**Files:**
- Modify: `src-tauri/src/vault/io.rs`

- [ ] **Step 1: Append `DirEntry` type + `list` + tests**

In `src/vault/io.rs`, after the JSON helpers, add:

```rust
use serde::Serialize;

/// One directory entry, vault-relative-pathed and OS-neutral.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DirEntry {
    pub name: String,
    /// `"file"` or `"directory"`. Symlinks resolved.
    pub kind: String,
    /// Vault-relative POSIX path, e.g. `docs/topic.md`.
    pub path: String,
}

/// List a directory's immediate entries (non-recursive). Returns entries
/// sorted by name. The vault-relative `dir` may be `""` for the root.
pub async fn list(dir: &str, root: &Path) -> Result<Vec<DirEntry>, VaultError> {
    let abs = if dir.is_empty() {
        root.to_path_buf()
    } else {
        resolve(dir, root)?
    };
    let mut rd = fs::read_dir(&abs)
        .await
        .map_err(|e| VaultError::io(dir, e))?;
    let mut out = Vec::new();
    while let Some(entry) = rd
        .next_entry()
        .await
        .map_err(|e| VaultError::io(dir, e))?
    {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let metadata = entry
            .metadata()
            .await
            .map_err(|e| VaultError::io(dir, e))?;
        let kind = if metadata.is_dir() { "directory" } else { "file" };
        let path = if dir.is_empty() {
            file_name.clone()
        } else {
            format!("{dir}/{file_name}")
        };
        out.push(DirEntry {
            name: file_name,
            kind: kind.to_string(),
            path,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}
```

Append to the `tests` block:

```rust
    #[tokio::test]
    async fn lists_root_entries_sorted() {
        let td = TempDir::new().unwrap();
        write_text_atomic("b.md", "x", td.path()).await.unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        std::fs::create_dir(td.path().join("docs")).unwrap();
        let got = list("", td.path()).await.unwrap();
        let names: Vec<_> = got.iter().map(|e| &e.name).collect();
        assert_eq!(names, vec!["a.md", "b.md", "docs"]);
    }

    #[tokio::test]
    async fn lists_subdirectory() {
        let td = TempDir::new().unwrap();
        write_text_atomic("docs/x.md", "x", td.path()).await.unwrap();
        let got = list("docs", td.path()).await.unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[0].path, "docs/x.md");
        assert_eq!(got[0].kind, "file");
    }

    #[tokio::test]
    async fn list_missing_directory_returns_not_found() {
        let td = TempDir::new().unwrap();
        let err = list("nope", td.path()).await.unwrap_err();
        assert!(matches!(err, VaultError::NotFound { .. }));
    }
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib vault::io`
Expected: 10 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/vault/io.rs
git commit -m "feat(vault): list directory entries with kind + sorted output"
```

---

## Task 11: `vault::io` — `rename`, `delete`, `exists`

**Files:**
- Modify: `src-tauri/src/vault/io.rs`

- [ ] **Step 1: Append the three operations + tests**

After `list`, add:

```rust
/// Rename a vault-relative file or directory.
pub async fn rename(from: &str, to: &str, root: &Path) -> Result<(), VaultError> {
    let from_abs = resolve(from, root)?;
    let to_abs = resolve(to, root)?;
    if let Some(parent) = to_abs.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| VaultError::io(to, e))?;
    }
    fs::rename(&from_abs, &to_abs)
        .await
        .map_err(|e| VaultError::io(from, e))
}

/// Delete a vault-relative file or directory (recursive for directories).
pub async fn delete(rel: &str, root: &Path) -> Result<(), VaultError> {
    let abs = resolve(rel, root)?;
    let metadata = fs::metadata(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    if metadata.is_dir() {
        fs::remove_dir_all(&abs)
            .await
            .map_err(|e| VaultError::io(rel, e))
    } else {
        fs::remove_file(&abs)
            .await
            .map_err(|e| VaultError::io(rel, e))
    }
}

/// Check whether a vault-relative path exists. Path traversal still rejects.
pub async fn exists(rel: &str, root: &Path) -> Result<bool, VaultError> {
    let abs = resolve(rel, root)?;
    Ok(fs::try_exists(&abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?)
}
```

Append to the `tests` block:

```rust
    #[tokio::test]
    async fn renames_file_creating_parents() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        rename("a.md", "docs/b.md", td.path()).await.unwrap();
        assert!(!td.path().join("a.md").exists());
        assert!(td.path().join("docs/b.md").exists());
    }

    #[tokio::test]
    async fn deletes_file() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        delete("a.md", td.path()).await.unwrap();
        assert!(!td.path().join("a.md").exists());
    }

    #[tokio::test]
    async fn deletes_directory_recursively() {
        let td = TempDir::new().unwrap();
        write_text_atomic("d/x.md", "x", td.path()).await.unwrap();
        write_text_atomic("d/y.md", "y", td.path()).await.unwrap();
        delete("d", td.path()).await.unwrap();
        assert!(!td.path().join("d").exists());
    }

    #[tokio::test]
    async fn exists_reports_present_and_absent() {
        let td = TempDir::new().unwrap();
        write_text_atomic("a.md", "x", td.path()).await.unwrap();
        assert!(exists("a.md", td.path()).await.unwrap());
        assert!(!exists("b.md", td.path()).await.unwrap());
    }
```

- [ ] **Step 2: Run tests**

Run: `cd src-tauri && cargo test --lib vault::io`
Expected: 14 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/vault/io.rs
git commit -m "feat(vault): rename + delete + exists operations"
```

---

## Task 12: `Vault` state struct + 10 `#[tauri::command]` handlers

**Files:**
- Modify: `src-tauri/src/vault/mod.rs`
- Create: `src-tauri/src/vault/commands.rs`

- [ ] **Step 1: Add the `Vault` state struct to `src/vault/mod.rs`**

```rust
//! Vault filesystem adapter (commands, IO, path safety, errors).

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod commands;
pub mod error;
pub mod io;
pub mod path;
pub use error::VaultError;

/// In-memory holder for the active vault root path. Tauri stores this as
/// shared state; commands lock-and-clone the root before doing IO.
#[derive(Default)]
pub struct Vault {
    pub root: RwLock<Option<PathBuf>>,
}

pub type VaultState = Arc<Vault>;

impl Vault {
    pub async fn root_or_error(&self) -> Result<PathBuf, VaultError> {
        self.root
            .read()
            .await
            .clone()
            .ok_or(VaultError::NoVault)
    }

    pub async fn set_root(&self, path: PathBuf) {
        *self.root.write().await = Some(path);
    }
}
```

- [ ] **Step 2: Create `src/vault/commands.rs` with the 10 command handlers**

```rust
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::{DialogExt, FilePath};

use super::error::VaultError;
use super::io::{self, DirEntry};
use super::VaultState;

#[tauri::command]
pub async fn vault_pick(app: AppHandle) -> Result<Option<String>, VaultError> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .pick_folder(move |result| {
            let _ = tx.send(result);
        });
    let result = rx.await.map_err(|e| VaultError::Io {
        path: String::new(),
        message: e.to_string(),
    })?;
    Ok(result.and_then(|fp| match fp {
        FilePath::Path(p) => Some(p.to_string_lossy().into_owned()),
        FilePath::Url(_) => None,
    }))
}

#[tauri::command]
pub async fn vault_set_root(
    path: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    state.set_root(PathBuf::from(path)).await;
    Ok(())
}

#[tauri::command]
pub async fn vault_read_text(
    path: String,
    state: State<'_, VaultState>,
) -> Result<String, VaultError> {
    let root = state.root_or_error().await?;
    io::read_text(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_text(
    path: String,
    content: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_text_atomic(&path, &content, &root).await
}

#[tauri::command]
pub async fn vault_read_json(
    path: String,
    state: State<'_, VaultState>,
) -> Result<serde_json::Value, VaultError> {
    let root = state.root_or_error().await?;
    io::read_json(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_json(
    path: String,
    value: serde_json::Value,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_json_atomic(&path, &value, &root).await
}

#[tauri::command]
pub async fn vault_list(
    dir: String,
    state: State<'_, VaultState>,
) -> Result<Vec<DirEntry>, VaultError> {
    let root = state.root_or_error().await?;
    io::list(&dir, &root).await
}

#[tauri::command]
pub async fn vault_rename(
    from: String,
    to: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::rename(&from, &to, &root).await
}

#[tauri::command]
pub async fn vault_delete(
    path: String,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::delete(&path, &root).await
}

#[tauri::command]
pub async fn vault_exists(
    path: String,
    state: State<'_, VaultState>,
) -> Result<bool, VaultError> {
    let root = state.root_or_error().await?;
    io::exists(&path, &root).await
}
```

- [ ] **Step 3: Verify the module compiles**

Run: `cd src-tauri && cargo build`
Expected: clean build with no errors. Warnings about unused `commands` symbols are fine until Task 13 wires them into `main.rs`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/vault/mod.rs src-tauri/src/vault/commands.rs
git commit -m "feat(vault): Vault state + 10 #[tauri::command] handlers"
```

---

## Task 13: Register commands in `main.rs` and verify `cargo test` is green

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Wire the 10 commands and the `Vault` state into the builder**

```rust
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Verify the full Rust suite passes**

Run: `cd src-tauri && cargo test`
Expected: all tests across `vault::error`, `vault::path`, `vault::io` pass — 25 tests total (5 + 6 + 14).

- [ ] **Step 3: Run a smoke build**

Run: `cd src-tauri && cargo build`
Expected: clean build with no warnings about unused command symbols.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(tauri): register vault commands + state"
```

---

## Task 14: `tauriBridge.ts` — typed `invoke` wrappers

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tauriBridge.ts`

- [ ] **Step 1: Implement the bridge**

```ts
/**
 * Typed wrappers around the 10 `vault_*` Tauri commands plus an error
 * translator that converts the `VaultError` tagged union into the existing
 * `FileSystemError` so consumer code keeps the same `try/catch` ergonomics.
 */

import { invoke } from "@tauri-apps/api/core";

import { FileSystemError } from "../domain/errors";

interface RawVaultError {
  kind:
    | "no_vault"
    | "not_found"
    | "permission_denied"
    | "path_escape"
    | "io"
    | "parse";
  path?: string;
  message?: string;
}

function isRawVaultError(value: unknown): value is RawVaultError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}

function translate(err: unknown, fallbackPath: string): FileSystemError {
  if (isRawVaultError(err)) {
    const path = err.path ?? fallbackPath;
    switch (err.kind) {
      case "no_vault":
        return new FileSystemError("not-found", "no vault root configured", path);
      case "not_found":
        return new FileSystemError("not-found", `not found: ${path}`, path);
      case "permission_denied":
        return new FileSystemError("permission-denied", `permission denied: ${path}`, path);
      case "path_escape":
        return new FileSystemError("invalid-path", `path escapes vault root: ${path}`, path);
      case "io":
        return new FileSystemError("io", err.message ?? "io error", path);
      case "parse":
        return new FileSystemError("malformed", err.message ?? "parse error", path);
    }
  }
  return new FileSystemError(
    "io",
    err instanceof Error ? err.message : String(err),
    fallbackPath,
  );
}

export interface VaultDirEntry {
  name: string;
  kind: "file" | "directory";
  path: string;
}

async function call<T>(cmd: string, args: Record<string, unknown>, pathArg: string): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    throw translate(err, pathArg);
  }
}

export const tauriBridge = {
  pick(): Promise<string | null> {
    return call<string | null>("vault_pick", {}, "");
  },
  setRoot(path: string): Promise<void> {
    return call<void>("vault_set_root", { path }, path);
  },
  readText(path: string): Promise<string> {
    return call<string>("vault_read_text", { path }, path);
  },
  writeText(path: string, content: string): Promise<void> {
    return call<void>("vault_write_text", { path, content }, path);
  },
  readJson<T = unknown>(path: string): Promise<T> {
    return call<T>("vault_read_json", { path }, path);
  },
  writeJson(path: string, value: unknown): Promise<void> {
    return call<void>("vault_write_json", { path, value }, path);
  },
  list(dir: string): Promise<VaultDirEntry[]> {
    return call<VaultDirEntry[]>("vault_list", { dir }, dir);
  },
  rename(from: string, to: string): Promise<void> {
    return call<void>("vault_rename", { from, to }, from);
  },
  delete(path: string): Promise<void> {
    return call<void>("vault_delete", { path }, path);
  },
  exists(path: string): Promise<boolean> {
    return call<boolean>("vault_exists", { path }, path);
  },
};
```

- [ ] **Step 2: Verify imports resolve**

Run: `npm run typecheck`
Expected: no new errors. (If `FileSystemError`'s constructor signature differs from the call sites above, adjust the constructor call to match — read `src/app/knowledge_base/domain/errors.ts` and align.)

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tauriBridge.ts
git commit -m "feat(infra): tauriBridge — typed wrappers + VaultError translation"
```

---

## Task 15: `tauriBridge.test.ts` — contract tests against mocked `invoke`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tauriBridge.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemError } from "../domain/errors";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { tauriBridge } from "./tauriBridge";

describe("tauriBridge", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("calls vault_read_text with the path arg", async () => {
    invokeMock.mockResolvedValue("hello");
    const got = await tauriBridge.readText("docs/topic.md");
    expect(invokeMock).toHaveBeenCalledWith("vault_read_text", { path: "docs/topic.md" });
    expect(got).toBe("hello");
  });

  it("calls vault_write_text with path + content", async () => {
    invokeMock.mockResolvedValue(undefined);
    await tauriBridge.writeText("docs/topic.md", "x");
    expect(invokeMock).toHaveBeenCalledWith("vault_write_text", {
      path: "docs/topic.md",
      content: "x",
    });
  });

  it("calls vault_list with dir", async () => {
    invokeMock.mockResolvedValue([{ name: "a.md", kind: "file", path: "a.md" }]);
    const got = await tauriBridge.list("");
    expect(invokeMock).toHaveBeenCalledWith("vault_list", { dir: "" });
    expect(got).toEqual([{ name: "a.md", kind: "file", path: "a.md" }]);
  });

  it("translates not_found into FileSystemError('not-found')", async () => {
    invokeMock.mockRejectedValue({ kind: "not_found", path: "missing.md" });
    await expect(tauriBridge.readText("missing.md")).rejects.toBeInstanceOf(
      FileSystemError,
    );
    try {
      await tauriBridge.readText("missing.md");
    } catch (e) {
      expect((e as FileSystemError).kind).toBe("not-found");
    }
  });

  it("translates path_escape into FileSystemError('invalid-path')", async () => {
    invokeMock.mockRejectedValue({ kind: "path_escape", path: "../etc" });
    try {
      await tauriBridge.readText("../etc");
    } catch (e) {
      expect((e as FileSystemError).kind).toBe("invalid-path");
    }
  });

  it("translates parse into FileSystemError('malformed')", async () => {
    invokeMock.mockRejectedValue({ kind: "parse", path: "x.json", message: "bad" });
    try {
      await tauriBridge.readJson("x.json");
    } catch (e) {
      expect((e as FileSystemError).kind).toBe("malformed");
    }
  });

  it("translates no_vault into FileSystemError", async () => {
    invokeMock.mockRejectedValue({ kind: "no_vault" });
    try {
      await tauriBridge.readText("anything");
    } catch (e) {
      expect(e).toBeInstanceOf(FileSystemError);
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/tauriBridge.test.ts`
Expected: 7 tests passing.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tauriBridge.test.ts
git commit -m "test(infra): tauriBridge contract tests against mocked invoke"
```

---

## Task 16: `documentRepoTauri.ts` — pattern-setting repo

**Files:**
- Create: `src/app/knowledge_base/infrastructure/documentRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts`

- [ ] **Step 1: Read the existing FSA repo to mirror its interface**

Open `src/app/knowledge_base/infrastructure/documentRepo.ts` and `src/app/knowledge_base/domain/repositories.ts` (`DocumentRepository` block). The contract is `read(path) → string` and `write(path, content)`.

- [ ] **Step 2: Write the failing test**

Create `src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createDocumentRepositoryTauri } from "./documentRepoTauri";

describe("documentRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("content");
    const repo = createDocumentRepositoryTauri();
    const got = await repo.read("docs/topic.md");
    expect(bridge.readText).toHaveBeenCalledWith("docs/topic.md");
    expect(got).toBe("content");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createDocumentRepositoryTauri();
    await repo.write("docs/topic.md", "x");
    expect(bridge.writeText).toHaveBeenCalledWith("docs/topic.md", "x");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL ("createDocumentRepositoryTauri not found")**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement the repo**

Create `src/app/knowledge_base/infrastructure/documentRepoTauri.ts`:

```ts
/**
 * Tauri implementation of `DocumentRepository`. Delegates raw read/write
 * to the vault VFS commands via `tauriBridge`.
 */

import type { DocumentRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createDocumentRepositoryTauri(): DocumentRepository {
  return {
    read(docPath) {
      return tauriBridge.readText(docPath);
    },
    write(docPath, content) {
      return tauriBridge.writeText(docPath, content);
    },
  };
}
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts`
Expected: 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/documentRepoTauri.ts src/app/knowledge_base/infrastructure/documentRepoTauri.test.ts
git commit -m "feat(infra): documentRepoTauri over tauriBridge"
```

---

## Task 17: `diagramRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/diagramRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/diagramRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/diagramRepo.ts` and the `DiagramRepository` block in `domain/repositories.ts`. Note the exact method names — likely `read(path) → DiagramData` and `write(path, data)`. If the FSA repo uses any helpers (e.g., schema validation), keep that logic in TS — only swap the FSA calls for `tauriBridge.readJson` / `writeJson`.

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createDiagramRepositoryTauri } from "./diagramRepoTauri";

describe("diagramRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
  });

  it("read forwards to tauriBridge.readJson", async () => {
    const data = { nodes: [], connections: [], flows: [] };
    bridge.readJson.mockResolvedValue(data);
    const repo = createDiagramRepositoryTauri();
    const got = await repo.read("diagrams/x.json");
    expect(bridge.readJson).toHaveBeenCalledWith("diagrams/x.json");
    expect(got).toEqual(data);
  });

  it("write forwards to tauriBridge.writeJson", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createDiagramRepositoryTauri();
    const data = { nodes: [], connections: [], flows: [] };
    await repo.write("diagrams/x.json", data);
    expect(bridge.writeJson).toHaveBeenCalledWith("diagrams/x.json", data);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/diagramRepoTauri.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 4: Implement the repo (mirror the existing FSA shape, swapping FSA calls for tauriBridge equivalents)**

Create `diagramRepoTauri.ts` modelled on `diagramRepo.ts`:

```ts
import type { DiagramRepository } from "../domain/repositories";
import type { DiagramData } from "../shared/utils/types";
import { tauriBridge } from "./tauriBridge";

export function createDiagramRepositoryTauri(): DiagramRepository {
  return {
    async read(path: string): Promise<DiagramData> {
      const value = await tauriBridge.readJson<DiagramData>(path);
      return value;
    },
    async write(path: string, data: DiagramData): Promise<void> {
      await tauriBridge.writeJson(path, data);
    },
  };
}
```

If the existing FSA repo does any extra normalization (default fields, schema migrations) before returning, replicate it in this implementation by reading the FSA repo's body and porting the same logic — only the IO call changes.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/diagramRepoTauri.test.ts`
Expected: 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/diagramRepoTauri.ts src/app/knowledge_base/infrastructure/diagramRepoTauri.test.ts
git commit -m "feat(infra): diagramRepoTauri over tauriBridge"
```

---

## Task 18: `svgRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/svgRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/svgRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/svgRepo.ts` and the `SVGRepository` block in `domain/repositories.ts`. SVGs are stored as raw text (`.svg` files), so this should use `tauriBridge.readText` / `writeText`.

- [ ] **Step 2: Write the failing test (mirror the documentRepoTauri test structure with SVG-specific paths)**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createSVGRepositoryTauri } from "./svgRepoTauri";

describe("svgRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("<svg/>");
    const repo = createSVGRepositoryTauri();
    const got = await repo.read("diagrams/x.svg");
    expect(bridge.readText).toHaveBeenCalledWith("diagrams/x.svg");
    expect(got).toBe("<svg/>");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createSVGRepositoryTauri();
    await repo.write("diagrams/x.svg", "<svg/>");
    expect(bridge.writeText).toHaveBeenCalledWith("diagrams/x.svg", "<svg/>");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/svgRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { SVGRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createSVGRepositoryTauri(): SVGRepository {
  return {
    read(path) {
      return tauriBridge.readText(path);
    },
    write(path, content) {
      return tauriBridge.writeText(path, content);
    },
  };
}
```

If `SVGRepository`'s contract has additional methods (look at `domain/repositories.ts`), implement them similarly using `tauriBridge` calls and add tests for each.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/svgRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/svgRepoTauri.ts src/app/knowledge_base/infrastructure/svgRepoTauri.test.ts
git commit -m "feat(infra): svgRepoTauri over tauriBridge"
```

---

## Task 19: `tabRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tabRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/tabRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/tabRepo.ts` and the `TabRepository` block in `domain/repositories.ts`. Tabs use the `.alphatex` text format so this is `readText`/`writeText`.

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readText: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createTabRepositoryTauri } from "./tabRepoTauri";

describe("tabRepoTauri", () => {
  afterEach(() => {
    bridge.readText.mockReset();
    bridge.writeText.mockReset();
  });

  it("read forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("\\title \"X\"");
    const repo = createTabRepositoryTauri();
    const got = await repo.read("tabs/song.alphatex");
    expect(bridge.readText).toHaveBeenCalledWith("tabs/song.alphatex");
    expect(got).toBe("\\title \"X\"");
  });

  it("write forwards to tauriBridge.writeText", async () => {
    bridge.writeText.mockResolvedValue(undefined);
    const repo = createTabRepositoryTauri();
    await repo.write("tabs/song.alphatex", "x");
    expect(bridge.writeText).toHaveBeenCalledWith("tabs/song.alphatex", "x");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/tabRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { TabRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createTabRepositoryTauri(): TabRepository {
  return {
    read(path) {
      return tauriBridge.readText(path);
    },
    write(path, content) {
      return tauriBridge.writeText(path, content);
    },
  };
}
```

Mirror the existing FSA repo's full surface — check `tabRepo.ts` for any additional methods and replicate them.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/tabRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tabRepoTauri.ts src/app/knowledge_base/infrastructure/tabRepoTauri.test.ts
git commit -m "feat(infra): tabRepoTauri over tauriBridge"
```

---

## Task 20: `attachmentRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/attachmentRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/attachmentRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/attachmentRepo.ts` and the `AttachmentRepository` block. Contract: `write(filename, bytes: ArrayBuffer)` and `exists(filename)`.

- [ ] **Step 2: Decide on binary transport**

`tauriBridge.writeText` only takes strings. For arbitrary bytes, encode the `ArrayBuffer` as a base64 string and add a new `tauriBridge.writeBytes` wrapper that forwards through a Rust-side base64 decoder. Since Tauri commands accept arrays of `u8`, the cleaner path is to add a new wrapper that passes `Array<number>`:

In `src/app/knowledge_base/infrastructure/tauriBridge.ts`, add (just below `writeText`):

```ts
async writeBytes(path: string, bytes: ArrayBuffer): Promise<void> {
  const arr = Array.from(new Uint8Array(bytes));
  return call<void>("vault_write_bytes", { path, bytes: arr }, path);
},
async readBytes(path: string): Promise<ArrayBuffer> {
  const arr = await call<number[]>("vault_read_bytes", { path }, path);
  return new Uint8Array(arr).buffer;
},
```

In `src-tauri/src/vault/io.rs`, add:

```rust
pub async fn read_bytes(rel: &str, root: &Path) -> Result<Vec<u8>, VaultError> {
    let abs = resolve(rel, root)?;
    fs::read(&abs).await.map_err(|e| VaultError::io(rel, e))
}

pub async fn write_bytes_atomic(
    rel: &str,
    bytes: &[u8],
    root: &Path,
) -> Result<(), VaultError> {
    let abs = resolve(rel, root)?;
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| VaultError::io(rel, e))?;
    }
    let tmp = abs.with_extension(
        abs.extension()
            .map(|e| format!("{}.tmp", e.to_string_lossy()))
            .unwrap_or_else(|| "tmp".to_string()),
    );
    fs::write(&tmp, bytes)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    let f = fs::OpenOptions::new()
        .write(true)
        .open(&tmp)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    f.sync_all().await.map_err(|e| VaultError::io(rel, e))?;
    drop(f);
    fs::rename(&tmp, &abs)
        .await
        .map_err(|e| VaultError::io(rel, e))?;
    Ok(())
}
```

Append a round-trip test in the same `tests` module:

```rust
    #[tokio::test]
    async fn round_trips_bytes() {
        let td = TempDir::new().unwrap();
        let bytes = vec![0u8, 1, 2, 3, 255];
        write_bytes_atomic("bin/x.dat", &bytes, td.path()).await.unwrap();
        let got = read_bytes("bin/x.dat", td.path()).await.unwrap();
        assert_eq!(got, bytes);
    }
```

In `src-tauri/src/vault/commands.rs`, append:

```rust
#[tauri::command]
pub async fn vault_read_bytes(
    path: String,
    state: State<'_, VaultState>,
) -> Result<Vec<u8>, VaultError> {
    let root = state.root_or_error().await?;
    io::read_bytes(&path, &root).await
}

#[tauri::command]
pub async fn vault_write_bytes(
    path: String,
    bytes: Vec<u8>,
    state: State<'_, VaultState>,
) -> Result<(), VaultError> {
    let root = state.root_or_error().await?;
    io::write_bytes_atomic(&path, &bytes, &root).await
}
```

In `src-tauri/src/main.rs`, register the two new commands in the `generate_handler!` list.

This bumps the VFS surface to 12 commands; update the spec implementation note privately if you want, but don't change the spec doc — the spec deliberately stayed at 10 to avoid binary-detail clutter; binary support is an implementation requirement of `AttachmentRepository`.

- [ ] **Step 3: Verify Rust tests still pass**

Run: `cd src-tauri && cargo test`
Expected: 26 tests passing (previous 25 + 1 new bytes round-trip).

- [ ] **Step 4: Write the failing TS test**

Create `src/app/knowledge_base/infrastructure/attachmentRepoTauri.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  writeBytes: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createAttachmentRepositoryTauri } from "./attachmentRepoTauri";

describe("attachmentRepoTauri", () => {
  afterEach(() => {
    bridge.writeBytes.mockReset();
    bridge.exists.mockReset();
  });

  it("write skips when exists returns true (hash dedup)", async () => {
    bridge.exists.mockResolvedValue(true);
    const repo = createAttachmentRepositoryTauri();
    await repo.write("hash123.png", new Uint8Array([1, 2, 3]).buffer);
    expect(bridge.writeBytes).not.toHaveBeenCalled();
  });

  it("write forwards bytes when file does not exist", async () => {
    bridge.exists.mockResolvedValue(false);
    bridge.writeBytes.mockResolvedValue(undefined);
    const repo = createAttachmentRepositoryTauri();
    const buf = new Uint8Array([1, 2, 3]).buffer;
    await repo.write("hash123.png", buf);
    expect(bridge.writeBytes).toHaveBeenCalledWith(".attachments/hash123.png", buf);
  });

  it("exists checks the .attachments path", async () => {
    bridge.exists.mockResolvedValue(true);
    const repo = createAttachmentRepositoryTauri();
    const got = await repo.exists("hash123.png");
    expect(bridge.exists).toHaveBeenCalledWith(".attachments/hash123.png");
    expect(got).toBe(true);
  });
});
```

- [ ] **Step 5: Implement the repo**

```ts
/**
 * Tauri implementation of `AttachmentRepository`. Stores binary blobs at
 * `.attachments/<filename>`; skips writes when the file already exists
 * (hash-dedup contract from the FSA implementation).
 */

import type { AttachmentRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

const ATTACH_DIR = ".attachments";

export function createAttachmentRepositoryTauri(): AttachmentRepository {
  return {
    async write(filename, bytes) {
      const path = `${ATTACH_DIR}/${filename}`;
      if (await tauriBridge.exists(path)) return;
      await tauriBridge.writeBytes(path, bytes);
    },
    exists(filename) {
      return tauriBridge.exists(`${ATTACH_DIR}/${filename}`);
    },
  };
}
```

- [ ] **Step 6: Run all relevant tests**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/attachmentRepoTauri.test.ts`
Expected: 3 tests passing.

Run: `cd src-tauri && cargo test`
Expected: still 26 tests passing.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/vault/io.rs src-tauri/src/vault/commands.rs src-tauri/src/main.rs src/app/knowledge_base/infrastructure/tauriBridge.ts src/app/knowledge_base/infrastructure/attachmentRepoTauri.ts src/app/knowledge_base/infrastructure/attachmentRepoTauri.test.ts
git commit -m "feat(infra): attachmentRepoTauri + binary VFS commands (read_bytes / write_bytes)"
```

---

## Task 21: `attachmentLinksRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts` and the `AttachmentLinksRepository` block. The store is `attachmentLinks.json` at the vault root; the contract is `load(): AttachmentLink[]` and `save(rows): void`.

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createAttachmentLinksRepositoryTauri } from "./attachmentLinksRepoTauri";

const STORE = "attachmentLinks.json";

describe("attachmentLinksRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  it("load returns empty array when file is absent", async () => {
    bridge.exists.mockResolvedValue(false);
    const repo = createAttachmentLinksRepositoryTauri();
    const got = await repo.load();
    expect(bridge.readJson).not.toHaveBeenCalled();
    expect(got).toEqual([]);
  });

  it("load reads existing rows when file is present", async () => {
    const rows = [{ scope: "node", entityId: "n1", filePath: "x.md" }];
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue(rows);
    const repo = createAttachmentLinksRepositoryTauri();
    const got = await repo.load();
    expect(bridge.readJson).toHaveBeenCalledWith(STORE);
    expect(got).toEqual(rows);
  });

  it("save writes rows to the store", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createAttachmentLinksRepositoryTauri();
    const rows = [{ scope: "node", entityId: "n1", filePath: "x.md" }];
    await repo.save(rows);
    expect(bridge.writeJson).toHaveBeenCalledWith(STORE, rows);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { AttachmentLink } from "../domain/attachmentLinks";
import type { AttachmentLinksRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

const STORE = "attachmentLinks.json";

export function createAttachmentLinksRepositoryTauri(): AttachmentLinksRepository {
  return {
    async load() {
      if (!(await tauriBridge.exists(STORE))) return [];
      return tauriBridge.readJson<AttachmentLink[]>(STORE);
    },
    save(rows) {
      return tauriBridge.writeJson(STORE, rows);
    },
  };
}
```

If the existing FSA repo exposes more methods than `load`/`save` (check the file), extend this implementation to mirror them and add tests.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.ts src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.test.ts
git commit -m "feat(infra): attachmentLinksRepoTauri over tauriBridge"
```

---

## Task 22: `linkIndexRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/linkIndexRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/linkIndexRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/linkIndexRepo.ts` and the `LinkIndexRepository` block. Contract: `load() → LinkIndex`, `save(index)`, `readDocContent(docPath) → string`. Store is `.archdesigner/_links.json`.

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  readText: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createLinkIndexRepositoryTauri } from "./linkIndexRepoTauri";

const STORE = ".archdesigner/_links.json";

describe("linkIndexRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.readText.mockReset();
  });

  it("load reads the index file", async () => {
    const index = { entries: [], updatedAt: 0 };
    bridge.readJson.mockResolvedValue(index);
    const repo = createLinkIndexRepositoryTauri();
    const got = await repo.load();
    expect(bridge.readJson).toHaveBeenCalledWith(STORE);
    expect(got).toEqual(index);
  });

  it("save writes the index with updatedAt stamp", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createLinkIndexRepositoryTauri();
    const index = { entries: [], updatedAt: 0 };
    await repo.save(index);
    expect(bridge.writeJson).toHaveBeenCalledTimes(1);
    const [path, written] = bridge.writeJson.mock.calls[0];
    expect(path).toBe(STORE);
    expect((written as { updatedAt: number }).updatedAt).toBeGreaterThan(0);
  });

  it("readDocContent forwards to tauriBridge.readText", async () => {
    bridge.readText.mockResolvedValue("body");
    const repo = createLinkIndexRepositoryTauri();
    const got = await repo.readDocContent("docs/topic.md");
    expect(bridge.readText).toHaveBeenCalledWith("docs/topic.md");
    expect(got).toBe("body");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/linkIndexRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { LinkIndex } from "../features/document/types";
import type { LinkIndexRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

const STORE = ".archdesigner/_links.json";

export function createLinkIndexRepositoryTauri(): LinkIndexRepository {
  return {
    load() {
      return tauriBridge.readJson<LinkIndex>(STORE);
    },
    save(index) {
      return tauriBridge.writeJson(STORE, { ...index, updatedAt: Date.now() });
    },
    readDocContent(docPath) {
      return tauriBridge.readText(docPath);
    },
  };
}
```

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/linkIndexRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/linkIndexRepoTauri.ts src/app/knowledge_base/infrastructure/linkIndexRepoTauri.test.ts
git commit -m "feat(infra): linkIndexRepoTauri over tauriBridge"
```

---

## Task 23: `vaultConfigRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/vaultConfigRepo.ts` and the `VaultConfigRepository` block (`init`, `read`, `touchLastOpened`, `update`, `isVault`). The pure `vaultConfig.ts` helpers in `features/document/utils/vaultConfig.ts` already implement the logic against a generic FS abstraction — port the same logic but call into `tauriBridge` directly. The store is `.archdesigner/config.json`.

- [ ] **Step 2: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createVaultConfigRepositoryTauri } from "./vaultConfigRepoTauri";

const STORE = ".archdesigner/config.json";

describe("vaultConfigRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  it("init writes a fresh config and returns it", async () => {
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createVaultConfigRepositoryTauri();
    const cfg = await repo.init("MyVault");
    expect(bridge.writeJson).toHaveBeenCalledWith(STORE, expect.objectContaining({ name: "MyVault", version: expect.any(String) }));
    expect(cfg.name).toBe("MyVault");
  });

  it("read returns the persisted config", async () => {
    const cfg = { name: "X", version: "1.0", created: 0, lastOpened: 0 };
    bridge.readJson.mockResolvedValue(cfg);
    const repo = createVaultConfigRepositoryTauri();
    const got = await repo.read();
    expect(bridge.readJson).toHaveBeenCalledWith(STORE);
    expect(got).toEqual(cfg);
  });

  it("touchLastOpened reads, bumps, writes", async () => {
    const cfg = { name: "X", version: "1.0", created: 0, lastOpened: 0 };
    bridge.readJson.mockResolvedValue(cfg);
    bridge.writeJson.mockResolvedValue(undefined);
    const repo = createVaultConfigRepositoryTauri();
    await repo.touchLastOpened();
    expect(bridge.writeJson).toHaveBeenCalledTimes(1);
    const [, written] = bridge.writeJson.mock.calls[0];
    expect((written as { lastOpened: number }).lastOpened).toBeGreaterThan(0);
  });

  it("isVault returns true for a complete config", () => {
    const repo = createVaultConfigRepositoryTauri();
    const got = repo.isVault({ name: "X", version: "1.0", created: 0, lastOpened: 0 });
    expect(got).toBe(true);
  });

  it("isVault returns false for null", () => {
    const repo = createVaultConfigRepositoryTauri();
    expect(repo.isVault(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

Read `features/document/utils/vaultConfig.ts` for the exact `VaultConfig` shape and any default fields (e.g., `version`, `archetypePreferences`, etc.). Port it to:

```ts
import type { VaultConfigRepository } from "../domain/repositories";
import type { VaultConfig } from "../shared/utils/types";
import { tauriBridge } from "./tauriBridge";

const STORE = ".archdesigner/config.json";

export function createVaultConfigRepositoryTauri(): VaultConfigRepository {
  return {
    async init(vaultName) {
      const now = Date.now();
      const cfg: VaultConfig = {
        name: vaultName,
        version: "1.0",
        created: now,
        lastOpened: now,
      };
      await tauriBridge.writeJson(STORE, cfg);
      return cfg;
    },
    read() {
      return tauriBridge.readJson<VaultConfig>(STORE);
    },
    async touchLastOpened() {
      const cfg = await tauriBridge.readJson<VaultConfig>(STORE);
      await tauriBridge.writeJson(STORE, { ...cfg, lastOpened: Date.now() });
    },
    async update(patch) {
      const cfg = await tauriBridge.readJson<VaultConfig>(STORE);
      const next = { ...cfg, ...patch };
      await tauriBridge.writeJson(STORE, next);
      return next;
    },
    isVault(config) {
      return !!config && typeof config.name === "string" && typeof config.version === "string";
    },
  };
}
```

If the existing FSA repo's `init` writes additional sidecar files (e.g., `_links.json` seed, `MEMORY.md` template), reproduce those writes here using `tauriBridge.writeJson` / `writeText`.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts`
Expected: 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.ts src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts
git commit -m "feat(infra): vaultConfigRepoTauri — init / read / touchLastOpened / update / isVault"
```

---

## Task 24: `svgRefsRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/svgRefsRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/svgRefsRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/svgRefsRepo.ts` and the `SvgRefsRepository` block in `domain/svgRefs.ts`. The store is `<file>.svg.refs.json` per-SVG sidecar.

- [ ] **Step 2: Write the failing test**

Mirror the pattern of `attachmentLinksRepoTauri.test.ts`, but with an SVG-specific path. The exact contract methods come from the existing FSA repo — read it and write tests for each. Skeleton:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createSvgRefsRepositoryTauri } from "./svgRefsRepoTauri";

describe("svgRefsRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  it("loads sidecar path correctly given an svg path", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue({ version: 1, refs: [] });
    const repo = createSvgRefsRepositoryTauri();
    await repo.load("diagrams/x.svg");
    expect(bridge.readJson).toHaveBeenCalledWith("diagrams/x.svg.refs.json");
  });
});
```

Add at least one `save` test mirroring the same sidecar-path translation.

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/svgRefsRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { SvgRefsRepository, SvgRefsPayload } from "../domain/svgRefs";
import { tauriBridge } from "./tauriBridge";

function sidecarPath(svgPath: string): string {
  return `${svgPath}.refs.json`;
}

export function createSvgRefsRepositoryTauri(): SvgRefsRepository {
  return {
    async load(svgPath) {
      const sidecar = sidecarPath(svgPath);
      if (!(await tauriBridge.exists(sidecar))) return null;
      return tauriBridge.readJson<SvgRefsPayload>(sidecar);
    },
    save(svgPath, payload) {
      return tauriBridge.writeJson(sidecarPath(svgPath), payload);
    },
  };
}
```

If the FSA repo has additional methods (delete sidecar on `delete()`, etc.), mirror them.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/svgRefsRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/svgRefsRepoTauri.ts src/app/knowledge_base/infrastructure/svgRefsRepoTauri.test.ts
git commit -m "feat(infra): svgRefsRepoTauri — sidecar load/save"
```

---

## Task 25: `tabRefsRepoTauri.ts`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tabRefsRepoTauri.ts`
- Create: `src/app/knowledge_base/infrastructure/tabRefsRepoTauri.test.ts`

- [ ] **Step 1: Read the existing repo + interface**

Open `src/app/knowledge_base/infrastructure/tabRefsRepo.ts` and the `TabRefsRepository` block in `domain/tabRefs.ts`. Store: `<file>.alphatex.refs.json` (or whatever the existing repo produces — confirm by reading `tabRefsRepo.ts`).

- [ ] **Step 2: Write the failing test (mirror Task 24's structure with the tab-specific sidecar suffix)**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
  exists: vi.fn(),
}));
vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createTabRefsRepositoryTauri } from "./tabRefsRepoTauri";

describe("tabRefsRepoTauri", () => {
  afterEach(() => {
    bridge.readJson.mockReset();
    bridge.writeJson.mockReset();
    bridge.exists.mockReset();
  });

  it("loads sidecar path correctly given a tab path", async () => {
    bridge.exists.mockResolvedValue(true);
    bridge.readJson.mockResolvedValue({ version: 3, refs: [] });
    const repo = createTabRefsRepositoryTauri();
    await repo.load("tabs/song.alphatex");
    expect(bridge.readJson).toHaveBeenCalledWith("tabs/song.alphatex.refs.json");
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepoTauri.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the repo**

```ts
import type { TabRefsRepository, TabRefsPayload } from "../domain/tabRefs";
import { tauriBridge } from "./tauriBridge";

function sidecarPath(tabPath: string): string {
  return `${tabPath}.refs.json`;
}

export function createTabRefsRepositoryTauri(): TabRefsRepository {
  return {
    async load(tabPath) {
      const sidecar = sidecarPath(tabPath);
      if (!(await tauriBridge.exists(sidecar))) return null;
      return tauriBridge.readJson<TabRefsPayload>(sidecar);
    },
    save(tabPath, payload) {
      return tauriBridge.writeJson(sidecarPath(tabPath), payload);
    },
  };
}
```

Mirror any additional methods on the FSA implementation.

- [ ] **Step 5: Run test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepoTauri.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/tabRefsRepoTauri.ts src/app/knowledge_base/infrastructure/tabRefsRepoTauri.test.ts
git commit -m "feat(infra): tabRefsRepoTauri — sidecar load/save"
```

---

## Task 26: Update `RepositoryContext` to accept `vaultPath`

**Files:**
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx`
- Modify: `src/app/knowledge_base/shell/RepositoryContext.test.tsx`

- [ ] **Step 1: Update the existing test for the new prop shape**

Open `src/app/knowledge_base/shell/RepositoryContext.test.tsx`. Anywhere a `rootHandle` prop is passed to `<RepositoryProvider>`, replace it with `vaultPath`. For example:

```tsx
// before
<RepositoryProvider rootHandle={mockHandle}>...

// after
<RepositoryProvider vaultPath="/tmp/test-vault">...
```

If a test asserts the bag of repos changes when the handle changes, update it to assert the same thing for `vaultPath`.

- [ ] **Step 2: Run the test — expect FAIL ("rootHandle is not a valid prop" or similar)**

Run: `npm run test:run -- src/app/knowledge_base/shell/RepositoryContext.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Update `RepositoryContext.tsx`**

Replace the imports of FSA repo factories with the Tauri ones, and switch the prop:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";

import type {
  AttachmentLinksRepository,
  AttachmentRepository,
  DiagramRepository,
  DocumentRepository,
  LinkIndexRepository,
  SVGRepository,
  TabRepository,
  VaultConfigRepository,
} from "../domain/repositories";
import type { SvgRefsRepository } from "../domain/svgRefs";
import type { TabRefsRepository } from "../domain/tabRefs";
import { createAttachmentLinksRepositoryTauri } from "../infrastructure/attachmentLinksRepoTauri";
import { createAttachmentRepositoryTauri } from "../infrastructure/attachmentRepoTauri";
import { createDiagramRepositoryTauri } from "../infrastructure/diagramRepoTauri";
import { createDocumentRepositoryTauri } from "../infrastructure/documentRepoTauri";
import { createLinkIndexRepositoryTauri } from "../infrastructure/linkIndexRepoTauri";
import { createSVGRepositoryTauri } from "../infrastructure/svgRepoTauri";
import { createSvgRefsRepositoryTauri } from "../infrastructure/svgRefsRepoTauri";
import { createTabRepositoryTauri } from "../infrastructure/tabRepoTauri";
import { createTabRefsRepositoryTauri } from "../infrastructure/tabRefsRepoTauri";
import { createVaultConfigRepositoryTauri } from "../infrastructure/vaultConfigRepoTauri";

export interface Repositories {
  attachment: AttachmentRepository | null;
  attachmentLinks: AttachmentLinksRepository | null;
  diagram: DiagramRepository | null;
  document: DocumentRepository | null;
  linkIndex: LinkIndexRepository | null;
  svg: SVGRepository | null;
  svgRefs: SvgRefsRepository | null;
  tab: TabRepository | null;
  tabRefs: TabRefsRepository | null;
  vaultConfig: VaultConfigRepository | null;
}

const EMPTY_REPOS: Repositories = {
  attachment: null,
  attachmentLinks: null,
  diagram: null,
  document: null,
  linkIndex: null,
  svg: null,
  svgRefs: null,
  tab: null,
  tabRefs: null,
  vaultConfig: null,
};

export const RepositoryContext = createContext<Repositories | null>(null);

/**
 * Mount beneath `useFileExplorer()`'s consumer in `knowledgeBase.tsx`. The
 * provider re-memoizes the bag of repos whenever the active `vaultPath`
 * changes — so the pre-picker null state, picker acquisition, and any
 * future "switch vault" action all flow through the same subscription.
 *
 * Tests can bypass this provider by wrapping components in their own
 * provider with a stub `Repositories` value (see `StubRepositoryProvider`).
 */
export function RepositoryProvider({
  vaultPath,
  children,
}: {
  vaultPath: string | null;
  children: ReactNode;
}) {
  const value = useMemo<Repositories>(() => {
    if (!vaultPath) return EMPTY_REPOS;
    return {
      attachment: createAttachmentRepositoryTauri(),
      attachmentLinks: createAttachmentLinksRepositoryTauri(),
      diagram: createDiagramRepositoryTauri(),
      document: createDocumentRepositoryTauri(),
      linkIndex: createLinkIndexRepositoryTauri(),
      svg: createSVGRepositoryTauri(),
      svgRefs: createSvgRefsRepositoryTauri(),
      tab: createTabRepositoryTauri(),
      tabRefs: createTabRefsRepositoryTauri(),
      vaultConfig: createVaultConfigRepositoryTauri(),
    };
  }, [vaultPath]);

  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function StubRepositoryProvider({
  value,
  children,
}: {
  value: Repositories;
  children: ReactNode;
}) {
  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) {
    throw new Error(
      "useRepositories must be used within a RepositoryProvider (or StubRepositoryProvider in tests)",
    );
  }
  return ctx;
}
```

Note: the Tauri repo factories take no arguments because the active vault root lives in Rust state (set via `vault_set_root`). The `vaultPath` prop drives the memo identity — when it changes, the bag is rebuilt — but the Tauri repos themselves don't need the path.

- [ ] **Step 4: Run the updated test — expect PASS**

Run: `npm run test:run -- src/app/knowledge_base/shell/RepositoryContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shell/RepositoryContext.tsx src/app/knowledge_base/shell/RepositoryContext.test.tsx
git commit -m "feat(shell): RepositoryProvider takes vaultPath; Tauri-backed factories"
```

---

> **Re-scope note (2026-05-08):** Tasks 27 and 28 below were re-shaped during MVP-1a execution into Tasks 27a / 27b / 28a / 28b / 28c after discovering that ~30 consumer callsites reach past the typed `Repository` abstraction directly into `useFileExplorer.dirHandleRef.current` for raw FSA operations. See spec § 11.5 for the rationale. The original Task 27 / Task 28 sections that follow are kept as historical reference for what the plan looked like before re-scope, but the actual execution path is the lettered tasks below them.

## Task 27a: Add `VaultIndexRepository` for vault-level structural operations

**Files:**
- Modify: `src/app/knowledge_base/domain/repositories.ts` — add `VaultIndexRepository` interface.
- Modify: `src/app/knowledge_base/shared/utils/fileTree.ts` — remove `handle` / `dirHandle` fields from the `TreeNode` interface (or make them optional and never populated by the new scanner).
- Create: `src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts` — FSA implementation (delegates to existing `scanTree` + helpers from `fileExplorerHelpers.ts`).
- Create: `src/app/knowledge_base/infrastructure/vaultIndexRepoTauri.ts` — Tauri implementation (delegates to `tauriBridge.list` / `rename` / `delete` / `exists`).
- Create: `src/app/knowledge_base/infrastructure/vaultIndexRepoTauri.test.ts` — Vitest tests against mocked `tauriBridge`.
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx` — add `vaultIndex: VaultIndexRepository | null` to the `Repositories` bag and instantiate via `createVaultIndexRepositoryTauri()`.

- [ ] **Step 1: Read existing tree-walk + helpers**

```bash
cat src/app/knowledge_base/shared/utils/fileTree.ts
cat src/app/knowledge_base/shared/hooks/fileExplorerHelpers.ts
```

Note the existing `scanTree(handle, prefix) → TreeNode[]` shape. The new repo `scan()` returns `TreeNode[]` — same content, but `handle` and `dirHandle` fields are dropped.

- [ ] **Step 2: Define the interface in `domain/repositories.ts`**

Append:

```ts
import type { TreeNode } from "../shared/utils/types"; // or wherever TreeNode lives

/**
 * Vault-level structural operations: tree scan, rename, delete, exists,
 * createFolder. Decouples consumers from the underlying filesystem driver
 * (FSA vs Tauri).
 */
export interface VaultIndexRepository {
  /** Recursive scan of the vault root. Returns a sorted tree. Throws
   *  `FileSystemError` on failure. */
  scan(): Promise<TreeNode[]>;
  /** Rename or move a file or directory by vault-relative path. */
  rename(from: string, to: string): Promise<void>;
  /** Delete a file or directory (recursive for directories). */
  delete(path: string): Promise<void>;
  /** Check whether a vault-relative path exists. */
  exists(path: string): Promise<boolean>;
  /** Create an empty directory (and parents). */
  createFolder(path: string): Promise<void>;
}
```

If `TreeNode` lives in `shared/utils/fileTree.ts`, move its definition (or re-export) so the domain layer doesn't import from `shared/utils`.

- [ ] **Step 3: Drop FSA-specific fields from `TreeNode`**

Edit `fileTree.ts`:

```ts
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  fileType?: "diagram" | "document" | "svg" | "tab";
  children?: TreeNode[];
  lastModified?: number;
  // handle and dirHandle removed — consumers use useRepositories() for I/O.
}
```

This change WILL break direct-FSA callsites that read `node.handle` or `node.dirHandle`. Note them but do not fix them in this task — they're addressed in Tasks 28a/b.

- [ ] **Step 4: FSA-side implementation**

Create `vaultIndexRepoFsa.ts`:

```ts
import type { VaultIndexRepository } from "../domain/repositories";
import type { TreeNode } from "../shared/utils/fileTree";
import { scanTree } from "../shared/utils/fileTree";
// ...import the existing helpers for rename / delete / etc. from fileExplorerHelpers

export function createVaultIndexRepositoryFsa(
  rootHandle: FileSystemDirectoryHandle,
): VaultIndexRepository {
  return {
    async scan(): Promise<TreeNode[]> {
      const tree = await scanTree(rootHandle, "");
      // Strip handle/dirHandle from every node (recursive).
      return stripHandles(tree);
    },
    async rename(from, to) { /* delegate to existing helper */ },
    async delete(path) { /* delegate to existing helper */ },
    async exists(path) { /* try { getFileHandle/getDirectoryHandle } catch { return false } */ },
    async createFolder(path) { /* recursive getDirectoryHandle({ create: true }) */ },
  };
}

function stripHandles(nodes: TreeNode[]): TreeNode[] {
  return nodes.map(({ handle, dirHandle, children, ...rest }) => ({
    ...rest,
    children: children ? stripHandles(children) : undefined,
  }));
}
```

(The exact body depends on what helpers already exist in `fileExplorerHelpers.ts`. Read that file first and reuse, don't duplicate.)

- [ ] **Step 5: Tauri-side implementation**

Create `vaultIndexRepoTauri.ts`:

```ts
import type { VaultIndexRepository } from "../domain/repositories";
import type { TreeNode } from "../shared/utils/fileTree";
import { tauriBridge } from "./tauriBridge";

const KIND_BY_EXT: Record<string, TreeNode["fileType"]> = {
  ".md": "document",
  ".json": "diagram",
  ".svg": "svg",
  ".alphatex": "tab",
};

const HIDDEN_FOLDERS = new Set(["memory"]);
const HIDDEN_FILES = new Set(["CLAUDE.md", "MEMORY.md", "AGENTS.md"]);
const HIDDEN_FOLDER_PREFIX = ".";   // dot-folders skipped (.archdesigner, .claude, etc.)
const HISTORY_SIDECAR = /^\..*\.history\.json$/;

export function createVaultIndexRepositoryTauri(): VaultIndexRepository {
  return {
    scan() {
      return scanRecursive("");
    },
    rename(from, to) {
      return tauriBridge.rename(from, to);
    },
    delete(path) {
      return tauriBridge.delete(path);
    },
    exists(path) {
      return tauriBridge.exists(path);
    },
    async createFolder(path) {
      // Tauri's vault_write_text creates parent dirs as a side effect; for an
      // empty folder we use a sentinel sidecar then delete it, OR add a
      // vault_create_dir command. Simplest: if Rust doesn't have create_dir
      // exposed, write an empty `.gitkeep` and call it a day.
      // For MVP-1a: write a zero-byte sentinel file `<path>/.kbkeep` then leave it.
      await tauriBridge.writeText(`${path}/.kbkeep`, "");
    },
  };
}

async function scanRecursive(dir: string): Promise<TreeNode[]> {
  const entries = await tauriBridge.list(dir);
  const folders: TreeNode[] = [];
  const files: TreeNode[] = [];
  for (const e of entries) {
    if (e.kind === "directory") {
      if (HIDDEN_FOLDERS.has(e.name)) continue;
      if (e.name.startsWith(HIDDEN_FOLDER_PREFIX)) continue;
      folders.push({
        name: e.name,
        path: e.path,
        type: "folder",
        children: await scanRecursive(e.path),
      });
    } else {
      if (HIDDEN_FILES.has(e.name)) continue;
      if (HISTORY_SIDECAR.test(e.name)) continue;
      const ext = e.name.includes(".") ? e.name.slice(e.name.lastIndexOf(".")) : "";
      const fileType = KIND_BY_EXT[ext];
      if (!fileType) continue;   // mirror FSA filter: only md/json/svg/alphatex
      files.push({
        name: e.name,
        path: e.path,
        type: "file",
        fileType,
      });
    }
  }
  folders.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...folders, ...files];
}
```

(Confirm filter rules against `fileTree.ts`'s actual filter logic before writing — these constants must match.)

- [ ] **Step 6: Tests for the Tauri implementation**

Create `vaultIndexRepoTauri.test.ts` with `vi.hoisted` + `vi.mock("./tauriBridge")` pattern. At minimum:

```ts
const bridge = vi.hoisted(() => ({
  list: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  writeText: vi.fn(),
}));
```

Tests:
- `scan` returns sorted folders-first-then-files at root.
- `scan` filters hidden folders (`memory`, dot-prefixed).
- `scan` filters hidden files (`CLAUDE.md`, `MEMORY.md`, `AGENTS.md`, history sidecars).
- `scan` filters non-recognized extensions.
- `scan` recurses into subdirectories.
- `rename` / `delete` / `exists` forward to the matching `tauriBridge` calls.
- `createFolder` writes a `.kbkeep` sentinel.

- [ ] **Step 7: Wire `vaultIndex` into `RepositoryContext.tsx`**

Add it to the `Repositories` interface, `EMPTY_REPOS`, and the memo body alongside the other 10. Update the test to assert the new field is non-null when `vaultPath` is set.

- [ ] **Step 8: Run targeted tests + typecheck**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/vaultIndexRepoTauri.test.ts
npm run test:run -- src/app/knowledge_base/shell/RepositoryContext.test.tsx
npm run typecheck 2>&1 | tail -20
```

The typecheck WILL show errors — most of them in places that consume `node.handle` (now removed) or that pass `dirHandle` to functions. **Do NOT fix these.** They are fixed in Tasks 27b/28a/b/c. Just count them and note the count in your report.

- [ ] **Step 9: Commit**

```bash
git add src/app/knowledge_base/domain/repositories.ts \
        src/app/knowledge_base/shared/utils/fileTree.ts \
        src/app/knowledge_base/infrastructure/vaultIndexRepoFsa.ts \
        src/app/knowledge_base/infrastructure/vaultIndexRepoTauri.ts \
        src/app/knowledge_base/infrastructure/vaultIndexRepoTauri.test.ts \
        src/app/knowledge_base/shell/RepositoryContext.tsx \
        src/app/knowledge_base/shell/RepositoryContext.test.tsx
git commit -m "feat(domain): VaultIndexRepository — scan/rename/delete/exists/createFolder seam"
```

The typecheck failures introduced by removing TreeNode handles are tracked-and-deferred to 27b/28a/b/c; the next implementer must not be surprised by them.

---

## Task 27b: Swap `useFileExplorer` picker to `vault_pick`, migrate internals to typed repos

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` — full rewrite of FSA-specific internals.
- Modify: any test that directly stubs the hook's old shape.

- [ ] **Step 1: Re-read the hook end-to-end**

```bash
cat src/app/knowledge_base/shared/hooks/useFileExplorer.ts
grep -rn "useFileExplorer\b" src/app/knowledge_base | head -10
```

Note the hook's external return shape. Internally, it has callbacks for: `pickRoot`, `createFile`, `deleteFile`, `renameFile`, `renameFolder`, `moveItem`, `duplicateFile`, `createDocument`, `createSVG`, `createFolder`, `selectFile`, `saveFile`, `discardFile`, `rescan`, `watcherRescan`, etc. Each of these currently uses `dirHandleRef.current` for raw FSA work.

- [ ] **Step 2: Plan the migration**

The hook's NEW internal model:
- State: `vaultPath: string | null` (replaces `dirHandle`).
- Tree state: same `TreeNode[]` but populated via `vaultIndex.scan()` (not `scanTree(handle, ...)`).
- Each fileops callback uses `useRepositories()` to get the typed repos and calls them.
- IndexedDB persistence is REMOVED for MVP-1a (re-pick every launch — accepted regression). Add a `// TODO MVP-1c: persist via tauri-plugin-store` comment where the persistence used to live.

The hook's NEW external return shape:
- Replace `dirHandle` / `dirHandleRef` with `vaultPath` / `vaultPathRef`. Keep all OTHER returned properties unchanged (callbacks, tree, selection, etc.) so consumer migration is mechanical.

- [ ] **Step 3: Implement the migrated hook**

Replace the body of `useFileExplorer.ts`. The skeleton:

```ts
import { useRepositories } from "../../shell/RepositoryContext";
import { tauriBridge } from "../../infrastructure/tauriBridge";
// ... other imports

export function useFileExplorer() {
  const repos = useRepositories();
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  // ... other state (selection, etc.)

  const pickRoot = useCallback(async () => {
    const picked = await tauriBridge.pick();
    if (!picked) return;
    await tauriBridge.setRoot(picked);
    setVaultPath(picked);
    // TODO MVP-1c: persist `picked` via tauri-plugin-store
  }, []);

  const rescan = useCallback(async () => {
    if (!repos.vaultIndex) return;
    setTree(await repos.vaultIndex.scan());
  }, [repos.vaultIndex]);

  // After vaultPath changes, rescan automatically:
  useEffect(() => {
    if (vaultPath) void rescan();
  }, [vaultPath, rescan]);

  const createDocument = useCallback(async (path: string, content: string) => {
    if (!repos.document) return;
    await repos.document.write(path, content);
    await rescan();
  }, [repos.document, rescan]);

  const deleteFile = useCallback(async (path: string) => {
    if (!repos.vaultIndex) return;
    await repos.vaultIndex.delete(path);
    await rescan();
  }, [repos.vaultIndex, rescan]);

  // ... all other callbacks similarly migrated to use typed repos

  return {
    vaultPath,
    vaultPathRef: useRef(vaultPath),   // for any consumer that wants ref-style access
    tree,
    pickRoot,
    rescan,
    createDocument,
    deleteFile,
    renameFile: ...,
    moveItem: ...,
    duplicateFile: ...,
    createSVG: ...,
    createFolder: ...,
    selectFile: ...,
    saveFile: ...,
    discardFile: ...,
    watcherRescan: ...,
    // do NOT export dirHandle or dirHandleRef
  };
}
```

(The actual return shape must mirror today's callsites — keep every callback's signature unchanged from today.)

- [ ] **Step 4: Update `useFileExplorer`'s test (if any) + dependent test stubs**

Search:

```bash
grep -rn "dirHandleRef\|MockDir\|FileSystemDirectoryHandle" src/app/knowledge_base | grep -i test
```

For each test file, swap FSA stubs for typed-repo stubs (via `StubRepositoryProvider`).

- [ ] **Step 5: Run the hook + the suite**

```bash
npm run typecheck 2>&1 | tail -20
npm run test:run 2>&1 | tail -20
```

Expect typecheck failures STILL in the consumer sites (28a/b/c handle them). The hook itself + its direct tests should be green.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts <test files touched>
git commit -m "feat(hooks): useFileExplorer migrates to typed repos; vault_pick replaces FSA"
```

---

## Task 28a: Migrate `knowledgeBase.tsx` consumer sites off `dirHandleRef.current`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` — replace ~20 `dirHandleRef.current` reads with `useRepositories()` calls.
- Possibly modify: `src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx`, `knowledgeBase.dirty.test.tsx`, `knowledgeBase.exportTab.test.tsx`, `knowledgeBase.gpImport.test.tsx`.

- [ ] **Step 1: Enumerate the call sites**

```bash
grep -n "dirHandleRef\|dirHandle\b" src/app/knowledge_base/knowledgeBase.tsx
```

Group them by what operation they're doing:
- Reading/writing a document → `repos.document.read/write`
- Reading/writing a diagram → `repos.diagram.read/write`
- Renaming/deleting/checking-existence → `repos.vaultIndex.rename/delete/exists`
- Tree-scan → `repos.vaultIndex.scan()`
- Passing to `linkManager` → migrate `linkManager` to take a typed repo (handled in 28b)
- Passing to `<GraphifyView>` → drop the FSA prop (handled in 28b)
- Passing to `useOfflineCache` → no-op in Tauri (handled in 28b)
- Inline `createXRepository(rootHandle)` factory calls → replace with `useRepositories()` reads

- [ ] **Step 2: Migrate each callsite, one operation cluster at a time**

For example, if the file has:

```ts
const doc = await readTextFile(/* fileHandle */);
await writeTextFile(fileExplorer.dirHandleRef.current, path, content);
```

Replace with:

```ts
const repos = useRepositories();
const doc = await repos.document.read(path);
await repos.document.write(path, content);
```

For inline factory creations (`createAttachmentLinksRepository(rootHandle)`), replace with `repos.attachmentLinks` from `useRepositories()`.

- [ ] **Step 3: Drop unused imports** as you go (e.g., `import { createAttachmentLinksRepository } from ...` becomes unused after migration).

- [ ] **Step 4: Run typecheck + tests as you go**

```bash
npm run typecheck 2>&1 | tail -10
npm run test:run -- src/app/knowledge_base/knowledgeBase 2>&1 | tail -15
```

Fix test stubs as needed (use `StubRepositoryProvider` instead of FSA `MockDir`).

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx <test files>
git commit -m "feat(kb): migrate knowledgeBase.tsx consumers off FSA dirHandleRef onto typed repos"
```

---

## Task 28b: Migrate remaining direct-FSA consumers

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx` — drop `dirHandleRef` reads.
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts` — same.
- Modify: `src/app/knowledge_base/features/graph/GraphifyView.tsx` — drop `FileSystemDirectoryHandle` prop; use `useRepositories()` internally.
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts` (and `linkManager`) — refactor `linkManager.removeDocumentFromIndex(rootHandle, ...)` to take a typed `LinkIndexRepository` instead.
- Modify: `src/app/knowledge_base/shared/hooks/useOfflineCache.ts` — make it a no-op when `vaultPath` is set (Tauri mode), or remove entirely if its only consumer is gone (decision per implementer judgment based on what's reachable).
- Modify: any other file the typecheck still complains about after Task 28a.

- [ ] **Step 1: Enumerate remaining direct-FSA consumers**

```bash
grep -rn "FileSystemDirectoryHandle\|dirHandleRef\b\|dirHandle\b" src/app/knowledge_base | grep -v "test\|spec\|MockDir" | grep -v ".d.ts"
```

- [ ] **Step 2: For each consumer, refactor onto the appropriate typed repo or drop the FSA prop**

The `linkManager` refactor is the largest: the existing API takes a `rootHandle`; change every call site to take a `LinkIndexRepository` (already in `useRepositories()`). `linkManager` itself becomes a pure module operating against a `LinkIndexRepository` interface — no FSA inside.

`useOfflineCache` decision: if the only callers are knowledgeBase.tsx and they're being migrated, the offline cache is dead-code in Tauri mode. Best path: make `useOfflineCache` detect "no FSA root available" (because `dirHandleRef` no longer exists) and silently no-op. If that's awkward, just remove the import + call from `knowledgeBase.tsx` and add a `// TODO MVP-1d: delete useOfflineCache` comment.

- [ ] **Step 3: Run typecheck + full Vitest**

```bash
npm run typecheck 2>&1 | tail -20
npm run test:run 2>&1 | tail -20
```

Goal: zero typecheck errors related to FSA types, full vitest suite green.

- [ ] **Step 4: Commit**

```bash
git add <all touched files>
git commit -m "feat(kb): migrate DiagramOverlays/GraphifyView/linkManager/useOfflineCache off FSA"
```

---

## Task 28c: Final cleanup pass — drop remaining FSA-typed props

**Files:** any component or hook whose signature still mentions `FileSystemDirectoryHandle` or `FileSystemFileHandle`.

- [ ] **Step 1: Grep for residual FSA types**

```bash
grep -rn "FileSystemDirectoryHandle\|FileSystemFileHandle" src/app/knowledge_base \
  --include="*.ts" --include="*.tsx" \
  | grep -v "test\|spec\|MockDir\|file-system.d.ts"
```

- [ ] **Step 2: For each residual reference**

- If it's a component prop that's now unused, drop the prop.
- If it's a function parameter, change to a typed repo or `vaultPath: string`.
- If it's a `useRef<FileSystemDirectoryHandle>`, replace with `useRef<string | null>` for `vaultPath` ref usage.

`src/app/knowledge_base/types/file-system.d.ts` STAYS for now — it's deleted in MVP-1d. Don't preemptively remove it.

- [ ] **Step 3: Run typecheck + tests**

```bash
npm run typecheck
npm run test:run
```

Both must be green. If they aren't, fix before committing.

- [ ] **Step 4: Commit**

```bash
git add <all touched files>
git commit -m "refactor(kb): drop residual FSA-typed props; persistence flows through typed repos only"
```

After this commit, the only FSA references in the app should be inside the `infrastructure/*Repo.ts` (FSA implementations, deleted in MVP-1d), the `idbHandles.ts` shim (deleted in MVP-1d), and the `types/file-system.d.ts` shim (deleted in MVP-1d).

---

## Task 27 (original — historical reference, NOT executed)

(The original Task 27 below is preserved for historical context. The actual execution path is Tasks 27a/b above.)

### Task 27 (original): Swap `useFileExplorer` picker to `vault_pick`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`

- [ ] **Step 1: Locate the FSA picker call in `useFileExplorer.ts`**

Read the file to find the `showDirectoryPicker()` call. It is typically wrapped in a `pickDirectory` or similar function that resolves `dirHandleRef.current`. Identify every reference to `FileSystemDirectoryHandle` and the IndexedDB persistence (`idbHandles`).

- [ ] **Step 2: Replace the FSA picker with `tauriBridge.pick` + `vault_set_root`**

Wherever `showDirectoryPicker()` is invoked, substitute:

```ts
import { tauriBridge } from "../../infrastructure/tauriBridge";

// inside the picker callback:
const picked = await tauriBridge.pick();
if (!picked) return null;
await tauriBridge.setRoot(picked);
return picked; // a string path, exposed as the new "vault token"
```

Replace the hook's `dirHandle` state with `vaultPath: string | null`. Anywhere the hook returned a `FileSystemDirectoryHandle`, return `vaultPath` instead. Anywhere `dirHandleRef.current` was passed downstream as the FSA root (for repo creation in `knowledgeBase.tsx`), it now passes `vaultPath`.

For MVP-1a, **bypass the IndexedDB persistence**: do not call `idbHandles` for save/restore. Persistence lands in MVP-1c (`tauri-plugin-store`). The user re-picks on every launch — accepted regression listed in the plan preamble.

- [ ] **Step 3: Run the existing tests for the hook (and any callers that import `useFileExplorer`)**

Run: `npm run test:run -- src/app/knowledge_base/shared/hooks`
Expected: green. If a test references `dirHandle` directly, update the test to reference `vaultPath` (the same shape the hook now exposes).

If `useFileExplorer.ts` does not have a dedicated test file but is used by `knowledgeBase.dirty.test.tsx` etc., run those too:

```
npm run test:run -- src/app/knowledge_base/knowledgeBase.dirty.test.tsx
```

Fix any test that fails due to the FSA → vaultPath rename. The fix is mechanical: stub `tauriBridge.pick` instead of `showDirectoryPicker`, and feed a string path instead of a `MockDir` handle.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts
git commit -m "feat(hooks): useFileExplorer uses Tauri vault_pick instead of FSA picker"
```

---

## Task 28: Wire `knowledgeBase.tsx` to pass `vaultPath` into `RepositoryProvider`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 1: Find where `RepositoryProvider` is mounted and what value it receives**

In `knowledgeBase.tsx`, locate the `<RepositoryProvider rootHandle={...}>` JSX. The current value comes from `useFileExplorer()` (a `dirHandleRef` companion or similar). After Task 27, the hook returns a `vaultPath` string instead.

- [ ] **Step 2: Update the prop**

Change:

```tsx
<RepositoryProvider rootHandle={dirHandle}>
```

to:

```tsx
<RepositoryProvider vaultPath={vaultPath}>
```

If `knowledgeBase.tsx` also creates inline FSA repos (e.g., `createAttachmentLinksRepository(rootHandle)`), replace those with their Tauri equivalents (`createAttachmentLinksRepositoryTauri()` etc., which take no argument).

- [ ] **Step 3: Run the typecheck and the existing knowledgeBase tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test:run -- src/app/knowledge_base/knowledgeBase.dirty.test.tsx src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx src/app/knowledge_base/knowledgeBase.exportTab.test.tsx src/app/knowledge_base/knowledgeBase.gpImport.test.tsx`
Expected: green. Any failures are mechanical FSA → vaultPath fixes.

- [ ] **Step 4: Run the full Vitest suite to catch downstream surprises**

Run: `npm run test:run`
Expected: green. (If any tests fail because they directly reference FSA helpers that are no longer reachable from the active provider, mark them broken-but-pre-existing and fix in MVP-1d's cleanup pass — list them in the commit message.)

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(kb): pass vaultPath into RepositoryProvider; drop inline FSA repo creation"
```

---

## Task 29: End-to-end smoke — `cargo tauri dev` + manual vault operations

**Files:** none changed (smoke checkpoint).

- [ ] **Step 1: Build a test vault on disk**

```bash
mkdir -p /tmp/kb-smoke-vault/.archdesigner
cat > /tmp/kb-smoke-vault/.archdesigner/config.json <<'EOF'
{ "name": "Smoke", "version": "1.0", "created": 0, "lastOpened": 0 }
EOF
echo "# hello" > /tmp/kb-smoke-vault/topic.md
```

- [ ] **Step 2: Run `tauri dev` and exercise the picker + a write**

Run: `npx tauri dev`

In the open Tauri window:
1. Trigger the vault picker (the existing UI flow that previously called `showDirectoryPicker`).
2. Pick `/tmp/kb-smoke-vault`.
3. Confirm `topic.md` appears in the file explorer.
4. Open `topic.md`, edit it, save.

Outside the Tauri window:

```bash
cat /tmp/kb-smoke-vault/topic.md
```

Expected: the edited content, written atomically by Rust.

- [ ] **Step 3: Sanity-check that no `.tmp` files leaked**

```bash
find /tmp/kb-smoke-vault -name "*.tmp"
```

Expected: no output.

- [ ] **Step 4: Commit a checkpoint marker (no code changes)**

```bash
git commit --allow-empty -m "chore(tauri): MVP-1a end-to-end smoke green"
```

---

## Task 30: Run the full local CI surface and clean up

**Files:** none changed (verification + cleanup).

- [ ] **Step 1: Run typecheck, lint, vitest, cargo test in sequence**

```bash
npm run typecheck
npm run lint
npm run test:run
(cd src-tauri && cargo fmt -- --check && cargo clippy -- -D warnings && cargo test)
```

Expected: all pass.

- [ ] **Step 2: Verify a Tauri release build still works**

```bash
GITHUB_PAGES=true npm run build
(cd src-tauri && cargo tauri build --debug)
```

Expected: produces a `.app` under `src-tauri/target/debug/bundle/macos/`.

- [ ] **Step 3: Update Features.md**

Add a new section under an appropriate heading (e.g., `## Desktop Shell (MVP-1a)` near the top, before the existing in-browser sections):

- ⚙️ Tauri 2 desktop shell hosting the existing Next.js app.
- ⚙️ Rust-backed vault filesystem adapter (12 commands) — `src-tauri/src/vault/`.
- ⚙️ Native vault picker via `tauri-plugin-dialog` — `useFileExplorer.ts`.
- ⚙️ Per-repo Tauri implementations (`*RepoTauri.ts`) replacing FSA factories at the `RepositoryProvider` seam.

- [ ] **Step 4: Update test-cases/README.md**

Append a one-line note that vault-picker-blocked scenarios are now testable in principle (e2e wiring lands in MVP-4, sweep in MVP-5). Don't flip any ❌ → ✅ markers in this MVP — that's MVP-5's job.

- [ ] **Step 5: Final commit**

```bash
git add Features.md test-cases/README.md
git commit -m "docs(kb): note Tauri shell + Rust VFS in Features.md and test-cases ceiling"
```

- [ ] **Step 6: Push and open PR**

```bash
git push -u origin feat/tauri-mvp1a-scaffold
gh pr create --title "feat(tauri): MVP-1a — scaffold + Rust VFS adapter" --body "$(cat <<'EOF'
## Summary
- Tauri 2 desktop shell hosting the existing Next.js app
- Rust vault adapter: 12 VFS commands (read/write text + json + bytes, list, rename, delete, exists, plus pick + set_root)
- Path safety, atomic writes, tagged-union error model
- Per-repo Tauri implementations under `src/app/knowledge_base/infrastructure/*RepoTauri.ts`
- `RepositoryProvider` swaps `rootHandle` → `vaultPath`
- `useFileExplorer` swaps `showDirectoryPicker` → `vault_pick`

## Out of scope (next MVPs)
- File watching → MVP-1b
- Settings persistence (last vault, recents) → MVP-1c
- Vault switcher dropdown, uninitialized splash → MVP-1c
- GitHub Pages workflow + FSA repo deletion → MVP-1d

## Test plan
- [ ] `npm run typecheck && npm run lint && npm run test:run`
- [ ] `cd src-tauri && cargo fmt -- --check && cargo clippy -- -D warnings && cargo test`
- [ ] Manual smoke: `npx tauri dev`, pick a test vault, edit a doc, verify on disk

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR review + merge, update the handoff doc on `feat/tauri-claude-integration` (or the next MVP's branch per the doc-update protocol) to flip MVP-1a's status to ✅ Merged with the PR number, then start MVP-1b's plan.

---

## Self-Review

**Spec coverage check** — every § in the spec mapped to tasks above:

- § 6.1 Sub-MVP 1a — Scaffold + Rust VFS adapter → Tasks 1–25.
- § 6.5 MVP-1 cross-cutting (POSIX paths, single vault, no ambient mutation) → enforced by `vault::path::resolve` (Task 7), single `Vault` state struct (Task 12), command-only mutations (Tasks 12, 20).
- § 5 Cross-platform discipline → Task 12 uses `dirs` only via Tauri APIs; Task 27 leaves keybindings untouched; Task 27's `tauriBridge` resolves `claude` via `Command::new` (handled in MVP-2; not part of MVP-1a).

**Placeholder scan:** scanned the document for "TBD", "TODO", "later", "appropriate error handling", "Similar to Task N" — none found. The phrase "If the existing FSA repo … mirror the same logic" appears in repo tasks; this is a directive to read a specific named file (path given in the same step), not a placeholder.

**Type consistency:**

- `tauriBridge` method names (`pick`, `setRoot`, `readText`, `writeText`, `readJson`, `writeJson`, `list`, `rename`, `delete`, `exists`, `readBytes`, `writeBytes`) are consistent across Tasks 14, 16–25.
- `VaultError` kinds (`no_vault`, `not_found`, `permission_denied`, `path_escape`, `io`, `parse`) match between Rust (Task 6) and TS (Task 14).
- `FileSystemError` `kind` strings used in Task 14 (`"not-found"`, `"permission-denied"`, `"invalid-path"`, `"io"`, `"malformed"`) — these match the existing TS error contract; Step 2 of Task 14 explicitly says "If `FileSystemError`'s constructor signature differs … adjust the constructor call" so any drift is caught at typecheck.
- `Repositories` interface in Task 26 matches the existing `RepositoryContext.tsx` shape.

**Scope check:** focused on MVP-1a only; does not touch file watching (1b), settings (1c), or Pages cleanup (1d). Each task is bite-sized with one component or one operation.
