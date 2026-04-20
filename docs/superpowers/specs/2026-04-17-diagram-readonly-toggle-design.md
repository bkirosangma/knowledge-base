# Diagram Read-Only Toggle — Design

## Context

The document pane already has a per-pane Read Mode toggle (`MarkdownPane.tsx`) with a Lock/LockOpen button that blocks editing while keeping navigation active. The diagram pane has no equivalent — every pointer interaction on the canvas can mutate state (drag nodes, resize layers, create connections, edit labels, delete via Delete key, open context menu, etc.).

This spec adds a per-file Read Mode to `DiagramView` that prevents all diagram mutations and hides the editing chrome, so the pane behaves as a pure viewer.

## Goals

- Each diagram file has its own Read Mode state, persisted across sessions via `localStorage`.
- A toggle button in the diagram toolbar flips the state, mirroring the document pane's button exactly (Lock/LockOpen, "Read Mode" label).
- A keyboard shortcut (Cmd/Ctrl+Shift+R) toggles Read Mode, guarded by the same `isEditingInput()` check used for other shortcuts.
- When Read Mode is on:
  - All mutations are blocked: node/layer/line/endpoint/segment drag, layer resize, rotation, anchor-drag line creation, label editing, context-menu creation/deletion, delete key, undo/redo, auto-arrange.
  - Editing chrome is hidden: context menu, anchor popup, inline label editor, anchors on hover, rotation handles, layer resize handles, auto-arrange dropdown, and destructive buttons in the properties panel.
  - Navigation stays active: pan, scroll, zoom, click-select, marquee select, hover tooltips, flow/type highlighting, doc-badge navigation, backlink navigation, Live/Labels/Minimap toggles, Escape to deselect.
- `isDirty` stays `false` throughout a Read Mode session (nothing mutates state).
- Split panes each own their own React state. Two panes showing different files are independent; two panes showing the same file share the persisted value on disk but do not live-sync within a session.

## Non-goals

- No cross-pane live sync when the same file is open in both panes (accepted — rare combination, reload picks it up).
- No global "reading mode" that applies to all diagrams at once.
- No change to the file-operation bridge (Save/Discard/Load/Create/Delete/Rename/Duplicate/Move remain available from the shell, unaffected).
- No change to the view-only toggles (Live, Labels, Minimap) — they already work in a viewer-like way and remain toggleable in Read Mode.

## Design

### State

Per-file state in `DiagramView.tsx`, keyed by `activeFile`:

```tsx
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
```

The `useEffect` on `storageKey` handles initial mount, file switches, and refresh-on-restore — each pane independently reads its own file's state.

Also add a cleanup effect to clear stale overlays when entering Read Mode:

```tsx
useEffect(() => {
  if (readOnly) {
    setEditingLabel(null);
    setContextMenu(null);
    setAnchorPopup(null);
  }
}, [readOnly]);
```

### Toolbar button

Placed on the right side of the existing diagram toolbar (`DiagramView.tsx:894-932`), after a vertical divider, only when `activeFile` is set. Mirrors `MarkdownPane.tsx:77-90` exactly:

```tsx
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
```

Imports: add `Lock` and `LockOpen` to the existing `lucide-react` import at `DiagramView.tsx:64`.

### Blocking mutations

**Hooks already accepting `isBlocked`** — OR `readOnly` into the expression so drag/resize starts short-circuit at the source:

| Hook | Current `isBlocked` | New |
|------|---------------------|-----|
| `useNodeDrag` | `!!draggingEndpoint \|\| !!creatingLine` | `readOnly \|\| !!draggingEndpoint \|\| !!creatingLine` |
| `useLayerDrag` | existing expr | `readOnly \|\| existing` |
| `useLayerResize` | existing expr | `readOnly \|\| existing` |
| `useLineDrag` | `!!draggingEndpoint` | `readOnly \|\| !!draggingEndpoint` |
| `useSelectionRect` | existing expr | **unchanged** — marquee selection is a viewer affordance |

**Hooks without `isBlocked`** — guard at call sites in `DiagramView.tsx` so selection/click still work but drag-to-mutate does not:

- `useEndpointDrag` → in the `onLineClick` arrow at `DataLine` (line 1027), keep the `pendingSelection.current = {...}` assignment (selection is viewer-only) but early-return before `handleLineClick(id, e)` when `readOnly`. `handleConnectedAnchorDrag` is passed into `useLineDrag`, which is already short-circuited via its `isBlocked`, so no further change is needed there.
- `useSegmentDrag` → gate the `onSegmentDragStart` prop passed to `DataLine` (line 1016) with a `readOnly` wrapper: `onSegmentDragStart={readOnly ? undefined : handleSegmentDragStart}`.

**Inline handlers in `DiagramView.tsx`** — early-return when `readOnly`:

- Canvas `onContextMenu` (line 945) — don't call `setContextMenu`.
- `onAnchorClick` (line 330) — don't open popup.
- `handleAnchorHover` (line 337) — don't schedule popup.
- `handleNodeDoubleClick` call site — wrapped in the `useCanvasInteraction` adapter; cleanest is to pass `readOnly` into `useCanvasInteraction` or gate at its return sites. Prefer passing `readOnly` as a new param and short-circuiting inside.
- Layer `onDoubleClick` (line 989) — `if (readOnly) return;` before `setEditingLabel`.
- Line `onDoubleClick` (line 1043) — same.
- Data line label `onMouseDown` handler (line 1253) — early-return.
- `ConditionElement` `onAddOutAnchor` (line 1196) — early-return.
- `handleRotationDragStart` — pass `readOnly` into `useCanvasInteraction` or guard at the call site in `commonProps.onRotationDragStart`.
- `handleAutoArrange` — button hidden (see Section "Hide editing UI"), and handler guarded defensively.

**Keyboard shortcuts** (`useKeyboardShortcuts`) — add a `readOnly: boolean` param; short-circuit:

- `Delete` / `Backspace`
- `Cmd/Ctrl+G` (create flow)
- `Cmd/Ctrl+Z` (undo) and `Cmd/Ctrl+Shift+Z` (redo)

`Escape` stays active (deselect is not an edit).

Also in the same hook, add the new toggle shortcut `Cmd/Ctrl+Shift+R`:

```tsx
if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "r" || e.key === "R")) {
  if (isEditingInput()) return;
  e.preventDefault();
  onToggleReadOnly();
}
```

Pass `onToggleReadOnly: toggleReadOnly` into the hook's config.

### Hide editing UI

**Conditionally not rendered** when `readOnly`:

- `ContextMenu` at `DiagramView.tsx:1436` — wrap in `!readOnly &&`.
- `AnchorPopupMenu` at line 1449 — wrap in `!readOnly &&`.
- Inline label editor at line 1369 — wrap in `!readOnly &&` (defence-in-depth; also the effect above clears `editingLabel` on entering Read Mode).
- `AutoArrangeDropdown` at line 931 — wrap in `!readOnly &&`.
- `FlowBreakWarningModal` for `pendingDeletion` (line 1596) and `pendingReconnect` (line 1605) — deletions cannot start in Read Mode, so these never open; no changes needed.

**Per-element via props**:

- Anchors on nodes — in the `commonProps` block (line 1134), force `showAnchors = false` when `readOnly`. Add a single line: `if (readOnly) showAnchors = false;`.
- Rotation handle on nodes/conditions — add a `readOnly?: boolean` prop to `Element` and `ConditionElement`; skip rendering the rotation grip when true.
- Layer resize handles — add a `readOnly?: boolean` prop to `Layer`; skip rendering the resize edge elements when true.

**`PropertiesPanel`** — add `readOnly?: boolean` to `PropertiesPanelProps`. Thread it into `NodeProperties`, `LayerProperties`, `LineProperties`, `ArchitectureProperties`. Each sub-panel:

- Renders inputs with `disabled={readOnly}` (or a read-only visual variant).
- Hides destructive actions (delete buttons, delete-anchor, "Create layer", "Create flow", "Delete flow").

The panel still shows values, backlinks, and history entries (history remains read-only-viewable — the Undo/Redo buttons in `HistoryPanel` should also render disabled when `readOnly` via the `history` prop bag, since undo/redo mutate state).

### What stays working

- Pan, scroll, zoom (toolbar + wheel).
- Click select: node, layer, line, flow.
- Marquee multi-select (`useSelectionRect` not blocked).
- Hover tooltips on lines.
- Flow/type dim-focus on hover or selection.
- Doc-badge click (`onDocNavigate` → `onOpenDocument`).
- Backlink click in properties panel.
- `Live`, `Labels`, `Minimap`, `Zoom`, `Read Mode` toggles.
- `Escape` to clear selection.
- File operations through the shell bridge (Save/Discard/etc.) — unaffected since the canvas never produces a dirty state in Read Mode.

## Files touched

- `src/app/knowledge_base/features/diagram/DiagramView.tsx` — state, toolbar button, guards on inline handlers, OR `readOnly` into hook `isBlocked`, clear-stale-overlay effect, hide ContextMenu/AnchorPopupMenu/AutoArrangeDropdown/inline-editor, force `showAnchors = false`, pass `readOnly` to Element/ConditionElement/Layer/PropertiesPanel, pass `onToggleReadOnly` and `readOnly` to `useKeyboardShortcuts`. Import `Lock`, `LockOpen`.
- `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts` — add `readOnly` and `onToggleReadOnly` params; short-circuit Delete/Backspace/Cmd+G/Cmd+Z/Cmd+Shift+Z on `readOnly`; add Cmd/Ctrl+Shift+R handler.
- `src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts` — accept `readOnly`; short-circuit `handleNodeDoubleClick` and `handleRotationDragStart`.
- `src/app/knowledge_base/features/diagram/components/Element.tsx` — accept `readOnly`; skip rotation grip render.
- `src/app/knowledge_base/features/diagram/components/ConditionElement.tsx` — accept `readOnly`; skip rotation grip + add-out-anchor button render.
- `src/app/knowledge_base/features/diagram/components/Layer.tsx` — accept `readOnly`; skip resize handles render.
- `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx` — accept `readOnly`; thread down.
- `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx` — disable inputs, hide destructive buttons.
- `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx` — same.
- `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx` — same.
- `src/app/knowledge_base/features/diagram/properties/ArchitectureProperties.tsx` — same (hide Create Flow, Create Layer, delete actions).
- `src/app/knowledge_base/features/diagram/components/HistoryPanel.tsx` — disable Undo/Redo buttons when `readOnly` via new prop on the `history` bag passed through `PropertiesPanel`.

## Verification

1. `preview_start name="dev"` on port 3457 (if not already running). Open a diagram file.
2. Click the Read Mode button in the diagram toolbar. Confirm:
   - Icon switches from LockOpen to Lock.
   - Styling matches the document pane's Read Mode button (blue text, white bg, slate border).
   - `aria-pressed="true"`.
3. Confirm mutations are blocked:
   - Node drag → no movement.
   - Layer drag and layer resize → no change.
   - Anchor hover → popup does not appear.
   - Right-click on canvas/node/layer → context menu does not appear.
   - Double-click node / layer / line → no label editor.
   - Data line label drag → no reposition.
   - Rotation grip on a node → not visible; condition add-out-anchor → not visible.
   - Delete / Backspace on selected item → no deletion.
   - Cmd+G on multi-line selection → no flow created.
   - Cmd+Z / Cmd+Shift+Z → no undo/redo fired.
   - AutoArrange dropdown → not visible.
   - PropertiesPanel inputs disabled; destructive buttons hidden.
4. Confirm navigation still works:
   - Pan via scroll.
   - Zoom in/out via toolbar buttons and 100% reset.
   - Click node/layer/line to select; marquee drag to multi-select.
   - Hover line → tooltip shows.
   - Hover flow chip → dims unrelated elements.
   - Click doc badge → opens `.md` in the other pane.
   - Click backlink in PropertiesPanel → navigates.
   - Live/Labels/Minimap toggles still work.
   - Escape clears selection.
5. Confirm persistence:
   - Toggle on, reload the page → still on for that file.
   - Switch to another diagram file → reflects that file's independent state.
   - Return to the first file → state restored.
6. Confirm keyboard shortcut:
   - Cmd/Ctrl+Shift+R toggles Read Mode.
   - Inside an input (title / label editor when editable) → shortcut ignored.
7. Confirm split pane:
   - Open two different diagram files in a split pane. Toggle one → the other is unaffected.
   - Open the same file in both panes. Each pane reads the stored value on mount; toggling one does not live-update the other (expected).
8. Confirm `isDirty` stays false across a full Read Mode session (global header Save/Discard stay disabled).
