# Tauri + Claude Integration — Session Handoff

> **Purpose:** A pointer document so that an LLM session with no prior context can resume work on the Tauri + Claude Integration feature cleanly. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action**.

**Last updated:** 2026-05-08 (Spec + MVP-1a plan committed on `feat/tauri-claude-integration`. Spec covers all 5 MVPs at the feature level: MVP-1 Tauri shell migration with sub-MVPs 1a→1d, MVP-2 Claude subprocess integration, MVP-3 skill bootstrap + `/kb` invocation, MVP-4 test infrastructure, MVP-5 promotion of FSA-picker-blocked test cases. MVP-1a plan enumerates 30 tasks. Handoff doc created. No implementation has landed yet — next action is to kick off MVP-1a.)

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next task"*, *"resume tauri claude integration"*, or just points at this file:

1. Run the **Bootstrap** block below.
2. Skim **Where we are** to confirm which MVP is next — the **Next Action** section names it explicitly.
3. Check open PRs (`gh pr list --state open`). If a Tauri-Claude-Integration PR is open, ask the user whether to wait or stack a follow-up branch.
4. **If a previous MVP just merged**, run the **Post-merge cleanup protocol** below, *then* read the next MVP's plan and dispatch.
5. Read the spec and the next MVP's plan file.
6. **Branch first** (`git checkout -b feat/tauri-mvp<id>-<slug>` — see **Branch convention** below), then execute via subagents (`superpowers:subagent-driven-development`).
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
git branch -d feat/tauri-mvp<id>-<slug>   # exact name from the PR you just merged

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

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and lists the spec + per-MVP plan files (only MVP-1a's plan exists today — subsequent MVPs get their plans written when their turn comes).

---

## Where we are

### Spec

| File | Status |
|---|---|
| `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` | ✅ Committed on `feat/tauri-claude-integration` (commits `bf2ebf9` + `bac342f`). |

### Plans (5 MVPs; per-MVP plans written just-in-time)

| MVP | Plan file | Status |
|---|---|---|
| **MVP-1a** | Tauri scaffold + Rust VFS adapter | `docs/superpowers/plans/2026-05-07-tauri-mvp1a-scaffold-plan.md` | ⏳ Not started. |
| **MVP-1b** | File watching | _not yet written; due after MVP-1a merges_ | ⏳ Not started. |
| **MVP-1c** | Settings, vault management, basic init | _not yet written; due after MVP-1b merges_ | ⏳ Not started. |
| **MVP-1d** | Cleanup, bundle, CI | _not yet written; due after MVP-1c merges_ | ⏳ Not started. |
| **MVP-2** | Claude subprocess integration | _not yet written; due after MVP-1d merges_ | ⏳ Not started. |
| **MVP-3** | Skill bootstrap + `/kb` invocation | _not yet written; due after MVP-2 merges_ | ⏳ Not started. |
| **MVP-4** | Test infrastructure on the new shell | _not yet written; due after MVP-3 merges_ | ⏳ Not started. |
| **MVP-5** | Promote previously-blocked test cases | _not yet written; due after MVP-4 merges_ | ⏳ Not started. |

### Implementation

No implementation has landed yet. First task: **MVP-1a**.

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

_Empty until MVP-1a starts landing files. Once code begins arriving, this section becomes the map of new files / hooks / components introduced._

Anchors that already exist in the codebase and the migration touches:

- **Repository interfaces** — `src/app/knowledge_base/domain/repositories.ts` (10 typed contracts; the seam for the Tauri swap; do not change shape).
- **Existing FSA infrastructure** — `src/app/knowledge_base/infrastructure/*Repo.ts` (10 files, kept on disk through MVP-1a–1c, deleted in MVP-1d).
- **Provider** — `src/app/knowledge_base/shell/RepositoryContext.tsx` (prop swap from `rootHandle` to `vaultPath` in MVP-1a).
- **Vault picker / hook** — `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` (FSA picker swap in MVP-1a).
- **File watcher** — `src/app/knowledge_base/shared/context/FileWatcherContext.tsx` (body swap to `notify`-backed events in MVP-1b).
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

---

## Open follow-up items

- **MVP-1a Tasks 27/28 re-scoped (2026-05-08).** Discovered during execution that ~30 consumer callsites bypass the typed `Repository` abstraction by reading `useFileExplorer.dirHandleRef.current` directly. Re-shaped Task 27 → 27a (new `VaultIndexRepository`) + 27b (hook migration to typed repos), and Task 28 → 28a (knowledgeBase.tsx consumers) + 28b (DiagramOverlays / GraphifyView / linkManager / useOfflineCache) + 28c (final FSA-prop cleanup pass). Spec § 11.5 has the rationale; plan tasks 27a/b/28a/b/c are the canonical execution path. Original Task 27/28 sections in the plan are preserved as historical reference but not executed.
- **`useOfflineCache` is browser-deploy-specific** (PWA Cache API). Becomes a no-op in Tauri mode for MVP-1a (Task 28b); slated for full removal in MVP-1d.
- **MVP-1d cleanup target list grew:** in addition to FSA `*Repo.ts` deletion + `idbHandles.ts` deletion + `types/file-system.d.ts` deletion + GitHub Pages workflow removal, MVP-1d should also delete `vaultIndexRepoFsa.ts`, the `useOfflineCache` hook, and any remaining FSA-mode helpers in `fileExplorerHelpers.ts`.

---

## Next Action

**Kick off MVP-1a — Tauri scaffold + Rust VFS adapter.**

1. Read the plan: `docs/superpowers/plans/2026-05-07-tauri-mvp1a-scaffold-plan.md` (30 tasks).
2. Skim the spec section it implements: `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 6.1.
3. Branch — **base off `feat/tauri-claude-integration`, not `main`** (one-time exception, see note below):

   ```bash
   git checkout feat/tauri-claude-integration
   git pull --ff-only origin feat/tauri-claude-integration   # if you've never had it locally
   git checkout -b feat/tauri-mvp1a-scaffold
   ```

   The spec, MVP-1a plan, and this handoff doc live as three commits on `feat/tauri-claude-integration` and have not yet reached `main`. Branching MVP-1a off the spec branch carries those commits into MVP-1a's PR so they merge to `main` alongside the first slice of implementation — the user's preference is to "ride with code" (no doc-only PRs).

4. Execute via `superpowers:subagent-driven-development` — fresh subagent per task, two-stage review between tasks.
5. After all 30 tasks pass review, follow the plan's Task 30 to push and open the PR.
6. Once merged, run the **Post-merge cleanup protocol** above, then write the MVP-1b plan and start it. **From MVP-1b onward, base each new branch on `main`** (the meta commits are already there).

**Ship target for MVP-1a:** the app launches via `npx tauri dev`, the user picks a vault folder via the OS-native dialog, the existing knowledge-base UI loads, and basic editing flows (read/write/list/rename/delete) work via Rust commands instead of the File System Access API. File watching, settings persistence, vault switcher UI, and uninitialized-folder splash all stay deliberately deferred to subsequent sub-MVPs.
