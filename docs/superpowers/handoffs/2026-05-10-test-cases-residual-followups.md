# Test-Cases Residual Follow-Ups — Session Handoff

> **Purpose:** A pointer document so an LLM session with no prior context can resume work on the **portfolio of small follow-up PRs** carrying forward from the now-closed Tauri + Claude Integration epic. Read top-to-bottom, run the bootstrap commands, then jump to **Next Action** to pick a theme.

**Last updated:** 2026-05-10 (Theme A item `SHELL-1.15-04` in progress on `fix/test-cases-shell-1.15-04-sw-register` — Vitest in `src/app/knowledge_base/shell/ServiceWorkerRegister.test.tsx` toggles `NODE_ENV` via `vi.stubEnv` against a mocked `navigator.serviceWorker.register`; asserts production registers `/sw.js`, dev/test do not, and `NEXT_PUBLIC_BASE_PATH` prefixes the path. The "needs production-bundle e2e backend" framing was wrong by the same logic that retired SHELL-1.15-01 / 02 / 03 — the NODE_ENV gate is a runtime branch we can drive directly). Tracks **9 items**: 7 ❌ deferred test-case promotions + 0 🟡 + 2 WebKit-only ⏭ skips (`TAB-11.2-10`, `LINK-5.5-01`) from PR #160's local engine-fidelity smoke. **No epic shape; portfolio of independent small PRs.** Each item ships as a discrete PR against `main`.

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
| **A** | Production-bundle e2e backend (PWA / SW / manifest) | 5 (4 ✅ shipped, 1 ❌) | 🚧 In progress on `fix/test-cases-shell-1.15-04-sw-register` — `SHELL-1.15-01..04` ✅; only `TAB-11.3-20` remains | `SHELL-1.15-01`, `SHELL-1.15-02`, `SHELL-1.15-03`, `SHELL-1.15-04` |
| **B** | Live-MarkdownEditor editor-ref access | 5 (5 ✅ shipped) | ✅ Merged | `feat/test-cases-editor-ref` (Path 1 — 4 unit-test promotions) + `fix/test-cases-doc-4.2-06-rescope` (re-scope) |
| **C** | `test_server` event-stream wiring (vault_watch_start) | 2 | ❌ Open | — |
| **D** | Visual / hover / focus-visible assertions | 5 (5 ✅ shipped) | ✅ Merged | `feat/test-cases-visual-hover` (5/5 in one PR) |
| **E** | Production-code adjustments (DnD, watcher reload, filters, etc.) | 7 (2 ✅ shipped, 5 ❌) | 🚧 Partial — `TAB-11.2-12` ✅, `LINK-5.1-12` ✅ | `TAB-11.2-12`, `LINK-5.1-12` |
| **F** | Single-case oddities (color-scheme priming, file-picker mock, etc.) | 4 (4 ✅ shipped) | 🚧 In progress on `fix/test-cases-shell-1.11-12-diagram-commands` — all four ✅ when this PR merges | `FS-2.3-49`, `SHELL-1.13-05`, `TAB-11.4-06`, `SHELL-1.11-12` |
| **G** | WebKit fidelity (PR #160 local-smoke skips) | 2 | ⏭ Skip-guarded on Chromium-clean | — |

**Open / total:** 7 / 27 deferred-promotion items + 2 / 2 WebKit-fidelity items. = 9 / 29 still tracked. 20 shipped (`SHELL-1.15-03`, `TAB-11.2-12`, `LINK-5.1-12`, `SHELL-1.13-06`, `SHELL-1.16-01`, `SHELL-1.16-02`, `SHELL-1.16-04`, `FS-2.3-45`, `DOC-4.3-38`, `DOC-4.3-39`, `DOC-4.5-13`, `DOC-4.5-18`, `DOC-4.2-06`, `FS-2.3-49`, `SHELL-1.13-05`, `TAB-11.4-06`, `SHELL-1.11-12`, `SHELL-1.15-02`, `SHELL-1.15-01`, `SHELL-1.15-04`).

---

## Theme A — Production-bundle e2e backend (PWA / SW / manifest)

**Blocker:** the MVP-4.x e2e harness boots `next dev` (`:3000`), so service-worker, `metadata.manifest`, and Lighthouse-style audits don't apply (`ServiceWorkerRegister` only registers when `NODE_ENV === "production"`). Promotion needs an alternate harness path that serves the production build (e.g. `next build && next start` side-car wired into `scripts/run-e2e.sh`, or a separate `playwright.config.ts` project for production-only specs).

**Cases:**
- `SHELL-1.15-01` ✅ Manifest serves at `/manifest.json` — `e2e/manifest_serving.spec.ts` uses Playwright's `request.get('/manifest.json')` against `next dev` (which serves `public/*` at the root URL) and asserts a 200 with the expected JSON shape (`name`, `theme_color`, `icons[].src`). The case's "needs production-bundle backend" framing was wrong: `next dev` already serves the manifest in dev, so no production-bundle harness is required.
- `SHELL-1.15-02` ✅ Layout references manifest via `metadata.manifest` — Vitest classifier check in `src/app/layout.test.ts` asserts `metadata.manifest === "${basePath}/manifest.json"` (where `basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""`). Same shape as `SHELL-1.15-03` — the case's "needs production bundle" framing was wrong because the metadata export itself can be classifier-checked without rendering.
- `SHELL-1.15-04` ✅ Service worker registered in production — Vitest in `src/app/knowledge_base/shell/ServiceWorkerRegister.test.tsx` toggles `NODE_ENV` via `vi.stubEnv` against a mocked `navigator.serviceWorker.register`. Asserts: production registers `/sw.js`; development and test mode do not register; `NEXT_PUBLIC_BASE_PATH` prefixes the path. The case's "needs production-bundle backend" framing was wrong — the NODE_ENV gate is a runtime branch.
- `TAB-11.3-20` ❌ Service-worker cache hit on second load — `/soundfonts/sonivox.sf2` served from cache after first fetch.
- `SHELL-1.15-03` ✅ `themeColor` lives in viewport export (Next 16) — Vitest classifier check shipped at `src/app/layout.test.ts` (asserts `viewport.themeColor` is a non-empty string and `metadata.themeColor` is undefined). Mocks `next/font/google` + globals so the layout module imports cleanly under jsdom.

**Estimated shape:** 1 PR remaining for the production-bundle harness, which still gates `TAB-11.3-20` (SW cache hit on second SoundFont load — the only Theme A item that genuinely needs the SW running, not just the registration logic). All four registration / metadata / manifest sub-themes (`SHELL-1.15-01..04`) shipped via Vitest or `next dev` — none needed a production bundle, contra the original framing.

---

## Theme B — Live-MarkdownEditor editor-ref access

**Blocker:** `MarkdownEditor` (Tiptap host) doesn't expose its editor instance via ref. JSDOM's Selection doesn't propagate to ProseMirror, and Tiptap keymaps close over `this.editor` and `view.dispatch` so they can't be driven from the public component surface.

**Two viable paths:**
1. **Production seam** — add a `ref` prop to `MarkdownEditor` that exposes `editor: Editor | null`. Tests use `ref.current.editor.commands.…` for selection / keypress drives. Smallest surface change; production code stays unchanged otherwise.
2. **e2e promotion** — move the cases out of unit tests entirely and drive them via Playwright on a real ProseMirror DOM. Heavier per-case but no production change.

Path 1 is preferred (smaller surface change; tests stay fast). Watch out: per `feedback_tiptap_editable_reactivity.md` in MEMORY, Tiptap's `editable` prop is not reactive — make sure the ref lifecycle plays nicely with `useEditor`.

**Cases:**
- `DOC-4.2-06` ✅ **Re-scoped to assert round-trip** — case rewritten to pin `markdownToHtml` → `htmlToMarkdown` round-trip preservation for `- [ ] / - [x]` entries; new Vitest in `markdownSerializer.test.ts`. Re-scope chosen over the markdown-it task-list plugin because adopting the plugin would change persisted disk shape — explicitly out-of-scope.
- `DOC-4.3-38` ✅ Enter in rawBlock-in-listItem splits — Vitest in `MarkdownEditor.tiptapEditorRef.test.tsx`.
- `DOC-4.3-39` ✅ Backspace at top-level rawBlock merges into previous textblock — same file.
- `DOC-4.5-13` ✅ Force-exit rawBlock before structural commands — same file (uses `forceExitRawBlock` + `chain().toggleBulletList()` like the toolbar).
- `DOC-4.5-18` ✅ Link button with selection wraps the run — same file (uses `chain().focus().extendMarkRange("link").setLink({ href }).run()`).

**Path 1 shipped:** `tiptapEditorRef?: React.MutableRefObject<Editor | null>` prop on `MarkdownEditor` mirrors the live editor instance via a `useEffect`. Production callers leave it unset; tests that need to drive selection / keymap / commands set `ref.current` and operate on it. Critical implementation note for future tests: **markdownReveal auto-converts the cursor block to a rawBlock** — when the cursor leaves, the block restores to rich content. Tests that need a paragraph at a known position must place the cursor elsewhere before asserting.

**Remaining shape:** 1 decision PR for `DOC-4.2-06` (re-scope to assert "Untitled" / current `disabled checkbox` shape, OR add markdown-it task-list plugin and change persisted markdown — re-scope is the safer call given disk-shape sensitivity).

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

**Cases (all ✅ shipped via `e2e/visual_hover_focus.spec.ts` on `feat/test-cases-visual-hover`):**
- `SHELL-1.13-06` ✅ Visible focus ring — Tab-walks to the header theme toggle and asserts `box-shadow: 0 0 0 2px …`; mouse-driven click does not match.
- `SHELL-1.16-01` ✅ Tab → tooltip — Tab focus on theme toggle flips bubble visibility/opacity.
- `SHELL-1.16-02` ✅ Hover → tooltip — pointer hover on the command-palette trigger flips visibility from hidden → visible.
- `SHELL-1.16-04` ✅ Disabled → no tooltip — opens a doc; PaneHeader Discard button mounts disabled; hover keeps `display: none` on the bubble.
- `FS-2.3-45` ✅ Folder New ▸ submenu — right-click `drawings` folder; hover "New"; assert Diagram / Document / SVG / Folder items render.

**Implementation notes (for future themes):**
- Tooltip-bubble locator: prefer `.kb-tooltip { has: trigger }` wrapper + `[role="tooltip"]` over the `aria-describedby` id — React's `useId()` output churns and CSS `#id` selectors require valid identifier syntax.
- Focus-ring assertion: blur the active element before mouse-clicking the trigger so chromium's `:focus-visible` heuristic treats the click as fresh mouse-driven focus.
- Tab-walk targeting: `theme-toggle` is the most reliable Tab-focus target post-vault-load; explorer-tree depth can swallow many Tab hops before chrome buttons see focus.

---

## Theme E — Production-code adjustments

These can't ship as test-only PRs — each requires a small touch in `src/app/knowledge_base/` or a product decision before the test can be written or promoted.

**Cases:**
- `LINK-5.1-10` ❌ **DnD-driven move** — production move is HTML5 drag-and-drop with `dataTransfer.getData("text/plain")`. Synthetic drops in headless Chromium return `""`. **Two paths:** (a) CDP-level real drag driver via Playwright; (b) production seam exposing `onMoveItem(sourcePath, targetPath)` directly via test_server. Path (b) is smaller. ~1 PR including production seam.
- `LINK-5.1-12` ✅ **Atomic-rename invariant shipped** — case rewritten to match the shipped index-first ordering (production updates the link-index first via `renameDocumentInIndex`, then walks the pre-rename `getBacklinksFor` snapshot to rewrite source files). New Vitest in `useFileExplorer.helpers.test.ts` asserts the post-completion invariant: index points to new path AND every backlink file contains the new path; no `[[oldPath]]` reference remains. No production code change.
- `LINK-5.2-03` ❌ **Deleted doc's links become red pills** — production `deleteDocumentWithCleanup` strips `[[x]]` from disk; open editor doesn't reload. Needs **either** disabling the strip flow **or** wiring watcher-driven editor reload. Watcher reload is the more useful change (covers more scenarios) but bigger.
- `LINK-5.4-03` ❌ Same constraint as `LINK-5.2-03`; ships in the same PR.
- `TAB-11.2-12` ✅ **Basename-fallback leg shipped** — added `paneTitleFor` helper at `src/app/knowledge_base/features/tab/paneTitle.ts` (8 unit tests) consumed by `TabView`; pane title falls back to file basename when `\title` is absent or alphaTab returns the `"Untitled"` sentinel. New e2e leg in `e2e/tab_h1_derivation.spec.ts` asserts `pane-title` reads "untitled-no-title" for the existing fixture.
- `FS-2.3-73` ❌ `.kbjson` filter — `vaultIndexRepoTauri.ts` extension filter doesn't include `.kbjson`. Promotion needs **production filter expansion**, then the e2e is straightforward. Out of scope per the closed epic's Decision 5; reopen only if attachment-cleanup behaviour for `.kbjson` is genuinely user-facing.
- `DOC-4.2-06` ❌ overlap with Theme B — see notes there. (Counted in Theme B; not double-counted.)

**Estimated shape:** 4–5 PRs (LINK-5.1-12 + TAB-11.2-12 each one-line decision PRs; LINK-5.1-10, LINK-5.2-03+5.4-03, FS-2.3-73 each separate small PRs).

---

## Theme F — Single-case oddities

Each is a one-off blocker that doesn't share a theme with the others.

**Cases:**
- `SHELL-1.13-05` ✅ `prefers-color-scheme` precedence — `e2e/theme_priming.spec.ts` uses `test.use({ colorScheme })` so the browser context provisions the emulation before `page.goto()` runs; both dark and light branches are asserted.
- `SHELL-1.11-12` ✅ Diagram commands present when diagram open — `e2e/diagram_palette_commands.spec.ts` seeds a single-node `diagram.json` via test_server's `vault_write_json` invoke, clicks the node to select, opens the palette under `>Diagram`, and asserts both `Toggle Read / Edit Mode` and `Delete Selected` appear. Note: the original "needs pointer-event harness" framing was overestimated — `[data-testid="node-n1"]`.click() is sufficient to seed selection, mirroring the existing `diagramKeyboard.spec.ts` pattern; the harness gap was actually the obsolete `installMockFS` boot path, which the modern `installShim + makeTempVault` flow side-steps.
- `TAB-11.4-06` ✅ End-to-end import flow — `e2e/tab_gp_import.spec.ts` drives the palette command, sends bytes via Playwright's built-in `filechooser` event, and asserts the resulting `.alphatex` opens in a tab pane. Production uses a hidden `<input type="file">` + `input.click()` (not `showOpenFilePicker`), so no custom mock layer is needed — the case note's premise was wrong and was rewritten as part of the flip. Bytes are alphaTex disguised as `.gp7`; alphaTab's `ScoreLoader.buildImporters()` falls through GP3-5/Gpx/Gp7-8/MusicXml/Capella → `AlphaTexImporter`, so no real Guitar Pro fixture is needed.
- `FS-2.3-49` ✅ Right-click empty tree area — Playwright case appended to `e2e/visual_hover_focus.spec.ts`; right-click below the last tree row surfaces the same root folder context menu asserted by FS-2.3-45.

**Estimated shape:** 0 PRs remaining — Theme F is fully shipped. `FS-2.3-49` folded into Theme D's PR, `SHELL-1.13-05` via `e2e/theme_priming.spec.ts`, `TAB-11.4-06` via `e2e/tab_gp_import.spec.ts`, `SHELL-1.11-12` via `e2e/diagram_palette_commands.spec.ts`.

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

1. **Quick wins** — all three named ones are now shipped. Remaining work is harness-leverage (Theme B/C/A) or the visual-hover sweep (Theme D); see § 2 below.
   - ~~`LINK-5.1-12` — decide rename order (Theme E).~~ **✅ Shipped 2026-05-10 via `fix/test-cases-link-5.1-12-rename-order`** (case rewritten to match shipped index-first ordering; new Vitest asserts post-completion atomicity).
   - ~~`TAB-11.2-12` — decide basename fallback (Theme E).~~ **✅ Shipped 2026-05-10 via `fix/test-cases-tab-11.2-12-basename-fallback`.**
   - ~~`SHELL-1.15-03` — Next 16 metadata-classifier unit test (Theme A sub-theme). Vitest assertion on `app/layout.tsx` exports.~~ **✅ Shipped 2026-05-10 via `fix/test-cases-shell-1.15-03`.**

2. **Highest-leverage harness work (unblocks multiple cases):**
   - ~~**Theme B** (editor-ref) unblocks 4 unit-test promotions with one production seam.~~ **✅ Mostly Shipped 2026-05-10 via `feat/test-cases-editor-ref` (4/5 cases). `DOC-4.2-06` still open — re-scope decision pending.**
   - **Theme C** (test_server event-stream) unblocks 2 e2e promotions and is the foundation if the broader AppHandle expansion is ever attempted.
   - **Theme A** (production-bundle backend) unblocks 4 cases sharing the same harness gap.

3. ~~**Visual/hover sweep (Theme D)**~~ — **✅ Shipped 2026-05-10 via `feat/test-cases-visual-hover` (5/5 cases in one PR).**

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
