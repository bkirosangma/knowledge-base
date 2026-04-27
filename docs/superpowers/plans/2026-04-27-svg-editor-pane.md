# SVG Editor Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an SVG editor pane that opens `.svg` files from the vault using `@svgedit/svgcanvas` with a custom minimal React toolbar.

**Architecture:** A new `"svgEditor"` pane type (following the diagram pane pattern) with `SVGEditorView` owning load/save/dirty state via `useSVGPersistence`, `SVGCanvas` wrapping `@svgedit/svgcanvas` behind an imperative handle, and `SVGToolbar` as a pure React tool picker. The shell is wired in three places: `handleSelectFile` (routing), `renderPane` (dispatch), and `ExplorerPanel` (New SVG action).

**Tech Stack:** `@svgedit/svgcanvas` (canvas-only core), React `useImperativeHandle`, Next.js App Router (`"use client"`), Vitest + React Testing Library.

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/app/knowledge_base/shell/ToolbarContext.tsx` — add `"svgEditor"` to `PaneType` |
| Modify | `src/app/knowledge_base/shared/utils/persistence.ts` — add `"svgEditor"` to `SavedPaneEntry` |
| Modify | `src/app/knowledge_base/shared/hooks/useFileExplorer.ts` — add `createSVG` |
| Modify | `src/app/knowledge_base/shared/components/explorer/ExplorerPanel.tsx` — add `onCreateSVG` prop + submenu |
| Modify | `src/app/knowledge_base/shared/components/explorer/TreeNodeRow.tsx` — add `handleCreateSVG` prop + hover button |
| Modify | `src/app/knowledge_base/knowledgeBase.tsx` — `handleSelectFile`, `renderPane`, both `ExplorerPanel` calls |
| Create | `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.tsx` |
| Create | `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.test.tsx` |
| Create | `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.tsx` |
| Create | `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.test.tsx` |
| Create | `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.ts` |
| Create | `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.test.ts` |
| Create | `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx` |
| Create | `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx` |
| Modify | `Features.md` — add §X SVG Editor Pane |
| Modify | `test-cases/05-links-and-graph.md` or appropriate file — add SVG test cases |

---

## Task 1: Register the pane type

**Files:**
- Modify: `src/app/knowledge_base/shell/ToolbarContext.tsx:6`
- Modify: `src/app/knowledge_base/shared/utils/persistence.ts:287`

No unit test (pure type unions). Verify with `tsc --noEmit` after both edits.

- [ ] **Step 1: Add `"svgEditor"` to PaneType union**

In `src/app/knowledge_base/shell/ToolbarContext.tsx`, change line 6:
```ts
// Before:
export type PaneType = "diagram" | "document" | "graph" | "graphify";
// After:
export type PaneType = "diagram" | "document" | "graph" | "graphify" | "svgEditor";
```

- [ ] **Step 2: Add `"svgEditor"` to SavedPaneEntry.fileType**

In `src/app/knowledge_base/shared/utils/persistence.ts`, change line 287:
```ts
// Before:
  fileType: "diagram" | "document" | "graph" | "graphify";
// After:
  fileType: "diagram" | "document" | "graph" | "graphify" | "svgEditor";
```

- [ ] **Step 3: Verify TypeScript**

```bash
npm run typecheck
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/shell/ToolbarContext.tsx \
        src/app/knowledge_base/shared/utils/persistence.ts
git commit -m "feat(svg-editor): register svgEditor pane type"
```

---

## Task 2: createSVG in useFileExplorer

**Files:**
- Modify: `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`
- Test: `src/app/knowledge_base/shared/hooks/useFileExplorer.operations.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/app/knowledge_base/shared/hooks/useFileExplorer.operations.test.tsx`, add after the `createDocument` tests:

```ts
// ── createSVG ────────────────────────────────────────────────────────────────
describe('createSVG: creates empty SVG file', () => {
  it('returns null when no directory handle is open', async () => {
    const { result } = renderHook(() => useFileExplorer());
    let got: string | null = "sentinel";
    await act(async () => { got = await result.current.createSVG(''); });
    expect(got).toBeNull();
  });

  it('creates untitled.svg at root and returns path', async () => {
    const root = new MockDir({ files: new Map(), dirs: new Map() });
    const result = await setupWithRoot(root);
    let path: string | null = null;
    await act(async () => { path = await result.current.createSVG(''); });
    expect(path).toBe('untitled.svg');
    expect(root.files.has('untitled.svg')).toBe(true);
  });

  it('creates inside a subdirectory when parentPath is given', async () => {
    const root = new MockDir({
      files: new Map(),
      dirs: new Map([['assets', new MockDir({ files: new Map(), dirs: new Map() })]]),
    });
    const result = await setupWithRoot(root);
    let path: string | null = null;
    await act(async () => { path = await result.current.createSVG('assets'); });
    expect(path).toBe('assets/untitled.svg');
    expect(root.dirs.get('assets')!.files.has('untitled.svg')).toBe(true);
  });

  it('generates untitled-1.svg when untitled.svg exists', async () => {
    const root = new MockDir({
      files: new Map([['untitled.svg', new MockFileHandle('untitled.svg', new MockFile('<svg/>'))]] ),
      dirs: new Map(),
    });
    const result = await setupWithRoot(root);
    let path: string | null = null;
    await act(async () => { path = await result.current.createSVG(''); });
    expect(path).toBe('untitled-1.svg');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose useFileExplorer.operations
```
Expected: FAIL — `result.current.createSVG is not a function`

- [ ] **Step 3: Implement createSVG in useFileExplorer**

In `src/app/knowledge_base/shared/hooks/useFileExplorer.ts`, add after the `createDocument` function (around line 250):

```ts
/** Create a new empty SVG file. Returns the path or null. */
const createSVG = useCallback(async (parentPath: string = ""): Promise<string | null> => {
  if (!dirHandleRef.current) return null;
  try {
    const siblings = findChildren(tree, parentPath);
    const fileName = uniqueName(siblings, "untitled", ".svg");
    const filePath = parentPath ? `${parentPath}/${fileName}` : fileName;
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>`;
    await writeTextFile(dirHandleRef.current, filePath, svgContent);
    await rescan();
    return filePath;
  } catch (e) {
    reportError(e, `Creating SVG in ${parentPath || "(root)"}`);
    return null;
  }
}, [tree, rescan, reportError]);
```

Then add `createSVG` to the return object (alongside `createFile`, `createDocument`):
```ts
  return {
    // ...existing fields...
    createFile,
    createDocument,
    createSVG,        // ← add this line
    createFolder,
    // ...rest unchanged...
  };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose useFileExplorer.operations
```
Expected: all `createSVG` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/shared/hooks/useFileExplorer.ts \
        src/app/knowledge_base/shared/hooks/useFileExplorer.operations.test.tsx
git commit -m "feat(svg-editor): add createSVG to useFileExplorer"
```

---

## Task 3: Explorer "New SVG" button and context menu item

**Files:**
- Modify: `src/app/knowledge_base/shared/components/explorer/ExplorerPanel.tsx`
- Modify: `src/app/knowledge_base/shared/components/explorer/TreeNodeRow.tsx`
- Test: `src/app/knowledge_base/shared/components/explorer/ExplorerPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/app/knowledge_base/shared/components/explorer/ExplorerPanel.test.tsx`, add:

```tsx
it('calls onCreateSVG when "SVG" is clicked in the New submenu', async () => {
  const onCreateSVG = vi.fn().mockResolvedValue('untitled.svg');
  // Render ExplorerPanel with a folder node and right-click to open context menu
  // (follow the existing pattern for Diagram/Document in the same test file)
  render(
    <ExplorerPanel
      // required props — use minimal stubs matching existing tests in this file
      collapsed={false}
      onToggleCollapse={() => {}}
      directoryName="vault"
      tree={[{ name: 'notes', path: 'notes', fileType: 'folder', children: [] }]}
      leftPaneFile={null}
      rightPaneFile={null}
      dirtyFiles={new Set()}
      onOpenFolder={vi.fn()}
      onSelectFile={vi.fn()}
      onCreateFile={vi.fn().mockResolvedValue(null)}
      onCreateDocument={vi.fn().mockResolvedValue(null)}
      onCreateSVG={onCreateSVG}
      onCreateFolder={vi.fn().mockResolvedValue(null)}
      onDeleteFile={vi.fn()}
      onDeleteFolder={vi.fn()}
      onRenameFile={vi.fn()}
      onRenameFolder={vi.fn()}
      onDuplicateFile={vi.fn()}
      onMoveItem={vi.fn()}
      sort={{ field: 'name', direction: 'asc', grouping: 'files-first' }}
      onSortChange={vi.fn()}
      filter={null}
    />
  );
  // Right-click on the folder row to open the context menu
  const folderRow = screen.getByText('notes');
  fireEvent.contextMenu(folderRow);
  // Hover over "New" to open the submenu
  const newButton = screen.getByText('New');
  fireEvent.mouseEnter(newButton.closest('div')!);
  // Click "SVG"
  const svgButton = await screen.findByText('SVG');
  fireEvent.click(svgButton);
  expect(onCreateSVG).toHaveBeenCalledWith('notes');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose ExplorerPanel.test
```
Expected: FAIL — `onCreateSVG` prop not recognized.

- [ ] **Step 3: Add onCreateSVG prop to ExplorerPanel**

In `src/app/knowledge_base/shared/components/explorer/ExplorerPanel.tsx`:

Add `FileImage` to lucide-react import (line 5–8 area):
```ts
import {
  ChevronRight,
  FilePlus, FolderPlus, FileText, FileImage, Trash2, Pencil, Copy, Clipboard, FileSymlink, FolderSymlink,
} from "lucide-react";
```

Add `onCreateSVG` to the props interface (after `onCreateDocument`, around line 31):
```ts
  onCreateSVG: (parentPath: string) => Promise<string | null>;
```

Destructure it in the component function signature (after `onCreateDocument`):
```ts
  onCreateSVG,
```

Add `handleCreateSVG` callback (after `handleCreateDocument` around line 232):
```ts
const handleCreateSVG = useCallback(async (parentPath: string = "") => {
  if (parentPath) setExpandedFolders((prev) => new Set(prev).add(parentPath));
  const resultPath = await onCreateSVG(parentPath);
  if (resultPath) {
    setEditingPath(resultPath);
    setEditValue(resultPath.split("/").pop() || "untitled.svg");
    setEditType("file");
  }
}, [onCreateSVG]);
```

Add SVG button to the New submenu in the context menu (between the Diagram and Document buttons, around line 597):
```tsx
<button
  className={`${btnClass} text-ink-2 hover:bg-surface-2`}
  onClick={() => { handleCreateSVG(contextMenu.path); setContextMenu(null); setNewSubMenuOpen(false); }}
>
  <FileImage size={15} className="text-mute" />
  SVG
</button>
```

Pass `handleCreateSVG` to `TreeNodeRow` — there are two call sites in ExplorerPanel.tsx. Add `handleCreateSVG={handleCreateSVG}` to both:

Line ~352 (main tree render):
```tsx
handleCreateFile={handleCreateFile}
handleCreateDocument={handleCreateDocument}
handleCreateSVG={handleCreateSVG}   {/* ← add */}
handleCreateFolder={handleCreateFolder}
```

Line ~420 (recursive tree render inside each folder node):
```tsx
handleCreateFile={handleCreateFile}
handleCreateDocument={handleCreateDocument}
handleCreateSVG={handleCreateSVG}   {/* ← add */}
handleCreateFolder={handleCreateFolder}
```

- [ ] **Step 4: Add handleCreateSVG to TreeNodeRow**

In `src/app/knowledge_base/shared/components/explorer/TreeNodeRow.tsx`:

Add `FileImage` to lucide-react import (line 4–8 area):
```ts
import {
  Folder, FileText, FileJson, FileImage,
  FilePlus, FolderPlus, Pencil, Copy,
} from "lucide-react";
```

Add `handleCreateSVG` to the props interface (after `handleCreateFile` or `handleCreateDocument`, line ~53):
```ts
  handleCreateSVG: (parentPath?: string) => void;
```

Add the hover button in the folder row (after the "New Diagram" hover button, around line 183):
```tsx
<HoverBtn onClick={() => handleCreateSVG(node.path)} title="New SVG">
  <FileImage size={13} className="text-mute hover:text-ink-2" />
</HoverBtn>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose ExplorerPanel.test
```
Expected: the new SVG test PASSES.

- [ ] **Step 6: Run full test suite**

```bash
npm run test:run
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/shared/components/explorer/ExplorerPanel.tsx \
        src/app/knowledge_base/shared/components/explorer/TreeNodeRow.tsx \
        src/app/knowledge_base/shared/components/explorer/ExplorerPanel.test.tsx
git commit -m "feat(svg-editor): New SVG button and context menu item in file explorer"
```

---

## Task 4: SVGCanvas component

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.tsx`
- Create: `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.test.tsx`

Install the package first:

- [ ] **Step 1: Install @svgedit/svgcanvas**

```bash
npm install @svgedit/svgcanvas
```
Expected: package added to `package.json`.

- [ ] **Step 2: Write the failing test**

Create `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { createRef } from 'react';
import SVGCanvas, { type SVGCanvasHandle } from './SVGCanvas';

// Mock @svgedit/svgcanvas
const mockGetSvgString = vi.fn().mockReturnValue('<svg></svg>');
const mockSetSvgString = vi.fn().mockReturnValue(true);
const mockSetMode = vi.fn();
const mockUndo = vi.fn();
const mockRedo = vi.fn();
const mockSetZoom = vi.fn();
const mockGetZoom = vi.fn().mockReturnValue(1);
const mockBind = vi.fn();

const MockSvgCanvas = vi.fn().mockImplementation(() => ({
  getSvgString: mockGetSvgString,
  setSvgString: mockSetSvgString,
  setMode: mockSetMode,
  undoMgr: { undo: mockUndo, redo: mockRedo },
  setZoom: mockSetZoom,
  getZoom: mockGetZoom,
  bind: mockBind,
}));

vi.mock('@svgedit/svgcanvas', () => ({ default: MockSvgCanvas }));

describe('SVGCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes SvgCanvas on mount', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    expect(MockSvgCanvas).toHaveBeenCalledTimes(1);
  });

  it('exposes getSvgString via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    const result = ref.current?.getSvgString();
    expect(mockGetSvgString).toHaveBeenCalled();
    expect(result).toBe('<svg></svg>');
  });

  it('exposes setSvgString via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    ref.current?.setSvgString('<svg><rect/></svg>');
    expect(mockSetSvgString).toHaveBeenCalledWith('<svg><rect/></svg>');
  });

  it('exposes setMode via ref', async () => {
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={() => {}} />);
    });
    ref.current?.setMode('rect');
    expect(mockSetMode).toHaveBeenCalledWith('rect');
  });

  it('calls onChanged when canvas fires changed event', async () => {
    const onChanged = vi.fn();
    const ref = createRef<SVGCanvasHandle>();
    await act(async () => {
      render(<SVGCanvas ref={ref} onChanged={onChanged} />);
    });
    // Simulate canvas firing 'changed' by calling the bound callback
    const boundCallback = mockBind.mock.calls.find(([event]) => event === 'changed')?.[1];
    expect(boundCallback).toBeDefined();
    boundCallback?.();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose SVGCanvas.test
```
Expected: FAIL — `Cannot find module './SVGCanvas'`

- [ ] **Step 4: Implement SVGCanvas.tsx**

Create `src/app/knowledge_base/features/svgEditor/components/SVGCanvas.tsx`:

```tsx
"use client";

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from "react";

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

interface SVGCanvasProps {
  onChanged: () => void;
}

const SVGCanvas = forwardRef<SVGCanvasHandle, SVGCanvasProps>(function SVGCanvas(
  { onChanged },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    import("@svgedit/svgcanvas").then(({ default: SvgCanvas }) => {
      if (cancelled || !containerRef.current) return;
      const canvas = new SvgCanvas(containerRef.current, {
        canvas_expansion: 3,
        initFill: { color: "ffffff", opacity: 1 },
        initStroke: { color: "000000", opacity: 1, width: 1 },
        initOpacity: 1,
        dimensions: [800, 600],
      });
      canvasRef.current = canvas;
      canvas.bind("changed", () => onChangedRef.current());
    });

    return () => {
      cancelled = true;
      canvasRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getSvgString: () => canvasRef.current?.getSvgString() ?? "",
    setSvgString: (svg: string) => canvasRef.current?.setSvgString(svg),
    setMode: (tool: SVGTool) => canvasRef.current?.setMode(tool),
    undo: () => canvasRef.current?.undoMgr?.undo(),
    redo: () => canvasRef.current?.undoMgr?.redo(),
    zoomIn: () => {
      const z = canvasRef.current?.getZoom() ?? 1;
      canvasRef.current?.setZoom(z * 1.2);
    },
    zoomOut: () => {
      const z = canvasRef.current?.getZoom() ?? 1;
      canvasRef.current?.setZoom(z / 1.2);
    },
    zoomFit: () => canvasRef.current?.zoomChanged?.(window, "fit"),
  }));

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full overflow-auto"
      data-testid="svg-canvas-container"
    />
  );
});

export default SVGCanvas;
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose SVGCanvas.test
```
Expected: all 5 SVGCanvas tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/components/SVGCanvas.tsx \
        src/app/knowledge_base/features/svgEditor/components/SVGCanvas.test.tsx \
        package.json package-lock.json
git commit -m "feat(svg-editor): SVGCanvas component wrapping @svgedit/svgcanvas"
```

---

## Task 5: SVGToolbar component

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.tsx`
- Create: `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SVGToolbar from './SVGToolbar';
import type { SVGTool } from './SVGCanvas';

describe('SVGToolbar', () => {
  const defaultProps = {
    activeTool: 'select' as SVGTool,
    onToolChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomFit: vi.fn(),
  };

  it('renders all tool buttons', () => {
    render(<SVGToolbar {...defaultProps} />);
    expect(screen.getByTitle('Select (S)')).toBeInTheDocument();
    expect(screen.getByTitle('Rectangle (R)')).toBeInTheDocument();
    expect(screen.getByTitle('Ellipse (E)')).toBeInTheDocument();
    expect(screen.getByTitle('Line (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Path (P)')).toBeInTheDocument();
    expect(screen.getByTitle('Text (T)')).toBeInTheDocument();
  });

  it('calls onToolChange with correct tool when a tool button is clicked', () => {
    const onToolChange = vi.fn();
    render(<SVGToolbar {...defaultProps} onToolChange={onToolChange} />);
    fireEvent.click(screen.getByTitle('Rectangle (R)'));
    expect(onToolChange).toHaveBeenCalledWith('rect');
  });

  it('highlights the active tool', () => {
    render(<SVGToolbar {...defaultProps} activeTool="rect" />);
    const rectBtn = screen.getByTitle('Rectangle (R)');
    expect(rectBtn).toHaveAttribute('data-active', 'true');
  });

  it('calls onUndo when Undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<SVGToolbar {...defaultProps} onUndo={onUndo} />);
    fireEvent.click(screen.getByTitle('Undo'));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('calls onRedo when Redo button is clicked', () => {
    const onRedo = vi.fn();
    render(<SVGToolbar {...defaultProps} onRedo={onRedo} />);
    fireEvent.click(screen.getByTitle('Redo'));
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('calls onZoomIn when Zoom In button is clicked', () => {
    const onZoomIn = vi.fn();
    render(<SVGToolbar {...defaultProps} onZoomIn={onZoomIn} />);
    fireEvent.click(screen.getByTitle('Zoom in'));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
  });

  it('calls onZoomFit when Fit button is clicked', () => {
    const onZoomFit = vi.fn();
    render(<SVGToolbar {...defaultProps} onZoomFit={onZoomFit} />);
    fireEvent.click(screen.getByTitle('Fit'));
    expect(onZoomFit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose SVGToolbar.test
```
Expected: FAIL — `Cannot find module './SVGToolbar'`

- [ ] **Step 3: Implement SVGToolbar.tsx**

Create `src/app/knowledge_base/features/svgEditor/components/SVGToolbar.tsx`:

```tsx
import React from "react";
import {
  MousePointer2, Square, Circle, Minus, PenTool, Type,
  Undo2, Redo2, ZoomIn, ZoomOut, Maximize2,
} from "lucide-react";
import type { SVGTool } from "./SVGCanvas";

interface SVGToolbarProps {
  activeTool: SVGTool;
  onToolChange: (tool: SVGTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomFit: () => void;
}

const TOOLS: { tool: SVGTool; Icon: React.ElementType; title: string }[] = [
  { tool: "select",  Icon: MousePointer2, title: "Select (S)"    },
  { tool: "rect",    Icon: Square,        title: "Rectangle (R)"  },
  { tool: "ellipse", Icon: Circle,        title: "Ellipse (E)"    },
  { tool: "line",    Icon: Minus,         title: "Line (L)"       },
  { tool: "path",    Icon: PenTool,       title: "Path (P)"       },
  { tool: "text",    Icon: Type,          title: "Text (T)"       },
];

const btnBase = "p-1.5 rounded transition-colors";
const btnActive = "bg-surface-2 text-ink";
const btnInactive = "text-mute hover:text-ink-2 hover:bg-surface-2";

export default function SVGToolbar({
  activeTool, onToolChange, onUndo, onRedo, onZoomIn, onZoomOut, onZoomFit,
}: SVGToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-line bg-surface flex-shrink-0">
      {/* Drawing tools */}
      {TOOLS.map(({ tool, Icon, title }) => (
        <button
          key={tool}
          title={title}
          data-active={activeTool === tool}
          className={`${btnBase} ${activeTool === tool ? btnActive : btnInactive}`}
          onClick={() => onToolChange(tool)}
        >
          <Icon size={14} />
        </button>
      ))}

      <div className="w-px h-4 bg-line mx-1" />

      {/* History */}
      <button title="Undo" className={`${btnBase} ${btnInactive}`} onClick={onUndo}>
        <Undo2 size={14} />
      </button>
      <button title="Redo" className={`${btnBase} ${btnInactive}`} onClick={onRedo}>
        <Redo2 size={14} />
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Zoom */}
      <button title="Zoom in" className={`${btnBase} ${btnInactive}`} onClick={onZoomIn}>
        <ZoomIn size={14} />
      </button>
      <button title="Zoom out" className={`${btnBase} ${btnInactive}`} onClick={onZoomOut}>
        <ZoomOut size={14} />
      </button>
      <button title="Fit" className={`${btnBase} ${btnInactive}`} onClick={onZoomFit}>
        <Maximize2 size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose SVGToolbar.test
```
Expected: all 7 SVGToolbar tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/components/SVGToolbar.tsx \
        src/app/knowledge_base/features/svgEditor/components/SVGToolbar.test.tsx
git commit -m "feat(svg-editor): SVGToolbar component"
```

---

## Task 6: useSVGPersistence hook

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.ts`
- Create: `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSVGPersistence } from './useSVGPersistence';
import type { SVGCanvasHandle } from '../components/SVGCanvas';

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"></svg>';
const EDITED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect/></svg>';

function makeCanvas(svgContent = EMPTY_SVG): SVGCanvasHandle & { _content: string } {
  const canvas = {
    _content: svgContent,
    getSvgString: vi.fn(() => canvas._content),
    setSvgString: vi.fn((s: string) => { canvas._content = s; }),
    setMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomFit: vi.fn(),
  };
  return canvas;
}

function makeRef<T>(val: T) {
  return { current: val };
}

const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(EMPTY_SVG);
const dirHandleRef = makeRef({} as FileSystemDirectoryHandle);

vi.mock('../../../shared/hooks/fileExplorerHelpers', () => ({
  resolveParentHandle: vi.fn().mockResolvedValue({
    getFileHandle: vi.fn().mockResolvedValue({
      getFile: vi.fn().mockResolvedValue({ text: mockReadFile }),
    }),
  }),
}));

vi.mock('../../../shared/hooks/useFileExplorer', () => ({
  writeTextFile: mockWriteFile,
}));

describe('useSVGPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue(EMPTY_SVG);
    mockWriteFile.mockResolvedValue(undefined);
  });

  it('starts with isDirty = false', () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence(null, dirHandleRef, canvasRef)
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('loads file content when activeFile is set', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    expect(canvas.setSvgString).toHaveBeenCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });

  it('sets isDirty to true when onChanged is called', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
  });

  it('handleSave writes getSvgString output and resets isDirty', async () => {
    const canvas = makeCanvas();
    canvas._content = EDITED_SVG;
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    act(() => { result.current.onChanged(); });
    expect(result.current.isDirty).toBe(true);
    await act(async () => { await result.current.handleSave(); });
    expect(mockWriteFile).toHaveBeenCalledWith(
      dirHandleRef.current, 'drawing.svg', EDITED_SVG
    );
    expect(result.current.isDirty).toBe(false);
  });

  it('handleDiscard re-reads the file and resets isDirty', async () => {
    const canvas = makeCanvas();
    const canvasRef = makeRef<SVGCanvasHandle>(canvas);
    const { result } = renderHook(() =>
      useSVGPersistence('drawing.svg', dirHandleRef, canvasRef)
    );
    await act(async () => {});
    act(() => { result.current.onChanged(); });
    await act(async () => { await result.current.handleDiscard(); });
    expect(canvas.setSvgString).toHaveBeenLastCalledWith(EMPTY_SVG);
    expect(result.current.isDirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose useSVGPersistence.test
```
Expected: FAIL — `Cannot find module './useSVGPersistence'`

- [ ] **Step 3: Implement useSVGPersistence.ts**

Create `src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.ts`:

```ts
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { writeTextFile } from "../../../shared/hooks/useFileExplorer";
import { resolveParentHandle, readTextFile } from "../../../shared/hooks/fileExplorerHelpers";
import type { SVGCanvasHandle } from "../components/SVGCanvas";

async function readSVGFile(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<string> {
  const parent = await resolveParentHandle(root, filePath);
  const name = filePath.split("/").pop()!;
  const fh = await parent.getFileHandle(name);
  return readTextFile(fh);
}

export function useSVGPersistence(
  activeFile: string | null,
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>,
  canvasRef: React.RefObject<SVGCanvasHandle | null>,
) {
  const [isDirty, setIsDirty] = useState(false);
  const snapshotRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load file content whenever activeFile changes.
  useEffect(() => {
    if (!activeFile || !dirHandleRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const content = await readSVGFile(dirHandleRef.current!, activeFile);
        if (cancelled) return;
        canvasRef.current?.setSvgString(content);
        snapshotRef.current = canvasRef.current?.getSvgString() ?? content;
        setIsDirty(false);
      } catch {
        // file unreadable — leave canvas as-is
      }
    })();
    return () => { cancelled = true; };
  // canvasRef and dirHandleRef are refs — stable identity; activeFile is the right trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  // Called by SVGCanvas on every canvas change event.
  const onChanged = useCallback(() => {
    setIsDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!activeFile || !canvasRef.current || !dirHandleRef.current) return;
      const svg = canvasRef.current.getSvgString();
      await writeTextFile(dirHandleRef.current, activeFile, svg).catch(() => {});
    }, 1500);
  }, [activeFile, canvasRef, dirHandleRef]);

  const handleSave = useCallback(async () => {
    if (!activeFile || !canvasRef.current || !dirHandleRef.current) return;
    const svg = canvasRef.current.getSvgString();
    await writeTextFile(dirHandleRef.current, activeFile, svg);
    snapshotRef.current = svg;
    setIsDirty(false);
  }, [activeFile, canvasRef, dirHandleRef]);

  const handleDiscard = useCallback(async () => {
    if (!activeFile || !dirHandleRef.current) return;
    try {
      const content = await readSVGFile(dirHandleRef.current, activeFile);
      canvasRef.current?.setSvgString(content);
      snapshotRef.current = canvasRef.current?.getSvgString() ?? content;
      setIsDirty(false);
    } catch {
      // ignore
    }
  }, [activeFile, canvasRef, dirHandleRef]);

  return { isDirty, onChanged, handleSave, handleDiscard };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose useSVGPersistence.test
```
Expected: all 5 `useSVGPersistence` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.ts \
        src/app/knowledge_base/features/svgEditor/hooks/useSVGPersistence.test.ts
git commit -m "feat(svg-editor): useSVGPersistence hook"
```

---

## Task 7: SVGEditorView component

**Files:**
- Create: `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx`
- Create: `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import SVGEditorView from './SVGEditorView';
import type { SVGEditorBridge } from './SVGEditorView';

// Mock SVGCanvas to avoid @svgedit/svgcanvas in tests
vi.mock('./components/SVGCanvas', () => ({
  default: vi.fn().mockImplementation(
    React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        getSvgString: () => '<svg></svg>',
        setSvgString: vi.fn(),
        setMode: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        zoomIn: vi.fn(),
        zoomOut: vi.fn(),
        zoomFit: vi.fn(),
      }));
      return <div data-testid="svg-canvas" />;
    })
  ),
}));

vi.mock('./hooks/useSVGPersistence', () => ({
  useSVGPersistence: vi.fn().mockReturnValue({
    isDirty: false,
    onChanged: vi.fn(),
    handleSave: vi.fn(),
    handleDiscard: vi.fn(),
  }),
}));

const mockFileExplorer = {
  dirHandleRef: { current: {} as FileSystemDirectoryHandle },
  tree: [],
  activeFile: null,
  isLoading: false,
  supported: true,
  dirtyFiles: new Set<string>(),
  pendingFile: null,
  clearPendingFile: vi.fn(),
  openFolder: vi.fn(),
  selectFile: vi.fn(),
  saveFile: vi.fn(),
  createFile: vi.fn(),
  createDocument: vi.fn(),
  createSVG: vi.fn(),
  createFolder: vi.fn(),
  deleteFile: vi.fn(),
  deleteFolder: vi.fn(),
  renameFile: vi.fn(),
  renameFolder: vi.fn(),
  duplicateFile: vi.fn(),
  moveItem: vi.fn(),
  discardFile: vi.fn(),
  markDirty: vi.fn(),
  refresh: vi.fn(),
  watcherRescan: vi.fn(),
  handleFallbackInput: vi.fn(),
  inputRef: { current: null },
  setActiveFile: vi.fn(),
  rootHandle: null,
  directoryName: 'vault',
};

describe('SVGEditorView', () => {
  const onSVGEditorBridge = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PaneHeader with the filename as title', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="diagrams/logo.svg"
          fileExplorer={mockFileExplorer as ReturnType<typeof import('../../shared/hooks/useFileExplorer').useFileExplorer>}
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(screen.getByText('logo')).toBeInTheDocument();
  });

  it('renders SVGToolbar', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="logo.svg"
          fileExplorer={mockFileExplorer as ReturnType<typeof import('../../shared/hooks/useFileExplorer').useFileExplorer>}
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(screen.getByTitle('Select (S)')).toBeInTheDocument();
  });

  it('emits bridge with isDirty=false on mount', async () => {
    await act(async () => {
      render(
        <SVGEditorView
          focused={true}
          side="left"
          activeFile="logo.svg"
          fileExplorer={mockFileExplorer as ReturnType<typeof import('../../shared/hooks/useFileExplorer').useFileExplorer>}
          onSVGEditorBridge={onSVGEditorBridge}
        />
      );
    });
    expect(onSVGEditorBridge).toHaveBeenCalledWith(
      expect.objectContaining({ isDirty: false })
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:run -- --reporter=verbose SVGEditorView.test
```
Expected: FAIL — `Cannot find module './SVGEditorView'`

- [ ] **Step 3: Implement SVGEditorView.tsx**

Create `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx`:

```tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { useFileExplorer } from "../shared/hooks/useFileExplorer";
import PaneHeader from "../shared/components/PaneHeader";
import SVGCanvas, { type SVGCanvasHandle, type SVGTool } from "./components/SVGCanvas";
import SVGToolbar from "./components/SVGToolbar";
import { useSVGPersistence } from "./hooks/useSVGPersistence";

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

function fileNameWithoutExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.svg$/i, "");
}

export default function SVGEditorView({
  focused,
  side,
  activeFile,
  fileExplorer,
  onSVGEditorBridge,
}: SVGEditorViewProps) {
  const canvasRef = useRef<SVGCanvasHandle | null>(null);
  const [activeTool, setActiveTool] = useState<SVGTool>("select");

  const { isDirty, onChanged, handleSave, handleDiscard } = useSVGPersistence(
    activeFile,
    fileExplorer.dirHandleRef,
    canvasRef,
  );

  const title = activeFile ? fileNameWithoutExtension(activeFile) : "Untitled";

  // Emit bridge to shell on every relevant state change.
  useEffect(() => {
    onSVGEditorBridge({ isDirty, title, onSave: handleSave, onDiscard: handleDiscard });
  }, [isDirty, title, handleSave, handleDiscard, onSVGEditorBridge]);

  const handleToolChange = useCallback((tool: SVGTool) => {
    setActiveTool(tool);
    canvasRef.current?.setMode(tool);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      <PaneHeader
        filePath={activeFile ?? ""}
        readOnly={false}
        title={title}
        isDirty={isDirty}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
      <SVGToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onUndo={() => canvasRef.current?.undo()}
        onRedo={() => canvasRef.current?.redo()}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        onZoomFit={() => canvasRef.current?.zoomFit()}
      />
      <SVGCanvas
        ref={canvasRef}
        onChanged={onChanged}
      />
    </div>
  );
}
```

The import path for `useFileExplorer` type (feature is at `features/svgEditor/`, shared hooks are at `shared/hooks/`):
```ts
import type { useFileExplorer } from "../../shared/hooks/useFileExplorer";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:run -- --reporter=verbose SVGEditorView.test
```
Expected: all 3 `SVGEditorView` tests PASS.

- [ ] **Step 5: Run full test suite**

```bash
npm run test:run
```
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx \
        src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx
git commit -m "feat(svg-editor): SVGEditorView pane component"
```

---

## Task 8: Wire into knowledgeBase.tsx shell

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Modify: `Features.md`
- Modify: `test-cases/05-links-and-graph.md` (or the appropriate test-cases file)

- [ ] **Step 1: Add import for SVGEditorView in knowledgeBase.tsx**

At the top of `src/app/knowledge_base/knowledgeBase.tsx`, add alongside the DiagramView import:

```ts
import SVGEditorView, { type SVGEditorBridge } from "./features/svgEditor/SVGEditorView";
```

- [ ] **Step 2: Add SVG editor bridge state (alongside diagramBridgeRef)**

Near line 109 where `diagramBridgeRef` is declared, add:

```ts
const svgEditorBridgeRef = useRef<SVGEditorBridge | null>(null);
const [svgEditorBridge, setSVGEditorBridge] = useState<SVGEditorBridge | null>(null);
const handleSVGEditorBridge = useCallback((bridge: SVGEditorBridge) => {
  svgEditorBridgeRef.current = bridge;
  setSVGEditorBridge(bridge);
}, []);
```

- [ ] **Step 3: Update handleSelectFile to route .svg files**

In `knowledgeBase.tsx` around line 328, update `handleSelectFile`:

```ts
const handleSelectFile = useCallback((path: string) => {
  if (path.endsWith(".md")) {
    handleOpenDocument(path);
  } else if (path.endsWith(".svg")) {
    panes.openFile(path, "svgEditor");
  } else {
    panes.openFile(path, "diagram");
  }
}, [handleOpenDocument, panes]);
```

- [ ] **Step 4: Add svgEditor case in renderPane**

In `knowledgeBase.tsx` around line 780, after the `"diagram"` block and before the DocumentView fallback, add:

```tsx
if (entry.fileType === "svgEditor") {
  return (
    <SVGEditorView
      focused={focused}
      side={side}
      activeFile={entry.filePath}
      fileExplorer={fileExplorer}
      onSVGEditorBridge={handleSVGEditorBridge}
    />
  );
}
```

- [ ] **Step 5: Wire Cmd+S for SVG editor**

The Cmd+S handler is in `knowledgeBase.tsx` at line 389. Inside the handler, around line 409 there is:

```ts
// Always try to save diagram if there's an active diagram file
if (!activeEntry || activeEntry.fileType === "diagram") {
  diagramBridgeRef.current?.onSave();
}
```

Add the SVG editor branch BEFORE that block:

```ts
if (activeEntry?.fileType === "svgEditor") {
  svgEditorBridgeRef.current?.onSave();
  return;
}
// Always try to save diagram if there's an active diagram file
if (!activeEntry || activeEntry.fileType === "diagram") {
  diagramBridgeRef.current?.onSave();
}
```

- [ ] **Step 6: Add onCreateSVG to both ExplorerPanel usages**

There are two `<ExplorerPanel` usages in `knowledgeBase.tsx` (desktop ~line 907, mobile ~line 1020). Add `onCreateSVG` to both:

```tsx
onCreateSVG={async (parentPath) => {
  const resultPath = await fileExplorer.createSVG(parentPath);
  if (resultPath) handleSelectFile(resultPath);
  return resultPath;
}}
```

- [ ] **Step 7: Run TypeScript check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 8: Update Features.md**

In `Features.md`, add a new top-level section after `## 4. Document Editor` (which ends around the line before `## 5. Cross-Cutting Link & Graph Layer`). Insert it as `## 4.5 SVG Editor` or renumber section 5+ by 1. The new section content:

```markdown
### §X.Y SVG Editor Pane ✅
- Opens `.svg` files from the vault in a dedicated editor pane (`src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx`)
- Uses `@svgedit/svgcanvas` for the drawing canvas — renders into a `div` ref via imperative API
- Toolbar tools: Select, Rectangle, Ellipse, Line, Path, Text, Undo/Redo, Zoom In/Out/Fit (`SVGToolbar.tsx`)
- Load/save: reads `.svg` file on pane open, writes on Cmd+S or auto-save (1.5 s debounce) (`useSVGPersistence.ts`)
- Dirty tracking: compares `getSvgString()` output to last-saved snapshot
- File creation: "New SVG" in the explorer folder context menu and folder hover buttons
- SVG files persist in the vault alongside documents and diagrams
```

- [ ] **Step 9: Create test-cases/06-svg-editor.md**

Create a new file `test-cases/06-svg-editor.md` with this content:

```markdown
# 6. SVG Editor

Test cases for the SVG editor pane (`SVGEditorView`, `SVGCanvas`, `SVGToolbar`, `useSVGPersistence`).

## 6.1 File creation & routing

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.1-01 | Right-click folder → New → SVG → creates `untitled.svg` and opens editor pane | ❌ |
| SVG-6.1-02 | Hover on folder in explorer → New SVG icon button creates `untitled.svg` | ❌ |
| SVG-6.1-03 | Click `.svg` file in explorer → opens SVG editor pane (not document or diagram pane) | ❌ |

## 6.2 Pane chrome

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.2-01 | SVG editor pane shows PaneHeader with filename without `.svg` extension as title | ❌ |
| SVG-6.2-02 | PaneHeader shows Save and Discard buttons when isDirty=true | ❌ |
| SVG-6.2-03 | Reload page → SVG editor pane is restored from saved pane layout | 🚫 (File System Access API) |

## 6.3 Toolbar

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.3-01 | All 6 tool buttons render (Select, Rectangle, Ellipse, Line, Path, Text) | ❌ |
| SVG-6.3-02 | Clicking a tool button highlights it as active | ❌ |
| SVG-6.3-03 | Undo / Redo buttons are present | ❌ |
| SVG-6.3-04 | Zoom In / Zoom Out / Fit buttons are present | ❌ |

## 6.4 Persistence

| ID | Scenario | Status |
|----|----------|--------|
| SVG-6.4-01 | Drawing on canvas sets isDirty=true (unit: useSVGPersistence onChanged) | ❌ |
| SVG-6.4-02 | Cmd+S saves SVG to vault file and clears dirty (unit: useSVGPersistence handleSave) | ❌ |
| SVG-6.4-03 | Discard re-reads file from disk and clears dirty (unit: useSVGPersistence handleDiscard) | ❌ |
| SVG-6.4-04 | Auto-save fires after 1.5 s of inactivity (unit: useSVGPersistence debounce) | ❌ |
```

- [ ] **Step 10: Run full test suite**

```bash
npm run test:run
```
Expected: all tests pass.

- [ ] **Step 11: Run TypeScript check**

```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx \
        Features.md \
        test-cases/
git commit -m "feat(svg-editor): wire SVGEditorView into shell — routing, renderPane, explorer"
```

---

## Verification

1. Open the dev server: `npm run dev`
2. Open a vault with the file picker
3. Right-click a folder → **New → SVG** → `untitled.svg` appears in the tree, SVG editor pane opens with a blank canvas
4. Click the Rectangle tool → draw on the canvas → dirty indicator (dot) appears in PaneHeader
5. Press **Cmd+S** → dirty indicator clears, `.svg` file on disk contains the SVG markup
6. Click **Discard** → canvas resets to the pre-edit state
7. Reload the page → SVG editor pane restores (same file reopens)
8. Click another `.svg` file in the explorer → opens in SVG editor pane (not document viewer)
9. Open `.archdesigner/config.json` is unaffected (SVG editor has no vault config entry)
