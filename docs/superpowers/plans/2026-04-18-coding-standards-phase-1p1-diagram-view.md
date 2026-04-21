# Phase 1.1 — DiagramView Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `DiagramView.tsx` (1692 lines, one function) into a composition root + focused hooks + focused child components, preserving every externally-observable behaviour pinned by the Phase 0 characterization tests.

**Architecture:** The god component today is a single function body wiring ~20 feature hooks, ~35 pieces of local state, and ~780 lines of JSX for canvas + overlays + modals. After this plan it becomes: a composition root (`DiagramView.tsx`) + two small state hooks (`useDiagramLayoutState`, `useReadOnlyState`) + two child components (`DiagramCanvasHost`, `DiagramOverlays`) + an already-sibling `AutoArrangeDropdown` moved to its own file. Hook wiring and state that must be shared stays in the composition root; rendering moves out.

**Tech Stack:** React 19, Next.js 16, TypeScript 5, Vitest 4 + Testing Library 16, Playwright 1.59. Phase 0 characterization tests (`e2e/diagramGoldenPath.spec.ts`, `DiagramView.test.tsx`) are the safety net — they must stay green after every task.

**Scope check.** Phase 1 has five sub-phases (DiagramView, MarkdownEditor, markdownReveal, ExplorerPanel, useFileExplorer). This plan covers only the first. The other four get their own plans in follow-up sessions.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `src/app/knowledge_base/features/diagram/components/AutoArrangeDropdown.tsx` | **Create.** | Toolbar dropdown that picks an auto-arrange algorithm. Moved verbatim from `DiagramView.tsx:97-142`. |
| `src/app/knowledge_base/features/diagram/utils/toolbarClass.ts` | **Create.** | One-line `toggleClass` helper used by multiple toolbar buttons. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts` | **Create.** | Layout-flag state hook: `isLive`, `showLabels`, `showMinimap`, `historyCollapsed`, `propertiesCollapsed` + localStorage persistence of `propertiesCollapsed`. |
| `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts` | **Create.** | Per-file Read Mode hook: `readOnly`, `toggleReadOnly`, localStorage key scoped to `activeFile`. |
| `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx` | **Create.** | Right-side `PropertiesPanel`, `Minimap` shell, tooltip rendering for hovered lines, and the label-hover tooltip. Pure JSX with typed props interface. |
| `src/app/knowledge_base/features/diagram/components/DiagramCanvasHost.tsx` | **Create.** | The `<Canvas>` subtree: layers, elements, flow dots, data lines, connection markers, and the anchor popup menu. Pure JSX with typed props interface. |
| `src/app/knowledge_base/features/diagram/DiagramView.tsx` | **Modify.** | Stays as the composition root. After all extractions, expected to be ~700-900 lines (down from 1692), holding the hook-composition graph + state it can't yet extract + a short JSX tree that delegates to the two new components. |
| `src/app/knowledge_base/features/diagram/DiagramView.test.tsx` | **Modify** (only if the composition root's exported interface changes — it shouldn't). | Characterization test must stay green as-is. |
| `e2e/diagramGoldenPath.spec.ts` | Untouched. | Characterization e2e; stays green. |
| `Features.md` | **Modify** (final task). | Update Section 2.1 (or wherever DiagramView is described) to reflect the split. No user-visible features change — this is internal. |
| `graphify-out/*` | Rebuild (gitignored). | Reflect new file structure. |

**Out of scope for this plan:**
- No changes to any of the 20 feature hooks under `hooks/`.
- No changes to the utils under `utils/`.
- No changes to `types.ts`, `PropertiesPanel.tsx`, or any sibling diagram component.
- No changes to the `DiagramBridge` exported interface at `DiagramView.tsx:72-95`.
- The inline `onMove` / `onUp` / `doCommit` / `walk` callbacks mentioned in the spec §5.1 — analysis at plan time shows these are local closures inside larger JSX handlers, and extracting them would require either a wide hook signature (onMove/onUp close over 10+ local variables) or refactoring the label-drag into a dedicated hook. Deferred to a follow-up task; noted as an observation, not a gap.
- The spec §5.1's `hooks/useDiagramHookComposition.ts` — wiring the 20 feature hooks into a single orchestrator hook. Survey at plan time shows these hooks are tightly inter-referenced: `useLineDrag` reads from `useLayerResize`'s resize state, `useNodeDrag` dispatches to `setSelection` (local DiagramView state), `useContextMenuActions` needs `handleAddElement` which needs `clampElementToAvoidLayerCollision` which reads layer manual sizes. A naive extraction produces an enormous return-object and a single massive hook — replacing one god-component with one god-hook, with the same prop-passing fan-out. A cleaner decomposition requires the repository abstractions from Phase 3 (DIP) to cut the cross-hook state coupling. Deferred; follow-up after Phase 3.
- No performance optimizations (memoization, callback hoisting) beyond what's necessary to avoid regressions.

---

## Pre-flight

Run these once before starting Task 1 so you have a clean baseline.

- [ ] **Match local Node version to `.nvmrc`**

```bash
cd "/Users/kiro/My Projects/knowledge-base/.worktrees/phase-1p1-diagram-view"
source ~/.nvm/nvm.sh
nvm use   # reads .nvmrc → Node 22.x, npm 10.x
node --version  # expect v22.x
```

Matching the CI Node version locally catches lockfile drift and tsc-only errors before they bite in CI. (Memory: `feedback_worktree_nvm_baseline`.)

- [ ] **Verify clean baseline**

```bash
npm ci                                # must succeed on Node 22 / npm 10
npm run test:run                      # expect: 831 passed | 1 skipped
npm run test:e2e                      # expect: 25 passed | 1 skipped
npm run build                         # expect: Compiled successfully
```

If any step fails, stop — the baseline must be clean so each task's effect is attributable.

- [ ] **Familiarise yourself with the safety net**

Read `e2e/diagramGoldenPath.spec.ts` and `src/app/knowledge_base/features/diagram/DiagramView.test.tsx`. Every task in this plan ends by re-running these; they are what tells you the extraction didn't break behaviour.

---

## Task 1: Extract `AutoArrangeDropdown` + `toggleClass` helper

**Why first:** This is a sibling function and a tiny helper that are already logically separate from `DiagramView`'s body. Moving them is a mechanical cut-paste with zero risk — and it reduces `DiagramView.tsx` by ~55 lines, a quick win that builds momentum.

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/AutoArrangeDropdown.tsx`
- Create: `src/app/knowledge_base/features/diagram/utils/toolbarClass.ts`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx` (delete the moved block, add imports)

- [ ] **Step 1: Create `components/AutoArrangeDropdown.tsx`**

Write this exact file:

```tsx
"use client";

import React from "react";
import { LayoutGrid } from "lucide-react";

export type ArrangeAlgorithm = "hierarchical-tb" | "hierarchical-lr" | "force";

export default function AutoArrangeDropdown({
  onSelect,
}: {
  onSelect: (algo: ArrangeAlgorithm) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const items: { key: ArrangeAlgorithm; label: string }[] = [
    { key: "hierarchical-tb", label: "Hierarchical (Top \u2192 Bottom)" },
    { key: "hierarchical-lr", label: "Hierarchical (Left \u2192 Right)" },
    { key: "force", label: "Force-Directed" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        title="Auto Arrange"
        onClick={() => setOpen(!open)}
      >
        <LayoutGrid size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[210px]">
          {items.map((item) => (
            <button
              key={item.key}
              className="block w-full text-left px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { onSelect(item.key); setOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `utils/toolbarClass.ts`**

```ts
/**
 * Class string for diagram-toolbar pill buttons. Active pill gets a shadow +
 * blue text + visible border; inactive is slate text with a transparent border.
 */
export const toggleClass = (active: boolean): string =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
    active
      ? "bg-white shadow-sm text-blue-600 border border-slate-200"
      : "text-slate-500 hover:text-slate-700 border border-transparent"
  }`;
```

- [ ] **Step 3: Remove the moved block from `DiagramView.tsx`**

Open `src/app/knowledge_base/features/diagram/DiagramView.tsx`. Delete lines 97-147 (the whole `ArrangeAlgorithm` type, the `AutoArrangeDropdown` function, and the `toggleClass` helper). These lines end right before the `export interface DiagramViewProps` declaration.

- [ ] **Step 4: Add imports at the top of `DiagramView.tsx`**

After the existing import block (around line 60–70, alongside the other local-path imports), add:

```tsx
import AutoArrangeDropdown, { type ArrangeAlgorithm } from "./components/AutoArrangeDropdown";
import { toggleClass } from "./utils/toolbarClass";
```

Remove the `LayoutGrid` import from `lucide-react` if it's only used by the moved `AutoArrangeDropdown`. Check:

```bash
grep -n "LayoutGrid" src/app/knowledge_base/features/diagram/DiagramView.tsx
```

If only the import line remains, drop `LayoutGrid` from the `lucide-react` destructured import.

- [ ] **Step 5: Verify the build passes**

```bash
npm run build 2>&1 | tail -3
```

Expected: `Compiled successfully`. If it fails, the most likely cause is an unresolved import — re-check Step 4.

- [ ] **Step 6: Verify all tests pass**

```bash
npm run test:run 2>&1 | tail -3
npm run test:e2e 2>&1 | tail -3
```

Expected: 831 passed | 1 skipped, 25 passed | 1 skipped.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/AutoArrangeDropdown.tsx \
        src/app/knowledge_base/features/diagram/utils/toolbarClass.ts \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "$(cat <<'EOF'
refactor(diagram): extract AutoArrangeDropdown + toggleClass helper

Moves the sibling AutoArrangeDropdown component (44 lines) and the
toggleClass CSS helper (4 lines) out of DiagramView.tsx into their own
files. Part of Phase 1.1 decomposition. No user-visible change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `useDiagramLayoutState` hook

**Why:** Five pieces of toolbar/panel-visibility state (`isLive`, `showLabels`, `showMinimap`, `historyCollapsed`, `propertiesCollapsed`) and one persistence effect (`properties-collapsed` → localStorage) are bundled together. They share no cross-cutting concerns with the rest of DiagramView's state — they're pure UI toggles. Extracting them into a hook cuts ~20 lines from DiagramView and lets tests assert the persistence behaviour directly (there's already a unit test for this in `DiagramView.test.tsx`).

**Files:**
- Create: `src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Create the hook**

Write `src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts`:

```ts
"use client";

import { useCallback, useState } from "react";

/**
 * DiagramView's toolbar and panel visibility flags.
 *
 * - `isLive` / `showLabels` / `showMinimap`: ephemeral toolbar toggles.
 * - `historyCollapsed`: whether the left-side history panel is folded.
 * - `propertiesCollapsed`: whether the right-side properties panel is folded;
 *   persisted to localStorage under the key `"properties-collapsed"` so it
 *   survives refresh.
 */
export interface DiagramLayoutState {
  isLive: boolean;
  showLabels: boolean;
  showMinimap: boolean;
  historyCollapsed: boolean;
  propertiesCollapsed: boolean;
}

export interface DiagramLayoutActions {
  setIsLive: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowLabels: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowMinimap: (v: boolean | ((prev: boolean) => boolean)) => void;
  setHistoryCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  /** Toggle + persist to localStorage. */
  toggleProperties: () => void;
}

const PROPERTIES_COLLAPSED_KEY = "properties-collapsed";

export function useDiagramLayoutState(): {
  state: DiagramLayoutState;
  actions: DiagramLayoutActions;
} {
  const [isLive, setIsLive] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PROPERTIES_COLLAPSED_KEY) === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(PROPERTIES_COLLAPSED_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return {
    state: { isLive, showLabels, showMinimap, historyCollapsed, propertiesCollapsed },
    actions: { setIsLive, setShowLabels, setShowMinimap, setHistoryCollapsed, toggleProperties },
  };
}
```

- [ ] **Step 2: Wire the hook into `DiagramView.tsx`**

Find the state declarations block (currently around lines 185-199 in `DiagramView.tsx` — the 5 `useState` calls for `isLive`, `showLabels`, `showMinimap`, `historyCollapsed`, `propertiesCollapsed` and the `toggleProperties` useCallback).

Replace it with:

```tsx
  const {
    state: { isLive, showLabels, showMinimap, historyCollapsed, propertiesCollapsed },
    actions: { setIsLive, setShowLabels, setShowMinimap, setHistoryCollapsed, toggleProperties },
  } = useDiagramLayoutState();
```

Add the import at the top of `DiagramView.tsx`:

```tsx
import { useDiagramLayoutState } from "./hooks/useDiagramLayoutState";
```

- [ ] **Step 3: Verify no call sites changed behaviour**

Grep for callers to confirm the destructured names match what's used downstream:

```bash
grep -n "setIsLive\|setShowLabels\|setShowMinimap\|setHistoryCollapsed\|propertiesCollapsed\|toggleProperties\|historyCollapsed" src/app/knowledge_base/features/diagram/DiagramView.tsx
```

Every call site should reference the destructured names above. No functional changes expected.

- [ ] **Step 4: Build + test**

```bash
npm run build 2>&1 | tail -3
npm run test:run 2>&1 | tail -3
npm run test:e2e 2>&1 | tail -3
```

Expected: green build, 831 unit tests passing (including the existing DIAG-3.13-01 and DIAG-3.13-41/42/43 suite), 25 e2e passing.

The specific test that proves `propertiesCollapsed` persistence is DIAG-3.13-01 in both `DiagramView.test.tsx` (unit) and `e2e/diagramGoldenPath.spec.ts` (e2e) — these must still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "$(cat <<'EOF'
refactor(diagram): extract useDiagramLayoutState hook

Pulls 5 toolbar/panel state flags and the properties-collapsed
localStorage persistence out of DiagramView into a focused hook.
Part of Phase 1.1 decomposition. No user-visible change.

DIAG-3.13-01 (properties-collapsed persistence) continues to pass
at both unit and e2e layers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract `useReadOnlyState` hook

**Why:** Per-file Read Mode state (the `readOnly` flag + localStorage key `diagram-read-only:${activeFile}` + the effect that clears stale overlays when entering Read Mode) is another clean cluster. ~25 lines that belong together.

**Files:**
- Create: `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Create the hook**

Write `src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-file Read Mode state. Persists to localStorage under the key
 * `diagram-read-only:<activeFile>` so each diagram remembers its own
 * mode independently.
 *
 * Returns `readOnly: false` whenever `activeFile` is null (empty state).
 */
export function useReadOnlyState(activeFile: string | null): {
  readOnly: boolean;
  toggleReadOnly: () => void;
} {
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

  return { readOnly, toggleReadOnly };
}
```

- [ ] **Step 2: Wire into `DiagramView.tsx`**

Find the Read Mode state block (currently lines ~201-218 in `DiagramView.tsx`). It starts with `const storageKey = activeFile ? ...` and ends with the `toggleReadOnly` useCallback's closing brace.

Replace that whole block with:

```tsx
  const { readOnly, toggleReadOnly } = useReadOnlyState(activeFile);
```

Keep the separate effect that clears stale overlays when entering Read Mode (around line 220-226) — that one still lives in `DiagramView.tsx` because it references other state (`setEditingLabel`, `setContextMenu`, `setAnchorPopup`).

Add import at the top:

```tsx
import { useReadOnlyState } from "./hooks/useReadOnlyState";
```

- [ ] **Step 3: Build + test**

```bash
npm run build 2>&1 | tail -3
npm run test:run 2>&1 | tail -3
npm run test:e2e 2>&1 | tail -3
```

Expected: green across the board. If test-cases `DIAG-3.14-01..04` (read-only cases) or any selection/drag test regresses, inspect the `readOnly` wiring — the new hook must produce the exact same behaviour.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "$(cat <<'EOF'
refactor(diagram): extract useReadOnlyState hook

Per-file Read Mode state + localStorage persistence moved into a
focused hook. Keeps the stale-overlay-clear effect in DiagramView
where it can access editingLabel/contextMenu/anchorPopup setters.

Part of Phase 1.1 decomposition. No user-visible change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Extract `DiagramOverlays` component

**Why:** The JSX below the Canvas is a discrete slab of UI — right-side `PropertiesPanel` (with ~40 props), bottom-left `Minimap` shell, hovered-line tooltip, and modal popovers (`FlowBreakWarningModal`, confirmation dialogs). Today these sit inline in DiagramView's return body as siblings of `<Canvas>`. Extracting them to their own component reduces DiagramView's JSX weight by ~200 lines and lets props drill into a single prop surface.

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Scope the extraction**

Open `DiagramView.tsx` and identify the JSX block that becomes `DiagramOverlays`. The block starts at `<PropertiesPanel` (somewhere around line 1490) and includes:

1. `<PropertiesPanel ... />` — the large right-side panel
2. `{/* Minimap */}` block with `<Minimap ... />`
3. `{/* Tooltip */}` block with the hovered-line tooltip
4. `{/* Document Picker */}` block with `<DocumentPicker ... />` (lines ~1660-1690)
5. Any `{/* Context menu */}` / `{/* Anchor popup menu */}` / modal blocks that follow

Confirm extents by scanning `grep -n "{/\*" src/app/knowledge_base/features/diagram/DiagramView.tsx` — the JSX comment markers delineate each block.

The outer wrapper `<div className="flex-1 flex flex-col min-h-0 h-full">` stays in `DiagramView.tsx` — you extract the children of the canvas's sibling slots, not the whole return.

- [ ] **Step 2: Draft the props interface**

Before writing the file, enumerate EVERY prop needed. Grep the extracted JSX block for identifier references; anything not declared inside the block is a prop.

A sketch of what the interface will look like (adjust to reality):

```ts
export interface DiagramOverlaysProps {
  // Active file
  activeFile: string | null;
  readOnly: boolean;

  // Properties panel state
  selection: Selection;
  nodes: NodeData[];
  connections: Connection[];
  layers: LayerDef[];
  flows: FlowDef[];
  documents: DocumentMeta[];
  measuredSizes: Record<string, { w: number; h: number }>;
  expandedTypeInPanel: string | null;
  onExpandType: (t: string | null) => void;
  onSelectType: (t: string) => void;
  onHoverType: (t: string | null) => void;
  backlinks: { sourcePath: string; section?: string }[] | undefined;
  onOpenDocument: (path: string) => void;
  // ... all the onUpdate* / onDelete* / onCreate* callbacks PropertiesPanel uses

  // Minimap state
  showMinimap: boolean;
  world: { x: number; y: number; w: number; h: number };
  canvasRef: React.RefObject<HTMLDivElement>;
  regions: { id: string; ... }[];
  displayNodes: NodeData[];
  zoomRef: React.MutableRefObject<number>;

  // Hovered tooltip
  hoveredLine: { id: string; label: string; x: number; y: number } | null;
  showLabels: boolean;

  // Document picker state
  pickerTarget: { type: string; id: string } | null;
  setPickerTarget: React.Dispatch<React.SetStateAction<{type:string;id:string}|null>>;
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onCreateDocument: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<void>;
  getDocumentsForEntity: (type: string, id: string) => DocumentMeta[];

  // History panel (optional — passed through to PropertiesPanel)
  history?: {
    entries: ActionHistoryEntry[];
    currentIndex: number;
    savedIndex: number;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onGoToEntry: (index: number) => void;
    collapsed: boolean;
    onToggleCollapse: () => void;
  };
}
```

(This is a SKETCH. The real prop list is whatever the grep in Step 1 says is referenced. Be exhaustive — undeclared references become TypeScript errors at build time, which is your signal that a prop is missing.)

- [ ] **Step 3: Write `DiagramOverlays.tsx`**

Create `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`. Structure:

```tsx
"use client";

import React from "react";
// ... imports moved from DiagramView.tsx that this JSX needs: PropertiesPanel,
// Minimap, DocumentPicker, ConfirmPopover, FlowBreakWarningModal, etc.

import type { Selection, NodeData, Connection, LayerDef, FlowDef, DocumentMeta } from "../types";
// ... other types

export interface DiagramOverlaysProps {
  // ... (full list from Step 2)
}

export default function DiagramOverlays(props: DiagramOverlaysProps) {
  const {
    activeFile,
    selection,
    // ... destructure all props
  } = props;

  return (
    <>
      {/* PropertiesPanel */}
      <PropertiesPanel
        // ... all the props it needs, pulled from `props`
      />

      {/* Minimap */}
      {showMinimap && activeFile && (
        <div className="absolute bottom-4 left-4 z-30">
          <Minimap
            world={world}
            viewportRef={canvasRef}
            regions={regions}
            nodes={displayNodes}
            zoomRef={zoomRef}
          />
        </div>
      )}

      {/* Tooltip */}
      {hoveredLine && !showLabels && (
        <div
          className="fixed z-50 bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 rounded shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full"
          style={{ left: hoveredLine.x, top: hoveredLine.y - 15 }}
        >
          {hoveredLine.label}
        </div>
      )}

      {/* Document Picker */}
      {pickerTarget && (
        <DocumentPicker ... />
      )}

      {/* ... other overlays extracted from DiagramView */}
    </>
  );
}
```

Key constraints:
- Do NOT change any attribute values, event-handler bodies, or JSX structure. Move code verbatim.
- Each `{/* ... */}` block in DiagramView becomes a `{...}` block in `DiagramOverlays`.
- If a handler was defined inline in the extracted JSX, keep it inline — don't hoist it to the props interface. The props are only identifiers the JSX references from outside its own body.
- If an imported type/value becomes unreachable from inside the function body after destructuring, add the import.

- [ ] **Step 4: Replace the JSX in `DiagramView.tsx` with `<DiagramOverlays ... />`**

Delete the extracted block from DiagramView's return. Replace with:

```tsx
      <DiagramOverlays
        activeFile={activeFile}
        readOnly={readOnly}
        selection={selection}
        nodes={nodes}
        connections={connections}
        layers={layerDefs}
        flows={flows}
        documents={documents}
        measuredSizes={measuredSizes}
        // ... all the props declared in the interface
      />
```

Import at the top:

```tsx
import DiagramOverlays from "./components/DiagramOverlays";
```

Remove now-unused imports from `DiagramView.tsx` (Minimap, DocumentPicker, PropertiesPanel, etc.) if they're no longer referenced.

- [ ] **Step 5: Build to catch missing props**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

If tsc reports `Property 'X' is missing in type 'DiagramOverlaysProps'` or `Cannot find name 'Y'` inside `DiagramOverlays.tsx`, add the missing prop to the interface AND to the DiagramView call site. Iterate until build is green.

- [ ] **Step 6: Run the full test suite**

```bash
npm run test:run 2>&1 | tail -3
npm run test:e2e 2>&1 | tail -3
```

Expected: 831 passed, 25 e2e passed. The most likely regression is a prop that looks fine to tsc (e.g. a callback) but closes over the wrong reference because the destructuring order in `DiagramOverlays` shadowed something — if a test regresses, look at prop passthrough and identifier shadowing first.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "$(cat <<'EOF'
refactor(diagram): extract DiagramOverlays component

PropertiesPanel + Minimap + hovered-line tooltip + DocumentPicker and
other modal/popover JSX moved into a dedicated component. DiagramView
now passes a single props bundle instead of embedding 200+ lines of
JSX inline.

Part of Phase 1.1 decomposition. No user-visible change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Extract `DiagramCanvasHost` component

**Why:** The largest remaining slab in `DiagramView.tsx` is the canvas subtree — `<Canvas>` containing layers, elements, connection lines, flow dots, anchor popup, and the label-edit input. After Tasks 1–4 this is the single biggest source of line count. Extracting it gets DiagramView close to its composition-root goal.

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/DiagramCanvasHost.tsx`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

- [ ] **Step 1: Scope the extraction**

The canvas block starts at the `<Canvas` opening tag and ends at its closing `</Canvas>`. In the current DiagramView.tsx it spans roughly lines 970 to 1470 (~500 lines). Inside it are: layers, elements, SVG with connection paths, flow dots, context menu, anchor popup, and the label-edit input.

**This is the hardest extraction.** Many inline callbacks close over local variables (e.g. the label-drag handler's `onMove`/`onUp`). Preserve those as-is inside the JSX — don't try to hoist them.

- [ ] **Step 2: Draft the props interface**

Same approach as Task 4: grep the extracted block for every identifier, any that isn't declared inside becomes a prop. The count will be large (~50-70 props). That's expected for a god-component extraction — the prop weight is precisely what Phase 3 (DIP with repositories) will fix later.

Sketch:

```ts
export interface DiagramCanvasHostProps {
  // Refs
  canvasRef: React.RefObject<HTMLDivElement>;
  worldRef: React.MutableRefObject<{ x: number; y: number; w: number; h: number }>;
  zoomRef: React.MutableRefObject<number>;
  nodesRef: React.MutableRefObject<NodeData[]>;
  connectionsRef: React.MutableRefObject<Connection[]>;
  flowsRef: React.MutableRefObject<FlowDef[]>;
  selectionRef: React.MutableRefObject<Selection>;
  labelDragNodeRects: React.MutableRefObject<...>;
  labelLastValidT: React.MutableRefObject<number>;

  // State (value)
  world: { x: number; y: number; w: number; h: number };
  zoom: number;
  isZooming: boolean;
  readOnly: boolean;
  isLive: boolean;
  showLabels: boolean;
  nodes: NodeData[];
  displayNodes: NodeData[];
  layers: LayerDef[];
  connections: Connection[];
  flows: FlowDef[];
  selection: Selection;
  hoveredNodeId: string | null;
  hoveredLineId: string | null;
  hoveredFlowId: string | null;
  hoveredType: string | null;
  editingLabel: { type: "node" | "layer" | "line"; id: string } | null;
  editingLabelValue: string;
  labelDragGhost: { lineId: string; rawT: number } | null;
  draggingId: string | null;
  draggingLayerId: string | null;
  draggingLayerIds: string[];
  layerDragDelta: { x: number; y: number };
  draggingEndpoint: ... | null;
  creatingLine: ... | null;
  selectionRect: ... | null;
  isMultiDrag: boolean;
  multiDragIds: string[];
  multiDragDelta: ...;
  regions: ...;
  measuredSizes: Record<string, { w: number; h: number }>;
  contextMenu: ... | null;
  anchorPopup: ... | null;

  // Callbacks (passed through)
  setConnections: React.Dispatch<React.SetStateAction<Connection[]>>;
  setEditingLabel: React.Dispatch<React.SetStateAction<...>>;
  setEditingLabelValue: React.Dispatch<React.SetStateAction<string>>;
  setLabelDragGhost: React.Dispatch<React.SetStateAction<...>>;
  setHoveredNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoveredLine: React.Dispatch<React.SetStateAction<...>>;
  setContextMenu: React.Dispatch<React.SetStateAction<...>>;
  setAnchorPopup: React.Dispatch<React.SetStateAction<...>>;
  setPatches: React.Dispatch<React.SetStateAction<...>>;
  handleCanvasMouseDown: (e: React.MouseEvent) => void;
  handleSelectionRectStart: (e: React.MouseEvent) => void;
  handleRotationDragStart: (...) => void;
  handleNodeDragStart: (...) => void;
  handleNodeDoubleClick: (...) => void;
  handleNodeMouseEnter: (...) => void;
  handleNodeMouseLeave: (...) => void;
  handleLayerDragStart: (...) => void;
  handleLayerResizeStart: (...) => void;
  handleSegmentDragStart: (...) => void;
  handleLineClick: (...) => void;
  handleConnectedAnchorDrag: (...) => void;
  handleAnchorDragStart: (...) => void;
  handleAnchorClick: (...) => void;
  handleAnchorHover: (...) => void;
  handleAnchorHoverEnd: (...) => void;
  handleAnchorMenuEnter: () => void;
  handleAnchorMenuLeave: () => void;
  handleAnchorConnectToElement: (...) => void;
  handleAnchorCreateCondition: (...) => void;
  handleAnchorConnectToType: (...) => void;
  handleElementResize: (id: string, w: number, h: number) => void;
  commitLabel: (target: ..., value: string) => void;
  scheduleRecord: (description: string) => void;
  getNodeDimensions: (node: ...) => { w: number; h: number };
  getDocumentsForEntity: (type: string, id: string) => DocumentMeta[];
  setZoomTo: (zoom: number, cx?: number, cy?: number) => void;

  // Non-reactive refs used inside JSX
  pendingSelection: React.MutableRefObject<...>;
  editingLabelBeforeRef: React.MutableRefObject<string>;
  labelDragStartT: React.MutableRefObject<number | null>;
}
```

Yes, this is a big interface. It will get trimmed in Phase 3 (DIP); today we're accepting it as the cost of the extraction.

- [ ] **Step 3: Write `DiagramCanvasHost.tsx`**

The body is the extracted JSX block, wrapped in a functional component. Move imports that are only needed here (Canvas, Layer, Element, DataLine, FlowDots, ContextMenu, AnchorPopupMenu, getAnchors, getConditionAnchors, computePath, interpolatePoints, closestT, rectsOverlap, etc.) from `DiagramView.tsx`.

Structure:

```tsx
"use client";

import React from "react";
import Canvas from "./Canvas";
import Layer from "./Layer";
import Element from "./Element";
import DataLine, { interpolatePoints, closestT } from "./DataLine";
import FlowDots from "./FlowDots";
import ContextMenu from "./ContextMenu";
import AnchorPopupMenu from "./AnchorPopupMenu";
import { rectsOverlap } from "../utils/collisionUtils";
import { getAnchors, getAnchorPosition, getNodeAnchorPosition, getNodeAnchorDirection, getAnchorEdge } from "../utils/anchors";
import { getConditionAnchors } from "../utils/conditionGeometry";
import { computePath } from "../utils/pathRouter";
import { buildObstacles } from "../utils/orthogonalRouter";
// ... other imports

import type { ... } from "../types";

export interface DiagramCanvasHostProps {
  // ... full prop list from Step 2
}

export default function DiagramCanvasHost(props: DiagramCanvasHostProps) {
  const {
    canvasRef,
    // ... destructure
  } = props;

  return (
    <Canvas
      ref={canvasRef}
      onMouseDown={handleCanvasMouseDown}
      // ... all Canvas props from the original JSX
    >
      {/* Layers */}
      {layers.map(...)}

      {/* Connection lines (SVG) */}
      <svg ...>
        {/* ... paths, flow dots, label edit input ... */}
      </svg>

      {/* Flow dots */}
      ...

      {/* Nodes */}
      {displayNodes.map(...)}

      {/* Selection rectangle */}
      {selectionRect && ...}

      {/* Context menu */}
      {contextMenu && <ContextMenu ... />}

      {/* Anchor popup */}
      {anchorPopup && <AnchorPopupMenu ... />}

      {/* Label edit input */}
      {editingLabel && ...}

      {/* ... other children of Canvas ... */}
    </Canvas>
  );
}
```

Again: move JSX verbatim. Do not refactor inline handlers. The goal is mechanical extraction.

- [ ] **Step 4: Replace the Canvas block in `DiagramView.tsx`**

Where the `<Canvas ...>...</Canvas>` block used to be, put:

```tsx
      <DiagramCanvasHost
        canvasRef={canvasRef}
        worldRef={worldRef}
        zoomRef={zoomRef}
        // ... every prop from the interface
      />
```

Import at the top:

```tsx
import DiagramCanvasHost from "./components/DiagramCanvasHost";
```

Remove now-unused imports in `DiagramView.tsx` (Canvas, Layer, Element, DataLine, FlowDots, ContextMenu, AnchorPopupMenu, interpolatePoints, closestT, rectsOverlap, getConditionAnchors, getAnchors, computePath, buildObstacles, etc.) if no longer referenced.

- [ ] **Step 5: Build repeatedly to find missing props**

```bash
npm run build 2>&1 | grep -E "error TS" | head -30
```

Each `error TS2339: Property 'foo' does not exist on type 'DiagramCanvasHostProps'` means add `foo` to the interface and pass it from DiagramView. Each `Cannot find name 'bar'` inside `DiagramCanvasHost.tsx` means you missed destructuring it.

Expect 10+ build iterations. Be patient.

- [ ] **Step 6: Full verification**

```bash
npm run test:run 2>&1 | tail -3
npm run test:e2e 2>&1 | tail -3
npm run build 2>&1 | tail -3
```

Expected: all three green. Watch particularly:
- Drag test (DIAG-3.5-06): confirms mouse events reach the node's handler.
- Selection test (DIAG-3.11-01): confirms click handler fires and `ring-2` class applies.
- Delete test (DIAG-3.14-03): confirms keyboard events fire and selection/deletion logic wires correctly.

If any of these regress, the most likely cause is a callback passed by reference that now closes over a stale value because the new component didn't destructure a ref correctly.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/DiagramCanvasHost.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "$(cat <<'EOF'
refactor(diagram): extract DiagramCanvasHost component

Canvas + layers + elements + flow dots + data lines + context menu +
anchor popup + label-edit input moved into a dedicated rendering
component. DiagramView now delegates ~500 lines of JSX to a single
child call.

Part of Phase 1.1 decomposition. No user-visible change. Phase 0
characterization tests stay green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final cleanup + Features.md + graphify rebuild

**Why:** After Tasks 1–5, `DiagramView.tsx` has dead imports, possibly dead helpers, and the surrounding docs are stale. This task sweeps up.

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx` (dead-code removal only)
- Modify: `Features.md` (note the decomposition)
- Rebuild: `graphify-out/*` (gitignored)

- [ ] **Step 1: Remove dead imports from `DiagramView.tsx`**

```bash
cd "/Users/kiro/My Projects/knowledge-base/.worktrees/phase-1p1-diagram-view"
npm run lint 2>&1 | grep -E "'.*' is defined but never used|'.*' is imported but never used" | head -30
```

For each reported unused import in `DiagramView.tsx`, remove it. Leave unused imports in OTHER files alone — that's pre-existing scope.

- [ ] **Step 2: Measure the new line count**

```bash
wc -l src/app/knowledge_base/features/diagram/DiagramView.tsx \
      src/app/knowledge_base/features/diagram/components/AutoArrangeDropdown.tsx \
      src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx \
      src/app/knowledge_base/features/diagram/components/DiagramCanvasHost.tsx \
      src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts \
      src/app/knowledge_base/features/diagram/hooks/useReadOnlyState.ts \
      src/app/knowledge_base/features/diagram/utils/toolbarClass.ts
```

Target (best effort, per the spec "target not gate"):
- `DiagramView.tsx`: < 1000 lines (down from 1692). Realistic stretch: < 800.
- `DiagramCanvasHost.tsx`: ~500-600 lines.
- `DiagramOverlays.tsx`: ~200-300 lines.
- `AutoArrangeDropdown.tsx`: ~55 lines.
- `useDiagramLayoutState.ts` / `useReadOnlyState.ts`: ~30-40 lines each.
- `toolbarClass.ts`: ~8 lines.

Note the final numbers in the commit message.

- [ ] **Step 3: Update `Features.md`**

Grep `Features.md` for the DiagramView section:

```bash
grep -n "DiagramView\|features/diagram" Features.md | head -10
```

Find the bullet that describes DiagramView and rephrase to note the composition:

> `DiagramView.tsx` (composition root) + `DiagramCanvasHost`, `DiagramOverlays`, `AutoArrangeDropdown`, plus `useDiagramLayoutState` / `useReadOnlyState` hooks — the 1692-line god component was decomposed in Phase 1.1; each child owns a single responsibility.

Adapt the phrasing to match the file's existing tone. Keep it a single bullet (or sub-bullet if the parent entry uses them) — this is internal structure, not a new user feature.

- [ ] **Step 4: Rebuild graphify (if available)**

```bash
export PATH="$HOME/.local/bin:$PATH"
graphify . --update 2>&1 | tail -10
```

If `graphify` isn't found, skip with a note in the commit message (the tool may not have an `--update` subcommand in the installed build; documented in `MEMORY.md`).

- [ ] **Step 5: Final verification**

```bash
source ~/.nvm/nvm.sh && nvm use >/dev/null 2>&1
npm ci         # confirms lockfile stays clean
npm run test:run
npm run test:e2e
npm run build
```

All four pass, same counts as baseline (831 + 25, build green).

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.tsx Features.md
git commit -m "$(cat <<'EOF'
refactor(diagram): dead-code sweep + docs update after Phase 1.1

Remove unused imports from DiagramView.tsx now that the canvas and
overlay rendering live in child components. Update Features.md to
reflect the composition.

Line count: DiagramView.tsx now <PASTE_ACTUAL_NUMBER> (was 1692).

Closes Phase 1.1 of the coding-standards refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Replace `<PASTE_ACTUAL_NUMBER>` with the actual line count from Step 2 before committing. No placeholder in the final commit.)

---

## Definition of Done (this plan)

- [ ] All 6 tasks complete.
- [ ] `source ~/.nvm/nvm.sh && nvm use && npm ci && npm run test:run && npm run test:e2e && npm run build` green locally.
- [ ] Phase 0 characterization tests still pass unchanged (no test modifications except removing dead test-file imports if any).
- [ ] `DiagramView.tsx` line count < 1000 (stretch: < 800).
- [ ] No new component file > ~600 lines (DiagramCanvasHost will be largest; acceptable given what it holds).
- [ ] No new hook file > ~100 lines.
- [ ] `Features.md` reflects the new structure.
- [ ] `graphify . --update` run (if tool available).
- [ ] Every commit uses the Co-Authored-By line.
- [ ] No user-visible behaviour change.
- [ ] `DiagramBridge` exported interface unchanged.
- [ ] `DiagramViewProps` exported interface unchanged.

## Risk & rollback

- **Risk: Task 5 (DiagramCanvasHost) introduces a subtle prop-passthrough bug.** Mitigation: characterization tests (DIAG-3.2-12, 3.5-06, 3.11-01, 3.13-01, 3.14-03, SHELL-1.2-22 skip) all live on the public rendering surface. They will catch event-handler regressions. Run after every prop added.
- **Risk: Hook extraction changes effect dependencies in subtle ways.** Mitigation: `useDiagramLayoutState` and `useReadOnlyState` are pure additions around existing `useState`/`useEffect` — their bodies are copy-paste from DiagramView. No new dependencies should appear in the extracted effects.
- **Risk: Line count targets aren't met.** Mitigation: they're targets, not gates. If DiagramView stays at ~1000 lines it's still a 40% reduction — acceptable for this phase. Deeper reductions need Phase 3 (DIP / repository pattern) to cut down the prop list.
- **Rollback.** Each task is one commit. `git revert <SHA>` reverts a single task without touching the others. Because public interfaces (`DiagramViewProps`, `DiagramBridge`) don't change, the shell never needs updating.

## Open questions

None blocking. The prop explosion in Tasks 4 and 5 is expected and addressed in later phases.
