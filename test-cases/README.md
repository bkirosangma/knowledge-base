# Test Cases

Human-readable catalogue of every scenario we care about covering, split by feature area. Mirrors the section numbering of [`../Features.md`](../Features.md). One-line-per-case Gherkin-lite so the whole coverage surface is scannable.

> **⚠️ Maintenance contract.** When a feature is added, removed, renamed, or enhanced, the owning test-cases file must be updated in the same change set (same rule as `Features.md` — see `CLAUDE.md`).

---

## Files

| # | Area | File |
|---|---|---|
| 1 | App Shell & Layout | [01-app-shell.md](01-app-shell.md) |
| 2 | File System & Vault | [02-file-system.md](02-file-system.md) |
| 3 | Diagram Editor | [03-diagram.md](03-diagram.md) |
| 4 | Document Editor | [04-document.md](04-document.md) |
| 5 | Cross-Cutting Links & Graph | [05-links-and-graph.md](05-links-and-graph.md) |
| 6 | Shared Hooks & Utilities | [06-shared-hooks.md](06-shared-hooks.md) |
| 7 | Persistence Surface | [07-persistence.md](07-persistence.md) |

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

`<AREA>-<section>-<case>` where `<section>` matches the subsection number in `Features.md`.

| Prefix | Area | File |
|---|---|---|
| `SHELL` | App shell, header, footer, panes | `01-app-shell.md` |
| `FS` | Folder picker, vault config, explorer, pickers | `02-file-system.md` |
| `DIAG` | Diagram editor | `03-diagram.md` |
| `DOC` | Document editor | `04-document.md` |
| `LINK` | Link index, wiki-link propagation, graphify bridge | `05-links-and-graph.md` |
| `HOOK` | Shared hooks (`useEditableState`, `useSyncRef`, `useActionHistory`, `useFileActions`) | `06-shared-hooks.md` |
| `PERSIST` | localStorage / IDB / disk round-trips | `07-persistence.md` |

Case numbers are zero-padded to two digits (`01`, `02`, …) and **never renumbered once assigned** — new cases get the next free number in the section even if that leaves gaps after deletions. This keeps test-file back-references stable.

### Coverage status

| Marker | Meaning |
|---|---|
| ✅ | At least one passing test asserts the behaviour. |
| 🟡 | Partial — some of the Given/When/Then cases are asserted but not all. |
| 🧪 | Covered only by e2e (Playwright), not by unit/integration. |
| ❌ | Gap — no test exists yet. |
| 🚫 | Won't test — documented reason in the notes (e.g. requires a real browser folder picker). |

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

_Snapshot at 2026-04-20 (Buckets 1-27 complete + shell header strip-down + Pane Header H1 derivation + wiki-link propagation on rename/move + useActionHistory savedEntryPinned fix + useDirectoryHandle tests + Playwright reclassification: all "Playwright-testable" items promoted from 🚫 to ❌). Regenerate with the one-liner at the bottom of this section after each bucket lands._

| File | ✅ | 🟡 | 🧪 | ❌ | 🚫 | Total |
|---|---:|---:|---:|---:|---:|---:|
| 01-app-shell.md | 52 | 12 | 0 | 4 | 5 | 73 |
| 02-file-system.md | 64 | 8 | 0 | 6 | 5 | 83 |
| 03-diagram.md | 113 | 34 | 0 | 103 | 1 | 251 |
| 04-document.md | 130 | 34 | 0 | 46 | 8 | 218 |
| 05-links-and-graph.md | 19 | 0 | 0 | 16 | 0 | 35 |
| 06-shared-hooks.md | 42 | 0 | 0 | 1 | 0 | 43 |
| 07-persistence.md | 36 | 7 | 0 | 1 | 7 | 51 |
| **Total** | **456** | **95** | **0** | **177** | **26** | **754** |

Covered (✅ + 🟡) = **551 / 754 (73%)**; open gaps (❌) = **177 (23%)**; consciously waived (🚫) = **26 (3%)**.

The 26 remaining 🚫 items are genuinely untestable or non-features:
- **Feature gaps not yet implemented** (PERSIST-7.1-04/05/06/09, FS-2.3-03/16/20, DOC-4.9-02/09) — persistence not wired up; product backlog, not test backlog.
- **Removed/obsolete UI** (SHELL-1.2-01/07/08, SHELL-1.4-07) — components deleted in the 2026-04-19 header strip-down.
- **Module-private helpers** (DOC-4.3-36/37, DOC-4.5-09/10/11) — LRU cache and rawBlock toggle helpers are unexported; would require extraction to unit-test.
- **Intentional behavior locks** (DOC-4.13-14) — documented code-fence limitation preserved as a regression guard.
- **Non-features by design** (PERSIST-7.3-16, PERSIST-7.5-04, SHELL-1.3-08) — no retry logic, reset-app IDB semantics unverified, confirmation dialog not implemented.
- **Browser-level only** (PERSIST-7.1-15, FS-2.1-12, FS-2.3-50) — private-mode simulation, native permission revocation, and `preventDefault` on contextmenu can't be asserted even with Playwright.
- **Not yet implemented** (DIAG-3.13-23) — manual-size override toggle not built yet.

**2026-04-19 — shell header strip-down + Pane Header H1 derivation.** Title editing, dirty dot, Save, and Discard moved from the top-level `Header` into each pane's `PaneTitle` row:

- `SHELL-1.2-02..06` and `SHELL-1.2-09..13` stay ✅ but now run against `PaneTitle.test.tsx` instead of `Header.test.tsx`.
- `SHELL-1.2-01` (Back button), `SHELL-1.2-07` (80-char cap), and `SHELL-1.2-08` (auto-widen) → 🚫: component gone / layout uses flex + `truncate` instead of those pixel-level constraints.
- `SHELL-1.4-07` (Pane type drives Header controls) → 🚫: there are no pane-specific controls in the top-level bar anymore; `ToolbarContext.activePaneType` is still read by the Footer (1.5).
- Four new `PaneTitle` cases added as `SHELL-1.2-23..26` (read-only doc-pane mode, dirty-dot + button suppression when handlers omitted, debounced H1 derivation wiring).
- Document pane persistence gains `DOC-4.11-17..19` (bridge `discard()` re-reads from disk, honours `loadError` guard, reports failures).
- New section `DOC-4.13 Pane Header Title (first-heading derivation)` with 16 cases covering ATX H1, frontmatter skip, fallback stripping of list/blockquote/lower-heading markers, debounce, and the `#hashtag` / code-fence edge cases.

### Test suites that back these numbers

- **Unit / integration** (Vitest + JSDOM): 67 test files, 942 passing tests. Split across feature areas:
  - App Shell: `Header.test.tsx`, `Footer.test.tsx`, `FooterContext.test.tsx`, `ToolbarContext.test.tsx`, `PaneManager.test.tsx`, `SplitPane.test.tsx`, `PaneTitle.test.tsx`, `PaneHeader.test.tsx`.
  - File System & Vault: `ExplorerPanel.test.tsx`, `DocumentPicker.test.tsx`, `iconRegistry.test.ts`, `vaultConfig.test.ts`, `useFileExplorer.helpers.test.ts`, `useFileActions.test.ts`, `useDirectoryHandle.test.ts`, `idbHandles.test.ts`, `ConfirmPopover.test.tsx`.
  - Diagram: `gridSnap.test.ts`, `anchors.test.ts`, `pathRouter.test.ts`, `flowUtils.test.ts`, `collisionUtils.test.ts`, `conditionGeometry.test.ts`, `geometry.test.ts`, `collisionModel.test.ts`, `levelModel.test.ts`, `layerProperties.test.tsx`, `autocompleteInput.test.tsx`, `documentsSection.test.tsx`, `contextMenu.test.tsx`, `flowBreakWarningModal.test.tsx`, `docInfoBadge.test.tsx`, `Layer.test.tsx`, `FlowDots.test.tsx`, `persistence.test.ts`, `directoryScope.test.ts`.
  - Document: `wikiLinkParser.test.ts`, `markdownSerializer.test.ts`, `useDocuments.test.tsx`, `useLinkIndex.test.ts`, `useDocumentContent.test.tsx`, `tableNoNest.test.tsx`, `codeBlockCopy.test.tsx`, `LinkEditorPopover.test.tsx`, `TableFloatingToolbar.test.tsx`, `DocumentProperties.test.tsx`.
  - Links & Graph: `graphifyBridge.test.ts`.
  - Hooks: `useSyncRef.test.ts`, `useEditableState.test.ts`, `useActionHistory.test.ts`.
- **E2E** (Playwright + Chromium): 6 tests in `e2e/app.spec.ts` covering SHELL-1.1-01..03 and the pre-folder empty state.

### Why the 224 🚫 cases aren't tested

- **Real canvas geometry (DIAG-3.2 Canvas, 3.3 Minimap, 3.5 Node drag, 3.7 Layer drag, 3.9 Connection interaction, 3.14 keyboard shortcuts, 3.17 read-only interactions)** — React Flow and the custom canvas read live `scrollLeft`, `clientWidth`, `getBoundingClientRect`; JSDOM returns zeros. These would require either a React Flow test harness that stubs viewport geometry or Playwright — deferred to Bucket 25.
- **Live Tiptap DOM (DOC-4.1 orchestration, 4.2 StarterKit rendering, 4.3 wikiLink NodeView, 4.5 toolbar, 4.12 read-only)** — Tiptap's contenteditable behavior, NodeView rendering, and `editor.isActive()` all need a real browser. Markdown parse/serialize round-trips (DOC-4.4 / 4.8) cover the conversion layer; the live DOM layer is integration-level.
- **File System Access folder picker (FS-2.1-02, 2.1-12, PERSIST-7.3-15)** — Chromium gates `window.showDirectoryPicker` behind a native dialog that Playwright can't drive without an in-browser mock injected via `page.addInitScript`.
- **Impl gaps, not test gaps (PERSIST-7.1-04/05/06/09)** — Explorer sort/filter/collapse and "Don't ask again" flags are not yet persisted to localStorage. These are product backlog, not test backlog.

### Path to driving 🚫 down further

1. **React Flow test harness** — a `DiagramTestHarness` that mounts `DiagramView` with fake `IntersectionObserver` and stubbed `getBoundingClientRect` would unlock most of DIAG-3.2/3.5/3.7 — potentially 40-60 cases.
2. ✅ **Tiptap integration harness** (Bucket 27 — done) — `MarkdownEditor.test.tsx` mounts the real `MarkdownEditor` with full extension stack and drives the toolbar via `fireEvent.mouseDown` (`TBtn` uses onMouseDown+preventDefault to avoid focus loss). Unlocked 9 new ✅ cases in DOC-4.5 (toolbar visibility, raw/WYSIWYG toggle, heading+block toggles, horizontal rule, active-state) plus DOC-4.12-04.
3. ✅ **Playwright File System Access mock** (Bucket 25 — done) — `e2e/fixtures/fsMock.ts` + `page.addInitScript` replaces `window.showDirectoryPicker` with an in-memory FS; `e2e/goldenPath.spec.ts` drives the open-folder → click-file → pane-renders flows.
4. ✅ **Extract module-private helpers** (Bucket 26 — done) — `fileTree.ts` (scanTree + flattenTree out of `useFileExplorer.ts`), `documentAttachments.ts` (hasDocuments + getDocumentsForEntity out of `DiagramView.tsx`), and `rawBlockHelpers.ts` (parseHeadingPrefix + hasBlockquotePrefix + computeActiveRawFormatsAt out of `MarkdownEditor.tsx`) — added 40 direct unit tests and flipped 9 🟡/🚫 markers to ✅.

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
