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

_Snapshot at 2026-04-18 (Buckets 1-20 complete). Regenerate with the one-liner at the bottom of this section after each bucket lands._

| File | ✅ | 🟡 | 🧪 | ❌ | 🚫 | Total |
|---|---:|---:|---:|---:|---:|---:|
| 01-app-shell.md | 41 | 11 | 3 | 0 | 6 | 61 |
| 02-file-system.md | 38 | 9 | 0 | 11 | 7 | 65 |
| 03-diagram.md | 66 | 4 | 0 | 158 | 9 | 237 |
| 04-document.md | 85 | 6 | 0 | 89 | 12 | 192 |
| 05-links-and-graph.md | 18 | 1 | 0 | 0 | 16 | 35 |
| 06-shared-hooks.md | 25 | 9 | 0 | 0 | 5 | 39 |
| 07-persistence.md | 7 | 0 | 0 | 43 | 1 | 51 |
| **Total** | **280** | **40** | **3** | **301** | **56** | **680** |

Covered (✅ + 🟡 + 🧪) = **323 / 680 (48%)**; consciously waived (🚫) = **56**; open gaps (❌) = **301** — concentrated in diagram (158) and document (89) sub-features that haven't had a test-writing pass yet, plus the persistence round-trip contract cases (43).

### Test suites that back these numbers

- **Unit / integration** (Vitest + JSDOM): 47 test files, 687 passing tests. Split across feature areas:
  - App Shell: `Header.test.tsx`, `Footer.test.tsx`, `FooterContext.test.tsx`, `ToolbarContext.test.tsx`, `PaneManager.test.tsx`, `SplitPane.test.tsx`, `PaneTitle.test.tsx`, `PaneHeader.test.tsx`.
  - File System & Vault: `ExplorerPanel.test.tsx`, `DocumentPicker.test.tsx`, `iconRegistry.test.ts`, `vaultConfig.test.ts`, `useFileExplorer.helpers.test.ts`, `useFileActions.test.ts`, `ConfirmPopover.test.tsx`.
  - Diagram: `gridSnap.test.ts`, `anchors.test.ts`, `pathRouter.test.ts`, `flowUtils.test.ts`, `collisionModel.test.ts`, `levelModel.test.ts`, `layerProperties.test.tsx`, `autocompleteInput.test.tsx`, `documentsSection.test.tsx`, `contextMenu.test.tsx`, `flowBreakWarningModal.test.tsx`, `docInfoBadge.test.tsx`, `Layer.test.tsx`, `FlowDots.test.tsx`, `persistence.test.ts`, `directoryScope.test.ts`.
  - Document: `wikiLinkParser.test.ts`, `markdownSerializer.test.ts`, `useDocuments.test.tsx`, `useLinkIndex.test.ts`, `useDocumentContent.test.tsx`, `tableNoNest.test.tsx`, `codeBlockCopy.test.tsx`, `LinkEditorPopover.test.tsx`, `TableFloatingToolbar.test.tsx`, `DocumentProperties.test.tsx`.
  - Links & Graph: `graphifyBridge.test.ts`.
  - Hooks: `useSyncRef.test.ts`, `useEditableState.test.ts`, `useActionHistory.test.ts`.
- **E2E** (Playwright + Chromium): 6 tests in `e2e/app.spec.ts` covering SHELL-1.1-01..03 and the pre-folder empty state.

### Known gaps / why

- **Diagram editor**: DIAG-3.1..3.5, 3.11, 3.14..3.18 are largely untouched. Most cases depend on a rendered React-Flow canvas (real DOM + viewport geometry). Good next target: an integration harness that mounts `DiagramView` with a jsdom-tolerant React-Flow mock.
- **Document editor**: DOC-4.1..4.3.a (toolbar + raw-mode), 4.5 (table UX beyond toolbar), 4.12..4.15 (keyboard shortcuts, search, export). Similar story — full editor DOM integration.
- **Persistence**: PERSIST-7.2..7.7 cover localStorage / IDB round-trips for diagram state, toolbar prefs, and link index. Many are straightforward wrappers around `localStorage.setItem / IDB` already covered in sibling hook tests; explicit round-trip tests not yet written.
- **File System Access folder picker** (🚫): unavoidable — Chromium gates the native dialog behind a user gesture. Would need an in-browser mock injected via `page.addInitScript`.

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
