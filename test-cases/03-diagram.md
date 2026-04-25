# Test Cases — Diagram Editor

> Mirrors §3 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 3.1 Data Model (`types.ts`)

- **DIAG-3.1-01** ✅ **NodeData serialisable** — round-trips through `serializeNodes`/`deserializeNodes` with stable shape. Covered by DIAG-3.19-01..04 in `persistence.test.ts`.
- **DIAG-3.1-02** 🟡 **LineCurveAlgorithm union** — only `"orthogonal" | "bezier" | "straight"` are valid. TypeScript-level constraint; the runtime default fallback is covered by DIAG-3.19 ("defaults lineCurve to orthogonal when missing").
- **DIAG-3.1-03** ✅ **Selection union shapes** — each of the 7 selection kinds is exercised by `selectionUtils.test.ts` (`isItemSelected`, `toggleItemInSelection`, `resolveRectangleSelection` construct every variant).
- **DIAG-3.1-04** ✅ **FlowDef optional category** — `persistence.test.ts` round-trips flows with and without `category` (DIAG-3.19-05/06/07).

## 3.2 Canvas & Viewport

- **DIAG-3.2-01** ❌ **Default 800 px patches.** Requires real viewport geometry (patch computation reads `scrollWidth`/`scrollHeight`); JSDOM returns zeros. Playwright territory
- **DIAG-3.2-02** ❌ **Patch grows on content.** Same — depends on real layout measurement.
- **DIAG-3.2-03** ❌ **Patch shrinks when content removed.** Same.
- **DIAG-3.2-04** ❌ **Zoom in via wheel/pinch.** Native wheel + pinch events aren't emulable in JSDOM.
- **DIAG-3.2-05** ❌ **Zoom out.** Same.
- **DIAG-3.2-06** ❌ **Auto-fit on initial open.** Depends on real bounding rects.
- **DIAG-3.2-07** 🟡 **Viewport persisted per diagram** — key shape + per-file scoping covered via util-level tests (PERSIST-7.1-10); the hook-level save-on-scroll path needs real DOM geometry.
- **DIAG-3.2-08** ❌ **2000 px viewport padding guard.** Layout-dependent.
- **DIAG-3.2-09** 🟡 **Client→world coord transform** — logic lives inside `useCanvasCoords` hook and reads live DOM; the math is exercised indirectly by `useViewportPersistence`. Dedicated unit test requires extracting the transform — open a ticket.
- **DIAG-3.2-10** ✅ **Canvas click deselects.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.2-11** ❌ **Pan by drag on empty canvas.** Pointer events + scroll — Playwright.
- **DIAG-3.2-12** ✅ **Opening a .json renders canvas + nodes** — `[data-testid="diagram-canvas"]` visible, both seeded nodes appear as `[data-testid="node-<id>"]`. — e2e/diagramGoldenPath.spec.ts

## 3.3 Minimap

- **DIAG-3.3-01** ✅ **Renders all layers & nodes** — e2e/diagramMinimap.spec.ts
- **DIAG-3.3-02** ✅ **Viewport rect visible.** — e2e/diagramMinimap.spec.ts
- **DIAG-3.3-03** ❌ **Drag viewport rect pans canvas.** Pointer events + scroll.
- **DIAG-3.3-04** ❌ **Aspect-ratio preserved.** Computed from real content bounds.
- **DIAG-3.3-05** ❌ **Live scroll sync.** Scroll events.
- **DIAG-3.3-06** ✅ **Minimap width = 200 px.** — e2e/diagramMinimap.spec.ts

## 3.4 Icon Registry

- **DIAG-3.4-01** ✅ **`getIconNames` length = 41** — registry is exactly 41 unique, non-empty string keys.
- **DIAG-3.4-02** ✅ **`getIcon('Database')` returns a component** — direct lookup returns the `Database` lucide component (also verified for `Server`).
- **DIAG-3.4-03** ✅ **`getIcon('Unknown')` returns undefined** — unknown name (including empty string) returns `undefined` without throwing.
- **DIAG-3.4-04** ✅ **`getIconName` round-trip** — round-trips cleanly for every registry key, including lucide legacy aliases (`BarChart`, `Fingerprint`). `getIconName` reverse-looks-up the registry instead of reading `displayName`, so the name written on save is always a valid registry key on load.
- **DIAG-3.4-05** ✅ **`getIconName` for an unregistered component** — any component not in the registry (e.g. a plain object or arbitrary function cast as `ComponentType`) returns the sentinel `"Unknown"`.

## 3.5 Nodes

- **DIAG-3.5-01** ✅ **Create node via context menu.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.5-02** 🟡 **New node default width = 210.** `DEFAULT_NODE_WIDTH` constant is exported from `constants.ts`; the new-node creation wiring (context menu → `useActionHistory.recordAction`) is canvas-level.
- **DIAG-3.5-03** ❌ **Icon, label, sublabel render.** The `Element` component's full render path depends on measured dimensions; Playwright.
- **DIAG-3.5-04** ❌ **Custom colours render.** Computed style under JSDOM.
- **DIAG-3.5-05** ❌ **Rotation applied.** Transform inspection needs browser layout.
- **DIAG-3.5-06** ✅ **Single-node drag moves node.** Pointer events. — e2e/diagramGoldenPath.spec.ts
- **DIAG-3.5-07** ❌ **Single-node drag respects layer bounds.** Live drag + `layerBounds` math — the math is covered by `layerBounds.test.ts`, the drag wiring is canvas-level.
- **DIAG-3.5-08** ❌ **Multi-node drag moves all.** Pointer events.
- **DIAG-3.5-09** ❌ **Multi-node drag clamped by group bbox.** Live drag.
- **DIAG-3.5-10** ✅ **Double-click label → edit.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.5-11** ✅ **Enter commits label.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.5-12** ✅ **Escape reverts label.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.5-13** ❌ **Raw vs snapped position visual.** Live drag feedback; `snapToGrid` itself is covered by DIAG-3.15-01..05.

## 3.6 Condition Nodes

- **DIAG-3.6-01** ✅ **Condition shape renders** — `getConditionPath` returns `M …top L …right L 0 h Z` for `outCount ≤ 2` (plain triangle) and switches to `M …top L …right A R R 0 0 1 …left Z` (triangle + circular arc base) for `outCount ≥ 3`.
- **DIAG-3.6-02** 🟡 **Size range 1–5.** TypeScript-level: `conditionSize?: 1|2|3|4|5`. `getConditionScale` clamps gracefully at render time (covered by `conditionGeometry.test.ts`).
- **DIAG-3.6-03** 🟡 **Exits range 1–5.** Same story: `conditionOutCount` enforced via `getConditionAnchors` + `getConditionPath` rendering; out-of-range handled as fallback.
- **DIAG-3.6-04** ✅ **`cond-in` single input** — `getConditionAnchors` always emits exactly one `anchorType: 'in'` anchor with id `cond-in`.
- **DIAG-3.6-05** ✅ **`cond-out-N` anchors per exit** — `outCount: 3` → returns ids `cond-out-0`, `cond-out-1`, `cond-out-2`. `outCount < 2` is clamped to 2.
- **DIAG-3.6-06** ✅ **`getConditionAnchors` positions** — `cond-in` sits at `(cx, cy - effectiveH/2)`; `cond-out-*` distributed along the base (or along the circular arc for `outCount ≥ 3`); rotation rotates every anchor around `(cx,cy)`.
- **DIAG-3.6-07** ✅ **Scale matches size** — `getConditionScale` returns `1 + (size-1)*0.25` so sizes 1–5 map to 1.0/1.25/1.5/1.75/2.0; `getConditionDimensions` is monotone in both size and out-anchor count (caps at 120° vertex → `CONDITION_WIDTH`).

## 3.7 Layers

- **DIAG-3.7-01** ✅ **Create layer via context menu.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.7-02** 🟡 **Default dimensions.** `DEFAULT_LAYER_WIDTH` / `DEFAULT_LAYER_HEIGHT` constants live in `constants.ts`; the create flow is canvas-level.
- **DIAG-3.7-03** ✅ **Layer bounds auto-expand** — `predictLayerBounds` in `layerBounds.test.ts`.
- **DIAG-3.7-04** ✅ **Layer bounds include title offset** — `predictLayerBounds` honours `LAYER_TITLE_OFFSET`; `layerBounds.test.ts`.
- **DIAG-3.7-05** ✅ **Manual size override** — `layerBounds.test.ts` covers both the override-wins-when-larger and auto-wins-when-manual-is-smaller cases.
- **DIAG-3.7-06** 🟡 **`LAYER_GAP` enforced between layers** — constant exported; clamp logic lives in layer-drag handlers (canvas-level). Unit assertion deferred.
- **DIAG-3.7-07** ❌ **Layer drag moves children.** Live drag.
- **DIAG-3.7-08** ❌ **Layer resize shifts contained nodes.** Live drag + bounds interaction.
- **DIAG-3.7-09** ❌ **Resize clamped by sibling layers.** Live drag.
- **DIAG-3.7-10** ✅ **Level model — canvas node level=1 with no layer** — `computeLevelMap` assigns `(1, "canvas")` to any node whose `layer` is a falsy string.
- **DIAG-3.7-11** ✅ **Level model — in-layer node level=2** — node with non-empty `layer` → `(2, layerId)`.
- **DIAG-3.7-12** ✅ **Level model — condition demotion** — condition inherits its `cond-in` source's `(level, base)` when every outbound target shares that base; if any outbound target sits on a different base (other layer or canvas), the condition is demoted to `(1, "canvas")`. Missing source or missing `cond-in` edge also demotes to `(1, "canvas")`.
- **DIAG-3.7-13** ✅ **Collision only within same level** — `getCollisionPeers` returns only nodes whose `(level, base)` match the query node (and excludes self); layerless nodes are peers of other layerless nodes, not of in-layer ones.

## 3.8 Connections (Lines)

- **DIAG-3.8-01** ✅ **Straight routing** — `computePath("straight", …)` returns `M fx fy L tx ty` and `points: [from, to]`; obstacles are ignored (no deflection).
- **DIAG-3.8-02** ✅ **Bezier routing — cubic curve** — `"bezier"` emits `M fx fy C cp1x cp1y, cp2x cp2y, tx ty` and samples 17 points (`segments=16`). Control points extend from each endpoint along the anchor normal (or `fromDir`/`toDir` override).
- **DIAG-3.8-03** ✅ **Bezier control distance** — control offset = `min(0.4 * span, 150)` where `span` is the straight-line distance; verified at both short span (scales with 0.4×) and long span (clamps at 150).
- **DIAG-3.8-04** ✅ **Orthogonal routing avoids obstacles** — H→H route between offset endpoints shifts its connecting vertical segment out of the (15-px-padded) obstacle interior, using the offset-search at 0.25/0.75/-0.1/1.1.
- **DIAG-3.8-05** ✅ **`routeBetween` rounded corners** — `buildRoundedPath` emits `A r r 0 0 sweep` arc commands at each bend (radius clamped to half the shorter incident segment).
- **DIAG-3.8-06** ✅ **12 anchors per rect** — `getAnchors(rect)` returns exactly 12 anchors (3 per side × 4 sides: `top-0/1/2`, `bottom-0/1/2`, `left-0/1/2`, `right-0/1/2`). _Note: Features.md's "9 anchors" phrasing is outdated; implementation has 12._
- **DIAG-3.8-07** ✅ **Anchor positions on perimeter** — every anchor returned by `getAnchors(cx,cy,w,h)` sits on at least one of the four edges (x ∈ {cx−w/2, cx+w/2} or y ∈ {cy−h/2, cy+h/2}).
- **DIAG-3.8-08** ✅ **`findNearestAnchor` snaps** — point within `snapRadius` of an anchor returns that anchor with its distance; point > snapRadius from any anchor returns `null`; condition nodes dispatch to `getConditionAnchors`.
- **DIAG-3.8-09** 🚫 **`bidirectional` renders arrowheads both ends.** DataLine.tsx has no arrowhead SVG elements — `biDirectional` only reverses FlowDots animation (`keyPoints="0;1;0"`). Feature unimplemented; update test case description if arrowheads are ever added.
- **DIAG-3.8-10** ✅ **`connectionType: asynchronous` renders distinctly.** — e2e/diagramConnectionRendering.spec.ts
- **DIAG-3.8-11** ❌ **Label at labelPosition 0.5.** Path-position math executes but label `<text>` rendering + transform isn't observable in JSDOM.
- **DIAG-3.8-12** ❌ **Label at labelPosition 0.** Same.
- **DIAG-3.8-13** 🟡 **Waypoints render kinks** — waypoint routing logic is covered by `pathRouter.test.ts` (DIAG-3.8 core cases); visual verification lives in Playwright.
- **DIAG-3.8-14** ✅ **Colour applied.** — e2e/diagramConnectionRendering.spec.ts
- **DIAG-3.8-15** ✅ **`segmentIntersectsRect` true on overlap** — horizontal/vertical/diagonal segments crossing the rect interior all return true (Cohen–Sutherland clip). Also covers `lineIntersectsRect` for multi-segment polylines.
- **DIAG-3.8-16** ✅ **`segmentIntersectsRect` false on clear** — segments entirely above/beside the rect return false; `lineIntersectsRect` false when every segment is outside the padded (4 px) bounds.
- **DIAG-3.8-17** ✅ **`segmentIntersectsRect` endpoints inside count as intersect** — segment with one endpoint inside the rect returns true; segment fully inside also true; segment touching the rect strictly at the edge does NOT (strict `<`/`>` in the outcode function).

## 3.9 Connection Interaction

- **DIAG-3.9-01** ❌ **Endpoint drag activates after 150 ms hold.** Real timers + pointer events; Playwright.
- **DIAG-3.9-02** ❌ **Short click does not activate drag.** Same.
- **DIAG-3.9-03** ❌ **Endpoint snaps to nearest anchor.** Needs real anchor DOM positions.
- **DIAG-3.9-04** ❌ **Endpoint free-floats without nearby anchor.** Same.
- **DIAG-3.9-05** ✅ **Reconnect blocked by constraints** — `validateConnection` rejects cond-in-as-source, cond-out-as-target, and cond-in fan-in. `connectionConstraints.test.ts`.
- **DIAG-3.9-06** 🟡 **Flow-break warning on reconnect** — `FlowBreakWarningModal` itself is covered (DIAG-3.9 component tests); the reconnect-detects-break wiring is canvas-level.
- **DIAG-3.9-07** 🟡 **Cancel in flow-break modal reverts** — modal cancel callback is tested; the caller's revert-on-cancel is canvas-level.
- **DIAG-3.9-08** 🟡 **Confirm in flow-break modal applies** — modal confirm callback tested; apply path is canvas-level.
- **DIAG-3.9-09** ❌ **Segment drag inserts waypoint.** Pointer events.
- **DIAG-3.9-10** ❌ **Segment drag updates existing waypoint.** Same.
- **DIAG-3.9-11** ❌ **Segment drag recorded in history.** Depends on 3.9-09/10.
- **DIAG-3.9-12** ❌ **Anchor popup on hover.** Hover geometry.
- **DIAG-3.9-13** ❌ **Anchor popup drag-from creates connection.** Pointer events.

## 3.10 Flows

- **DIAG-3.10-01** 🟡 **Create flow via Cmd/Ctrl+G** — contiguity check is in `flowUtils` (covered by `flowUtils.test.ts`); the Cmd+G shortcut dispatch is canvas-level.
- **DIAG-3.10-02** 🟡 **Cmd+G rejects non-contiguous selection** — rejection logic is in `flowUtils.isContiguous`; shortcut binding is canvas-level.
- **DIAG-3.10-03** ✅ **`isContiguous` single connection** — input of 0 or 1 connection IDs returns `true` (trivial contiguity).
- **DIAG-3.10-04** ✅ **`isContiguous` chain** — any chain/tree/graph where every pair of consecutive connections shares a node (from or to) returns `true`; branching graphs also qualify.
- **DIAG-3.10-05** ✅ **`isContiguous` disjoint** — two connections with no shared endpoint return `false`; also returns `false` when any referenced connection ID is missing from the connections list.
- **DIAG-3.10-06** ✅ **`orderConnections` topological** — BFS walk starting from a pure-source node (one appearing only as `from` in the selected set) produces source→dest order; cycles fall back to the first connection's `from` node; orphan IDs (missing connections) are appended at the tail.
- **DIAG-3.10-07** ✅ **`findBrokenFlows` on middle-connection delete** — removing the middle of an A→B→C→D flow splits the remainder into disjoint halves → flow reported broken.
- **DIAG-3.10-08** 🟡 **`findBrokenFlows` behaviour on node delete** — documented shrink-to-contiguous-subset (removing c2+c3 from a 3-line flow leaves only c1, which is still contiguous) is NOT flagged as broken. Callers that want "any shrinkage breaks the flow" must enforce that separately. _(Behaviour locked in tests; reopen if product intent differs.)_
- **DIAG-3.10-09** ✅ **`findBrokenFlowsByReconnect` true** — reconnecting c2 from (B→C) to (X→Y) detaches the chain → containing flow listed.
- **DIAG-3.10-10** ✅ **`findBrokenFlowsByReconnect` false** — reconnect that keeps the flow connected (e.g. c2 to B→D still sharing a node with both neighbours) → empty result. `undefined` newFrom/newTo keeps the existing endpoint.
- **DIAG-3.10-11** ❌ **Flow dots animate.** Requires `requestAnimationFrame` loop + real SVG position; Playwright
- **DIAG-3.10-12** ✅ **Flow properties: edit name.** — double-click Name row, type, Enter → `onUpdateFlow(id, {name})` called. _(DiagramProperties.test.tsx)_
- **DIAG-3.10-13** ✅ **Flow properties: edit category.** — double-click Category row, type, blur → `onUpdateFlow(id, {category})` called. _(DiagramProperties.test.tsx)_
- **DIAG-3.10-14** ✅ **Flow properties: delete flow.** — clicking "Delete Flow" calls `onDeleteFlow(id)`. _(DiagramProperties.test.tsx)_
- **DIAG-3.10-15** ✅ **DiagramProperties — flat grouping.** — when no flow has a category, flows render as a plain list with no group headers. _(DiagramProperties.test.tsx)_
- **DIAG-3.10-16** ✅ **DiagramProperties — grouped.** — when flows have categories, category names appear as section headers above their flows. _(DiagramProperties.test.tsx)_
- **DIAG-3.10-17** ✅ **Hover flow dims others.** — e2e/diagramConnectionRendering.spec.ts
- **DIAG-3.10-18** ✅ **`flowOrderData` null when no active flow** — no flow selected or hovered → memo returns null → no glows rendered.
- **DIAG-3.10-19** ✅ **Single-path flow: one start, one end** — linear A→B→C flow → A gets green glow (source: appears as `from`, never as `to`), C gets red glow (sink: appears as `to`, never as `from`), B has no glow.
- **DIAG-3.10-20** ✅ **Multiple sources get green glow** — fan-in flow where A→C and B→C → both A and B classified as sources and glow green; C classified as sink and glows red.
- **DIAG-3.10-21** ✅ **Multiple sinks get red glow** — fan-out flow where A→B and A→C → A glows green; both B and C classified as sinks and glow red.
- **DIAG-3.10-22** ✅ **Middle nodes (appear as both `from` and `to`) have no glow** — in A→B→C, node B appears in both sets → role `middle` → no colored shadow.
- **DIAG-3.10-23** ✅ **Condition node (diamond) shows glow** — `ConditionElement` honours `flowRole` identically to `Element`.
- **DIAG-3.10-24** ✅ **Glows disappear when flow deselected** — clearing selection removes all role glows.
- **DIAG-3.10-25** ✅ **Labels hidden for non-flow connections** — when a flow is active, connection labels not in the flow are omitted from the overlay SVG. Covered by `e2e/flowHighlight.spec.ts`.

### Flow Document Attachment

| ID | Status | Scenario |
|----|--------|----------|
| DIAG-3.10-26 | ✅ | Attach existing doc to flow — appears in Documents section of FlowProperties — `FlowProperties.test.tsx` (onAttach called + doc filename rendered) |
| DIAG-3.10-27 | ✅ | Attach same doc twice — second attach is a no-op (no duplicate in list) — `useDocuments.test.ts` (attachDocument idempotent) |
| DIAG-3.10-28 | 🟡 | Create & attach new — file created, attached, "Edit now" checked opens pane — `CreateAttachDocModal.test.tsx` covers modal; file-write + pane navigation is e2e |
| DIAG-3.10-29 | ✅ | Create & attach new — "Edit now" unchecked, pane not opened — `CreateAttachDocModal.test.tsx` (onConfirm with editNow=false) |
| DIAG-3.10-30 | 🟡 | Detach doc — disappears from Documents section — modal interaction covered by `FlowProperties.test.tsx` + `DetachDocModal.test.tsx`; DOM removal is e2e |
| DIAG-3.10-31 | ✅ | Detach doc with no other refs — "Also referenced by" section absent — `DetachDocModal.test.tsx` |
| DIAG-3.10-32 | ✅ | Detach doc with other attachments — lists them deduplicated — `DetachDocModal.test.tsx` |
| DIAG-3.10-33 | ✅ | Detach doc with wiki-link backlinks — lists them deduplicated — `DetachDocModal.test.tsx` |
| DIAG-3.10-34 | 🟡 | Detach + delete — file removed from vault — `DetachDocModal.test.tsx` (alsoDelete=true); actual deletion is e2e |
| DIAG-3.10-35 | 🟡 | Detach + delete — wiki-links removed from referencing docs — `wikiLinkParser.test.ts` covers stripWikiLinksForPath; full delete workflow (FS + link index) is e2e |
| DIAG-3.10-36 | ✅ | Danger warning shown when "Also delete" checked, hidden when unchecked — `DetachDocModal.test.tsx` |
| DIAG-3.10-37 | ✅ | Documents section hidden in readOnly mode — no attach/detach buttons — `FlowProperties.test.tsx` (readOnly prop) |
| DIAG-3.10-38 | ✅ | Attach document — appears as a named entry in the history panel |
| DIAG-3.10-39 | ✅ | Detach document — appears as a named entry in the history panel |
| DIAG-3.10-40 | ✅ | Undo attach — document disappears from the flow's Documents section |
| DIAG-3.10-41 | ✅ | Redo attach — document reappears in the flow's Documents section |
| DIAG-3.10-42 | ✅ | Create-and-attach — appears as a named entry in the history panel |

## 3.11 Selection

- **DIAG-3.11-01** ✅ **Click selects single node** — `selectionUtils.test.ts` (`toggleItemInSelection` empty→single); also e2e/diagramGoldenPath.spec.ts (ring-2 class visible).
- **DIAG-3.11-02** ✅ **Click selects single layer** — same test file.
- **DIAG-3.11-03** ✅ **Click selects single line** — same test file.
- **DIAG-3.11-04** ✅ **Ctrl/Cmd+click adds to selection** — `selectionUtils.test.ts` (toggle node + node → multi-node; different layer → multi-layer).
- **DIAG-3.11-05** ✅ **Ctrl/Cmd+click toggles off** — `selectionUtils.test.ts` (multi-node minus one → single node).
- **DIAG-3.11-06** ✅ **Rubber-band selects intersecting nodes** — `selectionUtils.test.ts` (`resolveRectangleSelection`).
- **DIAG-3.11-07** ✅ **Rubber-band promotes mixed types** — multi-layer promotion + line-only cases covered.
- **DIAG-3.11-08** ❌ **Drag threshold = 25 px.** Pointer events + timing; Playwright
- **DIAG-3.11-09** 🟡 **Selection cleared on Escape.** Setting selection to null is a trivial setter; the keybind → setter wiring lives in the canvas keyboard handler (Playwright coverage).
- **DIAG-3.11-10** ✅ **Canvas click deselects flow.** Selecting a flow from Architecture panel then clicking empty canvas clears selection and flow highlight. Fixed by clearing `expandedFlowId` in `DiagramProperties` when `activeFlowId` becomes undefined, and adding safety clause in `useSelectionRect` for stale-pendingSelection edge case.

## 3.12 Context Menu

- **DIAG-3.12-01** ✅ **Canvas right-click → Add Element, Add Layer** — `target.type === "canvas"` renders exactly those two items.
- **DIAG-3.12-02** ✅ **Layer right-click → Add Element (in layer), Delete Layer** — `target.type === "layer"` renders both items; Delete is enabled (not gated by children count in this component).
- **DIAG-3.12-03** ✅ **Element right-click → Delete Element** — `target.type === "element"` renders only that single destructive item (red).
- **DIAG-3.12-04** ✅ **Add Element avoids collisions** — `handleAddElement` shifts Y down when an existing node overlaps the placement point. _(useContextMenuActions.test.ts)_
- **DIAG-3.12-05** ✅ **Add Element auto-assigns layer** — when click falls inside a `RegionBounds`, new node gets `layer = region.id`; outside all regions → `layer = ""`. _(useContextMenuActions.test.ts)_
- **DIAG-3.12-06** ✅ **Add Element grid-snapped** — final x/y are multiples of `GRID_SIZE`. _(useContextMenuActions.test.ts)_
- **DIAG-3.12-07** ✅ **Add Element selects new node** — `setSelection` called with `{ type:"node", id:<new el- id> }`. _(useContextMenuActions.test.ts)_
- **DIAG-3.12-08** ✅ **Add Layer non-overlapping** — layer placed with snapped coordinates (verified via `setLayerManualSizes`). _(useContextMenuActions.test.ts)_
- **DIAG-3.12-09** ✅ **Add Layer unique id** — each call generates a distinct `ly-*` id. _(useContextMenuActions.test.ts)_
- **DIAG-3.12-10** ✅ **Menu closes on Escape** — window `keydown` (capture phase) handler invokes `onClose` for `Escape` key.
- **DIAG-3.12-11** ✅ **Menu closes on outside click** — window `mousedown` outside the menu ref triggers `onClose`; mousedown inside does NOT (items call `e.stopPropagation`).

Additional coverage in [FlowBreakWarningModal.test.tsx](../src/app/knowledge_base/features/diagram/components/FlowBreakWarningModal.test.tsx): DIAG-3.9-06/07/08 flow-break warning flow — heading pluralisation, Cancel/Continue callbacks, backdrop click; [DocInfoBadge.test.tsx](../src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx): single-vs-multiple dropdown, toggle, navigation; [Layer.test.tsx](../src/app/knowledge_base/features/diagram/components/Layer.test.tsx): render + isSelected/dimmed styles + drag/resize callbacks (DIAG-3.7); [FlowDots.test.tsx](../src/app/knowledge_base/features/diagram/components/FlowDots.test.tsx): DIAG-3.10-11 animation duration + visibility gating (isLive, hovered, selected, dragging).

## 3.13 Properties Panel

### 3.13.a Container
- **DIAG-3.13-01** ✅ **Collapse / expand panel** — toggle button updates `properties-collapsed` in localStorage; verified end-to-end. — covered at e2e layer by `e2e/diagramGoldenPath.spec.ts` (toggle + persistence); unit-layer smoke in `DiagramView.test.tsx` asserts mount does not clobber the key.
- **DIAG-3.13-02** ✅ **Tab switching reflects selection** — PropertiesPanel dispatches on `selection.type`; full switch coverage requires the full panel mount (deferred to integration). _(unit: `PropertiesPanel.test.tsx`)_
- **DIAG-3.13-03** 🟡 **Read-only disables editors** — verified at LayerProperties level: readOnly=true strictly reduces row count (ColorSchemeRow hidden, EditableIdRow/EditableRow replaced with plain Row). Analogous for Node/Line panels (not individually covered here).

### 3.13.b Node properties
- **DIAG-3.13-04** ✅ **Label input edits.** Double-click opens input; Enter commits via `onUpdate`; Escape cancels; read-only hides editable row. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-05** ✅ **Sublabel input edits.** Double-click opens input; blur commits new sub via `onUpdate`. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-06** 🟡 **Icon picker lists 41 icons** — `getIconNames` returns 41 (DIAG-3.4-01); the picker's grid render is canvas-level.
- **DIAG-3.13-07** ✅ **Icon picker sets icon.** Open picker → click icon → `onUpdate` called with the icon component; read-only mode: picker opens but click is a no-op. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-08** ✅ **Type classifier updates** — `AutocompleteInput` commits on Enter / blur / suggestion-click; rejects via onCommit returning false (error-border state); Escape cancels; external prop changes re-sync the draft. Full NodeProperties integration deferred.
- **DIAG-3.13-09** ✅ **Layer assignment dropdown.** Layer title shown as text; double-click enters edit; Enter commits layer id via `onUpdate`. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-10** ✅ **Colour editors.** Fill/Border/Text `ColorRow` inputs carry the node's colour values. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-11** ✅ **Rotation control.** Condition nodes render 0°/90°/180°/270° preset buttons; click fires `onUpdate` with `rotation`. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-12** ✅ **Condition exit count editor.** "Add Out Anchor" button increments `conditionOutCount` via `onUpdate`. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-13** ✅ **Condition size editor.** Size buttons 1–5 rendered; click fires `onUpdate` with `conditionSize`. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-14** ✅ **Incoming connections list.** "In" row present when node has incoming connections. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-15** ✅ **Outgoing connections list.** "Out" row present when node has outgoing connections. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-16** 🟡 **Via-condition paths.** Logic is covered by the via-condition `useMemo` inside `NodeProperties`; rendering is tested implicitly via the Connections section. Full click-through deferred to Playwright.
- **DIAG-3.13-17** ✅ **Member flows list.** "Flows" section rendered when node participates in a flow; hidden otherwise. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-18** ✅ **Backlinks list.** `DocumentsSection` shows `References (N)` and backlink filenames; omitted when prop absent. _(unit: `NodeProperties.test.tsx`)_
- **DIAG-3.13-19** 🟡 **Attach document opens DocumentPicker** — `DocumentPicker` component itself is tested (FS-2.5 in `DocumentPicker.test.tsx`); the attach-button wiring is canvas-level.

### 3.13.c Layer properties
- **DIAG-3.13-20** ✅ **Title edit** — `EditableRow` for "Label" wires to `onUpdate(id, { title })` when the field commits (tested indirectly via render snapshot + edit-row infrastructure).
- **DIAG-3.13-21** 🟡 **Colour edits apply** — `ColorRow` onChange propagates through LayerProperties to `onUpdate(id, {bg|border|textColor})`. jsdom's color input change handlers don't fully exercise the native picker; integration test deferred.
- **DIAG-3.13-22** ✅ **Children list scoped to this layer** — nodes whose `.layer !== id` (e.g. an orphan in "L2") are excluded from the "Elements" list; only same-layer children appear.
- **DIAG-3.13-23** 🚫 **Manual-size override toggle** — the UI lives inside the panel's Layout section. Not yet implemented as a direct toggle; region shows static Position + Size fields from measured bounds.

### 3.13.d Line properties
- **DIAG-3.13-24** ✅ **Label edit.** Double-click opens input; Enter commits via `onUpdate`; `LineProperties.test.tsx`.
- **DIAG-3.13-25** ✅ **Colour display.** `ColorRow` renders a color swatch with the connection's `color` value. _(unit: `LineProperties.test.tsx`)_
- **DIAG-3.13-26** 🚫 **Per-connection curve algorithm dropdown.** `LineProperties` has no per-connection curve setting; the global default is DIAG-3.13-32.
- **DIAG-3.13-27** ✅ **Bidirectional toggle.** Click sets `biDirectional` to `true`/`false` via `onUpdate`. _(unit: `LineProperties.test.tsx`)_
- **DIAG-3.13-28** ✅ **Connection type toggle sync/async.** Sync/Async buttons toggle `connectionType` via `onUpdate`. _(unit: `LineProperties.test.tsx`)_
- **DIAG-3.13-29** ✅ **Flow duration input.** Double-click `DurationRow`; Enter commits numeric value via `onUpdate`. _(unit: `LineProperties.test.tsx`)_
- **DIAG-3.13-30** ✅ **Source / dest displayed.** From/To node labels shown; falls back to IDs when node missing. _(unit: `LineProperties.test.tsx`)_

### 3.13.e Architecture (root)
- **DIAG-3.13-31** ✅ **Title editable.** Double-click opens input; Enter commits via `onUpdateTitle`. _(unit: `DiagramProperties.test.tsx`)_
- **DIAG-3.13-32** ✅ **Default line algorithm dropdown.** Click opens Orthogonal/Bezier/Straight options; selection fires `onUpdateLineCurve`. _(unit: `DiagramProperties.test.tsx`)_
- **DIAG-3.13-33** ✅ **Layers list.** ExpandableListRow renders with "Layers" label. _(unit: `DiagramProperties.test.tsx`)_
- **DIAG-3.13-34** ✅ **Elements list.** ExpandableListRow renders with "Elements" label. _(unit: `DiagramProperties.test.tsx`)_
- **DIAG-3.13-35** ✅ **Types tree — distinct node types grouped** — `typeUtils.test.ts` (`getDistinctTypes` returns sorted unique types).
- **DIAG-3.13-36** ✅ **Select All per type** — `typeUtils.test.ts` (`getNodesByType` filters exactly); the click→multi-node dispatch is canvas-level.
- **DIAG-3.13-37** ✅ **Flows panel.** `DiagramProperties` flow list, toggle, edit, delete, and category grouping all covered by DIAG-3.10-12..16 + DIAG-3.11-10 in `DiagramProperties.test.tsx`.
- **DIAG-3.13-38** ✅ **Document backlinks section** — `DocumentsSection` renders every backlink as `<basename>` (or `<basename> #section`), clicking fires `onOpenDocument(sourcePath)`. Title shows `References (N)`; empty state: `"No documents reference this diagram"` + wiki-link help text.

### 3.13.f DocumentsSection
- **DIAG-3.13-39** 🟡 **Lists attached docs** — `DocumentsSection` component is tested at the component level in `DocumentsSection.test.tsx`; wiring into the properties panel is canvas-level.
- **DIAG-3.13-40** 🟡 **Click opens doc in other pane** — component's `onDocumentClick` callback tested; pane routing is canvas-level.

### 3.13.g DiagramView lifecycle (unit layer)
- **DIAG-3.13-41** ✅ **Component mounts without throwing** — DiagramView renders with minimal stub props in JSDOM. — `DiagramView.test.tsx`
- **DIAG-3.13-42** ✅ **`onDiagramBridge` called on mount** — bridge effect fires on first render and publishes the bridge object to the shell. — `DiagramView.test.tsx`
- **DIAG-3.13-43** ✅ **activeFile rerender is safe** — swapping the `activeFile` prop from null → a path does not throw. — `DiagramView.test.tsx`

## 3.14 Keyboard Shortcuts

- **DIAG-3.14-01** ✅ **Escape deselects.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-02** ✅ **Escape closes context menu.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-03** ✅ **Delete / Backspace deletes selection.** Node removed from DOM and from saved JSON on Delete key. — e2e/diagramGoldenPath.spec.ts
- **DIAG-3.14-04** ✅ **Delete with flow impact → warning modal.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-05** ✅ **Cmd/Ctrl+G creates flow.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-06** 🟡 **Cmd/Ctrl+Z undoes** — `useActionHistory` undo path tested (HOOK-6.1-05); shortcut binding is canvas-level.
- **DIAG-3.14-07** 🟡 **Cmd/Ctrl+Shift+Z redoes** — `useActionHistory` redo path tested (HOOK-6.1-06); shortcut binding is canvas-level.
- **DIAG-3.14-08** ✅ **Cmd/Ctrl+Shift+R toggles read-only.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-09** ✅ **Shortcuts disabled in `<input>`.** — e2e/diagramKeyboard.spec.ts
- **DIAG-3.14-10** ✅ **Shortcuts disabled in `contenteditable`.** — e2e/diagramKeyboard.spec.ts

## 3.15 Auto-Arrange, Grid Snap, Collision

### 3.15.a Grid snap (existing test — `utils/gridSnap.test.ts`)
- **DIAG-3.15-01** ✅ **Snaps to nearest grid multiple** — `snapToGrid(14)` → 10; `(15)` → 20; `(20)` → 20.
- **DIAG-3.15-02** ✅ **Uses `GRID_SIZE` default** — `snapToGrid(3)` → 0.
- **DIAG-3.15-03** ✅ **Accepts custom grid size** — `snapToGrid(7, 5)` → 5; `(8, 5)` → 10.
- **DIAG-3.15-04** ✅ **Handles negative values** — `(-14)` → −10; `(-15)` → −10; `(-16)` → −20.
- **DIAG-3.15-05** ✅ **Zero input → 0** — `snapToGrid(0)` → 0.
- **DIAG-3.15-06** ❌ **Drag integrates snap.** Integration at the canvas level (Playwright); `snapToGrid` itself is covered by DIAG-3.15-01..05.

### 3.15.b Auto-arrange
- **DIAG-3.15-07** ✅ **Topological sort** — `autoArrange.test.ts` verifies chain and fan-in DAGs land in ascending rank order.
- **DIAG-3.15-08** ✅ **Rank spacing = 180 px** — `autoArrange.test.ts` checks `yb - ya === 180` in TB.
- **DIAG-3.15-09** 🟡 **Node spacing = 40 px** — constant (`NODE_SPACING`) baked into the layout; the exact intra-rank cursor step is implicit in TB/LR tests but not a dedicated assertion.
- **DIAG-3.15-10** ✅ **LR direction rotates layout** — `autoArrange.test.ts` verifies x-axis rank separation in LR + same-rank siblings on y-axis.
- **DIAG-3.15-11** 🟡 **Barycenter pass reduces crossings** — the implementation runs barycenter; formally asserting "crossings ≤ prior" would need a pre-/post- comparison fixture, deferred.
- **DIAG-3.15-12** ✅ **Output grid-snapped** — `autoArrange.test.ts` asserts every output coord equals `snapToGrid(coord)`.

### 3.15.c Collision clamps
- **DIAG-3.15-13** ✅ **`clampNodePosition` — no overlap** — with zero siblings, the raw `(x,y)` is returned verbatim. With siblings, returns a nearby (edge-snapped or binary-searched) position that leaves `NODE_GAP` clearance.
- **DIAG-3.15-14** ✅ **`clampNodePosition` — overlap clamp** — when the raw target would overlap a sibling, the returned position has no overlap after applying the `NODE_GAP` expansion.
- **DIAG-3.15-15** ✅ **`clampMultiNodeDelta` — group stays together** — returned `{dx,dy}` is applied uniformly to every dragged node (same delta, internal offsets preserved). Empty dragged list or empty siblings returns raw delta.
- **DIAG-3.15-16** ✅ **`clampMultiNodeDelta` — blocked at group bbox collision** — when any single dragged node's path crosses a sibling, the delta is clamped so that NO dragged node overlaps any sibling at the chosen delta.
- **DIAG-3.15-17** ✅ **`findNonOverlappingLayerPosition`** — returns raw position if no obstacles or if raw is already valid; otherwise picks the closest safe edge-candidate (above/below/left/right of each obstacle with `LAYER_GAP`). Zero-width empty obstacles are filtered.
- **DIAG-3.15-18** ✅ **`clampElementToAvoidLayerCollision` fast path** — when the predicted layer bounds at the raw element position overlap no sibling layer and no existing nodes, returns the input unchanged (no `layerShift` flag). _Strategy A/B paths require property-panel-level integration tests; not covered here._
- **DIAG-3.15-19** ✅ **`clampLayerDelta`** — returns raw delta when no obstacles (or all obstacles are self/empty); otherwise the clamped delta leaves a gap of at least `LAYER_GAP` to every solid sibling.

## 3.16 Undo / Redo

- **DIAG-3.16-01** 🟡 **Snapshot on drag end** — `recordAction` append is tested (HOOK-6.1 suite); the drag-end call site is canvas-level.
- **DIAG-3.16-02** 🟡 **Snapshot on delete.** Same — append is tested; call site is canvas-level.
- **DIAG-3.16-03** 🟡 **Snapshot on connection edit.** Same.
- **DIAG-3.16-04** ✅ **Undo restores prior state** — `useActionHistory.test.ts` (HOOK-6.1-05 undo walks back through history).
- **DIAG-3.16-05** ✅ **Redo reapplies** — `useActionHistory.test.ts` (HOOK-6.1-06 redo re-applies undone entry).
- **DIAG-3.16-06** ✅ **Max 100 entries** — cap is 101 (100 recent + 1 pinned saved entry when pruning occurs); covered by HOOK-6.1-05/12 in `useActionHistory.test.ts`.
- **DIAG-3.16-07** ✅ **Sidecar file `.<name>.history.json`** — `useActionHistory.test.ts` HOOK-6.1-09.
- **DIAG-3.16-08** ✅ **FNV-1a checksum detects external change** — checksum match restores history (HOOK-6.1-07) and mismatch triggers fresh start (HOOK-6.1-08); both paths directly covered in `useActionHistory.test.ts`.
- **DIAG-3.16-09** ✅ **`goToSaved` reverts to last save** — public API covered by HOOK-6.1-06 in `useActionHistory.test.ts`; UI "revert" button wiring remains canvas-level.
- **DIAG-3.16-10** ✅ **HistoryPanel lists entries.** Entries render in reverse (newest first); counter badge; "saved" badge; Undo/Redo disabled state; collapsed hides list. _(unit: `HistoryPanel.test.tsx`)_
- **DIAG-3.16-11** ✅ **HistoryPanel click reverts.** Click entry fires `onGoToEntry(index)`; Undo/Redo call handlers; readOnly disables entry buttons. _(unit: `HistoryPanel.test.tsx`)_
- **DIAG-3.16-12** ✅ **Undo/redo respects read-only.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.16-13** ✅ **HistoryPanel relativeTime buckets.** "just now" (<5 s), "Xs ago" (<60 s), "Xm ago" (<1 h), "Xh ago" (<24 h), "Xd ago" (≥24 h). _(unit: `HistoryPanel.test.tsx`)_
- **DIAG-3.16-14** ✅ **HistoryPanel collapse toggle.** Clicking the header button calls `onToggleCollapse`. _(unit: `HistoryPanel.test.tsx`)_

## 3.17 Read-Only Mode

- **DIAG-3.17-01** 🟡 **Toggle via PaneHeader lock** — PaneHeader read-mode toggle is covered by SHELL-1.6-02; the canvas-side effect (disabled interactions) is canvas-level.
- **DIAG-3.17-02** ✅ **Toggle via Cmd+Shift+R.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-03** ✅ **Node drag disabled.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-04** ❌ **Layer drag disabled.** Same.
- **DIAG-3.17-05** ❌ **Endpoint / segment drag disabled.** Same.
- **DIAG-3.17-06** ✅ **Delete key does nothing.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-07** ✅ **Context menu suppressed or read-only variant.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-08** ✅ **Properties panel inputs disabled.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-09** ✅ **Navigation (click → select) still works.** — e2e/diagramReadOnly.spec.ts
- **DIAG-3.17-10** 🧪 **E key toggles from read to edit mode (and back).** — e2e/readModeEscape.spec.ts
- **DIAG-3.17-11** 🚫 **E key does not fire when focus is in contenteditable / input.** — E key input guard is unit-tested in hook; no e2e fixture for focused diagram text input
- **DIAG-3.17-12** 🧪 **First keystroke in read mode shows toast "Press E to edit".** — e2e/readModeEscape.spec.ts
- **DIAG-3.17-13** 🧪 **Newly created diagram file opens in edit mode.** — e2e/readModeEscape.spec.ts

## 3.18 Document Integration

- **DIAG-3.18-01** ✅ **DocInfoBadge visible when doc attached** — covered by `DocInfoBadge.test.tsx`
- **DIAG-3.18-02** ✅ **DocInfoBadge hidden when none** — same test file.
- **DIAG-3.18-03** 🟡 **Click badge opens attached doc** — `DocInfoBadge.test.tsx` asserts `onClick` fires with the right doc; pane routing is canvas-level.
- **DIAG-3.18-04** 🟡 **`attachDocument` persists in diagram JSON** — the `documents` field round-trips via DIAG-3.19 save/load; the attach flow is canvas-level.
- **DIAG-3.18-05** 🟡 **`detachDocument` removes reference.** Same — data shape covered via persistence; detach call site is canvas-level.
- **DIAG-3.18-06** ✅ **`getDocumentsForEntity` filters by entity type + id** — `documentAttachments.test.ts` covers match/no-match cases, multi-entity attachments, type-mismatch leakage, and empty inputs.
- **DIAG-3.18-07** ✅ **`hasDocuments` returns true when any exist** — `documentAttachments.test.ts` covers every `attachedTo.type` variant (`node` / `connection` / `flow` / `root`) and the undefined / empty-array paths.

## 3.19 Persistence

- **DIAG-3.19-01** ✅ **`serializeNodes` icon refs → names** — the `displayName`/`name` of the icon component is stored as the serialized `icon` string (e.g. `Database` → `"Database"`).
- **DIAG-3.19-02** ✅ **`loadDiagramFromData` names → icon refs** — `icon: "Server"` deserializes to the `Server` lucide component.
- **DIAG-3.19-03** ✅ **Unknown icon name on load** — missing name falls back to the `Database` component (no crash, no undefined).
- **DIAG-3.19-04** ✅ **Legacy Tailwind colour class migrated** — `bg-[#aabbcc]` → `#aabbcc` via `extractHex` regex on every layer's `bg`/`border` at load time.
- **DIAG-3.19-05** ✅ **Save round-trip preserves layers** — title, layer array, bg/border colours, and text colour survive `saveDiagram` → `loadDiagram`.
- **DIAG-3.19-06** ✅ **Save round-trip preserves connections + waypoints** — `waypoints` array (and every other Connection field) persists verbatim.
- **DIAG-3.19-07** ✅ **Save round-trip preserves flows** — full `FlowDef[]` preserved.
- **DIAG-3.19-08** ✅ **Save includes manual layer sizes** — `layerManualSizes` record round-trips exactly.
- **DIAG-3.19-09** 🟡 **Measured node sizes** — `serializeNodes` writes `w` only (height is recomputed from `w` on load via `getNodeHeight`). Full measured-size persistence requires a separate `nodeMeasuredSizes` map; not currently serialized. _(Behaviour lock; revisit if measured heights are needed post-reload.)_
- **DIAG-3.19-10** ✅ **Draft written on each edit** — `saveDraft(fileName, …)` writes to the scoped `knowledge-base-draft:<fileName>` key.
- **DIAG-3.19-11** ✅ **Draft reachable by subsequent load** — `loadDraft(fileName)` returns the stored `DiagramData` (or `null` if missing / corrupted).
- **DIAG-3.19-12** ✅ **Save clears draft** — `clearDraft(fileName)` removes that file's draft; `hasDraft` correctly reports presence.
- **DIAG-3.19-13** ✅ **`listDrafts` returns all scoped drafts** — scans `localStorage.key(i)` for the scoped prefix and returns the file-name tails; invisible across scope switches.
- **DIAG-3.19-14** ✅ **`clearDraft` removes only the named file's draft** — other files are untouched.
- **DIAG-3.19-15** ✅ **`isDiagramData` shape guard strengthened (Phase 5b, 2026-04-19)** — requires `title: string`, `Array.isArray` on each of `layers`/`nodes`/`connections`, and — if present — rejects unknown `lineCurve` values, non-array `flows`/`documents`, and non-object `layerManualSizes`. Closes the gap where a corrupt vault used to deserialise and surface runtime errors in router/flow code.

Additional behaviours verified in [persistence.test.ts](../src/app/knowledge_base/shared/utils/persistence.test.ts): `createEmptyDiagram`, `loadDefaults`, `savePaneLayout`/`loadPaneLayout` (incl. `lastClosedPane` + corrupt-JSON tolerance), `migrateViewport`, `clearViewport`, `cleanupOrphanedData`, and graceful `QuotaExceededError` handling in both `saveDiagram` and `saveDraft`.

## 3.20 Doc Preview Modal

| ID | Status | Scenario |
|----|--------|----------|
| DIAG-3.20-01 | 🟡 | Click attached flow doc — DocPreviewModal opens — `FlowProperties.test.tsx` (onPreview fires on click); modal rendering covered by `DocPreviewModal.test.tsx`; wiring callback → state → modal visible is e2e |
| DIAG-3.20-02 | ❌ | Click wiki-link backlink in any entity panel — DocPreviewModal opens |
| DIAG-3.20-03 | ✅ | Preview modal renders markdown matching doc pane styles |
| DIAG-3.20-04 | ✅ | Escape key closes preview modal |
| DIAG-3.20-05 | ✅ | Backdrop click closes preview modal |
| DIAG-3.20-06 | ✅ | "Open in pane" opens doc pane and closes modal |
| DIAG-3.20-07 | ❌ | Diagram canvas is blurred and non-interactive while modal is open |
| DIAG-3.20-08 | ✅ | Error state shown when document cannot be read |
| DIAG-3.20-09 | ✅ | Entity name badge shown in header when context is known (flow name) |

Additional unit coverage in [DocPreviewModal.test.tsx](../src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx): DIAG-3.20-08 (shows spinner + error states), DIAG-3.20-03 (renders markdown content), DIAG-3.20-04 (Escape closes), DIAG-3.20-05 (backdrop click closes), DIAG-3.20-06 ("Open in pane" callback), DIAG-3.20-09 (entity name badge), filename in header.

## 3.21 Diagram File Watcher
`features/diagram/hooks/useDiagramFileWatcher.ts`

| ID | Status | Scenario |
|----|--------|----------|
| DIAG-3.21-01 | ✅ | No-op when on-disk checksum matches last-known checksum — `checkForChanges` exits early without calling `applySnapshot` |
| DIAG-3.21-02 | ✅ | Silent reload when diagram is clean and disk changed — records "Reloaded from disk" history entry, moves saved point, calls `applySnapshot` |
| DIAG-3.21-03 | ✅ | Conflict detection when diagram is dirty and disk changed — sets `conflictSnapshot`, does not modify history or apply snapshot |
| DIAG-3.21-04 | ✅ | `handleReloadFromDisk` clears conflict and applies disk snapshot — records history, moves saved point, applies snapshot |
| DIAG-3.21-05 | ✅ | `handleKeepEdits` dismisses the conflict banner and suppresses re-prompting for the same disk checksum via `dismissedChecksumRef` |
