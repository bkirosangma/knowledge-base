# Knowledge Base Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the monolithic knowledge_base into two first-class features (Design + Document) with a shared shell, context-sensitive toolbar, and split-pane support.

**Architecture:** Extract the 1665-line `knowledgeBase.tsx` into a thin shell that composes `DesignView` and `DocumentView` via a `PaneManager`. Each feature owns its state, components, hooks, and properties panel. A `ToolbarContext` lets the Header adapt to whichever pane is focused.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tiptap, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-12-knowledge-base-restructure-design.md`

**Note:** This project has no test infrastructure. Verification for each task is `npx next build` succeeding (TypeScript + compilation) and visual confirmation via the running dev server.

---

## File Structure

### New files to create

```
src/app/knowledge_base/
  shell/
    ToolbarContext.tsx        — React context: active pane type, focused pane, toolbar registration
    PaneManager.tsx           — Manages 1-2 panes, renders DesignView or DocumentView per pane
  features/
    design/
      DesignView.tsx          — Entry point: all canvas state, hooks, JSX, design properties
      components/             — (moved from knowledge_base/components/)
      hooks/                  — (moved from knowledge_base/hooks/ — design-specific)
      properties/             — (moved from knowledge_base/components/properties/)
      utils/                  — (moved from knowledge_base/utils/ — design-specific)
      types.ts                — Design-specific types extracted from utils/types.ts
    document/
      DocumentView.tsx        — Entry point: markdown editor, doc state, doc properties
      components/             — (moved from knowledge_base/components/ — doc-specific)
      hooks/                  — (moved from knowledge_base/hooks/ — doc-specific)
      properties/
        DocumentProperties.tsx — NEW: backlinks, word count, linked designs, metadata
      extensions/             — (moved from knowledge_base/extensions/)
      utils/                  — (moved from knowledge_base/utils/ — doc-specific)
      types.ts                — Document-specific types extracted from utils/types.ts
  shared/
    components/               — SplitPane, Header, ExplorerPanel, ConfirmPopover, DocumentPicker
    hooks/                    — useFileExplorer, useFileActions, useActionHistory, etc.
    utils/                    — persistence, directoryScope
    types.ts                  — Shared types (DiagramData envelope, TreeNode, ViewMode, etc.)
```

### Files to delete

```
src/app/knowledge_base/page.tsx    — Route page (app moves to root)
src/app/page.tsx                   — Tortoise homepage (replaced)
```

---

## Task 1: Replace Homepage with Knowledge Base at Root Route

**Files:**
- Delete: `src/app/page.tsx` (tortoise homepage)
- Delete: `src/app/knowledge_base/page.tsx` (route wrapper)
- Create: `src/app/page.tsx` (new root — renders KnowledgeBase)

- [ ] **Step 1: Replace `src/app/page.tsx` with knowledge base root**

Delete the entire tortoise homepage and replace with:

```tsx
"use client";

import KnowledgeBase from "./knowledge_base/knowledgeBase";

export default function Home() {
  return <KnowledgeBase />;
}
```

- [ ] **Step 2: Delete `src/app/knowledge_base/page.tsx`**

Remove this file entirely — the route is now handled by the root `page.tsx`.

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds, route table shows `○ /` only (no `/knowledge_base`)

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git rm src/app/knowledge_base/page.tsx
git commit -m "refactor: move knowledge base to root route, remove tortoise homepage"
```

---

## Task 2: Create ToolbarContext

**Files:**
- Create: `src/app/knowledge_base/shell/ToolbarContext.tsx`

This context provides pane-type information so the Header can render the correct toolbar.

- [ ] **Step 1: Create `src/app/knowledge_base/shell/ToolbarContext.tsx`**

```tsx
"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

export type PaneType = "design" | "document";
export type FocusedPane = "left" | "right" | "single";

export interface ToolbarState {
  /** What type of content is in the active pane(s) */
  activePaneType: PaneType | "mixed";
  /** Which pane has focus */
  focusedPane: FocusedPane;
  /** Number of open panes */
  paneCount: 1 | 2;
}

interface ToolbarContextValue extends ToolbarState {
  setLeftPaneType: (type: PaneType | null) => void;
  setRightPaneType: (type: PaneType | null) => void;
  setFocusedPane: (pane: FocusedPane) => void;
}

const ToolbarContext = createContext<ToolbarContextValue | null>(null);

export function useToolbarContext(): ToolbarContextValue {
  const ctx = useContext(ToolbarContext);
  if (!ctx) throw new Error("useToolbarContext must be used within ToolbarProvider");
  return ctx;
}

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [leftType, setLeftType] = useState<PaneType | null>(null);
  const [rightType, setRightType] = useState<PaneType | null>(null);
  const [focused, setFocused] = useState<FocusedPane>("single");

  const setLeftPaneType = useCallback((type: PaneType | null) => setLeftType(type), []);
  const setRightPaneType = useCallback((type: PaneType | null) => setRightType(type), []);
  const setFocusedPane = useCallback((pane: FocusedPane) => setFocused(pane), []);

  const value = useMemo<ToolbarContextValue>(() => {
    const paneCount: 1 | 2 = rightType ? 2 : 1;
    let activePaneType: PaneType | "mixed";

    if (paneCount === 1) {
      activePaneType = leftType ?? "design";
    } else if (leftType === rightType) {
      activePaneType = leftType ?? "design";
    } else {
      // Mixed: use the focused pane's type
      activePaneType = focused === "right" ? (rightType ?? "design") : (leftType ?? "design");
    }

    return {
      activePaneType,
      focusedPane: paneCount === 1 ? "single" : focused,
      paneCount,
      setLeftPaneType,
      setRightPaneType,
      setFocusedPane,
    };
  }, [leftType, rightType, focused, setLeftPaneType, setRightPaneType, setFocusedPane]);

  return <ToolbarContext.Provider value={value}>{children}</ToolbarContext.Provider>;
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: PASS (new file, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/shell/ToolbarContext.tsx
git commit -m "feat: add ToolbarContext for context-sensitive header adaptation"
```

---

## Task 3: Create PaneManager

**Files:**
- Create: `src/app/knowledge_base/shell/PaneManager.tsx`

PaneManager tracks 1 or 2 open panes, renders the appropriate view component per pane, and updates ToolbarContext.

- [ ] **Step 1: Create `src/app/knowledge_base/shell/PaneManager.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SplitPane from "../components/SplitPane";
import { useToolbarContext } from "./ToolbarContext";
import type { PaneType, FocusedPane } from "./ToolbarContext";

export interface PaneEntry {
  filePath: string;
  fileType: PaneType;
}

interface PaneManagerProps {
  /** Render function for a pane — receives pane entry and whether it's focused */
  renderPane: (entry: PaneEntry, focused: boolean) => React.ReactNode;
  /** Fallback when no file is open */
  emptyState: React.ReactNode;
}

export function usePaneManager() {
  const [leftPane, setLeftPane] = useState<PaneEntry | null>(null);
  const [rightPane, setRightPane] = useState<PaneEntry | null>(null);
  const [focusedSide, setFocusedSide] = useState<"left" | "right">("left");

  const isSplit = rightPane !== null;

  const openFile = useCallback((filePath: string, fileType: PaneType) => {
    const entry: PaneEntry = { filePath, fileType };
    if (!isSplit) {
      setLeftPane(entry);
    } else if (focusedSide === "right") {
      setRightPane(entry);
    } else {
      setLeftPane(entry);
    }
  }, [isSplit, focusedSide]);

  const enterSplit = useCallback((filePath: string, fileType: PaneType) => {
    const entry: PaneEntry = { filePath, fileType };
    setRightPane(entry);
    setFocusedSide("right");
  }, []);

  const exitSplit = useCallback(() => {
    // Keep the focused pane
    if (focusedSide === "right" && rightPane) {
      setLeftPane(rightPane);
    }
    setRightPane(null);
    setFocusedSide("left");
  }, [focusedSide, rightPane]);

  const closeFocusedPane = useCallback(() => {
    if (!isSplit) {
      setLeftPane(null);
    } else if (focusedSide === "right") {
      setRightPane(null);
      setFocusedSide("left");
    } else {
      setLeftPane(rightPane);
      setRightPane(null);
      setFocusedSide("left");
    }
  }, [isSplit, focusedSide, rightPane]);

  const focusedPane = useMemo<FocusedPane>(
    () => (isSplit ? focusedSide : "single"),
    [isSplit, focusedSide],
  );

  const activeEntry = useMemo(
    () => (focusedSide === "right" && rightPane ? rightPane : leftPane),
    [focusedSide, rightPane, leftPane],
  );

  return {
    leftPane,
    rightPane,
    isSplit,
    focusedSide,
    focusedPane,
    activeEntry,
    openFile,
    enterSplit,
    exitSplit,
    closeFocusedPane,
    setFocusedSide,
  };
}

export default function PaneManager({ renderPane, emptyState }: PaneManagerProps) {
  const {
    leftPane, rightPane, isSplit, focusedSide, setFocusedSide,
  } = usePaneManager();

  const { setLeftPaneType, setRightPaneType, setFocusedPane } = useToolbarContext();

  // Sync pane types into toolbar context
  useEffect(() => {
    setLeftPaneType(leftPane?.fileType ?? null);
  }, [leftPane?.fileType, setLeftPaneType]);

  useEffect(() => {
    setRightPaneType(rightPane?.fileType ?? null);
  }, [rightPane?.fileType, setRightPaneType]);

  useEffect(() => {
    setFocusedPane(isSplit ? focusedSide : "single");
  }, [isSplit, focusedSide, setFocusedPane]);

  if (!leftPane) return <>{emptyState}</>;

  if (!isSplit) {
    return <>{renderPane(leftPane, true)}</>;
  }

  return (
    <SplitPane
      storageKey="knowledge-base-split"
      left={
        <div
          className={`h-full ${focusedSide === "left" ? "ring-2 ring-blue-400 ring-inset" : ""}`}
          onMouseDown={() => setFocusedSide("left")}
        >
          {renderPane(leftPane, focusedSide === "left")}
        </div>
      }
      right={
        <div
          className={`h-full ${focusedSide === "right" ? "ring-2 ring-blue-400 ring-inset" : ""}`}
          onMouseDown={() => setFocusedSide("right")}
        >
          {rightPane && renderPane(rightPane, focusedSide === "right")}
        </div>
      }
    />
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/shell/PaneManager.tsx
git commit -m "feat: add PaneManager for single and split pane layouts"
```

---

## Task 4: Extract DesignView from knowledgeBase.tsx

**Files:**
- Create: `src/app/knowledge_base/features/design/DesignView.tsx`
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

This is the largest task. DesignView receives file data and callbacks from the shell, and owns all canvas state, interaction hooks, and rendering.

- [ ] **Step 1: Define the DesignView props interface and create the file**

Create `src/app/knowledge_base/features/design/DesignView.tsx`. The props bridge between the shell and the design feature:

```tsx
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef, Selection, DocumentMeta } from "../../utils/types";
import type { DiagramSnapshot } from "../../hooks/useActionHistory";

export interface DesignViewProps {
  /** Whether this pane is focused (for keyboard shortcuts) */
  focused: boolean;

  /** File explorer state needed for file operations */
  activeFile: string | null;
  directoryHandle: FileSystemDirectoryHandle | null;
  markDirty: () => void;

  /** Diagram data — loaded by shell, owned by DesignView after load */
  initialData: {
    title: string;
    layers: LayerDef[];
    nodes: NodeData[];
    connections: Connection[];
    lineCurve: LineCurveAlgorithm;
    flows: FlowDef[];
  } | null;

  /** Callbacks back to shell */
  onSave: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onOpenDocument?: (path: string) => void;

  /** Document data for cross-reference display */
  documents?: DocumentMeta[];
  onAttachDocument?: (entityType: string, entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: string, entityId: string) => void;

  /** Toolbar state — reported up via ToolbarContext */
  isLive: boolean;
  onToggleLive: () => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  onAutoArrange?: (algorithm: string) => void;
}
```

- [ ] **Step 2: Move all design state from knowledgeBase.tsx into DesignView**

Move the following state declarations (lines 78-117 of knowledgeBase.tsx) into the DesignView component body:

- `hoveredLine`, `title`, `layerDefs`, `nodes`, `connections`, `lineCurve`, `flows` — initialized from `props.initialData`
- `hoveredNodeId`, `selection`, `measuredSizes`, `contextMenu`, `anchorPopup`
- `hoveredFlowId`, `hoveredType`, `expandedTypeInPanel`, `patches`
- `historyCollapsed`, `editingLabel`, `editingLabelValue`, `labelDragGhost`
- `titleInputValue`, `titleWidth`
- `pendingDeletion`, `pendingReconnect`
- All refs: `defaults`, `pendingSelection`, `anchorHoverTimer`, `anchorDismissTimer`, `editingLabelBeforeRef`, `labelDragStartT`, `labelDragNodeRects`, `labelLastValidT`, `pendingRecord`, `isRestoringRef`, `canvasRef`, `worldRef`, `prevWorldOriginRef`, `layerShiftsRef`, `nodesRef`, `connectionsRef`, `flowsRef`, `selectionRef`, `linesForSelection`, `regionsRef`, `levelMapRef`, `dragNodeLabelRef`

Move the following hooks:
- `useActionHistory`, `useCanvasCoords`, `useCanvasEffects`, `useDiagramPersistence`, `useViewportPersistence`
- `useNodeDrag`, `useLayerDrag`, `useLayerResize`, `useEndpointDrag`, `useSegmentDrag`, `useLineDrag`
- `useZoom`, `useDeletion`, `useFlowManagement`, `useLabelEditing`, `useAnchorConnections`
- `useCanvasInteraction`, `useKeyboardShortcuts`, `useDragEndRecorder`, `useSelectionRect`
- `useContextMenuActions`, `useSyncRef` (for nodes, connections, flows, selection refs)

Move the following computed values:
- `levelMap`, `regions`, `layerShifts`, `contentBounds`, `world`, `displayNodes`, `nodeMap`, `lines`, `ghostLine`, `sortedLines`, `flowDimSets`, `typeDimSets`

Move the following callbacks:
- All anchor popup handlers (lines 226-256)
- `handleElementResize`, `getNodeDimensions`
- `scheduleRecord` + the recording useEffect
- `handleAutoArrange`, `commitLabel`
- `handleDeleteAnchor`, `handleCreateLayer`, `handleCreateFlow`, `handleSelectFlow`, etc.
- `handleSelectType`

- [ ] **Step 3: Move the canvas JSX into DesignView's return**

Move the entire `viewMode === "diagram"` block (lines 901-1402 of knowledgeBase.tsx) into DesignView's JSX return. This includes:
- The canvas container with `ref={canvasRef}`
- All Layer rendering
- All Element rendering (Element + ConditionElement)
- The SVG connection/flow rendering
- Ghost elements during drag
- Label overlays

Also move these overlay components that are design-specific:
- `{contextMenu && <ContextMenu ... />}` (line 1435-1447)
- `{anchorPopup && <AnchorPopupMenu ... />}` (line 1449-1463)
- `{pendingDeletion && <FlowBreakWarningModal ... />}` (line 1620-1627)
- `{pendingReconnect && <FlowBreakWarningModal ... />}` (line 1629-1643)
- `{showMinimap && <Minimap ... />}` (line 1569-1580)
- `{hoveredLine tooltip}` (line 1582-1590)
- `<DiagramControls ... />` (line 1592-1595)

Include the `PropertiesPanel` rendering (lines 1465-1566) inside DesignView's return — it's design-specific.

DesignView wraps everything in a fragment returning two sibling divs:
1. The canvas viewport (flex-1)
2. The properties panel (flex-shrink-0, width 280)

- [ ] **Step 4: Update imports in DesignView**

All component imports that were in knowledgeBase.tsx and are design-specific move to DesignView:
- Canvas, Layer, Element, ConditionElement, DataLine, FlowDots
- ContextMenu, AnchorPopupMenu, Minimap, DiagramControls, HistoryPanel
- FlowBreakWarningModal, DocInfoBadge
- PropertiesPanel

All hook imports:
- useCanvasCoords, useCanvasEffects, useCanvasInteraction, useNodeDrag, etc.

All utility imports:
- anchors, orthogonalRouter, pathRouter, collisionUtils, conditionGeometry
- layerBounds, constants, geometry, levelModel

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: PASS — DesignView exists but is not yet wired into the shell.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/design/DesignView.tsx
git commit -m "feat: extract DesignView with all canvas state, hooks, and rendering"
```

---

## Task 5: Extract DocumentView from knowledgeBase.tsx

**Files:**
- Create: `src/app/knowledge_base/features/document/DocumentView.tsx`

- [ ] **Step 1: Create DocumentView with props interface**

```tsx
"use client";

import { useCallback, useState } from "react";
import MarkdownPane from "../../components/MarkdownPane";
import type { useDocuments } from "../../hooks/useDocuments";
import type { useLinkIndex } from "../../hooks/useLinkIndex";
import type { TreeNode } from "../../utils/types";

export interface DocumentViewProps {
  focused: boolean;

  /** Document state from useDocuments hook */
  docManager: ReturnType<typeof useDocuments>;

  /** Link index for backlinks */
  linkManager: ReturnType<typeof useLinkIndex>;

  /** File tree for doc path resolution */
  tree: TreeNode[];

  /** Callbacks */
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  onClose?: () => void;
}

export default function DocumentView({
  focused,
  docManager,
  linkManager,
  tree,
  onNavigateLink,
  onCreateDocument,
  onClose,
}: DocumentViewProps) {
  const docPaths = docManager.collectDocPaths(tree);
  const existingPaths = docManager.existingDocPaths(tree);

  const backlinks = docManager.activeDocPath
    ? linkManager.index.backlinks[docManager.activeDocPath] ?? []
    : [];

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 min-h-0">
        <MarkdownPane
          filePath={docManager.activeDocPath}
          content={docManager.activeDocContent}
          title={docManager.activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
          onChange={docManager.updateContent}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingPaths}
          allDocPaths={docPaths}
          backlinks={backlinks}
          onNavigateBacklink={(sourcePath) => onNavigateLink?.(sourcePath)}
          onClose={onClose}
        />
      </div>
      {/* DocumentProperties panel — Task 11 will add it here */}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/features/document/DocumentView.tsx
git commit -m "feat: extract DocumentView wrapping MarkdownPane with doc state"
```

---

## Task 6: Rewire KnowledgeBase.tsx as Thin Shell

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx` (1665 lines → ~300 lines)

This is the critical integration task. KnowledgeBase becomes a thin shell that composes Header, ExplorerPanel, and PaneManager.

- [ ] **Step 1: Rewrite knowledgeBase.tsx**

Replace the entire file. The new version:
- Wraps everything in `<ToolbarProvider>`
- Keeps: `fileExplorer`, `useFileActions`, sort prefs, explorer state, `useDocuments`, `useLinkIndex`, `confirmAction`
- Removes: all canvas state, all design hooks, all design JSX
- Uses `PaneManager` to render `DesignView` or `DocumentView` based on file type
- Reads `useToolbarContext()` to pass `activePaneType` to Header

The shell structure:

```tsx
export default function KnowledgeBase() {
  // File system
  const fileExplorer = useFileExplorer();
  const docManager = useDocuments();
  const linkManager = useLinkIndex();
  const panes = usePaneManager();

  // Explorer UI state
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [explorerFilter, setExplorerFilter] = useState<ExplorerFilter>("all");
  const [sortPrefs, setSortPrefs] = useState(...);
  const [confirmAction, setConfirmAction] = useState<...>(null);

  // File actions
  const fileActions = useFileActions({...});

  // Open file → determine type → route to pane
  const handleSelectFile = useCallback((path: string) => {
    const ext = path.split(".").pop();
    const fileType = ext === "md" ? "document" : "design";
    panes.openFile(path, fileType);
    // Load file content...
  }, [...]);

  // Render pane by type
  const renderPane = useCallback((entry: PaneEntry, focused: boolean) => {
    if (entry.fileType === "design") {
      return <DesignView focused={focused} {...designProps} />;
    }
    return <DocumentView focused={focused} {...docProps} />;
  }, [...]);

  return (
    <ToolbarProvider>
      <div className="w-full h-screen bg-[#f4f7f9] flex flex-col">
        <Header ... />
        <div className="flex-1 flex min-h-0">
          <ExplorerPanel ... />
          <PaneManager renderPane={renderPane} emptyState={<EmptyState />} />
        </div>
        <StatusBar ... />
      </div>
    </ToolbarProvider>
  );
}
```

- [ ] **Step 2: Update Header to read from ToolbarContext**

Modify `Header.tsx` to accept `activePaneType` from props (passed by shell which reads ToolbarContext) instead of the old `viewMode` prop. Replace the `viewMode === "document"` conditional with `activePaneType === "document"` for hiding design controls.

The view mode selector buttons (Diagram/Split/Document) are replaced with a split toggle button:
- Single pane: button shows "Split" icon
- Split pane: button shows "Close Split" icon

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: PASS — the app now renders with the new shell structure.

- [ ] **Step 4: Visual verification**

Open the dev server. Verify:
- Explorer renders and files can be opened
- Opening a `.json` file renders the canvas (DesignView)
- Opening a `.md` file renders the editor (DocumentView)
- Split view works with any file combination
- Header toolbar adapts when switching focus between panes

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/components/Header.tsx
git commit -m "refactor: rewire KnowledgeBase as thin shell with PaneManager"
```

---

## Task 7: Create Feature Directory Structure — Move Design Files

**Files:**
- Move ~40 files from `knowledge_base/components/`, `knowledge_base/hooks/`, `knowledge_base/utils/` into `knowledge_base/features/design/`

- [ ] **Step 1: Create design feature directories**

```bash
mkdir -p src/app/knowledge_base/features/design/{components,hooks,properties,utils}
```

- [ ] **Step 2: Move design components**

```bash
cd src/app/knowledge_base
git mv components/Canvas.tsx features/design/components/
git mv components/Element.tsx features/design/components/
git mv components/Layer.tsx features/design/components/
git mv components/DataLine.tsx features/design/components/
git mv components/FlowDots.tsx features/design/components/
git mv components/ConditionElement.tsx features/design/components/
git mv components/Minimap.tsx features/design/components/
git mv components/DiagramControls.tsx features/design/components/
git mv components/AnchorPopupMenu.tsx features/design/components/
git mv components/ContextMenu.tsx features/design/components/
git mv components/HistoryPanel.tsx features/design/components/
git mv components/DocInfoBadge.tsx features/design/components/
git mv components/FlowBreakWarningModal.tsx features/design/components/
```

- [ ] **Step 3: Move design properties**

```bash
git mv components/properties/ArchitectureProperties.tsx features/design/properties/
git mv components/properties/LayerProperties.tsx features/design/properties/
git mv components/properties/NodeProperties.tsx features/design/properties/
git mv components/properties/LineProperties.tsx features/design/properties/
git mv components/properties/FlowProperties.tsx features/design/properties/
git mv components/properties/PropertiesPanel.tsx features/design/properties/
git mv components/properties/AutocompleteInput.tsx features/design/properties/
git mv components/properties/shared.tsx features/design/properties/
git mv components/properties/DocumentsSection.tsx features/design/properties/
```

- [ ] **Step 4: Move design hooks**

```bash
git mv hooks/useCanvasCoords.ts features/design/hooks/
git mv hooks/useCanvasEffects.ts features/design/hooks/
git mv hooks/useCanvasInteraction.ts features/design/hooks/
git mv hooks/useNodeDrag.ts features/design/hooks/
git mv hooks/useLayerDrag.ts features/design/hooks/
git mv hooks/useLayerResize.ts features/design/hooks/
git mv hooks/useLineDrag.ts features/design/hooks/
git mv hooks/useSegmentDrag.ts features/design/hooks/
git mv hooks/useEndpointDrag.ts features/design/hooks/
git mv hooks/useSelectionRect.ts features/design/hooks/
git mv hooks/useFlowManagement.ts features/design/hooks/
git mv hooks/useDragEndRecorder.ts features/design/hooks/
git mv hooks/useZoom.ts features/design/hooks/
git mv hooks/useKeyboardShortcuts.ts features/design/hooks/
git mv hooks/useLabelEditing.ts features/design/hooks/
git mv hooks/useDeletion.ts features/design/hooks/
git mv hooks/useAnchorConnections.ts features/design/hooks/
git mv hooks/useContextMenuActions.ts features/design/hooks/
git mv hooks/useDiagramPersistence.ts features/design/hooks/
git mv hooks/useViewportPersistence.ts features/design/hooks/
```

- [ ] **Step 5: Move design utils**

```bash
git mv utils/anchors.ts features/design/utils/
git mv utils/autoArrange.ts features/design/utils/
git mv utils/collisionUtils.ts features/design/utils/
git mv utils/conditionGeometry.ts features/design/utils/
git mv utils/connectionConstraints.ts features/design/utils/
git mv utils/constants.ts features/design/utils/
git mv utils/flowUtils.ts features/design/utils/
git mv utils/geometry.ts features/design/utils/
git mv utils/gridSnap.ts features/design/utils/
git mv utils/iconRegistry.ts features/design/utils/
git mv utils/layerBounds.ts features/design/utils/
git mv utils/levelModel.ts features/design/utils/
git mv utils/orthogonalRouter.ts features/design/utils/
git mv utils/pathRouter.ts features/design/utils/
git mv utils/selectionUtils.ts features/design/utils/
git mv utils/typeUtils.ts features/design/utils/
```

- [ ] **Step 6: Fix all imports in moved files**

Update relative imports in every moved file. The pattern is:
- `../../utils/X` → `../utils/X` (within design feature)
- `../../hooks/X` → `../hooks/X` (within design feature)
- `../../components/X` → `../components/X` (within design feature)
- Cross-feature imports (e.g., to shared types) → `../../../shared/utils/types` (after Task 9)

For now, update the intra-design imports. Cross-feature imports will be fixed in Task 9.

- [ ] **Step 7: Fix imports in DesignView.tsx**

Update all imports in `DesignView.tsx` to point to the new paths within `features/design/`.

- [ ] **Step 8: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: move design components, hooks, properties, and utils into features/design/"
```

---

## Task 8: Move Document Files into Document Feature

**Files:**
- Move document-specific files into `knowledge_base/features/document/`

- [ ] **Step 1: Create document feature directories**

```bash
mkdir -p src/app/knowledge_base/features/document/{components,hooks,extensions,utils,properties}
```

- [ ] **Step 2: Move document files**

```bash
cd src/app/knowledge_base
git mv components/MarkdownEditor.tsx features/document/components/
git mv components/MarkdownPane.tsx features/document/components/
git mv hooks/useDocuments.ts features/document/hooks/
git mv hooks/useLinkIndex.ts features/document/hooks/
git mv extensions/markdownReveal.ts features/document/extensions/
git mv extensions/markdownSerializer.ts features/document/extensions/
git mv extensions/wikiLink.ts features/document/extensions/
git mv utils/wikiLinkParser.ts features/document/utils/
git mv utils/vaultConfig.ts features/document/utils/
```

- [ ] **Step 3: Fix imports in moved files**

Update relative imports in each moved file to reflect new directory structure.

- [ ] **Step 4: Fix imports in DocumentView.tsx**

Update DocumentView imports to point to `./components/MarkdownPane`, `./hooks/useDocuments`, etc.

- [ ] **Step 5: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move document components, hooks, extensions, and utils into features/document/"
```

---

## Task 9: Move Shared Files

**Files:**
- Move shared files into `knowledge_base/shared/`

- [ ] **Step 1: Create shared directories**

```bash
mkdir -p src/app/knowledge_base/shared/{components,hooks,utils}
```

- [ ] **Step 2: Move shared components**

```bash
cd src/app/knowledge_base
git mv components/SplitPane.tsx shared/components/
git mv components/Header.tsx shared/components/
git mv components/explorer/ shared/components/explorer/
git mv components/DocumentPicker.tsx shared/components/
```

- [ ] **Step 3: Move shared hooks**

```bash
git mv hooks/useFileExplorer.ts shared/hooks/
git mv hooks/useFileActions.ts shared/hooks/
git mv hooks/useActionHistory.ts shared/hooks/
git mv hooks/useEditableState.ts shared/hooks/
git mv hooks/useSyncRef.ts shared/hooks/
```

- [ ] **Step 4: Move shared utils**

```bash
git mv utils/types.ts shared/utils/
git mv utils/persistence.ts shared/utils/
git mv utils/directoryScope.ts shared/utils/
```

- [ ] **Step 5: Fix all cross-feature imports**

Now that all files are in their final locations, do a full import fixup pass:
- All files in `features/design/` that import from shared: update to `../../shared/...`
- All files in `features/document/` that import from shared: update to `../../shared/...`
- Shell files: update to `../shared/...`
- `knowledgeBase.tsx`: update all imports to new paths

Use `npx next build` iteratively to find and fix broken imports.

- [ ] **Step 6: Remove empty directories**

```bash
rmdir src/app/knowledge_base/components/properties 2>/dev/null
rmdir src/app/knowledge_base/components/explorer 2>/dev/null
rmdir src/app/knowledge_base/components 2>/dev/null
rmdir src/app/knowledge_base/hooks 2>/dev/null
rmdir src/app/knowledge_base/utils 2>/dev/null
rmdir src/app/knowledge_base/extensions 2>/dev/null
```

- [ ] **Step 7: Verify build**

Run: `npx next build`
Expected: PASS — all imports resolve correctly.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move shared components, hooks, and utils into shared/"
```

---

## Task 10: Split types.ts into Feature-Scoped Type Files

**Files:**
- Create: `src/app/knowledge_base/features/design/types.ts`
- Create: `src/app/knowledge_base/features/document/types.ts`
- Modify: `src/app/knowledge_base/shared/utils/types.ts`

- [ ] **Step 1: Create `features/design/types.ts`**

Extract from `shared/utils/types.ts`:

```typescript
// Design-specific types

export interface NodeData {
  id: string;
  label: string;
  x: number;
  y: number;
  icon?: React.ReactNode;
  color?: string;
  textColor?: string;
  textSize?: number;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
  shape?: "rectangle" | "rounded" | "pill" | "diamond";
  layerId?: string;
  anchors?: { id: string; edge: "top" | "bottom" | "left" | "right"; label?: string }[];
  rotation?: number;
  type?: string;
}

// ... (copy the full definitions of SerializedNodeData, LayerDef, Connection,
//      FlowDef, LineCurveAlgorithm, Selection, RegionBounds from shared/utils/types.ts)
```

Include all design-specific types with their exact current definitions from `shared/utils/types.ts`.

- [ ] **Step 2: Create `features/document/types.ts`**

Extract from `shared/utils/types.ts`:

```typescript
// Document-specific types

export interface DocumentMeta {
  path: string;
  filename: string;
  title?: string;
  attachedTo?: { entityType: string; entityId: string }[];
  createdAt?: string;
  updatedAt?: string;
}

export interface LinkIndexEntry {
  outbound: { target: string; section?: string }[];
  sections: string[];
}

export interface BacklinkEntry {
  sourcePath: string;
  section?: string;
}

export interface LinkIndex {
  outbound: Record<string, LinkIndexEntry>;
  backlinks: Record<string, BacklinkEntry[]>;
}
```

- [ ] **Step 3: Slim down `shared/utils/types.ts`**

Remove the types that were extracted. Keep only shared types:

```typescript
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../../features/design/types";
import type { DocumentMeta } from "../../features/document/types";

// Re-export for backwards compatibility during migration
export type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef } from "../../features/design/types";
export type { DocumentMeta, LinkIndex, LinkIndexEntry, BacklinkEntry } from "../../features/document/types";

// Shared types that stay here
export interface DiagramData {
  title: string;
  layers: LayerDef[];
  nodes: NodeData[];
  connections: Connection[];
  lineCurve?: LineCurveAlgorithm;
  flows?: FlowDef[];
  documents?: DocumentMeta[];
}

export interface VaultConfig {
  name: string;
  version: string;
  createdAt: string;
  lastOpened: string;
}

export type ViewMode = "diagram" | "split" | "document";
export type ExplorerFilter = "all" | "diagrams" | "documents";

export { getNodeHeight } from "../../features/design/utils/geometry";
```

- [ ] **Step 4: Update imports in design feature files**

Files in `features/design/` that import types should import from `../types` (the local `features/design/types.ts`) instead of `../../shared/utils/types`.

- [ ] **Step 5: Update imports in document feature files**

Files in `features/document/` that import types should import from `../types`.

- [ ] **Step 6: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: split types.ts into design, document, and shared type files"
```

---

## Task 11: Build DocumentProperties Panel

**Files:**
- Create: `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx`
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx`

- [ ] **Step 1: Create `DocumentProperties.tsx`**

```tsx
"use client";

import { useMemo } from "react";
import { FileText, Link2, Hash, Clock, ArrowLeft } from "lucide-react";
import type { BacklinkEntry, LinkIndexEntry } from "../types";

interface DocumentPropertiesProps {
  filePath: string | null;
  content: string;
  outbound: LinkIndexEntry | null;
  backlinks: BacklinkEntry[];
  onNavigateLink?: (path: string) => void;
}

export default function DocumentProperties({
  filePath,
  content,
  outbound,
  backlinks,
  onNavigateLink,
}: DocumentPropertiesProps) {
  const stats = useMemo(() => {
    if (!content) return { words: 0, chars: 0, readingTime: "0 min" };
    const words = content.trim().split(/\s+/).filter(Boolean).length;
    const chars = content.length;
    const minutes = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readingTime: `${minutes} min` };
  }, [content]);

  if (!filePath) {
    return (
      <div className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden" style={{ width: 280 }}>
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
        </div>
        <div className="p-4 text-sm text-slate-400">No document selected</div>
      </div>
    );
  }

  const filename = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex-shrink-0 bg-white border-l border-slate-200 flex flex-col overflow-hidden" style={{ width: 280 }}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200">
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Properties</span>
        <span className="text-xs text-slate-400 truncate">{filename}</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Stats */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Stats</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600">
              <Hash size={12} className="text-slate-400" />
              {stats.words.toLocaleString()} words
            </div>
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock size={12} className="text-slate-400" />
              {stats.readingTime} read
            </div>
          </div>
        </div>

        {/* Outbound Links */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Links ({outbound?.outbound.length ?? 0})
          </div>
          {outbound?.outbound.length ? (
            <div className="space-y-1">
              {outbound.outbound.map((link, i) => (
                <button
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline w-full text-left"
                  onClick={() => onNavigateLink?.(link.target)}
                >
                  <Link2 size={11} className="flex-shrink-0" />
                  <span className="truncate">{link.target}{link.section ? `#${link.section}` : ""}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No outbound links</div>
          )}
        </div>

        {/* Backlinks */}
        <div className="px-4 py-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Backlinks ({backlinks.length})
          </div>
          {backlinks.length > 0 ? (
            <div className="space-y-1">
              {backlinks.map((bl, i) => (
                <button
                  key={i}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline w-full text-left"
                  onClick={() => onNavigateLink?.(bl.sourcePath)}
                >
                  <ArrowLeft size={11} className="flex-shrink-0" />
                  <span className="truncate">{bl.sourcePath}{bl.section ? `#${bl.section}` : ""}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400">No backlinks</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire DocumentProperties into DocumentView**

In `DocumentView.tsx`, add after the MarkdownPane:

```tsx
import DocumentProperties from "./properties/DocumentProperties";

// In the return JSX, after the MarkdownPane div:
<DocumentProperties
  filePath={docManager.activeDocPath}
  content={docManager.activeDocContent}
  outbound={docManager.activeDocPath ? linkManager.index.outbound[docManager.activeDocPath] ?? null : null}
  backlinks={backlinks}
  onNavigateLink={(path) => onNavigateLink?.(path)}
/>
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add DocumentProperties panel with stats, links, and backlinks"
```

---

## Task 12: Evolve Attached Documents into Wiki-Link Cross-References

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts`
- Modify: `src/app/knowledge_base/features/design/properties/DocumentsSection.tsx`
- Modify: `src/app/knowledge_base/features/document/types.ts`

- [ ] **Step 1: Extend useLinkIndex to track cross-references to design files**

In `useLinkIndex.ts`, update the link resolution logic so that wiki-links pointing to `.json` files are tracked as design cross-references:

```typescript
// In the link scanning logic, when a wiki-link target resolves to a .json file:
if (resolvedPath.endsWith(".json")) {
  // Track as design cross-reference
  entry.outbound.push({ target: resolvedPath, section: undefined, type: "design" });
}
```

Add a `type?: "document" | "design"` field to the outbound link entries in `LinkIndexEntry`.

- [ ] **Step 2: Update DocumentsSection to show wiki-link references instead of attachments**

Replace the attachment-based DocumentsSection with a version that reads from the link index to show which documents reference this design entity, and which designs this document references. The section becomes read-only (links are created via wiki-links in documents, not via an "attach" button).

```tsx
// In DocumentsSection.tsx, replace the attach/detach UI with:
// - List of documents that reference this design (from backlinks)
// - Each entry is clickable to open the document
// - "Add reference" button opens the active document's editor to insert a wiki-link
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: evolve document attachments into wiki-link cross-references"
```

---

## Task 13: Add Graphify Edge Emission on Cross-Reference Save

**Files:**
- Create: `src/app/knowledge_base/shared/utils/graphifyBridge.ts`
- Modify: `src/app/knowledge_base/features/document/hooks/useLinkIndex.ts`

- [ ] **Step 1: Create graphify bridge utility**

```typescript
// src/app/knowledge_base/shared/utils/graphifyBridge.ts

/**
 * Emits cross-reference edges to graphify when documents reference designs
 * or other documents. Called on document save.
 *
 * This writes a lightweight JSON file that graphify's rebuild hook picks up.
 */

export interface CrossReference {
  source: string;       // e.g., "docs/overview.md"
  target: string;       // e.g., "designs/auth-flow.json"
  type: "references";   // edge type in the knowledge graph
  sourceType: "document" | "design";
  targetType: "document" | "design";
}

const XREF_FILE = ".archdesigner/cross-references.json";

export async function emitCrossReferences(
  dirHandle: FileSystemDirectoryHandle,
  references: CrossReference[],
): Promise<void> {
  try {
    // Ensure .archdesigner directory exists
    const configDir = await dirHandle.getDirectoryHandle(".archdesigner", { create: true });
    const fileHandle = await configDir.getFileHandle("cross-references.json", { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({ version: 1, references }, null, 2));
    await writable.close();
  } catch {
    // Silently fail — graphify integration is best-effort
    console.warn("Failed to emit cross-references for graphify");
  }
}
```

- [ ] **Step 2: Call emitCrossReferences on document save**

In `useLinkIndex.ts`, after the link index is rebuilt (when a document is saved), collect all cross-references and call `emitCrossReferences`:

```typescript
import { emitCrossReferences, type CrossReference } from "../../../shared/utils/graphifyBridge";

// After rebuilding the index:
const refs: CrossReference[] = [];
for (const [source, entry] of Object.entries(index.outbound)) {
  for (const link of entry.outbound) {
    const targetType = link.target.endsWith(".json") ? "design" : "document";
    refs.push({
      source,
      target: link.target,
      type: "references",
      sourceType: "document",
      targetType,
    });
  }
}
if (dirHandle) {
  emitCrossReferences(dirHandle, refs);
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: emit cross-reference edges to graphify on document save"
```

---

## Final Verification

- [ ] **Full build check**

```bash
npx next build
```

Expected: Clean build, route table shows `○ /` only.

- [ ] **Visual verification checklist**

Open dev server and verify:
1. App loads at `/` (no tortoise homepage)
2. Explorer shows both `.json` and `.md` files
3. Opening a `.json` file renders the design canvas with properties panel
4. Opening a `.md` file renders the markdown editor with DocumentProperties panel
5. Split view works: open a design, then split and open a document
6. Header toolbar shows design controls when design pane is focused
7. Header toolbar shows document controls when document pane is focused
8. In split view, clicking between panes switches the toolbar
9. DocumentProperties shows word count, links, and backlinks
10. Wiki-links in documents can reference `.json` design files
11. All existing design functionality works (layers, elements, connections, flows, drag, zoom)
12. All existing document functionality works (markdown editing, wiki-links, backlinks)

- [ ] **Final commit**

```bash
git add -A
git commit -m "refactor: complete knowledge-base restructure into Design + Document features"
```
