# Knowledge Base — Implementation Plan

> Generated from `Knowledge Base Audit.html` (34 findings, 8 strengths).
> Audience: **Claude Code / engineering agent** working in this repo.
> Format: each ticket is self-contained, has explicit file paths, acceptance criteria, and a verification command.
> Order respects dependency chains — do tickets in the order listed within each milestone.

---

## How to use this document

- **Tickets are atomic.** Each one is a single PR. Don't combine.
- **Ticket IDs (`KB-###`)** map back to audit findings. Cross-reference the audit HTML for full reasoning if context is missing.
- **Every ticket has a `Verify:` block** — a shell command or manual check that proves the work is done. Run it before marking the ticket complete.
- **Severity:** `🔴 critical` `🟠 high` `🟡 medium` `🟢 low` `⚪ nit`.
- **Effort estimates** assume one focused agent session; treat them as upper bounds.
- **Do not modify these without explicit approval:** the domain/infrastructure boundary (`src/.../infrastructure/`, `src/.../domain/`), classified `FileSystemError` flow, per-vault `scopedKey()` scoping, the prose-spec → test-ID discipline (`DIAG-3.10-21` style). These are documented strengths — protect them.

### Glossary

- **Vault** — a folder opened via File System Access API; root of all data.
- **Sidecar** — a `.history.json` / similar file mirroring user content; not user-visible.
- **Prose spec** — markdown in `test/prose/` with stable feature IDs referenced from e2e specs.
- **God component** — a single file holding too many responsibilities; here, `DiagramView.tsx` (1,616 lines).

---

## Milestone summary

| Milestone                  | Focus                                     | Tickets | Effort        |
| -------------------------- | ----------------------------------------- | ------- | ------------- |
| **M0 — Stop the bleeding** | Data-loss & first-impression bugs         | 6       | ~1.5 weeks    |
| **M1 — Headline gaps**     | Search, export, attachments               | 5       | ~2 weeks      |
| **M2 — Architecture**      | DiagramView refactor, perf                | 5       | ~1.5 weeks    |
| **M3 — Accessibility**     | Keyboard, ARIA, contrast                  | 7       | ~1 week       |
| **M4 — Polish**            | UX papercuts, perf nits                   | 8       | ~3 days       |
| **M5 — Quarter horizon**   | Tags, embeds, version-history UI, plugins | 6       | quarter-scale |

Total: **37 tickets** covering all 34 audit findings (some findings split, some merged where the fix is shared).

---

# M0 — Stop the bleeding

Data integrity, silent failures, and "first 30 seconds" bugs. Ship before anything else.

---

## KB-001 🔴 Browser fallback message for non-Chromium

**Audit ref:** UX/High — "Browser support is silently Chromium-only."
**Why now:** Firefox/Safari users currently see a hidden file `<input>` fallback that picks files but can't write back. UX is "broken Open Folder button" with no explanation.

**Files**

- `app/knowledge_base/knowledgeBase.tsx` (around line 612 — the hidden fallback `<input>`)
- New: `app/knowledge_base/shared/components/UnsupportedBrowserCard.tsx`

**Implementation**

1. On first render, detect `!('showDirectoryPicker' in window)`.
2. If unsupported, render `<UnsupportedBrowserCard />` as the entire main pane (replace explorer + content). Card content:
   - Title: "Knowledge Base needs the File System Access API."
   - Body: short paragraph naming Chrome / Edge / Brave / Arc / Opera.
   - Optional secondary CTA: "Open in read-only mode" → only enabled if you decide to keep the hidden input path; otherwise omit.
3. Remove the hidden fallback `<input>` if read-only mode is omitted.

**Acceptance**

- [ ] In Firefox or Safari, opening the app shows the card immediately, not the empty explorer.
- [ ] In Chrome/Edge/Brave, behavior is identical to today.
- [ ] No console errors in either path.

**Verify:** Open in Safari/Firefox manually. (Or: temporarily stub `window.showDirectoryPicker = undefined` at the top of `knowledgeBase.tsx` and reload.)

**Effort:** 30 min · **Depends on:** none

---

## KB-002 🔴 Document autosave drafts (data-loss fix)

**Audit ref:** UX/High — "No autosave for documents."
**Why now:** Diagrams autosave drafts via `useDrafts`. Documents don't. Close tab mid-edit → lose work.

**Files**

- `app/knowledge_base/features/document/hooks/useDocumentContent.ts`
- `app/knowledge_base/features/document/DocumentView.tsx` (mount integration)
- `app/knowledge_base/shared/hooks/useDrafts.ts` (study the diagram pattern; consider extracting a generic `useDraftFor<T>` if the shape is close)

**Implementation**

1. On every content change, debounce 500ms and persist dirty content to `localStorage[scopedKey('draft:' + path)]`. Use the existing `scopedKey()` utility — do not bypass per-vault scoping.
2. On mount of a path with a stored draft _newer_ than the on-disk `mtime`, restore the draft and surface a small banner: "Restored unsaved changes from <relative time>. [Discard] [Keep]".
3. On successful save, clear the draft entry.
4. Add a global `beforeunload` guard hooked to the existing `headerDirtyFiles.size > 0` signal in the shell. If already present, verify it covers documents (it currently only fires for diagrams per the audit).

**Acceptance**

- [ ] Edit a doc, close tab, reopen → restore banner appears with the unsaved content.
- [ ] Edit a doc, save (Cmd+S), close tab, reopen → no banner.
- [ ] No restore banner after the user explicitly discards.
- [ ] `beforeunload` fires when any document is dirty.

**Verify:** Add unit test `useDocumentContent.draftRestore.test.ts` covering the three paths above. Add Playwright spec `documentDraftRestore.spec.ts` that types, reloads, and asserts the banner.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-003 🔴 Reset App confirmation

**Audit ref:** UX/Medium — "Reset App button is a footgun." (Promoted to critical because it is destructive and one click away.)

**Files**

- Search for the button: `grep -r "Reset App" app/`
- `app/knowledge_base/shared/components/ConfirmPopover.tsx` (reuse)

**Implementation**

1. Wrap the existing Reset button in `<ConfirmPopover>` with copy: "Clear all local state? This removes drafts, recent vaults, and view preferences. Files on disk are not affected."
2. Move the button out of the global footer — relocate to a "Settings → Danger zone" disclosure if Settings exists; otherwise leave in footer but inside the confirm.
3. Confirm button uses the destructive variant.

**Acceptance**

- [ ] Clicking Reset App shows a confirm popover; only the second click resets.
- [ ] Escape dismisses the popover.

**Effort:** 15 min · **Depends on:** none

---

## KB-004 🔴 Wire Tiptap Image extension + paste-to-attachments

**Audit ref:** UX/Critical — "No image/attachment support in documents."
**Why now:** `@tiptap/extension-image` is in `package.json` but unwired. Pasting a screenshot fails silently — a 30-second smoke test that fails today.

**Files**

- Editor extension list (search: `grep -r "StarterKit" app/knowledge_base/features/document/`)
- New: `app/knowledge_base/features/document/utils/attachmentRepository.ts`
- New: `app/knowledge_base/features/document/extensions/imagePasteHandler.ts`
- `app/knowledge_base/infrastructure/` — add a typed write path mirroring `DocumentRepository`.

**Implementation**

1. Register `@tiptap/extension-image` in the editor extension list.
2. Add a paste handler (Tiptap `editorProps.handlePaste` or a ProseMirror plugin):
   - On paste of `image/*` clipboard items, hash the bytes (`crypto.subtle.digest('SHA-256', …)`) → first 12 hex chars.
   - Write to `<vault>/.attachments/<hash>.<ext>` via the FS API. Skip if the file already exists.
   - Insert `![](.attachments/<hash>.<ext>)` at cursor.
   - All writes go through the new repo, throwing `FileSystemError` on failure (do **not** swallow — the audit calls out a sibling regression in svgEditor).
3. Drag-drop of image files: same path.
4. Show a small upload chip near the editor for files >100 KB while the write is in flight.
5. Update `.gitignore`-style filter in the explorer so `.attachments/` is hidden from the file tree (or shown collapsed — match how other dot-folders behave).

**Acceptance**

- [ ] Paste a screenshot in a doc → image renders inline within ~500ms.
- [ ] File appears at `<vault>/.attachments/<hash>.png` on disk.
- [ ] Same image pasted twice → only one file on disk (hash dedupe).
- [ ] FS error during write surfaces a toast via `ShellErrorContext`, not a silent fail.
- [ ] Drag a PNG from Finder/Explorer onto the editor → same behavior.

**Verify:** Manual paste test + new Playwright spec `documentImagePaste.spec.ts` using a fixture PNG.

**Effort:** 4 hrs · **Depends on:** none

---

## KB-005 🔴 Fix SVG editor silent write failures

**Audit ref:** UX/High — "SVG Editor autosave silently swallows write errors."
**Why now:** The new `useSVGPersistence` punches a hole through the codebase's classified `FileSystemError` discipline (a documented strength). Quota/permission failures reset `isDirty` incorrectly.

**Files**

- `features/svgEditor/hooks/useSVGPersistence.ts` — remove `.catch(() => {})` calls.
- New: `app/knowledge_base/infrastructure/SVGRepository.ts` — mirror `DocumentRepository`.
- `features/svgEditor/components/SVGCanvas.tsx` (knock-on if write surface changes).

**Implementation**

1. Create `SVGRepository` with `read(path)` / `write(path, svgString)` that throw `FileSystemError` (same taxonomy as `DocumentRepository`).
2. `useSVGPersistence` calls the repo and, on rejection, calls `reportError` from `ShellErrorContext` — **never** swallows.
3. Drop debounce from 1500ms → 200ms to match `DocumentRepository`. Add explicit flush on blur and on unmount (mirror useDocumentContent).
4. `isDirty` only flips to false on write **success**. On failure it stays dirty so the user can retry.

**Acceptance**

- [ ] Revoke vault permission while editing an SVG → user sees the standard ShellErrorContext banner; the dirty dot stays on.
- [ ] Close tab within 200ms of last edit → final state is on disk.
- [ ] No `catch(() => {})` left in `features/svgEditor/`.

**Verify:** `grep -rn "catch(() => {})\|catch (() => {})" features/svgEditor/` returns no results. Manual permission-revoke test.

**Effort:** 3 hrs · **Depends on:** none

---

## KB-006 🟠 Fix SVG editor split-pane id collision

**Audit ref:** Arch/High — "SVG Editor uses global `document.getElementById('svg-editor-bg')`."
**Why now:** Opening the same/different SVG in left + right split panes today corrupts the background-rect roundtrip in one of them.

**Files**

- `features/svgEditor/components/SVGCanvas.tsx` (×5 call sites)

**Implementation**

1. Replace `document.getElementById(BG_RECT_ID)` with `containerRef.current?.querySelector('[data-bg-rect]')`.
2. Generate a per-instance id with `useId()` if any external library reads the id; otherwise use a `data-bg-rect` attribute and drop the id entirely.
3. Same fix for `path_stretch_line` cleanup inside `finishOpenPath`.
4. New Playwright spec: open two SVGs side-by-side, change background on one, assert the other's background untouched after a save+reload.

**Acceptance**

- [ ] No `document.getElementById` calls remain inside `features/svgEditor/`.
- [ ] New e2e spec passes.

**Verify:** `grep -rn "document.getElementById" features/svgEditor/` returns no results. Run `npx playwright test svgSplitPane`.

**Effort:** 1.5 hrs · **Depends on:** none

---

# M1 — Headline gaps

The three P0 missing features that users notice in week 1.

---

## KB-010 🔴 Fulltext search across vault

**Audit ref:** UX/Critical — "No global search across vault contents."
**Scope:** This is the largest M1 ticket. Treat as 3 sub-PRs landing under one feature flag if helpful.

**Files**

- New: `app/knowledge_base/features/search/`
  - `VaultIndex.ts` — token index data structure.
  - `vaultIndex.worker.ts` — Web Worker that builds and queries the index.
  - `useVaultSearch.ts` — React hook.
  - `SearchPanel.tsx` — right-rail or modal surface.
- `app/knowledge_base/shared/components/CommandPalette.tsx` — surface results when input has no `>` prefix.
- `app/knowledge_base/infrastructure/` — read-side helper that streams `.md` and diagram JSON contents to the worker.

**Implementation**

1. **Index shape:** inverted index `Map<token, Array<{ path, kind: 'doc'|'diagram', field: 'body'|'title'|'label'|'flow', positions }>>`.
2. **Build:** worker walks the vault tree once on vault open, then incrementally on `FileWatcher` events. Tokenize `.md` bodies (lowercase, strip markdown), diagram `title` + `layers[].title` + `nodes[].label` + `flows[].name`.
3. **Query:** AND-of-tokens with prefix matching for the last token. Return top 50 grouped by file with snippet (±40 chars around first match).
4. **Palette integration:** if input has no `>` prefix, route to vault search. Existing `>command` syntax untouched. Add a hint line: "Type `>` for commands."
5. **Search tab:** dedicated view for filter chips (kind, field, folder) and full results.
6. **Diagram-side hits:** clicking a diagram label result opens the diagram and centers/highlights the node. Reuse existing focus utilities in `features/diagram/`.

**Acceptance**

- [ ] Type "alpha" in the palette → results appear within 100ms for a 200-file vault.
- [ ] Hit on a diagram node label → opens the diagram, the node is selected and centered.
- [ ] Editing a doc → reindex within 1s.
- [ ] Index lives in worker memory; main thread never blocks >16ms during query.
- [ ] Prose spec added at `test/prose/06-search.md` with stable IDs.

**Verify:** `npx playwright test search` (new spec). Performance budget asserted via `performance.now()` in test.

**Effort:** 3 days · **Depends on:** none

---

## KB-011 🔴 Export — diagrams as SVG + PNG, documents as printable PDF

**Audit ref:** UX/Critical — "No export."
**Scope:** Two distinct surfaces — diagrams need a serializer, documents need a print stylesheet.

**Files**

- New: `app/knowledge_base/features/export/`
  - `exportDiagramSVG.ts` — pure function `(doc: DiagramDoc) => string` returning a standalone SVG.
  - `exportDiagramPNG.ts` — wraps the SVG export, rasterizes via `<canvas>`.
  - `printDocument.ts` — applies `print.css`, calls `window.print()`.
  - `ExportMenu.tsx` — surface in pane header, with disabled states per pane kind.
- New: `app/globals.print.css` — print stylesheet.

**Implementation**

1. **Diagram → SVG:** serialize nodes (`Element` / `ConditionElement`), connections (`DiagramLinesOverlay`), and labels into a single `<svg>` string. Inline computed colors so it renders without app CSS. Embed font as `@font-face` if used, or stick to system fonts.
2. **Diagram → PNG:** create an offscreen `<canvas>` at 2× resolution, draw the SVG via `Image` + `drawImage`, `toBlob('image/png')`, trigger download.
3. **Document → PDF:** add `print.css` that hides chrome (header, footer, panes), expands the doc to full width, sets readable line-length. Trigger via `window.print()`. Users save as PDF from the print dialog.
4. **Filename convention:** `<doc-or-diagram-name>.<ext>` with date suffix on collision.

**Acceptance**

- [ ] Export a diagram as SVG → opens in a browser tab and renders identically (within reason) to the canvas.
- [ ] Export as PNG → file is at least 1500px wide and visually matches.
- [ ] Print a document → preview matches the in-app read-mode look, no app chrome visible.
- [ ] Export menu greyed out when no exportable pane is focused.

**Verify:** Manual round-trip on a sample vault diagram. New unit test `exportDiagramSVG.test.ts` snapshotting a fixture diagram.

**Effort:** 2 days · **Depends on:** none

---

## KB-012 🟠 First-run hero with Open Vault CTA

**Audit ref:** UX/High — "First-run experience is barren."

**Files**

- New: `app/knowledge_base/shared/components/FirstRunHero.tsx`
- New: `public/sample-vault/` — bundled starter vault as a zip.
- `app/knowledge_base/knowledgeBase.tsx` — render hero when `!directoryName && tree.length === 0`.

**Implementation**

1. Hero replaces the right side (not the explorer header) when no vault is open. Content:
   - App name + one-paragraph pitch.
   - Primary: **Open Vault** button (calls existing picker).
   - Secondary: **Try with sample vault** — downloads `public/sample-vault.zip`, prompts user to pick a folder, unzips into it, opens it.
   - Disclosure: "What's a vault?" → 3-bullet explainer.
2. Sample vault contents: 4–6 docs with wiki-links, 1 diagram, 1 SVG, an `.attachments/` folder with one image. Use it as a working example, not lorem ipsum.

**Acceptance**

- [ ] Fresh load (cleared localStorage) → hero is the first thing the user sees.
- [ ] Sample vault flow ends with the user looking at populated content, not a partial vault.
- [ ] Hero never shows once a vault has been opened.

**Effort:** 2 hrs (hero) + 1 hr (sample vault content) · **Depends on:** none

---

## KB-013 🟠 Pane chrome density — collapse breadcrumb at depth ≤1

**Audit ref:** UX/High — "Pane chrome and hierarchy is dense."

**Files**

- `app/knowledge_base/shared/components/pane/PaneHeader.tsx`
- `app/knowledge_base/features/diagram/components/DiagramToolbar.tsx`

**Implementation**

1. In PaneHeader, hide the breadcrumb strip when path depth ≤ 1 (root-level files have no useful crumbs).
2. At viewport widths < 1100px, collapse the diagram toolbar's secondary controls (Live, Labels, Minimap) into a `⋯` overflow menu. Zoom stays visible.
3. Reduce explorer default width from 260px to 240px (token in `app/globals.css`).

**Acceptance**

- [ ] Open a root-level note → no breadcrumb strip.
- [ ] Resize to 1024px → diagram toolbar collapses.
- [ ] No layout shift > 4px when switching between paths of different depth.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-014 🟡 Toast stack (multi-toast)

**Audit ref:** UX/Medium — "Toast system is single-message."

**Files**

- `app/knowledge_base/shell/ToastContext.tsx`

**Implementation**

1. Replace `useState<Toast | null>` with `useState<Toast[]>`. Cap at 3.
2. Each toast has its own timer ref keyed by toast id.
3. FIFO eviction when a 4th arrives.
4. Render stack bottom-up with stagger animation.

**Acceptance**

- [ ] Fire 3 toasts in 1s → all 3 visible.
- [ ] Fire a 4th → oldest disappears.
- [ ] Each disappears on its own schedule.

**Verify:** Add unit test or Playwright spec firing 4 toasts and asserting DOM count.

**Effort:** 30 min · **Depends on:** none

---

# M2 — Architecture & performance

The DiagramView refactor unblocks most perf work. Do it first.

---

## KB-020 🔴 Split DiagramView into hook + interaction context

**Audit ref:** Arch/Critical — "DiagramView.tsx is 1,616 lines."
**Why now:** Single biggest source of risk and the reason perf fixes are hard. Cutting this unblocks KB-021 / KB-022.

**Files**

- `app/knowledge_base/features/diagram/DiagramView.tsx` (the target — should end ≤ 300 lines)
- New: `app/knowledge_base/features/diagram/hooks/useDiagramDocument.ts`
- New: `app/knowledge_base/features/diagram/state/DiagramInteractionContext.tsx`

**Implementation**

1. **Extract `useDiagramDocument(activeFile)`** — returns `{ doc, dispatch }` where `doc = { title, layers, nodes, connections, lineCurve, flows }`. All document mutations go through `dispatch` (a tiny reducer). This is a tiny in-component store, not Redux.
2. **Extract `DiagramInteractionContext`** — wraps `hoveredNodeId`, `contextMenu`, `anchorPopup`, `editingLabel`, `selection`. Children read via selector hooks (`useHovered()`, `useSelection()`) so unrelated children don't re-render.
3. **DiagramView itself** is now layout + slot wiring: `<DiagramOverlays>`, `<NodeLayer>`, `<LinesOverlay>`, `<LabelEditor>`, etc.
4. **Keep behavior identical** — no new features, no UX changes. All existing prose spec IDs (DIAG-3.10-21 etc.) must still pass without spec edits.

**Acceptance**

- [ ] `wc -l app/knowledge_base/features/diagram/DiagramView.tsx` ≤ 300.
- [ ] All existing diagram e2e specs pass unchanged.
- [ ] No new `props drilling` more than 2 levels deep — verify by reading the file end-to-end.
- [ ] Adding a new piece of interaction state requires touching one file (the context), not DiagramView.

**Verify:** `npx playwright test --grep diagram` is fully green. Read the diff yourself and confirm clean separation.

**Effort:** 3 days · **Depends on:** none, but every other M2 ticket is easier after this lands.

---

## KB-021 🟠 Memoize Element / ConditionElement

**Audit ref:** Perf/High — "DiagramView re-renders the entire canvas on every selection change."

**Files**

- `app/knowledge_base/features/diagram/components/Element.tsx`
- `app/knowledge_base/features/diagram/components/ConditionElement.tsx`

**Implementation**

1. Wrap both in `React.memo` with a custom equality comparing only `{ id, x, y, w, h, label, colors, flowRole }`.
2. After KB-020, hover state lives in context — pull it via selector so memoized children don't bust on hover changes.
3. Use the React DevTools profiler on a 50-node sample diagram to confirm: dragging one node should re-render 1, not 50.

**Acceptance**

- [ ] Profiler shows ≤ 3 component renders per drag frame on a 50-node diagram (the dragged node + 1–2 overlay components).
- [ ] No visual regressions.

**Verify:** Manual profile + screenshot of the flame graph attached to PR.

**Effort:** 1 day · **Depends on:** KB-020

---

## KB-022 🟠 Memoize wiki-link tree walks

**Audit ref:** Perf/High — "Wiki-link path resolution walks the entire tree on every navigation."

**Files**

- `app/knowledge_base/knowledgeBase.tsx` (around line 268)
- `app/knowledge_base/features/document/DocumentView.tsx` (around line 129)

**Implementation**

1. Extract `useAllPaths(tree)` hook in `shared/hooks/`. `useMemo` keyed on tree object identity.
2. **Important:** the audit notes tree identity churns. Find the source of churn (likely a non-memoized derivation in the file watcher subscriber) and stabilize it with `useMemo` at the source.
3. Replace both call sites with the new hook.

**Acceptance**

- [ ] In React DevTools, `allPaths` recomputes only when the tree actually changes (not on every keystroke).

**Effort:** 2 hrs · **Depends on:** none

---

## KB-023 🟡 globals.css split into 5 files

**Audit ref:** Arch/Medium — "globals.css is 580 lines mixing 5 concerns."

**Files**

- `app/globals.css` (split target)
- New: `app/styles/tokens.css`, `prose.css`, `editorial.css`, `tables.css`, `mobile.css`
- Whatever currently imports `globals.css` (likely `app/layout.tsx`)

**Implementation**

1. Create the 5 new files with single-responsibility content. Keep `@theme inline` in `tokens.css`.
2. `globals.css` becomes a manifest: 5 `@import` lines + any truly-global resets.
3. No CSS rule changes — just relocation. Diff should be moves.

**Acceptance**

- [ ] Each new file < 200 lines.
- [ ] Visual diff against main: zero pixel changes (test on home + diagram + doc + read-mode pages).
- [ ] No `@import` cycles.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-024 🟡 Replace `innerHTML =` outside DOMPurify with DOMParser

**Audit ref:** Arch/Medium — "Two separate `innerHTML` writes outside DOMPurify."

**Files**

- `markdownRevealConversion.ts` (line ~299)
- `markdownSerializer.ts` (line ~15)
- `wikiLink.tsx` (line ~210) — lower-risk but include for hygiene

**Implementation**

1. Replace `div.innerHTML = html` with `new DOMParser().parseFromString(html, 'text/html').body.firstChild` (or iterate `.body.children`).
2. No script execution branch — same DOM parse, safer footgun profile.
3. Add a comment block at each site: "Why DOMParser, not innerHTML — see SECURITY.md / KB-024."

**Acceptance**

- [ ] `grep -n "innerHTML\s*=" app/` shows only DOMPurify-sanitized writes (DocPreview).
- [ ] All ProseMirror serialization round-trip tests still pass.

**Effort:** 1 hr · **Depends on:** none

---

# M3 — Accessibility

WCAG-aligned tickets. The diagram-canvas keyboard work is the biggest; everything else is small.

---

## KB-030 🔴 Diagram canvas keyboard navigation

**Audit ref:** A11y/Critical — "Diagram canvas is fully unreachable by keyboard."
**WCAG:** 2.1.1.

**Files**

- New: `app/knowledge_base/features/diagram/hooks/useCanvasKeyboardNav.ts`
- `app/knowledge_base/features/diagram/DiagramView.tsx` (or whichever post-refactor file owns the canvas root)
- `app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts` (extend)
- New: `app/knowledge_base/features/diagram/components/CanvasLiveRegion.tsx`

**Implementation**

1. Canvas root gets `tabindex=0`, visible focus ring, `role="application"`, `aria-label="Diagram canvas. Tab to walk nodes, arrows to move."`
2. Tab / Shift+Tab walks nodes in reading order (sort by `layer.zIndex` then `y` then `x`).
3. Arrow keys move the selected node by 8px (or 1px with Shift).
4. Enter starts label edit on the focused node.
5. Selection changes announced via `aria-live="polite"` region. Format: "Selected: <label or 'unnamed'>, layer <name>".
6. Add prose spec entries with new IDs (e.g. DIAG-A11Y-1 through -5) and a Playwright spec exercising each.

**Acceptance**

- [ ] Can complete the existing diagramGoldenPath spec using keyboard only (new test).
- [ ] axe-core scan of the diagram pane: zero violations.

**Effort:** 2 days · **Depends on:** KB-020 (clean canvas root makes the focus root unambiguous)

---

## KB-031 🟠 Focus trap on the 4 modals that don't have it

**Audit ref:** A11y/High — "Three modals don't trap focus." (Audit names DocPreviewModal, DetachDocModal, CreateAttachDocModal — verify count during impl.)

**Files**

- New: `app/knowledge_base/shared/hooks/useFocusTrap.ts` (extracted from CommandPalette pattern)
- `app/knowledge_base/shared/components/CommandPalette.tsx` (refactor to use the new hook — gold standard reference)
- `DocPreviewModal.tsx`, `DetachDocModal.tsx`, `CreateAttachDocModal.tsx`, plus any others

**Implementation**

1. `useFocusTrap(ref, isOpen)` — captures `prevFocusRef` on open, traps Tab inside the ref subtree, restores focus on close. Bind Escape.
2. Refactor CommandPalette to use the hook (no behavior change).
3. Apply to the other 3+ modals.

**Acceptance**

- [ ] Open any modal → Tab cycles only within it.
- [ ] Escape closes any modal.
- [ ] Closing returns focus to the trigger element.

**Verify:** axe-core scan + manual keyboard pass per modal.

**Effort:** 1.5 hrs · **Depends on:** none

---

## KB-032 🟠 Add non-color signals for dirty / flow role / active pane

**Audit ref:** A11y/High — "Color-only signals."
**WCAG:** 1.4.1.

**Files**

- Find dirty-dot rendering (header + tab title sites).
- Flow role: `Element.tsx` / `ConditionElement.tsx`.
- Active pane border: pane chrome.

**Implementation**

1. **Dirty:** prepend "•" to title text and add `aria-label="Modified"` on the dot.
2. **Flow role:** add a small "Start" / "End" pill next to the node (text), not just glow.
3. **Active pane:** add an `<span class="sr-only">Focused</span>` inside the active pane's chrome. Optional: visible "Focused" caption only when prefers-reduced-motion users disable subtle borders.

**Acceptance**

- [ ] Disable browser CSS color → dirty / flow / focus state still distinguishable.
- [ ] axe-core scan: no contrast-only signal warnings.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-033 🟡 File explorer ARIA tree

**Audit ref:** A11y/Medium — "Tree isn't `role='tree'` with `aria-expanded`."

**Files**

- `app/knowledge_base/shared/components/explorer/TreeNodeRow.tsx`
- `app/knowledge_base/shared/components/explorer/ExplorerPanel.tsx`

**Implementation**

1. Outer container: `role="tree"`.
2. Each row: `role="treeitem"`, `aria-level={depth+1}`, `aria-expanded={isOpen}` for folders, `aria-selected={isActive}`.
3. Arrow keys: ↓/↑ move focus, → expands, ← collapses or moves to parent.

**Acceptance**

- [ ] Screen reader announces "tree, X items" and folder expand/collapse state.
- [ ] All existing explorer e2e specs still pass.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-034 🟡 Active-row dark-mode contrast audit

**Audit ref:** A11y/Medium — "Active-row contrast in dark mode."

**Files**

- `app/globals.css` (or `app/styles/tokens.css` after KB-023) — the `[data-theme="dark"] .bg-blue-50` rule.

**Implementation**

1. Bump active-row alpha from .18 to .25.
2. Run `axe-core` or Lighthouse contrast check against active rows in dark mode for both 14px filename text and 13px `text-mute` path text.
3. If 13px text fails, swap to a lighter token for that line specifically.

**Acceptance**

- [ ] All text on active rows hits 4.5:1 minimum in both themes.

**Effort:** 1 hr · **Depends on:** none

---

## KB-035 🟡 Add `role="status"` live regions for save/dirty/conflict

**Audit ref:** A11y/Medium — "No `role='status'` live region for save/dirty/conflict."

**Files**

- Dirty stack indicator component.
- Conflict banner component.
- Existing toast already has this — reference pattern.

**Implementation**

1. Wrap the dirty count and the conflict banner in `<div role="status" aria-live="polite">`.
2. Make sure the live text is the _content_, not chrome (don't announce icon-only updates).

**Effort:** 30 min · **Depends on:** none

---

## KB-036 🟢 Replace `title=` tooltips with keyboard-reachable component

**Audit ref:** A11y/Low — "Tooltips are `title`-attribute based."

**Files**

- New: `app/knowledge_base/shared/components/Tooltip.tsx`
- All icon button sites with `title=` attributes — search: `grep -rn 'title=\"' app/knowledge_base/`

**Implementation**

1. Reuse the kb-table-toolbar custom CSS tooltip pattern.
2. New `<Tooltip>` shows on hover **and** focus, with proper `aria-describedby`.
3. Replace `title=` on all icon buttons. Keep `aria-label` for SR users.

**Acceptance**

- [ ] Tabbing to any icon button surfaces its tooltip without OS delay.

**Effort:** 3 hrs · **Depends on:** none

---

## KB-037 🟠 Document pane dark-mode contrast

**Audit ref:** A11y/Medium — discovered during KB-034 (2026-05-02). The document pane wrapper hardcodes `bg-white`, so prose body + headings — which already use tokenized `--ink` / `--ink-2` (slate-100 / slate-200 in dark) — render near-white-on-white in dark mode. The ProseMirror surface inherits the wrapper background, so a single token swap on the wrapper unblocks every typography rule already wired to `var(--…)`.

**Files**

- `src/app/knowledge_base/features/document/components/MarkdownPane.tsx` — loaded-file pane wrapper (line 153).
- `src/app/knowledge_base/features/document/components/ReadingTOC.tsx` — sibling TOC rail (same hardcoded `bg-white border-slate-100`).

**Out of scope** (implicit deferrals — Features.md §1.13 explicitly defers Properties panel + condition popovers; these are the document-side equivalents)

- `DocumentProperties.tsx` (3 sites of `bg-white border-slate-200`).
- Document popovers / dropdowns: `WikiLinkHoverCard`, `LinkEditorPopover`, `FolderPicker`, `TablePicker`, `wikiLink` autocomplete, `codeBlockCopy` button, `MarkdownPane` references pill + backlinks dropdown chrome.

**Implementation**

1. `MarkdownPane.tsx`: replace `bg-white` on the loaded-file wrapper with `bg-surface`.
2. `ReadingTOC.tsx`: replace `bg-white border-l border-slate-100` with `bg-surface border-l border-line`.
3. Verify each swap is byte-identical in light: `--surface` = `#ffffff` matches `bg-white`; `--line` = `#e2e8f0` matches `border-slate-200`. The `border-slate-100` → `border-line` step is the one drift to call out (slate-100 = `#f1f5f9`, line = `#e2e8f0` — visibly indistinguishable but not byte-equal; document in PR).

**Acceptance**

- [ ] All prose body + headings on `[data-pane-content="document"]` clear 4.5:1 in dark mode (axe-core or WCAG math).
- [ ] Light-mode rendering byte-identical for the wrapper; near-identical for the TOC rail border (slate-100 → line one-pixel drift, deliberate).

**Verify**

- `npx playwright test documentDarkMode` (new axe spec scoped to `[data-pane-content="document"]` in dark, asserting zero `color-contrast` violations).
- `npx playwright test editorialReadMode themeToggle` to confirm no regression on the read-mode and theme-toggle paths.

**Effort:** 30 min · **Depends on:** none

---

# M4 — Polish

UX papercuts and perf nits. Mostly small.

---

## KB-040 🟡 Mobile shell — add Create sheet

**Audit ref:** UX/Medium — "Mobile shell tabs are Files/Read/Graph — no create."

**Files**

- Mobile bottom nav component.
- New: `app/knowledge_base/shared/components/mobile/CreateSheet.tsx`

**Implementation**

1. Add a `+` button center-positioned in BottomNav.
2. On tap: bottom sheet with "New Document" / "New Diagram" / "Pick Folder".
3. Decision call: if mobile editing is out of scope, replace this ticket with documenting "read-only on mobile" in the first-run hero (KB-012). Confirm with product owner before building.

**Effort:** 3 hrs · **Depends on:** KB-012 if we go the docs route.

---

## KB-041 🟡 FileWatcher backoff when idle

**Audit ref:** Perf/Medium — "FileWatcher polls every 5s, no debouncing of subscriber storms."

**Files**

- `app/knowledge_base/infrastructure/FileWatcher.ts` (or wherever the polling loop lives)
- Footer chip site.

**Implementation**

1. Track last-input timestamp (any keypress / pointermove / scroll).
2. If idle >2 min, back off poll interval to 30s; resume 5s on next input.
3. Stagger subscribers: don't fire all on the same tick — round-robin across 1-second slots.
4. Add a small "Last synced 8s ago" footer chip so users trust the lag.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-042 🟡 Graph view node-count guard

**Audit ref:** Perf/Medium — "react-force-graph-2d uncapped."

**Files**

- `app/knowledge_base/features/graph/GraphView.tsx`

**Implementation**

1. If node count > 300, render a "Filter to render" placeholder instead of the graph. Offer quick filters: by folder, by tag (after KB-050), recent only.
2. Keep the explicit "Render anyway" escape hatch.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-043 🟢 Title H1 derivation — only parse on prefix change

**Audit ref:** Perf/Medium — "Title H1 derivation runs `getFirstHeading` on every keystroke."

**Files**

- `app/knowledge_base/features/document/DocumentView.tsx` (line ~91)

**Implementation**

1. Compare `content.slice(0, 200)` to last seen prefix. If unchanged, skip `getFirstHeading`.
2. The 250ms timeout stays as a coarse debounce.

**Effort:** 15 min · **Depends on:** none

---

## KB-044 🟢 Service worker — cache app shell

**Audit ref:** Perf/Low — "Service worker pre-caches manifest + icon, doesn't cache app shell."

**Files**

- `public/sw.js` (or wherever the SW lives).

**Implementation**

1. On install, precache: `/`, `/index.html`, the main JS/CSS bundle (use the build manifest).
2. Network-first for HTML, cache-first for hashed assets.
3. Confirm offline boot returns the app, not Chrome's offline page.

**Effort:** 2 hrs · **Depends on:** none

---

## KB-045 🟢 Empty-state copy upgrade

**Audit ref:** UX/Low — "Empty-state copy is generic."

**Files**

- Empty-state component (search "No file open").

**Implementation**

1. Replace with: shortcut list (top 5: Cmd+K, Cmd+N, Cmd+S, Cmd+., Cmd+\\), Recent files (last 5 from existing recents store), and a "New Note" button.

**Effort:** 1 hr · **Depends on:** none

---

## KB-046 ⚪ Strip "Phase 3 PR 1 (SHELL-1.13, …)" markers

**Audit ref:** Arch/Nit — "Phase markers everywhere — turn into git history."

**Files**

- Anywhere with `// Phase N PR M` style comments — grep `grep -rn "Phase [0-9]" app/`.

**Implementation**

1. Delete the markers. They live in git history.
2. Where the marker was _also_ explaining "why," keep the why and drop the metadata.

**Effort:** 1 hr · **Depends on:** none

---

## KB-047 ⚪ Reduce comment density on `useEffect` blocks

**Audit ref:** Arch/Nit — "Comment density is high."

**Files**

- `knowledgeBase.tsx`, `DiagramView.tsx` (after KB-020), and any other effect-heavy file.

**Implementation**

1. Where a comment merely restates the code, delete.
2. Where it explains _why_ (race condition, ordering, browser quirk), keep — but tighten to one sentence.
3. Goal: code-to-comment ratio improves without losing real reasoning.

**Effort:** 1 hr · **Depends on:** KB-020 (do during the refactor)

---

# M5 — Quarter horizon

Larger features. Each is roughly its own week.

---

## KB-050 — Tag system + tag-filtered explorer

**Audit ref:** Gap P1. Parse `#tag` syntax in `.md` and a `tags: []` field in diagram JSON. Index alongside KB-010. Surface a tag rail in explorer.
**Effort:** ~1 week.

## KB-051 — Inline diagram embed in documents

**Audit ref:** Gap P1. `![[diagram-name]]` renders the SVG export (KB-011) inline in read mode.
**Effort:** 3 days. **Depends on:** KB-011.

## KB-052 — Persisted version history UI

**Audit ref:** Gap P1. Sidecar `.history.json` plumbing exists; surface it in `HistoryPanel.tsx` with diff view.
**Effort:** ~1 week.

## KB-053 — Daily notes / templates

**Audit ref:** Gap P2.
**Effort:** 2 days.

## KB-054 — Frontmatter editor

**Audit ref:** Gap — "No note frontmatter editor (data-loss risk for Obsidian importers)." Important: verify whether `repositoryHelpers` currently strips frontmatter on save — if so, this ticket is a P1 data-integrity fix, not P2.
**Effort:** 3 days.

## KB-055 — Publish read-only HTML bundle

**Audit ref:** Gap P2. Static export of vault as a browseable HTML site.
**Effort:** ~1 week.

## KB-056 — Undo/redo on file ops

**Audit ref:** Gap P1 — "Delete a note → no undo." 5s undo toast for delete/move.
**Effort:** 2 days.

## KB-057 — Multi-select drag in explorer

**Audit ref:** Gap P2.
**Effort:** 2 days. **Depends on:** KB-033 (ARIA tree clean baseline).

## KB-058 — Plugin / extension surface

**Audit ref:** Gap P3 — only matters at scale.
**Effort:** open-ended.

## KB-059 — Move feature folder out of `app/knowledge_base/`

**Audit ref:** Arch/Low — "Knowledge-base feature folder lives under `app/knowledge_base/` — redundant."
**Implementation:** Move tree to `src/features/`; `app/` becomes a thin route shell. Big find/replace on imports. Do during a quiet week.
**Effort:** 1 day. **Risk:** import surface churn — schedule when no other M-tickets are mid-flight.

---

# Working agreements (for the agent)

- **One PR per ticket.** Don't combine. Reviewers read better when scope is small.
- **Tests live with code.** New unit tests next to the file; new e2e specs in `test/`.
- **Prose specs are sources of truth.** When a ticket adds user-visible behavior to an existing surface (diagram, document, explorer), update the matching prose spec in `test/prose/` _first_, get the new feature ID, then write code + tests against it.
- **Don't break documented strengths.** Anything in `## Working agreements` of the audit (domain/infra boundary, classified FS errors, per-vault scoping, prose-spec discipline, design tokens, Bridge ISP, file watcher + conflict UI). If a ticket seems to require breaking one, stop and ask.
- **Read `AGENTS.md` and the current Next.js docs in `node_modules/next/dist/docs/` before any framework-level change.** This repo uses a non-stable Next; assumptions from training data will be wrong.
- **Verify before marking done.** Each ticket has a `Verify:` block. Run it.

---

_End of plan. 37 tickets covering all 34 audit findings + sample-vault + globals split. Track progress against this file._
