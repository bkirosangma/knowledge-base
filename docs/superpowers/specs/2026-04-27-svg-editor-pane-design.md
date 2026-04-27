# SVG Editor Pane Design

## Context

Users need to create and edit SVG diagrams and illustrations directly within the knowledge-base vault. SVG files live alongside documents and diagrams in the vault file tree, can be opened from the file explorer, and are saved as standard `.svg` files so they're portable and version-controllable.

The integration uses `@svgedit/svgcanvas` — the canvas-only core of svg-edit — with a custom minimal React toolbar. This keeps the editor lightweight, fully theme-integrated, and consistent with the existing pane architecture.

---

## Architecture

A new file-based pane type `"svgEditor"` opens `.svg` files from the vault. It follows the diagram pane pattern: a root view component, a bridge object exposed to the shell, and a persistence hook for load/save/dirty tracking.

### Shell changes (4 files)

| File | Change |
|------|--------|
| `src/app/knowledge_base/shell/ToolbarContext.tsx` | Add `"svgEditor"` to `PaneType` union |
| `src/app/knowledge_base/shared/utils/persistence.ts` | Add `"svgEditor"` to `SavedPaneEntry.fileType` |
| `src/app/knowledge_base/knowledgeBase.tsx` | Add `.svg` → `"svgEditor"` extension detection in `handleSelectFile`; add `"svgEditor"` case in `renderPane` |
| Explorer context menu component | Add "New SVG" action |

### New directory

```
src/app/knowledge_base/features/svgEditor/
├── SVGEditorView.tsx          ← pane root: state, bridge, lifecycle
├── SVGEditorView.test.tsx
├── components/
│   ├── SVGCanvas.tsx          ← 'use client', wraps @svgedit/svgcanvas
│   └── SVGToolbar.tsx         ← tool buttons + zoom controls
└── hooks/
    └── useSVGPersistence.ts   ← load / save / dirty / auto-save
```

---

## Components

### `SVGCanvas.tsx`

- Marked `'use client'`; never rendered server-side
- Holds a `div` ref; initializes `SvgCanvas` from `@svgedit/svgcanvas` in `useEffect`
- Exposes an imperative handle via `useImperativeHandle`:

```ts
export type SVGTool = "select" | "rect" | "ellipse" | "line" | "path" | "text";

export interface SVGCanvasHandle {
  getSvgString: () => string;
  setSvgString: (svg: string) => void;
  setMode: (tool: SVGTool) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
}
```

- Listens to svgedit's internal change events; calls `onChanged()` prop on every edit so the parent can track dirty state
- Canvas fills its container (`width: 100%, height: 100%`)

### `SVGToolbar.tsx`

Pure React, no svgedit dependency. Two groups separated by a divider:

**Tools** (one active at a time, highlighted):
- Select (pointer icon, shortcut `S`)
- Rectangle (`R`)
- Ellipse (`E`)
- Line (`L`)
- Path/Pen (`P`)
- Text (`T`)

**Actions:**
- Undo / Redo
- Zoom In / Zoom Out / Fit

Props: `activeTool`, `onToolChange`, `onUndo`, `onRedo`, `onZoomIn`, `onZoomOut`, `onZoomFit`.

### `SVGEditorView.tsx`

Orchestrates all parts:

```ts
export interface SVGEditorBridge {
  isDirty: boolean;
  title: string;
  onSave: () => void;
  onDiscard: () => void;
}

export interface SVGEditorViewProps {
  focused: boolean;
  side: "left" | "right";
  activeFile: string | null;
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onSVGEditorBridge: (bridge: SVGEditorBridge) => void;
}
```

- `canvasRef` typed as `React.RefObject<SVGCanvasHandle>`
- `activeTool` state drives toolbar highlight + `canvasRef.current.setMode()`
- `useSVGPersistence` provides `isDirty`, `handleSave`, `handleDiscard`
- Bridge emitted via `useEffect` on every relevant state change
- Renders: `<PaneHeader>` + `<SVGToolbar>` + `<SVGCanvas>`

### `useSVGPersistence`

```ts
function useSVGPersistence(
  activeFile: string | null,
  canvasRef: React.RefObject<SVGCanvasHandle>,
  fileExplorer: ReturnType<typeof useFileExplorer>,
): {
  isDirty: boolean;
  handleSave: () => Promise<void>;
  handleDiscard: () => Promise<void>;
  onChanged: () => void;   // call this from SVGCanvas on every edit
}
```

Lifecycle:
- **Load:** `activeFile` changes → `fileExplorer.readFile(path)` → `canvasRef.current.setSvgString(content)` → snapshot saved → `isDirty = false`
- **Dirty:** `onChanged()` called → compare `getSvgString()` to snapshot → `isDirty = true`
- **Auto-save:** debounced 1.5 s after last `onChanged()` call — writes draft to disk silently
- **Explicit save:** `getSvgString()` → write file → update snapshot → `isDirty = false`
- **Discard:** re-read file from disk → `setSvgString(content)` → restore snapshot → `isDirty = false`

---

## File Lifecycle

### Opening an SVG

`handleSelectFile` in `knowledgeBase.tsx` already dispatches by extension:
```ts
const fileType: PaneType =
  path.endsWith(".diagram") ? "diagram" :
  path.endsWith(".svg")     ? "svgEditor" :
  "document";
```

### Creating a new SVG

"New SVG" in the explorer context menu (on folders):
1. Prompts for a filename (same pattern as "New Diagram")
2. Writes minimal boilerplate:
   ```xml
   <svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>
   ```
3. Calls `openFile(newPath, "svgEditor")`

### Keyboard shortcuts

`Cmd+S` → `bridge.onSave()` — handled at the shell level, same as diagram and document panes. Tool shortcuts (`S`, `R`, `E`, `L`, `P`, `T`) handled inside `SVGEditorView` when the pane is focused.

---

## Persistence & Layout

Pane layout saved/restored via existing `savePaneLayout` / `loadPaneLayout` in `persistence.ts`. `SavedPaneEntry.fileType` will include `"svgEditor"`, so an open SVG pane survives page reload.

---

## Dependencies

- **`@svgedit/svgcanvas`** — canvas-only core (no full editor UI)
- No other new dependencies

---

## Testing

- `SVGEditorView.test.tsx` — unit tests for: file load calls `setSvgString`, dirty flag set on `onChanged`, save calls `getSvgString` + write, discard re-reads file
- `SVGToolbar.test.tsx` — tool selection, active highlight, undo/redo callbacks
- Manual verification: open vault → right-click folder → New SVG → editor opens → draw a rectangle → save → reload page → file reopens with content intact → theme toggle updates canvas background

---

## Out of Scope

- SVG export to PNG/PDF
- Layers panel
- Color/stroke properties panel (svgedit defaults apply)
- Collaborative editing
- SVG preview in document panes (wiki-link thumbnails)
