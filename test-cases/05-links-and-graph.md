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
- **LINK-5.4-05** 🧪 **Vault open auto-rebuilds the link index** — on first tree population per vault, `fullRebuild` fires fire-and-forget across every `.md` + `.json` path returned by `collectAllPaths`. Backlinks for files never opened (or never present in the persisted snapshot) appear without the user needing to click the Graph view's Refresh button. Guarded by `indexRebuildVaultRef` so it fires once per vault open, not on every tree update. _(e2e: `e2e/linkIndexHydration.spec.ts`)_

## 5.5 Wiki-Link Navigation

- **LINK-5.5-01** ❌ **Click resolved wiki-link opens target in other pane** — editor in left pane → click → right pane opens target. (Requires full Tiptap editor + PaneManager + click handling.)
- **LINK-5.5-02** ❌ **Click in single-pane mode opens in same pane** — verify routing when no split exists. (Same integration scope.)
- **LINK-5.5-03** ❌ **Click unresolved wiki-link creates file** — red pill → click → new file created at resolved path; opens in other pane. (Integration with file-creation + PaneManager.)
- **LINK-5.5-04** ✅ **Create uses relative path from current doc** — `[[notes/x]]` in `area/intro.md` → `area/notes/x.md`. (Covered by DOC-4.8-04 `resolveWikiLinkPath` in `wikiLinkParser.test.ts`.)
- **LINK-5.5-05** ✅ **Create appends `.md` if absent** — `[[x]]` → `x.md`. (Covered by DOC-4.8-08 in `wikiLinkParser.test.ts`.)
- **LINK-5.5-06** ❌ **Click with `section` scrolls to heading** — open target and scroll / highlight the `#section` heading. (Requires real editor + scroll.)

## 5.5 Graphify Knowledge Graph View

> Mirrors §5.5 of [Features.md](../Features.md). Canvas is lazy-loaded (`next/dynamic`, `ssr: false`); File System Access required for vault open. Most visual / physics cases are 🚫 (JSDOM cannot render canvas).

### Data loading

- **GPHY-5.5-01** ✅ **`useRawGraphify` loads `graph.json` and reports `"loaded"` status** — hook reads `graphify-out/graph.json` from the vault `FileSystemDirectoryHandle`; status transitions `idle → loading → loaded`. _(Covered by `useRawGraphify.test.ts` or integration.)_
- **GPHY-5.5-02** ✅ **`"missing"` status when `graphify-out/` directory absent** — `DOMException NotFoundError` → status `"missing"`. _(Unit: `useRawGraphify` mock FS.)_
- **GPHY-5.5-03** ✅ **Community names read from `GRAPH_REPORT.md` when present** — `### Community {id} - "{name}"` pattern parsed; names override node-derived fallbacks.
- **GPHY-5.5-04** ✅ **Community colors use golden-angle hue spacing** — `index × 137.508°` gives perceptually distinct hues even for many communities.
- **GPHY-5.5-05** ✅ **`nodeDegreeMap` counts in + out edges for each node ID** — degree drives node size (hub nodes rendered larger).
- **GPHY-5.5-06** ✅ **Theme switch re-derives community and node colors instantly** — `useRawGraphify(dirHandle, theme)` recomputes `nodeColorMap` and `communities` via `useMemo([rawCommunities, isDark])` without reloading the vault.
- **GPHY-5.5-07** ✅ **`nodeSourceMap` built from `source_file` fields** — used for "open in other pane" navigation.

### Physics & forces

- **GPHY-5.5-08** 🚫 **Obsidian-style physics applied on mount** — `createGravityForce`, `d3Force("charge")`, `d3Force("link")` all configured from `DEFAULT_PHYSICS` before first tick; requires live canvas.
- **GPHY-5.5-09** 🚫 **Per-node gravity prevents disconnected cluster drift** — two unlinked clusters remain near origin after dragging one node; observable only in live simulation.
- **GPHY-5.5-10** 🚫 **Hyperedge polygon force nudges members toward regular polygon** — N-node hyperedge members converge to equal-sided shape; observable only in live simulation.
- **GPHY-5.5-11** 🚫 **Physics sliders re-heat simulation in real time** — dragging a slider calls `d3ReheatSimulation()`; observable only in live canvas.
- **GPHY-5.5-12** 🚫 **Physics settings persist to `vaultConfig.graphifyPhysics` and restore on re-open** — requires real vault write + reload.

### Sidebar — node info, communities, hyperedges

- **GPHY-5.5-13** ✅ **Node click populates sidebar node info** — `selectedNode` state set; label, source file link, community badge, and neighbor list rendered.
- **GPHY-5.5-14** ✅ **Community badge in node info highlights community nodes** — clicking the badge sets `highlightedCommunity`; `visibleNodeIds` narrows to that community.
- **GPHY-5.5-15** ✅ **Community row in legend highlights on click, pans to centroid** — clicking a community row sets `highlightedCommunity`; canvas pans to the average position of community nodes.
- **GPHY-5.5-16** ✅ **Hyperedge row in sidebar highlights and pans to centroid** — clicking a hyperedge row sets `highlightedHyperedge`; canvas pans to the average position of hyperedge nodes.
- **GPHY-5.5-17** ✅ **Community and hyperedge selection are mutually exclusive** — selecting one nulls the other.
- **GPHY-5.5-18** ✅ **Source file link in node info opens file in other pane** — `onSelectNode(filePath)` fired; graph pane stays mounted.

### Canvas click interactions

- **GPHY-5.5-19** 🚫 **Hull click selects hyperedge** — ray-casting point-in-polygon on padded convex hull detects click inside hull; `highlightedHyperedge` set. Requires live canvas coordinates.
- **GPHY-5.5-20** 🚫 **Background click deselects node even when inside a hull** — `onBackgroundClick()` always fires after hull test loop (break, not return). Requires live canvas.
- **GPHY-5.5-21** 🚫 **Hull drawn as padded dashed polygon around member nodes** — `convexHull` + `padHull(12px)` rendered in `onRenderFramePost`; color theme-aware. Requires canvas.

### Toolbar — search & filter

- **GPHY-5.5-22** ✅ **Search input filters node list to matching labels/source_file** — `searchResults` capped at 20; empty string shows no results.
- **GPHY-5.5-23** ✅ **Search results dropdown overlays canvas without shifting layout** — dropdown is `absolute` within its `relative` wrapper; no canvas or sidebar movement.
- **GPHY-5.5-24** ✅ **Escape clears search and node highlight** — `keydown` listener fires `setSearch(""); setHighlightedNode(null)`.
- **GPHY-5.5-25** ✅ **Filter panel opens below the Filter button** — dropdown is `absolute top-full right-0` anchored to a `relative` wrapper around the button.
- **GPHY-5.5-26** ✅ **Filter panel shows a collapsible file tree** — `buildFileTree(filePaths)` produces `TreeNode` hierarchy; folders expand/collapse with `ChevronRight`.
- **GPHY-5.5-27** ✅ **Tree search shows flat filtered list of folders and files** — non-empty `treeSearch` replaces tree view with `filteredFlatItems`.
- **GPHY-5.5-28** ✅ **Include + neighbors mode keeps matched nodes and their direct link neighbors** — `filteredNodeIds` expands matched set with both in-direction and out-direction link endpoints.
- **GPHY-5.5-29** ✅ **Exclude mode hides matched nodes** — `filteredNodeIds` is the complement of `matchedIds` within `data.nodes`.
- **GPHY-5.5-30** ✅ **Folder selection matches all files under that folder path** — prefix check `sf === f || sf.startsWith(f + "/")`.
- **GPHY-5.5-31** ✅ **Active filter count badge shown on Filter button** — `filterFiles.size > 0` renders the count as a number badge.
- **GPHY-5.5-32** ✅ **Clear filter resets selection** — clicking "Clear filter" sets `filterFiles` to empty Set; all nodes visible.
- **GPHY-5.5-33** ✅ **Filter and community/hyperedge highlight compose via intersection** — when both `filteredNodeIds` and `highlightIds` are non-null, `visibleNodeIds` is their intersection.

### Theme

- **GPHY-5.5-34** 🚫 **Dark theme: slate-900 canvas, HSL 68% lightness node colors, dark-glass overlays** — visual; requires live canvas.
- **GPHY-5.5-35** 🚫 **Light theme: slate-100 canvas, HSL 40% lightness node colors, frosted-white overlays** — visual; requires live canvas.
- **GPHY-5.5-36** ✅ **Theme toggle re-derives colors without vault reload** — `isDark` change triggers `useMemo` for `communities` and `nodeColorMap`; no `useEffect` re-run on the data-loading path.
- **GPHY-5.5-37** ✅ **`MutationObserver` on `[data-theme]` propagates global toggle to canvas** — `GraphifyView` does not call `useTheme()` (which has isolated per-instance state); instead observes the DOM attribute updated by `knowledgeBase.tsx` on every toggle.

---

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
