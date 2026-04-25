# Test Cases

Human-readable catalogue of every scenario worth covering — one file per feature domain, mirroring `Features.md`'s section numbering. This is the scope contract between product features and tests.

## File Index

| File | Prefix | Feature domain |
|------|--------|----------------|
| `01-app-shell.md` | `SHELL` | App shell, layout, pane manager, toolbar |
| `02-file-system.md` | `FS` | File System Access API, vault open/close, explorer |
| `03-diagram.md` | `DIAG` | Diagram editor, nodes, connections, flows, minimap |
| `04-document.md` | `DOC` | Document editor, wiki-links, backlinks, history, read mode |
| `05-links-and-graph.md` | `LINK` | Link index, backlink propagation, graph view |
| `06-shared-hooks.md` | `HOOK` | Shared hooks and utilities |
| `07-persistence.md` | `PERSIST` | File save/discard, IDB handles, history persistence |

## ID Scheme

```
<PREFIX>-<section>.<subsection>-<nn>

Example: DOC-4.3-10
         │   │       └─ two-digit case number within the subsection
         │   └───────── Features.md section number (4 = Document, .3 = Wiki-links)
         └───────────── area prefix
```

- IDs are **never renumbered**. Delete a case → leave the number unused; next case continues past it.
- Section numbers mirror `Features.md` subsections exactly.

## Coverage Markers

| Marker | Meaning |
|--------|---------|
| `✅` | Covered by a passing test (unit or E2E) |
| `🟡` | Partially covered — happy path only, or non-critical branches missing |
| `🧪` | E2E only — JSDOM can't exercise this (geometry, real browser APIs) |
| `❌` | Gap — no test exists yet |
| `🚫` | Won't test — out of scope (state reason inline, e.g. requires native folder picker) |

Flip the marker **in the same commit** as the test that covers the case lands.

## Case Format

One line per case, Gherkin-lite:

```
- ❌ DOC-4.3-10: Enter commits the selected suggestion as a wiki-link
- ✅ DIAG-3.8-01: straight routing produces a horizontal or vertical segment
- 🚫 FS-2.1-03: native folder picker opens on button click (requires OS dialog — untestable in CI)
```

## Adding a Case

1. Find the matching section in the owning file.
2. Append a line with the next free number and status `❌`.
3. Reference the ID in the `it()` title or a comment in the test file.
4. Flip `❌` → `✅`/`🧪` when the test lands (same commit).

## Test File Locations

### Vitest unit tests — `src/**/*.test.{ts,tsx}`

Selected mappings:

| Test file | Cases covered |
|-----------|--------------|
| `features/diagram/utils/gridSnap.test.ts` | DIAG-3.15-01..05 |
| `features/diagram/utils/pathRouter.test.ts` | DIAG-3.8-xx |
| `features/document/extensions/markdownSerializer.test.ts` | DOC-4.x serialization |
| `features/document/components/FolderPicker.test.tsx` | DOC-4.3-41..46 |
| `features/document/components/LinkEditorPopover.test.tsx` | DOC-4.7-xx |
| `features/document/DocumentView.discard.test.tsx` | DOC-4.11-22..25 |
| `features/document/hooks/useLinkIndex.test.ts` | LINK-5.x unit |
| `shared/hooks/useDocumentHistory.test.ts` | PERSIST-7.x history |
| `shell/PaneManager.test.tsx` | SHELL-1.x |

### Playwright E2E tests — `e2e/*.spec.ts`

| Spec file | Cases covered |
|-----------|--------------|
| `e2e/app.spec.ts` | SHELL-1.1-01 (golden path) |
| `e2e/goldenPath.spec.ts` | SHELL-1.x full golden path |
| `e2e/fileExplorerOps.spec.ts` | FS-2.x explorer operations |
| `e2e/diagramGoldenPath.spec.ts` | DIAG-3.x full golden path |
| `e2e/diagramKeyboard.spec.ts` | DIAG-3.x keyboard shortcuts |
| `e2e/diagramReadOnly.spec.ts` | DIAG-3.x read-only mode |
| `e2e/diagramMinimap.spec.ts` | DIAG-3.x minimap |
| `e2e/diagramConnectionRendering.spec.ts` | DIAG-3.8-xx connection rendering |
| `e2e/flowHighlight.spec.ts` | DIAG-3.x flow highlight |
| `e2e/documentGoldenPath.spec.ts` | DOC-4.x full golden path |
| `e2e/documentReadOnly.spec.ts` | DOC-4.x read-only mode |
| `e2e/documentEditor.spec.ts` | DOC-4.1-04, DOC-4.3-07..11, DOC-4.7-15..17, DOC-4.3-15/16, DOC-4.12-05 |
| `e2e/fsMockSanity.spec.ts` | Infrastructure — mock FS smoke test |

## Maintenance Rules

- Keep in sync with `Features.md`. Any feature add/remove/rename → update both in the same change set.
- Never put implementation here. Actual tests live in `src/**/*.test.{ts,tsx}` and `e2e/*.spec.ts`.
- Cross-reference by ID in both directions: case file lists the ID, test file names or comments include it.
