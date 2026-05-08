# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-08 (MVP-1b file watcher merged — native `notify`-based debounced watcher (~200 ms), `vault_change` events, `FileWatcherContext` body-swapped to event-driven. PR #150 on `feat/tauri-mvp1b-file-watcher`. Next action: write and dispatch MVP-1c plan.)

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

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the spec + per-MVP plan files (MVP-1a + MVP-1b plans exist today — later MVPs get their plans written when their turn comes).

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
| **MVP-1b** | File watching | `docs/superpowers/plans/2026-05-08-tauri-mvp1b-file-watcher-plan.md` | 🚧 PR opened: #150 on `feat/tauri-mvp1b-file-watcher`. |
| **MVP-1c** | Settings, vault management, basic init | _not yet written; due after MVP-1b merges_ | ⏳ Not started. |
| **MVP-1d** | Cleanup, bundle, CI | _not yet written; due after MVP-1c merges_ | ⏳ Not started. |
| **MVP-2** | Claude subprocess integration | _not yet written; due after MVP-1d merges_ | ⏳ Not started. |
| **MVP-3** | Skill bootstrap + `/kb` invocation | _not yet written; due after MVP-2 merges_ | ⏳ Not started. |
| **MVP-4** | Test infrastructure on the new shell | _not yet written; due after MVP-3 merges_ | ⏳ Not started. |
| **MVP-5** | Promote previously-blocked test cases | _not yet written; due after MVP-4 merges_ | ⏳ Not started. |

### Implementation

- **MVP-1a (merged via PR #149, `844a474` on `main`)** — Tauri 2 desktop shell hosting the existing Next.js app; Rust vault adapter (12 commands) under `src-tauri/src/vault/`; per-repo Tauri implementations under `src/app/knowledge_base/infrastructure/*RepoTauri.ts`; `RepositoryProvider` swapped from `rootHandle` → `vaultPath`; `useFileExplorer` swapped from `showDirectoryPicker` → `vault_pick`; FSA-availability gate removed from `knowledgeBase.tsx`; CI's Playwright `e2e` job parked until MVP-4.
- **MVP-1b (PR #150, on `feat/tauri-mvp1b-file-watcher`)** — Rust `notify`-debouncer-full watcher (200 ms coalesce); `vault_watch_start`/`vault_watch_stop` commands; `vault_change` events with `{ kind, path, oldPath? }` payload (POSIX-relative paths); `FileWatcherContext` body-swapped to event-driven; canonicalize symmetry between `vault_set_root` and `Watcher::start`.

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

**Deferred / future MVPs:**

- **Vault config helpers** — `src/app/knowledge_base/features/document/utils/vaultConfig.ts` (used by MVP-1c basic-init button).
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

- **macOS FSEvents kind-mapping gap (deferred to MVP-1c/MVP-4) (2026-05-08).** During MVP-1b Task 4 we discovered that `notify 6.1.1` + macOS FSEvents emits the "wrong" `ChangeKind` for several user actions: `tokio::fs::write` on an existing file → `Created` instead of `Modified`; `remove_file` → `Modified(Data)` instead of `Deleted`; `rename(a, b)` → only `Created(b.md)` with no source event. Real product impact: subscribers that try to re-read on `Modified` may hit `NotFound` for a deleted file, and tree-view consumers that reference the old rename source will see stale entries until the next full rescan. MVP-1b's integration tests therefore assert "any event for the affected path" rather than the exact kind. Plan-level fixes for MVP-1c or MVP-4: (a) post-process `Modified` events with an existence check and re-emit as `Deleted` if the file is gone, (b) explore a `notify` configuration that exposes FSEvents rename cookies, or (c) keep current behavior and document for downstream consumers. Also: production `Watcher::start` now primes the FileIdMap cache via `cache().add_root()` to enable rename stitching for pre-existing files on macOS/Windows; previously only the integration test did this. A `#[cfg(target_os = "linux")]` companion test that strictly asserts the paired-rename shape with `old_path == "a.md"` is deferred to MVP-4's cross-platform CI.
- **CI `e2e` job disabled in MVP-1a (2026-05-08).** Repository layer now routes through `@tauri-apps/api/core`'s `invoke()`, but the Playwright suite still boots `npm run dev` in vanilla Chromium with the FSA-shaped `e2e/fixtures/fsMock.ts`, so every spec throws `TypeError: Cannot read properties of undefined (reading 'invoke')`. The `e2e` block in `.github/workflows/ci.yml` is replaced with a comment pointing at MVP-4. **MVP-4 must restore this job** when it wires `tauri-plugin-webdriver` (spec § 9) — port the original steps from `.github/workflows/ci.yml` at commit `ad26115` (the last commit on `feat/tauri-mvp1a-scaffold` before the disable).
- **MVP-1a Tasks 27/28 re-scoped (2026-05-08).** Discovered during execution that ~30 consumer callsites bypass the typed `Repository` abstraction by reading `useFileExplorer.dirHandleRef.current` directly. Re-shaped Task 27 → 27a (new `VaultIndexRepository`) + 27b (hook migration to typed repos), and Task 28 → 28a (knowledgeBase.tsx consumers) + 28b (DiagramOverlays / GraphifyView / linkManager / useOfflineCache) + 28c (final FSA-prop cleanup pass). Spec § 11.5 has the rationale; plan tasks 27a/b/28a/b/c are the canonical execution path. Original Task 27/28 sections in the plan are preserved as historical reference but not executed.
- **`useOfflineCache` is browser-deploy-specific** (PWA Cache API). Becomes a no-op in Tauri mode for MVP-1a (Task 28b); slated for full removal in MVP-1d.
- **MVP-1d cleanup target list grew** (updated 2026-05-08 after Task 28c):
  - In addition to FSA `*Repo.ts` deletion + `idbHandles.ts` deletion + `types/file-system.d.ts` deletion + GitHub Pages workflow removal, MVP-1d should also delete:
    - `vaultIndexRepoFsa.ts` (added during Task 27a re-scope)
    - `useOfflineCache.ts` (now no-op in Tauri mode after Task 28b)
    - `historyPersistence.ts` (FSA-only sidecar history; Task 28c deferred its cleanup; document history runs in-memory in Tauri mode until then)
    - Remaining FSA-mode helpers in `fileExplorerHelpers.ts`
  - **Task 28c deferrals to MVP-1d:**
    - `knowledgeBase.tsx:246` still passes `dirHandleRef: fileExplorer.dirHandleRef` (always null) into `useBackgroundScanner` — touching it requires migrating `useBackgroundScanner.ts` + `historyPersistence.ts`, both MVP-1d retirement targets.
    - `useHistoryFileSync.ts` / `useDocumentHistory.ts` — `initHistory` still accepts `FileSystemDirectoryHandle | null` as a parameter; we pass `null` everywhere now (history is in-memory only) but the signature stays until those files are migrated/deleted in MVP-1d.

---

## Next Action

**MVP-1b PR is open (#150). Once it merges: run the Post-merge cleanup protocol, then write and dispatch the MVP-1c plan.**

**After MVP-1b merges (post-merge cleanup first):**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
git branch -D feat/tauri-mvp1b-file-watcher   # safe once remote is gone (see Project conventions)
git remote prune origin
git checkout -b feat/tauri-mvp1c-settings-vaults
```

**Then write the MVP-1c plan:**

1. Read the spec section: `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 6.3 (Settings, vault management, basic init).
2. Write the MVP-1c plan at `docs/superpowers/plans/2026-05-08-tauri-mvp1c-settings-vaults-plan.md` using the same structure as the MVP-1b plan (task list with inputs/outputs/tests/review checklist).
3. Commit the plan on `feat/tauri-mvp1c-settings-vaults` alongside a handoff doc update (flip this Next Action to "dispatch MVP-1c").
4. Dispatch MVP-1c execution via `superpowers:subagent-driven-development` — do not ask "subagent or inline?".

**Key MVP-1c scope (from spec § 6.3):**

- Vault switching: `vault_watch_stop` on old path, `vault_watch_start` on new path, broadcast to subscribers.
- Settings persistence: read/write a `~/.config/knowledge-base/settings.json` (or `$APPDATA` equivalent) via Tauri path API.
- Basic init button: calls `initVault` (already exists in `vaultConfig.ts`) via a Tauri command, so a brand-new folder becomes a vault in one click.
- Address the macOS FSEvents kind-mapping gap noted in **Open follow-up items** — at minimum: post-process `Modified` events with an existence check and re-emit as `Deleted` if the file is gone.

If you're starting cold: `cd "/Users/kiro/My Projects/knowledge-base" && git checkout feat/tauri-mvp1c-settings-vaults` then read the spec § 6.3 from the top.
