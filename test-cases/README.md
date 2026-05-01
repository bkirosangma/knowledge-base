# Test Cases

Human-readable catalogue of every scenario we care about covering, split by feature area. Mirrors the section numbering of [`../Features.md`](../Features.md). One-line-per-case Gherkin-lite so the whole coverage surface is scannable.

> **⚠️ Maintenance contract.** When a feature is added, removed, renamed, or enhanced, the owning test-cases file must be updated in the same change set (same rule as `Features.md` — see `CLAUDE.md`).

---

## Files

| # | Prefix | Area | File |
|---|--------|------|------|
| 1 | `SHELL` | App Shell & Layout | [01-app-shell.md](01-app-shell.md) |
| 2 | `FS` | File System & Vault | [02-file-system.md](02-file-system.md) |
| 3 | `DIAG` | Diagram Editor | [03-diagram.md](03-diagram.md) |
| 4 | `DOC` | Document Editor | [04-document.md](04-document.md) |
| 5 | `LINK` | Cross-Cutting Links & Graph | [05-links-and-graph.md](05-links-and-graph.md) |
| 6 | `HOOK` | Shared Hooks & Utilities | [06-shared-hooks.md](06-shared-hooks.md) |
| 7 | `PERSIST` | Persistence Surface | [07-persistence.md](07-persistence.md) |
| 8 | `SEARCH` | Vault Search (KB-010) | [08-search.md](08-search.md) |
| 9 | `EXPORT` | Export (KB-011) — diagram → SVG / PNG, document → print | [09-export.md](09-export.md) |
| 10 | `FIRSTRUN` | First-run experience (KB-012) — hero + sample vault | [10-first-run.md](10-first-run.md) |

---

## Conventions

### Case format

One line per case:

```
- **ID** STATUS **Name** — short behaviour statement (Given / When / Then condensed).  _(optional notes)_
```

Example:

```
- **DIAG-3.8-01** ❌ **Straight routing** — `lineCurve="straight"` → path is a single segment from `fromAnchor` to `toAnchor`.
- **SHELL-1.1-01** 🧪 **App mounts** — navigate to `/` → `[data-testid="knowledge-base"]` visible, zero `pageerror`, zero console errors. _(e2e: `e2e/app.spec.ts`)_
```

### ID scheme

```
<PREFIX>-<section>.<subsection>-<nn>

Example: DOC-4.3-10
         │   │       └─ two-digit case number within the subsection
         │   └───────── Features.md section number (4 = Document, .3 = Wiki-links)
         └───────────── area prefix (see Files table above)
```

Case numbers are zero-padded to two digits (`01`, `02`, …) and **never renumbered once assigned** — new cases get the next free number in the section even if that leaves gaps after deletions. This keeps test-file back-references stable.

### Coverage status

| Marker | Meaning |
|---|---|
| ✅ | At least one passing test asserts the behaviour. |
| 🟡 | Partial — some of the Given/When/Then cases are asserted but not all. |
| 🧪 | Covered only by e2e (Playwright), not by unit/integration. |
| ❌ | Gap — no test exists yet. |
| 🚫 | Won't test — documented reason in the notes (e.g. requires a real browser folder picker). |

### Adding a case

1. Find the matching section in the owning file.
2. Append a line with the next free number and status `❌`.
3. Reference the ID in a comment or the `it()` title in the test file.
4. Flip `❌` → `✅` / `🧪` in the same commit as the test lands.

### Linking cases ↔ tests

When writing a test, reference the case ID in a comment or the `it()` title so traceability is grep-able in both directions:

```ts
it('DIAG-3.8-01: straight routing is a single segment', () => { … })
```

```ts
// covers DIAG-3.8-01, DIAG-3.8-02
describe('pathRouter', () => { … })
```

Flip the marker in the case file from ❌ → ✅ in the same commit as the test lands.

### When to use 🟡

If a case has multiple bullet-form sub-conditions and only some have tests, mark 🟡 and note which sub-condition is still a gap in a parenthetical.

### When to use 🚫

Reserved for cases we consciously choose not to automate — e.g. the File System Access folder picker which no headless browser can accept. Include a one-line reason and (where possible) a manual-test checklist step elsewhere.

---

## How to read a file

Every area file has the same top-level structure:

```
# Test Cases — <Area>

> Mirrors §<N> of Features.md

## <N.1> <Sub-feature name>
- **<ID>** <STATUS> **<Name>** — …

## <N.2> <Sub-feature name>
- **<ID>** <STATUS> **<Name>** — …
```

Section numbering matches `Features.md` exactly. If `Features.md` gains a new section, add the matching section here; if a section is deleted, delete the corresponding cases rather than leaving tombstones.

---

## Current coverage snapshot

_Snapshot at 2026-04-25 (feat/file-watching review fixes: ToastContext, ConflictBanner, useReadOnlyState→shared/hooks; 9 new ✅ cases added). Regenerate with the one-liner at the bottom of this section after each bucket lands._

| File | ✅ | 🟡 | 🧪 | ❌ | 🚫 | Total |
|---|---:|---:|---:|---:|---:|---:|
| 01-app-shell.md | 59 | 12 | 3 | 1 | 5 | 80 |
| 02-file-system.md | 79 | 8 | 0 | 3 | 5 | 95 |
| 03-diagram.md | 178 | 35 | 0 | 37 | 3 | 253 |
| 04-document.md | 170 | 34 | 3 | 9 | 32 | 248 |
| 05-links-and-graph.md | 21 | 0 | 5 | 9 | 0 | 35 |
| 06-shared-hooks.md | 104 | 0 | 0 | 0 | 0 | 104 |
| 07-persistence.md | 36 | 7 | 0 | 1 | 7 | 51 |
| **Total** | **647** | **96** | **11** | **60** | **52** | **866** |

Covered (✅ + 🟡 + 🧪) = **754 / 866 (87%)**; open gaps (❌) = **60 (7%)**; consciously waived (🚫) = **52 (6%)**.

The 52 🚫 items break down into:
- **JSDOM geometry blocked** (DOC-4.3-xx, DOC-4.5-xx, DOC-4.7-xx, DOC-4.12-xx) — Tiptap NodeView rendering, `editor.isActive()`, link popover geometry, and read-mode click navigation need a real browser.
- **Feature gaps not yet implemented** (PERSIST-7.1-04/05/06/09, FS-2.3-03/16/20, DOC-4.9-02/09) — persistence not wired up; product backlog, not test backlog.
- **Removed/obsolete UI** (SHELL-1.2-01/07/08, SHELL-1.4-07) — components deleted in the 2026-04-19 header strip-down.
- **Module-private helpers** (DOC-4.3-36/37, DOC-4.5-09/10/11) — LRU cache and rawBlock toggle helpers are unexported; would require extraction to unit-test.
- **Intentional behavior locks** (DOC-4.13-14) — documented code-fence limitation preserved as a regression guard.
- **Non-features by design** (PERSIST-7.3-16, PERSIST-7.5-04) — no retry logic, reset-app IDB semantics unverified.
- **Browser-level only** (PERSIST-7.1-15, FS-2.1-12, FS-2.3-50) — private-mode simulation, native permission revocation, and `preventDefault` on contextmenu can't be asserted even with Playwright.
- **Not yet implemented** (DIAG-3.8-09, DIAG-3.13-23, DIAG-3.13-26) — bidirectional arrowheads, manual-size override toggle, and per-connection curve algorithm dropdown not yet built.

**2026-04-19 — shell header strip-down + Pane Header H1 derivation.** Title editing, dirty dot, Save, and Discard moved from the top-level `Header` into each pane's `PaneTitle` row:

- `SHELL-1.2-02..06` and `SHELL-1.2-09..13` stay ✅ but now run against `PaneTitle.test.tsx` instead of `Header.test.tsx`.
- `SHELL-1.2-01` (Back button), `SHELL-1.2-07` (80-char cap), and `SHELL-1.2-08` (auto-widen) → 🚫: component gone / layout uses flex + `truncate` instead of those pixel-level constraints.
- `SHELL-1.4-07` (Pane type drives Header controls) → 🚫: there are no pane-specific controls in the top-level bar anymore; `ToolbarContext.activePaneType` is still read by the Footer (1.5).
- Four new `PaneTitle` cases added as `SHELL-1.2-23..26` (read-only doc-pane mode, dirty-dot + button suppression when handlers omitted, debounced H1 derivation wiring).
- Document pane persistence gains `DOC-4.11-17..19` (bridge `discard()` re-reads from disk, honours `loadError` guard, reports failures).
- New section `DOC-4.13 Pane Header Title (first-heading derivation)` with 16 cases covering ATX H1, frontmatter skip, fallback stripping of list/blockquote/lower-heading markers, debounce, and the `#hashtag` / code-fence edge cases.

**2026-04-25 — document editor E2E + wiki-link folder picker unit tests.** `e2e/documentEditor.spec.ts` (11 tests) covers DOC-4.1-04, DOC-4.3-07..11, DOC-4.7-15..17, DOC-4.3-15/16, DOC-4.12-05. New unit test files: `FolderPicker.test.tsx` (DOC-4.3-41..46), `DocumentView.discard.test.tsx` (DOC-4.11-22..25). 28 DOC-4 cases reclassified ❌→🚫 (JSDOM-geometry-blocked: Tiptap NodeView rendering, link popover, read-mode navigation). Stale content indexing bug fixed in `DocumentView.tsx` (`loadedPath` guard); unresolved wiki-link click now creates file with correct `.md` extension.

### Test suites that back these numbers

- **Unit / integration** (Vitest + JSDOM): 87 test files, 1194 passing tests. Split across feature areas:
  - App Shell: `Header.test.tsx`, `Footer.test.tsx`, `FooterContext.test.tsx`, `ToolbarContext.test.tsx`, `PaneManager.test.tsx`, `SplitPane.test.tsx`, `PaneTitle.test.tsx`, `PaneHeader.test.tsx`, `ShellErrorContext.test.tsx`.
  - File System & Vault: `ExplorerPanel.test.tsx`, `DocumentPicker.test.tsx`, `iconRegistry.test.ts`, `vaultConfig.test.ts`, `useFileExplorer.helpers.test.ts`, `useFileExplorer.createDocument.test.tsx`, `useFileExplorer.operations.test.tsx`, `useFileActions.test.ts`, `useDirectoryHandle.test.ts`, `idbHandles.test.ts`, `ConfirmPopover.test.tsx`, `fileTree.test.ts`.
  - Diagram: `gridSnap.test.ts`, `anchors.test.ts`, `pathRouter.test.ts`, `flowUtils.test.ts`, `collisionUtils.test.ts`, `conditionGeometry.test.ts`, `geometry.test.ts`, `levelModel.test.ts`, `LayerProperties.test.tsx`, `AutocompleteInput.test.tsx`, `DocumentsSection.test.tsx`, `ContextMenu.test.tsx`, `FlowBreakWarningModal.test.tsx`, `DocInfoBadge.test.tsx`, `Layer.test.tsx`, `FlowDots.test.tsx`, `DiagramProperties.test.tsx`, `NodeProperties.test.tsx`, `LineProperties.test.tsx`, `PropertiesPanel.test.tsx`, `ConditionElement.test.tsx`, `Element.test.tsx`, `HistoryPanel.test.tsx`, `DiagramView.test.tsx`, `DiagramView.docHistory.test.tsx`, `CreateAttachDocModal.test.tsx`, `DetachDocModal.test.tsx`, `DocPreviewModal.test.tsx`, `FlowProperties.test.tsx`, `useContextMenuActions.test.ts`, `useFlowManagement.test.ts`, `autoArrange.test.ts`, `connectionConstraints.test.ts`, `documentAttachments.test.ts`, `layerBounds.test.ts`, `selectionUtils.test.ts`, `typeUtils.test.ts`, `persistence.test.ts`, `directoryScope.test.ts`.
  - Document: `wikiLinkParser.test.ts`, `markdownSerializer.test.ts`, `useDocuments.test.tsx`, `useLinkIndex.test.ts`, `useDocumentContent.test.ts`, `tableNoNest.test.tsx`, `codeBlockCopy.test.tsx`, `FolderPicker.test.tsx`, `LinkEditorPopover.test.tsx`, `TableFloatingToolbar.test.tsx`, `TablePicker.test.tsx`, `DocumentProperties.test.tsx`, `DocumentView.discard.test.tsx`, `MarkdownEditor.test.tsx`, `markdownReveal.test.ts`, `rawBlockHelpers.test.ts`, `getFirstHeading.test.ts`, `useDocumentKeyboardShortcuts.test.ts`.
  - Links & Graph: `graphifyBridge.test.ts`.
  - Shared history: `historyPersistence.test.ts`, `useHistoryCore.test.ts`, `useHistoryFileSync.test.ts`, `useDocumentHistory.test.ts`, `useDiagramHistory.test.ts`.
  - Hooks: `useSyncRef.test.ts`, `useEditableState.test.ts`.
  - Domain: `errors.test.ts`.
- **E2E** (Playwright + Chromium): 79 tests across 13 spec files — `app.spec.ts` (6), `goldenPath.spec.ts` (6), `diagramGoldenPath.spec.ts` (6), `documentGoldenPath.spec.ts` (5), `documentReadOnly.spec.ts` (5), `documentEditor.spec.ts` (11), `fileExplorerOps.spec.ts` (5), `flowHighlight.spec.ts` (6), `fsMockSanity.spec.ts` (3), `diagramKeyboard.spec.ts` (13), `diagramReadOnly.spec.ts` (7), `diagramConnectionRendering.spec.ts` (3), `diagramMinimap.spec.ts` (3).

### Why 60 ❌ gaps remain

- **Remaining canvas geometry (DIAG-3.2 Canvas, 3.5 Node drag, 3.7 Layer drag, 3.9 Connection interaction)** — deeper drag, drop, and scroll geometry still require live browser viewport. DIAG-3.3/3.14/3.17 are now covered by Playwright (see spec files above); the rest need more complex pointer-event sequences or real scroll/zoom harnesses.
- **Live Tiptap DOM (DOC-4.1 orchestration, DOC-4.2 StarterKit rendering)** — Tiptap's contenteditable behavior and NodeView rendering in the full editor context need a real browser. DOC-4.3-07..11, DOC-4.7-15..17, DOC-4.3-15/16, DOC-4.12-05 are now covered by `e2e/documentEditor.spec.ts`; remaining gaps are deeper wiki-link interaction flows.
- **File System Access folder picker (FS-2.1-02, 2.1-12, PERSIST-7.3-15)** — Chromium gates `window.showDirectoryPicker` behind a native dialog that Playwright can't drive without an in-browser mock injected via `page.addInitScript`.
- **Impl gaps, not test gaps (PERSIST-7.1-04/05/06/09)** — Explorer sort/filter/collapse and "Don't ask again" flags are not yet persisted to localStorage. These are product backlog, not test backlog.
- **LINK-5.x live flows** — backlink propagation, rename/delete cascades, and graph-view interactions need live vault state across multiple open documents.

### Path to driving ❌ down further

1. ✅ **Playwright diagram specs** (2026-04-24 — done) — `diagramKeyboard.spec.ts`, `diagramReadOnly.spec.ts`, `diagramConnectionRendering.spec.ts`, `diagramMinimap.spec.ts` cover DIAG-3.2-10, 3.3-01/02/06, 3.5-01/10/11/12, 3.7-01, 3.8-10/14, 3.10-17, 3.14-01/02/04/05/08/09/10, 3.16-12, 3.17-02/03/06/07/08/09. Seed helpers in `e2e/helpers/diagramSeeds.ts`.
2. ✅ **Tiptap integration harness** (done) — `MarkdownEditor.test.tsx` mounts the real `MarkdownEditor` with full extension stack. Unlocked DOC-4.5 toolbar cases and DOC-4.12-04.
3. ✅ **Playwright File System Access mock** (done) — `e2e/fixtures/fsMock.ts` + `page.addInitScript` replaces `window.showDirectoryPicker` with an in-memory FS.
4. ✅ **Extract module-private helpers** (done) — `fileTree.ts`, `documentAttachments.ts`, `rawBlockHelpers.ts` extracted; 40 direct unit tests added.
5. ✅ **Document editor E2E** (2026-04-25 — done) — `e2e/documentEditor.spec.ts` covers backlinks dropdown, wiki-link suggestion popup, LinkEditorPopover browse button, and read-mode click navigation (11 tests).
6. ❌ **LINK-5.x Playwright flows** — multi-document vault scenarios for backlink propagation and rename cascades. Needs `installMockFS` seeded with multi-file vaults and link index pre-warming.
7. ❌ **DIAG-3.2/3.5/3.7 drag geometry** — React Flow pointer-event sequences + stubbed `getBoundingClientRect`. Could unlock 30-40 cases.

### Regenerate the numbers

```sh
for f in test-cases/0*-*.md; do
  name=$(basename "$f")
  ok=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* ✅' "$f")
  partial=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🟡' "$f")
  e2e=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🧪' "$f")
  gap=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* ❌' "$f")
  waived=$(grep -c '^- \*\*[A-Z][A-Z]*-[0-9.]*-[0-9][0-9]\*\* 🚫' "$f")
  printf "%-28s ✅%3d  🟡%3d  🧪%3d  ❌%3d  🚫%3d\n" "$name" "$ok" "$partial" "$e2e" "$gap" "$waived"
done
```
