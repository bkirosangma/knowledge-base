# Phase 1.1b — DiagramView Canvas Subtree (follow-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Close out Phase 1.1 by extracting three focused pieces of the canvas subtree that were too tangled to extract in one go: `DiagramLabelEditor`, `DiagramNodeLayer`, and `DiagramLinesOverlay`. Target DiagramView.tsx below 1100 lines (from 1475).

**Architecture:** Same pattern as Phase 1.1: each extraction is a JSX block with a typed props bundle. Parent DiagramView holds all state/hooks; child components are pure render functions with prop drilling. Refs and setters flow down as props.

**Tech Stack:** React 19, TypeScript 5, Vitest + Playwright (characterization tests from Phase 0).

**Baseline:** 831 unit tests + 25 e2e passing. Every task runs `npm run test:run + test:e2e + build` on Node 22 before committing.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `src/app/knowledge_base/features/diagram/components/DiagramLabelEditor.tsx` | **Create.** | Inline `<input>` that appears when `editingLabel` is set. Commits on Enter/blur, cancels on Escape. |
| `src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx` | **Create.** | The `displayNodes.map` block: renders `Element` / `ConditionElement` for each node with drag/select/hover/edit props. |
| `src/app/knowledge_base/features/diagram/components/DiagramLinesOverlay.tsx` | **Create.** | The first SVG block: `sortedLines.map` → `DataLine` components + `ghostLine` preview. |
| `src/app/knowledge_base/features/diagram/DiagramView.tsx` | **Modify.** | Delete the three JSX blocks, replace with `<DiagramLabelEditor />`, `<DiagramNodeLayer />`, `<DiagramLinesOverlay />`. Remove now-dead imports. |
| `Features.md` | **Modify.** | Update section 3 entry to list the three new components. |

**Out of scope:**
- The second SVG block (`{/* Data line label overlay */}`, L1193-1311) with the label-drag `onMove`/`onUp` closures. That needs a dedicated `useLabelDrag` hook — defer.
- `{/* Layers */}` regions.map (L922-953) — only 32 lines, not worth a separate file alone.
- `{/* Selection Rectangle */}` (L1313-1325) — 13 lines.
- `{/* Animated flow dots */}` wrapper IIFE (L1025-1044) — already a single component call.

---

## Task 1: Extract `DiagramLabelEditor`

**File boundaries:** `DiagramView.tsx` lines 1326–1397 (the `{/* Inline label editor */}` block). Takes `editingLabel`, `editingLabelValue`, `setEditingLabelValue`, `editingLabelBeforeRef`, `commitLabel`, `readOnly`, and geometry derived from `editingLabel.type/id` (node position, connection label point, layer bounds).

- [ ] **Step 1:** Read lines 1326–1397 of `DiagramView.tsx`.
- [ ] **Step 2:** Create `components/DiagramLabelEditor.tsx` with props for: `editingLabel`, `editingLabelValue`, `setEditingLabelValue`, `editingLabelBeforeRef`, `commitLabel` (from useLabelEditing), `readOnly`, plus `nodes`, `connections`, `regions`, `getNodeDimensions` (needed to compute position).
- [ ] **Step 3:** Move the JSX verbatim into the new component.
- [ ] **Step 4:** Replace the block in DiagramView with `<DiagramLabelEditor {...} />`.
- [ ] **Step 5:** `npm run build && npm run test:run && npm run test:e2e` — all green.
- [ ] **Step 6:** Commit.

## Task 2: Extract `DiagramNodeLayer`

**File boundaries:** `DiagramView.tsx` lines 1046–1192 (the `{/* Nodes */}` block, `displayNodes.map`).

- [ ] **Step 1:** Read the block + identify all closed-over identifiers via grep.
- [ ] **Step 2:** Create `components/DiagramNodeLayer.tsx`. Props include: `displayNodes`, `nodes`, `draggingId`, `isMultiDrag`, `multiDragIds`, `multiDragDelta`, `hoveredNodeId`, `selection`, `readOnly`, `draggingEndpoint`, `creatingLine`, `flowDimSets`, `typeDimSets`, `flowHighlightSet`, `typeHighlightSet`, `measuredSizes`, `expandedTypeInPanel`, refs (`pendingSelection`, `nodesRef`, etc.), and handlers (`setSelection`, `setContextMenu`, `setAnchorPopup`, `setEditingLabel`, `setEditingLabelValue`, `editingLabelBeforeRef`, `handleNodeDragStart`, `handleNodeDoubleClick`, `handleNodeMouseEnter`, `handleNodeMouseLeave`, `handleAnchorDragStart`, `handleConnectedAnchorDrag`, `handleRotationDragStart`, `handleElementResize`, `onAnchorClick`, `handleAnchorHover`, `handleAnchorHoverEnd`, `hasDocuments`, `getDocumentsForEntity`, `onOpenDocument`, `onPickDocument`).
- [ ] **Step 3:** Move JSX verbatim.
- [ ] **Step 4:** Wire into DiagramView.
- [ ] **Step 5:** Full test + build.
- [ ] **Step 6:** Commit.

## Task 3: Extract `DiagramLinesOverlay`

**File boundaries:** `DiagramView.tsx` lines 955–1023 (the `{/* SVG Lines */}` + main svg element with `sortedLines.map` + `ghostLine` preview).

- [ ] **Step 1:** Read the block + identify closed-over identifiers.
- [ ] **Step 2:** Create `components/DiagramLinesOverlay.tsx`. Props: `sortedLines`, `world`, `isZooming`, `lineCurve`, `readOnly`, `isLive`, `showLabels`, `hoveredLine`, `selection`, `connections`, `flows`, `flowDimSets`, `typeDimSets`, `draggingEndpoint`, `creatingLine`, `draggingId`, `draggingLayerId`, `isMultiDrag`, `ghostLine`, `labelDragStartT` (ref), plus handlers (`setHoveredLine`, `handleSegmentDragStart`, `handleLineClick`, `setEditingLabel`, `setEditingLabelValue`, `editingLabelBeforeRef`, `setConnections`, `scheduleRecord`, `hasDocuments`, `getDocumentsForEntity`, `onOpenDocument`, `pendingSelection` ref).
- [ ] **Step 3:** Move JSX verbatim.
- [ ] **Step 4:** Wire into DiagramView.
- [ ] **Step 5:** Full test + build.
- [ ] **Step 6:** Commit.

## Task 4: Cleanup + Features.md

- [ ] **Step 1:** Remove any newly-unused imports from DiagramView (run `npm run lint`, filter for DiagramView.tsx unused warnings).
- [ ] **Step 2:** Update `Features.md` section 3 to list the three new components alongside `DiagramOverlays`, `AutoArrangeDropdown`.
- [ ] **Step 3:** Full test + build.
- [ ] **Step 4:** Commit.

---

## Definition of Done

- [ ] All 4 tasks complete, commits green on Node 22.
- [ ] 831 unit + 25 e2e tests pass unchanged.
- [ ] `DiagramView.tsx` < 1100 lines (stretch <1000).
- [ ] No new component > ~250 lines.
- [ ] Features.md updated.
- [ ] No user-visible behaviour change.

## Risk & rollback

- **Risk: Prop-signature drift** (the main Phase 1.1 surprise). Mitigation: run full `tsc` (via `npm run build`) after every extraction before committing.
- **Risk: Ref identity changes** cause useEffect re-fires. Mitigation: pass refs (`pendingSelection`, `editingLabelBeforeRef`, etc.) verbatim — never wrap in `useMemo`.
- **Rollback:** each task = one commit = `git revert <SHA>`.
