# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-09 (MVP-3 merged via PR #155 (`726904b` on `main`) and MVP-3.5 merged via PR #156 (`678a9d8` on `main`).

MVP-3 — Rust `src-tauri/src/skill/{mod,commands,bundle}.rs` (`skill_status`, `skill_install_from_bundle`); `tauri.conf.json` `bundle.resources` ships `skills/knowledge-base/**`; frontend `useSkillBootstrap`, `SkillInstallToast`, slash-command palette in `Composer`, Skills sheet (`SkillsSheet` + `SkillCard` + `VaultFilePicker`), `UninitializedVaultSplash` "Initialize with full template" third action. Total Tauri commands: 22.

MVP-3.5 — Embedded terminal as primary Claude surface. Rust `src-tauri/src/term/{mod,commands,pty}.rs` (`term_open`, `term_close`, `term_write`, `term_resize`; `term_event` payload streaming PTY bytes / exit / error) using `portable-pty 0.8.1` to spawn `zsh -i -l` with vault as cwd. New `src-tauri/src/env_bootstrap.rs` captures login-shell PATH at boot so `claude` resolves on first launch. Frontend `src/app/knowledge_base/features/terminal/` (`TerminalDrawer`, `TerminalSurface`, hooks `useTerminalSession` / `useTerminalResize`, `theme.ts`, `registerSurfaceCommand`) on top of `xterm.js 5.5.0` + `@xterm/addon-fit` + `@xterm/addon-web-links`. `ClaudeDrawer.tsx` is the new shell that switches between `TerminalDrawer` (default) and the parked `ClaudeChatDrawer` based on `SurfaceContext`. Settings: `claude.surface` (enum `'terminal' | 'chat'`, default `'terminal'`); `ui.claudeChat.height` renamed → `ui.claudeDrawer.height` with one-shot read-time migration. Footer's `ChatToggleButton` renamed → `DrawerToggleButton`. PTY persists across drawer hides (display:none, not unmount); `term_open` deferred until drawer first becomes visible to avoid 0×0 spawn (followup commit `ba506ea`); xterm DOM kept mounted across toggles to preserve scrollback (followup commit `5e652df`). Three parked-chat-UI bug fixes folded in (skill bootstrap dev fallback, install-error toast, "Claude is thinking" indicator) (commit `8ff0709`). Total Tauri commands: 26 (22 from MVP-3 + 4 term commands).

Post-merge cleanup run; `feat/tauri-mvp4-test-infra` cut from `main`. Next action: write the MVP-4 plan (`ClaudeRunner` trait + stub, `tauri-plugin-webdriver`, vault tempdir helpers, restore CI e2e job) and dispatch via subagents.)

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next task"*, *"resume tauri claude integration"*, or just points at this file:

1. Run the **Bootstrap** block below.
2. Skim **Where we are** to confirm which MVP is next — the **Next Action** section names it explicitly.
3. Check open PRs (`gh pr list --state open`). If a Tauri-Claude-Integration PR is open, ask the user whether to wait or stack a follow-up branch.
4. **If a previous MVP just merged**, run the **Post-merge cleanup protocol** below, *then* read the next MVP's plan and dispatch.
5. Read the spec and the next MVP's plan file.
6. **Branch first** (`git checkout -b feat/tauri-mvp<id>-<slug>` — see **Branch convention** below), then execute via subagents (`superpowers:subagent-driven-development`) — do not ask "subagent or inline?", that's the default.
7. Honour every rule in **Project conventions** (branch-per-task, main protected, no worktrees, etc.).
8. After the task / MVP merges, **update this doc** per the **Doc-update protocol** — same branch as the cleanup, same PR.

The user's intent when pointing here is: *"Pick up where we left off without re-explaining anything."* Don't ask clarifying questions if the spec + plan + this doc already answer them; just go.

---

## Post-merge cleanup protocol

Run this **immediately** after any Tauri-Claude-Integration PR merges. It keeps `main` clean and gets you onto the next MVP's branch with the doc already updated.

```bash
# 1. Sync main and confirm the merge landed.
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main
git pull --ff-only
git log --oneline -3                     # verify the merge commit is present

# 2. Delete the merged local branch.
#    Try `-d` first; if it refuses (squash-merge case), confirm the remote is
#    gone via `git branch -vv` showing `[origin/<branch>: gone]`, then use `-D`.
git branch -d feat/tauri-mvp<id>-<slug>   # exact name from the PR you just merged
# or, if the remote is verifiably gone (auto-deleted on merge):
#   git branch -D feat/tauri-mvp<id>-<slug>

# 3. Prune stale remote refs.
git remote prune origin

# 4. Identify the next MVP/sub-MVP per the Where-we-are table (or spec § 3) and create its branch.
git checkout -b feat/tauri-mvp<next-id>-<next-slug>

# 5. Update THIS doc on the new branch BEFORE the first task commit.
#    Touch the four sections listed in the Doc-update protocol below.
#    Commit the doc edit alongside the next MVP's first task — never as a doc-only PR.
```

**Rules to honour:**

- **Never** create a doc-only PR for handoff updates. They ride with the next MVP's first task (or the just-merged MVP's final commit if you had the foresight to bundle them).
- **Never** delete a branch that has unmerged commits. `git branch -d` (lowercase) refuses; `git branch -D` is destructive — don't use it without the user's explicit say-so.
- **Never** force-push to `main`. `main` is protected.
- If the post-merge cleanup turns up an unexpected PR or branch, **investigate before deleting**. The user may have in-flight work you don't know about.

If the PR introduced regressions surfaced by review (deferred items, latent bugs noted but not fixed), capture them in **Open follow-up items** below before starting the next MVP.

---

## Doc-update protocol (do this on every task / MVP close)

Before starting the next task, update this doc on the current branch (or fold into the next task's branch). Touch:

1. **Last updated** — bump the date and parenthetical to reflect what just shipped.
2. **Where we are** table — flip the just-shipped task/MVP to ✅ Merged with PR number.
3. **Open follow-up items** — add anything the just-merged review surfaced as deferred. Remove items resolved by the merge.
4. **Reference architecture** — add new files / hooks / components introduced. Remove deleted ones.
5. **Next Action** — replace the body with the next task's bootstrap: which plan section to read, key patterns to mirror, ship target.

If you skip the doc update, future sessions will resume from a stale map — that's the failure mode this protocol exists to prevent.

---

## Bootstrap (run first)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
git fetch origin
gh pr list --state open
git log --oneline -10
ls docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md
ls docs/superpowers/plans/2026-05-07-tauri-*.md 2>/dev/null
```

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the spec + per-MVP plan files (MVP-1a + MVP-1b + MVP-1c plans exist today — later MVPs get their plans written when their turn comes).

---

## Where we are

### Spec

| File | Status |
|---|---|
| `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` | ✅ Committed on `feat/tauri-claude-integration` (commits `bf2ebf9` + `bac342f`). |

### Plans (5 MVPs; per-MVP plans written just-in-time)

| MVP | Plan file | Status |
|---|---|---|
| **MVP-1a** | Tauri scaffold + Rust VFS adapter | `docs/superpowers/plans/2026-05-07-tauri-mvp1a-scaffold-plan.md` | ✅ Merged via PR #149 (`844a474` on `main`). |
| **MVP-1b** | File watching | `docs/superpowers/plans/2026-05-08-tauri-mvp1b-file-watcher-plan.md` | ✅ Merged via PR #150 (`03c2919` on `main`). |
| **MVP-1c** | Settings, vault management, basic init | `docs/superpowers/plans/2026-05-08-tauri-mvp1c-settings-vaults-plan.md` | ✅ Merged via PR #151 (`a74f847` on `main`). |
| **MVP-1d** | Cleanup, bundle, CI | `docs/superpowers/plans/2026-05-08-tauri-mvp1d-cleanup-bundle-plan.md` | ✅ Merged via PR #152 (`0f5e152` on `main`). |
| **MVP-1e** | History substrate retirement | `docs/superpowers/plans/2026-05-08-tauri-mvp1e-history-substrate-plan.md` | ✅ Merged via PR #153 (`d2fa1b2` on `main`). |
| **MVP-2** | Claude subprocess integration | `docs/superpowers/plans/2026-05-08-tauri-mvp2-claude-chat-plan.md` | ✅ Merged via PR #154 (`e42f0bf` on `main`). |
| **MVP-3** | Skill bootstrap + `/kb` invocation | `docs/superpowers/plans/2026-05-09-tauri-mvp3-skills-kb-invocation-plan.md` | ✅ Merged via PR #155 (`726904b` on `main`). |
| **MVP-3.5** | Embedded terminal as primary Claude surface | `docs/superpowers/plans/2026-05-09-tauri-mvp35-embedded-terminal-plan.md` (spec at `docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md`) | ✅ Merged via PR #156 (`678a9d8` on `main`). |
| **MVP-4** | Test infrastructure on the new shell | `docs/superpowers/plans/2026-05-09-tauri-mvp4-test-infra-plan.md` | 🚧 Branch cut; plan written; ready to dispatch. |
| **MVP-5** | Promote previously-blocked test cases | _not yet written; due after MVP-4 merges_ | ⏳ Not started. |

### Implementation

- **MVP-1a (merged via PR #149, `844a474` on `main`)** — Tauri 2 desktop shell hosting the existing Next.js app; Rust vault adapter (12 commands) under `src-tauri/src/vault/`; per-repo Tauri implementations under `src/app/knowledge_base/infrastructure/*RepoTauri.ts`; `RepositoryProvider` swapped from `rootHandle` → `vaultPath`; `useFileExplorer` swapped from `showDirectoryPicker` → `vault_pick`; FSA-availability gate removed from `knowledgeBase.tsx`; CI's Playwright `e2e` job parked until MVP-4.
- **MVP-1b (PR #150, on `feat/tauri-mvp1b-file-watcher`)** — Rust `notify`-debouncer-full watcher (200 ms coalesce); `vault_watch_start`/`vault_watch_stop` commands; `vault_change` events with `{ kind, path, oldPath? }` payload (POSIX-relative paths); `FileWatcherContext` body-swapped to event-driven; canonicalize symmetry between `vault_set_root` and `Watcher::start`.
- **MVP-1c (PR #151, on `feat/tauri-mvp1c-settings-vaults`)** — `tauri-plugin-store` integration (Rust `src-tauri/src/settings/{mod,store,commands}.rs` + TS `settingsStore.ts` facade); last-vault auto-restore on launch + MRU-5 recents; Header `VaultSwitcher` dropdown (Open Vault / Recents / Initialize Vault) with click-outside + Escape dismissal; `UninitializedVaultSplash` gating `KnowledgeBaseInner` until `vaultConfig.init` runs; `useFileExplorer.switchVault(path)` with dirty-confirm; watcher post-process rewrites `Modified` → `Deleted` when the file is gone (closes half of the macOS FSEvents kind-mapping gap).
- **MVP-1d (PR #152, on `feat/tauri-mvp1d-cleanup-bundle`)** — Task 1: `useFileActions.ts` migrated from `diagramRepo` (FSA) to `diagramRepoTauri`, quietly fixing a latent always-skipped lazy-doc-migration write. Task 2: 10 FSA `*Repo.ts` originals deleted (`documentRepo.ts`, `diagramRepo.ts`, `svgRepo.ts`, `tabRepo.ts`, `attachmentRepo.ts`, `attachmentLinksRepo.ts`, `linkIndexRepo.ts`, `vaultConfigRepo.ts`, `svgRefsRepo.ts`, `tabRefsRepo.ts`) + 4 associated tests. Task 3: `vaultIndexRepoFsa.ts` deleted (orphaned by `vaultIndexRepoTauri`). Task 4: `useOfflineCache.ts` deleted + callsite removed from `KnowledgeBaseInner` (Tauri ships native; no PWA cache path needed). Task 5: `useDirectoryHandle.ts` + `idbHandles.ts` deleted + associated tests (orphaned FSA persistence path). Task 6: `types/file-system.d.ts` deleted; TypeScript's built-in `lib.dom` covers the FSA types; local augmentations promoted to `src/types/`. Task 7: `next.config.ts` collapsed — `output: "export"` unconditional; `GITHUB_PAGES` env switch removed; static export permanent for Tauri's `frontendDist`. Task 8: `.github/workflows/pages.yml` deleted (GitHub Pages retired). Task 9: `macos-latest` `tauri-build` debug CI job added to `.github/workflows/ci.yml`. Tasks 10–12: `tauri.conf.json` finalized; full local-CI surface passed.
- **MVP-1e (PR #153, on `feat/tauri-mvp1e-history-substrate`)** — Task 1: `historyPersistence.ts` reads/writes ported from `FileSystemDirectoryHandle` to `tauriBridge.readText` / `writeText`; signature simplified to path-only; legacy-sidecar migration fallback preserved. Task 2: `useHistoryFileSync.initHistory` drops the FSA `dirHandle` parameter. Task 3: `useDocumentHistory.initHistory` + diagram cascade lose the FSA arm. Task 4: `DocumentView.tsx` and `useFileActions.ts` updated to the new path-only signature. Task 5: `useBackgroundScanner` ported from `dirHandleRef` to `tauriBridge.readText(filePath)`. Task 6: `dirHandleRef` stub + `seed` callback dropped from `useFileExplorer.ts` and `knowledgeBase.tsx`. Task 7: `FirstRunHero.tsx` + `seedSampleVault.ts` retired (broken in Tauri mode); replaced by `NoVaultCTA.tsx` (simple "Open Vault" button rendered when `vaultPath === null`). Task 8: dead FSA helpers in `fileExplorerHelpers.ts` deleted. Task 9: `Features.md` § 0 / § 1.5 / § 2.2 updated; `test-cases/01-app-shell.md`, `06-shared-hooks.md`, `10-first-run.md` retired `FIRSTRUN-10.1/10.2` cases and widened HIST-5.4-04. Task 10: full local verification (typecheck / lint / vitest / build / Tauri debug bundle / manual smoke) green. Post-merge: CI Tauri job optimized — dropped redundant `cargo install tauri-cli` step (saves ~10 min per push) since `@tauri-apps/cli` is already a dependency.
- **MVP-2 (PR #154, on `feat/tauri-mvp2-claude-chat`)** — Rust `src-tauri/src/claude/{mod,commands,runner,parser,crash,status,types}.rs` (7 modules; brief had projected 4) host a long-lived `claude -p` subprocess: `--input-format stream-json --output-format stream-json --include-partial-messages --include-hook-events --permission-mode <mode>`, `current_dir(<vaultRoot>)` (the spec's `--cwd` flag does not exist), `ANTHROPIC_API_KEY` actively `env_remove`'d. 4 new Tauri commands (`claude_status`, `claude_send`, `claude_interrupt`, `claude_reset`); `claude_event` payloads stream stream-json frames + lifecycle events (`claude_crashed`, `claude_status_changed`); 3 crashes in 60 s breaks the loop. `Runner::respawn` triggers on vault-switch and permission-mode change, so vault-scoped CLAUDE.md + graphify config get loaded in mid-session. Frontend module `src/app/knowledge_base/features/claude/`: `ClaudeChatDrawer.tsx` absolute-positioned overlay anchored to `PaneManager` bottom edge (no backdrop, no layout reflow); `ChatContext.tsx` provides session state to footer + drawer peers; components `Composer`, `MessageList`, `MessageBubble`, `ToolUseBlock`, `PartialMessageStream`, `DrawerResizeHandle`, plus `SetupScreen` (added beyond the 6-component brief — covers `binary: 'missing'` install snippet); hooks `useClaudeSession` / `useClaudeStatus` / `useClaudeUsage` / `useDrawerState`. Footer split: `src/app/knowledge_base/shell/footer/{ChatToggleButton,ClaudeStatusLine}.tsx`. `VaultSwitcher` dropdown gained a permission-mode toggle (Task 17). `tauri-plugin-store` settings extended: `claude.permissionMode` (enum `'acceptEdits' | 'default'`, default `'acceptEdits'`), `ui.claudeChat.height` (default 320). Capture fixture: `docs/superpowers/plans/.mvp2-stream-json-capture.jsonl`. Folded-in MVP-1f cleanup: `vaultConfig.ts` + `vaultConfig.test.ts` deleted (zero production callers; `vaultConfigRepoTauri` covers the surface). Post-merge polish landed on the same branch: drawer overflow / ESC scoping / glassy-bg readability fixes (commit `527e919`); chat-toggle button prominence (`944f31c`); MessageList instant-scroll-to-bottom on first mount, smooth-scroll for subsequent turns (`c43b51e`).

---

## Recommended order

This order is binding — see spec § 3.1 for the full rationale:

1. **MVP-1 first** (sub-MVPs 1a → 1b → 1c → 1d, in order — each is shippable on its own). The shell is the substrate everything else needs. It also pays back immediately by making vaults a path-typed string, which is what unblocks MVP-4's testing wins.
2. **MVP-2 next** (Claude subprocess integration). Bottom-overlay chat surface + footer status line + multi-turn conversation. Subprocess plumbing comes first because it's a shallower path through the IPC than skill invocation.
3. **MVP-3** (skill bootstrap + `/kb` invocation). Once the chat works, the skills sheet + slash-command palette is mostly UI on top of the same plumbing.
4. **MVP-4** (test infrastructure). `ClaudeRunner` trait + stub, `tauri-plugin-webdriver`, vault tempdir helpers. Built against the real surface so fixtures are honest.
5. **MVP-5 last** (promote FSA-picker-blocked test cases). A sustained promotion sweep across `test-cases/` — depends on MVP-4's pipeline being live.

Within MVP-1, sub-MVPs land in alphabetical order (1a → 1b → 1c → 1d). Skipping ahead is a foot-gun: 1b assumes 1a's repo abstractions, 1c builds on 1b's watcher, 1d retires the leftovers from 1c.

---

## Branch convention

| Phase | Branch |
|---|---|
| Spec + plans + this doc | `feat/tauri-claude-integration` |
| MVP-1a | `feat/tauri-mvp1a-scaffold` |
| MVP-1b | `feat/tauri-mvp1b-file-watcher` |
| MVP-1c | `feat/tauri-mvp1c-settings-vaults` |
| MVP-1d | `feat/tauri-mvp1d-cleanup-bundle` |
| MVP-1e | `feat/tauri-mvp1e-history-substrate` |
| MVP-2 | `feat/tauri-mvp2-claude-chat` |
| MVP-3 | `feat/tauri-mvp3-skills-kb-invocation` |
| MVP-4 | `feat/tauri-mvp4-test-infra` |
| MVP-5 | `feat/tauri-mvp5-test-promotion` |

Each MVP merges via PR (main is protected) before the next begins. The spec branch (`feat/tauri-claude-integration`) hosts only meta artifacts (spec, plans, this handoff doc); it never carries application code.

**Branch base for each MVP:**

- **MVP-1a** — base off `feat/tauri-claude-integration` so the spec + plan + handoff commits ride with the first implementation PR. See **Next Action** for the exact commands.
- **MVP-1b → MVP-5** — base off `main` (which by then contains the meta commits via MVP-1a's merge). Standard flow.

---

## Reference architecture

Map of files introduced or touched by the migration, by MVP. Update as code arrives.

**Landed (MVP-1a):**

- **Rust shell** — `src-tauri/Cargo.toml`, `src-tauri/src/{main,lib}.rs`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/icons/**`.
- **Vault adapter (Rust)** — `src-tauri/src/vault/{mod,commands,error,io,path}.rs`. 12 commands: `vault_pick`, `vault_set_root`, `vault_read_text`, `vault_write_text`, `vault_read_json`, `vault_write_json`, `vault_list`, `vault_rename`, `vault_delete`, `vault_exists`, `vault_read_bytes`, `vault_write_bytes`.
- **Typed bridge** — `src/app/knowledge_base/infrastructure/tauriBridge.ts` (translates `VaultError` → `FileSystemError`).
- **Per-repo Tauri implementations** — `src/app/knowledge_base/infrastructure/*RepoTauri.ts` (10 files: document, diagram, svg, tab, attachment, attachmentLinks, linkIndex, vaultConfig, svgRefs, tabRefs) plus `vaultIndexRepoTauri.ts` and the still-present `vaultIndexRepoFsa.ts` (latter deleted in MVP-1d).
- **Provider seam** — `src/app/knowledge_base/shell/RepositoryContext.tsx` (`rootHandle` → `vaultPath`).
- **Vault picker hook** — `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` (`vault_pick` instead of `showDirectoryPicker`).

**Landed (MVP-1b, PR #150):**

- **File watcher (Rust)** — `src-tauri/src/vault/watcher.rs` (new); `notify` + `notify-debouncer-full` deps in `src-tauri/Cargo.toml`; 2 new commands (`vault_watch_start`, `vault_watch_stop`); `vault_change` events with `{ kind, path, oldPath? }` payload (POSIX-relative paths). `WatcherState = Arc<Watcher>` registered in `src-tauri/src/main.rs` alongside existing `VaultState`. Total: 14 commands (12 from MVP-1a + 2 new).
- **File watcher (frontend)** — `src/app/knowledge_base/shared/context/FileWatcherContext.tsx` (body swap to `listen('vault_change', ...)`; same public API; new required prop `vaultPath: string | null`).
- **Bridge additions** — `src/app/knowledge_base/infrastructure/tauriBridge.ts` gains `watchStart(vaultPath)` / `watchStop()` wrappers using the existing `call()` helper.

**Landed (MVP-1c, PR #151):**

- **Settings module (Rust)** — `src-tauri/src/settings/{mod,store,commands}.rs` (new); `tauri-plugin-store` registered in `src-tauri/src/main.rs`; typed `Settings { last_path, recents, claude_chat_height }`; 2 new commands (`settings_get`, `settings_set`). Total: 16 commands (14 from MVP-1b + 2 new).
- **Settings facade (frontend)** — `src/app/knowledge_base/infrastructure/settingsStore.ts` (new) — `getSettings`, `setLastPath`, `clearLastPath`, `pushRecent` (dedup + MRU cap 5), `getRecents`, `setClaudeChatHeight` over `invoke()`.
- **Vault switcher** — `src/app/knowledge_base/shared/components/VaultSwitcher.tsx` (new) + `VaultSwitcher.test.tsx`; mounted in `src/app/knowledge_base/shared/components/Header.tsx`. Dropdown with **Open Vault** / **Recent Vaults** / **Initialize Vault**; click-outside + Escape dismissal.
- **Uninitialized-vault splash** — `src/app/knowledge_base/shared/components/UninitializedVaultSplash.tsx` (new) + `UninitializedVaultSplash.test.tsx`; rendered by `KnowledgeBaseInner` in place of the explorer + panes when `vaultStatus === "uninitialized"`. Init-guard wired in `src/app/knowledge_base/knowledgeBase.tsx`; tested by `knowledgeBase.initGuard.test.tsx`.
- **`useFileExplorer` boot + switchVault** — boot path replaced with `settingsStore.lastPath` (no more `localStorage` boot scope); new `switchVault(path)` API with `window.confirm` dirty-guard. Tested by `useFileExplorer.boot.test.tsx` and `useFileExplorer.switchVault.test.tsx`.
- **Watcher post-process (Rust)** — `src-tauri/src/vault/watcher.rs::postprocess_existence` rewrites `Modified` → `Deleted` when `tokio::fs::metadata(absolute_path)` shows the file is gone. Closes half of the macOS FSEvents kind-mapping gap (the rename-cookie half stays deferred to MVP-4).
- **Features.md / test-cases** — Features.md §0 deferred-line scoped down; §1.2 Header gains Vault switcher bullet; §1.5 Contexts gains the watcher post-process bullet; §2.2 gains the splash + path-persistence bullets; §7 persistence table gains the `tauri-plugin-store` row. Test cases SHELL-1.2-29..34 (switcher), SHELL-1.10-16 (post-process), SHELL-1.17-01..05 (splash), FS-2.10-01..06 (path persistence) added.

**Landed (MVP-1d, PR #152):**

- **Deleted (FSA layer)** — `src/app/knowledge_base/infrastructure/documentRepo.ts`, `diagramRepo.ts`, `svgRepo.ts`, `tabRepo.ts`, `attachmentRepo.ts`, `attachmentLinksRepo.ts`, `linkIndexRepo.ts`, `vaultConfigRepo.ts`, `svgRefsRepo.ts`, `tabRefsRepo.ts` (all 10 FSA originals); `vaultIndexRepoFsa.ts`; `shared/hooks/useDirectoryHandle.ts`; `shared/hooks/idbHandles.ts`; `shared/hooks/useOfflineCache.ts`; `types/file-system.d.ts`.
- **Modified** — `src/app/knowledge_base/shared/hooks/useFileActions.ts` (diagramRepo → diagramRepoTauri); `next.config.ts` (`output: "export"` unconditional, `GITHUB_PAGES` removed); `.github/workflows/ci.yml` (added `tauri-build` macOS job); `src-tauri/tauri.conf.json` (finalized).
- **Deleted (CI)** — `.github/workflows/pages.yml` (GitHub Pages retired).

**Landed (MVP-1e, PR #153):**

- **Modified (history substrate)** — `src/app/knowledge_base/shared/utils/historyPersistence.ts` (FSA → `tauriBridge.readText` / `writeText`; signature now path-only; legacy-sidecar migration fallback preserved); `shared/hooks/useHistoryFileSync.ts` (`initHistory(filePath)` — `dirHandle` parameter dropped); `shared/hooks/useDocumentHistory.ts` (FSA arm removed; diagram cascade updated); `shared/hooks/useBackgroundScanner.ts` (path-only via `tauriBridge.readText(filePath)`; `dirHandleRef` option dropped); `shared/hooks/useFileExplorer.ts` (`dirHandleRef` stub + `seed` callback removed); `shared/hooks/useFileActions.ts` + `features/document/DocumentView.tsx` (call sites updated); `knowledgeBase.tsx` (`dirHandleRef` plumbing removed).
- **Added** — `src/app/knowledge_base/shared/components/NoVaultCTA.tsx` (simple "Open Vault" surface rendered when `vaultPath === null`); `knowledge_base/knowledgeBase.noVault.test.tsx`.
- **Deleted** — `src/app/knowledge_base/shared/components/FirstRunHero.tsx` + test; `shared/components/seedSampleVault.ts` + test; `e2e/firstRunHero.spec.ts`; dead FSA helpers in `shared/hooks/fileExplorerHelpers.ts`.
- **CI** — `.github/workflows/ci.yml` Tauri job dropped redundant `cargo install tauri-cli` (already in `package.json`); duplicate typecheck/test step removed; saves ~10 min per push.

**Landed (MVP-2, PR #154):**

- **Claude subprocess (Rust)** — `src-tauri/src/claude/{mod,commands,runner,parser,crash,status,types}.rs` (7 modules). `Runner` wraps a long-lived `claude -p` child with `--input-format stream-json --output-format stream-json --include-partial-messages --include-hook-events --permission-mode <mode>` and `current_dir(<vaultRoot>)` (the spec's `--cwd` flag does not exist on the `claude` CLI). `ANTHROPIC_API_KEY` actively `env_remove`'d at spawn. Stdout/stderr drained into Tokio tasks; stream-json frames re-emitted as `claude_event`. Crash detector breaks after 3 crashes in 60 s. `Runner::respawn` is invoked on vault switch and permission-mode change so the new subprocess inherits the new `current_dir` / mode. 4 new Tauri commands (`claude_status`, `claude_send`, `claude_interrupt` (SIGINT, keep alive), `claude_reset` (kill + clear session — also clears `vault_root` to prevent stale-cwd respawn)). Total: 20 commands (16 from MVP-1c + 4 new).
- **Claude chat overlay (frontend)** — `src/app/knowledge_base/features/claude/`: `ClaudeChatDrawer.tsx` (absolute-positioned overlay anchored to `PaneManager` bottom edge — no backdrop, no layout reflow, default 320 px, resizable, height persisted under `ui.claudeChat.height`, closed-by-default per launch, Esc scoped to the drawer); `ChatContext.tsx` (provides chat session state to footer-status / toggle-button peers above the drawer). Components: `Composer.tsx`, `MessageList.tsx`, `MessageBubble.tsx`, `ToolUseBlock.tsx`, `PartialMessageStream.tsx`, `DrawerResizeHandle.tsx`, `SetupScreen.tsx` (added beyond the 6-component brief — covers `binary: 'missing'` install state). Hooks: `useClaudeSession.ts` (subscribes to `claude_event`, accumulates turns, exposes `send` / `interrupt` / `reset`), `useClaudeStatus.ts`, `useClaudeUsage.ts` (rolling input + output token totals + cost from `message_start.model`), `useDrawerState.ts` (open/closed + height + persisted height bridge). `types.ts` shared message-shape types.
- **Footer** — `src/app/knowledge_base/shell/Footer.tsx` modified; new `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx` (prominent pill button with three visual states; pulses subtly while a stream lands while drawer is closed) + `src/app/knowledge_base/shell/footer/ClaudeStatusLine.tsx` (`<model> · <in>k in / <out>k out · $<cost> · vault: <name>` with idle / not-installed / api-key-billing variants and a crashed-state retry banner).
- **Settings (Rust + frontend)** — `src-tauri/src/settings/store.rs` typed `Settings` extended with `claude_permission_mode`. `settingsStore.ts` adds `getClaudePermissionMode` / `setClaudePermissionMode` and a `claude.permissionMode` change listener (used by Runner respawn). `ui.claudeChat.height` accessor added.
- **VaultSwitcher** — `src/app/knowledge_base/shared/components/VaultSwitcher.tsx` dropdown gains a permission-mode toggle row (`acceptEdits` ↔ `default`). Tested in `VaultSwitcher.test.tsx` (11 cases).
- **PaneManager** — `src/app/knowledge_base/shell/PaneManager.tsx` modified to host the absolute-positioned drawer as a bottom-anchored overlay child without affecting the panes' interactivity.
- **knowledgeBase.tsx** — wraps the inner shell in `<ChatProvider>` so `Footer` and `ClaudeChatDrawer` share session state.
- **Bridge additions** — `src/app/knowledge_base/infrastructure/tauriBridge.ts` gains `claudeStatus` / `claudeSend` / `claudeInterrupt` / `claudeReset` wrappers + a `claude_event` listener helper.
- **Capture fixture** — `docs/superpowers/plans/.mvp2-stream-json-capture.jsonl` (recorded stream-json frames used as a parser-unit-test fixture).
- **Features.md / test-cases** — Features.md § 11.x Claude chat surface section added (9 subsections); § 7 persistence table now lists `claudeChatHeight` + `claudePermissionMode`. New `test-cases/12-claude-chat.md` (~ ten cases). `test-cases/01-app-shell.md` widened to mention the chat toggle. `test-cases/README.md` registers § 12.
- **Deleted (MVP-1f cleanup folded in)** — `src/app/knowledge_base/features/document/utils/vaultConfig.ts` + `vaultConfig.test.ts` (zero production callers; `vaultConfigRepoTauri` covers the surface).

**Landed (MVP-3, PR #155):**

- **Skill bundle pipeline** — `src-tauri/tauri.conf.json` `bundle.resources` now includes `../skills/knowledge-base/**` so the version-controlled skill source rides inside the app bundle (`Resources/skills/knowledge-base/...`). The bidirectional sync rule between `~/.claude/skills/knowledge-base/` and `<project>/skills/knowledge-base/` (per global CLAUDE.md) keeps the bundled snapshot honest.
- **Skill module (Rust)** — `src-tauri/src/skill/{mod,commands,bundle}.rs` (new). 2 new commands (`skill_status(name)` → `{ installed, target_path, bundled_path }`; `skill_install_from_bundle(name)`). Resolution: target via `dirs::home_dir().join(".claude/skills/<name>")`; bundled via `app.path().resource_dir()` joined with `skills/<name>`. Recursive copy semantics: target-already-exists is a no-op (no auto-update / drift detection in this MVP). Dev-mode fallback (`#[cfg(debug_assertions)]`): if bundled path resolves under `target/debug/`, fall back to repo-relative `<workspace>/skills/<name>` so `npm run tauri dev` works without `cargo tauri build`. Total: 22 commands (20 from MVP-2 + 2 new).
- **Skill bootstrap (frontend)** — `src/app/knowledge_base/features/claude/hooks/useSkillBootstrap.ts` (new) fires once per session on `ClaudeChatDrawer` mount; module-level boolean guard prevents per-mount re-fire. Emits `SkillInstallToast` (`src/app/knowledge_base/features/claude/components/SkillInstallToast.tsx`) on first install (`skill_status.installed === false` → `skill_install_from_bundle`); error variant covers install failures (e.g. read-only `~/.claude`).
- **Slash-command palette** — `Composer.tsx` extended: when value starts with `/` and is a single-token-or-less, render an autocomplete dropdown of subcommands. Hard-coded TS list (today: `create`, `diagram`, `document`, `edit`, `guitar-tabs`, `svg`, `transform`, `validate`; `init` excluded — only invokable via the splash third-action). Selecting an entry fills the composer with the template (e.g. `/kb document <topic>`). Keyboard nav: ↑↓ navigate, Enter / Tab insert, Esc dismiss.
- **Skills sheet** — drawer-header "Skills" button opens a sheet with one card per subcommand. Cards show short description + structured form (text fields per spec § 8.4). `/kb edit` and `/kb transform` cards include a vault file picker (lightweight modal scoped to file types each subcommand accepts: `.json` for edit, any vault file for transform). "Run" formats and submits the slash command into the chat.
- **`UninitializedVaultSplash` third action** — "Initialize with full template" alongside the existing basic-init action; runs MVP-1c's basic init, programmatically opens the chat drawer, auto-submits `/kb init` (auto-submit, not paste-only).
- **Bridge additions** — `src/app/knowledge_base/infrastructure/tauriBridge.ts` gains `skillStatus` / `skillInstallFromBundle` wrappers.
- **Features.md / test-cases** — Features.md § for skill bootstrap + slash palette + Skills sheet + splash third-action added; § 7 persistence table unchanged (no new persisted state in MVP-3). New `test-cases/13-skills.md`.

**Landed (MVP-3.5, PR #156):**

- **Terminal module (Rust)** — `src-tauri/src/term/{mod,commands,pty.rs}` (3 modules). 4 new commands (`term_open(rows, cols, vault_root)`, `term_close()`, `term_write(bytes)`, `term_resize(rows, cols)`). Uses `portable-pty 0.8.1` to spawn `zsh -i -l` with `current_dir(<vault_root>)`. PTY reader task drains stdout into `term_event` payloads (`{ kind: "data" | "exit" | "error", bytes? | code? | message? }`). `restart_in_new_vault` keeps the PTY alive across vault switches (`shell_escape` rewrites the cwd via `cd <escaped_path>`). `term_open` is idempotent on already-open PTYs (returns early). Total: 26 commands (22 from MVP-3 + 4 new).
- **Login-shell PATH bootstrap (Rust)** — `src-tauri/src/env_bootstrap.rs` (new) — at app boot, spawns `zsh -i -l -c 'echo $PATH'` once and propagates the captured PATH into `std::env::set_var` so `Command::new("claude")` resolves the user's homebrew / asdf / NVM-shimmed binary even when Tauri inherits a sparse Finder-launched env. Wired in `src-tauri/src/main.rs`.
- **xterm.js dependencies** — `package.json` adds `@xterm/xterm 5.5.0`, `@xterm/addon-fit 0.10.0`, `@xterm/addon-web-links 0.11.0`.
- **Terminal feature module** — `src/app/knowledge_base/features/terminal/`: `TerminalDrawer.tsx` (drawer container; uses `next/dynamic` with `ssr: false` for `TerminalSurface`); `TerminalSurface.tsx` (xterm.js host, `initOnce` guard so xterm only mounts once even across drawer toggles, FitAddon + WebLinksAddon registered); `theme.ts` (dark / light xterm themes); `registerSurfaceCommand.ts` (palette / shortcut hook to switch surfaces); hooks `useTerminalSession.ts` (subscribes to `term_event`; defers `term_open` until drawer first becomes visible; gates on `isOpen` from `ChatContext`; calls `fitAddon.fit()` immediately before `term_open` so PTY spawns at the drawer's actual cols/rows) and `useTerminalResize.ts` (ResizeObserver → `term_resize`).
- **Surface dispatcher** — `src/app/knowledge_base/features/claude/ClaudeDrawer.tsx` (new) is the new shell that switches between `TerminalDrawer` (default) and the parked `ClaudeChatDrawer` based on `SurfaceContext.tsx` (new). The chat surface is **parked** (kept code-complete and in tests) but reachable only via the surface picker.
- **Settings (Rust + frontend)** — typed `Settings` extended with `claude_surface: ClaudeSurface` (enum `'terminal' | 'chat'`, default `'terminal'`) and `ui_claude_drawer_height` (replaces `ui_claude_chat_height` with one-shot read-time migration: `getClaudeDrawerHeight()` reads new key, falls back to old once if unset, then writes forward; old key removed on next save). `settingsStore.ts` adds `getClaudeSurface` / `setClaudeSurface` and the renamed drawer-height accessors.
- **Footer rename** — `src/app/knowledge_base/shell/footer/ChatToggleButton.tsx` → `DrawerToggleButton.tsx` (rename + label update; tests updated).
- **PTY persistence across drawer toggles** — `TerminalDrawer` uses `display:none` instead of unmount when closed (followup commit `5e652df`); `term_open` is deferred until drawer first becomes visible (followup commit `ba506ea`) to prevent 0×0 spawn → narrow-COLUMNS scrollback baking.
- **Three parked-chat-UI bug fixes** — folded into the same MVP (commit `8ff0709`): skill bootstrap dev-mode fallback (matches the §5.1 pattern in the spec), error-variant install toast, "Claude is thinking…" indicator (`MessageList` shows a typing indicator while `useClaudeStatus` reports busy).
- **Features.md / test-cases** — Features.md § 11.y (terminal surface) added; new `test-cases/14-terminal.md` (~ten cases). `test-cases/01-app-shell.md` widened for the surface picker; `test-cases/12-claude-chat.md` annotated to mark the chat surface as parked.

**Deferred / future MVPs:**

- **MVP-4 — test infrastructure on the new shell (now active on `feat/tauri-mvp4-test-infra`; plan pending):** `ClaudeRunner` trait + `StubRunner` (env-var `KB_CLAUDE_MODE=real|stub`), `tauri-plugin-webdriver` (dev-only, behind `#[cfg(debug_assertions)]`), vault tempdir helpers (Rust `TempVault::fresh / from_fixture` and TS `makeTempVault` over a `make_temp_vault` debug command), Vitest+Tauri-bridge-contract layer for `*RepoTauri.test.ts`, restored CI e2e job on `macos-latest`, capture-fixture CLI for stream-json transcripts, first-wave proof-set of newly-enabled e2e scenarios (vault picker, splash → init, doc create on disk, rename propagation, `/kb document` chained MVP-2+MVP-3 flow). Spec: § 9.1–9.8 (chat-side) plus PTY integration tests promoted from MVP-3.5 § 6 (defer-to-MVP-4 box). Plan-level decisions to pin: capture-fixture CLI ergonomics (interactive vs one-shot); whether terminal e2e can lean on `term_event` stream replay or needs a real PTY; whether the parked chat surface stays under a single e2e smoke or gets dropped from the proof-set. Test cases bucket: existing buckets get `🟡` / `🧪` flips; no new bucket.
- **Test cases** — `test-cases/01-app-shell.md`, `02-file-system.md`, `04-document.md`, `05-links-and-graph.md`, `06-shared-hooks.md`, `06-svg-editor.md`, `07-persistence.md`, `11-tabs.md` (MVP-5 sweep targets).

---

## Project conventions

These are non-negotiable; don't relitigate them mid-MVP.

- **`main` is protected.** Direct push blocked. Always create a PR.
- **Branch-per-MVP-task.** `git checkout -b feat/tauri-mvp<id>-<slug>` BEFORE the first commit; never commit on `main`.
- **No git worktrees.** Per the user's MEMORY.md preference. Work on feature branches directly.
- **No doc-only PRs.** Handoff edits + Features.md updates + test-cases/ status flips ride with the feature PR they belong to.
- **`Features.md` and `test-cases/` updates ride with the source code change** in the same PR. No silent drift; this is enforced by `CLAUDE.md`.
- **Match `.nvmrc` before `npm ci`.** `nvm use` first; the worktree-baseline preference (MEMORY.md) exists because newer npm produces lockfiles older CI npm rejects.
- **Don't skip hooks.** No `--no-verify` on commits, no `-c commit.gpgsign=false`. If a pre-commit hook fails, fix the root cause and create a NEW commit (never amend a hook-failed commit).
- **POSIX-relative paths only across IPC** (spec § 6.5). Frontend never sees absolute paths.
- **Cross-platform discipline** (spec § 5). Code is macOS-only-shipping but Linux-port-clean: `tauri::path::*` or `dirs` for OS paths, `Command::new("claude")` for binary lookup, no macOS-only Tauri plugins.
- **Subagent-driven execution is the default** (added 2026-05-08 per user). When picking up the next MVP from this doc, dispatch via `superpowers:subagent-driven-development` immediately — do not pause to ask "subagent or inline?". The user will redirect if a different approach is wanted.
- **`git branch -D` is permitted when the remote branch is gone** (added 2026-05-08 per user). Pre-condition: `git fetch --prune origin` (or the auto-prune that runs during `git pull`) shows the remote branch deleted (`[origin/<branch>: gone]` in `git branch -vv`, or absent from `git ls-remote origin <branch>`). When that's true, the local branch is a leftover of a squash-merge and `git branch -D feat/tauri-mvp<id>-<slug>` is safe and pre-authorized. Otherwise (remote still exists, no PR merged, or remote unverifiable) the original "no `-D` without explicit say-so" rule still stands.

---

## Open follow-up items

- **macOS FSEvents kind-mapping gap — `Modified`→`Deleted` half RESOLVED in MVP-1c (Task 10); rename-cookie half deferred to MVP-4 (updated 2026-05-08).** During MVP-1b Task 4 we discovered that `notify 6.1.1` + macOS FSEvents emits the "wrong" `ChangeKind` for several user actions: `tokio::fs::write` on an existing file → `Created` instead of `Modified`; `remove_file` → `Modified(Data)` instead of `Deleted`; `rename(a, b)` → only `Created(b.md)` with no source event. Real product impact: subscribers that try to re-read on `Modified` may hit `NotFound` for a deleted file, and tree-view consumers that reference the old rename source will see stale entries until the next full rescan. MVP-1b's integration tests therefore assert "any event for the affected path" rather than the exact kind. **Status:** ✅ MVP-1c Task 10 landed the post-process for the `Modified`→`Deleted` half (`postprocess_existence` in `src-tauri/src/vault/watcher.rs` runs `tokio::fs::metadata` on each `Modified` event in the worker and re-emits as `Deleted` when the file is gone). 🚧 The rename-cookie half — investigating `notify` config that exposes FSEvents rename cookies, or otherwise stitching rename source/target — stays deferred to MVP-4's cross-platform CI. Production `Watcher::start` already primes the FileIdMap cache via `cache().add_root()` (landed in MVP-1b) to enable rename stitching for pre-existing files on macOS/Windows. A `#[cfg(target_os = "linux")]` companion test that strictly asserts the paired-rename shape with `old_path == "a.md"` is also deferred to MVP-4.
- **CI `e2e` job disabled in MVP-1a (2026-05-08).** Repository layer now routes through `@tauri-apps/api/core`'s `invoke()`, but the Playwright suite still boots `npm run dev` in vanilla Chromium with the FSA-shaped `e2e/fixtures/fsMock.ts`, so every spec throws `TypeError: Cannot read properties of undefined (reading 'invoke')`. The `e2e` block in `.github/workflows/ci.yml` is replaced with a comment pointing at MVP-4. **MVP-4 must restore this job** when it wires `tauri-plugin-webdriver` (spec § 9) — port the original steps from `.github/workflows/ci.yml` at commit `ad26115` (the last commit on `feat/tauri-mvp1a-scaffold` before the disable).
- **MVP-1a Tasks 27/28 re-scoped (2026-05-08).** Discovered during execution that ~30 consumer callsites bypass the typed `Repository` abstraction by reading `useFileExplorer.dirHandleRef.current` directly. Re-shaped Task 27 → 27a (new `VaultIndexRepository`) + 27b (hook migration to typed repos), and Task 28 → 28a (knowledgeBase.tsx consumers) + 28b (DiagramOverlays / GraphifyView / linkManager / useOfflineCache) + 28c (final FSA-prop cleanup pass). Spec § 11.5 has the rationale; plan tasks 27a/b/28a/b/c are the canonical execution path. Original Task 27/28 sections in the plan are preserved as historical reference but not executed.
- **MVP-1e — RESOLVED in PR #153 (`d2fa1b2`, 2026-05-08).** `historyPersistence` ported FSA → Tauri; sidecar undo across restarts preserved. `FirstRunHero` + `seedSampleVault` deleted; `NoVaultCTA` covers the no-vault state alongside MVP-1c's `UninitializedVaultSplash` (which still gates the *uninitialized* case after a vault is selected).
- **MVP-1f cleanup folded into MVP-2 — RESOLVED in PR #154 (`e42f0bf`, 2026-05-09).** `vaultConfig.ts` + `vaultConfig.test.ts` deleted as part of the MVP-2 seed. `renameSidecar` in `fileExplorerHelpers.ts` similarly cleaned up.
- **No model-switcher UI in MVP-2 (deferred 2026-05-09; superseded by MVP-3.5 chat-surface park).** Per the user audit (2026-05-08) the chat surface lacked a runtime model-switcher. **Updated status (2026-05-09):** the chat surface itself was parked in MVP-3.5 in favour of the embedded terminal. The terminal surface ships the user's full `claude` CLI (including `/model`), so a custom model-switcher UI is no longer required for parity — it would only re-emerge if/when the chat surface is un-parked. **Decision:** keep deferred indefinitely; revisit only if chat surface usage data argues otherwise.
- **MVP-3 — RESOLVED in PR #155 (`726904b`, 2026-05-09).** Skill bootstrap (`skill_status` / `skill_install_from_bundle`), slash-command palette in `Composer`, Skills sheet, `UninitializedVaultSplash` "Initialize with full template" third action all shipped. Bundled `skills/knowledge-base/` source tracked alongside the live `~/.claude/skills/knowledge-base/` per the bidirectional-sync rule in global CLAUDE.md.
- **MVP-3.5 — RESOLVED in PR #156 (`678a9d8`, 2026-05-09).** Embedded terminal surface (`TerminalDrawer` + `TerminalSurface` + `useTerminalSession` + `useTerminalResize`) + Rust `term` module + login-shell PATH bootstrap shipped. PTY-cols-on-first-show + scrollback-across-toggles fixed in followup commits (`ba506ea` + `5e652df`). Parked-chat-UI fixes (`8ff0709`) folded in.
- **macOS FSEvents rename-cookie half — still deferred to MVP-4.** Restated here for visibility: the `Modified`→`Deleted` half is closed, but rename source/target stitching needs cross-platform CI to be honest. MVP-4 plan must include either the `notify` config that exposes FSEvents rename cookies *or* the `#[cfg(target_os = "linux")]` companion test that strictly asserts the paired-rename shape.
- **PTY integration tests (deferred from MVP-3.5 § 6 to MVP-4).** Real-PTY tests need `tauri-plugin-webdriver` for the host-side spawn — same plumbing constraint as the chat-side subprocess tests. Fold into MVP-4's pyramid alongside the `StubRunner` integration tests; the parser-side already has unit coverage.
- **Live-serialize for terminal scrollback persistence (deferred from MVP-3.5 § 4.9 / § 9 follow-ups).** xterm.js has a serialize addon that snapshots the buffer to a string for persistence across drawer-hides at higher fidelity than the current `display:none` mount-preservation approach. Defer until a user complaint shows the current behaviour is insufficient — the `display:none` strategy is honest about what it preserves (the live buffer) and what it doesn't (a persisted snapshot across full app restarts). Out of scope for MVP-4.
- **Right-click → copy / paste + search-in-scrollback in terminal (MVP-3.5 § 9 follow-ups).** xterm.js has the primitives (`xterm-search` addon, context menu hooks). Defer — quality-of-life wins, not blockers. Out of scope for MVP-4.

---

## Next Action

**MVP-3 merged via PR #155 and MVP-3.5 merged via PR #156. Branch `feat/tauri-mvp4-test-infra` is cut from `main`. Write the MVP-4 plan, then dispatch.**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout feat/tauri-mvp4-test-infra
git log --oneline -5             # confirms branch is at main's tip plus this doc commit
ls docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md       # MVP-4 lives in § 9
ls docs/superpowers/specs/2026-05-09-tauri-mvp35-embedded-terminal-design.md  # § 6 + § 9 list deferred PTY tests
ls docs/superpowers/plans/2026-05-09-tauri-mvp35-embedded-terminal-plan.md    # use as template shape
```

**Plan-writing brief (run via `superpowers:writing-plans`):**

> **Scope decision to make BEFORE drafting (advisor pushback, 2026-05-09):**
>
> 1. **Does the `ClaudeRunner` trait + `StubRunner` (spec § 9.1) stay in MVP-4 scope, or defer?** Chat surface is parked post-MVP-3.5; the only test that *needs* the trait is the chained `/kb document` e2e in spec § 9.7. The parked chat surface already has Vitest coverage via mocked `claudeEvent`. **Default recommendation:** drop trait extraction from MVP-4 — replace the chained-flow e2e with a Vitest+bridge integration test that drives `useClaudeSession` with a mocked event stream; defer trait + StubRunner until chat un-parks or the first complaint about chat regressions in CI. **If you keep it:** argue the recurring value (not just spec adherence). Pin the decision at the top of the plan.
> 2. **MVP-4 monolithic, or split into MVP-4a + MVP-4b?** With the trait deferred, the work splits cleanly: **4a** = Rust integration tier (real-PTY tests, vault tempdir helpers Rust-side, macOS FSEvents rename-cookie test) — fully testable via `cargo test`, no Playwright. **4b** = `tauri-plugin-webdriver` + Playwright config + CI e2e restoration + first-wave proof set. They have independent risk surfaces. The handoff "Recommended order" says monolithic; size + risk argue for split. **Default recommendation:** split, mirror MVP-3 / MVP-3.5 pattern. Pin the decision.
> 3. **Webdriver fallback (spec § 9.3).** If `tauri-plugin-webdriver` regresses on macOS, fallback is Playwright against `next dev` in `tauri dev` mode (covers ~90% of UI behaviour). Plan must include this as an explicit branch, not a footnote — subagents shouldn't get stuck if the plugin breaks.
>
> **Recon already done (2026-05-09):**
> - `*RepoTauri.test.ts` migration sweep is **complete** (10 files exist under `src/app/knowledge_base/infrastructure/`). Step 4 in the original brief was stale; the work that remains is *adding* contract coverage for the new MVP-3 / MVP-3.5 bridge wrappers (`skillStatus`, `skillInstallFromBundle`, `termOpen`, `termClose`, `termWrite`, `termResize`) — not migrating existing tests.
> - `src-tauri/tests/watcher_integration.rs` already exists and serves as the integration-test template. Add new files alongside it; don't invent a new directory shape.
> - `tauri-plugin-webdriver 0.2.1` (Feb 2026) requires `tauri ^2.10.0`; the project resolves `tauri 2.11.1` — compatible. Latest version on crates.io is alive.
> - CI restoration commit `ad26115` ("docs(kb): note Tauri shell + Rust VFS in Features.md and test-cases ceiling") is reachable; that commit's `.github/workflows/ci.yml` carries the original e2e steps.

- **Spec is prescriptive — read § 9.1 through § 9.8 of the parent design doc before writing.** Most chat-side decisions are pinned (`ClaudeRunner` trait + stub, vault tempdir helpers, `tauri-plugin-webdriver`, test pyramid, CI shape, first-wave proof set, out-of-scope list). The plan's job is sequencing + file-by-file diffs, not redesigning. Also read MVP-3.5 § 6 (the "Defer to MVP-4" box that promotes real-PTY integration tests).
- **Sequence the plan: trait + stub first, infra second, e2e last.** Suggested sequencing:
  1. `ClaudeRunner` trait extraction in `src-tauri/src/claude/runner.rs` — refactor existing `Runner` into `RealRunner` impl behind the trait, no behaviour change. Pure refactor pass with zero-diff Vitest + cargo test surface.
  2. `StubRunner` impl + fixture loader. Env-var `KB_CLAUDE_MODE=real|stub` selects which the Tauri command layer holds. Default `real` so production stays untouched.
  3. Vault tempdir helpers — Rust `TempVault::fresh / from_fixture / write / read` in `src-tauri/tests/common/vault.rs`; TS `makeTempVault` in `e2e/helpers/tempVault.ts` over a new `#[cfg(debug_assertions)]` `make_temp_vault` command. Both flavours share `tests/fixtures/vaults/<name>/`.
  4. Vitest Tauri-bridge contract coverage — *not* a migration sweep (already done in MVP-1 → MVP-3.5). Add new contract tests for the MVP-3 / MVP-3.5 bridge wrappers that lack one: `skillStatus`, `skillInstallFromBundle`, `termOpen`, `termClose`, `termWrite`, `termResize`, plus any settings accessors added in MVP-3.5 (`getClaudeSurface`, `getClaudeDrawerHeight` migration). Spot-check existing `*RepoTauri.test.ts` for staleness while you're at it.
  5. `tauri-plugin-webdriver` wiring — dev-only dependency behind `#[cfg(debug_assertions)]` per spec § 9.3. `playwright.config.ts` gains a `webdriver` project that boots `cargo tauri dev` with `KB_CLAUDE_MODE=stub` (or unset, if trait deferred), waits for the WebDriver port at `localhost:4444`, runs the e2e specs. **Fallback branch:** if `tauri-plugin-webdriver 0.2.1+` fails to load on the project's `tauri 2.11.1`, fall back to Playwright against `next dev` in `tauri dev` mode (spec § 9.3); document the loss (no real webview) and proceed.
  6. Capture-fixture CLI — `cargo run --bin capture-fixture -- --name <slug> "<prompt>"`. Pin in the plan whether this is interactive (one prompt at a time, REPL-style) or one-shot (CLI args only); spec § 11 invites this decision. Default recommendation: one-shot, scriptable, idempotent — cheaper to retry.
  7. Restore CI e2e job — port the steps from `.github/workflows/ci.yml` at commit `ad26115` (last commit on `feat/tauri-mvp1a-scaffold` before the disable) onto the existing `macos-latest` `tauri-build` job. Single sequential macOS job per spec § 9.6: `nvm use && npm ci` → typecheck + lint → `cd src-tauri && cargo fmt --check && cargo clippy && cargo test` → `npm run test:run` → `cargo tauri build --debug` → `npm run test:e2e`.
  8. First-wave e2e proof set per § 9.7 — at least one e2e per category to prove the pipeline: vault picker → app loads with fresh tempdir; uninitialized splash → click Initialize → app loads; create document → file appears on disk (assert via Node `fs` against tempdir, not just UI state); rename file → wiki-links propagate (`propagateRename`); `/kb document "Topic"` from chat → file appears (uses captured stub fixture; chains MVP-2 + MVP-3). Add at least one terminal e2e if achievable — see plan-level decision below.
  9. macOS FSEvents rename-cookie test — promoted from the open-follow-ups list. Either a `notify` config that exposes FSEvents rename cookies, or a `#[cfg(target_os = "linux")]` companion test that strictly asserts the paired-rename shape.
- **Plan-level decisions to pin explicitly:**
  - **Capture-fixture CLI shape** — default recommendation: one-shot CLI (`cargo run --bin capture-fixture -- --name doc-topic-x "/kb document Topic X"`); cite interactive REPL alternative as deferred.
  - **Terminal coverage tier — Rust integration, not Playwright e2e.** A `term_event` stream replay through `useTerminalSession` is a component test wearing e2e clothing; if MVP-4's whole point is honest fixtures against the real surface, real-PTY tests in `src-tauri/tests/term_pty.rs` (`cargo test`) earn more than a stub-replay Playwright spec. **Default recommendation:** Rust integration tier owns terminal coverage; Playwright proof set covers chat / vault / explorer flows only. If you keep terminal in Playwright too, frame it as a smoke test (drawer opens, `term_open` fires, no PTY assertion) — don't double-count.
  - **Parked chat surface in the proof set** — keep one chat-flow e2e (the `/kb document` flow above already covers it) but don't expand the chat-surface coverage further. The terminal is the primary surface; the parked chat surface keeps its existing Vitest coverage.
  - **`StubRunner` fixture matching strategy** — default: pre-load by name. Tests opt-in via `setStubFixture("doc-topic-x")`; tests that don't opt-in get a default `"Hi, I'm a stub"` response so accidental real-network calls are impossible.
  - **`make_temp_vault` security** — only registered behind `#[cfg(debug_assertions)]`. Production bundles do not expose it. Same gate as `tauri-plugin-webdriver`.
- **`KB_CLAUDE_MODE` propagation.** Default `real` in `tauri dev` and `tauri build` unless explicitly overridden. CI's e2e step sets `KB_CLAUDE_MODE=stub`. Document the env-var contract in the plan plus a `tauri-plugin-process` (or equivalent) read at boot.
- **Rust trait migration risk.** `ClaudeRunner` is a small surface (4 methods) but `RealRunner` currently leans on Tokio task ownership for the stdout/stderr drain. The plan must show the boundary cleanly — a `Box<dyn ClaudeRunner>` held in `tauri::State` with the existing `Mutex` discipline. Spec § 9.1 sketches the trait; verify the lifetimes work for `EventStream` (likely a `tokio::sync::mpsc::Receiver` wrapper) before committing the plan.
- **Out of scope for MVP-4 (§ 9.8).** Visual regression / screenshot diffs. Cross-platform e2e (macOS-only ships). Performance benchmarks. Continuous fixture refresh. Don't drift any of these in.
- **Verification surface.** All eight items in the spec § 9.6 CI flow must be runnable locally too: typecheck + lint + cargo fmt + cargo clippy + cargo test + Vitest + Tauri debug build + Playwright via webdriver. Manual smoke (must be in plan): boot `npm run tauri dev` with `KB_CLAUDE_MODE=stub`, confirm chat surface holds the canned conversation; boot with `KB_CLAUDE_MODE=real`, confirm zero behaviour change vs. main; run the Playwright `webdriver` project locally, confirm the proof-set passes.
- **Test pyramid restated.** Rust unit (`#[cfg(test)]` in `src-tauri/src/**`); Rust integration (`src-tauri/tests/*.rs`, hits the full Tauri command surface against `StubRunner`); Vitest unit/component (existing); Vitest Tauri-bridge contract (new layer for `*RepoTauri.test.ts`); Playwright e2e (full app via webdriver, tempdir vault, `StubRunner`). PTY tests live at the Rust integration tier — closest to the plumbing.
- **Features.md / test-cases sweep.** No new product feature shipped here, so Features.md changes are limited to retiring `?` markers that the new pipeline confirms. `test-cases/`: flip status markers (❌ → 🟡 / 🧪) for every case the proof-set or the Vitest contract layer covers. New e2e specs reference cases by ID per `test-cases/` rules.

**After plan lands on this branch:**

1. Commit the plan + this handoff edit alongside the first task's seed commit (no doc-only PRs).
2. Dispatch via `superpowers:subagent-driven-development` — that's the default for this MVP per the project conventions.
3. On PR merge, run the **Post-merge cleanup protocol** and move to MVP-5 (promote previously-blocked test cases).
