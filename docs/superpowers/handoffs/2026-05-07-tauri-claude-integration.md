# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-08 (MVP-1e merged via PR #153 (`d2fa1b2` on `main`) — `historyPersistence` ported FSA → Tauri (`tauriBridge.readText` / `writeText`); `useHistoryFileSync` / `useDocumentHistory` / `useFileActions` / `DocumentView` lose their `FileSystemDirectoryHandle` parameters; `useBackgroundScanner` switches to path-only API; `useFileExplorer.dirHandleRef` stub + `seed` callback removed; `FirstRunHero` + `seedSampleVault` retired in favour of `NoVaultCTA`; final FSA helpers in `fileExplorerHelpers.ts` deleted; CI optimized — Tauri job no longer compiles `tauri-cli` from source (saves ~10 min). Post-merge cleanup run; `feat/tauri-mvp2-claude-chat` cut from `main`. Next action: write the MVP-2 plan (Claude subprocess integration + chat overlay + footer status line) and dispatch via subagents.)

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
| **MVP-2** | Claude subprocess integration | _not yet written; due now on `feat/tauri-mvp2-claude-chat`_ | 🚧 Branch cut; plan pending. |
| **MVP-3** | Skill bootstrap + `/kb` invocation | _not yet written; due after MVP-2 merges_ | ⏳ Not started. |
| **MVP-4** | Test infrastructure on the new shell | _not yet written; due after MVP-3 merges_ | ⏳ Not started. |
| **MVP-5** | Promote previously-blocked test cases | _not yet written; due after MVP-4 merges_ | ⏳ Not started. |

### Implementation

- **MVP-1a (merged via PR #149, `844a474` on `main`)** — Tauri 2 desktop shell hosting the existing Next.js app; Rust vault adapter (12 commands) under `src-tauri/src/vault/`; per-repo Tauri implementations under `src/app/knowledge_base/infrastructure/*RepoTauri.ts`; `RepositoryProvider` swapped from `rootHandle` → `vaultPath`; `useFileExplorer` swapped from `showDirectoryPicker` → `vault_pick`; FSA-availability gate removed from `knowledgeBase.tsx`; CI's Playwright `e2e` job parked until MVP-4.
- **MVP-1b (PR #150, on `feat/tauri-mvp1b-file-watcher`)** — Rust `notify`-debouncer-full watcher (200 ms coalesce); `vault_watch_start`/`vault_watch_stop` commands; `vault_change` events with `{ kind, path, oldPath? }` payload (POSIX-relative paths); `FileWatcherContext` body-swapped to event-driven; canonicalize symmetry between `vault_set_root` and `Watcher::start`.
- **MVP-1c (PR #151, on `feat/tauri-mvp1c-settings-vaults`)** — `tauri-plugin-store` integration (Rust `src-tauri/src/settings/{mod,store,commands}.rs` + TS `settingsStore.ts` facade); last-vault auto-restore on launch + MRU-5 recents; Header `VaultSwitcher` dropdown (Open Vault / Recents / Initialize Vault) with click-outside + Escape dismissal; `UninitializedVaultSplash` gating `KnowledgeBaseInner` until `vaultConfig.init` runs; `useFileExplorer.switchVault(path)` with dirty-confirm; watcher post-process rewrites `Modified` → `Deleted` when the file is gone (closes half of the macOS FSEvents kind-mapping gap).
- **MVP-1d (PR #152, on `feat/tauri-mvp1d-cleanup-bundle`)** — Task 1: `useFileActions.ts` migrated from `diagramRepo` (FSA) to `diagramRepoTauri`, quietly fixing a latent always-skipped lazy-doc-migration write. Task 2: 10 FSA `*Repo.ts` originals deleted (`documentRepo.ts`, `diagramRepo.ts`, `svgRepo.ts`, `tabRepo.ts`, `attachmentRepo.ts`, `attachmentLinksRepo.ts`, `linkIndexRepo.ts`, `vaultConfigRepo.ts`, `svgRefsRepo.ts`, `tabRefsRepo.ts`) + 4 associated tests. Task 3: `vaultIndexRepoFsa.ts` deleted (orphaned by `vaultIndexRepoTauri`). Task 4: `useOfflineCache.ts` deleted + callsite removed from `KnowledgeBaseInner` (Tauri ships native; no PWA cache path needed). Task 5: `useDirectoryHandle.ts` + `idbHandles.ts` deleted + associated tests (orphaned FSA persistence path). Task 6: `types/file-system.d.ts` deleted; TypeScript's built-in `lib.dom` covers the FSA types; local augmentations promoted to `src/types/`. Task 7: `next.config.ts` collapsed — `output: "export"` unconditional; `GITHUB_PAGES` env switch removed; static export permanent for Tauri's `frontendDist`. Task 8: `.github/workflows/pages.yml` deleted (GitHub Pages retired). Task 9: `macos-latest` `tauri-build` debug CI job added to `.github/workflows/ci.yml`. Tasks 10–12: `tauri.conf.json` finalized; full local-CI surface passed.
- **MVP-1e (PR #153, on `feat/tauri-mvp1e-history-substrate`)** — Task 1: `historyPersistence.ts` reads/writes ported from `FileSystemDirectoryHandle` to `tauriBridge.readText` / `writeText`; signature simplified to path-only; legacy-sidecar migration fallback preserved. Task 2: `useHistoryFileSync.initHistory` drops the FSA `dirHandle` parameter. Task 3: `useDocumentHistory.initHistory` + diagram cascade lose the FSA arm. Task 4: `DocumentView.tsx` and `useFileActions.ts` updated to the new path-only signature. Task 5: `useBackgroundScanner` ported from `dirHandleRef` to `tauriBridge.readText(filePath)`. Task 6: `dirHandleRef` stub + `seed` callback dropped from `useFileExplorer.ts` and `knowledgeBase.tsx`. Task 7: `FirstRunHero.tsx` + `seedSampleVault.ts` retired (broken in Tauri mode); replaced by `NoVaultCTA.tsx` (simple "Open Vault" button rendered when `vaultPath === null`). Task 8: dead FSA helpers in `fileExplorerHelpers.ts` deleted. Task 9: `Features.md` § 0 / § 1.5 / § 2.2 updated; `test-cases/01-app-shell.md`, `06-shared-hooks.md`, `10-first-run.md` retired `FIRSTRUN-10.1/10.2` cases and widened HIST-5.4-04. Task 10: full local verification (typecheck / lint / vitest / build / Tauri debug bundle / manual smoke) green. Post-merge: CI Tauri job optimized — dropped redundant `cargo install tauri-cli` step (saves ~10 min per push) since `@tauri-apps/cli` is already a dependency.

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

**Deferred / future MVPs:**

- **MVP-2 — Claude subprocess integration (now active on `feat/tauri-mvp2-claude-chat`; plan pending):** Rust `src-tauri/src/claude/{mod,runner,commands,events}.rs` (long-lived `claude -p` with `--input-format stream-json`); 4 new Tauri commands (`claude_status`, `claude_send`, `claude_interrupt`, `claude_reset`); `claude_event` event payloads. Frontend `src/app/knowledge_base/features/claude/` (`ClaudeChatDrawer.tsx` absolute-positioned overlay; `components/{DrawerResizeHandle,MessageList,MessageBubble,ToolUseBlock,PartialMessageStream,Composer}.tsx`; `hooks/{useClaudeSession,useClaudeStatus,useClaudeUsage,useDrawerState}.ts`; `types.ts`). `Footer.tsx` gains `ClaudeStatusLine` + chat toggle icon. Settings additions: `claude.permissionMode` (`acceptEdits` / `default`); `ui.claudeChat.height`. Spec: § 7.1–7.8. § 11.4 plan-level decisions: chat-toggle position in footer, hidden permission UI when `default` mode.
- **Footer** — `src/app/knowledge_base/shell/Footer.tsx` (gains `ClaudeStatusLine` + chat toggle icon in MVP-2).
- **Bundled skill source** — `<project>/skills/knowledge-base/` (resource-bundled by MVP-3 build wiring).
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
- **MVP-1f / cleanup — `vaultConfig.ts` (legacy FSA) + `renameSidecar` (dead code) discovered during MVP-1e Task 8 audit (2026-05-08).** `src/app/knowledge_base/features/document/utils/vaultConfig.ts` exposes 4 functions taking `FileSystemDirectoryHandle` parameters but has zero production callers — the live code path uses `vaultConfigRepoTauri.ts`. Two test files (`vaultConfig.test.ts`, `vaultConfigRepoTauri.test.ts`) reference it. `renameSidecar` in `fileExplorerHelpers.ts` likewise has zero production callers but is exercised by `useFileExplorer.helpers.test.ts`. Both are safe-to-delete after confirming the Tauri vault-config repo covers 100% of the old API surface. **Decision (2026-05-08):** fold into MVP-2's first cleanup commit (or split as MVP-1f if the chat work pushes against the deadline) — call out explicitly in the MVP-2 plan so it doesn't quietly smear into the chat surface.

---

## Next Action

**MVP-1e merged via PR #153. Branch `feat/tauri-mvp2-claude-chat` is cut from `main`. Write the MVP-2 plan, then dispatch.**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout feat/tauri-mvp2-claude-chat
git log --oneline -5             # confirms branch is at main's tip plus this doc commit
ls docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md
```

**Plan-writing brief (run via `superpowers:writing-plans`, paired with `ui-ux-pro-max` for the chat-overlay + footer-status surface):**

- **Spec is prescriptive — read § 7.1 through § 7.8 of the design doc before writing.** Most decisions are pinned (subprocess strategy, command surface, event payload shapes, drawer behaviour). The plan's job is sequencing + file-by-file diffs, not redesigning the surface.
- **Rust subprocess (§ 7.1 / 7.2).** New module `src-tauri/src/claude/{mod,runner,commands,events}.rs`. Long-lived `claude -p` with `--input-format stream-json` / `--output-format stream-json` / `--include-partial-messages` / `--include-hook-events` / `--cwd <vaultRoot>` / `--permission-mode acceptEdits`. `ANTHROPIC_API_KEY` actively `env_remove`'d. Stdout/stderr drain into Tokio tasks; unexpected exit → `claude_crashed` event; 3 crashes in 60 s breaks the loop. 4 commands: `claude_status`, `claude_send`, `claude_interrupt` (SIGINT, keep alive), `claude_reset` (kill + clear session).
- **Frontend chat overlay (§ 7.4).** New module `src/app/knowledge_base/features/claude/`:
  - `ClaudeChatDrawer.tsx` — absolute-positioned overlay anchored to `PaneManager` bottom edge. **No backdrop, not modal, no layout reflow** (panes behind stay full-size and interactive). Default 320 px; resizable via top edge handle; height persisted under `ui.claudeChat.height`. Closed by default per launch (open/closed state NOT persisted). Esc closes when chat focused; click-outside does not close.
  - Components: `DrawerResizeHandle`, `MessageList`, `MessageBubble`, `ToolUseBlock`, `PartialMessageStream`, `Composer`.
  - Hooks: `useClaudeSession` (subscribes to `claude_event`, accumulates turns, exposes `send` / `interrupt` / `reset`), `useClaudeStatus` (boots on mount + on first message), `useClaudeUsage` (rolling token + cost totals), `useDrawerState` (open/closed + height).
  - Mount point: bottom-anchored child of `PaneManager` (or `KnowledgeBaseInner` peer if z-index ergonomics demand it — pin in plan).
- **Footer (§ 7.5).** `Footer.tsx` gains right-aligned `ClaudeStatusLine` (`sonnet-4-6 · 12.4k in / 3.2k out · $0.04 · vault: <name>`). Idle / error states: `claude: idle · vault: <name>`, `claude: not installed`, `claude: api-key billing (not subscription)`. **Plan-level decision (§ 11.4): chat-toggle icon position.** Default recommendation in the plan: left side (mirroring how Claude Code's status line works), but cite the option clearly so the user can pick. When closed and a streaming response arrives, the icon pulses subtly.
- **Settings (§ 7.5 + § 7.7).** `tauri-plugin-store` already exists from MVP-1c. Add: `claude.permissionMode` (enum `'acceptEdits' | 'default'`), `ui.claudeChat.height` (number, default 320). `claude.permissionMode` UI gating: **plan-level decision (§ 11.4).** Default recommendation: hide the in-pane prompt UI when set to `default` since it isn't built; surface the unhandled-prompt state as a clear footer error; settings toggle still lets the user flip back to `acceptEdits`.
- **Auth posture (§ 7.3).** `claude_status()` runs on app boot and on first message. `binary: 'missing'` → setup screen with one-line install snippet (no in-app installer). `auth: 'api_key'` → yellow "billed per token" banner. Rust never sets `ANTHROPIC_API_KEY` and explicitly removes it.
- **Vault context (§ 7.6).** Two channels only: `--cwd <vaultRoot>` at spawn; user types whatever they want. **No app-side prompt injection / "current document" auto-stuffing in MVP-2** — that's MVP-3's "context attachments" surface.
- **Out of scope for MVP-2 (§ 7.8).** No `/kb` UI affordances (slash-typing works since skills auto-discover, but no buttons). No "attach this document/diagram to context". No saved chats / chat history. Don't accidentally drift any of these into the plan.
- **MVP-1f cleanup fold-in.** Per the **Open follow-up items** decision: include `vaultConfig.ts` legacy FSA module + `renameSidecar` dead code as the first cleanup commit on this branch (Task 0.5 or similar). Confirm `vaultConfigRepoTauri` covers 100% of the old API surface before deleting, and delete the two now-orphaned tests (`vaultConfig.test.ts`, `vaultConfigRepoTauri.test.ts` — confirm what's actually orphaned vs. still useful).
- **Verification surface.** Typecheck + lint + vitest + Next.js build + Tauri debug bundle (matches MVP-1d's `tauri-build` CI job). Manual smoke (must be in plan): launch app → open vault → send "hello" in chat → confirm stream-json events render → test interrupt mid-stream → close + reopen chat (state should NOT persist — closed by default per launch). Manual smoke for status line: idle state, after-first-turn token totals, vault-name updates on switch.
- **Test pyramid.** Vitest for Composer / MessageList / status-line formatter / `useClaudeSession` reducer. Rust unit tests for the stream-json parser + crash-recovery state machine. **Defer real subprocess integration tests to MVP-4** (uses `ClaudeRunner` trait + stub) — call this out so reviewers don't ask why there's no end-to-end claude test.
- **Features.md / test-cases sweep.** Add Features.md § for Claude chat surface + footer status line + settings additions. New test-cases bucket (likely `test-cases/12-claude-chat.md` or extend an existing file — check current numbering before naming) covering: chat overlay open/close, esc-to-close, drawer resize, message rendering (text + tool-use), interrupt, reset, crash recovery, status line formats, missing-binary state, api-key banner.

**After plan lands on this branch:**

1. Commit the plan + this handoff edit alongside the first task's seed commit (no doc-only PRs).
2. Dispatch via `superpowers:subagent-driven-development` — that's the default for this MVP per the project conventions.
3. On PR merge, run the **Post-merge cleanup protocol** and move to MVP-3 (skill bootstrap + `/kb` invocation).
