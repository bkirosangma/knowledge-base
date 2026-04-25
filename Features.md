# Features

A catalogue of every user-facing capability and internal sub-system in the Knowledge Base app, derived from the source at `src/app/knowledge_base/`. Organised as top-level features → sub-features, each with a one-to-two-line description. Used as the scope reference for test case design.

> **⚠️ Maintenance contract.** This file is the source of truth for the app's feature surface. It **must** be updated in the same change set as any code change that adds, removes, renames, or enhances a feature or sub-feature. See `CLAUDE.md` → _Features.md — Source of Truth for Features_ for the full rules.
>
> **Test coverage** for every section below lives in [`test-cases/`](test-cases/README.md), one file per top-level feature bucket. Every feature/sub-feature has a stable case ID (`DIAG-3.8-01`, `DOC-4.3-07`, …). Tests should reference those IDs; adding/removing/enhancing a feature means updating the matching test-cases file in the same change.

> Legend: `✅` = observable user behaviour worth test coverage. `⚙️` = internal subsystem that underpins user features (test indirectly or via unit). `?` = inferred from neighbouring code; verify before asserting.

---

## 1. App Shell & Layout

Top-level chrome that hosts every other feature.

### 1.1 Root Layout
- ✅ **Global shell** (`src/app/layout.tsx`) — Geist font variables, antialiased full-height flex container, Tailwind CSS 4 base.
- ✅ **Home route** (`src/app/page.tsx`) — client-side entry rendering `<KnowledgeBase />` with `data-testid="knowledge-base"` root.
- ⚙️ **Global stylesheet** (`src/app/globals.css`) — Tiptap/ProseMirror styling for headings, lists, tables, blockquotes, task-list checkboxes, code blocks, wiki-link cursor.

### 1.2 Header
`src/app/knowledge_base/shared/components/Header.tsx`
- ✅ **Split-view toggle** — enters / exits split pane mode; shows active state. Only cross-pane chrome left at the top level — title editing, dirty dot, Save, and Discard relocated to each pane's `PaneTitle` row on 2026-04-19.
- ✅ **`Cmd/Ctrl+S` shortcut** — saves the focused pane (handler lives in `knowledgeBase.tsx`).

### 1.3 Footer
`src/app/knowledge_base/shell/Footer.tsx`
- ✅ **Active-file badge** — shows filename with side label (Left/Right) when in split view.
- ✅ **Diagram stats** — world dimensions (`W x H px`), patch count, current zoom %.
- ✅ **Reset App button** — clears localStorage and reloads the window (destructive — confirm path worth testing).

### 1.4 Pane Manager & Split Pane
`src/app/knowledge_base/shell/PaneManager.tsx`, `shared/components/SplitPane.tsx`
- ✅ **Single / split layout** — single pane by default; Split toggle opens right pane.
- ✅ **Independent pane state** — each pane holds its own `filePath` and `fileType` (diagram or document).
- ✅ **Focus tracking** — `focusedSide` highlights the active pane (2 px blue border) on mouse-down.
- ✅ **`openFile()` routes to focused pane** — opening a file while split routes it to whichever pane has focus.
- ✅ **`exitSplit` remembers `lastClosedPane`** — the closed side can be restored later.
- ✅ **Draggable divider** — 20%–80% bounds, hover highlight, split ratio persisted to localStorage per `storageKey`.
- ✅ **Layout restore on directory load** — reopens previous pane layout when re-opening a known folder.

### 1.5 Contexts
- ⚙️ **ToolbarContext** (`shell/ToolbarContext.tsx`) — publishes `activePaneType` (`diagram | document | mixed`), `focusedPane`, `paneCount`. Consumed by the Footer for pane-aware status text; the Header no longer reads it after the 2026-04-19 strip-down.
- ⚙️ **FooterContext** (`shell/FooterContext.tsx`) — per-side diagram info (world size, patches, zoom) feeding the Footer.
- ⚙️ **ToastContext** (`shell/ToastContext.tsx`) — lightweight info-level toast system. `ToastProvider` exposes `showToast(message, duration?)` via `useToast()`; renders a single timed `role="status"` banner (auto-dismisses after 3 s by default, replaces any previous toast). Separate from `ShellErrorContext` which handles actionable file-system errors.

### 1.6 Pane Content Chrome
- ✅ **PaneHeader** (`shared/components/PaneHeader.tsx`) — breadcrumb path, Read-Mode lock toggle, right-side action slot.
- ✅ **PaneTitle** (`shared/components/PaneTitle.tsx`) — title row between the breadcrumb and the toolbar. Shows the diagram's editable title (click-to-edit, Enter/Escape commit/cancel) for diagram panes; shows the debounced first H1 of the markdown (read-only, 250 ms) for document panes. Hosts the dirty dot + Save + Discard buttons on the right of each pane's title.
- ✅ **Empty state** — "No file open" placeholder when both panes are null.
- ✅ **ConflictBanner** (`shared/components/ConflictBanner.tsx`) — disk-conflict UI shown when a file changes externally while the user has unsaved edits. Renders a `role="alert"` banner with two actions: "Reload from disk" (discard local edits, reload from FS) and "Keep my edits" (dismiss the conflict and stay with local content). Wired into document and diagram panes by their respective file-watcher hooks.

---

## 2. File System & Vault Management

### 2.1 Folder Picker
`shared/hooks/useFileExplorer.ts`, `shared/hooks/fileExplorerHelpers.ts`, `shared/hooks/useDrafts.ts`, `shared/hooks/useDirectoryHandle.ts`, `shared/utils/directoryScope.ts`, `types/file-system.d.ts`. Phase 1.5 (2026-04-18) moved pure helpers into `fileExplorerHelpers.ts`. Phase 1.5b (2026-04-18) then extracted two focused sub-hooks: `useDrafts` (dirtyFiles Set + refreshDrafts / removeDraft / markDirty) and `useDirectoryHandle` (directoryName state + dirHandleRef + acquirePickerHandle / restoreSavedHandle / clearSavedHandle), encapsulating IndexedDB handle persistence + localStorage scope-id bookkeeping. useFileExplorer.ts: 675 → 517 lines (composition root that still owns the tree / activeFile / CRUD ops).
- ✅ **Open folder via File System Access API** — `showDirectoryPicker`; fallback to `<input webkitdirectory>` when API unavailable.
- ✅ **Directory-handle persistence** — handle stored in IndexedDB (`knowledge-base` DB, `handles` store) keyed by 8-char scope ID so the vault survives reloads.
- ⚙️ **Directory scoping** — all localStorage keys namespaced per folder via `scopedKey(base)` so multiple vaults do not collide.
- ⚙️ **Tree scan** — recursive walk collecting `.json` (diagrams) and `.md` (documents); skips `.*.history.json` sidecars; returns sorted `TreeNode[]`.

### 2.2 Vault Configuration
`features/document/utils/vaultConfig.ts` — low-level FS helpers. Phase 3a (2026-04-18) wrapped these behind the `VaultConfigRepository` interface (`domain/repositories.ts`) with a File System Access API implementation at `infrastructure/vaultConfigRepo.ts`; the shell calls `createVaultConfigRepository(rootHandle).read/init/touchLastOpened` instead of the utility functions directly. The same phase introduced `LinkIndexRepository` + `infrastructure/linkIndexRepo.ts` (consumed by `useLinkIndex`). Phase 3b (2026-04-19) added `DocumentRepository` + `DiagramRepository` interfaces + impls (`infrastructure/documentRepo.ts`, `infrastructure/diagramRepo.ts`); `useDocumentContent` and `useDocuments` route `.md` I/O through the document repo. Phase 3c (2026-04-19) migrated `useFileExplorer`'s `selectFile` / `saveFile` / `createFile` / `discardFile` to `createDiagramRepository`, so every `.json` load + save in the primary code paths now goes through the abstraction. Phase 3d (2026-04-19) closed out the layer by consolidating the duplicated in-memory FS mock used across five test files into `shared/testUtils/fsMock.ts` (−152 lines net; `fileTree.test.ts` keeps its unified `children`-Map shape). Phase 3e (2026-04-19) shipped the previously-deferred `RepositoryContext` at `shell/RepositoryContext.tsx`: `RepositoryProvider` is mounted inside `KnowledgeBaseInner`'s return below the `useFileExplorer()` call and memoizes all four repos against a reactive `rootHandle` (state companion to `dirHandleRef`, added to `useDirectoryHandle`), plus a `StubRepositoryProvider` for tests. The layering rule is: consumers **below** the provider use `useRepositories()` (today: `useDocumentContent` routes every `.md` read/write through `repos.document`); consumers **at or above** the provider — `useFileExplorer` (handle owner), `useDocuments` / `useLinkIndex` (peers of the provider in the same component), and the vault-init `useEffect` in `knowledgeBase.tsx` — keep inline `createXRepository(rootHandle)` because React hooks' ordering prevents them from reading a context that is mounted in their own return JSX. The test-seam pay-off is realised in `useDocumentContent.test.ts`: three new seam cases exercise the hook against `StubRepositoryProvider` with pure `vi.fn()` repos, no `MockDir` tree involved.
- ⚙️ **`initVault`** — creates `.archdesigner/config.json` with version, name, `created`, `lastOpened`.
- ⚙️ **`readVaultConfig`** — returns parsed config or `null` if the folder is not a vault. Phase 5b (2026-04-19) added a full-shape guard (`version` / `name` / `created` / `lastOpened` all string) at the I/O boundary so a parseable-but-incomplete `config.json` also returns `null` instead of a cast-but-unvalidated object. `isDiagramData` (the matching guard at `DiagramRepository.read`) was strengthened in the same phase to require `title: string` plus well-typed optional `lineCurve` / `flows` / `documents` / `layerManualSizes`. Phase 5c (2026-04-19) shipped the previously-deferred typed error surface. `domain/errors.ts` defines `FileSystemError` with kinds `not-found` / `malformed` / `permission` / `quota-exceeded` / `unknown`, plus `classifyError` that narrows a thrown `unknown` into the taxonomy. Every repository read + write now **throws** a classified `FileSystemError` on any failure (the previous "return null on any error" contract is gone because it hid data-loss bugs — most critically, a failing `.md` load used to hand an empty editor to the user, who could then type + save over their real file). Consumers opt into the common "absent file is not an error" ergonomic via the domain helper `readOrNull(fn)`; actionable kinds (permission / malformed / quota / unknown) are surfaced via the new `shell/ShellErrorContext` (`reportError` + one banner at the top of viewport + a React `ShellErrorBoundary` for render-time throws). Each consumer — `useDocumentContent`, `useDiagramPersistence` (draft autosave), every write path in `useFileExplorer`, the vault-init `useEffect` in `knowledgeBase.tsx`, and the three `linkManager` mutations called from the shell — now try/catch and `reportError` instead of silently returning null/false. Data-loss regressions pinned in `useDocumentContent.test.ts` (DOC-4.11-07/08/09) and `persistence.test.ts` (PERSIST-7.1-14). The design spec also called for schema validation at `DocumentRepository.load`; that step is N/A because `.md` files are plain text with no structured shape (the codebase does not parse YAML front-matter or any other structured envelope), so `DocumentRepository.read` intentionally returns the raw string unchanged.
- ⚙️ **`updateVaultLastOpened`** — touches `lastOpened` on open.
- ⚙️ **`isVaultDirectory`** — type guard on the `version` field.

### 2.3 File Explorer Panel
`shared/components/explorer/ExplorerPanel.tsx` — composition root that delegates to `TreeNodeRow.tsx` (recursive file/folder row renderer), `ExplorerHeader.tsx` (directory header + root drop target + ⋮ dot menu with Sort submenu + filter toggles), and `explorerTreeUtils.ts` (`sortTreeNodes` / `filterTreeNodes` pure helpers). Phase 1.4 (2026-04-18) reduced ExplorerPanel.tsx from 770 to 513 lines.
- ✅ **Collapsible sidebar** — toggles between 36 px (icon-only) and 260 px (full) with animation.
- ✅ **Tree rendering** — nested folders with chevrons, file icons by type (JSON/diagram vs text/doc), highlight on currently-open file.
- ✅ **Sorting** — three fields (name, created, modified), two directions (asc/desc), three groupings (folders-first, files-first, mixed); preferences persisted to localStorage; recursive on nested folders.
- ✅ **Filtering** — "All / Diagrams / Documents" radio; only matching files visible.
- ✅ **Right-click context menu** — Create, Rename, Delete, Duplicate, Move.
- ✅ **Create file / folder** — dialog prompts; unique-name fallback (`untitled.json`, `untitled-1.json`, …); type routed by extension.
- ✅ **Rename** — inline edit with trimmed validation; **wiki-link-aware** — updates `[[…]]` references in other documents and the link index.
- ✅ **Delete** — confirmation popover; wiki-link-aware removal from the link index.
- ✅ **Duplicate** — clones with a new unique name.
- ✅ **Move** — context-menu / drag into a target folder.
- ✅ **Refresh** — rescans the directory tree.
- ✅ **Drag-over feedback** — `dragOverPath` state highlights the target folder.
- ✅ **Dirty file indicator** — visual mark on files with unsaved changes.

### 2.4 Confirmation Popover
`shared/components/explorer/ConfirmPopover.tsx`
- ✅ **Mouse-anchored popover** — positions near the click; clamps to the viewport.
- ✅ **Confirm / Cancel** — red / blue button variants per severity.
- ✅ **Escape / outside-click dismisses.**
- ✅ **"Don't ask me again"** — checkbox persists the choice (used by Discard).

### 2.5 Document Picker
`shared/components/DocumentPicker.tsx`
- ✅ **Attach-to-entity modal** — attaches Markdown docs to diagram entities (root, node, connection, flow, type). `'flow'` entity type now fully wired with UI.
- ✅ **Search filter** — input filters the list.
- ✅ **Hide already-attached** — excludes docs already on the entity.
- ✅ **Create-new-document shortcut** — prompts for a `.md` path and creates it inline.

---

## 3. Diagram Editor

Root: `src/app/knowledge_base/features/diagram/`. Top-level is `DiagramView.tsx` — a composition root that delegates to `components/DiagramOverlays.tsx` (properties panel + minimap + modals + context menus), `components/DiagramNodeLayer.tsx` (Element / ConditionElement rendering + ghost previews for single/multi drag), `components/DiagramLinesOverlay.tsx` (DataLine SVG + ghost-line during endpoint drag), `components/DiagramLabelEditor.tsx` (inline node/layer/line label editor), and `components/AutoArrangeDropdown.tsx`, backed by state hooks `hooks/useDiagramLayoutState.ts` (toolbar toggles + localStorage-persisted properties-collapsed flag) and `shared/hooks/useReadOnlyState.ts` (per-file Read Mode — shared with DocumentView). Phases 1.1 + 1.1b (2026-04-18) reduced DiagramView from 1692 to 1282 lines. Phase 4a (2026-04-19) applied ISP to the `DiagramBridge` interface published by DiagramView: it now decomposes into `HeaderBridge` (title + save/discard + dirty surface consumed by the Header) and `ExplorerBridge` (file-ops + confirm-popover surface consumed by the explorer tree and rename/delete wrappers); `DiagramBridge` itself is a type alias `HeaderBridge & ExplorerBridge`, so the full-bridge consumer in `knowledgeBase.tsx` compiles unchanged while future consumers can depend on only the slice they need. The design spec's third slice (`FooterBridge`) was initially skipped on the claim that no footer-shaped DiagramView → shell flow existed; a 2026-04-19 follow-up caught the miss — `DiagramView.tsx:701` does push a typed payload into `FooterContext` — and the type was renamed `DiagramFooterBridge` (with `FooterBridge` as the per-pane union alias) so the vocabulary matches its Header/Explorer peers. The footer slice is plumbed through React context rather than the `onDiagramBridge` callback because `useFooterContext` is reachable from any pane without threading a ref back up to `knowledgeBase.tsx`; the ISP intent is identical — consumers depend on the narrowest slice they use.

### 3.1 Data Model (`types.ts`)
- ⚙️ **NodeData** — decomposed (Phase 4b, 2026-04-19) into four slice types joined by intersection: `NodeIdentity` (id, label, sub?, type?, layer), `NodeGeometry` (x, y, w, rotation?), `NodeAppearance` (icon component, borderColor?, bgColor?, textColor?), and `NodeShape` — a discriminated union where the rect variant (`{ shape?: 'rect' }`) disallows condition fields and the condition variant (`{ shape: 'condition' }`) requires both `conditionOutCount: number` and `conditionSize: 1|2|3|4|5`. `NodeData` itself is the aggregate `NodeIdentity & NodeGeometry & NodeAppearance & NodeShape`, so existing call sites keep compiling while utilities (e.g. `getNodeDims`) can accept the narrowest slice they actually read. Condition-node defaults are materialised at the I/O boundary by `deserializeNodes` (`conditionOutCount ?? 2`, `conditionSize ?? 1`); `SerializedNodeData` keeps those fields optional so old vaults still load.
- ⚙️ **LayerDef** — id, title, bg/border/text colours, contains nodes by node.layerId.
- ⚙️ **Connection** — id, `from`/`to` node ids, `fromAnchor`/`toAnchor`, colour, label, label position, `biDirectional`, `connectionType` (`synchronous | asynchronous`), `flowDuration`, optional waypoints.
- ⚙️ **FlowDef** — id, name, optional category, `connectionIds[]`.
- ⚙️ **Selection union** — `node | multi-node | layer | multi-layer | line | multi-line | flow`.
- ⚙️ **LineCurveAlgorithm** — `orthogonal | bezier | straight`.

### 3.2 Canvas & Viewport
`components/Canvas.tsx`, `hooks/useZoom.ts`, `hooks/useCanvasCoords.ts`, `hooks/useCanvasEffects.ts`, `hooks/useCanvasInteraction.ts`, `hooks/useViewportPersistence.ts`
- ✅ **Patched infinite canvas** — 800 × 800 px patches grow/shrink dynamically (`fitToContent`) to wrap content.
- ✅ **Zoom & pinch-zoom** — live zoom ref propagated to the minimap.
- ✅ **Auto-fit on load / reset** — zoom-to-content on first open.
- ✅ **Viewport persistence** — zoom and scroll (translate X/Y) persisted per diagram to localStorage; restored on reload.
- ⚙️ **Client → world coord transform** — via scroll offset and zoom, with 2000 px viewport padding guard.
- ✅ **Canvas click deselects** — resets selection to null.

### 3.3 Minimap
`components/Minimap.tsx`
- ✅ **200 px-wide overview** — shows layers, nodes, and the current viewport rect at aspect-preserving scale.
- ✅ **Draggable viewport rect** — panning the rect scrolls the canvas.
- ✅ **Scroll sync** — listens to canvas scroll and updates in real time.

### 3.4 Icon Registry
`utils/iconRegistry.ts`
- ⚙️ **41 Lucide icons registered** — Activity, Archive, BarChart, Bell, Box, Cable, Cloud, CloudCog, Code, Cog, Container, Cpu, Database, DatabaseZap, FileCode, Fingerprint, Folder, GitBranch, Globe, HardDrive, Key, Laptop, Layers, Lock, Mail, Monitor, Network, Plug, Radio, Router, Server, ServerCog, Shield, ShieldCheck, Smartphone, Tablet, Terminal, User, Users, Wifi, Zap. (README quotes "50+" — actual count is 41.)
- ⚙️ **Name ↔ icon mapping** — `getIcon`, `getIconName`, `getIconNames` for serialization.

### 3.5 Nodes (Rectangle Elements)
`components/Element.tsx`, `hooks/useNodeDrag.ts`, `hooks/useLabelEditing.ts`
- ✅ **Rectangle node** — label, sublabel, icon, custom colours, optional rotation.
- ✅ **Single-node drag** — grid snap, collision avoidance vs sibling nodes and layer boundaries.
- ✅ **Multi-node drag** — group moves together with bounding-box collision checking.
- ✅ **Label editing** — double-click to rename.
- ✅ **Default width** — `DEFAULT_NODE_WIDTH = 210` on create.

### 3.6 Condition Nodes
`components/ConditionElement.tsx`, `utils/conditionGeometry.ts`
- ✅ **Diamond/condition shape** — `shape === 'condition'`; configurable `size` (1–5) and `exits` (1–5).
- ⚙️ **Special anchors** — single `cond-in`, multiple `cond-out-0..N` on each exit.
- ⚙️ **Tailored path/scale geometry** — `getConditionPath`, `getConditionDimensions`, `getConditionScale`, `getConditionAnchors`, etc. (God node: `getConditionAnchors` — 5 edges.)

### 3.7 Layers
`components/Layer.tsx`, `utils/layerBounds.ts`, `hooks/useLayerDrag.ts`, `hooks/useLayerResize.ts`
- ✅ **Layer containers** — hold nodes; custom title, bg/border/text colours.
- ✅ **Auto bounds** — computed from child nodes + `LAYER_PADDING = 25` + `LAYER_TITLE_OFFSET = 20`.
- ✅ **Manual size overrides** — user-set width/height stored per-layer.
- ✅ **Layer drag** — all contained nodes move with it; enforces `LAYER_GAP = 10` between layers.
- ✅ **Layer resize** — drag edges; contained nodes shift to avoid overlap.
- ✅ **New-layer default** — `DEFAULT_LAYER_WIDTH = 400`, `DEFAULT_LAYER_HEIGHT = 200`.
- ⚙️ **Level model** (`utils/levelModel.ts`) — assigns `(level, base)` per node so collisions only trigger at the same level; condition nodes spanning layers get demoted to canvas level.

### 3.8 Connections (Lines)
`components/DataLine.tsx`, `utils/pathRouter.ts`, `utils/orthogonalRouter.ts`, `utils/geometry.ts`, `utils/anchors.ts`
- ✅ **Three routing algorithms** — `orthogonal` (obstacle-avoiding with rounded corners), `bezier` (cubic with anchor-direction tangents), `straight`. Dispatched via a Strategy registry (`routerRegistry` in `utils/pathRouter.ts`) — adding a new algorithm is a registry entry, not a `switch` edit (Phase 2, 2026-04-18).
- ✅ **9-point anchor set per rect** — top/bottom/left/right × three positions each; plus condition-specific anchors.
- ✅ **Label** — text, colour, `labelPosition` (0–1 along the path).
- ✅ **Bidirectional toggle** and **sync / async connection type**.
- ✅ **Waypoints** — custom kinks along the path (editable via segment drag).
- ⚙️ **`routeBetween`**, **`computeOrthogonalPath`**, **`pathIntersectsAny`**, **`segmentIntersectsAny`** — top god nodes driving routing.

### 3.9 Connection Interaction
`hooks/useEndpointDrag.ts`, `hooks/useSegmentDrag.ts`, `hooks/useAnchorConnections.ts`, `components/AnchorPopupMenu.tsx`, `utils/connectionConstraints.ts`
- ✅ **Endpoint drag** — 150 ms click-hold to grab; endpoint snaps to nearest anchor within radius or free-floats.
- ✅ **Connection constraints** — validates permissible reconnects (no self-loops, condition rules).
- ✅ **Flow-break check on reconnect** — simulates new topology and warns if it breaks a flow.
- ✅ **Segment drag** — reshape the path by dragging segments / waypoints; commits to history.
- ✅ **Anchor popup menu** — hover on a node shows anchors for connect/edit.

### 3.10 Flows (Named Connection Sequences)
`utils/flowUtils.ts`, `components/FlowBreakWarningModal.tsx`, `components/FlowDots.tsx`, `properties/FlowProperties.tsx`, `hooks/useFlowManagement.ts`
- ✅ **Create flow from multi-line selection** — `Cmd/Ctrl+G`; requires contiguous connections (share nodes).
- ✅ **Flow dots** — animated dots along the path signal membership / animation.
- ✅ **Flow-break warnings** — modal lists flows that would break before deleting / reconnecting.
- ⚙️ **Algorithms** — `isContiguous`, `orderConnections`, `findBrokenFlows`, `findBrokenFlowsByReconnect`.
- ✅ **Edit name, category, membership; delete flow.**
- ✅ **Categorised grouping** — flows with `category` grouped under that category in the panel; otherwise flat.
- ✅ **Flow start/end highlighting** — when a flow is active (selected or hovered), source nodes (appear as `from` but never as `to`) glow green and sink nodes (appear as `to` but never as `from`) glow red; multiple sources and sinks are all highlighted; connection labels outside the flow are hidden. Implemented in `DiagramView.tsx` (`flowOrderData` memo), `components/DiagramNodeLayer.tsx`, `components/Element.tsx`, `components/ConditionElement.tsx`.
- ✅ **Document attachment** — attach existing docs to a flow from FlowProperties; create & attach a new blank doc (with optional "Edit now" to open in pane); detach with optional cascade delete that strips wiki-links from referencing docs and shows a deduplicated reference list before confirming. `features/diagram/properties/FlowProperties.tsx`, `features/diagram/components/CreateAttachDocModal.tsx`, `features/diagram/components/DetachDocModal.tsx`

### 3.11 Selection
`hooks/useSelectionRect.ts`, `hooks/useKeyboardShortcuts.ts`, `utils/selectionUtils.ts`
- ✅ **Click-select** — single node / layer / line / flow.
- ✅ **`Ctrl/Cmd+click`** — toggle add to multi-selection.
- ✅ **Rubber-band rectangle** — drag on canvas to select intersecting nodes / layers / lines.
- ✅ **< 25 px tap threshold** — disambiguates click vs accidental drag.

### 3.12 Context Menu
`components/ContextMenu.tsx`, `hooks/useContextMenuActions.ts`
- ✅ **On canvas** — Add Element, Add Layer.
- ✅ **On layer** — Add Element (inside layer), Delete Layer.
- ✅ **On element** — Delete Element.
- ⚙️ **Add Element** — collision avoidance, layer auto-assignment, grid snap, selection update.
- ⚙️ **Add Layer** — non-overlapping placement, unique id.

### 3.13 Properties Panel
`properties/PropertiesPanel.tsx` and siblings
- ✅ **Collapsible, tabbed by selection type** — falls back to Architecture when nothing is selected.
- ✅ **Respects read-only** — disables editors when the pane is locked.
- ✅ **NodeProperties** — label, sublabel, icon picker, type classifier, layer assignment, custom colours, rotation, (condition) exit count / size, incoming/outgoing connections, via-condition paths, member flows, backlinks, document attachment.
- ✅ **LayerProperties** — title, colours, child count, manual-size override toggle.
- ✅ **LineProperties** — label, colour, curve algorithm, bidirectional, connection type, flow duration, source/dest anchors.
- ✅ **FlowProperties** — name, category, member connections, delete, document attachment (attach existing, create & attach, detach with optional cascade delete); all attach/detach operations are recorded in the action history and are undoable/redoable.
- ✅ **DiagramProperties** (root) — diagram title, default line algorithm, Layers list, Elements list, Types tree with "Select All" per type, Flows panel with category grouping, document backlinks.
- ✅ **DocumentsSection** — clickable list of docs linked to the selection; opens in the other pane.

### 3.14 Keyboard Shortcuts
`hooks/useKeyboardShortcuts.ts`
- ✅ `Escape` — deselect and close context menu.
- ✅ `Delete` / `Backspace` — delete selection (prompts on flow break).
- ✅ `Cmd/Ctrl+G` — create flow from multi-line selection.
- ✅ `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z` — undo / redo.
- ✅ `Cmd/Ctrl+Shift+R` — toggle read-only mode.
- ✅ **Disabled inside inputs / contenteditable.**

### 3.15 Auto-Arrange / Grid / Collision
- ✅ **Auto-arrange** (`utils/autoArrange.ts`) — Sugiyama-style hierarchical layout with topological sort, rank assignment, 2-pass barycenter ordering; 180 px rank spacing, 40 px node spacing; TB / LR directions. Dispatched via a Strategy registry (`layoutRegistry` / `computeLayout`) — three entries: `hierarchical-tb`, `hierarchical-lr`, `force` (Phase 2, 2026-04-18).
- ⚙️ **ID factory** (`utils/idFactory.ts`) — `createElementId`, `createLayerId`, `createConditionId`. Centralises the `el-<ts>-<rand>` / `ly-<ts>-<rand>` scheme so collision resistance or prefix changes are one-file edits (Phase 2, 2026-04-18).
- ✅ **Grid snap** (`utils/gridSnap.ts`) — snap during drag; **has an existing unit test** (`utils/gridSnap.test.ts`).
- ⚙️ **Collision utilities** (`utils/collisionUtils.ts`) — `clampNodePosition`, `clampMultiNodeDelta`, `findNonOverlappingLayerPosition`, `clampElementToAvoidLayerCollision`, `clampToAvoidOverlap`, `clampLayerDelta`.

### 3.16 Undo / Redo
`hooks/useDragEndRecorder.ts`; shared layer: `shared/hooks/useHistoryCore.ts`, `shared/hooks/useHistoryFileSync.ts`, `shared/hooks/useDiagramHistory.ts`, `shared/hooks/useDocumentHistory.ts`, `shared/utils/historyPersistence.ts`
- ⚙️ **`useHistoryCore`** (`shared/hooks/useHistoryCore.ts`) — generic undo/redo state machine: `recordAction`, `undo`, `redo`, `goToEntry`, `goToSaved`, `markSaved`, `initEntries`, `clear`, `getLatestState`. MAX_HISTORY=100; when the saved entry would be pruned it is pinned at index 0 (`savedEntryPinned=true`) and undo is blocked at index 1.
- ⚙️ **`useHistoryFileSync`** (`shared/hooks/useHistoryFileSync.ts`) — wraps `useHistoryCore`; adds `initHistory` (loads sidecar on open), `onFileSave` (FNV-1a checksum + 1 s debounced write), and `clearHistory`. Used by both diagram and document history adapters.
- ⚙️ **`useDiagramHistory`** (`shared/hooks/useDiagramHistory.ts`) — thin adapter over `useHistoryFileSync<DiagramSnapshot>`; exposes `onSave` alias. Snapshots: title + layers + nodes + connections + lineCurve + flows.
- ⚙️ **`useDocumentHistory`** (`shared/hooks/useDocumentHistory.ts`) — adapter over `useHistoryFileSync<string>`; adds `onContentChange` (5 s debounced record) and `onBlockChange` (immediate record) for Tiptap paragraph-level granularity.
- ⚙️ **`historyPersistence`** (`shared/utils/historyPersistence.ts`) — FS utilities: `fnv1a`, `historyFileName`, `resolveParentHandle`, `readHistoryFile`, `writeHistoryFile`; all FS ops silent-fail.
- ✅ **Sidecar file** — `.<filename>.history.json` next to the file; max 100 entries, FNV-1a checksum for disk-change detection.
- ✅ **`goToSaved()`** — revert to last saved snapshot.
- ✅ **HistoryPanel** (`shared/components/HistoryPanel.tsx`) — collapsible UI list of history entries with click-to-revert; `relativeTime()` bucketing (just now / Xs ago / Xm ago / Xh ago / Xd ago); entries rendered newest-first.

### 3.17 Read-Only Mode
- ✅ **Default read-only on open** — diagram files open in read mode by default (`shared/hooks/useReadOnlyState` defaults to `readOnly: true` when no localStorage preference exists for the file, and when `activeFile` is null). The user must explicitly switch to edit mode; that choice is persisted per file under `diagram-read-only:<filename>` in localStorage so subsequent opens honour the preference.
- ✅ **Pane-level toggle** — via PaneHeader lock icon and `Cmd/Ctrl+Shift+R`.
- ✅ **Disables drag / delete / edit / property panel inputs.**

### 3.18 Document Integration
- ✅ **DocInfoBadge** (`components/DocInfoBadge.tsx`) — small badge on elements with attached documents.
- ✅ **Attach / detach docs per entity** — persisted in the diagram JSON under `documents`.
- ✅ **Backlinks surfaced in properties.**

### 3.19 Persistence
`hooks/useDiagramPersistence.ts`, `shared/utils/persistence.ts`
- ✅ **Disk save** — serializes nodes (icon refs → names), connections, layers, flows, manual layer sizes, measured node sizes.
- ✅ **Drafts in localStorage** — autosaved on edit; applied on next load until the real file is saved.
- ⚙️ **Colour migration** — legacy Tailwind class names migrated to hex on load.
- ⚙️ **`loadDefaults`, `serializeNodes`, `deserializeNodes`, `saveDraft`, `listDrafts`, `clearDraft`, `loadDiagramFromData`.**

### 3.20 Doc Preview Modal
`diagram/components/DocPreviewModal.tsx`
- ✅ **DocPreviewModal** — universal read-only document preview triggered by clicking any attached doc or wiki-link backlink in any entity panel. Blurs the diagram canvas (`blur-sm pointer-events-none`) and disables interactions while open. Header shows filename, "Read only" chip, optional entity name badge, "Open in pane" button, and close ✕. Body renders document content via `markdownToHtml()` in `.markdown-editor .ProseMirror` — pixel-identical to the doc pane. Rendered via `ReactDOM.createPortal` at `document.body`, unaffected by ancestor `filter`/`transform`. Closes on Escape or backdrop click. HTML output sanitized with a DOM-based sanitizer before render.

---

## 4. Document Editor

Root: `src/app/knowledge_base/features/document/`. Top-level is `DocumentView.tsx`.

### 4.1 Editor Orchestration
- ✅ **DocumentView** — pane + properties sidebar + link manager; manages focus, navigation, doc creation. Owns `readOnly` state (lifted from MarkdownPane) and passes it to `useDocumentKeyboardShortcuts`, `DocumentProperties`, and `MarkdownPane`. Initialises document history (`useDocumentHistory.initHistory`) only after `useDocumentContent` confirms the file's content is loaded (`loadedPath === filePath`), preventing stale-content history init on file switch.
- ✅ **MarkdownPane** — pane wrapper with header, title, backlinks dropdown, read-only toggle. `readOnly`/`onToggleReadOnly` are controlled props (owner: `DocumentView`); the component no longer manages its own `readOnly` state.
- ✅ **MarkdownEditor** — Tiptap editor with WYSIWYG/Raw toggle, formatting toolbar, **200 ms debounced** HTML → markdown serialisation on keystroke (flushed on blur/unmount). Composes four focused pieces: `MarkdownToolbar.tsx` (toolbar JSX + rawBlock active-state), `TablePicker.tsx` (8×8 table-size grid popover), `ToolbarButton.tsx` (shared TBtn/Sep primitives), and `../extensions/rawSyntaxEngine.ts` (editor-coupled raw-syntax helpers: toggleRawSyntax / getActiveRawFormats / toggleRawBlockType / forceExitRawBlock). The `markdownReveal` Tiptap Extension (Typora-style live-reveal rawBlock) is split across four sibling files: `markdownReveal.ts` (Extension + RawBlock node + keybindings + `addProseMirrorPlugins`), `markdownRevealConversion.ts` (rich ↔ raw block converters + rawBlockToRichNodes cache), `markdownRevealDecorations.ts` (SYNTAX_PATTERNS + buildSyntaxDecorations), and `markdownRevealTransactions.ts` (locators + transaction mutators that back the `appendTransaction` body: findRawBlock, findConvertibleBlockAtCursor, maybeSyncRawBlockType, maybeForceExitRawList, restoreRawToRich, convertRichToRaw). Phases 1.2 → 1.3b (2026-04-18) reduced MarkdownEditor.tsx from 1018 to 366 lines and markdownReveal.ts from 1005 to 410.

### 4.2 Tiptap Extensions
Built on Tiptap v3 with StarterKit. Enabled child marks/nodes: headings H1–H6, paragraphs, bullet / ordered / task lists, blockquotes, inline bold / italic / strike / code, horizontal rule, hard break. Plus:
- ✅ **Tables** (`@tiptap/extension-table` + row / cell / header).
- ✅ **Task lists** (`@tiptap/extension-task-list`, `task-item`).
- ✅ **Images** (`@tiptap/extension-image`).
- ✅ **Links** (`@tiptap/extension-link`).
- ✅ **Placeholder** (`@tiptap/extension-placeholder`).
- ✅ **Code block with syntax highlighting** (`@tiptap/extension-code-block-lowlight` + `lowlight`).
- ✅ **Suggestion** (`@tiptap/suggestion`) — underpins wiki-link autocomplete.

### 4.3 Custom Extensions
`features/document/extensions/`
- ✅ **WikiLink** (`wikiLink.tsx`) — atomic `[[path#section|display]]` inline node. Blue pill when resolved, red when not found; doc vs diagram icon per target type.
- ✅ **WikiLink autocomplete** — typing `[[` opens a **folder-at-a-time picker** (`FolderPicker.tsx`) starting at the current document's directory; click a subfolder to drill in, back arrow to go up, click a file to insert. Typing any character after `[[` switches to the existing flat substring-filtered list (arrow-key navigation, Enter selects).
- ✅ **FolderPicker** (`components/FolderPicker.tsx`) — reusable folder-browser component; shows one directory level at a time with up-navigation. Used by both the `[[` suggestion popup and the Link Editor Popover browse button.
- ✅ **WikiLink inline edit** — selecting the node lets single keys append to the display text; Backspace/Delete trim; Escape reverts.
- ✅ **Click behaviour** — in edit mode selects, in read mode navigates (creates the target if unresolved).
- ✅ **Multi-candidate path resolution** — current-dir `.md` → current-dir `.json` → as-written → root-level `.md` / `.json`.
- ✅ **CodeBlockWithCopy** (`codeBlockCopy.tsx`) — code block with a hover "Copy" button; clipboard API with `execCommand` fallback.
- ✅ **TableNoNest** (`tableNoNest.ts`) — blocks `insertTable` when the cursor is already inside a table (GFM cannot represent nested tables).
- ✅ **MarkdownReveal** (`markdownReveal.ts`) — Typora-style live reveal. RawBlock node + decorations that wrap `**bold**`, `*italic*`, `~~strike~~`, `` `code` `` in `<strong>/<em>/<s>/<code>` as you type. Cursor entering a paragraph/heading/blockquote converts it to rawBlock; exiting re-parses via markdown-it. 64-entry LRU cache keyed on normalised markdown. Smart Enter (list-item splitting) and Backspace (merge with previous block's rightmost textblock).
- ⚙️ **MarkdownSerializer** (`markdownSerializer.ts`) — `htmlToMarkdown`, `markdownToHtml`. Preserves GFM pipe tables (with escaped `|`), task-list markers, wiki-links, link marks, blockquotes, fenced code with language, raw-block markers.

### 4.4 Formatting Toolbar (WYSIWYG only)
- ✅ **Mode toggle** — WYSIWYG ↔ raw textarea.
- ✅ **Undo / Redo** — with disabled states.
- ✅ **Headings H1–H6** — active state reflects current level.
- ✅ **Inline marks** — bold, italic, strike, inline code (falls back to raw-syntax toggling inside rawBlocks).
- ✅ **Block formats** — bullet list, ordered list, task list, blockquote, code block.
- ✅ **Insert** — horizontal rule, link (smart empty-insert), table picker (8×8 Excel-style grid, click inserts, disabled when already inside a table).

### 4.5 Table Floating Toolbar
`components/TableFloatingToolbar.tsx`
- ✅ **Auto-appear** — when cursor is in a table or mouse hovers one (200 ms hide delay on exit).
- ✅ **Positioning** — fixed above the table; hides when the table scrolls out of view.
- ✅ **Actions** — add row above/below, delete row, add column left/right, delete column, toggle header row, toggle header column, delete table.
- ✅ **Hover-only mode** — chrome visible but buttons disabled until the cursor is inside; hovering + click snaps the cursor into the last-hovered cell first.

### 4.6 Link Editor Popover
`components/LinkEditorPopover.tsx`
- ✅ **Two modes** — plain link mark (edit href + text) and wiki-link node (edit path + section + display).
- ✅ **Smart positioning** — below target by default, above if no room, clamped horizontally.
- ✅ **Path autocomplete** — native `<datalist>` backed by `allDocPaths` (wiki-link mode); additionally a **Browse button** (folder icon) opens an inline `FolderPicker` panel for point-and-click path selection.
- ✅ **Commit on Enter / blur**, **Escape reverts**.
- ✅ **Display-text smartness** — renaming keeps custom display unless it matched the old default.
- ✅ **Unlink** — removes the mark/node or deletes empty link text.

### 4.7 Wiki-Link Utilities
`utils/wikiLinkParser.ts`
- ⚙️ **`parseWikiLinks(markdown)`** — regex extraction of all `[[…]]`.
- ⚙️ **`resolveWikiLinkPath(linkPath, currentDir)`** — Obsidian-style: `/` prefix → vault root; relative paths normalise `..` / `.`; appends `.md` if no extension. Phase 5a (2026-04-19) clamps `..` beyond the vault root (dropped rather than emitted as a literal `..` segment) so the resolver can never produce a path that escapes the vault.
- ⚙️ **`updateWikiLinkPaths(markdown, oldPath, newPath)`** — bulk rename propagation; preserves section anchors and custom display text.
- ⚙️ **`stripWikiLinksForPath(markdown, deletedDocPath)`** — removes all `[[…]]` wiki-links pointing to a deleted document path; strips plain, aliased (`[[path|alias]]`), and section-anchored (`[[path#section]]`) forms. `features/document/utils/wikiLinkParser.ts`

### 4.8 Document Properties
`properties/DocumentProperties.tsx`
- ✅ **Stats** — word count, character count, estimated reading time (÷200 wpm).
- ✅ **Outbound links** — clickable list (path + optional section).
- ✅ **Backlinks** — clickable list of documents that reference this one.
- ✅ **Collapsible** — state persisted to localStorage; 36 px narrow when collapsed.

### 4.9 Link Index
`hooks/useLinkIndex.ts`
- ⚙️ **Index file** — `.archdesigner/_links.json`: `{ updatedAt, documents: { path → { outboundLinks, sectionLinks } }, backlinks: { path → { linkedFrom: [{ sourcePath, section? }] } } }`.
- ⚙️ **Incremental updates** — `updateDocumentLinks`, `removeDocumentFromIndex`, `renameDocumentInIndex`.
- ⚙️ **Backlink query** — `getBacklinksFor(docPath)`.
- ⚙️ **Full rebuild** — `fullRebuild(rootHandle, allDocPaths)` scans every doc on vault init.
- ⚙️ **Graphify cross-ref emission** — calls `emitCrossReferences` after each update.

### 4.10 Document Persistence
`hooks/useDocumentContent.ts`, `hooks/useDocuments.ts`
- ✅ **Per-pane content & dirty state.**
- ✅ **Auto-save on file switch** — saves the previous doc before loading the new one.
- ✅ **`loadedPath` signal** — set to `filePath` once a load succeeds (or immediately for null/no-repo cases); consumers compare `loadedPath === filePath` to confirm content is fresh for the current file before acting on it.
- ✅ **Ref-backed `save()` / `dirty` / `filePath` / `content` bridge** — lets parent read latest without re-rendering per keystroke.
- ✅ **`createDocument`, `attachDocument`, `detachDocument`, `removeDocument`, `getDocumentsForEntity`, `hasDocuments`.**
- ⚙️ **`collectDocPaths`, `existingDocPaths`.**

### 4.11 Read-Only Mode (Doc)
- ✅ **Editor locked** — toolbar hidden, table toolbar disabled, link popover disabled, wiki-link click navigates instead of selecting.
- ✅ **Default read-only on open** — document files open in read mode by default (`useReadOnlyState` with prefix `"document-read-only"` defaults to `readOnly: true` when no localStorage preference exists, matching diagram behaviour). The user must explicitly switch to edit mode; that choice is persisted per file under `document-read-only:<filePath>` in localStorage so subsequent opens honour the preference.

### 4.12 Document Keyboard Shortcuts
`features/document/hooks/useDocumentKeyboardShortcuts.ts`
- ⚙️ **`useDocumentKeyboardShortcuts`** — window-level `keydown` listener; Cmd/Ctrl+Z → `onUndo`, Cmd/Ctrl+Shift+Z → `onRedo`; no-op when `readOnly=true`. Stale-closure-safe via refs.

---

## 5. Cross-Cutting Link & Graph Layer

### 5.1 Link Index — see §4.9.

### 5.2 Graphify Bridge
`shared/utils/graphifyBridge.ts`
- ⚙️ **`emitCrossReferences`** — writes `.archdesigner/cross-references.json` after doc saves; records document→document and document→diagram edges for the external graphify knowledge graph. Best-effort (errors swallowed and logged).

### 5.3 Wiki-Link-Aware File Ops
- ✅ **Rename propagation** — renaming `foo.md` rewrites `[[foo]]` references in every other document and updates the link index.
- ✅ **Delete propagation** — deleting a document removes it from the backlink index.

---

## 6. Shared Hooks & Utilities

### 6.1 Shared History — see §3.16.
`useHistoryCore`, `useHistoryFileSync`, `useDiagramHistory`, `useDocumentHistory`, `historyPersistence` — all in `shared/hooks/` or `shared/utils/`.
### 6.2 `useFileActions`
- ⚙️ **High-level file ops** — load, save, create, delete, rename, duplicate, move; bridges file-system calls to diagram state; integrates history init on load and commit on save.
### 6.3 `useEditableState`
- ⚙️ **Inline-edit state machine** — editing flag, draft value, error message; auto-resets on external value change; `inputRef` auto-focus helper.
### 6.4 `useSyncRef`
- ⚙️ **Always-fresh ref** — avoids stale-closure boilerplate in event handlers.

---

## 7. Persistence Surface (Where State Lives)

| Storage | Contents |
|---|---|
| **localStorage** (per-scope) | Explorer sort prefs, filter, collapse state; split ratio; pane layout; "Don't ask me again" flags; diagram drafts; per-diagram viewport; doc-properties collapse state. |
| **IndexedDB** (`knowledge-base` / `handles`) | File System Access API directory handle (+ scope ID). |
| **Disk (vault)** | `*.json` diagrams, `*.md` documents, `.<name>.history.json` sidecars, `.archdesigner/config.json`, `.archdesigner/_links.json`, `.archdesigner/cross-references.json`. |

---

## 8. Test & Verification Infrastructure

### 8.1 Unit (Vitest)
- ✅ **`vitest` + `@vitest/ui` + `@vitest/coverage-v8`** configured (`vitest.config.ts`, `tsconfig.test.json`).
- ✅ **jsdom** environment via `src/test/setup.ts` + `@testing-library/react` + `@testing-library/user-event` + `@testing-library/jest-dom`.
- ✅ **Existing test**: `features/diagram/utils/gridSnap.test.ts`.
- **Scripts**: `npm test`, `npm run test:run`, `npm run test:ui`, `npm run coverage`.

### 8.2 End-to-End (Playwright)
- ✅ **`@playwright/test`** configured (`playwright.config.ts`).
- ✅ **`PLAYWRIGHT_BASE_URL` env-var override** — when set, Playwright targets that URL and skips the built-in `npm run dev` webServer (useful for re-using an already-running local dev server).
- ✅ **`e2e/app.spec.ts`** — pre-folder shell smoke suite: app mounts with zero errors; Geist font CSS vars present (SHELL-1.1-02); root container is a full-height flex column (SHELL-1.1-03); "No file open" empty state and "Open Folder" button render; Header title defaults to "Untitled".
- ✅ **`e2e/fixtures/fsMock.ts`** — in-browser File System Access mock installed via `page.addInitScript`. Exposes `window.__kbMockFS` with `seed(files)` / `read(path)` / `reset()` helpers so tests can pre-populate an in-memory vault and read back the app's writes without any native dialog.
- ✅ **`e2e/goldenPath.spec.ts`** — folder-open → explorer-populates → click-file → pane-renders-content flows for both `.md` (MarkdownPane) and `.json` (DiagramView); pane-swap; "No file open" empty-state disappears; Save button disabled for clean docs.
- ✅ **`e2e/fsMockSanity.spec.ts`** — mock-FS contract tests (addInitScript installs `showDirectoryPicker`, seed+`values()` round-trip, root-level file tree renders).
- ✅ **`e2e/diagramGoldenPath.spec.ts`** — full diagram editor golden path: open `.json` vault, canvas renders, node selection/drag, Delete key removes node, properties panel collapse/persist (file-switch autosave is `test.skip`-ped pending SHELL-1.2-22 implementation); uses `fsMock.ts` in-memory FS.
- ✅ **`e2e/documentGoldenPath.spec.ts`** — full document editor golden path: open `.md` vault, WYSIWYG content renders, `[[wiki-link]]` pill visible, Raw toggle round-trip, Cmd+S saves, dirty-flag cleared, file-switch autosave.
- **Scripts**: `npm run test:e2e`, `npm run test:e2e:ui`.

### 8.3 Tooling Hooks
- ⚙️ **Build**: `next build` — Next.js 16 / React 19.
- ⚙️ **Lint**: `eslint` with `eslint-config-next`.
- ⚙️ **Type check**: strict TS 5 (`tsconfig.json`, `tsconfig.test.json`).

### 8.4 Continuous Integration
- ⚙️ **GitHub Actions CI** (`.github/workflows/ci.yml`) — gates every PR into `main` and every push to `main` on unit tests (`npm run test:run`), e2e tests (`npm run test:e2e`), and build (`npm run build`). Uses Node version from `.nvmrc`, caches npm, installs Chromium for Playwright, uploads the HTML report as an artifact on failure. Lint is intentionally not gated (pre-existing lint errors deferred to Phase 1).

---

## 9. External Contracts (for reference in test design)

- **File System Access API** — `showDirectoryPicker`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`, `FileSystemWritableFileStream` (typings in `types/file-system.d.ts`). Only supported in Chromium-family browsers.
- **Vault layout** — top-level `*.json` diagrams, `*.md` documents, hidden `.archdesigner/` config dir, `.<name>.history.json` sidecars, optional nested folders.
- **Wiki-link grammar** — `[[path]]`, `[[path#section]]`, `[[path#section|display]]`, `[[path|display]]`.

---

## 10. Notable Items Worth Prioritising for Tests

1. **Grid snap** — already has a unit test; extend to round-trip.
2. **Markdown round-trip** (`htmlToMarkdown` ∘ `markdownToHtml`) — tables, task lists, wiki-links, code fences, blockquotes.
3. **Wiki-link path resolution** — `resolveWikiLinkPath` across relative, absolute, extension-less, and root-fallback cases.
4. **Wiki-link rename propagation** — `updateWikiLinkPaths` preserves section anchors and custom display.
5. **Orthogonal routing** — `routeBetween`, `pathIntersectsAny`, `segmentIntersectsAny` (god nodes; cover rects in the way, corner cases).
6. **Flow contiguity** — `isContiguous`, `orderConnections`, `findBrokenFlows`, `findBrokenFlowsByReconnect`.
7. **Collision clamps** — `clampNodePosition`, `clampMultiNodeDelta`, `findNonOverlappingLayerPosition`.
8. **Level model** — `computeLevelMap` correctly demotes cross-layer condition nodes.
9. **Serialize / deserialize** — `serializeNodes` / `deserializeNodes` round-trip, legacy Tailwind colour migration.
10. **Directory-scoped localStorage** — `scopedKey` behaviour when two vaults mounted in sequence.
11. **Link index** — full rebuild idempotency, backlink reverse mapping, rename propagation.
12. **Playwright smoke** — already exists; extend with folder-picker stub + basic diagram-create / doc-create flow (mindful of Preview-MCP's File System Access limit — see `MEMORY.md`).
