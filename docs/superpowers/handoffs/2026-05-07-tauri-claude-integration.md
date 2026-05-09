# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-09 (MVP-3 merged via PR #155 (`726904b` on `main`), MVP-3.5 merged via PR #156 (`678a9d8` on `main`), MVP-4 merged via PR #157 (`072f807` on `main`), and MVP-4.x merged via PR #158 (`6903077` on `main`).

MVP-3 — Rust `src-tauri/src/skill/{mod,commands,bundle}.rs` (`skill_status`, `skill_install_from_bundle`); `tauri.conf.json` `bundle.resources` ships `skills/knowledge-base/**`; frontend `useSkillBootstrap`, `SkillInstallToast`, slash-command palette in `Composer`, Skills sheet (`SkillsSheet` + `SkillCard` + `VaultFilePicker`), `UninitializedVaultSplash` "Initialize with full template" third action. Total Tauri commands: 22.

MVP-3.5 — Embedded terminal as primary Claude surface. Rust `src-tauri/src/term/{mod,commands,pty}.rs` (`term_open`, `term_close`, `term_write`, `term_resize`; `term_event` payload streaming PTY bytes / exit / error) using `portable-pty 0.8.1` to spawn `zsh -i -l` with vault as cwd. New `src-tauri/src/env_bootstrap.rs` captures login-shell PATH at boot so `claude` resolves on first launch. Frontend `src/app/knowledge_base/features/terminal/` (`TerminalDrawer`, `TerminalSurface`, hooks `useTerminalSession` / `useTerminalResize`, `theme.ts`, `registerSurfaceCommand`) on top of `xterm.js 5.5.0` + `@xterm/addon-fit` + `@xterm/addon-web-links`. `ClaudeDrawer.tsx` is the new shell that switches between `TerminalDrawer` (default) and the parked `ClaudeChatDrawer` based on `SurfaceContext`. Settings: `claude.surface` (enum `'terminal' | 'chat'`, default `'terminal'`); `ui.claudeChat.height` renamed → `ui.claudeDrawer.height` with one-shot read-time migration. Footer's `ChatToggleButton` renamed → `DrawerToggleButton`. PTY persists across drawer hides (display:none, not unmount); `term_open` deferred until drawer first becomes visible to avoid 0×0 spawn (followup commit `ba506ea`); xterm DOM kept mounted across toggles to preserve scrollback (followup commit `5e652df`). Three parked-chat-UI bug fixes folded in (skill bootstrap dev fallback, install-error toast, "Claude is thinking" indicator) (commit `8ff0709`). Total Tauri commands: 26 (22 from MVP-3 + 4 term commands).

MVP-4 — Test infrastructure shipped on the new shell. `ClaudeRunner` trait + `StubRunner` (env-var `KB_CLAUDE_MODE=real|stub`); vault tempdir helpers (`src-tauri/src/test_support/{mod,vault.rs}` + `make_temp_vault` debug command + TS `e2e/helpers/tempVault.ts::makeTempVault`); Vitest+Tauri-bridge contract layer (`src/app/knowledge_base/infrastructure/tauriBridge.test.ts` covers all 12 wrapper signatures); capture-fixture loader (`features/claude/hooks/__fixtures__/loadCaptureSlice.ts`) + chained reducer test (`useClaudeSession.kbDocument.test.tsx`); Rust integration tests for terminal PTY + vault-switch + watcher rename-paired (`src-tauri/tests/{term_pty_integration,term_vault_switch,watcher_rename_paired}.rs`); CI split into 5 parallel jobs (`Typecheck · Lint · Unit tests` / `Production build` / `Rust fmt · clippy · test (Ubuntu)` / `Tauri debug bundle (macOS)` — e2e dropped per MVP-4.x carve-out). 4 proof-set Playwright specs (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`) ride in the repo as artifacts, currently `test.skip(currentBackend() === "nextdev")`-gated (the gate goes away when MVP-4.x ships). Total Tauri commands unchanged at 26 (debug-only `make_temp_vault` not counted in production surface).

MVP-4.x — Real Playwright e2e in CI (no manual smoke). Architecture: chromium + `next dev` (`:3000`) + a Rust `test_server` axum binary (`:1421`), with `window.__TAURI__.invoke` shimmed to fetch over HTTP via Playwright's `addInitScript`. New: `src-tauri/src/bin/test_server.rs` + `src-tauri/src/test_server/{mod,router,dispatch,events}.rs` (~400 LOC); 27 production `#[tauri::command]`s refactored to the `impl_<name>` inner-impl pattern so the test_server re-uses bodies; `e2e/helpers/tauriShim.ts` (`installShim` / `addInitScript`); `scripts/run-e2e.sh` (boots both processes, traps SIGTERM); `playwright.config.ts` collapsed to single chromium project (`KB_E2E_BACKEND` switch dropped); `.github/workflows/ci.yml` `e2e` job restored on Ubuntu chromium-only (no GTK / WebKitGTK / xvfb / dbus). Dropped: `tauri-plugin-webdriver` dep + `init_with_port(4444)` registration (Phase 1 found a real upstream port-default bug at `:4445` vs Playwright's `:4444` probe — fix in commit `0dbe626` stays in branch history; the dep is gone). 4 proof-set Playwright specs (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`) now run with full assertions on every PR push (file appears on disk; wiki-link rewrites in `b.md` after rename; etc.). Total Tauri production commands unchanged at 26; test_server adds `make_temp_vault` over HTTP. AppHandle-dependent commands (vault_pick, vault_watch_start, term_*, claude_*, settings_*, skill_*) return `{ok:false,error:"unsupported in test_server"}` — the four proof-set specs only need the vault surface, which is fully supported.

Post-merge of MVP-4.x will leave the legacy 41 fsMock-based specs untouched (they continue running in vanilla chromium against `next dev`). The next-action loop kicks off MVP-5 (test-cases sweep) immediately.

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
| **MVP-4** | Test infrastructure on the new shell | `docs/superpowers/plans/2026-05-09-tauri-mvp4-test-infra-plan.md` | ✅ Merged via PR #157 (`072f807` on `main`). e2e dropped from CI per MVP-4.x split. |
| **MVP-4.x** | Real Playwright e2e in CI (no manual smoke) | `docs/superpowers/plans/2026-05-09-tauri-mvp4x-real-e2e-ci-plan.md` | ✅ Merged via PR #158 (`6903077` on `main`). Path 3 (custom IPC harness) landed; Paths 1+2 ruled out (Phase 1 found a real upstream port bug in `tauri-plugin-webdriver 0.2.1` but the plugin itself was the wrong tool — `@playwright/test` speaks CDP, not WebDriver). |
| **MVP-5** | Promote previously-blocked test cases | _plan pending; in-flight on `feat/tauri-mvp5-test-promotion`_ | 🚧 Active. Branch cut from `main` at `6903077`. Plan-writing dispatched. |

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

**Landed (MVP-4, PR #157):**

- **`ClaudeRunner` trait + `StubRunner` (Rust)** — `Runner` factored behind a trait so tests can substitute deterministic stream-json playback. `StubRunner` selected by `KB_CLAUDE_MODE=stub` (env var; defaults to real); `RealRunner` is the existing `claude -p` host. Wired through `src-tauri/src/claude/{commands.rs, runner.rs, status.rs, types.rs, parser.rs, crash.rs}` (see `src-tauri/Cargo.lock` diff for the dep additions).
- **Vault tempdir helpers** — `src-tauri/src/test_support/{mod.rs, vault.rs}` (new). `TempVault::fresh()` (empty + `.kb/config.json`) and `TempVault::from_fixture(name)` (copies under `src-tauri/tests/fixtures/vaults/<name>/`). Debug-only `make_temp_vault` Tauri command exposes the helper to e2e land via `e2e/helpers/tempVault.ts::makeTempVault({ fixture, initialized })`. Fixtures present: `empty/` (with `.gitkeep`) and `with_links/` (`a.md` linking to `b.md` for rename-propagation tests).
- **Bridge contract layer** — `src/app/knowledge_base/infrastructure/tauriBridge.test.ts` (new) covers all 12 vault wrapper signatures + watcher + settings + claude + skill + term wrappers. Vitest-level; runs in the unit-test job. Catches drift between Rust command names and TS wrappers.
- **Capture fixture loader + chained reducer test** — `src/app/knowledge_base/features/claude/hooks/__fixtures__/loadCaptureSlice.ts` (new) reads the `.mvp2-stream-json-capture.jsonl` fixture and slices it by message id. `useClaudeSession.kbDocument.test.tsx` (new) drives the reducer through a chained `/kb document` flow at the Vitest tier — covers the MVP-2+MVP-3 integration path that was the e2e proof-set's headline scenario.
- **Rust integration tests** — `src-tauri/tests/term_pty_integration.rs` (real PTY echo round-trip; promoted from MVP-3.5 § 6 deferred box); `src-tauri/tests/term_vault_switch.rs` (PTY survives vault switch via `restart_in_new_vault` cd-rewrite); `src-tauri/tests/watcher_rename_paired.rs` (`#[cfg(target_os = "linux")]`-gated; strictly asserts paired-rename `Renamed { old_path, new_path }` shape — closes the FSEvents rename-cookie deferred-from-MVP-1b item on Linux).
- **CI restructured** — `.github/workflows/ci.yml` split into 5 parallel jobs: `Typecheck · Lint · Unit tests`, `Production build`, `Rust fmt · clippy · test (Ubuntu)`, `Tauri debug bundle (macOS)`, plus an `End-to-end tests` job that was DROPPED before merge (see MVP-4.x carve-out). `rust-checks` job gained full Tauri Linux deps (`libgdk-pixbuf-2.0-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libwebkit2gtk-4.1-dev`, etc.) so Cargo links cleanly under Ubuntu.
- **e2e proof-set specs (in repo as artifacts)** — `e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts` (new) + `e2e/helpers/{launchApp,tempVault}.ts`. All four are `test.skip(currentBackend() === "nextdev", ...)`-gated (currently unreachable in CI; the gate goes away when MVP-4.x lands a real e2e backend).
- **Test cases** — `test-cases/04-document.md`, `test-cases/05-links-and-graph.md`, `test-cases/14-terminal.md`, `test-cases/README.md` updated to reflect the new Vitest+integration coverage of previously-blocked scenarios.
- **`playwright.config.ts`** — `webServer.command: 'npm run tauri:dev'`, `:4444/status` probe, 180 s timeout, `KB_E2E_BACKEND=webdriver|nextdev` selector. Stays in repo for MVP-4.x; the webdriver path didn't bind in any CI config we tried.

**Landed (MVP-4.x, PR #158):**

- **Inner-impl refactor (Rust)** — `src-tauri/src/{vault,settings,claude,skill,term}/commands.rs` and `src-tauri/src/test_support/vault.rs` had every `#[tauri::command]` body factored into a `pub async fn impl_<name>(...)` so both the Tauri wrapper *and* the new `test_server` axum binary can call the same body. 27 impl-fns in total (14 vault + 4 term + 2 settings + 4 claude + 2 skill + 1 `make_temp_vault`). No behaviour change in production paths; macOS `cargo test` baseline at 86 still green.
- **`test_server` axum binary (Rust)** — `src-tauri/src/bin/test_server.rs` (boot) + `src-tauri/src/test_server/{mod,router,dispatch,events}.rs` (~400 LOC). Routes: `GET /health` (Playwright readiness probe), `POST /invoke` (JSON `{cmd, args}` dispatched to `impl_<name>`), `GET /events` (SSE scaffold; not wired to production event sources yet — one-file upgrade). Bound on `127.0.0.1:1421`; CORS allow-origin `http://localhost:3000`. AppHandle-dependent commands return `{ok:false,error:"... unsupported in test_server ..."}`; `vault_watch_start` specifically returns `Ok(null)` so `FileWatcherContext` mount doesn't error; `settings_read` synthesizes `Settings { last_path: <current vault root>, ... }` so the boot path succeeds; `plugin:event|listen` / `unlisten` arms (the wire-protocol form `@tauri-apps/api/event::listen` invokes) return stubs.
- **Playwright invoke shim** — `e2e/helpers/tauriShim.ts` (new, ~70 LOC). Exports `installShim(page)` which wires `page.addInitScript(...)` so `window.__TAURI_INTERNALS__.invoke = (cmd, args) => fetch('http://localhost:1421/invoke', { method: 'POST', body: JSON.stringify({ cmd, args }) })` runs before any module evaluates. Listen / unlisten are no-ops today; SSE upgrade ready when needed.
- **`scripts/run-e2e.sh`** (new, +x) — Boots `cargo run --bin test_server` (`:1421`) and `npm run dev` (`:3000`) side-by-side, traps `SIGTERM`/`EXIT`/`INT` so Playwright's webServer-shutdown reaches both processes. Used as the `webServer.command` in `playwright.config.ts`.
- **`playwright.config.ts`** collapsed — single `chromium` project; `baseURL: 'http://localhost:3000'`; `webServer.command: 'bash scripts/run-e2e.sh'`; `webServer.url: 'http://localhost:1421/health'`; 180 s timeout; `KB_E2E_BACKEND` env switch removed.
- **4 proof-set specs wired** — `e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts` each call `installShim(page)` from `test.beforeEach`. The `nextdev` skip gates are gone. `e2e/helpers/launchApp.ts` simplified (`currentBackend()` removed); `e2e/helpers/tempVault.ts` calls test_server directly from node (the page-side shim doesn't apply to node-side test code).
- **`tauri-plugin-webdriver` dropped** — `src-tauri/Cargo.toml` no longer lists the dep; `src-tauri/src/main.rs` no longer registers it. The `init_with_port(4444)` fix from commit `0dbe626` stays in branch history as the upstream-bug-found-and-fixed artifact, but the plugin is gone (saves ~200KB + ~30s compile per CI run).
- **CI `e2e` job restored (Path 3 shape)** — `.github/workflows/ci.yml` `e2e` job on `ubuntu-22.04` with **chromium only** (no GTK / WebKitGTK / xvfb / dbus / AT-SPI). Steps: setup-node + rust-toolchain → install Tauri Linux deps (still needed to *link* the `lib` crate even when only building `test_server`, because `tauri-plugin-store` etc. transitively need them) → `npm install --prefer-offline` → playwright cache + install chromium → pre-build `test_server` (avoids `cargo run` cold-compile inside `webServer`'s 180 s timeout) → `npx playwright test e2e/{4 proof-set spec files}` → upload-artifact `playwright-report/` on failure. ~7-10 min cold; reduces to ~3-5 min warm under `Swatinem/rust-cache`.
- **Test fixture alignment** — `src-tauri/src/test_support/vault.rs` writes `.archdesigner/config.json` with the four string fields the frontend's `vaultConfigRepoTauri::isValidVaultConfig` expects (previously wrote `.kb/config.json` with `{"version":1}` — a frontend / fixture mismatch that would have surfaced anyway when the proof-set specs flipped on). `from_fixture` auto-seeds `.archdesigner/config.json` when missing, so `{fixture: "empty"}` produces an *initialized* empty vault.
- **Features.md / test-cases** — no changes (the e2e harness reorganization isn't a user-facing feature).
- **Pinned scope decisions honoured** — Path 3 (custom IPC harness) landed as the default per the plan's pinned decision; Paths 1 (plugin fix) and 2 (`tauri-driver`) were ruled out by Phase 1's source dive. `tauri-plugin-webdriver` dropped per the pinned decision; CI runs Ubuntu-only for e2e per the pinned decision; macOS keeps `tauri-build` as the compile-clean gate (no e2e step on macOS).

**Deferred / future MVPs:**

- **MVP-4.x — real Playwright e2e in CI (now active on `feat/tauri-mvp4x-real-e2e-ci`; plan pending):** Investigate `tauri-plugin-webdriver 0.2.1` source (likely needs setup callback / capability declaration / explicit bind config), try `RUST_LOG=tauri_plugin_webdriver=trace`, evaluate official `tauri-driver`, pivot to Option C (custom IPC harness via `src-tauri/src/bin/test_server.rs` + Playwright `fetch()`-shim init-script + chromium + `next dev`) if neither pans out. Last-resort self-hosted macOS runner only if WKWebView fidelity is non-negotiable. Goal: 4 proof-set specs run with full assertions in CI, no manual smoke, `test.skip(currentBackend() === "nextdev")` gates removed. Diagnostic dump in Open follow-up items has the four CI run IDs (`25603172898`, `25603759353`, `25603901628`, plus PR #157's first run) and configurations attempted.
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

- **macOS FSEvents kind-mapping gap — `Modified`→`Deleted` half RESOLVED in MVP-1c; rename-cookie half RESOLVED on Linux in MVP-4 (PR #157, `072f807`, 2026-05-09).** During MVP-1b Task 4 we discovered `notify 6.1.1` + macOS FSEvents emits the "wrong" `ChangeKind` for several user actions: `tokio::fs::write` on an existing file → `Created` instead of `Modified`; `remove_file` → `Modified(Data)` instead of `Deleted`; `rename(a, b)` → only `Created(b.md)` with no source event. **Resolution:** ✅ `postprocess_existence` in `src-tauri/src/vault/watcher.rs` rewrites `Modified` → `Deleted` when the file is gone (MVP-1c Task 10). ✅ `src-tauri/tests/watcher_rename_paired.rs` (`#[cfg(target_os = "linux")]`-gated) strictly asserts the paired-rename `Renamed { old_path, new_path }` shape under inotify (MVP-4). The macOS FSEvents-cookie half remains a known platform limitation — production `Watcher::start` primes the FileIdMap cache via `cache().add_root()` (MVP-1b) which lets `notify-debouncer-full` stitch rename source/target for *pre-existing* files on macOS, but newly-created-then-renamed files within the same debounce window still emit `Created(b.md)` only. No further work planned (acceptable trade-off; tree-view will resync via the linkIndex on next mutation).
- **CI `e2e` job disabled in MVP-1a (2026-05-08).** Repository layer now routes through `@tauri-apps/api/core`'s `invoke()`, but the Playwright suite still boots `npm run dev` in vanilla Chromium with the FSA-shaped `e2e/fixtures/fsMock.ts`, so every spec throws `TypeError: Cannot read properties of undefined (reading 'invoke')`. The `e2e` block in `.github/workflows/ci.yml` is replaced with a comment pointing at MVP-4. **MVP-4 must restore this job** when it wires `tauri-plugin-webdriver` (spec § 9) — port the original steps from `.github/workflows/ci.yml` at commit `ad26115` (the last commit on `feat/tauri-mvp1a-scaffold` before the disable).
- **MVP-1a Tasks 27/28 re-scoped (2026-05-08).** Discovered during execution that ~30 consumer callsites bypass the typed `Repository` abstraction by reading `useFileExplorer.dirHandleRef.current` directly. Re-shaped Task 27 → 27a (new `VaultIndexRepository`) + 27b (hook migration to typed repos), and Task 28 → 28a (knowledgeBase.tsx consumers) + 28b (DiagramOverlays / GraphifyView / linkManager / useOfflineCache) + 28c (final FSA-prop cleanup pass). Spec § 11.5 has the rationale; plan tasks 27a/b/28a/b/c are the canonical execution path. Original Task 27/28 sections in the plan are preserved as historical reference but not executed.
- **MVP-1e — RESOLVED in PR #153 (`d2fa1b2`, 2026-05-08).** `historyPersistence` ported FSA → Tauri; sidecar undo across restarts preserved. `FirstRunHero` + `seedSampleVault` deleted; `NoVaultCTA` covers the no-vault state alongside MVP-1c's `UninitializedVaultSplash` (which still gates the *uninitialized* case after a vault is selected).
- **MVP-1f cleanup folded into MVP-2 — RESOLVED in PR #154 (`e42f0bf`, 2026-05-09).** `vaultConfig.ts` + `vaultConfig.test.ts` deleted as part of the MVP-2 seed. `renameSidecar` in `fileExplorerHelpers.ts` similarly cleaned up.
- **No model-switcher UI in MVP-2 (deferred 2026-05-09; superseded by MVP-3.5 chat-surface park).** Per the user audit (2026-05-08) the chat surface lacked a runtime model-switcher. **Updated status (2026-05-09):** the chat surface itself was parked in MVP-3.5 in favour of the embedded terminal. The terminal surface ships the user's full `claude` CLI (including `/model`), so a custom model-switcher UI is no longer required for parity — it would only re-emerge if/when the chat surface is un-parked. **Decision:** keep deferred indefinitely; revisit only if chat surface usage data argues otherwise.
- **MVP-3 — RESOLVED in PR #155 (`726904b`, 2026-05-09).** Skill bootstrap (`skill_status` / `skill_install_from_bundle`), slash-command palette in `Composer`, Skills sheet, `UninitializedVaultSplash` "Initialize with full template" third action all shipped. Bundled `skills/knowledge-base/` source tracked alongside the live `~/.claude/skills/knowledge-base/` per the bidirectional-sync rule in global CLAUDE.md.
- **MVP-3.5 — RESOLVED in PR #156 (`678a9d8`, 2026-05-09).** Embedded terminal surface (`TerminalDrawer` + `TerminalSurface` + `useTerminalSession` + `useTerminalResize`) + Rust `term` module + login-shell PATH bootstrap shipped. PTY-cols-on-first-show + scrollback-across-toggles fixed in followup commits (`ba506ea` + `5e652df`). Parked-chat-UI fixes (`8ff0709`) folded in.
- **MVP-4 — RESOLVED in PR #157 (`072f807`, 2026-05-09), with MVP-4.x carve-out for real e2e.** `ClaudeRunner` trait + `StubRunner` (env-var `KB_CLAUDE_MODE=real|stub`), vault tempdir helpers (`src-tauri/src/test_support/{mod,vault.rs}` + `make_temp_vault` + TS `makeTempVault`), Vitest+bridge contract layer (`tauriBridge.test.ts`), capture-fixture loader + chained reducer test (`useClaudeSession.kbDocument.test.tsx`), Rust integration tests (`term_pty_integration.rs`, `term_vault_switch.rs`, `watcher_rename_paired.rs`), CI split into 5 parallel jobs, and 4 proof-set Playwright specs (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`) all shipped. The webdriver-backed e2e step had to be dropped from CI because `tauri-plugin-webdriver 0.2.1` failed to bind `:4444` in 4 headless configurations — see the MVP-4.x diagnostic block below.
- **PTY integration tests — RESOLVED in PR #157.** `src-tauri/tests/term_pty_integration.rs` (real PTY echo round-trip) + `src-tauri/tests/term_vault_switch.rs` (PTY survives vault switch via `restart_in_new_vault` cd-rewrite). Bypasses the `#[tauri::command]` wrappers (which require an `AppHandle` for event emit) and calls `term::pty::*` directly with a custom emit channel; the wrapper parity is covered by code review since they're 5-line forwarders.
- **Live-serialize for terminal scrollback persistence (deferred from MVP-3.5 § 4.9 / § 9 follow-ups).** xterm.js has a serialize addon that snapshots the buffer to a string for persistence across drawer-hides at higher fidelity than the current `display:none` mount-preservation approach. Defer until a user complaint shows the current behaviour is insufficient — the `display:none` strategy is honest about what it preserves (the live buffer) and what it doesn't (a persisted snapshot across full app restarts). Out of scope for MVP-4.
- **Right-click → copy / paste + search-in-scrollback in terminal (MVP-3.5 § 9 follow-ups).** xterm.js has the primitives (`xterm-search` addon, context menu hooks). Defer — quality-of-life wins, not blockers. Out of scope for MVP-4.
- **MVP-4.x — RESOLVED in PR #158 (`feat/tauri-mvp4x-real-e2e-ci`, 2026-05-09).** Real Playwright e2e in CI lands via Path 3 (custom IPC harness). Post-mortem:
  - **Phase 1 surfaced a real upstream bug** in `tauri-plugin-webdriver 0.2.1`: `DEFAULT_PORT = 4445` (`src/lib.rs:19`) but `playwright.config.ts` probes `:4444`. The "silent bind failure across 4 CI configs" was the bind succeeding on `:4445` while Playwright polled the wrong port (with `tracing::info!` producing no output because Tauri 2.11 doesn't install a `tracing-subscriber` by default — masking the success as silence). Fix landed in commit `0dbe626` (`init_with_port(4444)`) and stays in branch history as the upstream-bug-found-and-fixed artifact.
  - **But Path 1 was the wrong tool entirely.** `@playwright/test` speaks **CDP**, not WebDriver. The plugin's `:4444` server is for Selenium / WebDriverIO. Playwright's chromium spawns independently and navigates to `baseURL` — it never attaches to Tauri's WebKitGTK webview, never receives `__TAURI__.invoke`. Phase 1's port fix made the plugin reachable but didn't bridge it to Playwright. Phase 2 (`tauri-driver`) would have required swapping runners (WebDriverIO instead of Playwright) — bigger pivot than the spec budgeted, identical fundamental mismatch.
  - **Path 3 (custom IPC harness) was the pinned default for exactly this reason** and shipped per spec. The 4 proof-set specs now run with full assertions on every PR push: 5/5 CI jobs green on 3 consecutive runs (`73c0edd`, `861e334`, plus the closeout commit). Total e2e step ~7-10 min cold, ~3-5 min warm under `Swatinem/rust-cache`.
  - **Architecture shipped:** chromium + `next dev` (`:3000`) + a Rust `test_server` axum binary (`:1421`); Playwright's `addInitScript` monkey-patches `window.__TAURI_INTERNALS__.invoke = (cmd, args) => fetch(':1421/invoke', ...)`. 27 production `#[tauri::command]`s refactored to the `impl_<name>` inner-impl pattern so the test_server re-uses bodies. AppHandle-dependent commands (vault_pick, vault_watch_start, term_*, claude_*, settings_*, skill_*) return `{ok:false,error:"unsupported in test_server"}`; the four proof-set specs only need the vault surface, which is fully supported. `tauri-plugin-webdriver` dropped from the dep tree (~200KB + ~30s compile per CI run saved). See "Landed (MVP-4.x, PR #158)" under Reference architecture for the full file map.
  - **Residual coverage gap (accepted trade-off):** the harness exercises React + real Rust commands but NOT the actual Tauri WKWebView. macOS WKWebView fidelity is uncovered by automation — the macOS `tauri-build` CI job is the compile-clean signal, and manual macOS smokes catch behavioural drift. Opening this back up would require Path 4 (self-hosted macOS runner) and is deferred indefinitely unless funded.

---


## Next Action

**MVP-4.x merged via PR #158 (`6903077` on `main`).** Post-merge cleanup done; `feat/tauri-mvp5-test-promotion` cut from `main`; this doc is being updated on that branch alongside the first MVP-5 commit. **MVP-5 kicks off now** — write the plan to systematically sweep ❌ → ✅ / 🟡 / 🧪 across the 8 test-cases buckets, using the harness MVP-4.x just shipped.

**Bootstrap (already run for this branch):**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only          # 6903077 present
git branch -D feat/tauri-mvp4x-real-e2e-ci       # remote auto-deleted; [origin/...: gone] verified
git remote prune origin
git checkout -b feat/tauri-mvp5-test-promotion   # ← you are here
```

**MVP-5 plan-writing brief (run via `superpowers:writing-plans`; output `docs/superpowers/plans/2026-05-09-tauri-mvp5-test-promotion-plan.md`):**

- **Goal:** Systematic ❌ → ✅ / 🟡 / 🧪 sweep across the 8 sweep-target buckets in `test-cases/`. Now that the MVP-4.x harness is live, scenarios that were blocked on the FSA-picker (`showDirectoryPicker` user gesture) can be reframed as test_server-driven Playwright assertions and promoted off the ❌ list.
- **Sweep target files:** `test-cases/01-app-shell.md`, `02-file-system.md`, `04-document.md`, `05-links-and-graph.md`, `06-shared-hooks.md`, `06-svg-editor.md`, `07-persistence.md`, `11-tabs.md`. Per `test-cases/README.md`, each `❌` case needs an inspect-and-flip pass: assess whether the case is now feasible under the new harness, write the spec, flip the marker.
- **Read first:** `test-cases/README.md` (status legend + cross-reference rules); `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 9 (testing strategy parent); the four MVP-4.x proof-set specs as the patterns to mirror (`e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts`); `e2e/helpers/{tauriShim,tempVault,launchApp}.ts` (the harness API surface).
- **Plan-level decisions to pin:**
  - Bucket ordering — by complexity (start with the easy promotions), by user-facing area, or by dependency? **Default recommendation:** start with `02-file-system.md` (closest to the harness's existing strengths), then expand outward.
  - Per-case shape: one Playwright spec per case, or a spec per logical group (the 4 proof-set specs cover one case each — that's the precedent)?
  - Coverage of AppHandle-dependent commands (settings, term, claude, skill): defer to a future MVP, or expand `test_server` dispatch.rs in this MVP? **Default recommendation:** defer; MVP-5's wins are in the vault surface where `test_server` is already complete.
- **Out of scope for MVP-5:**
  - WKWebView fidelity (still deferred indefinitely).
  - Expanding `test_server`'s AppHandle-dependent command surface unless a specific spec demands it.
  - The 5 pre-MVP-4 clippy lints (their own follow-up).
  - Performance benchmarks.
- **After MVP-5 merges:** the Tauri + Claude Integration epic is *done* — every blocker has been resolved (vault-on-disk for the FSA-picker problem, Claude subprocess + skill bootstrap + slash-command palette for the chat surface, embedded terminal for the production runtime, real e2e for the test harness, and the test-cases sweep for the documentation). Update this handoff one last time to mark the epic ✅ Closed.
