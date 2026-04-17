# Test Cases — Diagram Editor

> Mirrors §3 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 3.1 Data Model (`types.ts`)

- **DIAG-3.1-01** ❌ **NodeData serialisable** — round-trip an instance through `JSON.stringify` / `JSON.parse` and compare structural equality.
- **DIAG-3.1-02** ❌ **LineCurveAlgorithm union** — only `"orthogonal"`, `"bezier"`, `"straight"` are accepted by `ArchitectureProperties` dropdown.
- **DIAG-3.1-03** ❌ **Selection union shapes** — each of the 7 selection kinds (`node`, `multi-node`, `layer`, `multi-layer`, `line`, `multi-line`, `flow`) constructs a valid object per its type.
- **DIAG-3.1-04** ❌ **FlowDef optional category** — `FlowDef` without `category` is still valid (rendered under "Uncategorized").

## 3.2 Canvas & Viewport

- **DIAG-3.2-01** ❌ **Default 800 px patches** — new canvas renders exactly the number of 800 × 800 patches needed to wrap default content.
- **DIAG-3.2-02** ❌ **Patch grows on content** — drag a node past the current right edge → a new patch appears; `fitToContent` called.
- **DIAG-3.2-03** ❌ **Patch shrinks when content removed** — delete the rightmost content → patches shrink back.
- **DIAG-3.2-04** ❌ **Zoom in via wheel/pinch** — pinch-zoom → zoom level increases; content scales.
- **DIAG-3.2-05** ❌ **Zoom out** — pinch out → zoom level decreases; content scales down.
- **DIAG-3.2-06** ❌ **Auto-fit on initial open** — open diagram with content offscreen → after mount, content is in view (zoom-to-content).
- **DIAG-3.2-07** ❌ **Viewport persisted per diagram** — zoom + scroll → reload → restored for _that_ diagram; different diagram has its own viewport.
- **DIAG-3.2-08** ❌ **2000 px viewport padding guard** — content at far edges remains reachable; no clipping at viewport boundary within pad.
- **DIAG-3.2-09** ❌ **Client→world coord transform** — `clientToWorld(500, 300)` with `{ scroll: (100, 100), zoom: 2 }` → returns `(200, 100)`.
- **DIAG-3.2-10** ❌ **Canvas click deselects** — click empty canvas with a selected node → selection becomes `null`.
- **DIAG-3.2-11** ❌ **Pan by drag on empty canvas** — middle-click or space+drag → canvas scrolls; selection unchanged.

## 3.3 Minimap

- **DIAG-3.3-01** ❌ **Renders all layers & nodes** — diagram with 3 layers & 10 nodes → minimap draws 13 shapes.
- **DIAG-3.3-02** ❌ **Viewport rect visible** — minimap overlays a rect representing the current canvas viewport.
- **DIAG-3.3-03** ❌ **Drag viewport rect pans canvas** — drag rect to the right → canvas scrolls right proportionally.
- **DIAG-3.3-04** ❌ **Aspect-ratio preserved** — minimap scale preserves content aspect ratio; no horizontal stretch.
- **DIAG-3.3-05** ❌ **Live scroll sync** — scroll canvas → minimap rect repositions without lag.
- **DIAG-3.3-06** ❌ **Minimap width = 200 px** — computed style matches.

## 3.4 Icon Registry

- **DIAG-3.4-01** ✅ **`getIconNames` length = 41** — registry is exactly 41 unique, non-empty string keys.
- **DIAG-3.4-02** ✅ **`getIcon('Database')` returns a component** — direct lookup returns the `Database` lucide component (also verified for `Server`).
- **DIAG-3.4-03** ✅ **`getIcon('Unknown')` returns undefined** — unknown name (including empty string) returns `undefined` without throwing.
- **DIAG-3.4-04** ✅ **`getIconName` round-trip** — round-trips cleanly for every registry key, including lucide legacy aliases (`BarChart`, `Fingerprint`). `getIconName` reverse-looks-up the registry instead of reading `displayName`, so the name written on save is always a valid registry key on load.
- **DIAG-3.4-05** ✅ **`getIconName` for an unregistered component** — any component not in the registry (e.g. a plain object or arbitrary function cast as `ComponentType`) returns the sentinel `"Unknown"`.

## 3.5 Nodes

- **DIAG-3.5-01** ❌ **Create node via context menu** — right-click canvas → Add Element → node created at cursor position; selected.
- **DIAG-3.5-02** ❌ **New node default width = 210** — created node has `w === DEFAULT_NODE_WIDTH`.
- **DIAG-3.5-03** ❌ **Icon, label, sublabel render** — node with all three has them visible.
- **DIAG-3.5-04** ❌ **Custom colours render** — node with `bgColor: "#ff0000"` → background computed style is that colour (or the migrated hex).
- **DIAG-3.5-05** ❌ **Rotation applied** — `rotation: 90` → transform: `rotate(90deg)` on the rendered element.
- **DIAG-3.5-06** ❌ **Single-node drag moves node** — drag node 50 px right → `x` increases by 50 (modulo grid snap).
- **DIAG-3.5-07** ❌ **Single-node drag respects layer bounds** — try to drag out of layer → clamped to within layer + padding.
- **DIAG-3.5-08** ❌ **Multi-node drag moves all** — select 3 nodes, drag → all move together; internal offsets unchanged.
- **DIAG-3.5-09** ❌ **Multi-node drag clamped by group bbox** — group cannot overlap another layer's nodes at the same level.
- **DIAG-3.5-10** ❌ **Double-click label → edit** — double-click → label becomes editable input; caret in label.
- **DIAG-3.5-11** ❌ **Enter commits label** — edit, Enter → label updated; dirty.
- **DIAG-3.5-12** ❌ **Escape reverts label** — edit, Esc → original label restored; not dirty from this action.
- **DIAG-3.5-13** ❌ **Raw vs snapped position visual** — during drag, visual tracks raw position; on release, snaps to grid.

## 3.6 Condition Nodes

- **DIAG-3.6-01** ✅ **Condition shape renders** — `getConditionPath` returns `M …top L …right L 0 h Z` for `outCount ≤ 2` (plain triangle) and switches to `M …top L …right A R R 0 0 1 …left Z` (triangle + circular arc base) for `outCount ≥ 3`.
- **DIAG-3.6-02** ❌ **Size range 1–5** — only `size` values in `[1,5]` accepted; outside values clamped or rejected.
- **DIAG-3.6-03** ❌ **Exits range 1–5** — same for `exits`.
- **DIAG-3.6-04** ✅ **`cond-in` single input** — `getConditionAnchors` always emits exactly one `anchorType: 'in'` anchor with id `cond-in`.
- **DIAG-3.6-05** ✅ **`cond-out-N` anchors per exit** — `outCount: 3` → returns ids `cond-out-0`, `cond-out-1`, `cond-out-2`. `outCount < 2` is clamped to 2.
- **DIAG-3.6-06** ✅ **`getConditionAnchors` positions** — `cond-in` sits at `(cx, cy - effectiveH/2)`; `cond-out-*` distributed along the base (or along the circular arc for `outCount ≥ 3`); rotation rotates every anchor around `(cx,cy)`.
- **DIAG-3.6-07** ✅ **Scale matches size** — `getConditionScale` returns `1 + (size-1)*0.25` so sizes 1–5 map to 1.0/1.25/1.5/1.75/2.0; `getConditionDimensions` is monotone in both size and out-anchor count (caps at 120° vertex → `CONDITION_WIDTH`).

## 3.7 Layers

- **DIAG-3.7-01** ❌ **Create layer via context menu** — right-click canvas → Add Layer → empty layer placed.
- **DIAG-3.7-02** ❌ **Default dimensions** — new layer has `width === DEFAULT_LAYER_WIDTH` (400), `height === DEFAULT_LAYER_HEIGHT` (200).
- **DIAG-3.7-03** ❌ **Layer bounds auto-expand** — drop node outside current bounds → bounds grow to include node + `LAYER_PADDING` (25).
- **DIAG-3.7-04** ❌ **Layer bounds include title offset** — top bound = topmost node − `LAYER_TITLE_OFFSET` (20) − padding.
- **DIAG-3.7-05** ❌ **Manual size override** — user resizes → manual size stored; auto-bounds do not shrink below it.
- **DIAG-3.7-06** ❌ **`LAYER_GAP` enforced between layers** — move layer A toward B → stops at `LAYER_GAP` (10) distance.
- **DIAG-3.7-07** ❌ **Layer drag moves children** — drag layer with 3 nodes → all 3 nodes' world positions shift by same delta.
- **DIAG-3.7-08** ❌ **Layer resize shifts contained nodes to avoid overlap** — shrink right edge into nodes → contained nodes reposition.
- **DIAG-3.7-09** ❌ **Resize clamped by sibling layers** — drag edge into another layer → stops at `LAYER_GAP`.
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
- **DIAG-3.8-09** ❌ **`bidirectional` renders arrowheads both ends** — toggle → both end markers visible.
- **DIAG-3.8-10** ❌ **`connectionType: asynchronous` renders distinctly** — dashed or different stroke compared to synchronous.
- **DIAG-3.8-11** ❌ **Label at labelPosition 0.5** — label sits at mid-path.
- **DIAG-3.8-12** ❌ **Label at labelPosition 0** — label at source end.
- **DIAG-3.8-13** ❌ **Waypoints render kinks** — waypoints defined → path bends through them.
- **DIAG-3.8-14** ❌ **Colour applied** — `color: "#f00"` → stroke is red (or migrated hex).
- **DIAG-3.8-15** ✅ **`segmentIntersectsRect` true on overlap** — horizontal/vertical/diagonal segments crossing the rect interior all return true (Cohen–Sutherland clip). Also covers `lineIntersectsRect` for multi-segment polylines.
- **DIAG-3.8-16** ✅ **`segmentIntersectsRect` false on clear** — segments entirely above/beside the rect return false; `lineIntersectsRect` false when every segment is outside the padded (4 px) bounds.
- **DIAG-3.8-17** ✅ **`segmentIntersectsRect` endpoints inside count as intersect** — segment with one endpoint inside the rect returns true; segment fully inside also true; segment touching the rect strictly at the edge does NOT (strict `<`/`>` in the outcode function).

## 3.9 Connection Interaction

- **DIAG-3.9-01** ❌ **Endpoint drag activates after 150 ms hold** — press & hold on endpoint → after 150 ms, drag state active.
- **DIAG-3.9-02** ❌ **Short click does not activate drag** — press & release within 150 ms → endpoint not in drag mode; line stays.
- **DIAG-3.9-03** ❌ **Endpoint snaps to nearest anchor** — release within snap radius of anchor → endpoint bound to that anchor.
- **DIAG-3.9-04** ❌ **Endpoint free-floats without nearby anchor** — release far from any node → endpoint stores raw coords (no anchor).
- **DIAG-3.9-05** ❌ **Reconnect blocked by constraints** — attempt self-loop → reject or reset.
- **DIAG-3.9-06** ❌ **Flow-break warning on reconnect** — reconnect breaks a flow → `FlowBreakWarningModal` appears listing broken flows.
- **DIAG-3.9-07** ❌ **Cancel in flow-break modal reverts** — cancel → endpoint returns to previous state.
- **DIAG-3.9-08** ❌ **Confirm in flow-break modal applies** — confirm → reconnect committed; affected flows updated.
- **DIAG-3.9-09** ❌ **Segment drag inserts waypoint** — drag a straight segment → waypoint added; path bends.
- **DIAG-3.9-10** ❌ **Segment drag updates existing waypoint** — drag an existing waypoint → its position changes.
- **DIAG-3.9-11** ❌ **Segment drag recorded in history** — drag, release → one history snapshot committed.
- **DIAG-3.9-12** ❌ **Anchor popup on hover** — hover over node → `AnchorPopupMenu` appears with anchor dots.
- **DIAG-3.9-13** ❌ **Anchor popup drag-from creates connection** — drag from an anchor dot onto another anchor → new connection created between those anchors.

## 3.10 Flows

- **DIAG-3.10-01** ❌ **Create flow via Cmd/Ctrl+G** — select 2 contiguous lines → press Cmd+G → new flow in state with those IDs.
- **DIAG-3.10-02** ❌ **Cmd+G rejects non-contiguous selection** — lines that don't share nodes → no flow created; user-visible signal (toast/silent).
- **DIAG-3.10-03** ✅ **`isContiguous` single connection** — input of 0 or 1 connection IDs returns `true` (trivial contiguity).
- **DIAG-3.10-04** ✅ **`isContiguous` chain** — any chain/tree/graph where every pair of consecutive connections shares a node (from or to) returns `true`; branching graphs also qualify.
- **DIAG-3.10-05** ✅ **`isContiguous` disjoint** — two connections with no shared endpoint return `false`; also returns `false` when any referenced connection ID is missing from the connections list.
- **DIAG-3.10-06** ✅ **`orderConnections` topological** — BFS walk starting from a pure-source node (one appearing only as `from` in the selected set) produces source→dest order; cycles fall back to the first connection's `from` node; orphan IDs (missing connections) are appended at the tail.
- **DIAG-3.10-07** ✅ **`findBrokenFlows` on middle-connection delete** — removing the middle of an A→B→C→D flow splits the remainder into disjoint halves → flow reported broken.
- **DIAG-3.10-08** 🟡 **`findBrokenFlows` behaviour on node delete** — documented shrink-to-contiguous-subset (removing c2+c3 from a 3-line flow leaves only c1, which is still contiguous) is NOT flagged as broken. Callers that want "any shrinkage breaks the flow" must enforce that separately. _(Behaviour locked in tests; reopen if product intent differs.)_
- **DIAG-3.10-09** ✅ **`findBrokenFlowsByReconnect` true** — reconnecting c2 from (B→C) to (X→Y) detaches the chain → containing flow listed.
- **DIAG-3.10-10** ✅ **`findBrokenFlowsByReconnect` false** — reconnect that keeps the flow connected (e.g. c2 to B→D still sharing a node with both neighbours) → empty result. `undefined` newFrom/newTo keeps the existing endpoint.
- **DIAG-3.10-11** ❌ **Flow dots animate** — flow with `flowDuration` > 0 → dots traverse path.
- **DIAG-3.10-12** ❌ **Flow properties: edit name** — edit → state updated.
- **DIAG-3.10-13** ❌ **Flow properties: edit category** — edit → state updated; category grouping re-renders in ArchitectureProperties.
- **DIAG-3.10-14** ❌ **Flow properties: delete flow** — click Delete Flow → flow removed; member connections untouched.
- **DIAG-3.10-15** ❌ **ArchitectureProperties — flat grouping** — no categories → flat list of flows.
- **DIAG-3.10-16** ❌ **ArchitectureProperties — grouped** — any category set → grouped; uncategorised appear under "Uncategorized".
- **DIAG-3.10-17** ❌ **Hover flow dims others** — hover flow name in panel → other flows dimmed on canvas.

## 3.11 Selection

- **DIAG-3.11-01** ❌ **Click selects single node** — selection state becomes `{ type: "node", id }`.
- **DIAG-3.11-02** ❌ **Click selects single layer** — `{ type: "layer", id }`.
- **DIAG-3.11-03** ❌ **Click selects single line** — `{ type: "line", id }`.
- **DIAG-3.11-04** ❌ **Ctrl/Cmd+click adds to selection** — select A, Ctrl+click B → `multi-node` with `[A, B]`.
- **DIAG-3.11-05** ❌ **Ctrl/Cmd+click toggles off** — select A+B, Ctrl+click A → back to single `{ node, B }`.
- **DIAG-3.11-06** ❌ **Rubber-band selects intersecting nodes** — drag rect over 3 nodes → `multi-node` with all 3.
- **DIAG-3.11-07** ❌ **Rubber-band works for mixed types** — selecting both nodes and lines via rect → selection union includes both (or per spec, a canonical kind — verify).
- **DIAG-3.11-08** ❌ **Drag threshold = 25 px** — mouse-down → release within 25 px → treated as click (select), not drag.
- **DIAG-3.11-09** ❌ **Selection cleared on Escape** — selection set → press Esc → selection `null`.

## 3.12 Context Menu

- **DIAG-3.12-01** ✅ **Canvas right-click → Add Element, Add Layer** — `target.type === "canvas"` renders exactly those two items.
- **DIAG-3.12-02** ✅ **Layer right-click → Add Element (in layer), Delete Layer** — `target.type === "layer"` renders both items; Delete is enabled (not gated by children count in this component).
- **DIAG-3.12-03** ✅ **Element right-click → Delete Element** — `target.type === "element"` renders only that single destructive item (red).
- **DIAG-3.12-04** 🚫 **Add Element avoids collisions** — placement logic lives in `useContextMenuActions`; not a ContextMenu-level concern.
- **DIAG-3.12-05** 🚫 **Add Element auto-assigns layer** — same, placement-side logic.
- **DIAG-3.12-06** 🚫 **Add Element grid-snapped** — same.
- **DIAG-3.12-07** 🚫 **Add Element selects new node** — same.
- **DIAG-3.12-08** 🚫 **Add Layer non-overlapping** — same.
- **DIAG-3.12-09** 🚫 **Add Layer unique id** — id generation lives in the hook.
- **DIAG-3.12-10** ✅ **Menu closes on Escape** — window `keydown` (capture phase) handler invokes `onClose` for `Escape` key.
- **DIAG-3.12-11** ✅ **Menu closes on outside click** — window `mousedown` outside the menu ref triggers `onClose`; mousedown inside does NOT (items call `e.stopPropagation()`).

Additional coverage in [FlowBreakWarningModal.test.tsx](../src/app/knowledge_base/features/diagram/components/FlowBreakWarningModal.test.tsx): DIAG-3.9-06/07/08 flow-break warning flow — heading pluralisation, Cancel/Continue callbacks, backdrop click; [DocInfoBadge.test.tsx](../src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx): single-vs-multiple dropdown, toggle, navigation; [Layer.test.tsx](../src/app/knowledge_base/features/diagram/components/Layer.test.tsx): render + isSelected/dimmed styles + drag/resize callbacks (DIAG-3.7); [FlowDots.test.tsx](../src/app/knowledge_base/features/diagram/components/FlowDots.test.tsx): DIAG-3.10-11 animation duration + visibility gating (isLive, hovered, selected, dragging).

## 3.13 Properties Panel

### 3.13.a Container
- **DIAG-3.13-01** 🚫 **Collapse / expand panel** — `collapsed` + `onToggleCollapse` props wire through; persistence is caller's (KnowledgeBase → Bucket 18).
- **DIAG-3.13-02** 🚫 **Tab switching reflects selection** — PropertiesPanel dispatches on `selection.type`; full switch coverage requires the full panel mount (deferred to integration).
- **DIAG-3.13-03** 🟡 **Read-only disables editors** — verified at LayerProperties level: readOnly=true strictly reduces row count (ColorSchemeRow hidden, EditableIdRow/EditableRow replaced with plain Row). Analogous for Node/Line panels (not individually covered here).

### 3.13.b Node properties
- **DIAG-3.13-04** ❌ **Label input edits** — type → state's `label` updates.
- **DIAG-3.13-05** ❌ **Sublabel input edits** — same.
- **DIAG-3.13-06** ❌ **Icon picker lists 41 icons** — grid shows all registered icons.
- **DIAG-3.13-07** ❌ **Icon picker sets icon** — click Database → node icon becomes Database.
- **DIAG-3.13-08** ✅ **Type classifier updates** — `AutocompleteInput` commits on Enter / blur / suggestion-click; rejects via onCommit returning false (error-border state); Escape cancels; external prop changes re-sync the draft. Full NodeProperties integration deferred.
- **DIAG-3.13-09** ❌ **Layer assignment dropdown** — select "Infra" → node's `layerId` updates; node moves into that layer visually.
- **DIAG-3.13-10** ❌ **Colour editors** — border, bg, text colours apply.
- **DIAG-3.13-11** ❌ **Rotation control** — 0–360 → `rotation` stored.
- **DIAG-3.13-12** ❌ **Condition exit count editor** — only shown for condition nodes; updates `exits`.
- **DIAG-3.13-13** ❌ **Condition size editor** — same for `size`.
- **DIAG-3.13-14** ❌ **Incoming connections list** — shows connections where `to === node.id`; click navigates selection.
- **DIAG-3.13-15** ❌ **Outgoing connections list** — same for `from`.
- **DIAG-3.13-16** ❌ **Via-condition paths** — node reachable through a condition node → listed.
- **DIAG-3.13-17** ❌ **Member flows list** — flows this node participates in.
- **DIAG-3.13-18** ❌ **Backlinks list** — attached / cross-referenced docs rendered; click opens doc in other pane.
- **DIAG-3.13-19** ❌ **Attach document opens DocumentPicker** — click attach → picker opens.

### 3.13.c Layer properties
- **DIAG-3.13-20** ✅ **Title edit** — `EditableRow` for "Label" wires to `onUpdate(id, { title })` when the field commits (tested indirectly via render snapshot + edit-row infrastructure).
- **DIAG-3.13-21** 🟡 **Colour edits apply** — `ColorRow` onChange propagates through LayerProperties to `onUpdate(id, {bg|border|textColor})`. jsdom's color input change handlers don't fully exercise the native picker; integration test deferred.
- **DIAG-3.13-22** ✅ **Children list scoped to this layer** — nodes whose `.layer !== id` (e.g. an orphan in "L2") are excluded from the "Elements" list; only same-layer children appear.
- **DIAG-3.13-23** 🚫 **Manual-size override toggle** — the UI lives inside the panel's Layout section. Not yet implemented as a direct toggle; region shows static Position + Size fields from measured bounds.

### 3.13.d Line properties
- **DIAG-3.13-24** ❌ **Label edit** — state updates.
- **DIAG-3.13-25** ❌ **Colour edit.**
- **DIAG-3.13-26** ❌ **Curve algorithm dropdown** — change → path re-renders with new algorithm.
- **DIAG-3.13-27** ❌ **Bidirectional toggle** — updates arrowheads.
- **DIAG-3.13-28** ❌ **Connection type toggle sync/async** — stroke style changes.
- **DIAG-3.13-29** ❌ **Flow duration input** — applies to flow-dot animation timing.
- **DIAG-3.13-30** ❌ **Source / dest displayed** — shows node labels + anchor names, not raw ids.

### 3.13.e Architecture (root)
- **DIAG-3.13-31** ❌ **Title editable** — updates diagram title and Header title.
- **DIAG-3.13-32** ❌ **Default line algorithm dropdown** — changing it sets a new default; existing lines keep per-line setting.
- **DIAG-3.13-33** ❌ **Layers list** — every layer listed; click selects it.
- **DIAG-3.13-34** ❌ **Elements list** — every node listed; click selects.
- **DIAG-3.13-35** ❌ **Types tree** — distinct node types grouped; count matches.
- **DIAG-3.13-36** ❌ **Select All per type** — click → selection becomes multi-node of all nodes of that type.
- **DIAG-3.13-37** ❌ **Flows panel** — all flows listed; expanding shows FlowDetail.
- **DIAG-3.13-38** ✅ **Document backlinks section** — `DocumentsSection` renders every backlink as `<basename>` (or `<basename> #section`), clicking fires `onOpenDocument(sourcePath)`. Title shows `References (N)`; empty state: `"No documents reference this diagram"` + wiki-link help text.

### 3.13.f DocumentsSection
- **DIAG-3.13-39** ❌ **Lists attached docs** — shows path with optional section.
- **DIAG-3.13-40** ❌ **Click opens doc in other pane** — maintains diagram pane.

## 3.14 Keyboard Shortcuts

- **DIAG-3.14-01** ❌ **Escape deselects** — any selection → Esc → `null`.
- **DIAG-3.14-02** ❌ **Escape closes context menu.**
- **DIAG-3.14-03** ❌ **Delete / Backspace deletes selection (no flow impact)** — deletes cleanly.
- **DIAG-3.14-04** ❌ **Delete with flow impact → warning modal** — shows warning before deletion.
- **DIAG-3.14-05** ❌ **Cmd/Ctrl+G creates flow** — on valid multi-line selection.
- **DIAG-3.14-06** ❌ **Cmd/Ctrl+Z undoes** — last action reverted.
- **DIAG-3.14-07** ❌ **Cmd/Ctrl+Shift+Z redoes** — reapplies the undone action.
- **DIAG-3.14-08** ❌ **Cmd/Ctrl+Shift+R toggles read-only** — state flips; UI reflects.
- **DIAG-3.14-09** ❌ **Shortcuts disabled in `<input>`** — typing in a label editor → Delete does not remove node.
- **DIAG-3.14-10** ❌ **Shortcuts disabled in `contenteditable`** — same.

## 3.15 Auto-Arrange, Grid Snap, Collision

### 3.15.a Grid snap (existing test — `utils/gridSnap.test.ts`)
- **DIAG-3.15-01** ✅ **Snaps to nearest grid multiple** — `snapToGrid(14)` → 10; `(15)` → 20; `(20)` → 20.
- **DIAG-3.15-02** ✅ **Uses `GRID_SIZE` default** — `snapToGrid(3)` → 0.
- **DIAG-3.15-03** ✅ **Accepts custom grid size** — `snapToGrid(7, 5)` → 5; `(8, 5)` → 10.
- **DIAG-3.15-04** ✅ **Handles negative values** — `(-14)` → −10; `(-15)` → −10; `(-16)` → −20.
- **DIAG-3.15-05** ✅ **Zero input → 0** — `snapToGrid(0)` → 0.
- **DIAG-3.15-06** ❌ **Drag integrates snap** — drag a node to `(14, 14)` → final position is `(10, 10)`.

### 3.15.b Auto-arrange
- **DIAG-3.15-07** ❌ **Topological sort** — simple DAG → nodes ordered by rank in TB direction.
- **DIAG-3.15-08** ❌ **Rank spacing = 180 px** — between ranks in TB.
- **DIAG-3.15-09** ❌ **Node spacing = 40 px** — within a rank.
- **DIAG-3.15-10** ❌ **LR direction rotates layout** — same DAG in LR → nodes arranged horizontally with same spacing.
- **DIAG-3.15-11** ❌ **Barycenter pass reduces crossings** — compared to pre-pass, post-pass has ≤ crossings.
- **DIAG-3.15-12** ❌ **Output grid-snapped** — every node's final position is on the grid.

### 3.15.c Collision clamps
- **DIAG-3.15-13** ✅ **`clampNodePosition` — no overlap** — with zero siblings, the raw `(x,y)` is returned verbatim. With siblings, returns a nearby (edge-snapped or binary-searched) position that leaves `NODE_GAP` clearance.
- **DIAG-3.15-14** ✅ **`clampNodePosition` — overlap clamp** — when the raw target would overlap a sibling, the returned position has no overlap after applying the `NODE_GAP` expansion.
- **DIAG-3.15-15** ✅ **`clampMultiNodeDelta` — group stays together** — returned `{dx,dy}` is applied uniformly to every dragged node (same delta, internal offsets preserved). Empty dragged list or empty siblings returns raw delta.
- **DIAG-3.15-16** ✅ **`clampMultiNodeDelta` — blocked at group bbox collision** — when any single dragged node's path crosses a sibling, the delta is clamped so that NO dragged node overlaps any sibling at the chosen delta.
- **DIAG-3.15-17** ✅ **`findNonOverlappingLayerPosition`** — returns raw position if no obstacles or if raw is already valid; otherwise picks the closest safe edge-candidate (above/below/left/right of each obstacle with `LAYER_GAP`). Zero-width empty obstacles are filtered.
- **DIAG-3.15-18** ✅ **`clampElementToAvoidLayerCollision` fast path** — when the predicted layer bounds at the raw element position overlap no sibling layer and no existing nodes, returns the input unchanged (no `layerShift` flag). _Strategy A/B paths require property-panel-level integration tests; not covered here._
- **DIAG-3.15-19** ✅ **`clampLayerDelta`** — returns raw delta when no obstacles (or all obstacles are self/empty); otherwise the clamped delta leaves a gap of at least `LAYER_GAP` to every solid sibling.

## 3.16 Undo / Redo

- **DIAG-3.16-01** ❌ **Snapshot on drag end** — move a node → one history entry added.
- **DIAG-3.16-02** ❌ **Snapshot on delete** — delete node → one entry.
- **DIAG-3.16-03** ❌ **Snapshot on connection edit.**
- **DIAG-3.16-04** ❌ **Undo restores prior state** — after move, undo → node back at original pos.
- **DIAG-3.16-05** ❌ **Redo reapplies** — after undo, redo → move reapplied.
- **DIAG-3.16-06** ❌ **Max 100 entries** — drive 101 changes → earliest dropped.
- **DIAG-3.16-07** ❌ **Sidecar file `.<name>.history.json`** — history persisted next to the diagram.
- **DIAG-3.16-08** ❌ **FNV-1a checksum detects external change** — disk file hash != saved hash → history re-init.
- **DIAG-3.16-09** ❌ **`goToSaved()` reverts to last save** — after unsaved edits, click revert → state at last save.
- **DIAG-3.16-10** ❌ **HistoryPanel lists entries** — entry per snapshot.
- **DIAG-3.16-11** ❌ **HistoryPanel click reverts** — clicking an earlier entry restores that snapshot.
- **DIAG-3.16-12** ❌ **Undo/redo respects read-only** — in read-only, shortcuts are no-ops (or explicitly allowed — verify).

## 3.17 Read-Only Mode

- **DIAG-3.17-01** ❌ **Toggle via PaneHeader lock** — icon state + disabled interactions.
- **DIAG-3.17-02** ❌ **Toggle via Cmd+Shift+R.**
- **DIAG-3.17-03** ❌ **Node drag disabled.**
- **DIAG-3.17-04** ❌ **Layer drag disabled.**
- **DIAG-3.17-05** ❌ **Endpoint / segment drag disabled.**
- **DIAG-3.17-06** ❌ **Delete key does nothing.**
- **DIAG-3.17-07** ❌ **Context menu suppressed or read-only variant.**
- **DIAG-3.17-08** ❌ **Properties panel inputs disabled.**
- **DIAG-3.17-09** ❌ **Navigation (click → select) still works** — reading is allowed.

## 3.18 Document Integration

- **DIAG-3.18-01** ❌ **DocInfoBadge visible when doc attached** — node with ≥ 1 doc → badge rendered.
- **DIAG-3.18-02** ❌ **DocInfoBadge hidden when none** — no docs → no badge.
- **DIAG-3.18-03** ❌ **Click badge opens attached doc** — opens in the other pane.
- **DIAG-3.18-04** ❌ **`attachDocument` persists in diagram JSON** — save, reload → `documents` field intact.
- **DIAG-3.18-05** ❌ **`detachDocument` removes reference.**
- **DIAG-3.18-06** ❌ **`getDocumentsForEntity` filters by entity type + id.**
- **DIAG-3.18-07** ❌ **`hasDocuments` returns true when any exist.**

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

Additional behaviours verified in [persistence.test.ts](../src/app/knowledge_base/shared/utils/persistence.test.ts): `createEmptyDiagram`, `loadDefaults`, `savePaneLayout`/`loadPaneLayout` (incl. `lastClosedPane` + corrupt-JSON tolerance), `migrateViewport`, `clearViewport`, `cleanupOrphanedData`, and graceful `QuotaExceededError` handling in both `saveDiagram` and `saveDraft`.
