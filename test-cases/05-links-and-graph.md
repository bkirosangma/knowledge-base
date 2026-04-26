# Test Cases — Cross-Cutting Links & Graph

> Mirrors §5 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.
>
> **Note:** the link-index internals (`_links.json`) are covered in [04-document.md §4.10](04-document.md). This file covers the _cross-cutting_ wiring: propagation triggers, graphify bridge, and the end-to-end rename/delete flows that span file ops + link index + editor state.

---

## 5.1 Wiki-Link Rename Propagation

- **LINK-5.1-01** ✅ **Rename updates matching `[[name]]`** — rename `foo.md` → `bar.md` → every document containing `[[foo]]` now contains `[[bar]]`. (Covered by DOC-4.8-10 in `wikiLinkParser.test.ts`.)
- **LINK-5.1-02** ✅ **Rename preserves `#section`** — `[[foo#auth]]` → `[[bar#auth]]`. (DOC-4.8-10.)
- **LINK-5.1-03** ✅ **Rename preserves custom display** — `[[foo|Login]]` → `[[bar|Login]]`. (DOC-4.8-10.)
- **LINK-5.1-04** ✅ **Rename preserves display + section** — `[[foo#auth|Login]]` → `[[bar#auth|Login]]`. (DOC-4.8-10.)
- **LINK-5.1-05** ✅ **Rename does not touch unrelated links** — `[[fooey]]` and `[[other]]` unchanged. (DOC-4.8-12.)
- **LINK-5.1-06** ✅ **Rename handles `.md` written explicitly** — `[[foo.md]]` → `[[bar]]`. (DOC-4.8-11.)
- **LINK-5.1-07** ✅ **Rename updates link index** — `_links.json` outbound + backlinks both reflect new path. (Covered by DOC-4.10-09 `renameDocumentInIndex` in `useLinkIndex.test.ts`.)
- **LINK-5.1-08** ✅ **Rename of diagram (`.json`) propagates** — `updateWikiLinkPaths` now strips both `.md` and `.json` before matching, so `[[arch]]` and `[[arch.json]]` both rewrite on `arch.json → infra.json`. Covered by LINK-5.1-08 test in `wikiLinkParser.test.ts`. (Bug fixed: util previously only stripped `.md`.)
- **LINK-5.1-09** 🧪 **Rename of a currently-open document** — open doc in left pane; rename via explorer → pane shows new filename in breadcrumb; no content loss. _(e2e: `e2e/fileExplorerOps.spec.ts`)_
- **LINK-5.1-10** ❌ **Rename into a different folder** — move+rename → references update with new relative path. (Requires real File System Access moves.)
- **LINK-5.1-11** ✅ **Cyclic reference survives** — `a.md` and `b.md` link to each other; rename `a.md` → `a2.md` → both files still consistent. (Covered by LINK-5.1-11 test in `useFileExplorer.helpers.test.ts`.)
- **LINK-5.1-12** ❌ **Backlinks-first rename order** — no lost-reference window. (Implementation-order assertion.)

## 5.2 Wiki-Link Delete Propagation

- **LINK-5.2-01** ✅ **Delete removes outbound entries from index** — deleted doc's `_links.json` entry removed. (Covered by DOC-4.10-08 `removeDocumentFromIndex` in `useLinkIndex.test.ts`.)
- **LINK-5.2-02** ✅ **Delete removes backlinks pointing to it** — index backlink `linkedFrom` entries are purged. (DOC-4.10-08.)
- **LINK-5.2-03** ❌ **Deleted doc's links become red pills** — other docs referencing it via `[[x]]` now show "click to create" state. (Pill-state rendering lives in the `wikiLink` extension NodeView; requires full editor + link-index integration.)
- **LINK-5.2-04** 🧪 **Delete closes the doc in any open pane** — left pane showing it clears; right pane too. _(e2e: `e2e/fileExplorerOps.spec.ts`)_
- **LINK-5.2-05** 🧪 **Delete tree row removed.** _(e2e: `e2e/fileExplorerOps.spec.ts`)_
- **LINK-5.2-06** 🧪 **Delete is reversible only by undoing in the OS** — confirm popover shown; no in-app undo. _(e2e: `e2e/fileExplorerOps.spec.ts`)_

## 5.3 Graphify Bridge

- **LINK-5.3-01** ✅ **`emitCrossReferences` writes `.archdesigner/cross-references.json`** — file exists after call.
- **LINK-5.3-02** ✅ **JSON shape** — `{ version, references: [{ source, target, type, sourceType, targetType }] }`.
- **LINK-5.3-03** ✅ **Overwrites previous content** — run twice → final file contains only the latest edges.
- **LINK-5.3-04** ✅ **Silently swallows FS errors** — `console.warn` logged, no throw.
- **LINK-5.3-05** ✅ **Empty outbound → empty edges file** — `{ version: 1, references: [] }` still written.
- **LINK-5.3-06** ✅ **Diagram → document edges recorded** — `sourceType: "diagram"`, `targetType: "document"` preserved.
- **LINK-5.3-07** ✅ **Document → diagram edges recorded** — `sourceType: "document"`, `targetType: "diagram"` preserved.

## 5.4 Link-Aware File Ops (end-to-end)

> These cases are integration-level: they assert the full chain (explorer → `useFileActions` → `updateWikiLinkPaths` → link index → pane state).

- **LINK-5.4-01** 🧪 **Rename in explorer propagates to open doc content** — doc A open; rename doc B referenced by A → A's editor shows new `[[…]]` text. _(e2e: `e2e/fileExplorerOps.spec.ts`)_
- **LINK-5.4-02** ❌ **Rename does not mark unrelated docs dirty** — dirty flag only set for docs whose content actually changed. (Spans `useFileActions` + editor dirty state.)
- **LINK-5.4-03** ❌ **Delete in explorer removes backlinks in open docs** — doc A open with a link to deleted B → A's pill flips to red. (Depends on `wikiLink` NodeView live-resolution.)
- **LINK-5.4-04** ✅ **Index update persists before reload** — close and re-open → index on disk matches post-rename state. (Covered by LINK-5.4-04 test in `useLinkIndex.test.ts`.)

## 5.5 Wiki-Link Navigation

- **LINK-5.5-01** ❌ **Click resolved wiki-link opens target in other pane** — editor in left pane → click → right pane opens target. (Requires full Tiptap editor + PaneManager + click handling.)
- **LINK-5.5-02** ❌ **Click in single-pane mode opens in same pane** — verify routing when no split exists. (Same integration scope.)
- **LINK-5.5-03** ❌ **Click unresolved wiki-link creates file** — red pill → click → new file created at resolved path; opens in other pane. (Integration with file-creation + PaneManager.)
- **LINK-5.5-04** ✅ **Create uses relative path from current doc** — `[[notes/x]]` in `area/intro.md` → `area/notes/x.md`. (Covered by DOC-4.8-04 `resolveWikiLinkPath` in `wikiLinkParser.test.ts`.)
- **LINK-5.5-05** ✅ **Create appends `.md` if absent** — `[[x]]` → `x.md`. (Covered by DOC-4.8-08 in `wikiLinkParser.test.ts`.)
- **LINK-5.5-06** ❌ **Click with `section` scrolls to heading** — open target and scroll / highlight the `#section` heading. (Requires real editor + scroll.)

## 5.6 Vault Graph View (Phase 3 PR 2)

> Mirrors §5.4 of [Features.md](../Features.md). Driven by `features/graph/GraphView.tsx`, `components/GraphCanvas.tsx`, `components/GraphFilters.tsx`, `hooks/useGraphData.ts`. Uses `react-force-graph-2d` lazy-loaded via `next/dynamic`.

- **GRAPH-5.4-01** 🧪 **Open Graph View via palette mounts the graph pane** — palette command `view.open-graph` (⌘⇧G) replaces the focused pane with the `__graph__` virtual entry; `[data-testid="graph-view"]` becomes visible and the pane header reads "Vault graph". _(e2e: `graphView.spec.ts`)_
- **GRAPH-5.4-02** 🧪 **Node click opens the file in the OTHER pane** — clicking a node in the accessible debug list while the graph is the only pane enters split view with the target on the right; the graph stays mounted. _(e2e: `graphView.spec.ts`)_
- **GRAPH-5.4-03** 🧪 **Orphans-only filter hides connected nodes** — toggling `[data-testid="graph-filter-orphans"]` removes connected nodes from the debug list; orphan-only files remain. _(e2e: `graphView.spec.ts`)_
- **GRAPH-5.4-04** ✅ **`buildGraphData` enumerates every .md / .json file in the tree** — orphan diagrams (no incoming links) appear as nodes too; edges come from the link index alone. (Covered by `useGraphData.test.ts`.)
- **GRAPH-5.4-05** ✅ **Edges are deduplicated per (source, target)** — both `outboundLinks` and `sectionLinks` to the same target collapse to one edge. (Covered by `useGraphData.test.ts`.)
- **GRAPH-5.4-06** ✅ **Cached layout merges into nodes** — `vaultConfig.graph.layout[id] = {x,y}` flows into the built node's `x` / `y` so the simulation starts from cached positions. (Covered by `useGraphData.test.ts`.)
- **GRAPH-5.4-07** ✅ **`applyFilters` drops edges whose endpoints are filtered out** — file-type / folder filters propagate to edge set. (Covered by `useGraphData.test.ts`.)
- **GRAPH-5.4-08** ✅ **`listTopFolders` returns sorted distinct folders, root first** — drives the folder-filter rail. (Covered by `useGraphData.test.ts`.)
- **GRAPH-5.4-09** 🚫 **Canvas paints emerald-700 for `.md`, slate-500 for `.json`** — JSDOM doesn't render canvas; visual verification is manual. Token re-read on theme flip is wired through the `useTheme()` value memoized in `GraphCanvas`.
- **GRAPH-5.4-10** 🚫 **`onEngineStop` debounces layout writes 500 ms** — debounce timer in canvas code; observable only against a live simulation.
- **GRAPH-5.4-11** 🚫 **Pane-layout restore tolerates the `__graph__` sentinel** — the validator special-cases `fileType === "graph"`; covered by visual verification (open graph, reload, graph reappears).
