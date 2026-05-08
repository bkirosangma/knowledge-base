# MVP-1c — Settings, Vault Management & Basic Init Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist vault state across app restarts via `tauri-plugin-store`, ship a Header vault-switcher dropdown (Open / Recents / Initialize), gate the app behind a splash when the chosen folder is not yet a knowledge-base vault, and patch the macOS FSEvents `Modified`-on-delete kind-mapping gap surfaced in MVP-1b.

**Architecture:** Add `tauri-plugin-store` to the Rust shell and wrap it in two typed Rust commands (`settings_read`, `settings_write`) — the JS plugin is **not** imported on the frontend, mirroring the MVP-1a pattern where `tauri-plugin-dialog` is registered in Rust but `@tauri-apps/plugin-dialog` is never installed (this avoids needing `src-tauri/capabilities/*.json` ACL changes for a JS plugin). On the TS side, a `settingsStore.ts` facade calls those two commands via the existing `tauriBridge.call()` helper. Replace the `localStorage`-based vault-name memory + the commented-out IDB restore stub in `useFileExplorer` with a store-backed `vault.lastPath` + `vault.recents` (MRU 5). Introduce `VaultSwitcher` (Header dropdown) and `UninitializedVaultSplash` (full-screen splash gating `KnowledgeBaseInner` when `vaultConfig.read()` returns `null`). Vault switching reuses `vault_pick` + `vault_set_root` — `FileWatcherContext`'s `vaultPath`-keyed effect handles stop-old + start-new transparently. On the Rust side, post-process the watcher's `Modified` events: if the file no longer exists by the time the debouncer flushes, re-emit as `Deleted` so subscribers don't try to re-read a removed file.

**Tech Stack:**
- Rust: `tauri-plugin-store = "=2.4.3"` (verified on crates.io against `tauri = "=2.11.1"`), existing `tokio::fs::metadata` for the post-process existence check, existing `tauri 2.11` + `serde`.
- Frontend: existing `@tauri-apps/api/core` (`invoke`) — no new JS deps. The JS-side `@tauri-apps/plugin-store` is deliberately **not** installed; settings access goes through Rust commands wrapped by `tauriBridge`.
- Tests: `cargo test` (Rust, post-process unit + integration + settings round-trip), Vitest (frontend, with `vi.mock` of `@tauri-apps/api/core` matching the existing `tauriBridge.test.ts` pattern), no Playwright (parked until MVP-4).

---

## 1. Goal

Make the Tauri shell remember which vault was last open, surface a vault switcher in the Header, and refuse to mount the app's interior surfaces (PaneManager, explorer, future Claude chat drawer) until the chosen folder is a real knowledge-base vault. Close the FSEvents `Modified`-on-delete gap so MVP-1b's watcher reports `Deleted` reliably across all four kinds.

## 2. Scope

**In scope:**
- `tauri-plugin-store` registered in `src-tauri/src/main.rs` (Rust). **Frontend does not import `@tauri-apps/plugin-store`** — settings access is exclusively through new Rust commands `settings_read` / `settings_write`, mirroring MVP-1a's dialog-plugin pattern. This avoids the Tauri 2 ACL/capabilities config that would otherwise be needed for a JS-side plugin.
- New Rust module `src-tauri/src/settings/{mod,commands,store}.rs` defining a typed `Settings` struct + the two `#[tauri::command]` wrappers around `tauri_plugin_store::Store`.
- New TS facade `src/app/knowledge_base/infrastructure/settingsStore.ts` exposing: `getSettings()`, `setLastPath(path)`, `pushRecent(path)`, `getRecents()`, `clearLastPath()`, `setClaudeChatHeight(n)`. Internally each call dispatches `settings_read`, mutates the returned struct, and dispatches `settings_write` — both via `tauriBridge.call()`.
- Settings JSON shape (single file `settings.json` under `app_config_dir()`):
  ```ts
  {
    vault: { lastPath: string | null, recents: string[] /* MRU, max 5 */ },
    ui:    { claudeChat: { height: number } },
    claude:{ /* reserved — populated by MVP-2 */ }
  }
  ```
- `useFileExplorer` boot path swapped from the commented-out `dirHandle.restoreSavedHandle()` stub to `settingsStore.getSettings()` → if `vault.lastPath` is non-null, call `tauriBridge.setRoot(path)` + `setVaultPath(path)`; if `setRoot` rejects (the underlying `PathBuf::canonicalize` returns `NotFound` when the directory has been moved/deleted), `clearLastPath()` and bail. **No separate "does this absolute path exist?" IPC is needed** — `vault_set_root`'s canonicalize already serves as the existence check, and `vault_exists` is vault-relative so it can't be used here.
- `useFileExplorer.openFolder` writes `vault.lastPath` and pushes onto `vault.recents` (MRU 5, dedup) on success.
- New component `VaultSwitcher` in the Header showing the current vault's basename. Click opens a dropdown with: **Open Vault…** (calls `pick + switch`), **Recent Vaults** submenu (top 5 from `vault.recents`), **Initialize Vault…** (only when current vault is uninitialised — wired through to the splash flow).
- New component `UninitializedVaultSplash` — full-screen, blocks `KnowledgeBaseInner` rendering. Two buttons: **Initialize this vault** (calls `vaultConfig.initVault(name)` then re-checks; on success mounts the app) and **Open a different folder** (calls `pick + switch`).
- Init-guard wiring in `KnowledgeBaseInner`: track `vaultStatus: 'no-vault' | 'uninitialised' | 'ready'`. `'no-vault'` shows the existing pre-vault landing; `'uninitialised'` shows the splash; `'ready'` mounts the existing UI.
- Rust patch: in `watcher.rs`'s event-forwarding worker, post-process `ChangeKind::Modified` events with a `tokio::fs::metadata` existence check; re-emit as `ChangeKind::Deleted` if the path is gone by the time the batch flushes. Two unignored macOS integration tests promoted from `#[ignore]` to active. (Tests live in `src-tauri/tests/watcher_integration.rs`; un-ignore the cases that currently fail because of this gap.)
- `Features.md` + `test-cases/` updates covering the switcher, splash, persistence, and the corrected watcher semantics.

**Out of scope (explicitly):**
- `idbHandles.ts` deletion — landed in MVP-1d alongside FSA-repo deletion.
- `useOfflineCache.ts` / `historyPersistence.ts` cleanup — deferred to MVP-1d (handoff Open follow-up).
- Multi-vault concurrent open — spec § 6.5: one vault active at a time.
- Vault-creation-from-blank-folder beyond the existing `initVault` write — no template scaffolding.
- Tauri-driver e2e — restoring Playwright is MVP-4.
- A bundled-app CI job — added in MVP-1d.
- Footer `ClaudeStatusLine` and chat drawer toggle — those land in MVP-2.

## 3. File structure

**New (Rust):**
- `src-tauri/src/settings/mod.rs` — `pub mod commands;` + `pub mod store;` + re-export of `Settings`.
- `src-tauri/src/settings/store.rs` — typed `Settings` struct (matches the spec JSON shape) with `serde::{Serialize, Deserialize}`, `Default` impl, and a thin `read_settings(app: &AppHandle) -> Settings` / `write_settings(app: &AppHandle, settings: &Settings) -> Result<()>` pair backed by `app.store("settings.json")` (`StoreExt` trait from `tauri_plugin_store`).
- `src-tauri/src/settings/commands.rs` — `#[tauri::command] settings_read() -> Settings` and `#[tauri::command] settings_write(settings: Settings) -> Result<(), String>`. Uses `app: AppHandle` to reach the plugin.

**Modified (Rust):**
- `src-tauri/Cargo.toml` — add `tauri-plugin-store = "=2.4.3"` to `[dependencies]`.
- `src-tauri/src/lib.rs` — `pub mod settings;` next to `pub mod vault;`.
- `src-tauri/src/main.rs` — `.plugin(tauri_plugin_store::Builder::default().build())` in the `Builder::default()` chain; register `commands::settings_read` and `commands::settings_write` in `generate_handler!`. Import path: `use knowledge_base_lib::settings::commands as settings_commands;` (or similar — match the existing `commands::vault_*` style).
- `src-tauri/src/vault/watcher.rs` — wrap the per-event forwarding step with the `Modified`-existence post-process. Update the `kind_from_notify_kind` consumer (the spawned worker task) so it awaits `tokio::fs::metadata(absolute_path).await` after translation and rewrites `ChangeKind::Modified` to `ChangeKind::Deleted` when `Err(NotFound)` comes back.
- `src-tauri/tests/watcher_integration.rs` — un-ignore (or replace with active versions) the two macOS-ignored cases that the new post-process turns green: `delete_emits_deleted` and `modify_emits_modified` (the latter still asserts `Modified` for a *real* modify; only delete-disguised-as-modify gets rewritten).

**New (Frontend):**
- `src/app/knowledge_base/infrastructure/settingsStore.ts` — typed facade calling `tauriBridge.call("settings_read", {}, "")` and `tauriBridge.call("settings_write", { settings }, "")`. Exposes `getSettings`, `setLastPath`, `clearLastPath`, `getRecents`, `pushRecent`, `setClaudeChatHeight`. Each mutation reads-then-writes (no per-key partial writes — keeps the Rust API minimal).
- `src/app/knowledge_base/infrastructure/settingsStore.test.ts` — Vitest with `vi.mock("@tauri-apps/api/core", …)` returning an `invoke` mock backed by an in-memory `Settings` object. Covers the MRU + dedup + max-5 invariants, default-merge, and the round-trip through `invoke`.
- `src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx` — new test file (mirrors `.operations.test.tsx` harness) covering the `settingsStore`-backed boot path.
- `src/app/knowledge_base/shared/hooks/useFileExplorer.switchVault.test.tsx` — new test file covering `switchVault(path)` with dirty-confirm.
- `src/app/knowledge_base/knowledgeBase.initGuard.test.tsx` — new test file (mirrors the harness in `knowledgeBase.dirty.test.tsx`) covering splash render vs ready render.
- `src/app/knowledge_base/shared/components/VaultSwitcher.tsx` — Header-mounted dropdown trigger + popover.
- `src/app/knowledge_base/shared/components/VaultSwitcher.test.tsx` — Vitest covering: empty-recents (no submenu disabled), 5-item submenu, click-Open-Vault calls onOpen, click-recent calls onSwitch with that path, "Initialize Vault…" only renders when `isUninitialised`.
- `src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx` — full-screen card with the spec wording: `<folder-name> is not yet a knowledge-base vault.` and two buttons.
- `src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx` — Vitest covering: renders folder name, calls `onInitialize` with parsed basename, calls `onPickDifferent`.

**Modified (Frontend):**
- `src/app/knowledge_base/shared/components/Header.tsx` — accept new optional props `currentVaultName: string | null`, `recents: string[]`, `isUninitialised: boolean`, `onOpenVault`, `onSwitchVault(path)`, `onInitializeVault`. Render `<VaultSwitcher>` to the left of the dirty-stack indicator when `currentVaultName` is non-null, and an `Open vault…` button when null.
- `src/app/knowledge_base/shared/components/Header.test.tsx` — new contract tests for the new props (existing `headerProps` builder probably needs the new defaults).
- `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`:
  - Replace the commented-out `dirHandle.restoreSavedHandle()` stub with a `settingsStore.getSettings()` boot path. (Keep the `eslint-disable react-hooks/exhaustive-deps` once verified.)
  - On successful `openFolder`, write `settingsStore.setLastPath(picked)` + `settingsStore.pushRecent(picked)`.
  - Drop `localStorage.setItem(DIR_NAME_KEY, name)` — `directoryName` is derivable from `vaultPath` via `path.basename`-equivalent. (The `DIR_NAME_KEY` constant + reads can come out; the file is small and that field is only used for display.)
  - Add `switchVault(path: string)` for use by the Header's recents picks: confirms-dirty → `setRoot(path)` → `setVaultPath(path)` → `setLastPath` + `pushRecent`. Re-uses the same internals as `openFolder` minus the picker call.
- (Boot + switchVault tests live in the new files listed under **New (Frontend)** — they don't extend an existing useFileExplorer test file because the existing three are scoped to `operations`, `helpers`, and `createDocument` and adding boot/restore cases would mix concerns.)
- `src/app/knowledge_base/knowledgeBase.tsx` — derive `vaultStatus` from `(vaultPath, repos.vaultConfig?.read())`, render `<UninitializedVaultSplash>` when `'uninitialised'`, render `null` (placeholder during async config load) when `'loading'`, otherwise the existing tree. Pass new Header props down. Update the `KnowledgeBaseInner` arg-list documentation.
- (Splash render + ready render tests live in the new `knowledgeBase.initGuard.test.tsx` listed under **New (Frontend)** — the existing `knowledgeBase.dirty.test.tsx` / `.tabRouting.test.tsx` / etc. are scoped to other concerns and shouldn't grow to cover boot gating.)

**Updated (docs / catalogues):**
- `Features.md` — add bullets under "App shell" for the vault switcher + splash + recents memory; under "File system" note that vault path persistence is now via `tauri-plugin-store`.
- `test-cases/01-app-shell.md` — promote splash + switcher cases from ❌ to ✅.
- `test-cases/02-file-system.md` — promote `lastPath` restore + recents dedup cases from ❌ to ✅.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — Where-we-are flips MVP-1c to 🚧/✅; Reference architecture adds the new components; Open follow-up items closes the FSEvents `Modified`-on-delete row; Next Action becomes "write MVP-1d plan" once this MVP merges.

---

## 4. Cross-cutting rules

- **Branch:** `feat/tauri-mvp1c-settings-vaults`, already created off `main` at the merged MVP-1b tip.
- **Commits:** small, frequent, prefixed `feat(tauri):` / `feat(infra):` / `feat(shell):` / `test(...)` / `chore(tauri):` to match the MVP-1a/1b history. **Do not skip hooks** — if a pre-commit hook fails, fix the root cause and create a new commit.
- **Testing discipline:** TDD — Vitest / cargo unit test first (RED), implement (GREEN). The integration tests in `tests/watcher_integration.rs` are gated by macOS FSEvents and may need a longer `tokio::time::timeout` bound (re-use the 3 s window MVP-1b settled on).
- **POSIX-relative paths in IPC:** the watcher already enforces this — the post-process must not introduce absolute paths in the emitted payload. The `metadata()` call uses an *internally-reconstructed* absolute path (`root.join(relative)`); the emitted event still carries the relative path.
- **No ambient mutation:** the existence-check is per-event, sync with the worker task; no spawned background loops in Rust.
- **One vault at a time:** `switchVault` always calls `setRoot` + flips `vaultPath`; the watcher's vaultPath-keyed effect (MVP-1b) handles stop-old + start-new. Don't add a second `Watcher::stop` call from TS.
- **Cross-platform discipline:** `tauri-plugin-store` is cross-platform; the existence-check uses `tokio::fs::metadata` which is portable. No `#[cfg(target_os = …)]` branches required.

---

## Task 1: Rust settings module — dep, plugin, typed `Settings`, two commands

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`
- Create: `src-tauri/src/settings/mod.rs`
- Create: `src-tauri/src/settings/store.rs`
- Create: `src-tauri/src/settings/commands.rs`

- [ ] **Step 1: Add the Rust dep (exact pin)**

In `[dependencies]` of `src-tauri/Cargo.toml`, after `notify-debouncer-full = "=0.3.2"`, append:

```toml
tauri-plugin-store = "=2.4.3"
```

Pin exactly with `=` so the executing engineer can't accidentally pull a newer minor and run into a renamed `StoreExt` or builder API. (Verified on crates.io 2026-05-08; matches `tauri = "=2.11.1"`.)

- [ ] **Step 2: Write the failing Rust round-trip test**

Create `src-tauri/src/settings/store.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    #[serde(default)]
    pub last_path: Option<String>,
    #[serde(default)]
    pub recents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeChatSettings {
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    pub claude_chat: ClaudeChatSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub vault: VaultSettings,
    #[serde(default)]
    pub ui: UiSettings,
    #[serde(default)]
    pub claude: serde_json::Map<String, serde_json::Value>,
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self { last_path: None, recents: Vec::new() }
    }
}

impl Default for ClaudeChatSettings {
    fn default() -> Self { Self { height: 320 } }
}

impl Default for UiSettings {
    fn default() -> Self { Self { claude_chat: ClaudeChatSettings::default() } }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            vault: VaultSettings::default(),
            ui: UiSettings::default(),
            claude: serde_json::Map::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_serialise_to_camel_case_with_320_height() {
        let s = Settings::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["vault"]["lastPath"], serde_json::Value::Null);
        assert_eq!(json["vault"]["recents"], serde_json::json!([]));
        assert_eq!(json["ui"]["claudeChat"]["height"], 320);
    }

    #[test]
    fn settings_round_trip_through_serde_json() {
        let s = Settings {
            vault: VaultSettings { last_path: Some("/v".into()), recents: vec!["/v".into(), "/w".into()] },
            ui: UiSettings { claude_chat: ClaudeChatSettings { height: 480 } },
            claude: serde_json::Map::new(),
        };
        let json = serde_json::to_value(&s).unwrap();
        let back: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn settings_deserialises_from_partial_json_with_defaults() {
        let json = serde_json::json!({ "vault": { "lastPath": "/v" } });
        let s: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(s.vault.last_path, Some("/v".into()));
        assert_eq!(s.vault.recents, Vec::<String>::new());
        assert_eq!(s.ui.claude_chat.height, 320);
    }
}
```

Create `src-tauri/src/settings/mod.rs`:

```rust
pub mod commands;
pub mod store;

pub use store::Settings;
```

Create `src-tauri/src/settings/commands.rs` with a stub that fails to compile so the test below is the green target:

```rust
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use super::store::Settings;

const STORE_FILE: &str = "settings.json";
const SETTINGS_KEY: &str = "settings";

#[tauri::command]
pub async fn settings_read(app: AppHandle) -> Result<Settings, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = store.get(SETTINGS_KEY).unwrap_or_else(|| serde_json::to_value(Settings::default()).unwrap());
    let settings: Settings = serde_json::from_value(value).map_err(|e| e.to_string())?;
    Ok(settings)
}

#[tauri::command]
pub async fn settings_write(app: AppHandle, settings: Settings) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let value = serde_json::to_value(&settings).map_err(|e| e.to_string())?;
    store.set(SETTINGS_KEY, value);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}
```

Add `pub mod settings;` to `src-tauri/src/lib.rs` next to `pub mod vault;`.

```bash
cd src-tauri && cargo build --tests 2>&1 | tail -20
```

Expected: build succeeds. (`tauri-plugin-store` v2.4.3 resolves and pulls its transitive deps. The `StoreExt::store` method returns `Result<Arc<Store>, _>` per the 2.4 plugin API.)

- [ ] **Step 3: Run the unit tests**

```bash
cd src-tauri && cargo test --lib settings::store::tests
```

Expected: 3 passed.

- [ ] **Step 4: Register the plugin and the two commands in `main.rs`**

In `src-tauri/src/main.rs`, change the import line and the builder chain:

```rust
use knowledge_base_lib::settings::commands as settings_commands;
use knowledge_base_lib::vault::{commands, Vault, VaultState, Watcher, WatcherState};
// …
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build())
    .manage(vault)
    .manage(watcher)
    .invoke_handler(tauri::generate_handler![
        commands::vault_pick,
        // … existing 13 vault commands unchanged …
        commands::vault_watch_stop,
        settings_commands::settings_read,
        settings_commands::settings_write,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
```

- [ ] **Step 5: Verify clippy clean and all tests still pass**

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test
```

Expected: clippy clean; all pre-existing tests + 3 new settings::store tests green.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/src/settings
git commit -m "feat(tauri): settings module — typed Settings + read/write commands"
```

---

## Task 2: TS settings store facade — `getSettings` via `invoke`

**Files:**
- Create: `src/app/knowledge_base/infrastructure/settingsStore.ts`
- Create: `src/app/knowledge_base/infrastructure/settingsStore.test.ts`

- [ ] **Step 1: Write the failing test for `getSettings` via mocked `invoke`**

Create `src/app/knowledge_base/infrastructure/settingsStore.test.ts`. The mock pattern mirrors `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` — mock `@tauri-apps/api/core` and dispatch on the command name.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

let storeState: unknown = null; // simulates the Rust-side persisted Settings JSON

const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd === "settings_read") {
    if (storeState === null) {
      return {
        vault: { lastPath: null, recents: [] },
        ui: { claudeChat: { height: 320 } },
        claude: {},
      };
    }
    return storeState;
  }
  if (cmd === "settings_write") {
    storeState = args?.settings;
    return undefined;
  }
  throw new Error(`unexpected command: ${cmd}`);
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { getSettings } from "./settingsStore";

describe("settingsStore.getSettings", () => {
  beforeEach(() => {
    storeState = null;
    invokeMock.mockClear();
  });

  it("returns the Rust default when the store is fresh", async () => {
    const s = await getSettings();
    expect(s).toEqual({
      vault: { lastPath: null, recents: [] },
      ui: { claudeChat: { height: 320 } },
      claude: {},
    });
    expect(invokeMock).toHaveBeenCalledWith("settings_read", {});
  });

  it("returns persisted state once it's been written", async () => {
    storeState = {
      vault: { lastPath: "/Users/x/v", recents: ["/Users/x/v"] },
      ui: { claudeChat: { height: 480 } },
      claude: {},
    };
    const s = await getSettings();
    expect(s.vault.lastPath).toBe("/Users/x/v");
    expect(s.ui.claudeChat.height).toBe(480);
  });
});
```

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/settingsStore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement `settingsStore.ts` minimally to pass Step 1**

Create `src/app/knowledge_base/infrastructure/settingsStore.ts`:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface VaultSettings {
  lastPath: string | null;
  recents: string[];
}

export interface UiSettings {
  claudeChat: { height: number };
}

export interface Settings {
  vault: VaultSettings;
  ui: UiSettings;
  claude: Record<string, unknown>;
}

const RECENTS_MAX = 5;

export async function getSettings(): Promise<Settings> {
  return await invoke<Settings>("settings_read", {});
}

async function writeSettings(settings: Settings): Promise<void> {
  await invoke<void>("settings_write", { settings });
}

export const __RECENTS_MAX = RECENTS_MAX;
// Internal export for the mutation helpers in Task 3 — keeps them in the same module.
export { writeSettings as __writeSettings };
```

- [ ] **Step 3: Re-run; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/settingsStore.test.ts
```

Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/infrastructure/settingsStore.ts src/app/knowledge_base/infrastructure/settingsStore.test.ts
git commit -m "feat(infra): settingsStore.getSettings backed by settings_read"
```

---

## Task 3: `setLastPath`, `clearLastPath`, `pushRecent`, `getRecents`, `setClaudeChatHeight`

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.ts`
- Modify: `src/app/knowledge_base/infrastructure/settingsStore.test.ts`

- [ ] **Step 1: Write the failing tests for the mutation helpers**

Append to `settingsStore.test.ts`:

```ts
import {
  setLastPath,
  clearLastPath,
  pushRecent,
  getRecents,
  setClaudeChatHeight,
  __RECENTS_MAX,
} from "./settingsStore";

describe("settingsStore mutations", () => {
  beforeEach(() => {
    storeState = null;
    invokeMock.mockClear();
  });

  it("setLastPath writes a settings object with vault.lastPath set", async () => {
    await setLastPath("/Users/x/v");
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          vault: expect.objectContaining({ lastPath: "/Users/x/v" }),
        }),
      }),
    );
  });

  it("clearLastPath nulls vault.lastPath", async () => {
    storeState = { vault: { lastPath: "/old", recents: [] }, ui: { claudeChat: { height: 320 } }, claude: {} };
    await clearLastPath();
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          vault: expect.objectContaining({ lastPath: null }),
        }),
      }),
    );
  });

  it("pushRecent prepends, dedups, and caps at RECENTS_MAX", async () => {
    await pushRecent("/a");
    await pushRecent("/b");
    await pushRecent("/c");
    await pushRecent("/a"); // dedup → moves to front
    let recents = await getRecents();
    expect(recents).toEqual(["/a", "/c", "/b"]);

    for (let i = 0; i < __RECENTS_MAX + 2; i++) {
      await pushRecent(`/p${i}`);
    }
    recents = await getRecents();
    expect(recents).toHaveLength(__RECENTS_MAX);
    // Most-recent (highest index) at the front.
    expect(recents[0]).toBe(`/p${__RECENTS_MAX + 1}`);
    expect(recents).not.toContain("/a"); // pushed out by the cap
  });

  it("setClaudeChatHeight writes ui.claudeChat.height", async () => {
    await setClaudeChatHeight(456);
    expect(invokeMock).toHaveBeenCalledWith(
      "settings_write",
      expect.objectContaining({
        settings: expect.objectContaining({
          ui: expect.objectContaining({ claudeChat: { height: 456 } }),
        }),
      }),
    );
  });
});
```

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/settingsStore.test.ts
```

Expected: FAIL with "is not a function" / undefined exports.

- [ ] **Step 2: Implement the mutation helpers via read-then-write**

Append to `settingsStore.ts`:

```ts
export async function setLastPath(path: string): Promise<void> {
  const s = await getSettings();
  await __writeSettings({ ...s, vault: { ...s.vault, lastPath: path } });
}

export async function clearLastPath(): Promise<void> {
  const s = await getSettings();
  await __writeSettings({ ...s, vault: { ...s.vault, lastPath: null } });
}

export async function getRecents(): Promise<string[]> {
  return (await getSettings()).vault.recents;
}

export async function pushRecent(path: string): Promise<void> {
  const s = await getSettings();
  const filtered = s.vault.recents.filter((p) => p !== path);
  const next = [path, ...filtered].slice(0, RECENTS_MAX);
  await __writeSettings({ ...s, vault: { ...s.vault, recents: next } });
}

export async function setClaudeChatHeight(height: number): Promise<void> {
  const s = await getSettings();
  await __writeSettings({
    ...s,
    ui: { ...s.ui, claudeChat: { ...s.ui.claudeChat, height } },
  });
}
```

- [ ] **Step 3: Re-run; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/settingsStore.test.ts
```

Expected: 6 passed (2 from Task 2 + 4 added here).

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/infrastructure/settingsStore.ts src/app/knowledge_base/infrastructure/settingsStore.test.ts
git commit -m "feat(infra): settingsStore mutations — setLastPath/pushRecent/etc"
```

---

## Task 4: `UninitializedVaultSplash` component + tests

**Files:**
- Create: `src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx`
- Create: `src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `UninitializedVaultSplash.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UninitializedVaultSplash } from "./UninitializedVaultSplash";

describe("UninitializedVaultSplash", () => {
  it("renders the folder name and the spec wording", () => {
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={() => undefined}
        onPickDifferent={() => undefined}
      />,
    );
    expect(
      screen.getByText(/my-vault is not yet a knowledge-base vault/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /initialize this vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open a different folder/i })).toBeInTheDocument();
  });

  it("invokes onInitialize when 'Initialize this vault' is clicked", async () => {
    const onInitialize = vi.fn();
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={onInitialize}
        onPickDifferent={() => undefined}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /initialize this vault/i }));
    expect(onInitialize).toHaveBeenCalledTimes(1);
  });

  it("invokes onPickDifferent when 'Open a different folder' is clicked", async () => {
    const onPickDifferent = vi.fn();
    render(
      <UninitializedVaultSplash
        folderName="my-vault"
        onInitialize={() => undefined}
        onPickDifferent={onPickDifferent}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /open a different folder/i }));
    expect(onPickDifferent).toHaveBeenCalledTimes(1);
  });
});
```

```bash
npm run test:run -- src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement the component**

Create `UninitializedVaultSplash.tsx`:

```tsx
import React from "react";

interface Props {
  folderName: string;
  onInitialize: () => void;
  onPickDifferent: () => void;
}

export function UninitializedVaultSplash({
  folderName,
  onInitialize,
  onPickDifferent,
}: Props) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      className="fixed inset-0 z-40 flex items-center justify-center bg-bg p-8"
    >
      <div className="max-w-md text-center">
        <p className="text-lg font-medium">
          <span className="font-mono">{folderName}</span> is not yet a knowledge-base vault.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-bg"
            onClick={onInitialize}
          >
            Initialize this vault
          </button>
          <button
            type="button"
            className="rounded border border-border px-4 py-2"
            onClick={onPickDifferent}
          >
            Open a different folder
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Re-run tests; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx
git commit -m "feat(shell): UninitializedVaultSplash component + tests"
```

---

## Task 5: `VaultSwitcher` Header dropdown + tests

**Files:**
- Create: `src/app/knowledge_base/shared/components/VaultSwitcher.tsx`
- Create: `src/app/knowledge_base/shared/components/VaultSwitcher.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `VaultSwitcher.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VaultSwitcher } from "./VaultSwitcher";

const baseProps = {
  currentVaultName: "my-vault",
  recents: ["/Users/x/a", "/Users/x/b"] as string[],
  isUninitialised: false,
  onOpenVault: () => undefined,
  onSwitchVault: (_p: string) => undefined,
  onInitializeVault: () => undefined,
};

describe("VaultSwitcher", () => {
  it("shows the current vault name on the trigger", () => {
    render(<VaultSwitcher {...baseProps} />);
    expect(screen.getByRole("button", { name: /my-vault/i })).toBeInTheDocument();
  });

  it("opens the menu and lists Open Vault + recents", async () => {
    render(<VaultSwitcher {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /open vault/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/Users\/x\/a/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /\/Users\/x\/b/ })).toBeInTheDocument();
  });

  it("hides 'Initialize Vault…' when the vault is initialised", async () => {
    render(<VaultSwitcher {...baseProps} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.queryByRole("menuitem", { name: /initialize vault/i })).not.toBeInTheDocument();
  });

  it("shows 'Initialize Vault…' when the vault is uninitialised", async () => {
    render(<VaultSwitcher {...baseProps} isUninitialised />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    expect(screen.getByRole("menuitem", { name: /initialize vault/i })).toBeInTheDocument();
  });

  it("invokes onOpenVault on Open Vault…", async () => {
    const onOpenVault = vi.fn();
    render(<VaultSwitcher {...baseProps} onOpenVault={onOpenVault} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /open vault/i }));
    expect(onOpenVault).toHaveBeenCalledTimes(1);
  });

  it("invokes onSwitchVault with the picked recent path", async () => {
    const onSwitchVault = vi.fn();
    render(<VaultSwitcher {...baseProps} onSwitchVault={onSwitchVault} />);
    await userEvent.click(screen.getByRole("button", { name: /my-vault/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /\/Users\/x\/b/ }));
    expect(onSwitchVault).toHaveBeenCalledWith("/Users/x/b");
  });
});
```

```bash
npm run test:run -- src/app/knowledge_base/shared/components/VaultSwitcher.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 2: Implement the component**

Create `VaultSwitcher.tsx`. Use a simple `<details>` + `<menu>`-shaped popover (no new dependency); the existing `Tooltip` import next to `Header.tsx` proves there's no Radix or shadcn primitive in this project to lean on.

```tsx
import React from "react";
import { ChevronDown, FolderOpen } from "lucide-react";

interface Props {
  currentVaultName: string;
  recents: string[];
  isUninitialised: boolean;
  onOpenVault: () => void;
  onSwitchVault: (path: string) => void;
  onInitializeVault: () => void;
}

export function VaultSwitcher({
  currentVaultName,
  recents,
  isUninitialised,
  onOpenVault,
  onSwitchVault,
  onInitializeVault,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1 rounded px-2 py-1 hover:bg-hover"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FolderOpen size={14} aria-hidden />
        <span className="font-mono text-sm">{currentVaultName}</span>
        <ChevronDown size={12} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 min-w-[16rem] rounded border border-border bg-bg shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left hover:bg-hover"
            onClick={() => {
              close();
              onOpenVault();
            }}
          >
            Open Vault…
          </button>
          {recents.length > 0 && (
            <div className="border-t border-border py-1">
              <div className="px-3 py-1 text-xs uppercase text-mute">Recent</div>
              {recents.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="menuitem"
                  className="block w-full truncate px-3 py-1 text-left font-mono text-xs hover:bg-hover"
                  onClick={() => {
                    close();
                    onSwitchVault(p);
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          {isUninitialised && (
            <button
              type="button"
              role="menuitem"
              className="block w-full border-t border-border px-3 py-2 text-left hover:bg-hover"
              onClick={() => {
                close();
                onInitializeVault();
              }}
            >
              Initialize Vault…
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Re-run tests; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/VaultSwitcher.test.tsx
```

Expected: 6 passed.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/components/VaultSwitcher.tsx src/app/knowledge_base/shared/components/VaultSwitcher.test.tsx
git commit -m "feat(shell): VaultSwitcher Header dropdown + tests"
```

---

## Task 6: Wire `VaultSwitcher` into `Header`

**Files:**
- Modify: `src/app/knowledge_base/shared/components/Header.tsx`
- Modify: `src/app/knowledge_base/shared/components/Header.test.tsx`

- [ ] **Step 1: Add the failing test**

Append to `Header.test.tsx`:

```tsx
it("renders VaultSwitcher when a vault is open", () => {
  render(
    <Header
      currentVaultName="my-vault"
      recents={[]}
      isUninitialised={false}
      onOpenVault={() => undefined}
      onSwitchVault={() => undefined}
      onInitializeVault={() => undefined}
    />,
  );
  expect(screen.getByRole("button", { name: /my-vault/i })).toBeInTheDocument();
});

it("renders no VaultSwitcher when no vault is open", () => {
  render(
    <Header
      currentVaultName={null}
      recents={[]}
      isUninitialised={false}
      onOpenVault={() => undefined}
      onSwitchVault={() => undefined}
      onInitializeVault={() => undefined}
    />,
  );
  expect(screen.queryByRole("button", { name: /vault/i })).not.toBeInTheDocument();
});
```

```bash
npm run test:run -- src/app/knowledge_base/shared/components/Header.test.tsx
```

Expected: FAIL — Header doesn't accept the new props.

- [ ] **Step 2: Extend `Header.tsx` to accept and render the switcher**

Add the new optional props to `HeaderProps`:

```ts
interface HeaderProps {
  // … existing fields kept verbatim …
  currentVaultName?: string | null;
  recents?: string[];
  isUninitialised?: boolean;
  onOpenVault?: () => void;
  onSwitchVault?: (path: string) => void;
  onInitializeVault?: () => void;
}
```

Inside the component, destructure them with defaults (`recents = []`, `isUninitialised = false`) and render `<VaultSwitcher>` before the dirty-stack indicator:

```tsx
import { VaultSwitcher } from "./VaultSwitcher";
// …
{currentVaultName && onOpenVault && onSwitchVault && onInitializeVault ? (
  <VaultSwitcher
    currentVaultName={currentVaultName}
    recents={recents ?? []}
    isUninitialised={!!isUninitialised}
    onOpenVault={onOpenVault}
    onSwitchVault={onSwitchVault}
    onInitializeVault={onInitializeVault}
  />
) : null}
```

- [ ] **Step 3: Re-run; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/Header.test.tsx
```

Expected: pre-existing tests + 2 new passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/components/Header.tsx src/app/knowledge_base/shared/components/Header.test.tsx
git commit -m "feat(shell): mount VaultSwitcher in Header"
```

---

## Task 7: Replace `localStorage` boot path with `settingsStore.lastPath`

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`
- Create: `src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx`

- [ ] **Step 1: Write the failing tests in a new boot-scoped test file**

Mirror the harness used by `src/app/knowledge_base/shared/hooks/useFileExplorer.operations.test.tsx` (which renders `useFileExplorer` inside `<ShellErrorProvider>` + `<StubRepositoryProvider value={mockReposFor(root)}>` and uses `MockDir` from `../testUtils/fsMock`).

Create `src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useFileExplorer } from "./useFileExplorer";
import { ShellErrorProvider } from "../../shell/ShellErrorContext";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { MockDir } from "../testUtils/fsMock";
import * as tauriBridgeModule from "../../infrastructure/tauriBridge";
import * as settingsStore from "../../infrastructure/settingsStore";

vi.mock("../../infrastructure/settingsStore", () => ({
  getSettings: vi.fn(),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
  getRecents: vi.fn(async () => []),
  setClaudeChatHeight: vi.fn(async () => undefined),
}));

vi.spyOn(tauriBridgeModule.tauriBridge, "setRoot").mockResolvedValue();
vi.spyOn(tauriBridgeModule.tauriBridge, "pick").mockResolvedValue(null);

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    ShellErrorProvider,
    null,
    createElement(StubRepositoryProvider, { value: mockReposFor(new MockDir("/")) }, children),
  );
}

// Reuse the helper from operations.test.tsx — copy the function definition verbatim.
function mockReposFor(_root: MockDir) {
  return {
    attachment: null,
    attachmentLinks: null,
    linkIndex: null,
    svgRefs: null,
    tabRefs: null,
    vaultConfig: null,
    vaultIndex: { scan: async () => [] },
  } as unknown as Parameters<typeof StubRepositoryProvider>[0]["value"];
}

describe("useFileExplorer boot — settingsStore restore", () => {
  beforeEach(() => {
    vi.mocked(settingsStore.getSettings).mockReset();
    vi.mocked(settingsStore.clearLastPath).mockClear();
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockClear();
  });

  it("restores lastPath and calls setRoot when the path is reachable", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: "/Users/x/v", recents: ["/Users/x/v"] },
      ui: { claudeChat: { height: 320 } },
      claude: {},
    });
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current.vaultPath).toBe("/Users/x/v"));
    expect(tauriBridgeModule.tauriBridge.setRoot).toHaveBeenCalledWith("/Users/x/v");
  });

  it("leaves vaultPath null when the store has no lastPath", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: null, recents: [] },
      ui: { claudeChat: { height: 320 } },
      claude: {},
    });
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(settingsStore.getSettings).toHaveBeenCalled());
    expect(result.current.vaultPath).toBeNull();
    expect(tauriBridgeModule.tauriBridge.setRoot).not.toHaveBeenCalled();
  });

  it("clears lastPath when setRoot rejects (canonicalize NotFound)", async () => {
    vi.mocked(settingsStore.getSettings).mockResolvedValue({
      vault: { lastPath: "/gone", recents: ["/gone"] },
      ui: { claudeChat: { height: 320 } },
      claude: {},
    });
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockRejectedValueOnce(
      new Error("canonicalize: NotFound"),
    );
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(settingsStore.clearLastPath).toHaveBeenCalled());
    expect(result.current.vaultPath).toBeNull();
  });
});
```

(If `useFileExplorer()` takes positional args today, match the existing call shape from `.operations.test.tsx`. The above assumes argless — confirm before editing.)

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx
```

Expected: FAIL — settingsStore is not used in the hook yet.

- [ ] **Step 2: Refactor the boot effect in `useFileExplorer.ts`**

In the file, replace the current `useEffect` block at roughly lines 76–110 (the one with `// TODO MVP-1c: load persisted vaultPath …`) with:

```ts
import * as settingsStore from "../../infrastructure/settingsStore";

const restoredRef = useRef(false);
useEffect(() => {
  if (restoredRef.current) return;
  restoredRef.current = true;
  void (async () => {
    const settings = await settingsStore.getSettings();
    const lastPath = settings.vault.lastPath;
    if (!lastPath) return;
    try {
      // vault_set_root canonicalizes the path; a deleted/moved directory
      // surfaces here as a rejection, not a silent succeed-with-stale-root.
      await tauriBridge.setRoot(lastPath);
      setVaultPath(lastPath);
      const name = lastPath.split("/").pop() ?? lastPath.split("\\").pop() ?? lastPath;
      setDirectoryName(name);
    } catch (e) {
      reportError(e, "Restoring last vault");
      await settingsStore.clearLastPath();
    }
  })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

(`vault_exists` is vault-relative — it can't validate an absolute path before `setRoot` runs. Relying on `setRoot`'s canonicalize for the existence check uses the IPC we already have.)

- [ ] **Step 3: Update `openFolder` to write through the store**

After the `setActiveFile(null)` line in `openFolder`, before the `} catch`, append:

```ts
await settingsStore.setLastPath(picked);
await settingsStore.pushRecent(picked);
```

Remove the now-stale `localStorage.setItem(DIR_NAME_KEY, name)` line. Run `grep -n DIR_NAME_KEY src/app/knowledge_base/` — if the constant has no remaining readers, delete it; if it still has readers (e.g. a localStorage-restore in MobileShell or similar), leave it for MVP-1d cleanup.

- [ ] **Step 4: Add an openFolder write-through test**

Append to `useFileExplorer.boot.test.tsx`:

```tsx
import { act } from "@testing-library/react";

it("openFolder writes lastPath and pushes a recent on success", async () => {
  vi.mocked(settingsStore.getSettings).mockResolvedValue({
    vault: { lastPath: null, recents: [] },
    ui: { claudeChat: { height: 320 } },
    claude: {},
  });
  vi.mocked(tauriBridgeModule.tauriBridge.pick).mockResolvedValueOnce("/Users/x/new");
  vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockResolvedValueOnce();
  const { result } = renderHook(() => useFileExplorer(), { wrapper });
  await waitFor(() => expect(settingsStore.getSettings).toHaveBeenCalled());
  await act(async () => {
    await result.current.openFolder();
  });
  expect(settingsStore.setLastPath).toHaveBeenCalledWith("/Users/x/new");
  expect(settingsStore.pushRecent).toHaveBeenCalledWith("/Users/x/new");
});
```

- [ ] **Step 5: Re-run; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx
```

Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts src/app/knowledge_base/shared/hooks/useFileExplorer.boot.test.tsx
git commit -m "feat(shell): replace localStorage vault boot with settingsStore"
```

---

## Task 8: `switchVault(path)` — non-picker vault switch with dirty-confirm

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`
- Create: `src/app/knowledge_base/shared/hooks/useFileExplorer.switchVault.test.tsx`

- [ ] **Step 1: Write the failing tests in a switchVault-scoped test file**

Re-use the wrapper / `mockReposFor` helper pattern from Task 7's boot test file. Inspect how dirtyFiles are set in `useFileExplorer.operations.test.tsx` (the file should have a "delete makes file dirty" or similar test — find one with `grep -n dirtyFiles src/app/knowledge_base/shared/hooks/useFileExplorer.operations.test.tsx` and copy its setup verbatim). If the hook doesn't expose a way to mutate `dirtyFiles` directly from a test, the cleanest path is to call `result.current.markDirty(path)` (or whatever exported function the hook offers — confirm by reading the hook's return object).

```tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useFileExplorer } from "./useFileExplorer";
import { ShellErrorProvider } from "../../shell/ShellErrorContext";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { MockDir } from "../testUtils/fsMock";
import * as tauriBridgeModule from "../../infrastructure/tauriBridge";
import * as settingsStore from "../../infrastructure/settingsStore";

vi.mock("../../infrastructure/settingsStore", () => ({
  getSettings: vi.fn(async () => ({
    vault: { lastPath: null, recents: [] },
    ui: { claudeChat: { height: 320 } },
    claude: {},
  })),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
  getRecents: vi.fn(async () => []),
}));

vi.spyOn(tauriBridgeModule.tauriBridge, "setRoot").mockResolvedValue();

function mockReposFor(_root: MockDir) {
  return {
    attachment: null, attachmentLinks: null, linkIndex: null,
    svgRefs: null, tabRefs: null, vaultConfig: null,
    vaultIndex: { scan: async () => [] },
  } as unknown as Parameters<typeof StubRepositoryProvider>[0]["value"];
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    ShellErrorProvider, null,
    createElement(StubRepositoryProvider, { value: mockReposFor(new MockDir("/")) }, children),
  );
}

describe("useFileExplorer.switchVault", () => {
  beforeEach(() => {
    vi.mocked(tauriBridgeModule.tauriBridge.setRoot).mockClear();
    vi.mocked(settingsStore.setLastPath).mockClear();
    vi.mocked(settingsStore.pushRecent).mockClear();
  });

  it("performs a clean switch when no files are dirty", async () => {
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    await act(async () => {
      await result.current.switchVault("/Users/x/other");
    });
    expect(tauriBridgeModule.tauriBridge.setRoot).toHaveBeenCalledWith("/Users/x/other");
    expect(result.current.vaultPath).toBe("/Users/x/other");
    expect(settingsStore.setLastPath).toHaveBeenCalledWith("/Users/x/other");
    expect(settingsStore.pushRecent).toHaveBeenCalledWith("/Users/x/other");
  });

  it("aborts when dirty and confirm returns false", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useFileExplorer(), { wrapper });
    await waitFor(() => expect(result.current).toBeDefined());
    // Mark a file dirty via whatever public surface the hook exposes.
    // Inspect the hook's return-object keys with grep -n "return {" useFileExplorer.ts;
    // typical names: markDirty / setDirty / addDirtyFile. If none exist, adapt by
    // calling the renameFile / deleteFile path that the existing tests use to
    // produce dirty state.
    await act(async () => {
      result.current.markDirty?.("doc.md");
    });
    await act(async () => {
      await result.current.switchVault("/Users/x/other");
    });
    expect(confirmSpy).toHaveBeenCalled();
    expect(tauriBridgeModule.tauriBridge.setRoot).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
```

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.switchVault.test.tsx
```

Expected: FAIL — `switchVault` not exported.

- [ ] **Step 2: Implement `switchVault`**

In `useFileExplorer.ts`, add (after `openFolder`):

```ts
const switchVault = useCallback(async (path: string) => {
  if (dirtyFiles.size > 0) {
    const ok = window.confirm(
      `You have ${dirtyFiles.size} unsaved file(s). Switch vaults and discard?`,
    );
    if (!ok) return;
  }
  try {
    setIsLoading(true);
    await tauriBridge.setRoot(path);
    setVaultPath(path);
    const name = path.split("/").pop() ?? path.split("\\").pop() ?? path;
    setDirectoryName(name);
    setActiveFile(null);
    await settingsStore.setLastPath(path);
    await settingsStore.pushRecent(path);
  } catch (e) {
    reportError(e, "Switching vault");
  } finally {
    setIsLoading(false);
  }
}, [dirtyFiles, reportError]);
```

Add `switchVault` to the hook's return object.

- [ ] **Step 3: Re-run; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.switchVault.test.tsx
```

Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts src/app/knowledge_base/shared/hooks/useFileExplorer.switchVault.test.tsx
git commit -m "feat(shell): switchVault(path) with dirty-confirm + store update"
```

---

## Task 9: Init-guard — `vaultStatus` + render `UninitializedVaultSplash` in `KnowledgeBaseInner`

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Create: `src/app/knowledge_base/knowledgeBase.initGuard.test.tsx`

- [ ] **Step 1: Write the failing tests**

There is no `knowledgeBase.test.tsx` in the project — existing knowledgeBase tests are scoped (`.dirty`, `.tabRouting`, `.exportTab`, `.gpImport`). Mirror their harness pattern (read `knowledgeBase.dirty.test.tsx` first to confirm import paths and any test-only providers) and create `src/app/knowledge_base/knowledgeBase.initGuard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import KnowledgeBase from "./knowledgeBase";

// Mock the Tauri-repo factories so vaultConfig.read() is the only knob the test cares about.
vi.mock("./infrastructure/tauriBridge", () => ({
  tauriBridge: {
    setRoot: vi.fn().mockResolvedValue(undefined),
    pick: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(true),
    readJson: vi.fn(), // overridden per-test
    writeJson: vi.fn().mockResolvedValue(undefined),
    watchStart: vi.fn().mockResolvedValue(undefined),
    watchStop: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("./infrastructure/settingsStore", () => ({
  getSettings: vi.fn(async () => ({
    vault: { lastPath: "/Users/x/empty", recents: [] },
    ui: { claudeChat: { height: 320 } },
    claude: {},
  })),
  getRecents: vi.fn(async () => []),
  setLastPath: vi.fn(async () => undefined),
  pushRecent: vi.fn(async () => undefined),
  clearLastPath: vi.fn(async () => undefined),
}));

import { tauriBridge } from "./infrastructure/tauriBridge";

describe("KnowledgeBase init-guard", () => {
  it("renders UninitializedVaultSplash when vaultConfig.read() returns null", async () => {
    vi.mocked(tauriBridge.readJson).mockResolvedValue(null);
    render(<KnowledgeBase />);
    expect(
      await screen.findByText(/empty is not yet a knowledge-base vault/i),
    ).toBeInTheDocument();
  });

  it("renders the app interior when vaultConfig.read() returns a valid config", async () => {
    vi.mocked(tauriBridge.readJson).mockResolvedValue({ name: "v" });
    render(<KnowledgeBase />);
    await waitFor(() =>
      expect(
        screen.queryByText(/is not yet a knowledge-base vault/i),
      ).not.toBeInTheDocument(),
    );
  });
});
```

(`KnowledgeBase` does not take an `initialVaultPath` prop today; the path is driven through the mocked `settingsStore.getSettings`. If reading `knowledgeBase.dirty.test.tsx` reveals additional providers or wrappers needed — `BrowserRouter`, theme provider, etc. — wrap the rendered tree the same way.)

```bash
npm run test:run -- src/app/knowledge_base/knowledgeBase.initGuard.test.tsx
```

Expected: FAIL — splash never renders.

- [ ] **Step 2: Add the `vaultStatus` derivation**

In `knowledgeBase.tsx`, inside `KnowledgeBaseInner`, derive:

```tsx
const [vaultConfig, setVaultConfig] = React.useState<unknown | null | undefined>(undefined);
React.useEffect(() => {
  if (!fileExplorer.vaultPath || !repos.vaultConfig) {
    setVaultConfig(undefined);
    return;
  }
  let cancelled = false;
  void repos.vaultConfig.read().then((cfg) => {
    if (!cancelled) setVaultConfig(cfg);
  });
  return () => {
    cancelled = true;
  };
}, [fileExplorer.vaultPath, repos.vaultConfig]);

const vaultStatus: "no-vault" | "loading" | "uninitialised" | "ready" =
  !fileExplorer.vaultPath
    ? "no-vault"
    : vaultConfig === undefined
    ? "loading"
    : vaultConfig === null
    ? "uninitialised"
    : "ready";
```

(`repos.vaultConfig` already exists post-MVP-1a. If the field isn't named that, run `grep -n vaultConfig src/app/knowledge_base/shell/RepositoryContext.tsx` to confirm — the spec calls it `vaultConfigRepoTauri` and the bridge expects a `read()` method.)

- [ ] **Step 3: Render the splash when `vaultStatus === "uninitialised"`; render `null` while `'loading'`**

Wrap the existing top-level return so that, before the existing PaneManager / explorer / drawer subtree, we render:

```tsx
if (vaultStatus === "loading") {
  // The async vaultConfig.read() resolves within one tick of the vault being
  // mounted; rendering null avoids a "flash of uninitialised splash" while
  // the read is in flight. (No spinner: the read is too fast to justify one.)
  return null;
}

if (vaultStatus === "uninitialised") {
  const folderName = fileExplorer.directoryName ?? "this folder";
  return (
    <>
      <Header
        currentVaultName={folderName}
        recents={recents}
        isUninitialised
        onOpenVault={fileExplorer.openFolder}
        onSwitchVault={fileExplorer.switchVault}
        onInitializeVault={() => void initializeCurrentVault()}
        // … other existing Header props (theme, dirtyFiles=[]) …
      />
      <UninitializedVaultSplash
        folderName={folderName}
        onInitialize={() => void initializeCurrentVault()}
        onPickDifferent={fileExplorer.openFolder}
      />
    </>
  );
}
```

`initializeCurrentVault` is a new local async helper:

```tsx
const initializeCurrentVault = React.useCallback(async () => {
  if (!fileExplorer.vaultPath || !repos.vaultConfig) return;
  const name = fileExplorer.directoryName ?? "vault";
  await initVault(repos.vaultConfig, name);
  const cfg = await repos.vaultConfig.read();
  setVaultConfig(cfg);
}, [fileExplorer.vaultPath, fileExplorer.directoryName, repos.vaultConfig]);
```

Import `initVault` from `./features/document/utils/vaultConfig`. (Confirm the import path / argument shape with the existing `initVault` definition: `grep -n "export async function initVault" src/app/knowledge_base/features/document/utils/vaultConfig.ts` — match its current signature exactly. If it expects a `vaultConfigRepo` argument, pass `repos.vaultConfig`; if it expects a directory handle, that's a sign MVP-1a's repo migration is incomplete and is a blocker — escalate.)

- [ ] **Step 4: Pass the new Header props in the `'ready'` branch too**

In the existing top-level Header invocation (the one already in the file, in the `'ready'` branch), add:

```tsx
currentVaultName={fileExplorer.directoryName}
recents={recents}
isUninitialised={false}
onOpenVault={fileExplorer.openFolder}
onSwitchVault={fileExplorer.switchVault}
onInitializeVault={() => undefined}
```

`recents` comes from a new state variable populated on mount:

```tsx
const [recents, setRecents] = React.useState<string[]>([]);
React.useEffect(() => {
  void settingsStore.getRecents().then(setRecents);
}, [fileExplorer.vaultPath]);
```

(Re-fetched on each vault switch so the dropdown stays fresh.)

- [ ] **Step 5: Re-run tests; expect GREEN**

```bash
npm run test:run -- src/app/knowledge_base/knowledgeBase
```

Expected: 2 new passes (in `knowledgeBase.initGuard.test.tsx`); existing knowledgeBase tests still green.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/knowledgeBase.initGuard.test.tsx
git commit -m "feat(shell): vault init-guard + splash + Header switcher wiring"
```

---

## Task 10: Rust — post-process `Modified` events with existence check

**Files:**
- Modify: `src-tauri/src/vault/watcher.rs`

- [ ] **Step 1: Write the failing test**

Open `src-tauri/src/vault/watcher.rs`. Inside the existing `#[cfg(test)] mod tests { … }` block (the one with `to_vault_changes` translator tests), add:

```rust
#[tokio::test]
async fn rewrites_modified_to_deleted_when_path_is_gone() {
    use tempfile::TempDir;
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    // Path that does not exist on disk.
    let absent = root.join("ghost.md");

    let translated = vec![VaultChangeEvent {
        kind: ChangeKind::Modified,
        path: "ghost.md".to_string(),
        old_path: None,
    }];

    let post = postprocess_existence(&translated, &root).await;
    assert_eq!(post.len(), 1);
    assert_eq!(post[0].kind, ChangeKind::Deleted, "expected re-emit as Deleted");
    let _ = absent; // sanity: silences unused-binding lint without dead_code attr
}

#[tokio::test]
async fn keeps_modified_when_path_still_exists() {
    use tempfile::TempDir;
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    let p = root.join("real.md");
    tokio::fs::write(&p, b"hi").await.unwrap();

    let translated = vec![VaultChangeEvent {
        kind: ChangeKind::Modified,
        path: "real.md".to_string(),
        old_path: None,
    }];

    let post = postprocess_existence(&translated, &root).await;
    assert_eq!(post.len(), 1);
    assert_eq!(post[0].kind, ChangeKind::Modified);
}

#[tokio::test]
async fn does_not_touch_created_or_renamed_or_already_deleted() {
    use tempfile::TempDir;
    let tmp = TempDir::new().unwrap();
    let root = tmp.path().to_path_buf();
    let translated = vec![
        VaultChangeEvent { kind: ChangeKind::Created,  path: "absent-create.md".into(),  old_path: None },
        VaultChangeEvent { kind: ChangeKind::Deleted,  path: "absent-delete.md".into(),  old_path: None },
        VaultChangeEvent { kind: ChangeKind::Renamed,  path: "absent-rename-to.md".into(), old_path: Some("absent-rename-from.md".into()) },
    ];
    let post = postprocess_existence(&translated, &root).await;
    assert_eq!(post.len(), 3);
    assert_eq!(post[0].kind, ChangeKind::Created);
    assert_eq!(post[1].kind, ChangeKind::Deleted);
    assert_eq!(post[2].kind, ChangeKind::Renamed);
}
```

```bash
cd src-tauri && cargo test --lib watcher::tests::rewrites_modified
```

Expected: FAIL — `postprocess_existence` not defined.

- [ ] **Step 2: Implement `postprocess_existence`**

Above the `#[cfg(test)] mod tests` block (and above `_root_marker`), add:

```rust
pub(crate) async fn postprocess_existence(
    events: &[VaultChangeEvent],
    root: &std::path::Path,
) -> Vec<VaultChangeEvent> {
    let mut out = Vec::with_capacity(events.len());
    for e in events {
        if e.kind != ChangeKind::Modified {
            out.push(e.clone());
            continue;
        }
        let abs = root.join(&e.path);
        match tokio::fs::metadata(&abs).await {
            Ok(_) => out.push(e.clone()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                out.push(VaultChangeEvent {
                    kind: ChangeKind::Deleted,
                    path: e.path.clone(),
                    old_path: e.old_path.clone(),
                });
            }
            Err(_) => out.push(e.clone()), // permission errors etc. — leave untouched
        }
    }
    out
}
```

- [ ] **Step 3: Wire `postprocess_existence` into `Watcher::start`'s forwarding worker**

Find the worker task in `Watcher::start` (the loop that calls `to_vault_changes` then `app_handle.emit("vault_change", &changes)`). Replace:

```rust
let changes = to_vault_changes(&batch, &root);
let _ = app_handle.emit("vault_change", &changes);
```

with:

```rust
let translated = to_vault_changes(&batch, &root);
let changes = postprocess_existence(&translated, &root).await;
let _ = app_handle.emit("vault_change", &changes);
```

- [ ] **Step 4: Re-run unit tests; expect GREEN**

```bash
cd src-tauri && cargo test --lib watcher::tests
```

Expected: 11 passing (8 pre-existing translator + 3 new post-process).

- [ ] **Step 5: Un-ignore the macOS integration test for delete**

In `src-tauri/tests/watcher_integration.rs`, find the `#[ignore]` test that asserts a delete on macOS. Remove the `#[ignore]` attribute. Update its assertion to expect `ChangeKind::Deleted` for the affected path (the post-process will rewrite the FSEvents `Modified` into `Deleted`).

```bash
cd src-tauri && cargo test --test watcher_integration -- --include-ignored 2>&1 | tail -30
# Then re-run without --include-ignored to confirm the un-ignored test passes:
cargo test --test watcher_integration 2>&1 | tail -20
```

Expected: the un-ignored delete test now passes; remaining `#[ignore]`s (rename, etc.) stay as-is.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/vault/watcher.rs src-tauri/tests/watcher_integration.rs
git commit -m "fix(tauri): post-process Modified events with existence check"
```

---

## Task 11: Manual smoke (`npx tauri dev`)

**Files:** _none_

- [ ] **Step 1: Boot the app**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npx tauri dev
```

Expected: app window opens; if a previous vault was set, it auto-restores (look for the basename in the new Header switcher).

- [ ] **Step 2: Smoke each switcher action**

| Action | Expected |
|---|---|
| Click switcher → **Open Vault…** → pick a folder that has `.archdesigner/config.json` | App reloads with the new vault; no splash; previous vault appears in Recents next time |
| Click switcher → pick a recent | Same as above; switch happens without picker |
| Click switcher → **Open Vault…** → pick a folder *without* `.archdesigner/config.json` | Splash appears with the folder name; app interior is hidden |
| In the splash, click **Initialize this vault** | Toast / silent success; splash dismounts; app interior renders |
| In the splash, click **Open a different folder** | Picker opens; pick another folder |
| With unsaved edits in a doc, pick a recent | Confirm dialog appears; cancelling keeps the current vault |
| Edit a file *outside* the app (`echo`), then *delete* it before the 200 ms debounce | Subscriber sees `vault_change` with kind `deleted`, not `modified` |
| Quit + relaunch | Last vault auto-restores |

- [ ] **Step 2: No commit (manual gate)**

Capture any deviations as items in **Open follow-up items** of the handoff doc.

---

## Task 12: Run the full local CI surface

**Files:** _none_

- [ ] **Step 1: Frontend gates**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run typecheck
npm run lint
npm run test:run
```

Expected: 0 type errors; 0 lint errors (existing warnings tolerated, but no *new* warnings); all Vitest passing.

- [ ] **Step 2: Rust gates**

```bash
cd src-tauri
cargo fmt -- --check
cargo clippy --all-targets -- -D warnings
cargo test
```

Expected: fmt clean; clippy clean; all tests green.

- [ ] **Step 3: Production build sanity**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run build
```

Expected: Next static export succeeds. (No need to run `tauri build` here — that's MVP-1d's CI job.)

---

## Task 13: Update `Features.md`, `test-cases/`, handoff doc

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/01-app-shell.md`
- Modify: `test-cases/02-file-system.md`
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: `Features.md`**

Under the **App shell** section, add bullets:

```
- ✅ Vault switcher dropdown in Header — Open Vault, Recent Vaults (MRU 5), Initialize Vault. (`src/app/knowledge_base/shared/components/VaultSwitcher.tsx`)
- ✅ Uninitialized-vault splash blocks app interior until `vaultConfig.init` runs. (`src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx`)
- ✅ Vault path persistence via `tauri-plugin-store` — last vault auto-restores on launch; recents listed in switcher. (`src/app/knowledge_base/infrastructure/settingsStore.ts`)
```

Under **File system**, replace any prior `?` polling-derived line about path memory with the bullet above.

- [ ] **Step 2: `test-cases/01-app-shell.md`**

Promote the splash + switcher cases from ❌ to ✅ for whichever IDs already covered them. If new cases are needed, append (don't renumber):

```
- SHELL-1.X: Vault switcher trigger shows current vault basename → ✅
- SHELL-1.X: Switcher → Open Vault → picker opens → on success, app reloads with new vault → ✅
- SHELL-1.X: Switcher → recent path → switches without picker → ✅
- SHELL-1.X: Splash renders for an empty folder; Initialize button creates config and dismisses splash → ✅
- SHELL-1.X: Switching with unsaved edits prompts confirm → ✅
```

(Use the next free ID per the existing numbering.)

- [ ] **Step 3: `test-cases/02-file-system.md`**

Promote the persistence cases (`lastPath` restore, recents dedup, recents max=5) from ❌ to ✅.

- [ ] **Step 4: Handoff doc — flip MVP-1c to 🚧 then ✅ on merge**

In `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`:

- Bump **Last updated** to today's date with a short parenthetical: *"MVP-1c shipped — settings store, vault switcher, init splash, FSEvents Modified→Deleted post-process."*
- In **Where we are → Plans**, flip MVP-1c to ✅ Merged with the PR number once merged. (Until merge, leave it 🚧 with the open PR number.)
- In **Reference architecture**, add a "**Landed (MVP-1c, PR #N):**" block listing the new Rust `src-tauri/src/settings/{mod,store,commands}.rs` module + `tauri-plugin-store` registration, `settingsStore.ts`, `VaultSwitcher.tsx`, `UninitializedVaultSplash.tsx`, the Header changes, the `useFileExplorer.boot/switchVault` test files, and the `postprocess_existence` Rust addition in `vault/watcher.rs`.
- In **Open follow-up items**, close the **macOS FSEvents kind-mapping gap** row (the `Modified`→`Deleted` half) and leave the rename/cookie half open for MVP-4. Update the wording.
- Replace **Next Action** with the MVP-1d bootstrap (write MVP-1d plan; reference spec § 6.4).

- [ ] **Step 5: Commit**

```bash
git add Features.md test-cases/01-app-shell.md test-cases/02-file-system.md docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "docs(kb): MVP-1c — Features.md, test-cases, handoff updates"
```

---

## Task 14: Push and open PR

**Files:** _none_

- [ ] **Step 1: Push**

```bash
git push -u origin feat/tauri-mvp1c-settings-vaults
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --title "feat(tauri): MVP-1c — settings store, vault switcher, init splash, watcher delete-rewrite" --body "$(cat <<'EOF'
## Summary

- Persist `vault.lastPath` + `vault.recents` (MRU 5) via `tauri-plugin-store`; replace `localStorage` boot path
- Header `VaultSwitcher` dropdown — Open Vault / Recents / Initialize
- `UninitializedVaultSplash` gates `KnowledgeBaseInner` until `vaultConfig.init` runs
- Watcher `Modified`→`Deleted` rewrite via `tokio::fs::metadata` post-process; macOS delete integration test un-ignored

## Test plan

- [ ] `npm run typecheck && npm run lint && npm run test:run`
- [ ] `cd src-tauri && cargo fmt -- --check && cargo clippy --all-targets -- -D warnings && cargo test`
- [ ] Manual smoke per `docs/superpowers/plans/2026-05-08-tauri-mvp1c-settings-vaults-plan.md` Task 11

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR review + merge, run the **Post-merge cleanup protocol** in the handoff doc, then write the MVP-1d plan and start it.

---

## Summary

14 tasks, decomposed:

- **Task 1** — Rust settings module: `tauri-plugin-store` dep + plugin registration + typed `Settings` struct + `settings_read` / `settings_write` commands.
- **Task 2** — TS settings facade `getSettings` calling `settings_read` via `invoke`.
- **Task 3** — Mutation helpers (`setLastPath`, `clearLastPath`, `pushRecent`, `getRecents`, `setClaudeChatHeight`) with MRU + dedup + cap-5 tests; each does a read-then-write through `settings_write`.
- **Task 4** — `UninitializedVaultSplash` component + tests.
- **Task 5** — `VaultSwitcher` Header dropdown + tests.
- **Task 6** — Mount `VaultSwitcher` in `Header.tsx`.
- **Task 7** — Replace `localStorage` boot path in `useFileExplorer` with `settingsStore.getSettings`.
- **Task 8** — `switchVault(path)` non-picker switch with dirty-confirm + store update.
- **Task 9** — Init-guard in `KnowledgeBaseInner` (`vaultStatus` derivation + splash render + Header prop wiring).
- **Task 10** — Rust `postprocess_existence` for `Modified`→`Deleted` rewrite + un-ignore macOS delete integration test.
- **Task 11** — Manual `npx tauri dev` smoke for switcher / splash / persistence / delete-rewrite.
- **Task 12** — Full local CI surface (typecheck, lint, vitest, cargo fmt/clippy/test, build).
- **Task 13** — `Features.md`, `test-cases/`, handoff doc updates.
- **Task 14** — Push and open PR.

**Test totals after Task 10:** 3 new Rust unit tests in `settings::store::tests` (Task 1) + 3 new Rust unit tests in `watcher::tests` (Task 10 post-process) + 1 un-ignored Rust integration test + 6 Vitest tests in `settingsStore.test.ts` (Tasks 2 + 3) + 3 in `UninitializedVaultSplash.test.tsx` + 6 in `VaultSwitcher.test.tsx` + 2 in `Header.test.tsx` + 4 in `useFileExplorer.boot.test.tsx` + 2 in `useFileExplorer.switchVault.test.tsx` + 2 in `knowledgeBase.initGuard.test.tsx` = +32 across the suite.

## Out of scope (next MVPs)

- **MVP-1d** — FSA `*Repo.ts` deletion, `idbHandles.ts` deletion, `useOfflineCache.ts` removal, `historyPersistence.ts` removal, GitHub Pages workflow removal, `tauri.conf.json` finalisation, macOS bundle CI job.
- **MVP-2** — Footer Claude status line, chat drawer (the `ui.claudeChat.height` slot exists in settings; UI consumer ships in MVP-2). The `claude:{}` settings stanza is also reserved for MVP-2.
- **MVP-4** — Restore Playwright on `tauri-plugin-webdriver`; finish the FSEvents rename-cookie half of the kind-mapping gap.

## Self-Review

**Spec coverage check** — every § 6.3 line maps to a task:

- "Settings store via `tauri-plugin-store` (one JSON file under `app_config_dir()`)" → Tasks 1, 2.
- "Replaces `idbHandles.ts`" → Tasks 7 (boot path); deletion deferred to MVP-1d (handoff Open follow-up).
- Settings shape `{ vault: { lastPath, recents }, ui: { claudeChat: { height } }, claude: {} }` → Task 2 default constant + Task 3 mutations.
- "Vault switcher UI … Header" + Open Vault / Recent Vaults / Initialize Vault entries → Tasks 5, 6.
- "Uninitialized vault flow" — render `<UninitializedVaultSplash>`, gate other surfaces → Tasks 4, 9.
- "Initialize action — calls `vaultConfig.init(vaultName)`" → Task 9 `initializeCurrentVault`.
- "Switching vaults at runtime — confirms unsaved, calls `vault_watch_stop`, `vault_set_root(newPath)`, re-runs boot" → Task 8 (`switchVault`); the watcher stop/start happens automatically in `FileWatcherContext`'s `vaultPath`-keyed effect (MVP-1b), so we don't need to call `vault_watch_stop` directly.
- macOS FSEvents kind-mapping gap (handoff Open follow-up, deferred to MVP-1c/MVP-4) → Task 10 (`Modified`→`Deleted` half; rename half stays in MVP-4).

**Placeholder scan:** "TBD"/"TODO"/"appropriate error handling"/"similar to" — none introduced. Tasks 7-8 reference the existing `useFileExplorer.operations.test.tsx` harness explicitly (with the new boot/switchVault tests in their own scoped files mirroring that pattern); Task 9 references `knowledgeBase.dirty.test.tsx` as the harness model. The "find a `markDirty`-shaped function on the hook" instruction in Task 8 is a deliberate reference to the hook's actual exported surface; hard-coding a name here would diverge if the hook is restructured.

**Type consistency:**
- `Settings`, `VaultSettings`, `UiSettings` shapes match across the Rust `settings::store` module (Task 1) and the TS `settingsStore.ts` facade (Tasks 2, 3) — the Rust `#[serde(rename_all = "camelCase")]` makes the Rust↔TS shape identical (`lastPath`, `claudeChat.height`).
- `VaultChangeEvent { kind, path, oldPath? }` (Rust) is unchanged; only the per-event `kind` is rewritten in Task 10's post-process.
- `switchVault` is `(path: string) => Promise<void>` across Tasks 8, 9.
- `currentVaultName: string | null` is consistent across Tasks 5, 6, 9.
- `settings_read` and `settings_write` command names are consistent across Tasks 1 (Rust definition) and 2-3 (TS `invoke` callsites).

**Pinned versions (verified at plan-write time on crates.io / npm 2026-05-08):**
- `tauri-plugin-store = "=2.4.3"` — latest 2.x; matches `tauri = "=2.11.1"`'s plugin generation.
- No JS-side plugin dep. Frontend stays on `@tauri-apps/api/core` only — same surface as MVP-1a/1b. This removes the need for `src-tauri/capabilities/*.json` ACL config (this project does not currently have a `capabilities/` directory; introducing one would be a separate, larger change).

**Scope check:** Tasks 7 + 8 are the largest TS edits (`useFileExplorer.ts` is sizeable). Both have test-first steps and concrete diffs. Task 9 is the next-largest because `knowledgeBase.tsx` is a god-file (~1600 lines per MVP-1a's reference architecture); the changes are localised to the `KnowledgeBaseInner` boot path and Header invocation — explicitly *not* a refactor. Task 1 is the largest Rust edit (new module + plugin + 2 commands) but is mostly boilerplate.

**FSEvents post-process scope:** only the `Modified`→`Deleted` half is in scope here. The rename-cookie half stays open for MVP-4 (where cross-platform CI exists). The handoff doc's Open follow-up captures this; Task 13 closes the right half of that row only.

**Capabilities/ACL note:** `tauri-plugin-store` registered on the Rust side does not need ACL/capability config because the frontend does not call the JS plugin directly — only the Rust commands `settings_read` / `settings_write`, which are part of `generate_handler!` and not gated by Tauri 2's frontend ACL. This is the same pattern as `tauri-plugin-dialog` in MVP-1a (registered in Rust, never imported in JS).
