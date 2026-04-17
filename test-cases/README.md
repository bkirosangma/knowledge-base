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

_Snapshot at 2026-04-18 (Buckets 1-25 complete — every ❌ triaged; Playwright FS mock lands the first end-to-end coverage of folder-open flows). Regenerate with the one-liner at the bottom of this section after each bucket lands._

| File | ✅ | 🟡 | 🧪 | ❌ | 🚫 | Total |
|---|---:|---:|---:|---:|---:|---:|
| 01-app-shell.md | 41 | 11 | 3 | 0 | 6 | 61 |
| 02-file-system.md | 43 | 11 | 3 | 0 | 8 | 65 |
| 03-diagram.md | 91 | 39 | 0 | 0 | 107 | 237 |
| 04-document.md | 93 | 30 | 1 | 0 | 68 | 192 |
| 05-links-and-graph.md | 18 | 1 | 0 | 0 | 16 | 35 |
| 06-shared-hooks.md | 25 | 9 | 0 | 0 | 5 | 39 |
| 07-persistence.md | 34 | 9 | 0 | 0 | 8 | 51 |
| **Total** | **345** | **110** | **7** | **0** | **218** | **680** |

Covered (✅ + 🟡 + 🧪) = **462 / 680 (68%)**; consciously waived (🚫) = **218 (32%)** — overwhelmingly cases that require a real canvas / editor / browser permission (React Flow viewport geometry, live Tiptap DOM state, File System Access dialog). **Zero open gaps.** Every case is either covered or has a documented reason for staying waived.

### Test suites that back these numbers

- **Unit / integration** (Vitest + JSDOM): 47 test files, 687 passing tests. Split across feature areas:
  - App Shell: `Header.test.tsx`, `Footer.test.tsx`, `FooterContext.test.tsx`, `ToolbarContext.test.tsx`, `PaneManager.test.tsx`, `SplitPane.test.tsx`, `PaneTitle.test.tsx`, `PaneHeader.test.tsx`.
  - File System & Vault: `ExplorerPanel.test.tsx`, `DocumentPicker.test.tsx`, `iconRegistry.test.ts`, `vaultConfig.test.ts`, `useFileExplorer.helpers.test.ts`, `useFileActions.test.ts`, `ConfirmPopover.test.tsx`.
  - Diagram: `gridSnap.test.ts`, `anchors.test.ts`, `pathRouter.test.ts`, `flowUtils.test.ts`, `collisionModel.test.ts`, `levelModel.test.ts`, `layerProperties.test.tsx`, `autocompleteInput.test.tsx`, `documentsSection.test.tsx`, `contextMenu.test.tsx`, `flowBreakWarningModal.test.tsx`, `docInfoBadge.test.tsx`, `Layer.test.tsx`, `FlowDots.test.tsx`, `persistence.test.ts`, `directoryScope.test.ts`.
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
2. **Tiptap integration harness** — extend the pattern used in `LinkEditorPopover.test.tsx` (explicit `transaction` listener forceUpdate for JSDOM) to cover toolbar + raw-mode behaviors. Could unlock most of DOC-4.5.
3. **Playwright File System Access mock** (Bucket 25) — one `page.addInitScript` that replaces `window.showDirectoryPicker` with an in-memory FS unlocks all golden-path flows (~20 cases across LINK-5.x and FS-2.1).
4. **Extract module-private helpers** (PRs: `toggleRawSyntax`/`getActiveRawFormats` out of `MarkdownEditor.tsx`; `scanDirectory`/`buildTree` out of `useFileExplorer.ts`; `hasDocuments`/`getDocumentsForEntity` out of `DiagramView.tsx`) — each unlocks a few direct unit tests without harness work.

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
