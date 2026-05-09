# MVP-5 — Test-cases promotion sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk every `❌` entry in the eight MVP-5 sweep-target buckets in `test-cases/` and dispose of it — promote to `✅` / `🟡` / `🧪` by writing the test, retire to `🚫` with a one-line reason when the underlying feature was retired in MVP-1d/1e, or keep `❌` with an inline `note: see MVP-5 follow-up …` when the case requires a deferred capability (test_server expansion, WKWebView fidelity, real PWA service-worker harness, etc.).

**Architecture:** **Decision-driven sweep.** Per-bucket phases (one phase per file, in increasing-friction order) each containing four sub-task groups: (1) inventory + triage markdown edit (one commit), (2) implement the 🅐 cases — split into 🅐-e2e (Playwright spec under `e2e/` mirroring the four MVP-4.x proof-set specs) and 🅐-unit (Vitest cases added to existing `*.test.ts` files where the unit lives), (3) flip 🅒 retirements + add `note:` to 🅑 deferreds (markdown edit), (4) run the four proof-set + every newly-added spec via `bash scripts/run-e2e.sh`, plus `npm run test:run` for unit promotions, and commit-checkpoint. The MVP-4.x harness (`e2e/helpers/{launchApp,tauriShim,tempVault}.ts` + `test_server :1421` axum binary + `:3000 next dev` + chromium init-script shim) is the contract — **no `src-tauri/src/test_server/dispatch.rs` expansion in this MVP**, no production-code changes under `src/app/knowledge_base/`, no migration of the 41 legacy `e2e/fixtures/fsMock.ts`-based specs.

**Tech Stack:** TypeScript (Playwright 1.x against chromium-only via test_server + next dev; Vitest + JSDOM for unit promotions). No Rust changes in this MVP.

> **Branch:** `feat/tauri-mvp5-test-promotion` (cut from `main` at `6903077` after MVP-4.x / PR #158 merged; the handoff-doc bump is the only uncommitted change on the branch when this plan lands).
> **Spec reference:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 9 (testing strategy parent) + § 10 (MVP-5 promote-blocked-cases parent).
> **Format template:** `docs/superpowers/plans/2026-05-09-tauri-mvp4x-real-e2e-ci-plan.md` (the just-merged MVP-4.x plan).
> **Owner:** Single-PR ship (or split per-bucket-PR if Phase 1 surfaces unforeseen friction). Subagent-driven execution (default per MEMORY.md). One commit per task; the PR is opened only after Phase 9's full-suite stability gate passes.

---

## Scope decisions pinned (do not relitigate mid-MVP)

These six were debated, decided in the plan-writing brief + advisor pass, and are restated here so reviewers do not re-open them mid-execution. If you think one is wrong, raise it in the PR description — do not silently change the plan.

1. **Bucket ordering: file-system first.** Phases run `02-file-system → 04-document → 05-links-and-graph → 06-shared-hooks → 11-tabs → 07-persistence → 01-app-shell → 06-svg-editor`. File-system first because the test_server's vault surface (`vault_set_root` / `vault_read_text` / `vault_write_text` / `vault_list` / `vault_rename` / `vault_delete` / `vault_exists` / `vault_read_bytes` / `vault_write_bytes` / `vault_read_json` / `vault_write_json` / `make_temp_vault`) is the **fully-supported** subset of `dispatch.rs`; document + links + tabs all depend on the file-system primitives; shared-hooks is mostly Vitest; persistence and app-shell carry the heaviest load of 🅑 deferreds (PWA service-worker harness, settings/term/skill AppHandle commands); svg-editor is canvas-heavy and will need either MutationObserver harness work or a deferred-with-note pass.
2. **Per-case shape: split 🅐 into 🅐-e2e and 🅐-unit, group by surface.**
   - **🅐-e2e** lands as a Playwright spec under `e2e/`. The four proof-set specs are the precedent: one spec file per logical surface (e.g. `e2e/command_palette.spec.ts` covers SHELL-1.11-06/07/10/11/12/13/14 in seven `test()` blocks under one `test.describe`), one test block per case ID. Spec filenames use `snake_case` for new specs to match the MVP-4.x proof-set convention (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`); the existing legacy spec filenames stay camelCase and we don't rename them.
   - **🅐-unit** lands in the existing Vitest file where the unit lives (e.g. `historyPersistence.test.ts` for HIST-5.4-04/05, `vaultConfigRepoTauri.test.ts` for SHELL-1.13-08). **Do not create parallel new test files** for cross-references; if no existing file owns the unit, the case is 🅑 not 🅐.
   - In both surfaces, the `it('<ID>: …')` / `test('<ID>: …')` title prefix is the case ID so grep finds both directions, per `test-cases/README.md` § "Linking cases ↔ tests".
3. **No `test_server` expansion in MVP-5.** Per the brief's "deferred" pin and `dispatch.rs` line 200's "AppHandle-dependent" comment. Cases requiring `vault_pick`, `vault_watch_start` (to deliver events, not just `Ok(null)`), `term_*`, `claude_send` / `claude_interrupt` / `claude_reset`, `skill_status` / `skill_install_from_bundle`, real `settings_write` persistence — all become 🅑 with a `note: see MVP-5 follow-up — needs test_server expansion (<which command>)` and a one-line PR-description bullet capturing the future-MVP candidates.
4. **No WKWebView fidelity tests.** Path 4 territory (deferred indefinitely per the MVP-4.x post-mortem). Cases that genuinely require WKWebView to render (visual regressions, native focus rings, OS-pref `prefers-color-scheme` propagation, native context-menu suppression, etc.) stay `❌` with an inline `note: Path 4 / out of scope` tag.
5. **No production code changes under `src/`.** The MVP-4.x harness was designed so existing markup is the contract. If a 🅐 case genuinely cannot land without a production-code testid or refactor, it is **demoted to 🅑 with a `note: needs <X> markup hook before promotion`**, NOT promoted with a side production-code patch in this MVP. The exception: `Features.md` and `test-cases/*.md` updates ARE in scope (they ride with this PR per CLAUDE.md's same-change-set rule).
6. **🅐-unit cases for unit-level gaps go into existing `*.test.ts` files.** Established locations:
   - HIST-5.4-04/05 → `src/app/knowledge_base/shared/utils/historyPersistence.test.ts`
   - HIST-5.6-01 → same file (or `tauriBridge.test.ts` cross-ref via mocked module)
   - SHELL-1.13-08 → `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts`
   - LINK-5.1-12 → `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts` (where `propagateRename` lives)
   - DOC-4.5-13/18 → `src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx` (existing Tiptap integration harness — see DOC-4.5-08 precedent which also notes the JSDOM caveat)
   - DOC-4.2-06, DOC-4.3-34/35/38/39/40 → same `MarkdownEditor.test.tsx`
   These are the **only** authorized destinations for 🅐-unit cases in this MVP. If a candidate doesn't fit one of these files, demote to 🅑.

---

## Out of scope (anti-goals — lift verbatim into PR description)

- **Expanding `src-tauri/src/test_server/dispatch.rs` past its current 27-command surface.** Per Decision 3.
- **Rewriting the 41 legacy `e2e/fixtures/fsMock.ts`-based specs.** They predate the FSA→Tauri migration and most are dead post-MVP-1d (see e2e directory listing). The plan flags individual spec-file retirement candidates inline (file path + one-line reason) as part of the per-bucket markdown sweep, but the actual spec-file deletion is a follow-up MVP. (If a legacy spec is *still relevant* and just needs migration to the shim, that work goes in the right bucket as a 🅐-e2e case — but the inventory below shows none of the eight buckets' ❌s need that, so this stays a follow-up.)
- **Touching production code under `src/app/knowledge_base/`.** Per Decision 5.
- **Writing specs for cases already `✅` / `🧪` / `🟡` / `🚫`.** Inventory pass scopes to `❌` only.
- **Expanding `Features.md`** unless a case discovers an undocumented feature. Inventory pass found none.
- **WKWebView fidelity, visual regression, screenshot diffs, performance benchmarks, the 5 pre-MVP-4 clippy lints.** Out per Decision 4 + brief.

---

## File map (what changes in this PR)

### Added (Playwright specs — 🅐-e2e)

Filenames + IDs covered listed inline; one `test.describe` per file. Counts assume the inventory below; the executor may collapse two adjacent describes into one file if all cases share fixtures + setup.

| Spec file | Cases | Bucket / phase |
|---|---|---|
| `e2e/explorer_search.spec.ts` | EXPL-2.7-03/04/05 | Phase 1 (02-file-system) |
| `e2e/explorer_recents.spec.ts` | EXPL-2.8-03/04/05/06/07, EXPL-2.9-02/03 | Phase 1 |
| `e2e/explorer_folder_delete_attachment_cleanup.spec.ts` | FS-2.3-72/73/74/75 | Phase 1 |
| `e2e/link_rename_cross_folder.spec.ts` | LINK-5.1-10 | Phase 3 (05-links-and-graph) |
| `e2e/link_delete_pill_state.spec.ts` | LINK-5.2-03 | Phase 3 |
| `e2e/link_dirty_propagation.spec.ts` | LINK-5.4-02, LINK-5.4-03 | Phase 3 |
| `e2e/wiki_link_navigation.spec.ts` | LINK-5.5-01/02/03/06 | Phase 3 |
| `e2e/tab_h1_derivation.spec.ts` | TAB-11.2-12, TAB-11.2-04 | Phase 5 (11-tabs) |
| `e2e/tab_reopen_fidelity.spec.ts` | TAB-11.2-10 | Phase 5 |
| `e2e/svg_create.spec.ts` | SVG-6.1-01/02/03 | Phase 8 (06-svg-editor) |
| `e2e/svg_pane_chrome.spec.ts` | SVG-6.2-02 | Phase 8 |
| `e2e/command_palette.spec.ts` | SHELL-1.11-06/07/10/11/12/13/14 | Phase 7 (01-app-shell) |
| `e2e/pane_layout_restore.spec.ts` | SHELL-1.4-14 | Phase 7 |
| `e2e/theme_tokens.spec.ts` | SHELL-1.13-07, SHELL-1.13-09 | Phase 7 |

### Modified (Vitest test files — 🅐-unit)

| File | Cases | Bucket / phase |
|---|---|---|
| `src/app/knowledge_base/shared/utils/historyPersistence.test.ts` | HIST-5.4-04, HIST-5.4-05, HIST-5.6-01 | Phase 4 (06-shared-hooks) |
| `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts` | SHELL-1.13-08 | Phase 7 (01-app-shell) |
| `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts` | LINK-5.1-12 | Phase 3 (05-links-and-graph) |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx` | DOC-4.1-02, DOC-4.2-06, DOC-4.3-34, DOC-4.3-35, DOC-4.3-38, DOC-4.3-39, DOC-4.3-40, DOC-4.5-13, DOC-4.5-18 | Phase 2 (04-document) |
| `src/app/knowledge_base/features/tab/TabView.test.tsx` | TAB-11.2-01 | Phase 5 (11-tabs) |

### Modified (test-cases markdown — every phase)

- `test-cases/01-app-shell.md`
- `test-cases/02-file-system.md`
- `test-cases/04-document.md`
- `test-cases/05-links-and-graph.md`
- `test-cases/06-shared-hooks.md`
- `test-cases/06-svg-editor.md`
- `test-cases/07-persistence.md`
- `test-cases/11-tabs.md`
- `test-cases/README.md` — coverage snapshot table re-generated via the one-liner at the bottom of the file; the "Why ❌ gaps remain" section gets a one-line entry pointing at this MVP for the residual deferreds; the 2026-05-08 trailing note is updated to reflect MVP-5 having shipped.

### Modified (handoff)

- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — bumped on this branch's seed commit (already done by the parent session); will be re-bumped at PR-merge time per the post-merge cleanup protocol (Phase 9). Specifically: the `Where we are` table flips MVP-5 to `✅ Merged`, the `Reference architecture` block gains the spec list under MVP-5, the `Open follow-up items` block gains the residual 🅑 follow-up tickets, and the `Next Action` body changes to "Tauri-Claude-Integration epic ✅ closed" since MVP-5 is the last MVP.

### Out of scope (this PR will NOT touch)

- `src/**/*.{ts,tsx}` production code (Decision 5).
- `src-tauri/**/*.rs` (no `dispatch.rs` expansion per Decision 3; no other Rust changes needed).
- `e2e/fixtures/fsMock.ts` and the 41 legacy fsMock-based specs.
- `playwright.config.ts`, `scripts/run-e2e.sh`, `.github/workflows/ci.yml` (the MVP-4.x harness is the contract; specs added here ride on the existing infrastructure).

---

## Inventory + triage table (master)

Generated by walking each file under `test-cases/` and grep `'^- \\*\\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\\*\\* ❌'` (single-bullet form) — total **74 ❌ cases** across the eight target files. Disposition columns:

- 🅐**-e2e** = promote via Playwright spec under `e2e/` (one `test()` block per ID) using the harness from MVP-4.x; flip status to 🧪.
- 🅐**-unit** = promote via Vitest `it()` block in the existing test file listed in Decision 6; flip status to ✅.
- 🅑 = defer; keep `❌` and append `note: see MVP-5 follow-up — needs <reason>` to the case line. Each 🅑 lands in the bucket-footer roll-up.
- 🅒 = retire to `🚫`; rewrite the case line with the retirement reason + commit SHA from the handoff.
- ✅-flip = case is already implemented in code/CI and just needs a status flip with a citation. (Single instance: SHELL-1.18-01.)

| ID | Disposition | Why / where |
|---|---|---|
| **01-app-shell.md** | | |
| SHELL-1.4-14 | 🅐-e2e | `e2e/pane_layout_restore.spec.ts` — seed `localStorage.setItem('kb-pane-layout-<scope>', JSON.stringify(savedLayout))` via `page.evaluate()` before `setVaultPath` reload (advisor flagged the localStorage-seed pattern). |
| SHELL-1.10-15 | 🅑 | Needs test_server expansion: `vault_watch_start` is `Ok(null)` stub + `tauriShim.listen()` is no-op — events don't reach React. Future-MVP candidate (high value: validates the watcher pipeline). |
| SHELL-1.11-06 | 🅐-e2e | `e2e/command_palette.spec.ts` — backdrop click. |
| SHELL-1.11-07 | 🅐-e2e | Same spec — ↑/↓ navigation + boundary wrap. |
| SHELL-1.11-10 | 🅐-e2e | Same spec — ⌘K blocked inside contenteditable. |
| SHELL-1.11-11 | 🅐-e2e | Same spec — diagram commands absent when no diagram open. Needs `with_links` + diagram fixture seed. |
| SHELL-1.11-12 | 🅐-e2e | Same spec — diagram commands present when diagram open. |
| SHELL-1.11-13 | 🅐-e2e | Same spec — document commands present when document open. |
| SHELL-1.11-14 | 🅐-e2e | Same spec — `when` guard hides Delete Selected. |
| SHELL-1.13-05 | 🅑 | OS-pref `prefers-color-scheme` toggling — Playwright `page.emulateMedia` works in chromium but the MVP-4.x harness's `setVaultPath` reloads the page after vault set, racing the emulate-media call. `note: see MVP-5 follow-up — needs harness-level prefers-color-scheme priming hook`. |
| SHELL-1.13-06 | 🅑 | `:focus-visible` browser semantics — chromium supports it but assertion needs computed-style read after a real keyboard Tab. Plausible 🅐-e2e candidate; demote to 🅑 to keep MVP-5 within the per-bucket cadence (executor can promote it inline if scope tolerates — see Phase 7.5 escape hatch). |
| SHELL-1.13-07 | 🅐-e2e | `e2e/theme_tokens.spec.ts` — assert `getComputedStyle(el).fontSize === '15px'` for a `text-base` element. |
| SHELL-1.13-08 | 🅐-unit | `vaultConfigRepoTauri.test.ts` — `update({ theme: 'dark' })` round-trip; existing `name`/`version`/`created` survive. |
| SHELL-1.13-09 | 🅐-e2e | `e2e/theme_tokens.spec.ts` — programmatic WCAG contrast assertion against active explorer-row computed colors in both themes. |
| SHELL-1.15-01 | 🅑 | `/manifest.json` GET — `next dev` may or may not serve it directly without static export; Playwright's `request.get('/manifest.json')` is feasible but the file lives in `public/`, served only after `next dev`'s public-dir handling. `note: see MVP-5 follow-up — needs Playwright request.get harness check`. |
| SHELL-1.15-02 | 🅑 | `<head><link rel="manifest" …>` assertion — feasible via `page.locator('link[rel=manifest]')` but requires production-bundle behaviour, not dev. `note: see MVP-5 follow-up — needs production-bundle e2e backend (Path 4 territory or `next start` variant)`. |
| SHELL-1.15-03 | 🅑 | Same as SHELL-1.15-02 — `themeColor` viewport export is a Next 16 metadata classifier check, build-time, not runtime. Could be a unit test against `app/layout.tsx` exports if the file shape allows; `note: see MVP-5 follow-up — needs Next 16 metadata-classifier test pattern`. |
| SHELL-1.15-04 | 🅑 | Same — `NODE_ENV === "production"` gate; only production build registers the SW. `note: see MVP-5 follow-up — needs production-bundle e2e backend`. |
| SHELL-1.15-05 | 🅒 | **Retire** — `useOfflineCache.ts` was DELETED in MVP-1d Task 4 (PR #152, `0f5e152`). Verified via `ls src/app/knowledge_base/shared/hooks/useOfflineCache.ts` (file does not exist). Rewrite case line to `🚫 useOfflineCache deleted in MVP-1d (commit 0f5e152, PR #152) — Tauri ships native; no PWA cache path needed.` |
| SHELL-1.15-06 | 🅒 | **Retire** — same as SHELL-1.15-05; `useOfflineCache.ts` deleted in MVP-1d. |
| SHELL-1.16-01 | 🅑 | Tooltip on keyboard focus — `:has(:focus-visible)` is a chromium CSS feature and Playwright can drive Tab focus, but the assertion is "appears with no OS delay" which is timing-sensitive. Plausible 🅐-e2e but not in the eight-bucket cadence; `note: see MVP-5 follow-up — viable Playwright case, deferred to keep MVP-5 scoped`. |
| SHELL-1.16-02 | 🅑 | Same as SHELL-1.16-01 — hover surfaces tooltip. |
| SHELL-1.16-04 | 🅑 | Same — disabled trigger suppresses tooltip; CSS `:has(:disabled)` rule. |
| SHELL-1.18-01 | ✅-flip | macOS `tauri-build` CI job is **already green** per the handoff's `Landed (MVP-1d, PR #152)` block + `Landed (MVP-4.x, PR #158)` block (5/5 jobs green on 3 consecutive runs). Flip to ✅ with citation: `_(CI: macos-latest tauri-build job in `.github/workflows/ci.yml`; verified green on 3 consecutive runs preceding PR #158 merge — see handoff "Landed (MVP-4.x, PR #158)" CI block.)_` |
| **02-file-system.md** | | |
| FS-2.1-02 | 🅒 | **Retire** — `<input webkitdirectory>` fallback; verified via `grep -r webkitdirectory src/` (no production usages). Tauri shell never reaches the browser-only fallback path. Rewrite: `🚫 webkitdirectory fallback retired post-MVP-1a (Tauri shell uses `vault_pick`); production code removed via MVP-1a refactor.` |
| FS-2.3-45 | 🅑 | Folder context-menu "New ▸" submenu — hover-triggered submenu; chromium supports `page.hover` but the submenu position is mouse-coordinate-driven and the existing legacy `e2e/fileExplorerOps.spec.ts` already exercises folder context menus via `fsMock`. Migration of that spec is out of scope; `note: see MVP-5 follow-up — viable e2e under harness, deferred to keep MVP-5 scoped`. |
| FS-2.3-49 | 🅑 | Same as FS-2.3-45 — right-click empty tree area. `note: see MVP-5 follow-up — same as FS-2.3-45`. |
| FS-2.3-72 | 🅐-e2e | `e2e/explorer_folder_delete_attachment_cleanup.spec.ts` — needs new fixture `with_attachments` (a folder containing `.md` files referenced in `attachmentLinks.json`). |
| FS-2.3-73 | 🅐-e2e | Same spec — `.kbjson` rows. Same fixture. |
| FS-2.3-74 | 🅐-e2e | Same spec — `.alphatex` rows. Same fixture. |
| FS-2.3-75 | 🅐-e2e | Same spec — shell-modal path single-`withBatch`. Same fixture. |
| EXPL-2.7-03 | 🅐-e2e | `e2e/explorer_search.spec.ts` — ⌘F focuses `[data-testid="explorer-search"]`. |
| EXPL-2.7-04 | 🅐-e2e | Same spec — ⌘F no-op when focus inside an editor. |
| EXPL-2.7-05 | 🅐-e2e | Same spec — "Go to file…" palette command (chains with `e2e/command_palette.spec.ts` setup pattern). |
| EXPL-2.8-03 | 🅐-e2e | `e2e/explorer_recents.spec.ts` — recents dedup. Uses `with_links` fixture. |
| EXPL-2.8-04 | 🅐-e2e | Same spec — 11th-oldest dropped. Needs new fixture `with_many_files` (15 distinct `.md` files). |
| EXPL-2.8-05 | 🅐-e2e | Same spec — recents persists across reload. Note: `setVaultPath` itself reloads, so this test's reload is a second `page.reload()`. |
| EXPL-2.8-06 | 🅐-e2e | Same spec — recents header hidden when empty. |
| EXPL-2.8-07 | 🅐-e2e | Same spec — collapse toggle. |
| EXPL-2.9-02 | 🅐-e2e | Same spec — Unsaved group hidden when clean. |
| EXPL-2.9-03 | 🅐-e2e | Same spec — clicking Unsaved entry opens file. |
| **04-document.md** | | |
| DOC-4.1-02 | 🅐-unit | `MarkdownEditor.test.tsx` — focused-state tracking via `editor.on('focus' / 'blur')` mock. |
| DOC-4.2-06 | 🅐-unit | Same file — checkbox click on `[data-task-item]` updates markdown via `fireEvent.click`. |
| DOC-4.3-34 | 🅐-unit | Same file — paragraph cursor entry triggers rawBlock conversion. The Tiptap integration test harness (`MarkdownEditor.test.tsx` per DOC-4.5-08 precedent) supports cursor placement via ProseMirror commands. |
| DOC-4.3-35 | 🅐-unit | Same file — cursor exit re-parses via markdown-it. |
| DOC-4.3-38 | 🅐-unit | Same file — Enter in rawBlock smart-list-item handling. |
| DOC-4.3-39 | 🅐-unit | Same file — Backspace at rawBlock start merges with previous textblock. |
| DOC-4.3-40 | 🅐-unit | Same file — rawSwap meta flag suppresses `onUpdate`. |
| DOC-4.5-13 | 🅐-unit | Same file — force-exit rawBlock before structural commands. |
| DOC-4.5-18 | 🅐-unit | Same file — Link button with text selected wraps selection. |
| **05-links-and-graph.md** | | |
| LINK-5.1-10 | 🅐-e2e | `e2e/link_rename_cross_folder.spec.ts` — needs new fixture `with_links_in_folder` (a/notes/foo.md ↔ b.md `[[notes/foo]]`). Tests move-rename `notes/foo.md → other/bar.md` rewrites `[[notes/foo]]` → `[[other/bar]]`. |
| LINK-5.1-12 | 🅐-unit | `useFileExplorer.helpers.test.ts` — backlinks-first rename order (assert call sequence on a spy: `loadIndex` → `getBacklinksFor` → write target rewrites → write source rewrites → `renameDocumentInIndex`). |
| LINK-5.2-03 | 🅐-e2e | `e2e/link_delete_pill_state.spec.ts` — uses `with_links` fixture; deletes `a.md`, opens `b.md` in pane, asserts `[[a]]` pill renders without `bg-blue-100` (red unresolved state). |
| LINK-5.4-02 | 🅐-e2e | `e2e/link_dirty_propagation.spec.ts` — open `b.md` (NOT containing the to-be-renamed link); rename a different file; assert `b.md` not in `[data-testid="dirty-stack-indicator"]`. Needs an extra fixture file `c.md` with no `[[…]]` references. |
| LINK-5.4-03 | 🅐-e2e | Same spec — open `b.md` (with `[[a]]` link); delete `a.md`; assert pill flips to red without rename. |
| LINK-5.5-01 | 🅐-e2e | `e2e/wiki_link_navigation.spec.ts` — split view, click resolved wiki-link in left → opens in right. Uses `with_links` fixture; click target via `page.locator('.wiki-link.bg-blue-100')`. |
| LINK-5.5-02 | 🅐-e2e | Same spec — single-pane click opens in same pane. |
| LINK-5.5-03 | 🅐-e2e | Same spec — click unresolved wiki-link creates file. Uses `with_links` fixture extended with `b.md` linking to `[[nonexistent]]`. |
| LINK-5.5-06 | 🅐-e2e | Same spec — click `[[a#section]]` scrolls to heading. Needs `a.md` with `## section` heading injected into a fixture variant. |
| **06-shared-hooks.md** | | |
| HIST-5.4-04 | 🅐-unit | `historyPersistence.test.ts` — legacy fallback on read/parse failure tries `historyFileNameLegacy(filePath)`. Mock `tauriBridge.readText` to reject the new-style sidecar (or return malformed JSON), succeed on the legacy name. |
| HIST-5.4-05 | 🅐-unit | Same file — both new + legacy missing → returns `null`. |
| HIST-5.6-01 | 🅐-unit | Same file — `readHistoryFile` calls `tauriBridge.readText` and not any FSA `FileSystemDirectoryHandle` API. Vitest module-mock `tauriBridge` directly. |
| **06-svg-editor.md** | | |
| SVG-6.1-01 | 🅐-e2e | `e2e/svg_create.spec.ts` — folder right-click → New → SVG creates `untitled.svg`. Uses `with_folders` fixture (a folder + a file). |
| SVG-6.1-02 | 🅐-e2e | Same spec — explorer hover → New SVG icon button. (Hover affordance lives in `ExplorerPanel.tsx`.) |
| SVG-6.1-03 | 🅐-e2e | Same spec — click `.svg` file in explorer → opens SVG editor pane. Needs fixture seeded with one `.svg` file. |
| SVG-6.2-02 | 🅐-e2e | `e2e/svg_pane_chrome.spec.ts` — open SVG, draw on canvas (via dispatched events into `SVGCanvas`), assert PaneHeader shows Save+Discard. |
| **07-persistence.md** | | |
| PERSIST-7.3-15 | 🅒 | **Retire** — File System Access permission revocation; verified via `grep -r showDirectoryPicker src/` shows no production callsites. Rewrite: `🚫 FSA permission revocation retired post-MVP-1a — Tauri vault paths use Rust-side I/O; permission errors now surface via classified FileSystemError(kind="permission") (FS-2.6-03), not browser DOMException semantics.` |
| **11-tabs.md** | | |
| TAB-11.2-01 | 🅐-unit | `TabView.test.tsx` — assert `next/dynamic({ ssr: false })` import path; verify the `@coderline/alphatab` chunk is lazy-loaded by checking the dynamic-import promise hasn't fired before mount. |
| TAB-11.2-04 | 🅐-e2e | `e2e/tab_h1_derivation.spec.ts` (companion test, not separate file) — open a fixture `.alphatex` file, assert `[data-testid="tab-view-canvas"]` mounts within 2 s. **Caveat:** as TAB-11.3-19 / TAB-11.8-06 documented, alphaTab loading in headless chromium is environment-fragile; if this test flakes after one retry, demote to 🅑 with `note: see MVP-5 follow-up — environment-fragile (matches TAB-11.3-19 / TAB-11.8-06 caveat)`. |
| TAB-11.2-08 | 🅑 | Same as SHELL-1.10-15 — needs test_server expansion (`vault_watch_start` event delivery). `note: see MVP-5 follow-up — needs test_server vault_watch_start event-stream wiring`. |
| TAB-11.2-10 | 🅐-e2e | `e2e/tab_reopen_fidelity.spec.ts` — open fixture `.alphatex`, close pane, re-open, assert canvas re-renders identically (content fidelity only; scroll position out of scope per case copy). Same alphaTab fragility caveat as TAB-11.2-04 — if it flakes, demote to 🅑. |
| TAB-11.2-12 | 🅐-e2e | `e2e/tab_h1_derivation.spec.ts` — open fixture `.alphatex` with `\title "Greensleeves"`, assert PaneHeader title is "Greensleeves"; replace the fixture with one lacking `\title`, assert title falls back to file basename. |
| TAB-11.3-20 | 🅑 | Service-worker cache-hit assertion — needs production bundle + SW harness. `note: see MVP-5 follow-up — needs production-bundle e2e backend` (same family as SHELL-1.15-04). |
| TAB-11.4-06 | 🅑 | `.gp` import e2e — file-picker drive in chromium needs custom mock layer (the case copy already says so). `note: see MVP-5 follow-up — needs Playwright file-picker mock for the OS-native open-file dialog (test_server doesn't proxy `showOpenFilePicker`)`. |

---

## Fixture additions required

The four MVP-4.x proof-set fixtures are `empty/` (one `.gitkeep`) and `with_links/` (a.md + b.md + `.kb/config.json` and `.archdesigner/config.json` after `from_fixture` auto-seeds initialization). MVP-5 phases need three new fixtures (committed under `src-tauri/tests/fixtures/vaults/<name>/`):

- **`with_attachments/`** (Phase 1, FS-2.3-72..75) — a folder `notes/` containing `attached.md`, `attached.kbjson`, `attached.alphatex`, plus `.archdesigner/attachmentLinks.json` referencing all three. The fixture's seed JSON is the load-bearing piece; the executor writes the JSON shape based on what `attachmentLinksRepoTauri.read` returns in the production data model. Auto-init is fine (`{fixture: "with_attachments", initialized: true}`).
- **`with_many_files/`** (Phase 1, EXPL-2.8-04) — 15 distinct `.md` files at vault root (`f01.md` … `f15.md`), each containing `# F<NN>` and a paragraph. Auto-init fine.
- **`with_links_in_folder/`** (Phase 3, LINK-5.1-10) — `notes/foo.md` (a doc), `b.md` linking to `[[notes/foo]]`, `other/` (empty folder). Auto-init fine.
- **`with_folders/`** (Phase 8, SVG-6.1-01..03) — a folder `drawings/` (empty), a root file `existing.svg` (minimal `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>`), a root file `keep.md`. Auto-init fine.
- **`with_tab/`** (Phase 5, TAB-11.2-04/10/12) — root file `song.alphatex` containing a minimal `\title "Greensleeves"\n\\tempo 120\n.\n:4 0.6 2.6 |\n` (alphaTex syntax). Auto-init fine. **AND** a sibling `untitled-no-title.alphatex` lacking `\title`, used for the basename-fallback half of TAB-11.2-12.

The fixture *content files* are committed verbatim under `src-tauri/tests/fixtures/vaults/<name>/`; `from_fixture` in `src-tauri/src/test_support/vault.rs` already auto-copies the directory tree into the temp vault and auto-seeds `.archdesigner/config.json` when missing — no Rust changes needed.

---

## Phase 0 — Setup

> One commit at the end of this phase: the new fixture directories. The 🅐-e2e tasks in later phases reference these. Putting them up-front avoids the executor stalling mid-Phase-1 because `with_attachments/` doesn't exist yet.

### Task 0.1 — Confirm baseline

**Files:** none (verification only).

- [ ] **Step 1: Run the four MVP-4.x proof-set specs locally and confirm green.**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 8                    # next dev + test_server cold-start
npx playwright test e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts
kill $SERVERS 2>/dev/null
```

Expected: 4 / 4 passing. If anything red, stop the MVP and surface to the parent — the harness contract is broken and MVP-5 can't proceed.

- [ ] **Step 2: Run the full Vitest suite locally and confirm green.**

```bash
npm run test:run
```

Expected: 942 / 942 passing per the handoff. If anything red, stop and surface (same reason).

- [ ] **Step 3: Run the Rust unit + integration suite locally and confirm green.**

```bash
cd src-tauri && cargo test
```

Expected: 78 unit + 8 integration on macOS (or +1 on Linux for the watcher_rename_paired Linux-gated test) per the handoff.

### Task 0.2 — Add fixture directories

**Files:**
- Create: `src-tauri/tests/fixtures/vaults/with_attachments/notes/attached.md`
- Create: `src-tauri/tests/fixtures/vaults/with_attachments/notes/attached.kbjson`
- Create: `src-tauri/tests/fixtures/vaults/with_attachments/notes/attached.alphatex`
- Create: `src-tauri/tests/fixtures/vaults/with_attachments/.archdesigner/attachmentLinks.json`
- Create: `src-tauri/tests/fixtures/vaults/with_many_files/f01.md` … `f15.md`
- Create: `src-tauri/tests/fixtures/vaults/with_links_in_folder/notes/foo.md`
- Create: `src-tauri/tests/fixtures/vaults/with_links_in_folder/b.md`
- Create: `src-tauri/tests/fixtures/vaults/with_links_in_folder/other/.gitkeep`
- Create: `src-tauri/tests/fixtures/vaults/with_folders/drawings/.gitkeep`
- Create: `src-tauri/tests/fixtures/vaults/with_folders/existing.svg`
- Create: `src-tauri/tests/fixtures/vaults/with_folders/keep.md`
- Create: `src-tauri/tests/fixtures/vaults/with_tab/song.alphatex`
- Create: `src-tauri/tests/fixtures/vaults/with_tab/untitled-no-title.alphatex`

- [ ] **Step 1: Create `with_attachments/notes/attached.md`** with body:
  ```markdown
  # Attached note

  This is referenced from `attachmentLinks.json`.
  ```

- [ ] **Step 2: Create `with_attachments/notes/attached.kbjson`** with body `{"version":1,"layers":[],"connections":[],"flows":[]}`.

- [ ] **Step 3: Create `with_attachments/notes/attached.alphatex`** with body `\title "Attached"\n\\tempo 120\n.\n:4 0.6 |\n`.

- [ ] **Step 4: Create `with_attachments/.archdesigner/attachmentLinks.json`** with the canonical schema. Read `src/app/knowledge_base/infrastructure/attachmentLinksRepoTauri.ts` first to confirm the row shape (entityType / entityId / docPath fields), then write a fixture with three rows referencing the three attached files. Approximate shape (refine to match the production reader):
  ```json
  {
    "version": 1,
    "rows": [
      {"entityType": "node", "entityId": "n1", "docPath": "notes/attached.md"},
      {"entityType": "diagram", "entityId": "d1", "docPath": "notes/attached.kbjson"},
      {"entityType": "tab", "entityId": "notes/attached.alphatex", "docPath": "notes/attached.alphatex"}
    ]
  }
  ```

- [ ] **Step 5: Create `with_many_files/f01.md` … `f15.md`** with bodies `# F01\n\nbody one`, `# F02\n\nbody two`, …, `# F15\n\nbody fifteen`.

  Use a single bash loop:
  ```bash
  cd "/Users/kiro/My Projects/knowledge-base/src-tauri/tests/fixtures/vaults/with_many_files"
  for i in $(seq -w 1 15); do
    printf '# F%s\n\nbody %s\n' "$i" "$i" > "f${i}.md"
  done
  ```

- [ ] **Step 6: Create `with_links_in_folder/notes/foo.md`** with body:
  ```markdown
  # Foo

  This is the moved-rename target.
  ```

- [ ] **Step 7: Create `with_links_in_folder/b.md`** with body:
  ```markdown
  # B

  References [[notes/foo]] from a folder.
  ```

- [ ] **Step 8: Create `with_links_in_folder/other/.gitkeep`** as a zero-byte file (preserves the empty folder for the cross-folder rename target).

- [ ] **Step 9: Create `with_folders/drawings/.gitkeep`** zero-byte.

- [ ] **Step 10: Create `with_folders/existing.svg`** with body:
  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>
  ```

- [ ] **Step 11: Create `with_folders/keep.md`** with body:
  ```markdown
  # Keep
  ```

- [ ] **Step 12: Create `with_tab/song.alphatex`** with body `\title "Greensleeves"\n\\tempo 120\n.\n:4 0.6 2.6 |\n`.

- [ ] **Step 13: Create `with_tab/untitled-no-title.alphatex`** with body `\\tempo 120\n.\n:4 0.6 |\n` (no `\title`).

- [ ] **Step 14: Verify fixtures load via the harness**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 5
for f in with_attachments with_many_files with_links_in_folder with_folders with_tab; do
  curl -fsS -X POST http://localhost:1421/invoke \
    -H 'content-type: application/json' \
    -d "{\"cmd\":\"make_temp_vault\",\"args\":{\"fixture\":\"$f\",\"initialized\":true}}"
  echo
done
kill $SERVERS 2>/dev/null
```

Expected: each curl returns `{"ok":true,"value":"<some-tempdir-path>"}`. Any `"ok":false` means the fixture is malformed — fix before continuing.

- [ ] **Step 15: Commit**

```bash
git add src-tauri/tests/fixtures/vaults/{with_attachments,with_many_files,with_links_in_folder,with_folders,with_tab}
git commit -m "$(cat <<'EOF'
test(fixtures): add 5 vault fixtures for MVP-5 promotion sweep

Adds with_attachments (FS-2.3-72..75), with_many_files (EXPL-2.8-04),
with_links_in_folder (LINK-5.1-10), with_folders (SVG-6.1-01..03), and
with_tab (TAB-11.2-04/10/12). Each is auto-initialized via from_fixture
in src-tauri/src/test_support/vault.rs (no Rust changes required).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `git log --oneline -1` shows the fixture commit; `find src-tauri/tests/fixtures/vaults -mindepth 1 -maxdepth 1 -type d | wc -l` returns 7 (the 5 new fixtures + the 2 original `empty` + `with_links`).

**Decision rationale:** Fixtures up-front avoids the `make_temp_vault` validation surfacing during a later phase's first spec attempt. The Rust side already auto-seeds `.archdesigner/config.json` when missing, so the fixtures only need their content files.

---

## Phase 1 — Bucket 02-file-system.md (recommended first)

> Decision rationale: The test_server's vault surface is the only fully-supported subset of `dispatch.rs` (per Decision 1). All seventeen `❌`s in this bucket are addressable directly under that surface — no AppHandle dependencies. Best place to validate the per-bucket cadence before the harder buckets.

### Task 1.1 — Inventory + triage markdown sweep

**Files:**
- Modify: `test-cases/02-file-system.md`

- [ ] **Step 1: Apply 🅒 retirements (1 case)**

  - **FS-2.1-02**: rewrite the line as
    ```
    - **FS-2.1-02** 🚫 **`<input webkitdirectory>` fallback** — retired post-MVP-1a (Tauri shell uses `vault_pick`); `grep -r webkitdirectory src/` returns zero production usages.
    ```

- [ ] **Step 2: Apply 🅑 `note:` annotations (3 cases)**

  - **FS-2.3-45**: append ` _(MVP-5 follow-up: viable e2e under harness, deferred to keep MVP-5 scoped — requires hover-driven submenu position assertions)_`.
  - **FS-2.3-49**: append ` _(MVP-5 follow-up: same family as FS-2.3-45)_`.

- [ ] **Step 3: Commit the triage edit**

```bash
git add test-cases/02-file-system.md
git commit -m "$(cat <<'EOF'
docs(test-cases): triage MVP-5 sweep targets in 02-file-system.md

- FS-2.1-02 retired (webkitdirectory fallback gone post-MVP-1a)
- FS-2.3-45/49 deferred (hover-driven context-menu submenus — MVP-5 follow-up)
- 13 cases queued for promotion in subsequent commits

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `grep -c '🚫' test-cases/02-file-system.md` increases by 1; `grep -c '❌' test-cases/02-file-system.md` decreases by 3 (one to 🚫, two stay ❌ but with note); `git log --oneline -1` shows the triage commit.

### Task 1.2 — Implement EXPL-2.7 search promotions

**Files:**
- Create: `e2e/explorer_search.spec.ts`
- Modify: `test-cases/02-file-system.md`

- [ ] **Step 1: Write the failing spec**

```ts
// e2e/explorer_search.spec.ts
import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("Explorer search (EXPL-2.7)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("EXPL-2.7-03: ⌘F focuses the explorer search input", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Focus is not in any input/textarea/contenteditable (page body).
    await page.locator('body').click();
    await page.keyboard.press("Meta+F");

    await expect(page.getByTestId("explorer-search")).toBeFocused();
    await vault.cleanup();
  });

  test("EXPL-2.7-04: ⌘F is a no-op when focus is in an editor", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open a.md and put focus inside the ProseMirror editor.
    await page.getByTestId("explorer-tree").getByText("a.md").click();
    await page.locator('.ProseMirror').click();

    await page.keyboard.press("Meta+F");

    // Explorer search input is NOT focused (chromium's find bar may open;
    // we don't assert that — we only assert the steal-prevention).
    await expect(page.getByTestId("explorer-search")).not.toBeFocused();
    await vault.cleanup();
  });

  test("EXPL-2.7-05: 'Go to file…' palette command focuses explorer search", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open the command palette via ⌘K.
    await page.keyboard.press("Meta+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    // Palette default mode is search; prefix with `>` for command mode (per
    // commandPalette.spec.ts:8 "KB-010c shifted the palette default mode…").
    await page.keyboard.type(">go to file");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("explorer-search")).toBeFocused();
    await vault.cleanup();
  });
});
```

- [ ] **Step 2: Run the spec; expect FAIL until the harness boots**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test e2e/explorer_search.spec.ts
kill $SERVERS 2>/dev/null
```

Expected on first run: depending on the production code's actual ⌘F handler, may PASS directly. If FAIL, the failure mode tells you the production wiring isn't where the case copy claims — surface to the parent (do NOT add a production fix per Decision 5; demote to 🅑 with `note: needs production-code shortcut wiring`).

- [ ] **Step 3: Flip the markdown markers**

  Open `test-cases/02-file-system.md` and change EXPL-2.7-03/04/05 prefixes from `❌` to `🧪`. Append `_(e2e: e2e/explorer_search.spec.ts)_` to each.

- [ ] **Step 4: Commit**

```bash
git add e2e/explorer_search.spec.ts test-cases/02-file-system.md
git commit -m "$(cat <<'EOF'
test(e2e): EXPL-2.7-03/04/05 explorer search promotions

⌘F focuses explorer search; no-op when focus is in editor; palette
"Go to file…" command also focuses it. Promoted from ❌ to 🧪 in
test-cases/02-file-system.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `npx playwright test e2e/explorer_search.spec.ts` 3/3 passing; `grep -c '🧪.*EXPL-2.7' test-cases/02-file-system.md` returns 3.

### Task 1.3 — Implement EXPL-2.8 / EXPL-2.9 recents + unsaved promotions

**Files:**
- Create: `e2e/explorer_recents.spec.ts`
- Modify: `test-cases/02-file-system.md`

- [ ] **Step 1: Write the failing spec**

  Pattern matches Task 1.2 but with seven `test()` blocks under one `test.describe('Explorer recents and unsaved (EXPL-2.8 / 2.9)', …)`. Each block:

  - **EXPL-2.8-03 dedup** — `with_links` fixture, click `a.md` twice in succession, assert `[data-testid="explorer-recent-row"][data-path="a.md"]` count is 1.
  - **EXPL-2.8-04 cap-10** — `with_many_files` fixture, click `f01.md` … `f15.md` in order, assert recents has 10 rows; assert `f01.md` is NOT in the recents list (oldest dropped).
  - **EXPL-2.8-05 persists across reload** — `with_links` fixture, click `a.md`, `await page.reload()`, assert `a.md` still in recents. (Note: `setVaultPath` already reloaded, so this is a second reload.)
  - **EXPL-2.8-06 hidden when empty** — `empty` fixture, assert `[data-testid="explorer-recents-header"]` count is 0.
  - **EXPL-2.8-07 collapse toggle** — `with_links` fixture, click `a.md`, click recents header, assert recent rows hide; click again, assert they reappear.
  - **EXPL-2.9-02 unsaved hidden when clean** — `with_links` fixture, no edits, assert `[data-testid="unsaved-group-header"]` count is 0.
  - **EXPL-2.9-03 click unsaved opens** — `with_links` fixture, open `a.md`, type into editor (debounced dirty), assert `a.md` appears in unsaved group, click it, assert `a.md` is the active pane file.

  **Confirm testid availability before writing the spec.** Run `grep -rn 'explorer-recent\|explorer-recents-header\|unsaved-group-header' src/`. If any testid the case requires is missing in production, demote that specific case to 🅑 with `note: needs <testid> markup hook before promotion` and document in the bucket footer.

- [ ] **Step 2: Run the spec.**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test e2e/explorer_recents.spec.ts
kill $SERVERS 2>/dev/null
```

- [ ] **Step 3: Flip the seven markdown markers** (EXPL-2.8-03/04/05/06/07 + EXPL-2.9-02/03) from ❌ to 🧪 with the citation appended.

- [ ] **Step 4: Commit**

```bash
git add e2e/explorer_recents.spec.ts test-cases/02-file-system.md
git commit -m "$(cat <<'EOF'
test(e2e): EXPL-2.8/2.9 recents + unsaved group promotions

Recents dedup, MRU cap-10, reload persistence, empty hide, collapse
toggle. Unsaved group hide-when-clean and click-to-open. Promoted from
❌ to 🧪 (7 cases).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** 7/7 spec blocks passing; markdown shows 7 fewer ❌ in `test-cases/02-file-system.md`.

### Task 1.4 — Implement FS-2.3-72..75 folder-delete attachment cleanup

**Files:**
- Create: `e2e/explorer_folder_delete_attachment_cleanup.spec.ts`
- Modify: `test-cases/02-file-system.md`

- [ ] **Step 1: Write the failing spec**

  Four `test()` blocks under one `test.describe('Folder delete attachment cleanup (FS-2.3-72..75)', …)` — each uses the `with_attachments` fixture and exercises a different attached-file extension or path family.

  - **FS-2.3-72**: right-click `notes/` folder → Delete → confirm. Read `.archdesigner/attachmentLinks.json` from disk via node `fs.readFile(path.join(vault.path, '.archdesigner/attachmentLinks.json'), 'utf8')`; assert the row referencing `notes/attached.md` is gone.
  - **FS-2.3-73**: same flow; assert `notes/attached.kbjson` row is gone.
  - **FS-2.3-74**: same flow; assert `notes/attached.alphatex` row is gone.
  - **FS-2.3-75**: same flow; assert all three rows go in one operation (read the file once after delete; all three rows missing).

  All four blocks use the same fixture — they delete the folder once per `beforeEach` (each block gets a fresh vault from `makeTempVault`).

- [ ] **Step 2: Run the spec.**

- [ ] **Step 3: Flip the four markdown markers** (FS-2.3-72..75) from ❌ to 🧪.

- [ ] **Step 4: Commit**

```bash
git add e2e/explorer_folder_delete_attachment_cleanup.spec.ts test-cases/02-file-system.md
git commit -m "$(cat <<'EOF'
test(e2e): FS-2.3-72..75 folder-delete attachment cleanup promotions

Deleting a folder cleans up attachment rows for .md, .kbjson, and
.alphatex children in a single batch. Promoted from ❌ to 🧪 (4 cases).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** 4/4 spec blocks passing.

### Task 1.5 — Phase 1 verification

**Files:** none.

- [ ] **Step 1: Run the four MVP-4.x proof-set specs + the new Phase 1 specs**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test \
  e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts \
  e2e/explorer_search.spec.ts \
  e2e/explorer_recents.spec.ts \
  e2e/explorer_folder_delete_attachment_cleanup.spec.ts
kill $SERVERS 2>/dev/null
```

Expected: all green (4 + 3 + 7 + 4 = 18 passing).

- [ ] **Step 2: Re-grep `❌` in `02-file-system.md` and confirm all sweep cases addressed**

```bash
grep -c '❌' test-cases/02-file-system.md
```

Expected: 2 (FS-2.3-45 and FS-2.3-49 — both 🅑 deferreds with the appended `note:` annotation).

**Decision rationale:** Three new spec files (search / recents / folder-cleanup) match the "logical surface grouping" pinned decision; one spec per surface keeps CI run-time bounded.

---

## Phase 2 — Bucket 04-document.md

> Decision rationale: All nine cases are 🅐-unit (Tiptap live-editor integration that lands in `MarkdownEditor.test.tsx` per the established harness — see DOC-4.5-08 / DOC-4.5-12 / DOC-4.5-24 precedents). Zero new spec files; this phase ships as additions to `MarkdownEditor.test.tsx`. No new fixtures.

### Task 2.1 — Inventory + triage markdown sweep

**Files:**
- Modify: `test-cases/04-document.md`

- [ ] **Step 1: Apply 🅑 `note:` annotations**

  None — all nine cases promote to 🅐-unit in this phase.

- [ ] **Step 2: No 🅒 retirements** in this bucket.

- [ ] **Step 3: Commit (skip if no changes — this Task may be a no-op for 04-document.md).**

  This task body is intentionally narrow because the entire bucket is 🅐-unit; flips happen in Task 2.2 alongside the test additions.

### Task 2.2 — Add Tiptap integration tests for DOC-4.1/4.2/4.3/4.5 cases

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx`
- Modify: `test-cases/04-document.md`

- [ ] **Step 1: Read the existing test file structure**

```bash
grep -n "describe\|^it\|^test" src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx | head -30
```

Confirm the harness pattern (mount editor with full extension stack; `editor` instance accessible via the test's render result). The DOC-4.5-08 case is the model: it documents that JSDOM Selection doesn't propagate to ProseMirror, so for cases requiring selection (DOC-4.5-18) the test uses ProseMirror commands directly (`editor.commands.setTextSelection({from, to})`) rather than firing a real selection event.

- [ ] **Step 2: Add the nine cases as `it()` blocks**

  Each block:

  - **DOC-4.1-02 focused state tracked** — mount editor, fire `editor.commands.focus()`, assert `editor.isFocused === true`; fire `editor.commands.blur()`, assert `false`.
  - **DOC-4.2-06 checkbox toggle** — mount with `- [ ] item`, locate `[data-task-item] input[type=checkbox]`, fireEvent.click, assert serialized markdown becomes `- [x] item`. (Existing `DOC-4.2-05` partial covers task-list rendering; this completes the toggle leg.)
  - **DOC-4.3-34 cursor enters paragraph → rawBlock conversion** — drive the rawBlock conversion via the cursor-position-change handler that `markdownReveal` sets up; assert the active block's type flips to `rawBlock`.
  - **DOC-4.3-35 cursor exits → re-parses** — inverse of 4.3-34; cursor leaves the rawBlock, assert the rawBlock content was passed back through markdown-it.
  - **DOC-4.3-38 Enter in rawBlock smart list-item** — place cursor at end of `- foo` rawBlock content, dispatch keydown Enter, assert the new rawBlock starts with `- ` automatically.
  - **DOC-4.3-39 Backspace at rawBlock start merges** — place cursor at offset 0 in a rawBlock that follows a paragraph, dispatch keydown Backspace, assert the rawBlock content is appended to the prior paragraph and the rawBlock is removed.
  - **DOC-4.3-40 rawSwap meta flag suppresses serialize** — dispatch a transaction with `tr.setMeta('rawSwap', true)`; assert the editor's `onUpdate` is NOT called.
  - **DOC-4.5-13 force-exit rawBlock before structural commands** — place cursor in rawBlock; click toolbar Bullet List button; assert the editor first exits rawBlock, then converts to a list (the list, not a rawBlock containing a list).
  - **DOC-4.5-18 link button with text selected** — set selection via `editor.commands.setTextSelection({from: 5, to: 10})`; click toolbar Link button; assert selection is wrapped in an `<a>` element.

  Each `it()` title prefix is the case ID (e.g. `it('DOC-4.5-18: link button with text selected wraps selection', …)`) per Decision 2.

- [ ] **Step 3: Run the test file**

```bash
npx vitest run src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx
```

Expected: all existing cases still green plus the nine new cases passing. If any case fails because the ProseMirror behaviour doesn't match the case copy (e.g. rawSwap meta flag is named differently in the actual code), surface to the parent and demote that specific case to 🅑 with `note: needs verification — actual production behaviour differs from case copy`.

- [ ] **Step 4: Flip the nine markdown markers** in `test-cases/04-document.md` from ❌ to ✅ with `_(unit: MarkdownEditor.test.tsx)_` appended.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/document/components/MarkdownEditor.test.tsx \
        test-cases/04-document.md
git commit -m "$(cat <<'EOF'
test(unit): DOC-4.1/4.2/4.3/4.5 Tiptap integration promotions

Adds 9 cases to MarkdownEditor.test.tsx covering focused state,
checkbox toggle, rawBlock entry/exit transitions, rawSwap meta flag,
force-exit before structural commands, and link button with selection.
Promoted from ❌ to ✅.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** Vitest reports 9 new passing cases; `grep -c '❌' test-cases/04-document.md` is 0 (this bucket fully cleared).

---

## Phase 3 — Bucket 05-links-and-graph.md

### Task 3.1 — Inventory + triage markdown sweep

**Files:**
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Apply 🅑 `note:` annotations**

  None — all nine sweep cases promote in this phase (8 🅐-e2e + 1 🅐-unit).

- [ ] **Step 2: No 🅒 retirements.**

- [ ] **Step 3: This task may be a no-op commit-wise** — see the Phase 2 pattern.

### Task 3.2 — Implement LINK-5.1-12 unit promotion

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts`
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Read the existing helpers test file**

```bash
grep -n "describe\|^it" src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts | head -20
```

Confirm `propagateRename` is the exported function with a callable seam.

- [ ] **Step 2: Add LINK-5.1-12 as a unit case**

  ```ts
  it("LINK-5.1-12: backlinks-first rename order — no lost-reference window", async () => {
    // Spy on the link-index operations and assert the call sequence:
    // 1. loadIndex
    // 2. getBacklinksFor(oldPath)
    // 3. read each backlink source
    // 4. write each rewritten backlink source (target rewrites first)
    // 5. renameDocumentInIndex (last)
    // 6. saveIndex
    // The "no lost-reference window" assertion is that step 4 (writes
    // to consuming docs) precedes step 5 (the index entry move).
    // …
  });
  ```

  Concretely: mock `tauriBridge.readText` / `writeText` and `loadIndex` / `saveIndex`; capture call order via a shared array; assert the order matches the documented sequence.

- [ ] **Step 3: Run the file; flip the marker; commit.**

```bash
npx vitest run src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts
```

Flip LINK-5.1-12 from ❌ to ✅ with `_(unit: useFileExplorer.helpers.test.ts)_`.

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts \
        test-cases/05-links-and-graph.md
git commit -m "$(cat <<'EOF'
test(unit): LINK-5.1-12 backlinks-first rename order

Asserts propagateRename writes consuming docs (target backlinks)
BEFORE moving the index entry. Promoted from ❌ to ✅.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.3 — Implement LINK-5.1-10 cross-folder rename

**Files:**
- Create: `e2e/link_rename_cross_folder.spec.ts`
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Write the spec**

  Mirror `e2e/rename_propagation.spec.ts`'s shape but use the new `with_links_in_folder` fixture and rename `notes/foo.md` → `other/bar.md`. Assert via `fs.readFile` that `b.md` was rewritten from `[[notes/foo]]` to `[[other/bar]]` (note: vault-relative path including the folder).

- [ ] **Step 2: Run the spec; flip LINK-5.1-10 from ❌ to 🧪; commit.**

### Task 3.4 — Implement LINK-5.2-03 delete pill state

**Files:**
- Create: `e2e/link_delete_pill_state.spec.ts`
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Write the spec**

  - Use `with_links` fixture.
  - Open `b.md` in the pane (`page.getByTestId("explorer-tree").getByText("b.md").click()`).
  - Wait for `[data-wiki-link]` to render (DOC-4.3-01 model).
  - Assert the pill for `[[a]]` has `bg-blue-100` (resolved state).
  - Right-click `a.md` → Delete → confirm.
  - Assert the pill for `[[a]]` no longer has `bg-blue-100` (red unresolved state).

- [ ] **Step 2: Run; flip; commit.**

### Task 3.5 — Implement LINK-5.4-02 / 5.4-03 dirty propagation

**Files:**
- Create: `e2e/link_dirty_propagation.spec.ts`
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Extend the `with_links` fixture inline**

  The fixture currently has only `a.md` + `b.md`. For LINK-5.4-02 the spec needs a `c.md` that does NOT reference `[[a]]`. Add it via `vault_write_text` after `setVaultPath`:

  ```ts
  // Programmatically seed an unrelated c.md.
  await fetch(`${TEST_SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cmd: "vault_write_text",
      args: { path: "c.md", content: "# C\n\nNo links here." },
    }),
  });
  ```

  This avoids creating a new fixture for one test.

- [ ] **Step 2: Write the two `test()` blocks**

  - **LINK-5.4-02**: open `c.md`, no edits; rename `a.md` → `e.md`; assert `c.md` does NOT appear in `[data-testid="dirty-stack-indicator"]`. (The case's claim is "dirty flag only set for docs whose content actually changed".)
  - **LINK-5.4-03**: open `b.md` (containing `[[a]]`); delete `a.md`; assert the wiki-link pill in `b.md` flips to red (no `bg-blue-100`).

- [ ] **Step 3: Run; flip; commit.**

### Task 3.6 — Implement LINK-5.5 navigation cases

**Files:**
- Create: `e2e/wiki_link_navigation.spec.ts`
- Modify: `src-tauri/tests/fixtures/vaults/with_links/a.md` (add `## section` heading) — **OR** seed inline via `vault_write_text` (preferred per Decision 5; do NOT modify existing fixtures)
- Modify: `test-cases/05-links-and-graph.md`

- [ ] **Step 1: Seed the heading inline**

  In the spec's `beforeEach`, after `setVaultPath`, write a fresh `a.md` body that includes `## section`:

  ```ts
  await fetch(`${TEST_SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      cmd: "vault_write_text",
      args: { path: "a.md", content: "# A\n\n## section\n\nstandalone." },
    }),
  });
  ```

  Same approach for the unresolved-link test (LINK-5.5-03): write `b.md` body to include `[[nonexistent]]` before opening.

- [ ] **Step 2: Write the four `test()` blocks**

  - **LINK-5.5-01**: enter split view; focus right pane; click `[[a]]` pill in `b.md` (open in left); assert `a.md` opens in right pane.
  - **LINK-5.5-02**: single pane; click `[[a]]` pill; assert `a.md` is now the active pane file.
  - **LINK-5.5-03**: write `b.md` with `[[nonexistent]]`; click red pill; assert `nonexistent.md` is created on disk via `fs.stat(path.join(vault.path, "nonexistent.md"))`.
  - **LINK-5.5-06**: with the heading-seeded `a.md`, write `b.md` to contain `[[a#section]]`; click pill; after `a.md` opens, assert the `<h2 data-heading-id="section">` element has been scrolled into view (use `page.evaluate` to read `el.getBoundingClientRect().top` and assert it's near 0).

- [ ] **Step 3: Run; flip the four LINK-5.5 markers; commit.**

### Task 3.7 — Phase 3 verification

**Files:** none.

- [ ] **Step 1: Run the four proof-set + every new spec**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test e2e/link_rename_cross_folder.spec.ts \
                    e2e/link_delete_pill_state.spec.ts \
                    e2e/link_dirty_propagation.spec.ts \
                    e2e/wiki_link_navigation.spec.ts
kill $SERVERS 2>/dev/null
npm run test:run -- src/app/knowledge_base/shared/hooks/useFileExplorer.helpers.test.ts
```

- [ ] **Step 2: Re-grep `❌` in `05-links-and-graph.md`** — expected 0 sweep ❌ remaining (all 9 cleared).

---

## Phase 4 — Bucket 06-shared-hooks.md

> Decision rationale: All three cases are 🅐-unit additions to `historyPersistence.test.ts`. Smallest phase by far — one test file, three cases, one commit.

### Task 4.1 — Add HIST-5.4-04 / HIST-5.4-05 / HIST-5.6-01 to historyPersistence.test.ts

**Files:**
- Modify: `src/app/knowledge_base/shared/utils/historyPersistence.test.ts`
- Modify: `test-cases/06-shared-hooks.md`

- [ ] **Step 1: Read the existing test file**

```bash
grep -n "describe\|^it\|tauriBridge\|legacy" src/app/knowledge_base/shared/utils/historyPersistence.test.ts | head -20
```

Confirm the test mocks `tauriBridge.readText` / `writeText` and exposes a `historyFileNameLegacy` import.

- [ ] **Step 2: Add the three cases as `it()` blocks**

  - **HIST-5.4-04**: mock `tauriBridge.readText` to reject with a generic error (NOT a `not-found` classification) on the new-style sidecar name; mock the legacy name to succeed with valid JSON; assert `readHistoryFile` returns the legacy content. Repeat with the new-style name returning malformed JSON; same expected outcome.
  - **HIST-5.4-05**: mock both new-style and legacy names to reject with `not-found`; assert `readHistoryFile` returns `null`.
  - **HIST-5.6-01**: assert `readHistoryFile` calls `tauriBridge.readText(historyFileName(filePath))` (i.e. uses the `tauriBridge` module, not any FSA `FileSystemDirectoryHandle` API). Vitest module-mock `tauriBridge` and assert the import-resolved function was called with the expected arg.

- [ ] **Step 3: Run; flip the three markdown markers; commit.**

```bash
npx vitest run src/app/knowledge_base/shared/utils/historyPersistence.test.ts
```

Flip HIST-5.4-04, HIST-5.4-05, HIST-5.6-01 from ❌ to ✅ with `_(unit: historyPersistence.test.ts)_`.

```bash
git add src/app/knowledge_base/shared/utils/historyPersistence.test.ts \
        test-cases/06-shared-hooks.md
git commit -m "$(cat <<'EOF'
test(unit): HIST-5.4-04/05 + HIST-5.6-01 historyPersistence promotions

Legacy sidecar fallback on read/parse failure; null when both missing;
reads route through tauriBridge.readText (no FSA APIs). Promoted from
❌ to ✅ (3 cases).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `grep -c '❌' test-cases/06-shared-hooks.md` is 0.

---

## Phase 5 — Bucket 11-tabs.md

### Task 5.1 — Inventory + triage markdown sweep

**Files:**
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 1: Apply 🅑 `note:` annotations**

  - **TAB-11.2-08**: append ` _(MVP-5 follow-up: needs test_server vault_watch_start event-stream wiring; future-MVP candidate)_`.
  - **TAB-11.3-20**: append ` _(MVP-5 follow-up: needs production-bundle e2e backend for service-worker cache assertions)_`.
  - **TAB-11.4-06**: append ` _(MVP-5 follow-up: needs Playwright file-picker mock for the OS-native open-file dialog — test_server doesn't proxy showOpenFilePicker)_`.

- [ ] **Step 2: No 🅒 retirements.**

- [ ] **Step 3: Commit the triage edit alongside Task 5.4** (no standalone commit; the three 🅑 annotations land in the same commit as the bucket-closing verify pass).

### Task 5.2 — Implement TAB-11.2-01 unit promotion

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx`
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 1: Read existing TabView.test.tsx**

  Confirm `next/dynamic` mocking pattern. The case requires asserting that `@coderline/alphatab` is NOT in the doc/diagram bundle — bundle-size assertion is heavyweight, but the lazy-load assertion is doable: assert `next/dynamic` was called with `{ ssr: false }` and that the dynamic loader function references `@coderline/alphatab`.

- [ ] **Step 2: Add TAB-11.2-01**

  ```ts
  it("TAB-11.2-01: TabView lazy-loads the engine module on mount", async () => {
    // Render TabView for an .alphatex file; assert the dynamic-import
    // promise references `@coderline/alphatab` and is awaited only after
    // mount (not at module-load time of TabView itself).
    // …
  });
  ```

  Bundle-size leg of the case is a "verify via vite-bundle-visualizer manually" — note inline `// bundle-size leg verified manually via vite-bundle-visualizer` in the test, since automating it would expand scope per Decision 5.

- [ ] **Step 3: Run; flip TAB-11.2-01 from ❌ to ✅ (mark `🟡` if only the lazy-load leg is asserted, not the bundle-size leg); commit.**

  If only the lazy-load leg is asserted, use 🟡 with `_(unit: TabView.test.tsx — bundle-size leg verified manually)_`.

### Task 5.3 — Implement TAB-11.2-04 / 10 / 12 e2e promotions

**Files:**
- Create: `e2e/tab_h1_derivation.spec.ts` (covers TAB-11.2-04 + TAB-11.2-12)
- Create: `e2e/tab_reopen_fidelity.spec.ts` (covers TAB-11.2-10)
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 1: Write `tab_h1_derivation.spec.ts`**

  Two `test()` blocks:

  - **TAB-11.2-04 + TAB-11.2-12 (combined)**: open `with_tab` fixture's `song.alphatex`; assert `[data-testid="tab-view-canvas"]` is visible within 2s (TAB-11.2-04); assert PaneHeader title is "Greensleeves" (TAB-11.2-12 first leg).
  - **TAB-11.2-12 second leg**: open `with_tab` fixture's `untitled-no-title.alphatex`; assert PaneHeader title is `untitled-no-title.alphatex` (basename fallback).

  Both blocks have the alphaTab fragility caveat. If either flakes after one retry, demote that case to 🅑 with `note: see MVP-5 follow-up — environment-fragile (matches TAB-11.3-19 / TAB-11.8-06 caveat)` and remove the failing assertion.

- [ ] **Step 2: Write `tab_reopen_fidelity.spec.ts` (TAB-11.2-10)**

  Open `song.alphatex`; capture canvas HTML via `await page.locator('[data-testid="tab-view-canvas"]').innerHTML()`; close pane; re-open same file; assert the canvas HTML matches the captured snapshot. (Content fidelity, not pixel-exact; alphaTab renders deterministically for the same input.)

- [ ] **Step 3: Run; flip the markers; commit.**

```bash
git add e2e/tab_h1_derivation.spec.ts \
        e2e/tab_reopen_fidelity.spec.ts \
        test-cases/11-tabs.md
git commit -m "$(cat <<'EOF'
test(e2e): TAB-11.2-04/10/12 alphaTab integration promotions

Canvas mounts within 2s for fixture .alphatex; H1 derives from \title
directive (basename fallback); re-open same file produces identical
canvas content. Promoted from ❌ to 🧪 (3 cases). Notes the alphaTab
headless-chromium fragility caveat shared with TAB-11.3-19.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.4 — Phase 5 verification + 🅑 markdown sweep

**Files:**
- Modify: `test-cases/11-tabs.md` (apply the three 🅑 annotations from Task 5.1 in this commit alongside the verify run).

- [ ] **Step 1: Apply the three 🅑 annotations** (TAB-11.2-08 / TAB-11.3-20 / TAB-11.4-06) per Task 5.1 specification.

- [ ] **Step 2: Run full Phase 5 spec set**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test e2e/tab_h1_derivation.spec.ts e2e/tab_reopen_fidelity.spec.ts
kill $SERVERS 2>/dev/null
npm run test:run -- src/app/knowledge_base/features/tab/TabView.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add test-cases/11-tabs.md
git commit -m "$(cat <<'EOF'
docs(test-cases): MVP-5 deferreds in 11-tabs.md

TAB-11.2-08 (file-watcher conflict — needs test_server expansion);
TAB-11.3-20 (SW cache — needs production bundle); TAB-11.4-06 (.gp
import — needs Playwright file-picker mock). Tagged with
"see MVP-5 follow-up" for future-MVP routing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `grep -c '❌' test-cases/11-tabs.md` is 3 (the three 🅑s with the appended note); ten new ✅/🧪 entries added.

---

## Phase 6 — Bucket 07-persistence.md

> Decision rationale: Smallest bucket — one ❌ case, and it's 🅒 retirement. One markdown commit.

### Task 6.1 — Retire PERSIST-7.3-15

**Files:**
- Modify: `test-cases/07-persistence.md`

- [ ] **Step 1: Apply the 🅒 retirement**

  Rewrite PERSIST-7.3-15 as:
  ```
  - **PERSIST-7.3-15** 🚫 **Revoked permission surfaces error** — retired post-MVP-1a; Tauri vault paths use Rust-side I/O and surface permission errors via classified `FileSystemError(kind="permission")` (FS-2.6-03), not browser DOMException semantics. The original FSA-revocation scenario no longer exists in the production stack.
  ```

- [ ] **Step 2: Commit**

```bash
git add test-cases/07-persistence.md
git commit -m "$(cat <<'EOF'
docs(test-cases): retire PERSIST-7.3-15 (FSA permission revocation)

Tauri shell uses Rust-side I/O; permission errors are classified
FileSystemError(kind="permission") (FS-2.6-03), not browser
DOMException semantics. Original scenario no longer exists.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `grep -c '❌' test-cases/07-persistence.md` is 0; 🚫 count up by 1.

---

## Phase 7 — Bucket 01-app-shell.md

> Decision rationale: Largest bucket (24 ❌s), most diverse dispositions (mix of 🅐-e2e, 🅐-unit, 🅒, 🅑, ✅-flip). Run after the easier buckets so the executor has internalized the pattern.

### Task 7.1 — Inventory + triage markdown sweep

**Files:**
- Modify: `test-cases/01-app-shell.md`

- [ ] **Step 1: Apply 🅒 retirements (2 cases)**

  - **SHELL-1.15-05**: rewrite as
    ```
    - **SHELL-1.15-05** 🚫 **`useOfflineCache` opens `kb-files-v1` cache** — `useOfflineCache.ts` was deleted in MVP-1d Task 4 (commit `0f5e152`, PR #152) — Tauri ships native file I/O; no PWA cache path needed.
    ```
  - **SHELL-1.15-06**: same retirement reason — `useOfflineCache` deleted.

- [ ] **Step 2: Apply ✅-flip (1 case)**

  - **SHELL-1.18-01**: rewrite as
    ```
    - **SHELL-1.18-01** ✅ **Tauri debug bundle builds in CI on macOS-latest** — the `tauri-build` job in `.github/workflows/ci.yml` runs on every PR push and was green on 3 consecutive runs preceding PR #158 merge. _(CI: see handoff "Landed (MVP-4.x, PR #158)" CI block.)_
    ```

- [ ] **Step 3: Apply 🅑 `note:` annotations (10 cases)**

  - **SHELL-1.10-15**: append ` _(MVP-5 follow-up: needs test_server vault_watch_start event-stream wiring — future-MVP candidate)_`.
  - **SHELL-1.13-05**: append ` _(MVP-5 follow-up: needs harness-level prefers-color-scheme priming hook before page reload races emulateMedia)_`.
  - **SHELL-1.13-06**: append ` _(MVP-5 follow-up: viable e2e under harness, deferred to keep MVP-5 scoped — `:focus-visible` after Tab focus + computed-style assertion)_`.
  - **SHELL-1.15-01**: append ` _(MVP-5 follow-up: needs Playwright `request.get('/manifest.json')` against next dev's public-dir handling — verify route serving in dev mode)_`.
  - **SHELL-1.15-02**: append ` _(MVP-5 follow-up: needs production-bundle e2e backend — current harness is `next dev` only)_`.
  - **SHELL-1.15-03**: append ` _(MVP-5 follow-up: Next 16 metadata-classifier check — build-time, needs unit test against `app/layout.tsx` exports)_`.
  - **SHELL-1.15-04**: append ` _(MVP-5 follow-up: needs production-bundle e2e backend; SW only registers on `NODE_ENV === "production"`)_`.
  - **SHELL-1.16-01**: append ` _(MVP-5 follow-up: viable Playwright case, deferred to keep MVP-5 scoped — Tab-focus + tooltip-visibility assertion)_`.
  - **SHELL-1.16-02**: append ` _(MVP-5 follow-up: same as SHELL-1.16-01 — hover-driven)_`.
  - **SHELL-1.16-04**: append ` _(MVP-5 follow-up: same family — disabled-trigger CSS `:has(:disabled)` rule)_`.

- [ ] **Step 4: Commit the triage edit (markdown only — promotions land in subsequent commits)**

```bash
git add test-cases/01-app-shell.md
git commit -m "$(cat <<'EOF'
docs(test-cases): triage MVP-5 sweep targets in 01-app-shell.md

- SHELL-1.15-05/06 retired (useOfflineCache deleted in MVP-1d)
- SHELL-1.18-01 flipped to ✅ (tauri-build CI job already green)
- 10 cases marked MVP-5 follow-up (test_server expansion / production
  bundle / harness extensions needed)
- 11 cases queued for promotion in subsequent commits

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 7.2 — Implement SHELL-1.4-14 pane layout restore

**Files:**
- Create: `e2e/pane_layout_restore.spec.ts`
- Modify: `test-cases/01-app-shell.md`

- [ ] **Step 1: Write the spec**

  Per advisor's localStorage-seed pattern:

  ```ts
  test("SHELL-1.4-14: layout restored on directory load", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });
    await page.goto("/");

    // Seed a saved pane layout BEFORE setVaultPath reloads the page.
    // The pane-layout localStorage key is derived from the vault scope;
    // use an unscoped key as a first attempt and if scoping bites, read
    // src/app/knowledge_base/shared/utils/persistence.ts to find the
    // canonical key shape.
    await page.evaluate(() => {
      const layout = {
        left: { filePath: "a.md", fileType: "document" },
        right: null,
        focus: "left",
        lastClosedPane: null,
      };
      localStorage.setItem("kb-pane-layout", JSON.stringify(layout));
    });

    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Pane-content for left should be the document view loaded with a.md.
    await expect(
      page.locator('[data-pane-content="document"]')
    ).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="pane-title"]')).toContainText("a");
  });
  ```

- [ ] **Step 2: Run; flip; commit.**

  Note: if the pane-layout key requires scope-prefixing (per PERSIST-7.1-08), the spec needs to compute the scope before seeding. Read `src/app/knowledge_base/shared/utils/persistence.ts` for the `scopedKey` shape; if scope must be the vault path basename or similar, compute it from `vault.path` in the spec. If the scope is derived from something only available post-mount (e.g. an IndexedDB scope id), the case may need to be demoted to 🅑 with `note: needs harness-level scope-id priming hook`.

### Task 7.3 — Implement SHELL-1.11 command palette promotions

**Files:**
- Create: `e2e/command_palette.spec.ts`
- Modify: `test-cases/01-app-shell.md`

- [ ] **Step 1: Write the spec**

  Seven `test()` blocks under one `test.describe('Command Palette (SHELL-1.11)', …)`:

  - **SHELL-1.11-06 backdrop click**: open palette via ⌘K; click outside the panel (use a coordinate near the viewport edge); assert dialog dismissed.
  - **SHELL-1.11-07 ↑/↓ navigation**: open palette; type `>` to enter command mode; press ArrowDown twice; assert the second-row item has the `aria-selected="true"` (or equivalent active-class) attribute; press ArrowUp; assert first-row active. Then test wrap: ArrowUp from first → goes to last; ArrowDown from last → goes to first.
  - **SHELL-1.11-10 contenteditable blocks ⌘K**: open `a.md`; click into ProseMirror; press ⌘K; assert dialog NOT visible.
  - **SHELL-1.11-11 diagram commands absent**: open `a.md` only (document pane only — no diagrams in `with_links` fixture); open palette in command mode; type "Delete Selected"; assert "No matching commands"; type "Toggle Read / Edit Mode" and look for the diagram-specific entry — assert absent (only the document Toggle entry shows).
  - **SHELL-1.11-12 diagram commands present**: needs a vault with a diagram. Use `with_links` and inline-write a diagram via `vault_write_json` to `c.kbjson`. Open it; open palette; assert "Delete Selected" present (after selecting a node — may not be feasible without diagram canvas pointer events; if not, demote to 🅑 with `note: needs diagram-canvas pointer-event harness`).
  - **SHELL-1.11-13 document commands**: open `a.md`; open palette in command mode; type "Toggle Read / Edit Mode"; assert document-specific entry visible.
  - **SHELL-1.11-14 `when` guard**: open diagram (per 1.11-12 setup) but don't select any node; open palette; type "Delete Selected"; assert "No matching commands".

  If 1.11-12 / 1.11-14 (diagram-canvas-dependent) prove infeasible without diagram pointer events, demote both to 🅑 with `note: needs diagram-canvas pointer-event harness — see DIAG-3.5/3.7 deferred drag geometry`.

- [ ] **Step 2: Run; flip the seven markers (or 5 if 1.11-12/14 demoted); commit.**

### Task 7.4 — Implement SHELL-1.13 theme + token cases

**Files:**
- Create: `e2e/theme_tokens.spec.ts` (covers SHELL-1.13-07 + SHELL-1.13-09)
- Modify: `src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts` (covers SHELL-1.13-08)
- Modify: `test-cases/01-app-shell.md`

- [ ] **Step 1: Add SHELL-1.13-08 unit case**

  ```ts
  it("SHELL-1.13-08: vaultConfigRepo.update patches a single field", async () => {
    // Pre-seed config; call update({ theme: "dark" }); read back; assert
    // theme is "dark" AND name/version/created are preserved.
    // …
  });
  ```

- [ ] **Step 2: Write `e2e/theme_tokens.spec.ts`**

  - **SHELL-1.13-07**: open vault, mount any element with `text-base` class (the body itself works), assert `getComputedStyle(el).fontSize === '15px'`. If the explicit `text-base` token override isn't observable in dev mode (Tailwind utility caching), demote to 🅑 with `note: needs computed-style assertion harness — Tailwind v4 token-resolve timing in dev mode`.
  - **SHELL-1.13-09**: open vault, click `a.md` to make it active in explorer; for both light theme (default) and dark theme (toggle via ⌘⇧L), assert WCAG contrast of the active row's text against its background. Use `page.evaluate` to compute contrast inline (luminance formula). Floor: 4.5:1.

- [ ] **Step 3: Run all three; flip the markers; commit.**

### Task 7.5 — Phase 7 verification + executor escape hatch

**Files:** none (or modify `test-cases/01-app-shell.md` if executor promotes 🅑s).

- [ ] **Step 1: Run full Phase 7 spec set + units**

```bash
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 6
npx playwright test e2e/pane_layout_restore.spec.ts \
                    e2e/command_palette.spec.ts \
                    e2e/theme_tokens.spec.ts
kill $SERVERS 2>/dev/null
npm run test:run -- src/app/knowledge_base/infrastructure/vaultConfigRepoTauri.test.ts
```

- [ ] **Step 2: Executor escape hatch — optional 🅑 → 🅐 promotions**

  If Phase 7 finishes with surplus time, the executor MAY promote any of SHELL-1.13-06, SHELL-1.16-01, SHELL-1.16-02, SHELL-1.16-04 to 🅐-e2e (the four cases the plan flagged as "viable, deferred to keep MVP-5 scoped"). Each promotion is one new `test()` block in an existing or new spec file plus the markdown flip. **No other 🅑 may be promoted** in this MVP — they all have harness or production-bundle prerequisites that the plan explicitly calls out.

- [ ] **Step 3: Re-grep `❌` in `01-app-shell.md`** — expected 10 (the 10 🅑s; counts down by 4 if executor took the escape hatch).

---

## Phase 8 — Bucket 06-svg-editor.md

> Decision rationale: Smallest 🅐-e2e bucket — four cases, all SVG-pane-creation-and-chrome. The pane is JSDOM-incompatible for canvas mutations (per the existing 🚫 in 06-svg-editor.md SVG-6.2-03), but creation, routing, and PaneHeader chrome are testable.

### Task 8.1 — Implement SVG-6.1-01..03 + SVG-6.2-02

**Files:**
- Create: `e2e/svg_create.spec.ts`
- Create: `e2e/svg_pane_chrome.spec.ts`
- Modify: `test-cases/06-svg-editor.md`

- [ ] **Step 1: Write `svg_create.spec.ts`**

  Three `test()` blocks using `with_folders` fixture:

  - **SVG-6.1-01**: right-click `drawings/` folder → New → SVG; assert `untitled.svg` appears in tree under `drawings/`; assert file exists on disk via `fs.stat(path.join(vault.path, "drawings/untitled.svg"))`.
  - **SVG-6.1-02**: hover over `drawings/` folder; click the New SVG icon button (the hover affordance per ExplorerPanel.tsx); assert `untitled.svg` appears.
  - **SVG-6.1-03**: click `existing.svg` in the explorer tree; assert `[data-pane-content="svg"]` becomes visible (and NOT `[data-pane-content="document"]` or `[data-pane-content="diagram"]`).

- [ ] **Step 2: Write `svg_pane_chrome.spec.ts`**

  - **SVG-6.2-02**: open `existing.svg`; dispatch a programmatic SVG canvas mutation (the SVG editor uses `canvas.addCommandToHistory` per the SVG-6.4-20 case — drive it via `page.evaluate(() => window.svgCanvas.addCommandToHistory({ ... }))` or similar; if the editor doesn't expose a `window` hook, drive it by clicking a toolbar tool and clicking the canvas — the toolbar is at `[data-testid="svg-toolbar"]`); assert `[data-testid="pane-save"]` and `[data-testid="pane-discard"]` are visible after the dirty state propagates.

  If neither hook works, demote SVG-6.2-02 to 🅑 with `note: needs SVG canvas dirty-state harness — production code uses MutationObserver wrapper that's not driveable from Playwright without a programmatic mutation entry point`.

- [ ] **Step 3: Run; flip the four markers; commit.**

  Use markdown table syntax (06-svg-editor.md uses table format unlike the bullet list of the other files):
  ```md
  | SVG-6.1-01 | Right-click folder → New → SVG → creates `untitled.svg` and opens editor pane | 🧪 _(e2e: e2e/svg_create.spec.ts)_ |
  ```

```bash
git add e2e/svg_create.spec.ts e2e/svg_pane_chrome.spec.ts test-cases/06-svg-editor.md
git commit -m "$(cat <<'EOF'
test(e2e): SVG-6.1-01..03 + SVG-6.2-02 SVG editor promotions

Folder→New→SVG, hover affordance, .svg routing to SVG pane, and
PaneHeader Save/Discard visibility on dirty. Promoted from ❌ to 🧪
(4 cases).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Verification:** `grep -c '❌' test-cases/06-svg-editor.md` is 0.

---

## Phase 9 — Verification + handoff closeout

### Task 9.1 — Full-suite green-bar gate

**Files:** none.

- [ ] **Step 1: Run the entire test surface**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use

# Vitest unit + integration suite
npm run test:run

# Rust unit + integration suite
( cd src-tauri && cargo test )

# Full Playwright e2e — the 4 proof-set + every new MVP-5 spec
bash scripts/run-e2e.sh &
SERVERS=$!
sleep 8
npx playwright test \
  e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts \
  e2e/explorer_search.spec.ts \
  e2e/explorer_recents.spec.ts \
  e2e/explorer_folder_delete_attachment_cleanup.spec.ts \
  e2e/link_rename_cross_folder.spec.ts \
  e2e/link_delete_pill_state.spec.ts \
  e2e/link_dirty_propagation.spec.ts \
  e2e/wiki_link_navigation.spec.ts \
  e2e/tab_h1_derivation.spec.ts \
  e2e/tab_reopen_fidelity.spec.ts \
  e2e/svg_create.spec.ts \
  e2e/svg_pane_chrome.spec.ts \
  e2e/command_palette.spec.ts \
  e2e/pane_layout_restore.spec.ts \
  e2e/theme_tokens.spec.ts
kill $SERVERS 2>/dev/null
```

Expected: all green. Counts: Vitest growth ≈ +12 (DOC-4 nine, HIST three, SHELL-1.13-08 one, LINK-5.1-12 one, TAB-11.2-01 one); Playwright growth ≈ +50 test blocks across 15 new spec files; Rust suite unchanged.

- [ ] **Step 2: Re-grep `❌` across the eight buckets**

```bash
for f in test-cases/{01-app-shell,02-file-system,04-document,05-links-and-graph,06-shared-hooks,06-svg-editor,07-persistence,11-tabs}.md; do
  printf '%-36s' "$f"
  grep -c '❌' "$f"
done
```

Expected counts (matching the Inventory table above):
- 01-app-shell.md: 10 (all 🅑s with note:)
- 02-file-system.md: 2 (FS-2.3-45/49, both 🅑 with note:)
- 04-document.md: 0
- 05-links-and-graph.md: 0
- 06-shared-hooks.md: 0
- 06-svg-editor.md: 0
- 07-persistence.md: 0
- 11-tabs.md: 3 (all 🅑 with note:)

Total residual ❌ across the eight buckets: **15** (down from 74) — every one of which has `_(MVP-5 follow-up: …)_` annotation pointing at the future-MVP requirement.

### Task 9.2 — Regenerate coverage snapshot in README

**Files:**
- Modify: `test-cases/README.md`

- [ ] **Step 1: Run the regeneration one-liner**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
for f in test-cases/0*-*.md test-cases/1*-*.md; do
  name=$(basename "$f")
  ok=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* ✅' "$f")
  partial=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🟡' "$f")
  e2e=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🧪' "$f")
  gap=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* ❌' "$f")
  waived=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🚫' "$f")
  printf "%-28s ✅%3d  🟡%3d  🧪%3d  ❌%3d  🚫%3d\n" "$name" "$ok" "$partial" "$e2e" "$gap" "$waived"
done
```

Note: `06-svg-editor.md` and `11-tabs.md` use table syntax for SOME cases — the regen one-liner counts only bullet-list entries. Manually adjust the coverage row for these two files (or count via a separate grep that tolerates `| <ID> |.*| ✅ |` table form).

- [ ] **Step 2: Update the snapshot table in `test-cases/README.md`** with the new numbers.

- [ ] **Step 3: Update the trailing 2026-05-08 note** to reflect MVP-5 having shipped:
  ```
  **Note (2026-05-10, MVP-5 shipped):** ❌ count down from 115 to ~76 globally (the 8 sweep-target buckets contributed all of the drop). The 8 sweep-target buckets cleared 59 cases (55 promoted to ✅/🧪, 4 retired to 🚫, plus 1 ✅-flip without spec — SHELL-1.18-01) and deferred 15 with `_(MVP-5 follow-up: …)_` annotations for future MVPs. ❌ across the 8 buckets is now 15 residual (down from 74). See PR <NN> + the MVP-5 plan at `docs/superpowers/plans/2026-05-09-tauri-mvp5-test-promotion-plan.md`. The Tauri + Claude Integration epic is closed.
  ```

- [ ] **Step 4: Commit**

```bash
git add test-cases/README.md
git commit -m "$(cat <<'EOF'
docs(test-cases): regenerate MVP-5 coverage snapshot

Sweep across 8 target buckets: 55 promoted (e2e + unit), 4 retired
(useOfflineCache / FSA permissions / webkitdirectory), 15 deferred
with MVP-5 follow-up annotations, plus 1 ✅-flip (SHELL-1.18-01).
❌ across the 8 buckets down from 74 to 15 residual deferreds.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 9.3 — Handoff doc closeout

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Update `Last updated`** to today's date with `MVP-5 merged via PR #<NN> (`<sha>` on `main`)` (insert real PR number + SHA at PR-merge time).

- [ ] **Step 2: Flip the `Where we are` table row for MVP-5** to `✅ Merged via PR #<NN> (<sha> on main).`

- [ ] **Step 3: Add a new `Landed (MVP-5, PR #<NN>)` block** under `Reference architecture` summarising the file map (15 new spec files; 5 modified Vitest files; 8 modified test-case files; 5 new fixtures; no production code changes).

- [ ] **Step 4: Update `Open follow-up items`** with the MVP-5 follow-up roll-up:
  - **MVP-5 follow-up: test_server `vault_watch_start` event-stream wiring** — covers SHELL-1.10-15 + TAB-11.2-08. Highest-value follow-up; would unblock real disk-watch e2e.
  - **MVP-5 follow-up: production-bundle e2e backend** — covers SHELL-1.15-01..04 + TAB-11.3-20. Either a `next start`-mode harness variant or Path 4 self-hosted runner.
  - **MVP-5 follow-up: harness-level `prefers-color-scheme` + scope-id priming hooks** — covers SHELL-1.13-05 + (potentially) SHELL-1.4-14 if scope bites.
  - **MVP-5 follow-up: hover-driven context-menu submenus** — covers FS-2.3-45/49 (and SHELL-1.16-01/02/04 if not promoted via Phase 7's escape hatch).
  - **MVP-5 follow-up: Playwright file-picker mock for `showOpenFilePicker`** — covers TAB-11.4-06 (.gp import).
  - **MVP-5 follow-up: legacy fsMock-spec retirement** — 41 specs in `e2e/*.spec.ts` still rely on `e2e/fixtures/fsMock.ts`. Migrate or retire each in a future MVP; not in scope for MVP-5.

- [ ] **Step 5: Replace the `Next Action` body** with `**Tauri + Claude Integration epic ✅ Closed.** All five MVPs (1a/1b/1c/1d/1e + 2 + 3 + 3.5 + 4 + 4.x + 5) merged. Future work routes through the open follow-up items above; if a future MVP picks up the MVP-5 follow-up batch, cut a new branch off `main` and dispatch via `superpowers:writing-plans`.`

- [ ] **Step 6: Commit alongside the verify-pass commit**

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "$(cat <<'EOF'
docs(handoff): MVP-5 merged + Tauri + Claude Integration epic closed

Last MVP in the 5-MVP epic. 35 test cases promoted across 8 buckets;
17 cases deferred with MVP-5 follow-up annotations roll-up. Next
Action body rewritten to "epic closed".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 9.4 — Open the PR

**Files:** none (uses `gh pr create`).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/tauri-mvp5-test-promotion
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --base main --title "MVP-5: test-cases promotion sweep across 8 buckets" --body "$(cat <<'EOF'
## Summary

Last MVP in the Tauri + Claude Integration epic. Walks every ❌ entry in the eight MVP-5 sweep-target test-case buckets and disposes of it: promote, retire, or defer with annotation.

- **55 cases promoted** (e2e + unit) across the 8 buckets
- **4 cases retired** (SHELL-1.15-05 / SHELL-1.15-06 = `useOfflineCache` deleted in MVP-1d; FS-2.1-02 = `webkitdirectory` never had production callsites; PERSIST-7.3-15 = FSA permission semantics gone)
- **1 case ✅-flipped without spec** (SHELL-1.18-01 — `tauri-build` macOS CI job already green per handoff)
- **15 cases deferred** with `_(MVP-5 follow-up: …)_` annotations roll-up under handoff "Open follow-up items"
- ❌ across the 8 buckets down from **74 to 15** residual (all 15 are 🅑 deferreds, no orphan ❌s)

## Pinned scope decisions (do not relitigate)

1. Bucket ordering: file-system first; svg-editor last.
2. Per-case shape: split 🅐 into 🅐-e2e (Playwright spec) + 🅐-unit (Vitest in existing test file).
3. No `test_server` expansion in MVP-5.
4. No WKWebView fidelity tests (Path 4 deferred indefinitely).
5. No production code changes under `src/`.
6. 🅐-unit cases go into the established existing test files only.

## File map

- 15 new e2e spec files (`e2e/*.spec.ts`)
- 5 modified Vitest files (DOC-4, HIST, SHELL-1.13-08, LINK-5.1-12, TAB-11.2-01)
- 8 modified test-case markdown files + `test-cases/README.md` snapshot regen
- 5 new vault fixtures under `src-tauri/tests/fixtures/vaults/`
- 1 modified handoff doc (Last updated bump + Where we are flip + Landed block + Open follow-up roll-up + Next Action rewrite)
- **Zero** production code changes under `src/app/knowledge_base/`

## Test plan

- [x] All four MVP-4.x proof-set specs still green
- [x] Every new MVP-5 e2e spec green
- [x] Vitest suite green (existing + new cases)
- [x] Rust suite (cargo test) unchanged green
- [x] CI pipeline 5/5 jobs green on PR push

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Wait for CI**

  CI runs the 5-job split per `.github/workflows/ci.yml`. All five must be green before merge. If a flake surfaces, RE-RUN once via the `gh run rerun` workflow; if it flakes a second time, surface to the parent — do NOT merge with a flake-papered green.

- [ ] **Step 4: Merge via "Squash and merge"**

  Per the handoff's branch convention: `main` is protected; squash-merge is the merge style; the PR title becomes the squash-commit message.

- [ ] **Step 5: Run the post-merge cleanup protocol** per the handoff doc (sync main, delete local branch via `-D` since remote auto-prunes on squash merge, prune origin). The next session resumes from a closed epic — no further MVP work scheduled.

---

## Verification surface (must all be green before PR merge)

- [ ] `bash scripts/run-e2e.sh` boots both processes; both readiness probes succeed.
- [ ] `npx playwright test e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts` — 4/4 passing (proof-set unchanged).
- [ ] `npx playwright test e2e/<all 15 new MVP-5 spec files>` — all `test()` blocks passing.
- [ ] `npm run test:run` — Vitest suite passing including the +12 new cases across DOC-4 / HIST / vaultConfigRepoTauri / useFileExplorer.helpers / TabView.
- [ ] `cd src-tauri && cargo test` — 78 unit + 8 integration on macOS (or +1 on Linux for `watcher_rename_paired`) unchanged green; no Rust changes in this MVP.
- [ ] `grep -c '❌' test-cases/0[1-9]-*.md test-cases/11-*.md` returns **15 total** (1: 10, 2: 2, 4: 0, 5: 0, 6-shared: 0, 6-svg: 0, 7: 0, 11: 3) and every one of those 15 has `_(MVP-5 follow-up: …)_` appended (no orphan ❌s).
- [ ] `test-cases/README.md` snapshot table reflects the new counts.
- [ ] CI 5/5 jobs green on PR push (Typecheck · Lint · Unit tests / Production build / Rust fmt · clippy · test (Ubuntu) / Tauri debug bundle (macOS) / End-to-end tests (Ubuntu chromium)).
- [ ] Handoff doc reflects MVP-5 merged + epic closed.

If any of the above is red at PR-open time, the PR is not ready. Surface the failure mode and either fix it on this branch (no `--amend`; new commit) or demote the offending case to 🅑 with `note: needs <reason>` and re-run.

---

## Closing

After this MVP merges, the **Tauri + Claude Integration epic is ✅ closed.** Five MVPs (1a → 5) plus three sub-MVPs (1b/1c/1d/1e + 3.5 + 4.x) shipped over the lifetime of the epic. All blockers resolved: vault-on-disk for the FSA-picker problem, Claude subprocess + skill bootstrap + slash-command palette for the chat surface, embedded terminal for the production runtime, real e2e for the test harness, and the test-cases sweep for the documentation. Future work routes through the MVP-5 follow-up roll-up under the handoff's `Open follow-up items` block.
