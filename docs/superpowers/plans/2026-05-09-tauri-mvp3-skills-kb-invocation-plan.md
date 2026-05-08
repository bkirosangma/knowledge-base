# MVP-3 — Skill bootstrap & `/kb` invocation surface

> **Branch:** `feat/tauri-mvp3-skills-kb-invocation` (cut from `main` at `e42f0bf` after PR #154 / MVP-2 merged).
> **Spec reference:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 8.1 – § 8.7 (and § 11.4 for plan-level decisions).
> **Handoff:** `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` (post-MVP-2 update is part of this MVP's seed commit).
> **Scope shape:** small Rust + tiny hook for bootstrap (Tasks 1–4); larger UI surface for `/kb` invocation (Tasks 5–9); docs / verification / PR (Tasks 10–12).

The plan ships in two halves so the first half can be reviewed in isolation:

1. **Bootstrap half (§ 8.1 – § 8.2)** — `tauri.conf.json` resource bundling, Rust `skill_status` + `skill_install_from_bundle` commands, a frontend `useSkillBootstrap` hook fired from `ClaudeChatDrawer` mount. Net surface: 2 new Rust commands, 1 new hook, 1 toast. Total: 22 commands (20 from MVP-2 + 2 new).
2. **Invocation half (§ 8.3 – § 8.6)** — slash-command palette in `Composer`, "Skills" sheet on the drawer header with one card per subcommand, vault file picker for `/kb edit` / `/kb transform`, third "Initialize with full template" action on `UninitializedVaultSplash` and the `VaultSwitcher` "Initialize Vault…" entry. Net surface: 4 new components, ~8 hard-coded subcommands, 1 splash button.

---

## Decisions baked into this plan

These are the plan-level decisions § 11.4 of the spec invites. They are **pinned**, not defaults — reviewers shouldn't relitigate them mid-MVP. If reality forces a change, edit this section in the same PR.

1. **Vault file picker for `/kb edit` / `/kb transform`** → **new lightweight modal** scoped to file types (`.json` for edit, any vault file for transform), **not** a reuse of `FileExplorer`. Reusing `FileExplorer` would couple chat-surface state to file-tree rendering and complicate testing of the picker as a leaf component.
2. **Slash palette trigger** → opens when `Composer` value matches `/^\/[a-z-]*$/` (slash-prefix, no whitespace, lowercase letters + hyphens only). Closes when value drifts off-pattern, on `Esc`, on blur, or on selection.
3. **Slash palette nav** → `↑` / `↓` to move highlight, `Enter` or `Tab` to insert template, `Esc` to dismiss without inserting. Highlight wraps top↔bottom.
4. **Slash palette template** → selecting `<subcommand>` replaces the textarea value with `/kb <subcommand> ` (trailing space). Cursor lands at end. User types the argument, then `Enter` submits.
5. **Subcommand list** → hard-coded TS array in `slashCommands.ts`, sourced from the project's `skills/knowledge-base/commands/` directory **at MVP-3 time**: `create`, `diagram`, `document`, `edit`, `guitar-tabs`, `svg`, `transform`, `validate`. `init` excluded per spec § 8.4. Updating the list when a new command lands is a one-line TS change.
6. **`useSkillBootstrap` re-fire semantics** → **per-session**, not per-mount. Module-level boolean guard (`bootstrapped`) flips on first successful run; subsequent `ClaudeChatDrawer` mounts no-op. Reasoning: drawer mounts on every open since the chat is closed-by-default per launch (MVP-2). Per-mount RPC would hit Rust on every drawer open.
7. **Skill bootstrap timing** → fires once `claude_status` settles (regardless of `binary` outcome). Skill files install even if the `claude` CLI is missing — they're independent artefacts. The slash palette + Skills sheet remain unreachable from `SetupScreen` (which short-circuits the chat surface).
8. **Skills sheet placement** → in-drawer overlay, absolutely positioned over the message list with a dim overlay. Closes on `Esc`, on backdrop click, or on Run. Reusing the dim overlay pattern from `UninitializedVaultSplash` keeps the visual language consistent.
9. **`UninitializedVaultSplash` third action submission** → **auto-submit** `/kb init` after the basic init completes. Paste-only would force the user to find the send button — auto-submit is one-click as the user expects.
10. **Toast** → a tiny `<div role="status">` rendered at the top-right of `KnowledgeBaseInner` for ~3 s after first install. **No dependency on a toast library**; we own one mini-component (`SkillInstallToast.tsx`). Future usage can promote it.
11. **What if user types `/kb` before install completes?** Slash palette uses the hard-coded TS list; works regardless of disk state. Claude resolves the skill at execution time. Document explicitly.
12. **Test bucket for MVP-3** → `test-cases/13-skills.md`, not extending `12-claude-chat.md`. Skill bootstrap + invocation are a distinct concern from the chat surface.
13. **Path resolution** → `dirs::home_dir()` joined with `.claude/skills/<name>/` (NOT a hardcoded `~`); `app.path().resource_dir()` for the bundled source. Spec § 5 cross-platform discipline.
14. **No skill drift detection** in MVP-3. If `~/.claude/skills/knowledge-base/` exists, leave it alone. Drift / one-click reconciliation deferred per § 8.7.

---

## Out of scope (anti-goals — lift verbatim into PR description)

- Custom-context attachments ("attach this document to the chat"). Future MVP.
- Skill drift detection / reconciliation. Future MVP-3.x.
- Right-click context-menu integrations ("right-click a diagram → /kb edit"). Future polish.
- User-customizable slash commands or custom subcommands. Out.
- Saved chat sessions / chat history persistence. Out.
- Auto-update of an existing global `~/.claude/skills/knowledge-base/`. Install-if-missing only.
- Model-switcher UI (deferred per handoff Open follow-up items — separate micro-MVP after MVP-3).
- Linux / Windows packaging. macOS-only-shipping; Linux-port-clean code only.

---

## File map (what changes)

### Added (Rust)

- `src-tauri/src/skill/mod.rs` — module re-exports.
- `src-tauri/src/skill/types.rs` — `SkillStatus` shape.
- `src-tauri/src/skill/install.rs` — pure install logic (recursive copy, idempotent).
- `src-tauri/src/skill/commands.rs` — `skill_status`, `skill_install_from_bundle`.

### Modified (Rust)

- `src-tauri/src/lib.rs` — register `mod skill;`.
- `src-tauri/src/main.rs` — register the two new commands in the `invoke_handler!` macro.
- `src-tauri/Cargo.toml` — no new top-level deps (uses existing `dirs`, `tokio`, `serde`, `thiserror`).
- `src-tauri/tauri.conf.json` — add `bundle.resources: ["../skills/knowledge-base/**"]`.

### Added (frontend)

- `src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.ts` — per-session install hook.
- `src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.test.ts` — vitest.
- `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx` — one-shot toast.
- `src/app/knowledge_base/features/claude/components/SkillInstallToast.test.tsx` — vitest.
- `src/app/knowledge_base/features/claude/slash/slashCommands.ts` — hard-coded subcommand list + template formatters.
- `src/app/knowledge_base/features/claude/slash/slashCommands.test.ts` — vitest (filter / template formatting).
- `src/app/knowledge_base/features/claude/slash/SlashPalette.tsx` — autocomplete dropdown UI.
- `src/app/knowledge_base/features/claude/slash/SlashPalette.test.tsx` — vitest (filter / nav / dismiss).
- `src/app/knowledge_base/features/claude/skills/SkillsSheet.tsx` — sheet shell + cards.
- `src/app/knowledge_base/features/claude/skills/SkillsSheet.test.tsx` — vitest.
- `src/app/knowledge_base/features/claude/skills/SkillCard.tsx` — one card per subcommand.
- `src/app/knowledge_base/features/claude/skills/SkillCard.test.tsx` — vitest.
- `src/app/knowledge_base/features/claude/skills/VaultFilePickerModal.tsx` — file picker scoped to file types.
- `src/app/knowledge_base/features/claude/skills/VaultFilePickerModal.test.tsx` — vitest.

### Modified (frontend)

- `src/app/knowledge_base/infrastructure/tauriBridge.ts` — add `skillStatus` + `skillInstallFromBundle`. Re-export `SkillStatus` type.
- `src/app/knowledge_base/features/claude/types.ts` — `SkillStatus` type re-exported from bridge for hook consumers.
- `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` — wire `useSkillBootstrap`; mount `SkillInstallToast`; mount `SkillsSheet` (state); add header "Skills" button.
- `src/app/knowledge_base/features/claude/components/Composer.tsx` — wire `SlashPalette` (state + handlers).
- `src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx` — add "Initialize with full template" action.
- `src/app/knowledge_base/shared/components/UninitializedVaultSplash.test.tsx` — cover the new action.
- `src/app/knowledge_base/shared/components/VaultSwitcher.tsx` — surface the same "Initialize with full template" entry under "Initialize Vault…".
- `src/app/knowledge_base/knowledgeBase.tsx` — wire the splash third-action callback into `ChatProvider` (open drawer + send `/kb init`).
- `src/app/knowledge_base/features/claude/hooks/useClaudeSession.ts` — expose a `sendImmediate(text)` variant or document that the existing `send` is safe to call programmatically (likely already is — verify in Task 9).

### Added (docs / tests)

- `test-cases/13-skills.md` — new bucket.

### Modified (docs)

- `Features.md` — extend §11 (or add §13 if numbering forces it) with skill bootstrap, slash palette, Skills sheet, and splash third action.
- `test-cases/01-app-shell.md` — note splash gains a third action (cross-reference).
- `test-cases/02-file-system.md` — note "Initialize with full template" path (cross-reference).
- `test-cases/README.md` — register §13.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — already updated as part of this branch's seed commit; no further edit until MVP-3 PR merges.

---

## Bootstrap (read-only)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use                                # match .nvmrc
npm ci                                 # match lockfile (do NOT npm install)
npm run typecheck                      # baseline green
npm run test:run                       # baseline green
npm run lint                           # baseline green
git log --oneline -5                   # confirms branch is at main's tip + this seed commit
ls skills/knowledge-base/SKILL.md      # bundle source exists
ls skills/knowledge-base/commands/     # subcommand .md files exist
```

---

## Task 1: `tauri.conf.json` resource wiring + smoke

**Goal:** Tauri's bundle pipeline copies `../skills/knowledge-base/**` into the app's resource directory at build time. Verify reachable via `app.path().resource_dir()` in the dev build.

**Diff:** `src-tauri/tauri.conf.json`

```jsonc
{
  // ...existing fields...
  "bundle": {
    "active": true,
    "targets": ["app", "dmg"],
    "resources": ["../skills/knowledge-base/**"],
    "icon": [ /* ... */ ],
    "category": "Productivity",
    "shortDescription": "Knowledge Base desktop app"
  }
}
```

The `"../skills/knowledge-base/**"` glob is relative to `src-tauri/`. Tauri's bundle tooling resolves it at build time and copies into `Knowledge Base.app/Contents/Resources/_up_/skills/knowledge-base/` for macOS bundles, mirroring the path structure with the `_up_` prefix Tauri uses for parent-of-srcTauri resources.

> **Bootstrap timing note (for reviewers):** Spec § 8.1 frames the install as "on app boot (after vault load, before chat is usable)". This plan fires the install lazily on first `ClaudeChatDrawer` mount. The chat surface is unusable before that point (drawer is closed-by-default per launch from MVP-2), so the user-visible timing is equivalent. Calling out explicitly so reviewers don't ask whether this is a deviation.

**Verification (dev mode):** add a temporary `eprintln!` in `main.rs::run` after `app.path()` is available:

```rust
let resource_dir = app.path().resource_dir().ok();
eprintln!("[skill-resource-dir-smoke] resource_dir = {:?}", resource_dir);
let candidate = resource_dir.map(|p| p.join("_up_/skills/knowledge-base/SKILL.md"));
eprintln!("[skill-resource-dir-smoke] SKILL.md exists = {:?}", candidate.as_ref().map(|p| p.exists()));
```

Confirm both lines print. **Remove the `eprintln!` block before commit.** A proper accessor lands in Task 2.

**Tests:** none (config only). Bundle correctness is verified by Task 11's Tauri debug bundle.

**Manual smoke:** `npm run tauri:dev` (per `package.json` — `"tauri:dev": "tauri dev"`), confirm both `eprintln!` lines, then remove and rebuild.

---

## Task 2: Rust `skill` module skeleton + types

**Goal:** Create the module surface; no commands wired yet. Establish the `SkillStatus` shape and a private `paths` helper resolving target + bundled paths from `AppHandle`.

**Diff:** `src-tauri/src/skill/mod.rs`

```rust
pub mod commands;
pub mod install;
pub mod types;

pub use commands::*;
pub use types::SkillStatus;
```

**Diff:** `src-tauri/src/skill/types.rs`

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillStatus {
    pub installed: bool,
    pub target_path: String,
    pub bundled_path: String,
}
```

**Diff:** `src-tauri/src/skill/install.rs` (skeleton — body in Task 3)

```rust
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
```

**Diff:** `src-tauri/src/skill/commands.rs` (stubs — bodies in Task 3)

```rust
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
```

**Diff:** `src-tauri/src/lib.rs`

```rust
// existing modules
pub mod claude;
pub mod settings;
pub mod vault;
pub mod skill;     // <-- add
```

**Diff:** `src-tauri/src/main.rs` (snippet — add to the existing `invoke_handler` chain)

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing 20 commands from MVP-2 ...
    crate::skill::commands::skill_status,
    crate::skill::commands::skill_install_from_bundle,
])
```

**Tests:** `src-tauri/src/skill/install.rs` — gated `#[cfg(test)]` module:

```rust
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
```

**Verification:** `cd src-tauri && cargo test skill::install` passes.

---

## Task 3: `skill_status` + `skill_install_from_bundle` command bodies

**Goal:** Wire the commands. Resolve target + bundled paths from `AppHandle`, return real status, perform real install.

**Diff:** `src-tauri/src/skill/commands.rs` (replace the Task 2 stubs)

```rust
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
```

**Tests:** `src-tauri/src/skill/commands.rs` — gated `#[cfg(test)]` module exercising the **path-resolution helpers** (the commands themselves take `AppHandle` which is hard to construct in unit tests; integration coverage lives in Task 11's manual smoke + the dev-mode smoke in Task 1 → Task 4):

```rust
#[cfg(test)]
mod tests {
    use super::target_path;

    #[test]
    fn target_path_uses_home_claude_skills() {
        let path = target_path("knowledge-base").unwrap();
        // Path includes the "knowledge-base" component and is anchored at .claude/skills.
        let s = path.to_string_lossy();
        assert!(s.ends_with(".claude/skills/knowledge-base") || s.ends_with(".claude\\skills\\knowledge-base"),
            "got: {s}");
    }
}
```

**Verification:** `cd src-tauri && cargo test skill::` passes (includes Task 2 install tests).

---

## Task 4: Frontend bridge + `useSkillBootstrap` hook + toast

**Goal:** Wrap the two Rust commands in `tauriBridge`, add a `useSkillBootstrap()` hook with a per-session module-level guard, mount it from `ClaudeChatDrawer`. On first install, show a 3-second toast.

**Diff:** `src/app/knowledge_base/infrastructure/tauriBridge.ts` (add to the existing namespace; inline import-ready snippet)

```typescript
// near other type imports
export interface SkillStatus {
  installed: boolean;
  targetPath: string;
  bundledPath: string;
}

// in the call object / namespace
skillStatus(name: string): Promise<SkillStatus> {
  return call<SkillStatus>("skill_status", { name }, "");
},

skillInstallFromBundle(name: string): Promise<void> {
  return call<void>("skill_install_from_bundle", { name }, "");
},
```

**Diff:** `src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.ts` (new)

```typescript
import { useEffect, useState } from "react";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

let bootstrapStarted = false;

export interface SkillBootstrapResult {
  /** Did this hook fire the install (i.e. the skill was missing on this session)? */
  justInstalled: boolean;
  /** Has the bootstrap completed (success or graceful skip)? */
  done: boolean;
  /** Error message if the install failed; null on success or skip. */
  error: string | null;
}

export function useSkillBootstrap(name: string = "knowledge-base"): SkillBootstrapResult {
  const [result, setResult] = useState<SkillBootstrapResult>({
    justInstalled: false,
    done: false,
    error: null,
  });

  useEffect(() => {
    if (bootstrapStarted) {
      // Per-session guard — this hook has already run once this session.
      setResult((prev) => (prev.done ? prev : { ...prev, done: true }));
      return;
    }
    bootstrapStarted = true;
    let cancelled = false;
    (async () => {
      try {
        const status = await tauriBridge.skillStatus(name);
        if (status.installed) {
          if (!cancelled) setResult({ justInstalled: false, done: true, error: null });
          return;
        }
        await tauriBridge.skillInstallFromBundle(name);
        if (!cancelled) setResult({ justInstalled: true, done: true, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setResult({ justInstalled: false, done: true, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [name]);

  return result;
}

/** Test-only: reset the per-session guard so vitest can re-exercise the hook. */
export function __resetSkillBootstrapForTests() {
  bootstrapStarted = false;
}
```

**Diff:** `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx` (new)

```typescript
import { useEffect, useState } from "react";

interface Props {
  /** When true, the toast shows for ~3 seconds then auto-dismisses. */
  show: boolean;
  message?: string;
}

export function SkillInstallToast({ show, message = "knowledge-base skill installed." }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [show]);

  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute right-4 top-4 z-50 rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-ink shadow-lg"
    >
      {message}
    </div>
  );
}
```

**Diff:** `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` (wire the hook + toast)

```typescript
// add imports
import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { SkillInstallToast } from "./components/SkillInstallToast";

// inside ClaudeChatDrawer(), near other hooks
const skillBootstrap = useSkillBootstrap("knowledge-base");

// inside the JSX, near the top of the drawer's outermost div
{skillBootstrap.justInstalled && <SkillInstallToast show />}
```

**Tests:** `useSkillBootstrap.test.ts`

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock tauriBridge before importing the hook
vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    skillStatus: vi.fn(),
    skillInstallFromBundle: vi.fn(),
  },
}));

import { tauriBridge } from "../../../infrastructure/tauriBridge";
import { useSkillBootstrap, __resetSkillBootstrapForTests } from "./useSkillBootstrap";

const status = vi.mocked(tauriBridge.skillStatus);
const install = vi.mocked(tauriBridge.skillInstallFromBundle);

describe("useSkillBootstrap", () => {
  beforeEach(() => {
    __resetSkillBootstrapForTests();
    status.mockReset();
    install.mockReset();
  });

  it("SKILLS-13.1-01: skips install when target exists", async () => {
    status.mockResolvedValue({ installed: true, targetPath: "/x", bundledPath: "/y" });
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.justInstalled).toBe(false);
    expect(install).not.toHaveBeenCalled();
  });

  it("SKILLS-13.1-02: invokes install when target missing", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockResolvedValue();
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.justInstalled).toBe(true);
    expect(install).toHaveBeenCalledOnce();
  });

  it("SKILLS-13.1-03: per-session guard prevents second install", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockResolvedValue();
    renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(install).toHaveBeenCalledOnce());
    install.mockClear();
    renderHook(() => useSkillBootstrap("knowledge-base"));
    // No second call even though we mounted a fresh hook instance.
    expect(install).not.toHaveBeenCalled();
  });

  it("SKILLS-13.1-04: surfaces install errors", async () => {
    status.mockResolvedValue({ installed: false, targetPath: "/x", bundledPath: "/y" });
    install.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useSkillBootstrap("knowledge-base"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.error).toBe("permission denied");
    expect(result.current.justInstalled).toBe(false);
  });
});
```

**Tests:** `SkillInstallToast.test.tsx`

```typescript
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SkillInstallToast } from "./SkillInstallToast";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SkillInstallToast", () => {
  it("SKILLS-13.1-05: renders message when show=true", () => {
    render(<SkillInstallToast show />);
    expect(screen.getByRole("status")).toHaveTextContent("knowledge-base skill installed.");
  });

  it("SKILLS-13.1-06: auto-dismisses after 3 seconds", () => {
    render(<SkillInstallToast show />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("SKILLS-13.1-07: does not render when show=false", () => {
    render(<SkillInstallToast show={false} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
```

**Verification:** `npm run test:run -- src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.test.ts src/app/knowledge_base/features/claude/components/SkillInstallToast.test.tsx` passes; full vitest suite stays green.

**Manual smoke:** `npm run tauri:dev` on a machine with `~/.claude/skills/knowledge-base/` deleted; open the chat drawer; confirm the toast appears once and the directory contents land. Reopen the drawer; toast must NOT appear again.

---

## Task 5: Slash-command palette in `Composer`

**Goal:** Add an autocomplete dropdown above the textarea when the value matches `/^\/[a-z-]*$/`. Selecting an entry replaces the textarea with `/kb <subcommand> ` (trailing space, cursor at end). Keyboard nav per **Decisions** § 3.

**Diff:** `src/app/knowledge_base/features/claude/slash/slashCommands.ts` (new)

```typescript
export interface SlashCommand {
  /** Raw subcommand identifier — matches the file name in skills/knowledge-base/commands/ minus .md. */
  id: string;
  /** Pretty label shown in the palette. */
  label: string;
  /** One-line description. */
  description: string;
  /** Template inserted when selected. Trailing space on purpose. */
  template: string;
}

/** Hard-coded for MVP-3. Update when a new command lands in skills/knowledge-base/commands/. */
export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
  { id: "create", label: "/kb create", description: "Generate a document and linked diagram together.", template: "/kb create " },
  { id: "diagram", label: "/kb diagram", description: "Generate a diagram on a topic.", template: "/kb diagram " },
  { id: "document", label: "/kb document", description: "Generate a standalone document on a topic.", template: "/kb document " },
  { id: "edit", label: "/kb edit", description: "Edit an existing diagram JSON.", template: "/kb edit " },
  { id: "guitar-tabs", label: "/kb guitar-tabs", description: "Generate a playable guitar tab.", template: "/kb guitar-tabs " },
  { id: "svg", label: "/kb svg", description: "Generate a music SVG visualization.", template: "/kb svg " },
  { id: "transform", label: "/kb transform", description: "Conform an existing file to skill format.", template: "/kb transform " },
  { id: "validate", label: "/kb validate", description: "Validate (and optionally auto-fix) a diagram JSON.", template: "/kb validate " },
];

/** Returns the filtered subset that should appear given the current composer value. */
export function filterSlashCommands(value: string): ReadonlyArray<SlashCommand> {
  if (!isSlashTrigger(value)) return [];
  const query = value.slice(1).toLowerCase(); // drop leading "/"
  if (query.length === 0) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) =>
    c.id.startsWith(query) || c.label.slice(1).toLowerCase().includes(query),
  );
}

export function isSlashTrigger(value: string): boolean {
  return /^\/[a-z-]*$/.test(value);
}
```

**Diff:** `src/app/knowledge_base/features/claude/slash/SlashPalette.tsx` (new)

```typescript
import { useEffect } from "react";
import type { SlashCommand } from "./slashCommands";

interface Props {
  commands: ReadonlyArray<SlashCommand>;
  highlight: number;
  onSelect: (command: SlashCommand) => void;
  onHighlightChange: (next: number) => void;
}

export function SlashPalette({ commands, highlight, onSelect, onHighlightChange }: Props) {
  // Auto-correct highlight if commands list shrinks beneath it.
  useEffect(() => {
    if (commands.length === 0) return;
    if (highlight >= commands.length) onHighlightChange(commands.length - 1);
  }, [commands.length, highlight, onHighlightChange]);

  if (commands.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-auto rounded-md border border-line bg-surface shadow-lg"
    >
      {commands.map((c, i) => (
        <li
          key={c.id}
          role="option"
          aria-selected={i === highlight}
          data-testid={`slash-option-${c.id}`}
          className={
            "flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-sm " +
            (i === highlight ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2")
          }
          onMouseEnter={() => onHighlightChange(i)}
          onMouseDown={(e) => {
            // mouseDown (not click) so the textarea doesn't lose focus first.
            e.preventDefault();
            onSelect(c);
          }}
        >
          <span className="font-mono">{c.label}</span>
          <span className="text-xs text-mute">{c.description}</span>
        </li>
      ))}
    </ul>
  );
}
```

**Diff:** `src/app/knowledge_base/features/claude/components/Composer.tsx` (full replacement — small file)

```typescript
import { useCallback, useMemo, useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { filterSlashCommands } from "../slash/slashCommands";
import { SlashPalette } from "../slash/SlashPalette";

interface ComposerProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  isStreaming: boolean;
}

export function Composer({ onSend, onInterrupt, isStreaming }: ComposerProps) {
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const slashMatches = useMemo(() => filterSlashCommands(value), [value]);
  const paletteOpen = slashMatches.length > 0;

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    setHighlight(0);
  }, [value, onSend]);

  const insertTemplate = useCallback((template: string) => {
    setValue(template);
    setHighlight(0);
    queueMicrotask(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(template.length, template.length);
    });
  }, []);

  const onKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertTemplate(slashMatches[highlight].template);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Dismiss by appending a space; pattern stops matching.
        setValue((v) => v + " ");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }, [paletteOpen, slashMatches, highlight, insertTemplate, submit]);

  return (
    <div className="relative">
      {paletteOpen && (
        <SlashPalette
          commands={slashMatches}
          highlight={highlight}
          onSelect={(c) => insertTemplate(c.template)}
          onHighlightChange={setHighlight}
        />
      )}
      <div className="flex items-end gap-2 border-t border-line bg-surface-2 p-2">
        <textarea
          ref={taRef}
          aria-label="Message Claude"
          aria-expanded={paletteOpen}
          className="flex-1 resize-none rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none placeholder:text-mute min-h-9 max-h-32 focus:border-accent"
          placeholder="Message Claude…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={1}
        />
        {isStreaming ? (
          <button
            type="button"
            aria-label="Stop"
            className="cursor-pointer rounded-md bg-red-500/80 p-2 text-white hover:bg-red-500"
            onClick={onInterrupt}
          >
            <Square className="size-4" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            className="cursor-pointer rounded-md bg-accent p-2 text-white hover:bg-accent/80 disabled:opacity-40"
            onClick={submit}
            disabled={!value.trim()}
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
```

**Tests:** `slashCommands.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { filterSlashCommands, SLASH_COMMANDS, isSlashTrigger } from "./slashCommands";

describe("isSlashTrigger", () => {
  it("SLASH-13.2-01: matches /, /kb-style strings", () => {
    expect(isSlashTrigger("/")).toBe(true);
    expect(isSlashTrigger("/d")).toBe(true);
    expect(isSlashTrigger("/diagram")).toBe(true);
    expect(isSlashTrigger("/guitar-tabs")).toBe(true);
  });
  it("SLASH-13.2-02: rejects whitespace, leading text, mixed case", () => {
    expect(isSlashTrigger("hello /")).toBe(false);
    expect(isSlashTrigger("/Diagram")).toBe(false);
    expect(isSlashTrigger("/d ")).toBe(false);
    expect(isSlashTrigger("")).toBe(false);
  });
});

describe("filterSlashCommands", () => {
  it("SLASH-13.2-03: returns all on bare slash", () => {
    expect(filterSlashCommands("/")).toEqual(SLASH_COMMANDS);
  });
  it("SLASH-13.2-04: prefix matches subcommand id", () => {
    expect(filterSlashCommands("/d").map((c) => c.id)).toEqual(["diagram", "document"]);
  });
  it("SLASH-13.2-05: filter survives label substring", () => {
    // user types /v -> only validate
    expect(filterSlashCommands("/v").map((c) => c.id)).toEqual(["validate"]);
  });
  it("SLASH-13.2-06: returns empty when off-pattern", () => {
    expect(filterSlashCommands("hello")).toEqual([]);
    expect(filterSlashCommands("/d ")).toEqual([]);
  });
});
```

**Tests:** `SlashPalette.test.tsx`

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SlashPalette } from "./SlashPalette";
import { SLASH_COMMANDS } from "./slashCommands";

describe("SlashPalette", () => {
  it("SLASH-13.2-07: renders one option per command", () => {
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={0} onSelect={vi.fn()} onHighlightChange={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("SLASH-13.2-08: applies highlight to the right option", () => {
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={2} onSelect={vi.fn()} onHighlightChange={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("SLASH-13.2-09: mouseDown triggers onSelect (not click)", () => {
    const onSelect = vi.fn();
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={0} onSelect={onSelect} onHighlightChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByTestId("slash-option-document"));
    expect(onSelect).toHaveBeenCalledWith(SLASH_COMMANDS.find((c) => c.id === "document"));
  });
});
```

Add a Composer integration test next to the existing `Composer.test.tsx`:

```typescript
// extend Composer.test.tsx
it("CHAT-12.3-XX: slash palette opens on '/', closes on space", async () => {
  // ...
});
it("CHAT-12.3-YY: ArrowDown + Enter inserts template", async () => {
  // ...
});
```

**Verification:** `npm run test:run -- slashCommands SlashPalette Composer` passes; full suite green.

---

## Task 6: Skills sheet shell + drawer header button

**Goal:** Add a "Skills" button to the `ClaudeChatDrawer` header. Clicking it opens an in-drawer overlay (`SkillsSheet`) listing all subcommands as cards. Sheet shell only — cards are stubs in this task; full forms in Task 7–8.

**Diff:** `src/app/knowledge_base/features/claude/skills/SkillsSheet.tsx` (new)

```typescript
import { ReactNode, useEffect } from "react";
import { SLASH_COMMANDS, SlashCommand } from "../slash/slashCommands";
import { SkillCard } from "./SkillCard";

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (command: SlashCommand, formattedText: string) => void;
}

export function SkillsSheet({ open, onClose, onRun }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Skills"
      className="absolute inset-0 z-40 flex flex-col bg-surface/95 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-medium text-ink">Skills</span>
        <button
          type="button"
          aria-label="Close skills sheet"
          className="cursor-pointer rounded px-2 py-1 text-xs text-mute hover:bg-surface-2"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div
        className="flex-1 overflow-auto p-3"
        // Stop propagation so clicking inside the cards doesn't dismiss the sheet.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SLASH_COMMANDS.map((c) => (
            <SkillCard key={c.id} command={c} onRun={(text) => onRun(c, text)} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Diff:** `src/app/knowledge_base/features/claude/skills/SkillCard.tsx` (new — stub for Task 6, real forms in Task 7–8)

```typescript
import { useState } from "react";
import type { SlashCommand } from "../slash/slashCommands";

interface Props {
  command: SlashCommand;
  /** Called with the fully-formatted slash command text. */
  onRun: (formattedText: string) => void;
}

export function SkillCard({ command, onRun }: Props) {
  const [arg, setArg] = useState("");

  // Subcommands that accept no argument run directly.
  const noArg = command.id === "validate";

  // Subcommands that need a vault file — Task 7 replaces this stub.
  const needsFilePicker = command.id === "edit" || command.id === "transform";

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (noArg) return onRun(command.template.trimEnd());
        if (!arg.trim()) return;
        onRun(`${command.template}${arg.trim()}`);
      }}
    >
      <span className="font-mono text-xs text-ink">{command.label}</span>
      <span className="text-xs text-mute">{command.description}</span>
      {!noArg && !needsFilePicker && (
        <input
          type="text"
          aria-label={`${command.label} argument`}
          className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          placeholder={
            command.id === "guitar-tabs" ? "song or riff name" : "topic"
          }
          value={arg}
          onChange={(e) => setArg(e.target.value)}
        />
      )}
      {needsFilePicker && (
        <span data-testid="placeholder-file-picker" className="text-xs italic text-mute">
          (file picker — wired in Task 7)
        </span>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          className="cursor-pointer rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent/80 disabled:opacity-40"
          disabled={!noArg && !needsFilePicker && !arg.trim()}
        >
          Run
        </button>
      </div>
    </form>
  );
}
```

**Diff:** `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx` (extend — add button + sheet state)

```typescript
import { useCallback, useEffect, useState } from "react";
import { useChat } from "./ChatContext";
// ... other imports
import { SkillsSheet } from "./skills/SkillsSheet";
// ...

const [skillsOpen, setSkillsOpen] = useState(false);
// ...

// Handler to format + send slash commands from the sheet:
const onRunSkill = useCallback((_command, formattedText) => {
  send(formattedText);
  setSkillsOpen(false);
}, [send]);

// Header bar — replace the existing one:
<div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
  <span className="text-mute">Claude</span>
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => setSkillsOpen(true)}
      className="cursor-pointer rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2 hover:bg-surface transition-colors"
      aria-label="Open Skills sheet"
    >
      Skills
    </button>
    {/* existing permission-mode toggle button */}
  </div>
</div>

// Above MessageList / Composer (siblings inside the drawer's flex column):
<SkillsSheet open={skillsOpen} onClose={() => setSkillsOpen(false)} onRun={onRunSkill} />
```

**Tests:** `SkillsSheet.test.tsx` and `SkillCard.test.tsx` cover open/close, Esc, backdrop click, form submission for arg-style cards, no-arg `/kb validate` direct submit. (Test IDs `SKILLS-13.3-01` … `SKILLS-13.3-XX`.)

**Verification:** `npm run test:run -- SkillsSheet SkillCard ClaudeChatDrawer` passes.

---

## Task 7: Vault file picker modal (`/kb edit`, `/kb transform`)

**Goal:** Replace the `placeholder-file-picker` stub in `SkillCard` with a real modal that lists vault-relative files filtered by extension.

**Confirmed during plan-writing:** `tauriBridge.list(dir)` (note: `list`, not `vaultList`) returns `VaultDirEntry[]` for **one directory level** only; entries are `{ name, kind: "file" | "directory", path }` where `path` is already vault-relative. The picker therefore walks the tree on the frontend via BFS — this is fine for typical vaults (<1k files); a server-side recursive command is not introduced because spec § 8 doesn't ask for one and IPC roundtrip overhead is small for tens of `list` calls.

**Diff:** `src/app/knowledge_base/features/claude/skills/VaultFilePickerModal.tsx` (new)

```typescript
import { useEffect, useState } from "react";
import { tauriBridge, type VaultDirEntry } from "../../../infrastructure/tauriBridge";

interface Props {
  open: boolean;
  /** File-extension filter (e.g. [".json"]). Empty = no filter. */
  extensions: string[];
  /** Vault-relative path string returned to caller, or null if dismissed. */
  onPick: (path: string | null) => void;
  title?: string;
}

/** Walks the vault directory tree breadth-first, returning vault-relative paths
 *  of files matching the optional extension filter. Skips dot-directories
 *  (e.g. `.archdesigner`, `.git`) to avoid surfacing config noise.
 */
async function listVaultFiles(extensions: string[]): Promise<string[]> {
  const queue: string[] = [""];
  const out: string[] = [];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: VaultDirEntry[];
    try {
      entries = await tauriBridge.list(dir);
    } catch {
      continue; // skip permission-denied / vanished dirs
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.kind === "directory") {
        queue.push(e.path);
        continue;
      }
      if (extensions.length === 0 || extensions.some((ext) => e.path.endsWith(ext))) {
        out.push(e.path);
      }
    }
  }
  return out;
}

export function VaultFilePickerModal({ open, extensions, onPick, title = "Pick a file" }: Props) {
  const [paths, setPaths] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPaths(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all = await listVaultFiles(extensions);
        if (cancelled) return;
        setPaths(all.sort());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      }
    })();
    return () => { cancelled = true; };
  }, [open, extensions]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onPick(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onPick]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onMouseDown={() => onPick(null)}
    >
      <div
        className="flex max-h-[60vh] w-full max-w-md flex-col rounded-md border border-line bg-surface shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-3 py-2 text-sm font-medium text-ink">{title}</div>
        <div className="flex-1 overflow-auto p-2">
          {error && <div className="text-xs text-red-500">{error}</div>}
          {paths === null && !error && <div className="p-4 text-xs text-mute">Loading…</div>}
          {paths?.length === 0 && (
            <div className="p-4 text-xs text-mute">No matching files in this vault.</div>
          )}
          <ul>
            {paths?.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="w-full cursor-pointer rounded px-2 py-1 text-left font-mono text-xs text-ink-2 hover:bg-surface-2"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(p);
                  }}
                >
                  {p}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            className="cursor-pointer rounded border border-line bg-surface-2 px-2 py-1 text-xs text-ink-2 hover:bg-surface"
            onClick={() => onPick(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

> **Note:** `tauriBridge.list(dir)` is the one-level helper from MVP-1a. The BFS in `listVaultFiles` above is the cheaper path; if a future vault grows past ~1k files, promote to a `vault_list_recursive` Rust command in a follow-up MVP.

**Diff:** `src/app/knowledge_base/features/claude/skills/SkillCard.tsx` (replace placeholder with real picker)

```typescript
// Add imports:
import { VaultFilePickerModal } from "./VaultFilePickerModal";

// Inside SkillCard (additions):
const [pickerOpen, setPickerOpen] = useState(false);
const extensions = command.id === "edit" ? [".json"] : [];

// Replace the file-picker placeholder block:
{needsFilePicker && (
  <div className="flex flex-col gap-1">
    <button
      type="button"
      className="rounded border border-line bg-surface px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
      onClick={() => setPickerOpen(true)}
    >
      {arg ? <span className="font-mono">{arg}</span> : "Pick a file…"}
    </button>
    <VaultFilePickerModal
      open={pickerOpen}
      extensions={extensions}
      title={command.id === "edit" ? "Pick a diagram (.json) to edit" : "Pick a file to transform"}
      onPick={(path) => {
        setPickerOpen(false);
        if (path) setArg(path);
      }}
    />
  </div>
)}
```

The form's submit button now requires `arg.trim()` for picker-cards too — adjust the existing `disabled` predicate to remove the `needsFilePicker` short-circuit (the picker stores the path in `arg`).

**Tests:** `VaultFilePickerModal.test.tsx`

```typescript
// Mock tauriBridge.vaultList. Cover:
// VAULTPICK-13.4-01: lists files matching extension filter
// VAULTPICK-13.4-02: shows "No matching files" empty state
// VAULTPICK-13.4-03: Cancel returns null via onPick
// VAULTPICK-13.4-04: Escape returns null via onPick
// VAULTPICK-13.4-05: backdrop click returns null
// VAULTPICK-13.4-06: clicking a file returns the path
// VAULTPICK-13.4-07: handles vaultList rejection with error display
```

**Verification:** `npm run test:run -- VaultFilePickerModal SkillCard` passes.

---

## Task 8: Wire SkillsSheet `onRun` → `useChat().send`

**Goal:** Glue task — make sure that selecting "Run" on a skill card actually fires `send(formattedText)` against the live chat session, opens the drawer if it's closed, and dismisses the sheet.

**Diff:** `src/app/knowledge_base/features/claude/ClaudeChatDrawer.tsx`

```typescript
const onRunSkill = useCallback((_command, formattedText) => {
  send(formattedText);
  setSkillsOpen(false);
}, [send]);
```

The drawer is already open when the sheet is open, so no `open()` call needed. The send fires through the existing `useClaudeSession` reducer, which queues `claude_send` against the runner.

**Tests:** `ClaudeChatDrawer.test.tsx` — extend with:

```typescript
// CHAT-12.X-Z: Skills sheet "Run" submits the formatted command via send()
```

mocking `useClaudeSession` and asserting the mock `send` receives the right text.

**Verification:** unit + manual smoke (Task 11).

---

## Task 9: `UninitializedVaultSplash` + `VaultSwitcher` "Initialize with full template"

**Goal:** Both surfaces (`UninitializedVaultSplash` shown when `vaultStatus === "uninitialized"`; `VaultSwitcher` dropdown's "Initialize Vault…" entry) gain a third option that runs the basic init AND auto-submits `/kb init` into the chat once the vault is initialized.

**Diff:** `src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx`

```typescript
interface Props {
  folderName: string;
  onInitialize: () => void;
  onInitializeWithTemplate: () => void; // new
  onPickDifferent: () => void;
}

export function UninitializedVaultSplash({
  folderName,
  onInitialize,
  onInitializeWithTemplate,
  onPickDifferent,
}: Props) {
  return (
    <div role="dialog" aria-modal="false" /* ... */>
      <div className="max-w-md text-center">
        <p className="text-lg font-medium text-ink">
          {folderName} is not yet a knowledge-base vault.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-3">
          <button
            type="button"
            className="rounded bg-accent px-4 py-2 text-white hover:opacity-90 transition-opacity"
            onClick={onInitialize}
          >
            Initialize this vault
          </button>
          <button
            type="button"
            className="rounded border border-accent px-4 py-2 text-accent hover:bg-surface-2 transition-colors"
            onClick={onInitializeWithTemplate}
          >
            Initialize with full template
          </button>
          <button
            type="button"
            className="rounded border border-line px-4 py-2 hover:bg-surface-2 transition-colors"
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

**Diff:** `src/app/knowledge_base/knowledgeBase.tsx` (or wherever the splash is rendered — verify path)

The handler:

```typescript
import { useChat } from "./features/claude/ChatContext";

// inside the component that owns the splash:
const { send, open: openDrawer } = useChat();

const onInitializeWithTemplate = useCallback(async () => {
  await onInitialize();         // existing basic init runs first
  openDrawer();
  // Wait one tick so the drawer mounts before sending.
  queueMicrotask(() => send("/kb init"));
}, [onInitialize, openDrawer, send]);
```

> **Confirmed during plan-writing:** `useDrawerState` already exposes `open: () => setOpen(true)` (alongside `close`, `toggle`, and `setHeight`), so `useChat().open()` is callable directly via the spread of the drawer slice into `ChatContext`. No new API needed.

**Diff:** `src/app/knowledge_base/shared/components/VaultSwitcher.tsx`

Add a third button in the "Initialize Vault…" sub-area, mirroring the splash. Reuses the same `onInitializeWithTemplate` callback (lift from the parent `Header.tsx` if necessary).

**Tests:**
- `UninitializedVaultSplash.test.tsx` — extend: `SHELL-1.17-06` "Initialize with full template" calls `onInitializeWithTemplate`.
- `knowledgeBase.initGuard.test.tsx` — extend: clicking the new button runs init then `send("/kb init")`.

**Verification:** unit + manual smoke (Task 11).

---

## Task 10: Features.md + test-cases sweep

**Goal:** Single commit with all docs changes for this MVP. No silent drift.

**Diff:** `Features.md` — extend §11 (Claude chat surface) with three new bullets:

```markdown
- **Skill bootstrap on launch** — On first chat-drawer open, `~/.claude/skills/knowledge-base/` is recursive-copied from the bundled resource if missing. Idempotent (re-launches no-op). One-shot toast appears on first install.
  - `src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.ts`
  - `src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx`
  - Backed by Rust `skill_status` + `skill_install_from_bundle` (`src-tauri/src/skill/`).
- **Slash-command palette** — Typing `/` in the composer opens an autocomplete dropdown of `/kb` subcommands (create / diagram / document / edit / guitar-tabs / svg / transform / validate). ↑↓ to nav, Enter / Tab to insert template.
  - `src/app/knowledge_base/features/claude/slash/{slashCommands.ts,SlashPalette.tsx}`
- **Skills sheet** — A "Skills" header button opens an in-drawer overlay listing every `/kb` subcommand as a card with a structured form. Vault-relative file picker for `/kb edit` and `/kb transform`.
  - `src/app/knowledge_base/features/claude/skills/{SkillsSheet,SkillCard,VaultFilePickerModal}.tsx`
- **"Initialize with full template" splash + dropdown action** — `UninitializedVaultSplash` and `VaultSwitcher` both gain a third entry that runs the basic init then auto-submits `/kb init` into the chat.
```

**Diff:** `test-cases/13-skills.md` (new) — Gherkin-lite, mirroring the rest of `test-cases/`. Cases cover:

```markdown
## SKILLS-13.1 Skill bootstrap

- SKILLS-13.1-01 ✅ Bootstrap is a no-op when ~/.claude/skills/knowledge-base/ already exists.
- SKILLS-13.1-02 ✅ Bootstrap copies bundled skill on first drawer open.
- SKILLS-13.1-03 ✅ Bootstrap fires only once per session (per-session guard).
- SKILLS-13.1-04 ✅ Bootstrap surfaces install errors without crashing the drawer.
- SKILLS-13.1-05 ✅ Toast appears on first install.
- SKILLS-13.1-06 ✅ Toast auto-dismisses after 3 seconds.
- SKILLS-13.1-07 ✅ Toast does not render when show=false.
- SKILLS-13.1-08 🟡 Bootstrap fires even when claude binary is missing (skill files are independent of CLI).

## SKILLS-13.2 Slash-command palette

- SLASH-13.2-01 ✅ "/" opens the palette with all subcommands listed.
- SLASH-13.2-02 ✅ Typing "/d" filters to diagram + document.
- SLASH-13.2-03 ✅ ↑↓ moves the highlight; wraps top↔bottom.
- SLASH-13.2-04 ✅ Enter inserts the highlighted template ("/kb <subcommand> ").
- SLASH-13.2-05 ✅ Tab inserts the highlighted template.
- SLASH-13.2-06 ✅ Esc dismisses without inserting (textarea retains the user's "/" text plus a space).
- SLASH-13.2-07 ✅ Adding a space to the value closes the palette.
- SLASH-13.2-08 ✅ Mouse-down on an option inserts the template (no focus-loss flicker).

## SKILLS-13.3 Skills sheet

- SKILLS-13.3-01 ✅ Header "Skills" button opens the sheet.
- SKILLS-13.3-02 ✅ Esc closes the sheet.
- SKILLS-13.3-03 ✅ Backdrop click closes the sheet.
- SKILLS-13.3-04 ✅ /kb validate card runs without an argument.
- SKILLS-13.3-05 ✅ Argument-style cards disable Run when input is empty.
- SKILLS-13.3-06 ✅ Submitting a card calls send() with the formatted text and closes the sheet.

## SKILLS-13.4 Vault file picker

- VAULTPICK-13.4-01 ✅ /kb edit picker filters to .json files.
- VAULTPICK-13.4-02 ✅ /kb transform picker shows all vault files.
- VAULTPICK-13.4-03 ✅ Cancel returns null.
- VAULTPICK-13.4-04 ✅ Esc returns null.
- VAULTPICK-13.4-05 ✅ Backdrop click returns null.
- VAULTPICK-13.4-06 ✅ Clicking a file fills the picker target with the vault-relative path.
- VAULTPICK-13.4-07 ✅ vaultList rejection surfaces an error.

## SKILLS-13.5 "Initialize with full template"

- SKILLS-13.5-01 ✅ Splash third button calls onInitializeWithTemplate.
- SKILLS-13.5-02 ✅ Action runs basic init then auto-submits /kb init in the chat (drawer auto-opens).
- SKILLS-13.5-03 ✅ VaultSwitcher dropdown's "Initialize Vault…" entry surfaces the same third action.
```

**Diff:** `test-cases/01-app-shell.md` — append a one-line cross-reference under the splash section: "Splash gains a third 'Initialize with full template' action — see SKILLS-13.5-01..03 in `test-cases/13-skills.md`." Same for `02-file-system.md`. (Existing SHELL-1.17-XX and SHELL-1.2-XX cases stay where they are; the cross-references are prose pointers, not new SHELL- IDs.)

**Diff:** `test-cases/README.md` — register `13-skills.md` in the table-of-contents.

**Verification:** `grep -r "SKILLS-13" test-cases/` lines up with case IDs.

---

## Task 11: Full local verification

**Goal:** Hit the full local-CI surface so the PR opens green.

```bash
nvm use
npm ci                          # match lockfile
npm run typecheck               # TS clean
npm run lint                    # ESLint clean
npm run test:run                # Vitest all green
npm run build                   # Next.js export
cd src-tauri && cargo test      # Rust tests
cd ..
npm run tauri:build             # Tauri debug bundle (matches CI's tauri-build job)
```

**Manual smoke (must complete before opening PR):**

1. Move / delete `~/.claude/skills/knowledge-base/` to a backup.
2. `npm run tauri dev` → open a vault → open chat drawer → confirm toast fires → confirm `~/.claude/skills/knowledge-base/SKILL.md` exists on disk.
3. Close + reopen the drawer → confirm toast does NOT fire (per-session guard).
4. Quit the app and re-launch → toast still does NOT fire (skill is now installed).
5. In composer: type `/` → confirm dropdown shows 8 subcommands → type `d` → confirm filters to diagram + document → ArrowDown to document → Enter → textarea reads `/kb document ` with cursor at end.
6. Type `tauri integration architecture` → Enter → confirm Claude streams a response that calls `Write` against the vault and a new file shows up in the explorer (relies on `FileWatcherContext` from MVP-1b).
7. Click "Skills" header button → confirm the sheet opens → click `/kb validate` Run → confirm it runs.
8. Click `/kb edit` Run → confirm picker opens, lists `.json` files only, picks one → re-click Run → confirm a `/kb edit <path>` text submits.
9. From `UninitializedVaultSplash` (use a fresh empty folder via vault-pick) → click "Initialize with full template" → confirm vault initializes, drawer opens, `/kb init` submits.
10. Press Esc inside the chat → drawer closes → app does NOT exit fullscreen (regression check from MVP-2 fix `527e919`).

**Restore** `~/.claude/skills/knowledge-base/` from your backup if your normal Claude Code workflow depended on it (the install copies the bundled version which may be older than your live skill).

---

## Task 12: Open the PR

```bash
git push -u origin feat/tauri-mvp3-skills-kb-invocation
gh pr create --title "feat(tauri): MVP-3 — skill bootstrap + /kb invocation surface" --body "$(cat <<'EOF'
## Summary

- Bundles `skills/knowledge-base/**` as a Tauri resource and copies it to `~/.claude/skills/knowledge-base/` on first chat-drawer open if missing (idempotent on subsequent launches).
- 2 new Rust commands (`skill_status`, `skill_install_from_bundle`) under `src-tauri/src/skill/`. Total: 22 commands.
- New `useSkillBootstrap` hook + `SkillInstallToast` component.
- Slash-command palette in `Composer` (autocomplete on `/`-prefix, hard-coded subcommand list, ↑↓ Enter / Tab nav).
- "Skills" sheet on the drawer header with one card per `/kb` subcommand. Argument cards take a text field; `/kb edit` and `/kb transform` open a `VaultFilePickerModal` scoped to file types.
- `UninitializedVaultSplash` + `VaultSwitcher` "Initialize Vault…" both gain a third "Initialize with full template" action that runs the basic init then auto-submits `/kb init`.
- MVP-1f cleanup: none for this MVP — was folded into MVP-2 (PR #154).

## Anti-goals (out of scope, per spec § 8.7)

- Custom-context attachments
- Skill drift detection / reconciliation
- Right-click context-menu integrations
- User-customizable slash commands
- Saved chat sessions / chat history
- Auto-update of an existing global skill
- Model-switcher UI (deferred per handoff)

## Plan-level decisions (pinned in the plan, lift-and-shift here for reviewers)

- Vault file picker is a new lightweight modal, not a `FileExplorer` reuse.
- Slash palette trigger: `/^\/[a-z-]*$/`.
- `useSkillBootstrap` is per-session, not per-mount.
- Skills sheet is an in-drawer overlay.
- Splash third action auto-submits `/kb init` (not paste-only).
- `dirs::home_dir()` resolves the install target — no hardcoded `~`.

## Test plan

- [ ] vitest green (added: `useSkillBootstrap`, `SkillInstallToast`, `slashCommands`, `SlashPalette`, `Composer` extensions, `SkillsSheet`, `SkillCard`, `VaultFilePickerModal`, `UninitializedVaultSplash` extensions)
- [ ] cargo test green (added: `skill::install` recursive-copy + idempotency, `skill::commands` path-resolution helpers)
- [ ] typecheck clean
- [ ] lint clean
- [ ] Next.js build clean
- [ ] Tauri debug bundle clean (CI `tauri-build` job)
- [ ] Manual smoke checklist (10 steps in plan Task 11) — bootstrap → palette → sheet → picker → splash third action → Esc-doesn't-exit-fullscreen regression

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary

The shape of MVP-3 is small Rust + heavier UI. Tasks 1–4 are the bootstrap half (~600 lines of code); Tasks 5–9 are the invocation half (~1100 lines). Tasks 10–12 are docs + verification + PR. Total touch surface: 4 new Rust files, 12 new TS/TSX files, 7 modified TS/TSX files, 1 config edit, 1 docs commit.

Per the project's conventions, this plan is dispatched via `superpowers:subagent-driven-development`. Each task is a unit-of-work shippable on its own (Task 1 is even shippable as a single commit if the manual smoke catches a bundle issue early). The seed commit on `feat/tauri-mvp3-skills-kb-invocation` carries the handoff doc update + this plan; subsequent commits land per-task.
