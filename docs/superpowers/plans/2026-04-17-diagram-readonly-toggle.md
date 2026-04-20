# Diagram Read-Only Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-file Read Mode to the diagram pane that blocks all diagram mutations and hides editing chrome, mirroring the document pane's existing Read Mode toggle.

**Architecture:** Single `readOnly` boolean held in `DiagramView` (persisted per `activeFile` in `localStorage`). Mutations are blocked three ways: (a) OR `readOnly` into existing `isBlocked` flags on the interactive hooks (`useNodeDrag`, `useLayerDrag`, `useLayerResize`, `useLineDrag`), (b) early-return in inline handlers in `DiagramView`, (c) pass `undefined` for editing callbacks (`onRotationDragStart`, `onAddOutAnchor`, `onResizeStart`) so leaf components can skip rendering editing affordances without a new prop. `PropertiesPanel` takes a new `readOnly` prop and threads it down to its sub-panels, which disable inputs and hide destructive buttons. Keyboard shortcuts (Delete, Cmd+G, Cmd+Z, Cmd+Shift+Z) become no-ops in Read Mode, and a new Cmd/Ctrl+Shift+R shortcut toggles it.

**Tech Stack:** React 19, Next.js 16, TypeScript, Tailwind CSS 4, `lucide-react` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-04-17-diagram-readonly-toggle-design.md`

**Note on testing:** This project has no unit/integration test framework (`package.json` has only `dev`, `build`, `lint`). Verification is done via the preview MCP tools (`preview_start`, `preview_snapshot`, `preview_eval`, `preview_click`). The dev server runs `next dev` on its default port.

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/diagram/DiagramView.tsx` | Add `readOnly` state + per-file persistence effect; clear overlays on enter; add `Lock`/`LockOpen` to `lucide-react` import; add toolbar toggle button; OR `readOnly` into `isBlocked` of 4 hooks; gate inline handlers (context menu, anchor hover/click, layer double-click, line double-click, data line label drag); pass `undefined` for `onResizeStart`/`onRotationDragStart`/`onAddOutAnchor`/`onSegmentDragStart`/`onAddElement callbacks` when `readOnly`; force `showAnchors = false`; hide `ContextMenu` / `AnchorPopupMenu` / inline label editor / `AutoArrangeDropdown`; pass `readOnly` to `PropertiesPanel`; pass `readOnly` and `onToggleReadOnly` to `useKeyboardShortcuts`; pass `readOnly` into `history` prop bag; extend `useCanvasInteraction` call; gate `onLineClick`'s `handleLineClick` call. |
| `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts` | Add `readOnly: boolean` and `onToggleReadOnly: () => void` params; short-circuit Delete/Backspace/Cmd+G/Cmd+Z/Cmd+Shift+Z when `readOnly`; add Cmd/Ctrl+Shift+R handler to call `onToggleReadOnly`. |
| `src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts` | Add `readOnly: boolean` param; short-circuit `handleNodeDoubleClick` and `handleRotationDragStart` early when `readOnly`. |
| `src/app/knowledge_base/features/diagram/components/Layer.tsx` | Gate the resize-handles block on `onResizeStart` presence so `undefined` from the parent hides the handles entirely. |
| `src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx` | Accept `readOnly?: boolean`; disable `onUndo`/`onRedo` buttons and history entry buttons when true. |
| `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx` | Accept `readOnly?: boolean`; thread it to all sub-panels and into the `history` prop bag for `HistoryPanel`. |
| `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx` | Accept `readOnly`; when true, convert editable rows to static and hide destructive actions. |
| `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx` | Same pattern as `NodeProperties`. |
| `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx` | Same pattern as `NodeProperties`. |
| `src/app/knowledge_base/features/diagram/properties/ArchitectureProperties.tsx` | Same pattern; also hide "Create flow" / "Create layer" / delete-flow / delete-type buttons. |

No new files.

`ConditionElement.tsx` and `Element.tsx` don't need source changes — their editing affordances are already gated by the presence of optional callbacks, which `DiagramView` will omit in Read Mode.

---

## Task 1: Read-only state, persistence, and toolbar button

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Add `Lock` and `LockOpen` to the `lucide-react` import**

Current import at `DiagramView.tsx:64`:
```tsx
import { Activity, Tag, Map as MapIcon, LayoutGrid, ChevronRight } from "lucide-react";
```

Change to:
```tsx
import { Activity, Tag, Map as MapIcon, LayoutGrid, ChevronRight, Lock, LockOpen } from "lucide-react";
```

- [ ] **Step 2: Add `readOnly` state and storage key, right after the existing view-toggle state (`showMinimap`, `historyCollapsed`)**

Insert after the block at `DiagramView.tsx:182-196` (after the `toggleProperties` callback definition), before the line `const [hoveredLine, setHoveredLine] = useState<{...`:

```tsx
  // Per-file Read Mode state. Read from localStorage keyed by activeFile
  // on mount and whenever the active file changes (split-pane switch, refresh restore).
  const storageKey = activeFile ? `diagram-read-only:${activeFile}` : null;
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") { setReadOnly(false); return; }
    setReadOnly(localStorage.getItem(storageKey) === "true");
  }, [storageKey]);
  const toggleReadOnly = useCallback(() => {
    setReadOnly((v) => {
      const next = !v;
      if (storageKey) {
        try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  // Clear stale overlays when entering Read Mode so nothing lingers.
  useEffect(() => {
    if (readOnly) {
      setEditingLabel(null);
      setContextMenu(null);
      setAnchorPopup(null);
    }
  }, [readOnly]);
```

Note: `setEditingLabel`, `setContextMenu`, `setAnchorPopup` are already declared earlier in the component (lines 214-223). The effect just consumes them.

- [ ] **Step 3: Add the Read Mode toggle button in the diagram toolbar, at the end of the row**

Current end of the toolbar block at `DiagramView.tsx:930-932`:
```tsx
            <div className="h-5 w-px bg-slate-200" />
            <AutoArrangeDropdown onSelect={handleAutoArrange} />
          </div>
```

Change to:
```tsx
            <div className="h-5 w-px bg-slate-200" />
            {!readOnly && <AutoArrangeDropdown onSelect={handleAutoArrange} />}

            <div className="flex-1" />
            <div className="h-5 w-px bg-slate-200" />
            <button
              onClick={toggleReadOnly}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                readOnly
                  ? "bg-white shadow-sm text-blue-600 border-slate-200"
                  : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
              }`}
              title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
              aria-pressed={readOnly}
              aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
            >
              {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
              <span>Read Mode</span>
            </button>
          </div>
```

(The `{!readOnly && <AutoArrangeDropdown .../>}` wrapper doubles as the Section-3 "hide editing UI" requirement for auto-arrange — done inline here.)

- [ ] **Step 4: Lint check**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint src/app/knowledge_base/features/diagram/DiagramView.tsx
```

Expected: no errors.

- [ ] **Step 5: Preview verify — button renders and toggles**

Ensure the dev server is running (`preview_start name="dev"` if not).

1. `preview_eval` with `window.location.reload()` to pick up the change.
2. Open a diagram file (`.json`) in the app.
3. `preview_snapshot` — confirm a button with accessible label "Enter Read Mode" appears at the right end of the diagram toolbar.
4. `preview_click` with selector `button[aria-label="Enter Read Mode"]`.
5. `preview_snapshot` — confirm the label is now "Exit Read Mode" and `aria-pressed="true"`. Confirm the AutoArrange button is no longer in the DOM.
6. Click again, confirm it returns to "Enter Read Mode" and AutoArrange reappears.

- [ ] **Step 6: Preview verify — persistence**

1. Enter Read Mode.
2. `preview_eval` `window.location.reload()`.
3. Wait for the page to re-render. `preview_snapshot` — confirm the button still shows "Exit Read Mode" (state restored from `localStorage`).
4. Click to exit Read Mode. Reload. Confirm "Enter Read Mode" (state off).
5. If the app has multiple diagram files, open a second one and confirm its state is independent (its own localStorage key).

- [ ] **Step 7: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "feat(diagram): add Read Mode toggle state and toolbar button"
```

---

## Task 2: Block mutations via hook `isBlocked` + keyboard shortcuts

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: OR `readOnly` into `useNodeDrag`'s `isBlocked`**

Current call at `DiagramView.tsx:372-384`:
```tsx
  const { draggingId, elementDragPos, elementDragRawPos, handleDragStart,
    isMultiDrag, multiDragIds, multiDragDelta, multiDragRawDelta,
    nodeDragDidMove, multiDragDidMove } = useNodeDrag({
    nodes, layerShiftsRef, toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine,
    setNodes,
    ...
```

Change `isBlocked` line to:
```tsx
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine,
```

- [ ] **Step 2: OR `readOnly` into `useLayerResize`'s `isBlocked`**

Current call at `DiagramView.tsx:386-391`:
```tsx
  const { layerManualSizes, setLayerManualSizes, resizingLayer, handleLayerResizeStart, resizeDidChange } = useLayerResize({
    regionsRef, toCanvasCoords,
    isBlocked: !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
    initialManualSizes: defaults.current.layerManualSizes,
    nodes, levelMapRef, getNodeDimensions, layerShiftsRef,
  });
```

Change `isBlocked` to:
```tsx
    isBlocked: readOnly || !!draggingId || !!draggingEndpoint || !!creatingLine || isMultiDrag,
```

- [ ] **Step 3: OR `readOnly` into `useLayerDrag`'s `isBlocked`**

Current call at `DiagramView.tsx:393-401`:
```tsx
  const { draggingLayerId, draggingLayerIds, layerDragDelta, layerDragRawDelta, handleLayerDragStart, layerDragDidMove } = useLayerDrag({
    toCanvasCoords,
    isBlocked: !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
    setNodes,
    ...
```

Change `isBlocked` to:
```tsx
    isBlocked: readOnly || !!draggingEndpoint || !!creatingLine || !!draggingId || isMultiDrag,
```

- [ ] **Step 4: OR `readOnly` into `useLineDrag`'s `isBlocked`**

Current call at `DiagramView.tsx:365-370`:
```tsx
  const { creatingLine, handleAnchorDragStart } = useLineDrag({
    nodes, connections, measuredSizes, layerShiftsRef, toCanvasCoords, setConnections,
    isBlocked: !!draggingEndpoint,
    onAnchorClick,
    onConnectedAnchorDrag: handleConnectedAnchorDrag,
  });
```

Change `isBlocked` to:
```tsx
    isBlocked: readOnly || !!draggingEndpoint,
```

- [ ] **Step 5: Update `useKeyboardShortcuts` to take `readOnly` and `onToggleReadOnly`**

Current interface at `useKeyboardShortcuts.ts:6-18`:
```ts
interface KeyboardShortcutsConfig {
  cancelSelectionRect: () => void;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  setContextMenu: (v: null) => void;
  deleteSelection: (sel: NonNullable<Selection>) => PendingDeletion | null;
  setPendingDeletion: React.Dispatch<React.SetStateAction<PendingDeletion | null>>;
  handleCreateFlow: (ids: string[]) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  selectionRef: React.RefObject<Selection>;
  pendingSelectionRef: React.RefObject<{ type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } | null>;
  nodesRef: React.RefObject<NodeData[]>;
}
```

Add two fields at the end:
```ts
  readOnly: boolean;
  onToggleReadOnly: () => void;
```

- [ ] **Step 6: Destructure them in the exported hook and short-circuit mutating shortcuts**

Current hook body at `useKeyboardShortcuts.ts:25-69`:
```ts
export function useKeyboardShortcuts({
  cancelSelectionRect,
  setSelection,
  setContextMenu,
  deleteSelection,
  setPendingDeletion,
  handleCreateFlow,
  handleUndo,
  handleRedo,
  selectionRef,
  pendingSelectionRef,
  nodesRef,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelectionRect();
        setSelection(null);
        setContextMenu(null);
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectionRef.current) {
        if (isEditingInput()) return;
        e.preventDefault();
        const pending = deleteSelection(selectionRef.current);
        if (pending) setPendingDeletion(pending);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        if (isEditingInput()) return;
        e.preventDefault();
        const sel = selectionRef.current;
        if (sel?.type === "multi-line") handleCreateFlow(sel.ids);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        if (isEditingInput()) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        if (isEditingInput()) return;
        e.preventDefault();
        handleRedo();
      }
    };
```

Change to:
```ts
export function useKeyboardShortcuts({
  cancelSelectionRect,
  setSelection,
  setContextMenu,
  deleteSelection,
  setPendingDeletion,
  handleCreateFlow,
  handleUndo,
  handleRedo,
  selectionRef,
  pendingSelectionRef,
  nodesRef,
  readOnly,
  onToggleReadOnly,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelSelectionRect();
        setSelection(null);
        setContextMenu(null);
      }

      // Toggle Read Mode — works both on and off (Cmd/Ctrl+Shift+R).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
        if (isEditingInput()) return;
        e.preventDefault();
        onToggleReadOnly();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectionRef.current) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        const pending = deleteSelection(selectionRef.current);
        if (pending) setPendingDeletion(pending);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "g") {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        const sel = selectionRef.current;
        if (sel?.type === "multi-line") handleCreateFlow(sel.ids);
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        if (isEditingInput()) return;
        if (readOnly) return;
        e.preventDefault();
        handleRedo();
      }
    };
```

- [ ] **Step 7: Add `readOnly` and `onToggleReadOnly` to the effect's dependency array**

Current at the end of `useKeyboardShortcuts.ts:94`:
```ts
  }, [cancelSelectionRect, handleUndo, handleRedo, deleteSelection, handleCreateFlow, setSelection, setContextMenu, setPendingDeletion, selectionRef, pendingSelectionRef, nodesRef]);
```

Change to:
```ts
  }, [cancelSelectionRect, handleUndo, handleRedo, deleteSelection, handleCreateFlow, setSelection, setContextMenu, setPendingDeletion, selectionRef, pendingSelectionRef, nodesRef, readOnly, onToggleReadOnly]);
```

- [ ] **Step 8: Pass the new params at the call site in `DiagramView`**

Current call at `DiagramView.tsx:662-667`:
```tsx
  useKeyboardShortcuts({
    cancelSelectionRect, setSelection, setContextMenu,
    deleteSelection, setPendingDeletion,
    handleCreateFlow, handleUndo, handleRedo,
    selectionRef, pendingSelectionRef: pendingSelection, nodesRef,
  });
```

Change to:
```tsx
  useKeyboardShortcuts({
    cancelSelectionRect, setSelection, setContextMenu,
    deleteSelection, setPendingDeletion,
    handleCreateFlow, handleUndo, handleRedo,
    selectionRef, pendingSelectionRef: pendingSelection, nodesRef,
    readOnly, onToggleReadOnly: toggleReadOnly,
  });
```

- [ ] **Step 9: Lint check**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint src/app/knowledge_base/features/diagram/DiagramView.tsx src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts
```

Expected: no errors.

- [ ] **Step 10: Preview verify — hook-level mutations blocked**

Reload the page, open a diagram with at least 2 nodes / 1 layer / 1 connection, enter Read Mode.

With `preview_eval` (or by hand), attempt each drag start:

1. `preview_click` on a node, hold `preview_eval`-simulated mousemove — node should not move. (Simpler visual: just try `preview_click` and `preview_snapshot` before/after — node coordinates unchanged.)

Programmatic quick check — dispatch a mousedown event on a node:
```js
(() => {
  const nodeEl = document.querySelector('[class*="select-none"][class*="absolute"]');
  if (!nodeEl) return 'no node';
  const rect = nodeEl.getBoundingClientRect();
  const md = new MouseEvent('mousedown', { bubbles: true, clientX: rect.left + 10, clientY: rect.top + 10 });
  nodeEl.dispatchEvent(md);
  // simulate move
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + 200, clientY: rect.top + 200 }));
  window.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + 200, clientY: rect.top + 200 }));
  return nodeEl.getBoundingClientRect().left === rect.left ? 'not moved (correct)' : 'moved (BUG)';
})()
```
Expected: `"not moved (correct)"`.

2. Press Delete key (via `preview_eval` dispatching a KeyboardEvent on `window`) while a node is selected → node count unchanged.
3. Press Cmd+Z → history index unchanged (check via `preview_snapshot` — history panel "1/N" indicator stays the same).

- [ ] **Step 11: Preview verify — Cmd/Ctrl+Shift+R toggles**

With focus on the canvas, dispatch the shortcut:
```js
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', metaKey: true, shiftKey: true, bubbles: true }));
// On non-Mac use ctrlKey: true instead
```

`preview_snapshot` — the Read Mode button should flip to "Exit Read Mode". Dispatch again → flips back.

- [ ] **Step 12: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/diagram/DiagramView.tsx src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts
git commit -m "feat(diagram): block mutations at hook level + keyboard shortcut in Read Mode"
```

---

## Task 3: Gate inline handlers and hide remaining editing chrome

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts`
- Modify: `src/app/knowledge_base/features/diagram/components/Layer.tsx`

- [ ] **Step 1: Extend `useCanvasInteraction` with `readOnly`**

Read current file:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && cat src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts
```

Update the hook to accept `readOnly` as a new final positional argument (to preserve its current signature style). Inside, short-circuit the two mutating handlers:

- `handleNodeDoubleClick` → early `if (readOnly) return;` before setting `editingLabel`.
- `handleRotationDragStart` → early `if (readOnly) return;`.

*(The hook file currently takes a long positional arg list; match its existing convention. If the file is too verbose to mutate safely, convert to an options object, but keep this task minimal — add one boolean arg at the end.)*

Then at the call site in `DiagramView.tsx:656-660`:
```tsx
  const { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave } = useCanvasInteraction(
    nodesRef, editingLabelBeforeRef, setNodes, setHoveredNodeId,
    setEditingLabel, setEditingLabelValue, pendingSelection,
    handleSelectionRectStart, handleDragStart, scheduleRecord,
  );
```

Change to:
```tsx
  const { handleRotationDragStart, handleNodeDragStart, handleNodeDoubleClick, handleNodeMouseEnter, handleNodeMouseLeave } = useCanvasInteraction(
    nodesRef, editingLabelBeforeRef, setNodes, setHoveredNodeId,
    setEditingLabel, setEditingLabelValue, pendingSelection,
    handleSelectionRectStart, handleDragStart, scheduleRecord, readOnly,
  );
```

- [ ] **Step 2: Gate the canvas `onContextMenu` handler in `DiagramView`**

Current at `DiagramView.tsx:945-952`:
```tsx
        onContextMenu={(e) => {
          e.preventDefault();
          const coords = toCanvasCoords(e.clientX, e.clientY);
          const cx = coords.x;
          const cy = coords.y;
          const target = detectContextMenuTarget(cx, cy, nodes, getNodeDimensions, regions);
          setContextMenu({ clientX: e.clientX, clientY: e.clientY, canvasX: cx, canvasY: cy, target });
        }}
```

Change to:
```tsx
        onContextMenu={(e) => {
          e.preventDefault();
          if (readOnly) return;
          const coords = toCanvasCoords(e.clientX, e.clientY);
          const cx = coords.x;
          const cy = coords.y;
          const target = detectContextMenuTarget(cx, cy, nodes, getNodeDimensions, regions);
          setContextMenu({ clientX: e.clientX, clientY: e.clientY, canvasX: cx, canvasY: cy, target });
        }}
```

- [ ] **Step 3: Gate `onAnchorClick` and `handleAnchorHover` in `DiagramView`**

Current `onAnchorClick` at `DiagramView.tsx:330-335`:
```tsx
  const onAnchorClick = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.shape === "condition" && anchorId === "cond-in") return;
    setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
  }, [nodes]);
```

Change to:
```tsx
  const onAnchorClick = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (readOnly) return;
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    if (node.shape === "condition" && anchorId === "cond-in") return;
    setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
  }, [nodes, readOnly]);
```

Current `handleAnchorHover` at `DiagramView.tsx:337-346`:
```tsx
  const handleAnchorHover = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (anchorDismissTimer.current) { clearTimeout(anchorDismissTimer.current); anchorDismissTimer.current = null; }
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    anchorHoverTimer.current = setTimeout(() => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.shape === "condition" && anchorId === "cond-in") return;
      setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
    }, 100);
  }, [nodes]);
```

Change to:
```tsx
  const handleAnchorHover = useCallback((nodeId: string, anchorId: import("./utils/anchors").AnchorId, clientX: number, clientY: number) => {
    if (readOnly) return;
    if (anchorDismissTimer.current) { clearTimeout(anchorDismissTimer.current); anchorDismissTimer.current = null; }
    if (anchorHoverTimer.current) clearTimeout(anchorHoverTimer.current);
    anchorHoverTimer.current = setTimeout(() => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;
      if (node.shape === "condition" && anchorId === "cond-in") return;
      setAnchorPopup({ clientX, clientY, nodeId, anchorId, edge: getAnchorEdge(anchorId) });
    }, 100);
  }, [nodes, readOnly]);
```

- [ ] **Step 4: Gate Layer `onDoubleClick` and Line `onDoubleClick` inline**

Layer `onDoubleClick` at `DiagramView.tsx:989-996`:
```tsx
                    onDoubleClick={(layerId) => {
                      const ld = layerDefs.find((l) => l.id === layerId);
                      if (ld) {
                        setEditingLabel({ type: "layer", id: layerId });
                        setEditingLabelValue(ld.title);
                        editingLabelBeforeRef.current = ld.title;
                      }
                    }}
```

Change to:
```tsx
                    onDoubleClick={(layerId) => {
                      if (readOnly) return;
                      const ld = layerDefs.find((l) => l.id === layerId);
                      if (ld) {
                        setEditingLabel({ type: "layer", id: layerId });
                        setEditingLabelValue(ld.title);
                        editingLabelBeforeRef.current = ld.title;
                      }
                    }}
```

Line `onDoubleClick` at `DiagramView.tsx:1043-1050`:
```tsx
                    onDoubleClick={(connId) => {
                      const conn = connections.find((c) => c.id === connId);
                      if (conn) {
                        setEditingLabel({ type: "line", id: connId });
                        setEditingLabelValue(conn.label);
                        editingLabelBeforeRef.current = conn.label;
                      }
                    }}
```

Change to:
```tsx
                    onDoubleClick={(connId) => {
                      if (readOnly) return;
                      const conn = connections.find((c) => c.id === connId);
                      if (conn) {
                        setEditingLabel({ type: "line", id: connId });
                        setEditingLabelValue(conn.label);
                        editingLabelBeforeRef.current = conn.label;
                      }
                    }}
```

- [ ] **Step 5: Gate the data line label drag `onMouseDown`**

At `DiagramView.tsx:1253` the inline handler starts with `onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); ...`.

Insert an early-return right after the existing preventDefault:

```tsx
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (readOnly) return;
                        const svg = (e.target as SVGElement).closest("svg");
                        ...
```

- [ ] **Step 6: Gate `handleLineClick` (line endpoint-drag initiation) while keeping selection working**

At `DiagramView.tsx:1027`:
```tsx
                    onLineClick={(id, e) => { pendingSelection.current = { type: 'line', id, x: e.clientX, y: e.clientY }; handleLineClick(id, e); }}
```

Change to:
```tsx
                    onLineClick={(id, e) => { pendingSelection.current = { type: 'line', id, x: e.clientX, y: e.clientY }; if (readOnly) return; handleLineClick(id, e); }}
```

- [ ] **Step 7: Gate `onSegmentDragStart` and `onLabelPositionChange`/`onLabelDragEnd` on the `DataLine`**

At `DiagramView.tsx:1016`:
```tsx
                    onSegmentDragStart={handleSegmentDragStart}
```
Change to:
```tsx
                    onSegmentDragStart={readOnly ? undefined : handleSegmentDragStart}
```

At `DiagramView.tsx:1028-1042` (`onLabelPositionChange` and `onLabelDragEnd`):
```tsx
                    onLabelPositionChange={(connId, t) => {
                      if (labelDragStartT.current === null) {
                        const conn = connections.find((c) => c.id === connId);
                        labelDragStartT.current = conn?.labelPosition ?? 0.5;
                      }
                      setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, labelPosition: t } : c));
                    }}
                    onLabelDragEnd={(connId) => {
                      const conn = connections.find((c) => c.id === connId);
                      const endT = conn?.labelPosition ?? 0.5;
                      if (labelDragStartT.current !== null && endT !== labelDragStartT.current) {
                        scheduleRecord("Move label");
                      }
                      labelDragStartT.current = null;
                    }}
```

Wrap each callback body with `if (readOnly) return;` as the first statement:
```tsx
                    onLabelPositionChange={(connId, t) => {
                      if (readOnly) return;
                      if (labelDragStartT.current === null) {
                        const conn = connections.find((c) => c.id === connId);
                        labelDragStartT.current = conn?.labelPosition ?? 0.5;
                      }
                      setConnections((prev) => prev.map((c) => c.id === connId ? { ...c, labelPosition: t } : c));
                    }}
                    onLabelDragEnd={(connId) => {
                      if (readOnly) return;
                      const conn = connections.find((c) => c.id === connId);
                      const endT = conn?.labelPosition ?? 0.5;
                      if (labelDragStartT.current !== null && endT !== labelDragStartT.current) {
                        scheduleRecord("Move label");
                      }
                      labelDragStartT.current = null;
                    }}
```

- [ ] **Step 8: Gate `onAddOutAnchor` on `ConditionElement`**

At `DiagramView.tsx:1196-1199`:
```tsx
                      onAddOutAnchor={() => {
                        setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, conditionOutCount: (n.conditionOutCount ?? 2) + 1 } : n));
                        scheduleRecord("Add out anchor");
                      }}
```

Change to a conditional prop (so the button doesn't render at all in Read Mode):
```tsx
                      onAddOutAnchor={readOnly ? undefined : () => {
                        setNodes((prev) => prev.map((n) => n.id === node.id ? { ...n, conditionOutCount: (n.conditionOutCount ?? 2) + 1 } : n));
                        scheduleRecord("Add out anchor");
                      }}
```

- [ ] **Step 9: Gate `onRotationDragStart` on `ConditionElement`**

At `DiagramView.tsx:1200`:
```tsx
                      onRotationDragStart={handleRotationDragStart}
```

Change to:
```tsx
                      onRotationDragStart={readOnly ? undefined : handleRotationDragStart}
```

(Note: step 1 also guards `handleRotationDragStart` inside the hook — belt and braces. The `undefined` here also makes `ConditionElement` not render the rotation grip since it checks `onRotationDragStart && ...`.)

- [ ] **Step 10: Force `showAnchors = false` when `readOnly`**

In the `commonProps` block at `DiagramView.tsx:1104-1119`, after the existing mutations of `showAnchors`, add one more line. The block ends around line 1119:
```tsx
              if (flowDimSets != null && !flowDimSets.nodeIds.has(node.id)) { dimmed = true; showAnchors = false; }
              if (typeDimSets != null && !typeDimSets.nodeIds.has(node.id)) { dimmed = true; showAnchors = false; }
```

Add right after those two lines (before `let visualX = node.x;`):
```tsx
              if (readOnly) { showAnchors = false; }
```

- [ ] **Step 11: Hide `ContextMenu`, `AnchorPopupMenu`, and the inline label editor when `readOnly`**

At `DiagramView.tsx:1436-1447` (ContextMenu block):
```tsx
      {contextMenu && (
        <ContextMenu
          ...
        />
      )}
```
Change to:
```tsx
      {!readOnly && contextMenu && (
        <ContextMenu
          ...
        />
      )}
```

At `DiagramView.tsx:1449-1463` (AnchorPopupMenu block): same — wrap with `!readOnly && anchorPopup && (...)`.

At `DiagramView.tsx:1369` (inline label editor IIFE):
```tsx
            {editingLabel && (() => {
```
Change to:
```tsx
            {!readOnly && editingLabel && (() => {
```

- [ ] **Step 12: Layer component — hide resize handles when `onResizeStart` is undefined**

Current block at `Layer.tsx:62`:
```tsx
        {/* Resize handles — edges (hidden when dimmed to prevent resize cursors during drag) */}
        {!dimmed && (<>
```

Change to:
```tsx
        {/* Resize handles — edges (hidden when dimmed or when no handler is provided) */}
        {!dimmed && onResizeStart && (<>
```

- [ ] **Step 13: DiagramView — pass `undefined` for Layer's `onResizeStart` when `readOnly`**

At `DiagramView.tsx:984`:
```tsx
                    onResizeStart={(id, edge, e) => { e.stopPropagation(); pendingSelection.current = { type: 'layer', id, x: e.clientX, y: e.clientY }; handleLayerResizeStart(id, edge, e); }}
```

Change to:
```tsx
                    onResizeStart={readOnly ? undefined : (id, edge, e) => { e.stopPropagation(); pendingSelection.current = { type: 'layer', id, x: e.clientX, y: e.clientY }; handleLayerResizeStart(id, edge, e); }}
```

- [ ] **Step 14: Lint check**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint src/app/knowledge_base/features/diagram/DiagramView.tsx src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts src/app/knowledge_base/features/diagram/components/Layer.tsx
```

Expected: no errors.

- [ ] **Step 15: Preview verify — inline handlers blocked and chrome hidden**

Reload the page, open the diagram, enter Read Mode.

1. Right-click on canvas / node / layer → no context menu appears. `preview_eval`:
   ```js
   (() => {
     const before = document.querySelectorAll('[role="menu"]').length;
     window.dispatchEvent(new MouseEvent('contextmenu', { clientX: 200, clientY: 200, bubbles: true }));
     const after = document.querySelectorAll('[role="menu"]').length;
     return { before, after };
   })()
   ```
   Expected: `before === after` (no new menu).

2. Hover a node's anchor — the popup should not appear. `preview_snapshot` — confirm no AnchorPopupMenu element.

3. Double-click a node / layer / line label → no inline edit input appears (`preview_eval` checking for `input` with class `ring-blue-300`).

4. Hover a condition node → no rotation grip visible (check for `RotateCw` svg icon).

5. Hover a selected condition node → no "+" add-out-anchor button.

6. Hover a layer border → no resize cursor dots visible (the handles' DOM is gone).

7. `preview_inspect` any node's anchor div → `opacity: 0` (from `showAnchors = false`).

- [ ] **Step 16: Preview verify — selection and navigation still work**

While still in Read Mode:

1. Click a node → `preview_snapshot` shows it as selected (blue ring).
2. Click a line → selected.
3. Shift-drag a marquee (`preview_click` then mousemove) → multi-selection still possible.
4. Scroll to pan (`preview_eval` setting `canvasEl.scrollLeft`) → pans.
5. Zoom toolbar button → zoom changes.
6. Hover line → tooltip appears (unless showLabels is on, in which case label overlay is present).

- [ ] **Step 17: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/diagram/DiagramView.tsx src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts src/app/knowledge_base/features/diagram/components/Layer.tsx
git commit -m "feat(diagram): gate inline handlers + hide editing chrome in Read Mode"
```

---

## Task 4: PropertiesPanel and HistoryPanel read-only threading

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/ArchitectureProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

**Pattern used in this task:** each sub-panel takes an optional `readOnly?: boolean`. When true, the simplest strategy is to pass `undefined` to the `onCommit`/`onChange`/`onSelect`/`onUpdate` handlers of the editable row components in `shared.tsx` (which render the value non-editable when the callback is missing — verify by opening `shared.tsx` once; if it doesn't, also set `disabled={readOnly}` on the underlying `<input>`s). Also, skip rendering destructive buttons (Delete flow, Delete anchor, Create flow, Create layer) when `readOnly`.

- [ ] **Step 1: Read `shared.tsx` to confirm how editable rows behave when `onCommit` is missing**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && cat src/app/knowledge_base/features/diagram/properties/shared.tsx | head -200
```

If `EditableRow`, `EditableIdRow`, `ColorRow`, `ColorSchemeRow`, `ExpandableListRow` already render non-editable when `onCommit`/`onChange` is undefined, we only need to pass `undefined` from each sub-panel. Otherwise, add a `disabled` variant or replace with plain `Row` in the panel body. **Default assumption:** these shared rows gracefully handle missing callbacks (they already accept them as optional in type signatures); if not, fall back to the "replace with Row" approach.

- [ ] **Step 2: Add `readOnly?: boolean` to `PropertiesPanel`'s props**

At `PropertiesPanel.tsx:14-60`, add `readOnly?: boolean;` to `PropertiesPanelProps` (before `history?:`).

At `PropertiesPanel.tsx:62` (the destructured props), add `readOnly` to the destructuring list.

- [ ] **Step 3: Thread `readOnly` to each sub-panel render in `PropertiesPanel`**

Inside the body of `PropertiesPanel` wherever `<NodeProperties ... />`, `<LayerProperties ... />`, `<LineProperties ... />`, `<ArchitectureProperties ... />` are rendered, add `readOnly={readOnly}` to each.

Also update the `<HistoryPanel ... />` render (if it's rendered directly in this file): pass `readOnly={readOnly}` to it too.

- [ ] **Step 4: Extend `HistoryPanel`'s props and disable Undo/Redo/entry buttons**

At `HistoryPanel.tsx:7-18`, add `readOnly?: boolean;` to `HistoryPanelProps`.

At `HistoryPanel.tsx:29-40`, destructure `readOnly`.

At `HistoryPanel.tsx:77`:
```tsx
            <button
              onClick={onUndo}
              disabled={!canUndo}
              ...
```
Change `disabled` to `disabled={!canUndo || readOnly}`. Same for the Redo button (line 84).

At `HistoryPanel.tsx:107-111` (history entry button):
```tsx
                  <button
                    key={entry.id}
                    data-index={idx}
                    onClick={() => onGoToEntry(idx)}
                    className={...}
```
Add `disabled={readOnly}` and append `disabled:opacity-50 disabled:cursor-not-allowed` to the className string (matches the style used on the Undo/Redo buttons).

- [ ] **Step 5: `NodeProperties` — pass `undefined` handlers and hide destructive actions when `readOnly`**

Read the current file:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && cat src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx
```

Add `readOnly?: boolean` to the props destructure. Inside the body, replace each `onCommit={...}` / `onChange={...}` / `onSelect={...}` on the shared editable rows with a conditional:
```tsx
onCommit={readOnly ? undefined : (v) => { ... }}
```
For any delete / remove / "add X" buttons (e.g. a "Delete" button for the node, or a "Remove type" affordance), wrap with `{!readOnly && (<button ... />)}`.

- [ ] **Step 6: `LayerProperties` — same pattern**

At `LayerProperties.tsx`, add `readOnly?: boolean` to the props destructure and render signature. Then:

Current `onCommit` and `onChange` bindings at lines 29-49 — wrap each with `readOnly ? undefined : ...`:
```tsx
        <EditableIdRow
          label="ID" value={region.id} prefix="ly-"
          onCommit={readOnly ? undefined : (newId) => {
            if (newId === id) return true;
            if (allLayerIds.includes(newId)) return false;
            onUpdate?.(id, { id: newId });
            return true;
          }}
        />
        <EditableRow label="Label" value={region.title} onCommit={readOnly ? undefined : (v) => { onUpdate?.(id, { title: v }); return true; }} />
```

And similarly for the `ColorSchemeRow` `onSelect` and `ColorRow` `onChange` props.

- [ ] **Step 7: `LineProperties` — same pattern**

Add `readOnly?: boolean` to its props, and gate each edit callback with `readOnly ? undefined : ...`. Hide any destructive buttons (if present in this panel) with `{!readOnly && (...)}`.

- [ ] **Step 8: `ArchitectureProperties` — same pattern, plus hide creation/deletion buttons**

Add `readOnly?: boolean`. Gate edit callbacks. Additionally, wrap any "Create flow", "Create layer", "Delete flow", and similar action buttons with `{!readOnly && (...)}`. The exact list of buttons varies by panel contents — grep for `<button` in the file and audit each one:

```bash
cd "/Users/kiro/My Projects/knowledge-base" && grep -n "<button" src/app/knowledge_base/features/diagram/properties/ArchitectureProperties.tsx
```

For each match, classify: selection/toggle → keep enabled; creation/deletion → hide when `readOnly`.

- [ ] **Step 9: Pass `readOnly` from `DiagramView` into `PropertiesPanel`**

At `DiagramView.tsx:1466`:
```tsx
      <PropertiesPanel
        collapsed={propertiesCollapsed}
        onToggleCollapse={toggleProperties}
        selection={selection}
        title={title}
        ...
```

Add `readOnly={readOnly}` as a new prop in this block (e.g. right after `onToggleCollapse={toggleProperties}`):
```tsx
        readOnly={readOnly}
```

- [ ] **Step 10: Lint check**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint \
  src/app/knowledge_base/features/diagram/DiagramView.tsx \
  src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx \
  src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx \
  src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx \
  src/app/knowledge_base/features/diagram/properties/LineProperties.tsx \
  src/app/knowledge_base/features/diagram/properties/ArchitectureProperties.tsx \
  src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx
```

Expected: no errors.

- [ ] **Step 11: Build check — catches any missed type errors across the threading**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx next build 2>&1 | tail -40
```

Expected: build succeeds, or only pre-existing warnings.

- [ ] **Step 12: Preview verify — PropertiesPanel and HistoryPanel in Read Mode**

Reload, open diagram, enter Read Mode, open the properties panel (if collapsed).

1. Select a node. Properties panel shows its values. Click a value field — it should not enter edit mode (either the field is disabled, or edits don't commit).
2. Attempt to change a color via the color picker — either the picker is disabled or clicks do nothing.
3. Any "Delete" button on the node card should not be visible.
4. Select a layer → same checks.
5. Select a line → same checks.
6. No selection (Architecture view) → no "Create flow" or "Create layer" buttons.
7. History panel — Undo and Redo buttons show as disabled (greyed out). Clicking a history entry has no effect (button disabled).

- [ ] **Step 13: Preview verify — exit Read Mode restores editing in panels**

Click Exit Read Mode. Repeat a subset of the above — editing works again, buttons reappear.

- [ ] **Step 14: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/diagram/properties/ src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "feat(diagram): disable properties panel edits + history mutations in Read Mode"
```

---

## Task 5: Full end-to-end verification

**Files:** none (pure verification).

- [ ] **Step 1: Ensure dev server is running and hot-reload picked up the final state**

`preview_start name="dev"` if needed. `preview_eval` `window.location.reload()`.

- [ ] **Step 2: Walk the full verification list from the spec**

Open a diagram file with at least one of each: a regular node, a condition node, a layer, a connection, a flow. Enter Read Mode.

Confirm each of the following:

**Blocked mutations** — each should be a no-op. For each, observe that state is unchanged via `preview_snapshot` / `preview_inspect`:
- Drag a node.
- Drag a layer.
- Resize a layer.
- Drag an anchor to create a line.
- Drag a line's endpoint.
- Drag a line segment (orthogonal).
- Double-click a node / layer / line → no label editor.
- Drag a line's label → doesn't move.
- Rotate a condition → no rotation grip.
- Add a condition out-anchor → no "+" button.
- Delete / Backspace on selected item → no deletion.
- Cmd+G on multi-line selection → no flow.
- Cmd+Z / Cmd+Shift+Z → no change.
- AutoArrange dropdown → not visible.
- Right-click on canvas → no context menu.
- PropertiesPanel inputs → non-editable; destructive buttons hidden.
- HistoryPanel Undo/Redo → disabled.

**Working navigation & inspection:**
- Pan via scroll.
- Zoom toolbar ± and 100% reset.
- Click to select: node / layer / line / flow.
- Marquee multi-select.
- Hover line → tooltip (if labels off).
- Hover flow chip in PropertiesPanel → dim-focus works.
- Click doc badge on a node → opens markdown pane.
- Click a backlink in PropertiesPanel → navigates.
- Live, Labels, Minimap toggles → still work.
- Escape clears selection.

**Persistence:**
- Reload → Read Mode state restored for this file.
- Switch to another diagram file → independent state.
- Return to first file → state restored again.

**Keyboard shortcut:**
- Cmd/Ctrl+Shift+R toggles Read Mode.
- Focus an `<input>` (e.g. rename a file in the explorer, if possible) → the shortcut is ignored.

**Split pane:**
- If split pane is supported: open two different files side by side. Toggle one pane's Read Mode. Confirm the other is unaffected.
- If same file is open in both panes: each pane reads `localStorage` on mount; toggling one is not expected to live-sync the other. Reload → both panes show the stored state.

**Dirty flag:**
- Throughout the entire Read Mode session, the global header's Save/Discard buttons should remain disabled (state is `!isDirty`). Confirm by `preview_snapshot`.

- [ ] **Step 3: Screenshot for user proof**

`preview_screenshot` with a diagram visible in Read Mode so the user can see the final UI.

Also take a second screenshot with the pane out of Read Mode to visually confirm the editing chrome (anchors, rotation grip, AutoArrange, etc.) returns.

- [ ] **Step 4: Report to user**

Summarise: the feature is complete, list the commits (Tasks 1–4), and surface the screenshots.

- [ ] **Step 5: Optional final cleanup commit**

Only if any follow-up fixes were made during verification that weren't committed to their owning task:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add -u
git commit -m "fix(diagram): verification-pass follow-ups for Read Mode"
```

---

## Self-review notes

- **Spec coverage:**
  - Goals: per-file state & persistence (Task 1), toolbar button mirroring doc pane (Task 1), Cmd/Ctrl+Shift+R shortcut (Task 2), all listed mutations blocked (Tasks 2 + 3), editing chrome hidden (Task 3), navigation stays active (Task 3 Step 16 + Task 5), `isDirty` untouched (implicit — nothing mutates — verified in Task 5).
  - Non-goals respected: no cross-pane live sync (plan does not add a storage-event listener), no global mode, no changes to the bridge, no changes to the view-only toggles.
- **Type consistency:** the boolean prop is spelled `readOnly` everywhere (matches the existing prop name on `MarkdownEditor` and the new prop on `PropertiesPanel`, `HistoryPanel`, and sub-panels). The callback is `toggleReadOnly` in `DiagramView` and passed as `onToggleReadOnly` to `useKeyboardShortcuts` — consistent within each scope.
- **Placeholder scan:** each step has concrete code or an exact shell command. Task 4 Step 5 intentionally defers one implementation detail to the engineer (whether shared rows fall back gracefully on missing callbacks) but gives a concrete fallback; this is acceptable because it's a lookup, not a design decision.
- **Scope:** single coherent feature, one pane, one behavior. No decomposition needed.
- **Commit granularity:** 4 feature commits (one per task) + optional cleanup commit. Each commit is independently meaningful and hot-reloadable in the preview browser.
