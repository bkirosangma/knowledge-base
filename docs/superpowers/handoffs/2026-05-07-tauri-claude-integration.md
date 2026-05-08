# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-09 (MVP-2 merged via PR #154 (`e42f0bf` on `main`) — Rust `src-tauri/src/claude/{mod,commands,runner,parser,crash,status,types}.rs` (7 files, 4 new commands: `claude_status`, `claude_send`, `claude_interrupt`, `claude_reset`); long-lived `claude -p` with stream-json IO, vault-as-cwd, `ANTHROPIC_API_KEY` actively scrubbed; subprocess respawns on vault switch or permission-mode change. Frontend `src/app/knowledge_base/features/claude/` (`ClaudeChatDrawer`, `ChatContext`, components `Composer` / `MessageList` / `MessageBubble` / `ToolUseBlock` / `PartialMessageStream` / `DrawerResizeHandle` / `SetupScreen`, hooks `useClaudeSession` / `useClaudeStatus` / `useClaudeUsage` / `useDrawerState`); footer split into `shell/footer/{ChatToggleButton,ClaudeStatusLine}.tsx`; `VaultSwitcher` gains permission-mode toggle. Settings additions: `claude.permissionMode` (`'acceptEdits' | 'default'`), `ui.claudeChat.height`. MVP-1f cleanup folded in: `vaultConfig.ts` + test deleted. Post-merge cleanup run; `feat/tauri-mvp3-skills-kb-invocation` cut from `main`. Next action: write the MVP-3 plan (skill bootstrap + `/kb` invocation surface) and dispatch via subagents.)

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
| **MVP-3** | Skill bootstrap + `/kb` invocation | _not yet written; due now on `feat/tauri-mvp3-skills-kb-invocation`_ | 🚧 Branch cut; plan pending. |
| **MVP-4** | Test infrastructure on the new shell | _not yet written; due after MVP-3 merges_ | ⏳ Not started. |
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

**Deferred / future MVPs:**

- **MVP-3 — skill bootstrap + `/kb` invocation (now active on `feat/tauri-mvp3-skills-kb-invocation`; plan pending):** `tauri.conf.json` `bundle.resources` adds `../skills/knowledge-base/**` so the version-controlled skill source ships with the app. New Rust commands `skill_status` + `skill_install_from_bundle` (install-if-missing into `~/.claude/skills/knowledge-base/`, resolve via `dirs::home_dir` + `app.path().resource_dir()`); new `useSkillBootstrap` hook fires once per session on `ClaudeChatDrawer` mount. Slash-command palette in `Composer.tsx` (autocomplete on `/`-prefix; hard-coded TS list of subcommands today: `create`, `diagram`, `document`, `edit`, `guitar-tabs`, `svg`, `transform`, `validate`). Skills sheet button on drawer header opens a sheet with one card per subcommand (form widgets per § 8.4: text fields + a vault-relative file picker for `/kb edit` and `/kb transform`). `UninitializedVaultSplash` grows a third action: "Initialize with full template" → after the basic init, programmatically auto-submits `/kb init` into the chat (drawer auto-opens). Spec: § 8.1–8.7. § 11.4 plan-level decisions: vault file picker UX for `/kb edit` / `/kb transform`; slash palette trigger / nav / dismiss precision; skill-bootstrap re-fire semantics (per-session vs per-mount); auto-submit vs paste for the splash third-action. Test cases bucket: new `test-cases/13-skills.md` (skill install + slash-palette + skills-sheet + init-with-template flow).
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
- **No model-switcher UI in MVP-2 (deferred 2026-05-09).** Per the user audit (2026-05-08) the chat surface lacks a runtime model-switcher (e.g. opus ↔ sonnet ↔ haiku). MVP-2 ships only what `claude -p` chooses at spawn (typically Sonnet 4.6). `useClaudeUsage` already reads the `message_start.model` field for status-line display, so the surface is half-built. **Decision:** defer to a follow-up after MVP-3 lands. Risk if rushed: model selection may interact with permission-mode and the `Runner::respawn` plumbing in non-obvious ways; better to land it as a focused micro-MVP with its own settings + UI design pass than fold into MVP-3's already-broad skill-bootstrap surface.

---

## Next Action

**MVP-2 merged via PR #154. Branch `feat/tauri-mvp3-skills-kb-invocation` is cut from `main`. Write the MVP-3 plan, then dispatch.**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout feat/tauri-mvp3-skills-kb-invocation
git log --oneline -5             # confirms branch is at main's tip plus this doc commit
ls docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md
ls docs/superpowers/plans/2026-05-08-tauri-mvp2-claude-chat-plan.md   # use as template shape
```

**Plan-writing brief (run via `superpowers:writing-plans`, paired with `ui-ux-pro-max` for the slash-command palette + skills sheet UX):**

- **Spec is prescriptive — read § 8.1 through § 8.7 of the design doc before writing.** Most decisions are pinned (bundle wiring, install-if-missing flow, slash palette, skills sheet, splash third action). The plan's job is sequencing + file-by-file diffs, not redesigning the surface.
- **Sequence the plan: bootstrap (§ 8.1–8.2) before invocation (§ 8.3–8.6).** They're decoupled; bootstrap is a small Rust + tiny hook slice that's easy to ship and verify on its own — same shape MVP-2's first half used.
- **Skill bootstrap (§ 8.1).** `tauri.conf.json` `bundle.resources` adds `../skills/knowledge-base/**` (Tauri's resource pipeline copies; no build-time copy step). Runtime install on app boot (after vault load, before first chat use): resolve target via `dirs::home_dir()` joined with `.claude/skills/knowledge-base/` (NOT a hardcoded `~`; spec § 5 cross-platform discipline); resolve bundled via `app.path().resource_dir()`. If `target/SKILL.md` is missing, recursive-copy bundled → target and emit a one-shot toast. If present, leave alone — no auto-update / drift detection in this MVP.
- **New Tauri commands (§ 8.2).** `skill_status(name) -> { installed, target_path, bundled_path }`; `skill_install_from_bundle(name) -> Result<()>`. Total: 22 commands (20 from MVP-2 + 2 new). Frontend `useSkillBootstrap()` hook fired once per session on `ClaudeChatDrawer` mount.
- **Slash-command palette (§ 8.3).** When `Composer` value starts with `/` and is a single-token-or-less, render an autocomplete dropdown of subcommands. List is **hard-coded in TS** for MVP-3 (today: `create`, `diagram`, `document`, `edit`, `guitar-tabs`, `svg`, `transform`, `validate` — `init` excluded per § 8.4 / § 8.6). Selecting an entry fills the composer with the template (e.g. `/kb document <topic>`); user fills the argument and submits. Keyboard nav: ↑↓ to navigate, Enter / Tab to insert, Esc to dismiss. Pin all of these in the plan precisely.
- **Skills sheet (§ 8.3).** "Skills" button on the drawer header opens a sheet (modal-ish, in-drawer or above-drawer — pin it in the plan) with one card per subcommand. Cards show short description + structured form (text fields per § 8.4; vault file picker for `/kb edit` and `/kb transform`). "Run" formats and submits the slash command into the chat.
- **§ 8.6 third action — `UninitializedVaultSplash`.** Add an "Initialize with full template" action alongside the existing basic-init action. Wiring is purely additive: it runs MVP-1c's basic init then programmatically opens the chat drawer and submits `/kb init`. Auto-submit by default — paste-only would force the user to find the send button and the whole point is one-click.
- **Plan-level decisions to pin explicitly (§ 11.4 invites these):**
  - Vault file picker UX for `/kb edit` and `/kb transform` — reuse `FileExplorer` tree as a modal vs build a new simple file-listing modal. **Default recommendation:** new lightweight modal scoped to the file types each subcommand accepts (`.json` for edit, any vault file for transform); reusing `FileExplorer` couples the chat surface to file-tree state in ways that complicate testing. Cite the alternative.
  - Slash palette trigger / nav / dismiss — exact rules above; pin them so reviewers don't relitigate.
  - `useSkillBootstrap` re-fire semantics — the drawer remounts on each open since it's closed-by-default per launch. **Default:** per-session guard via a module-level boolean, not per-mount RPC. Cheaper, idempotent, no flicker.
  - Splash third-action submission — auto-submit `/kb init`, not paste-only.
  - Skill-version drift — out of scope. Future MVP-3.x.
- **What if user types `/kb` before install completes?** Slash palette reads the hard-coded TS list per § 8.3, so it works regardless. Claude resolves the skill at execution time. Document this so reviewers don't ask why there's no install-gate on the palette.
- **Auth / claude binary preconditions.** MVP-2 already gates the chat on `claude_status`. MVP-3 inherits — the `useSkillBootstrap` hook should still fire even when the binary is missing (skill files install regardless), but the slash palette + skills sheet should be unreachable from the SetupScreen path.
- **Out of scope for MVP-3 (§ 8.7).** Custom-context attachments. Skill drift detection / one-click reconciliation. Right-click → /kb context menu integrations. User-customizable slash commands. Saved chat sessions. Don't drift any of these into the plan.
- **Verification surface.** Typecheck + lint + vitest + Next.js build + Tauri debug bundle (matches the `tauri-build` CI job). Manual smoke (must be in plan): launch app on a clean machine without `~/.claude/skills/knowledge-base/` → confirm install toast + directory contents on disk; second launch → confirm idempotent (no re-copy); type `/` in composer → confirm dropdown; pick an entry → confirm template fills + submits; open Skills sheet → run a card; from `UninitializedVaultSplash` → click "Initialize with full template" → confirm `/kb init` runs in the drawer.
- **Test pyramid.** Vitest for: slash-palette filter / keyboard-nav reducer; SkillsSheet form validation; `useSkillBootstrap` per-session guard; vault file picker modal. Rust unit tests for `skill_status` (presence/absence) + `skill_install_from_bundle` (recursive copy semantics, target-already-exists no-op). Real subprocess + bundled-resource integration coverage stays deferred to MVP-4.
- **Features.md / test-cases sweep.** Add Features.md § for skill bootstrap + slash palette + Skills sheet + `UninitializedVaultSplash` third action; § 7 persistence table needs no change (no new persisted state). New `test-cases/13-skills.md` (the existing `12-claude-chat.md` is for chat surface; mixing buckets blurs scope). Cases: skill installs on first launch, idempotent on second; binary missing still installs skill; slash palette filters / dismisses / inserts template; SkillsSheet card runs each subcommand; vault file picker shows correct file types; "Initialize with full template" path. `test-cases/01-app-shell.md` + `test-cases/02-file-system.md` may need touch-ups for the splash third action.

**After plan lands on this branch:**

1. Commit the plan + this handoff edit alongside the first task's seed commit (no doc-only PRs).
2. Dispatch via `superpowers:subagent-driven-development` — that's the default for this MVP per the project conventions.
3. On PR merge, run the **Post-merge cleanup protocol** and move to MVP-4 (test infrastructure on the new shell).
