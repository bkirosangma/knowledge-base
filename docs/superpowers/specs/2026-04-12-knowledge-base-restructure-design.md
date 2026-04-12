# Knowledge Base Restructure — Design Spec

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Restructure the monolithic `knowledge_base/` into two first-class features (Design + Document) with a shared shell, context-sensitive UI, and cross-reference system.

---

## 1. Overview

The project has been renamed from `architecture-designer` to `knowledge-base`. The former architecture designer becomes the **Design** feature, and the markdown document editor becomes the **Document** feature. Both are equal citizens in a unified app shell.

### Key decisions
- Single app shell at `/` (tortoise homepage removed)
- File type drives the experience: `.json` → Design, `.md` → Document
- Split view supports any combination of panes (design+design, doc+doc, design+doc)
- Context-sensitive header toolbar adapts to active pane composition
- Document-specific properties panel (backlinks, word count, linked designs, metadata)
- Cross-references via wiki-links replace the "attached documents" model
- Cross-references tracked as edges in graphify knowledge graph

---

## 2. Directory Structure

```
src/app/
  page.tsx              ← renders KnowledgeBase (the app shell)
  layout.tsx            ← existing root layout
  globals.css

  knowledge_base/
    KnowledgeBase.tsx   ← thin shell: explorer + pane manager + header

    features/
      design/
        components/     ← Canvas, Element, Layer, DataLine, FlowDots,
                          ConditionElement, Minimap, DiagramControls,
                          AnchorPopupMenu, ContextMenu, HistoryPanel,
                          DocInfoBadge, FlowBreakWarningModal
        hooks/          ← useCanvasCoords, useCanvasEffects, useCanvasInteraction,
                          useNodeDrag, useLayerDrag, useLayerResize, useLineDrag,
                          useSegmentDrag, useEndpointDrag, useSelectionRect,
                          useFlowManagement, useDragEndRecorder, useZoom,
                          useKeyboardShortcuts, useLabelEditing, useDeletion,
                          useAnchorConnections, useContextMenuActions
        properties/     ← PropertiesPanel (design variant), ArchitectureProperties,
                          LayerProperties, NodeProperties, LineProperties,
                          FlowProperties, AutocompleteInput, shared
        utils/          ← anchors, autoArrange, collisionUtils, conditionGeometry,
                          connectionConstraints, constants, flowUtils, geometry,
                          gridSnap, iconRegistry, layerBounds, levelModel,
                          orthogonalRouter, pathRouter, selectionUtils, typeUtils
        types.ts        ← NodeData, SerializedNodeData, LayerDef, Connection,
                          LineCurveAlgorithm, FlowDef, canvas-related types
        DesignView.tsx  ← entry point: canvas + design properties + design toolbar state

      document/
        components/     ← MarkdownEditor, MarkdownPane
        hooks/          ← useLinkIndex, useDocuments
        properties/     ← DocumentProperties (backlinks, word count, linked designs, metadata)
        extensions/     ← wikiLink, markdownSerializer, markdownReveal
        utils/          ← wikiLinkParser, vaultConfig
        types.ts        ← DocumentMeta, LinkIndex, BacklinkEntry, WikiLink
        DocumentView.tsx ← entry point: editor + doc properties + doc toolbar state

    shared/
      components/       ← SplitPane, Header, ExplorerPanel, ConfirmPopover, DocumentPicker
      hooks/            ← useFileExplorer, useFileActions, useActionHistory,
                          useEditableState, useSyncRef, useDiagramPersistence,
                          useViewportPersistence
      utils/            ← persistence, directoryScope
      types.ts          ← DiagramData (file envelope), TreeNode, file system types

    shell/
      PaneManager.tsx   ← manages 1 or 2 panes, tracks active/focused pane
      ToolbarContext.tsx ← context provider: active pane type → header adapts
```

---

## 3. Shell & Pane Architecture

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Header (context-sensitive toolbar via ToolbarContext)│
├────────┬────────────────────────────────────────────┤
│        │  PaneManager                                │
│Explorer│  ┌──────────────┬──────────────┐           │
│ Panel  │  │  Pane 1      │  Pane 2      │           │
│        │  │  (Design or  │  (Design or  │           │
│        │  │   Document)  │   Document)  │  optional │
│        │  └──────────────┴──────────────┘           │
├────────┴────────────────────────────────────────────┤
│  Status Bar (dimensions, zoom, etc.)                 │
└─────────────────────────────────────────────────────┘
```

### KnowledgeBase.tsx (~100-200 lines)

Thin orchestrator that composes:
- `Header` with `ToolbarContext`
- `ExplorerPanel` (file tree)
- `PaneManager` (1 or 2 panes)
- Status bar

### PaneManager

Responsibilities:
- Tracks 1 or 2 open panes: `{ fileType: "design" | "document", filePath: string }`
- Tracks which pane has focus (for header adaptation)
- Renders `DesignView` or `DocumentView` based on file type
- Manages the split resizer (reuses existing `SplitPane`)
- Opening a file from explorer fills the focused pane (or the single pane if not split)
- Entering split: user opens a second file or splits the current view

### ToolbarContext

Provides to the Header:
- `activePaneType: "design" | "document" | "mixed"`
- `focusedPane: "left" | "right" | "single"`

### Header Adaptation Rules

| Left Pane | Right Pane | Focused | Header Shows        |
|-----------|-----------|---------|---------------------|
| design    | —         | single  | Design controls     |
| document  | —         | single  | Document controls   |
| design    | design    | either  | Design controls     |
| document  | document  | either  | Document controls   |
| design    | document  | left    | Design controls     |
| design    | document  | right   | Document controls   |

---

## 4. Feature Boundaries

### DesignView

Owns:
- All canvas rendering and interaction state (nodes, layers, connections, flows)
- Design-specific properties panel (architecture, layers, elements, lines, flows)
- Design-specific toolbar actions: live animation, labels, zoom, auto-arrange, minimap
- Receives file data from shared persistence, emits save events back

### DocumentView

Owns:
- Tiptap editor with markdown extensions (wiki-link, markdown-reveal)
- Document-specific properties panel:
  - **Backlinks** — which other documents and designs link to this one
  - **Word count / reading time**
  - **Linked designs** — design files referenced via wiki-links
  - **Frontmatter metadata** — title, tags, dates (parsed from YAML frontmatter if present)
- Document-specific toolbar actions: export, outline/TOC toggle, find & replace
- Receives file content from shared persistence, emits save events back

---

## 5. Cross-References & Graphify Integration

### Wiki-link cross-references

Replace the "attached documents" model with bidirectional wiki-links:
- Documents reference designs: `[[my-diagram]]` links to a `.json` design file
- Documents reference other documents: `[[my-notes]]` (existing behavior)
- Designs reference documents through a metadata field in JSON: `"linkedDocs": ["notes/overview.md"]` — displayed in design properties as clickable links
- `useLinkIndex` builds and maintains the backlink graph across both file types

### Graphify integration

- Cross-references become edges in the knowledge graph:
  - `document --references--> design`
  - `design --linked_to--> document`
- On save, a post-save hook updates graphify with the new link relationships
- Enables `/graphify query` and `/graphify path` to traverse across both file types

---

## 6. Shared Infrastructure

### Shared hooks
- `useFileExplorer` — handles both `.json` and `.md` files with type detection
- `useFileActions` — file CRUD (save, load, discard, duplicate)
- `useActionHistory` — undo/redo stack; each pane gets its own history instance
- `useDiagramPersistence` / `useViewportPersistence` — shared persistence helpers
- `useEditableState`, `useSyncRef` — generic utilities

### Shared components
- `Header` — shared controls (file name, save/discard, split toggle) + feature-specific toolbar sections via `ToolbarContext`
- `ExplorerPanel` — opens files into PaneManager
- `SplitPane` — resizable divider, reused by PaneManager
- `ConfirmPopover` — generic UI
- `DocumentPicker` — evolves into general-purpose file picker for inserting wiki-link cross-references

### Type splitting
- `design/types.ts`: NodeData, SerializedNodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef, canvas types
- `document/types.ts`: DocumentMeta, LinkIndex, BacklinkEntry, WikiLink
- `shared/types.ts`: DiagramData (file envelope), TreeNode, file system types

---

## 7. Migration Strategy

Pure refactor — no user-facing behavior changes except:
1. App loads at `/` instead of `/knowledge_base`
2. Tortoise homepage removed

### Execution order

1. Delete tortoise homepage, move knowledge base to root route
2. Extract `DesignView` from `knowledgeBase.tsx` (canvas + design state + design properties)
3. Extract `DocumentView` from `knowledgeBase.tsx` (editor + doc state)
4. Build `PaneManager` and `ToolbarContext` to replace current view-mode switching
5. Create feature directory structure and move files into place
6. Split `types.ts` into feature-scoped type files
7. Build `DocumentProperties` panel (backlinks, word count, linked designs, metadata)
8. Evolve attached-documents into wiki-link cross-references
9. Add graphify edge emission on cross-reference save

### Principles
- Move files first, fix imports second (git tracks renames better)
- Extract DesignView/DocumentView before moving files (easier to test extraction correctness)
- Current view mode state (`diagram | split | document`) becomes PaneManager's open-pane state
- Storage keys already renamed to `knowledge-base-*` — no further migration needed

### Not in scope
- No new UI components beyond `DocumentProperties` and toolbar adaptations
- No changes to canvas/diagram functionality
- No changes to markdown editor functionality
- No new persistence format — existing JSON and markdown files stay as-is
