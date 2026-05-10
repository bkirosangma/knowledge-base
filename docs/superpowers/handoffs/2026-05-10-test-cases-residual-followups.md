# Test-Cases Residual Follow-Ups — Session Handoff

> **Purpose:** A pointer document so an LLM session with no prior context can resume work on the **portfolio of small follow-up PRs** carrying forward from the now-closed Tauri + Claude Integration epic. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action** to pick a theme.

**Last updated:** 2026-05-10 (handoff opened on `docs/test-cases-residual-handoff` after Tauri + Claude Integration epic closed via PR #161 (`44ac1d3` on `main`)). Tracks **29 items**: 26 ❌ deferred test-case promotions + 1 🟡 partial promotion (`TAB-11.2-12`) awaiting a product decision + 2 WebKit-only ⏭ skips (`TAB-11.2-10`, `LINK-5.5-01`) from PR #160's local engine-fidelity smoke. **No epic shape; portfolio of independent small PRs.** Each item ships as a discrete PR against `main`.

---

## Resume protocol — when the user says "take the next task"

If the user says anything like *"continue from this doc"*, *"take the next residual"*, *"resume test-cases follow-ups"*, or just points at this file:

1. Run the **Bootstrap** block below.
2. Skim the **Themes** table to see what's still open and what was last touched. The **Next Action** section names the next-up theme explicitly.
3. Check open PRs (`gh pr list --state open`). If a residual-follow-up PR is in flight, ask whether to wait or stack a parallel branch (themes are independent, so parallel is usually fine).
4. **If a previous follow-up just merged**, run the **Post-merge cleanup protocol** below, *then* pick the next theme from the table and start.
5. Read the relevant `test-cases/*.md` entries for the chosen theme and the `note: see MVP-5 follow-up — …` markers — they name the exact blocker.
6. **Branch first** (`git checkout -b feat/test-cases-<theme-slug>` — see **Branch convention** below), then execute via subagents (`superpowers:subagent-driven-development`) — do not ask "subagent or inline?"; that's the default.
7. Honour every rule in **Project conventions** (branch-per-task, main protected, no worktrees, etc.).
8. After the task / theme merges, **update this doc** per the **Doc-update protocol** — same branch as the cleanup, same PR.

The user's intent when pointing here is: *"Pick up where we left off without re-explaining anything."* Don't ask clarifying questions if the test-case `note:` markers + this doc already answer them; just go.

---

## Post-merge cleanup protocol

Run this **immediately** after any residual-follow-up PR merges. Themes can ship in any order, but cleanup always follows the same shape.

```bash
# 1. Sync main and confirm the merge landed.
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main
git pull --ff-only
git log --oneline -3                     # verify the merge commit is present

# 2. Delete the merged local branch.
#    Try `-d` first; if it refuses (squash-merge case), confirm the remote is
#    gone via `git branch -vv` showing `[origin/<branch>: gone]`, then use `-D`.
git branch -d feat/test-cases-<theme-slug>   # exact name from the PR you just merged
# or, if the remote is verifiably gone (auto-deleted on merge):
#   git branch -D feat/test-cases-<theme-slug>

# 3. Prune stale remote refs.
git remote prune origin

# 4. Pick the next-up theme per the Themes table (or just whatever is most pressing) and create its branch.
git checkout -b feat/test-cases-<next-theme-slug>

# 5. Update THIS doc on the new branch BEFORE the first task commit.
#    Touch the four sections listed in the Doc-update protocol below.
#    Commit the doc edit alongside the next theme's first task — never as a doc-only PR.
```

**Rules to honour:**

- **Never** create a doc-only PR for handoff updates. They ride with the next theme's first task.
- **Never** delete a branch that has unmerged commits. `git branch -d` (lowercase) refuses; `git branch -D` is destructive — only use it when the remote is verifiably gone (per the MEMORY rule "git branch -D pre-authorized when remote is gone").
- **Never** force-push to `main`. `main` is protected.
- If the post-merge cleanup turns up an unexpected PR or branch, **investigate before deleting**. The user may have in-flight work you don't know about.

---

## Doc-update protocol (do this on every theme close)

Before starting the next theme, update this doc on the current branch (or fold into the next theme's branch). Touch:

1. **Last updated** — bump the date and parenthetical to reflect what just shipped.
2. **Themes** table — flip the just-shipped theme's status to ✅ Merged with PR number; update the per-case status in the **Items** list below the theme.
3. **Items** lists — flip individual case statuses (❌ → ✅ or 🚫) as their tests land.
4. **Next Action** — replace the body with the next-up theme's bootstrap: which `test-cases/*.md` entries to read, key patterns to mirror, ship target.

If you skip the doc update, future sessions will resume from a stale map — that's the failure mode this protocol exists to prevent.

---

## Bootstrap (run first)

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
git fetch origin
gh pr list --state open
git log --oneline -10
grep -rEn "MVP-5 (follow-up|sweep)" test-cases/ --include="*.md" | wc -l    # should match the count in this doc
```

This puts you on the latest `main`, lists open PRs, shows recent merge commits, and counts the live `note:` markers across `test-cases/`. The count should match the "🟡 + ❌ open" total in the **Themes** table below; if it diverges, this doc is stale — read each theme's open items and reconcile before resuming.

---

## Themes

The 26 ❌ + 1 🟡 deferrals cluster into **6 themes** by shared blocker. Each theme can ship as one PR (covering all its cases) or several smaller PRs. Themes are independent — pick whichever is most pressing.

| # | Theme | Cases | Status | PR(s) |
|---|---|---|---|---|
| **A** | Production-bundle e2e backend (PWA / SW / manifest) | 5 | ❌ Open | — |
| **B** | Live-MarkdownEditor editor-ref access | 5 | ❌ Open | — |
| **C** | `test_server` event-stream wiring (vault_watch_start) | 2 | ❌ Open | — |
| **D** | Visual / hover / focus-visible assertions | 5 | ❌ Open | — |
| **E** | Production-code adjustments (DnD, watcher reload, filters, etc.) | 7 | ❌ Open / 🟡 partial | — |
| **F** | Single-case oddities (color-scheme priming, file-picker mock, etc.) | 4 | ❌ Open | — |
| **G** | WebKit fidelity (PR #160 local-smoke skips) | 2 | ⏭ Skip-guarded on Chromium-clean | — |

**Open / total:** 27 / 27 deferred-promotion items + 2 / 2 WebKit-fidelity items. = 29 / 29 still tracked.

---

## Theme A — Production-bundle e2e backend (PWA / SW / manifest)

**Blocker:** the MVP-4.x e2e harness boots `next dev` (`:3000`), so service-worker, `metadata.manifest`, and Lighthouse-style audits don't apply (`ServiceWorkerRegister` only registers when `NODE_ENV === "production"`). Promotion needs an alternate harness path that serves the production build (e.g. `next build && next start` side-car wired into `scripts/run-e2e.sh`, or a separate `playwright.config.ts` project for production-only specs).

**Cases:**
- `SHELL-1.15-01` ❌ Manifest serves at `/manifest.json` — Playwright `request.get('/manifest.json')` against the production-bundle public-dir handler.
- `SHELL-1.15-02` ❌ Layout references manifest via `metadata.manifest` — `<head>` includes `<link rel="manifest" href="/manifest.json">`; needs production bundle.
- `SHELL-1.15-04` ❌ Service worker registered in production — `navigator.serviceWorker.register("/sw.js")` only fires under `NODE_ENV === "production"`.
- `TAB-11.3-20` ❌ Service-worker cache hit on second load — `/soundfonts/sonivox.sf2` served from cache after first fetch.
- `SHELL-1.15-03` ❌ `themeColor` lives in viewport export (Next 16) — build-time classifier check; can ship as a Vitest/unit test asserting `app/layout.tsx` exports, no harness change needed (sub-theme of A but a one-line unit test).

**Estimated shape:** 1–2 PRs. SHELL-1.15-03 can land as a quick unit test today; the other four cluster around the production-bundle backend, which is a small harness addition (~50–100 LOC + CI matrix tweak).

---

## Theme B — Live-MarkdownEditor editor-ref access

**Blocker:** `MarkdownEditor` (Tiptap host) doesn't expose its editor instance via ref. JSDOM's Selection doesn't propagate to ProseMirror, and Tiptap keymaps close over `this.editor` and `view.dispatch` so they can't be driven from the public component surface.

**Two viable paths:**
1. **Production seam** — add a `ref` prop to `MarkdownEditor` that exposes `editor: Editor | null`. Tests use `ref.current.editor.commands.…` for selection / keypress drives. Smallest surface change; production code stays unchanged otherwise.
2. **e2e promotion** — move the cases out of unit tests entirely and drive them via Playwright on a real ProseMirror DOM. Heavier per-case but no production change.

Path 1 is preferred (smaller surface change; tests stay fast). Watch out: per `feedback_tiptap_editable_reactivity.md` in MEMORY, Tiptap's `editable` prop is not reactive — make sure the ref lifecycle plays nicely with `useEditor`.

**Cases:**
- `DOC-4.2-06` ❌ Checkbox toggle updates markdown — task-item NodeView checkbox handler. (Production-behaviour mismatch noted: `markdownToHtml` outputs `<input type="checkbox" disabled>` instead of `taskItem`. Fix is **either** rework the markdown→HTML pipeline (markdown-it task-list plugin) **or** rescope the case. **Probably re-scope** — the task-list plugin would change persisted-disk markdown shape.)
- `DOC-4.3-38` ❌ Enter in rawBlock splits with smart list-item handling — Tiptap keymap.
- `DOC-4.3-39` ❌ Backspace at rawBlock start merges with previous block's rightmost textblock — same constraint.
- `DOC-4.5-13` ❌ Force-exit rawBlock before structural commands — cursor placement requires editor instance.
- `DOC-4.5-18` ❌ Link button with text selected wraps selection — `editor.commands.setTextSelection({from, to})` requires the editor instance.

**Estimated shape:** 1 PR for Path 1 (ref + 4 unit-test promotions) + a separate decision PR for `DOC-4.2-06` (re-scope or markdown-it plugin).

---

## Theme C — `test_server` event-stream wiring

**Blocker:** PR #158's `test_server` (`src-tauri/src/bin/test_server.rs` + `src-tauri/src/test_server/{router,dispatch,events}.rs`) has an SSE scaffold at `GET /events` but it's not wired to the production event sources. `vault_watch_start` returns `Ok(null)` (so `FileWatcherContext` mounts cleanly), but `vault_change` events never reach Playwright. Promotion of any "UI reacts to disk change" case needs the SSE bridge wired up to `Watcher` events.

> **Scope warning (carry-over from closed epic, line-flagged in PR #161):** The full AppHandle expansion (`settings_*`, `term_*`, `claude_*`, `skill_*` flows — ~10 cases beyond the 2 in this theme) was sized as **fresh-epic-shaped** in the closed-out handoff: "Would need a small plan since `dispatch.rs` will need a real `AppHandle` factory." If a future task touches more than just the watcher event stream, **stop and spin up a fresh handoff doc + spec/plan under `docs/superpowers/`**. Don't quietly extend this theme into an epic.

**Cases (this theme is strictly the watcher event-stream; the broader AppHandle expansion is out of scope here):**
- `SHELL-1.10-15` ❌ UI reacts to disk change within ~1 s — full e2e: open shell, mutate file from another process, observe tree update.
- `TAB-11.2-08` ❌ External file change while pane is open triggers `ConflictBanner` — same hook subscription.

**Estimated shape:** 1 PR. Add SSE producer in `events.rs` that subscribes to `Watcher` events and re-emits as `data:` frames; add Playwright `EventSource`-based listener in `e2e/helpers/tauriShim.ts`. ~150–200 LOC. Confirm both cases ride the same hook before scoping wider.

---

## Theme D — Visual / hover / focus-visible assertions

**Blocker:** none structural — these are Playwright-viable Tab-focus / hover assertions deferred during MVP-5 to keep scope tight. They need real keyboard / pointer events on real DOM with `:focus-visible` / `:has(:focus-visible)` / `:has(:disabled)` CSS rules in play.

**Cases:**
- `SHELL-1.13-06` ❌ Visible focus ring on keyboard nav — Tab focus + computed-style assertion on `outline` / `box-shadow` using `var(--focus)`.
- `SHELL-1.16-01` ❌ Tabbing to icon button surfaces tooltip — Tab-focus + `[role="tooltip"]` visibility.
- `SHELL-1.16-02` ❌ Hover surfaces same bubble — `mouse.move()` + same assertion.
- `SHELL-1.16-04` ❌ Disabled trigger suppresses bubble — `<button disabled>` + verify no `[role="tooltip"]`.
- `FS-2.3-45` ❌ Folder context menu "New ▸" submenu — hover-triggered submenu position.

**Estimated shape:** 1 PR with 5 small specs; each is 10–30 LOC. Mirror existing chromium-only e2e patterns from MVP-5's promotions; no harness changes needed.

---

## Theme E — Production-code adjustments

These can't ship as test-only PRs — each requires a small touch in `src/app/knowledge_base/` or a product decision before the test can be written or promoted.

**Cases:**
- `LINK-5.1-10` ❌ **DnD-driven move** — production move is HTML5 drag-and-drop with `dataTransfer.getData("text/plain")`. Synthetic drops in headless Chromium return `""`. **Two paths:** (a) CDP-level real drag driver via Playwright; (b) production seam exposing `onMoveItem(sourcePath, targetPath)` directly via test_server. Path (b) is smaller. ~1 PR including production seam.
- `LINK-5.1-12` ❌ **Backlinks-first rename order** — production `propagateRename` does index-first; case asserts the opposite. **Decision needed:** reorder production code (and test it), or rewrite the case to match shipped order. Trivial PR once decided.
- `LINK-5.2-03` ❌ **Deleted doc's links become red pills** — production `deleteDocumentWithCleanup` strips `[[x]]` from disk; open editor doesn't reload. Needs **either** disabling the strip flow **or** wiring watcher-driven editor reload. Watcher reload is the more useful change (covers more scenarios) but bigger.
- `LINK-5.4-03` ❌ Same constraint as `LINK-5.2-03`; ships in the same PR.
- `TAB-11.2-12` 🟡 **Basename-fallback leg** — `\title` leg ✅ on Chromium; basename-fallback leg fails because `scoreToMetadata` defaults to `"Untitled"`. **Decision needed:** add basename fallback in `TabView` (and ✅ the case) or rewrite the case to assert `"Untitled"` (and ✅). Trivial once decided.
- `FS-2.3-73` ❌ `.kbjson` filter — `vaultIndexRepoTauri.ts` extension filter doesn't include `.kbjson`. Promotion needs **production filter expansion**, then the e2e is straightforward. Out of scope per the closed epic's Decision 5; reopen only if attachment-cleanup behaviour for `.kbjson` is genuinely user-facing.
- `DOC-4.2-06` ❌ overlap with Theme B — see notes there. (Counted in Theme B; not double-counted.)

**Estimated shape:** 4–5 PRs (LINK-5.1-12 + TAB-11.2-12 each one-line decision PRs; LINK-5.1-10, LINK-5.2-03+5.4-03, FS-2.3-73 each separate small PRs).

---

## Theme F — Single-case oddities

Each is a one-off blocker that doesn't share a theme with the others.

**Cases:**
- `SHELL-1.13-05` ❌ `prefers-color-scheme` precedence — needs harness-level priming hook before page reload races `emulateMedia`. Playwright's `colorScheme` context option set before `page.goto()` should work; a single targeted spec.
- `SHELL-1.11-12` ❌ Diagram commands present when diagram open — needs diagram-canvas pointer-event harness to seed a selected node. Overlaps with `DIAG-3.5/3.7` deferred drag-geometry work; if that lands first, this becomes trivial.
- `TAB-11.4-06` ❌ End-to-end import flow — Playwright drives palette → file picker → `.gp` → `.alphatex` opens. Needs **file-picker mock** for OS-native open-file dialog (test_server doesn't proxy `showOpenFilePicker`). Small harness addition (~30–50 LOC) shared with any future file-import e2e work.
- `FS-2.3-49` ❌ Right-click empty tree area — needs real mouse coordinates and `contextmenu` event on non-node targets. Could fold into Theme D if approached together; lands as ~10 LOC of Playwright `mouse.move` + `mouse.down` + `dispatchEvent`.

**Estimated shape:** 4 small PRs, each independent; or fold `FS-2.3-49` into Theme D's PR.

---

## Theme G — WebKit fidelity (PR #160 local-smoke skips)

**Different shape from the deferred-promotion themes:** these cases are ✅ on Chromium (CI) and ⏭ skipped on WebKit (`npm run test:e2e:webkit` local smoke). They're flaky-under-engine, not blocked-by-harness. Real fixes are real bug investigations.

**Cases:**
- `TAB-11.2-10` ⏭ on WebKit — alphaTab second-render page crash (`e2e/tab_reopen_fidelity.spec.ts:test.skip(browserName === "webkit", ...)`). Same fragility class as `TAB-11.2-08` and the closed-epic alphaTab deferrals. Likely needs alphaTab upstream fix or a render-debounce in `TabView`.
- `LINK-5.5-01` ⏭ on WebKit — right-pane editor content-swap timing exceeds 5s under WebKit's slower module-init / IndexedDB cycle (`e2e/wiki_link_navigation.spec.ts`). Likely fixable with longer poll budget or an explicit `data-` attribute signalling "editor swap settled" — a small production tweak that's also defensive against future test flakiness.

**Estimated shape:** 1 PR per case (separate root causes); or a single bundled "WebKit fidelity pass" PR that ships both fixes. Defer until someone is annoyed by the local smoke or until the WebKit pre-release gate becomes a hard requirement.

---

## Branch convention

Themes are independent; pick the slug from the theme name.

| Work | Branch |
|---|---|
| Theme A (production bundle) | `feat/test-cases-pwa-harness` (or `fix/test-cases-shell-1.15-03` for the standalone unit test) |
| Theme B (editor-ref) | `feat/test-cases-editor-ref` |
| Theme C (test_server events) | `feat/test-cases-watcher-events` |
| Theme D (visual / hover) | `feat/test-cases-visual-hover` |
| Theme E (production tweaks) | `fix/test-cases-<CASE-ID>` per item — e.g. `fix/test-cases-link-5.1-12-rename-order` |
| Theme F (one-offs) | `fix/test-cases-<CASE-ID>` per item — e.g. `fix/test-cases-tab-11.4-06-file-picker-mock` |
| Theme G (WebKit fidelity) | `fix/webkit-<spec-slug>` — e.g. `fix/webkit-alphatab-second-render` |

Each item / theme merges via PR (main is protected) before the next begins on the same branch namespace. Themes can ship in parallel.

---

## Project conventions

These are non-negotiable; don't relitigate them mid-work. Lifted from the closed-out Tauri + Claude Integration handoff.

- **`main` is protected.** Direct push blocked. Always create a PR.
- **Branch-per-task.** `git checkout -b <branch>` BEFORE the first commit; never commit on `main`.
- **No git worktrees.** Per the user's MEMORY.md preference. Work on feature branches directly.
- **No doc-only PRs.** Handoff edits + Features.md updates + test-cases/ status flips ride with the feature PR they belong to.
- **`Features.md` and `test-cases/` updates ride with the source code change** in the same PR. No silent drift.
- **Match `.nvmrc` before `npm ci`.** `nvm use` first; the worktree-baseline preference exists because newer npm produces lockfiles older CI npm rejects.
- **Don't skip hooks.** No `--no-verify` on commits, no `-c commit.gpgsign=false`. If a pre-commit hook fails, fix the root cause and create a NEW commit (never amend a hook-failed commit).
- **POSIX-relative paths only across IPC** (closed-epic spec § 6.5). Frontend never sees absolute paths.
- **Cross-platform discipline** (closed-epic spec § 5). macOS-only-shipping but Linux-port-clean.
- **Subagent-driven execution is the default.** When picking up the next theme from this doc, dispatch via `superpowers:subagent-driven-development` immediately — do not pause to ask "subagent or inline?". The user will redirect if a different approach is wanted.
- **`git branch -D` is permitted when the remote branch is gone.** Pre-condition: `git fetch --prune origin` shows the remote branch deleted (`[origin/<branch>: gone]`). Otherwise the original "no `-D` without explicit say-so" rule still stands.
- **`test-cases/` status flip rides with the test commit.** When a test lands that covers a case, flip ❌ → ✅ in the same commit. Do not batch flips into a separate "status update" commit.

---

## Out of scope (do not pull into this handoff)

- **Full `dispatch.rs` AppHandle expansion** for `settings_*`, `term_*`, `claude_*`, `skill_*` test_server commands. Sized as fresh-epic in the closed-out handoff. If a residual touches it, **stop and spin up a new handoff/spec/plan**. The watcher event-stream (Theme C) is the *only* AppHandle-adjacent surface that ships in this portfolio.
- **Production code refactors** beyond the small seams named in Theme E (ref exposure, `onMoveItem`, watcher-driven editor reload, basename fallback, `.kbjson` filter). Anything wider belongs in a fresh handoff.
- **Rewrite of the 41 legacy `fsMock.ts`-based specs.** Pinned out of scope by MVP-5 and remains so here.
- **WKWebView fidelity automation.** Per PR #160's investigation, this is months-to-indefinite (Apple's WKWebView lacks DOM-aware WebDriver path; upstream Tauri PR #15295). Theme G is the local-smoke alternative; real WKWebView automation is **not** planned.

---

## Next Action

**Pick any theme from the table.** They're independent — there's no required order. Recommended starting points by effort / payoff:

1. **Quick wins (one-line PRs, ship today):**
   - `LINK-5.1-12` — decide rename order (Theme E). Either reorder `propagateRename` or rewrite the case. Trivial either way.
   - `TAB-11.2-12` — decide basename fallback (Theme E). Either patch `TabView` or rewrite the case to assert `"Untitled"`.
   - `SHELL-1.15-03` — Next 16 metadata-classifier unit test (Theme A sub-theme). Vitest assertion on `app/layout.tsx` exports.

2. **Highest-leverage harness work (unblocks multiple cases):**
   - **Theme B** (editor-ref) unblocks 4 unit-test promotions with one production seam.
   - **Theme C** (test_server event-stream) unblocks 2 e2e promotions and is the foundation if the broader AppHandle expansion is ever attempted.
   - **Theme A** (production-bundle backend) unblocks 4 cases sharing the same harness gap.

3. **Visual/hover sweep (Theme D)** — 5 cases, mostly mechanical Playwright specs. Good "warm-up" PR if returning to this work after a context break.

4. **Theme G (WebKit fidelity)** — defer until someone runs the local smoke and is annoyed, OR until WebKit pre-release becomes a hard release gate.

**Bootstrap for any theme:**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only
git checkout -b <branch from convention table above>
# Read the theme's section above + the test-cases/*.md entries it cites.
# Lift the `note:` annotation from the case as part of the same commit that flips ❌ → ✅.
# If the theme is bigger than expected (esp. Theme C touching beyond watcher events),
# stop and spin up a fresh handoff doc per the Out-of-scope section.
gh pr create --title "..." --body "..."
```

**Update this doc on the same branch** before the first task commit, per the Doc-update protocol — flip the theme status to "🚧 In progress on `<branch>`" and bump Last updated. After the PR merges, flip the theme status to "✅ Merged via PR #<N>" and the per-case statuses inline.
