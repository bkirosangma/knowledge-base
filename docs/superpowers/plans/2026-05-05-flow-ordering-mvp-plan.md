# Flow Ordering MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the auto-derived start/end heuristic with manually authored `startNodeIds` / `endNodeIds` and add per-flow `nodeOrders` so authors can number flow steps; add a "Lock into Flow" mode that focuses the canvas on a single flow with a stacked properties panel and in-canvas editing.

**Architecture:** Three layers — (1) data-model extension on `FlowDef` plus persistence pass-through, (2) `useDiagramFlowFocus` reads the manual fields directly (replacing `computeFlowRoles`), and (3) interaction-context state for `lockedFlowId` plus a stack-mode PropertiesPanel and an editable corner-numeral `OrderBadge` component. No feature flag — all new fields are optional and consumers fall through to "render nothing" when absent.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slices 1–5 in §14)

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/features/diagram/types.ts` | Modify — extend `FlowDef`. |
| `src/app/knowledge_base/shared/utils/persistence.ts` | Verify pass-through; no code change expected (`flows: data.flows ?? []`). |
| `src/app/knowledge_base/shared/utils/persistence.test.ts` | Add round-trip test for new `FlowDef` fields. |
| `src/app/knowledge_base/features/diagram/utils/flowUtils.ts` | Remove `computeFlowRoles`. |
| `src/app/knowledge_base/features/diagram/utils/flowUtils.test.ts` | Remove `computeFlowRoles` tests. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.ts` | Rewrite `flowOrderData` memo to read manual fields and emit `order`. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts` | **New** — covers role + order derivation. |
| `src/app/knowledge_base/features/diagram/components/OrderBadge.tsx` | **New** — corner numeral, read + edit modes. |
| `src/app/knowledge_base/features/diagram/components/OrderBadge.test.tsx` | **New**. |
| `src/app/knowledge_base/features/diagram/components/Element.tsx` | Modify — accept `order` and render `<OrderBadge>` next to existing `flow-role-pill`. |
| `src/app/knowledge_base/features/diagram/components/ConditionElement.tsx` | Modify — same. |
| `src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx` | Modify — extend `flowOrderData` type to include `order`, thread to children. |
| `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx` | Modify — add Member-Nodes section + Lock-into-Flow button. |
| `src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx` | Modify — add tests for new section. |
| `src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.tsx` | Modify — add `LockedFlowProvider` + `useLockedFlow` selector. |
| `src/app/knowledge_base/features/diagram/components/LockBanner.tsx` | **New**. |
| `src/app/knowledge_base/features/diagram/components/LockBanner.test.tsx` | **New**. |
| `src/app/knowledge_base/features/diagram/components/DiagramCanvas.tsx` | Modify — render `<LockBanner>` and apply pointer-events guards. |
| `src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts` | Modify — suppress canvas-click deselect when locked. |
| `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx` | Modify — render stack mode when locked. |
| `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.test.tsx` | Modify — add stack-mode test. |
| `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts` | Modify — add `Cmd/Ctrl+L` toggle. |
| `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.test.ts` | Modify — add shortcut test. |
| `Features.md` | Modify §3.1, §3.10, §3.13 — update FlowDef shape and Lock mode. |
| `test-cases/03-diagram.md` | Modify §3.10, §3.13 — add new IDs. |

---

## Conventions

- Test runner: `npm run test:run -- <path>` (single run, no watch). Add `--reporter=verbose` to see test names. Working directory: `/Users/kiro/My Projects/knowledge-base`.
- Type checker: `npm run typecheck`.
- Production build: `npm run build`.
- After each task that includes a commit step, run `npm run typecheck` first; if it fails, fix before committing.
- Branch is `feat/diagram-flow-enhancements` (already created by the spec phase).

---

## Task 1: Extend `FlowDef` with `nodeOrders`, `startNodeIds`, `endNodeIds`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/types.ts`

- [ ] **Step 1.1: Update `FlowDef` interface**

Locate the `FlowDef` interface and replace it with:

```ts
export interface FlowDef {
  id: string;
  name: string;
  connectionIds: string[];
  category?: string;
  /** Optional per-node order in this flow. Absent = no badge. Multiple nodes may share a number. */
  nodeOrders?: Record<string /* nodeId */, number>;
  /** Manually authored start node IDs. Empty / absent = nothing rendered as start. */
  startNodeIds?: string[];
  /** Manually authored end node IDs. Empty / absent = nothing rendered as end. */
  endNodeIds?: string[];
}
```

- [ ] **Step 1.2: Verify typecheck passes**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npm run typecheck
```

Expected: clean (no callers depended on the absence of these fields).

- [ ] **Step 1.3: Commit**

```bash
git add src/app/knowledge_base/features/diagram/types.ts
git commit -m "feat(diagram): extend FlowDef with nodeOrders, startNodeIds, endNodeIds"
```

---

## Task 2: Persistence round-trip test

**Files:**
- Modify: `src/app/knowledge_base/shared/utils/persistence.test.ts`

`flows` is currently passed through verbatim by `loadDiagram` / `loadDiagramFromData` / serialization (`flows: data.flows ?? []`). We confirm this with a test rather than assuming.

- [ ] **Step 2.1: Find an existing flow round-trip test or add a new describe block**

Run:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
grep -n "flows" src/app/knowledge_base/shared/utils/persistence.test.ts | head
```

If a flow describe block exists, add the new test case inside it. Otherwise, append a new describe block at the end of the file (before the final closing brace if present).

Add:

```ts
describe("FlowDef round-trip — nodeOrders / startNodeIds / endNodeIds", () => {
  it("preserves the new flow fields through loadDiagramFromData", () => {
    const data = {
      title: "T",
      layers: [],
      nodes: [],
      connections: [],
      flows: [
        {
          id: "flow-auth",
          name: "Auth",
          connectionIds: ["c1"],
          nodeOrders: { "el-a": 1, "el-b": 2 },
          startNodeIds: ["el-a"],
          endNodeIds: ["el-b"],
        },
      ],
    };
    const loaded = loadDiagramFromData(data as never);
    const flow = loaded.flows.find((f) => f.id === "flow-auth")!;
    expect(flow.nodeOrders).toEqual({ "el-a": 1, "el-b": 2 });
    expect(flow.startNodeIds).toEqual(["el-a"]);
    expect(flow.endNodeIds).toEqual(["el-b"]);
  });

  it("loads flows that omit the new fields without crashing", () => {
    const data = {
      title: "T",
      layers: [],
      nodes: [],
      connections: [],
      flows: [{ id: "flow-x", name: "X", connectionIds: [] }],
    };
    const loaded = loadDiagramFromData(data as never);
    const flow = loaded.flows[0];
    expect(flow.nodeOrders).toBeUndefined();
    expect(flow.startNodeIds).toBeUndefined();
    expect(flow.endNodeIds).toBeUndefined();
  });
});
```

If `loadDiagramFromData` is not imported at the top of the test file, add the import.

- [ ] **Step 2.2: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/persistence.test.ts
```

Expected: PASS (existing pass-through behaviour already supports the new fields).

- [ ] **Step 2.3: Commit**

```bash
git add src/app/knowledge_base/shared/utils/persistence.test.ts
git commit -m "test(persistence): cover FlowDef nodeOrders / startNodeIds / endNodeIds round-trip"
```

---

## Task 3: Rewrite `flowOrderData` to read manual fields

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.ts`
- Create: `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts`

The current `flowOrderData` memo calls `computeFlowRoles(flow.connectionIds, connections)`. Replace it with a direct read of `startNodeIds` / `endNodeIds`, plus an `order` field from `nodeOrders`. The returned shape becomes:

```ts
Map<string /* nodeId */, { role: 'start' | 'end' | 'middle'; order: number | undefined }> | null
```

- [ ] **Step 3.1: Write the failing tests**

Create `src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts`:

```tsx
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDiagramFlowFocus } from "./useDiagramFlowFocus";
import type { Connection, FlowDef, NodeData, Selection } from "../types";

const NODES: NodeData[] = [
  { id: "a", label: "A", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "b", label: "B", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "c", label: "C", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
];
const CONNS: Connection[] = [
  { id: "c1", from: "a", to: "b", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
  { id: "c2", from: "b", to: "c", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
];

function makeFlow(over: Partial<FlowDef> = {}): FlowDef {
  return { id: "f", name: "F", connectionIds: ["c1", "c2"], ...over };
}

function setup(flow: FlowDef, sel: Selection = { type: "flow", id: "f" }) {
  return renderHook(() =>
    useDiagramFlowFocus({
      nodes: NODES,
      connections: CONNS,
      flows: [flow],
      selection: sel,
      setSelection: () => {},
    }),
  );
}

describe("useDiagramFlowFocus.flowOrderData (manual fields)", () => {
  it("returns null when no flow is selected/hovered", () => {
    const { result } = setup(makeFlow(), null);
    expect(result.current.flowOrderData).toBeNull();
  });

  it("returns roles 'middle' for every member when startNodeIds/endNodeIds are absent", () => {
    const { result } = setup(makeFlow());
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("middle");
    expect(map.get("b")?.role).toBe("middle");
    expect(map.get("c")?.role).toBe("middle");
  });

  it("uses startNodeIds for 'start' role and endNodeIds for 'end' role", () => {
    const { result } = setup(makeFlow({ startNodeIds: ["a"], endNodeIds: ["c"] }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("start");
    expect(map.get("b")?.role).toBe("middle");
    expect(map.get("c")?.role).toBe("end");
  });

  it("supports multiple starts and multiple ends", () => {
    const { result } = setup(makeFlow({ startNodeIds: ["a", "b"], endNodeIds: ["c", "b"] }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.role).toBe("start");
    // b is in both — last write wins; design is "start takes precedence over end"
    expect(map.get("b")?.role).toBe("start");
    expect(map.get("c")?.role).toBe("end");
  });

  it("emits order numbers from nodeOrders", () => {
    const { result } = setup(makeFlow({ nodeOrders: { a: 1, b: 2, c: 2 } }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.order).toBe(1);
    expect(map.get("b")?.order).toBe(2);
    expect(map.get("c")?.order).toBe(2);
  });

  it("leaves order undefined for nodes without an entry", () => {
    const { result } = setup(makeFlow({ nodeOrders: { a: 1 } }));
    const map = result.current.flowOrderData!;
    expect(map.get("a")?.order).toBe(1);
    expect(map.get("b")?.order).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run the tests to confirm they fail**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts
```

Expected: failures around `role` (current heuristic returns `start` for `a` and `end` for `c`) and `order` (currently the `flowOrderData` map values do not have an `order` key).

- [ ] **Step 3.3: Rewrite the `flowOrderData` memo**

In `useDiagramFlowFocus.ts`, replace:

```ts
const flowOrderData = useMemo(() => {
  const activeFlowId = hoveredFlowId ?? (selection?.type === "flow" ? selection.id : null);
  if (!activeFlowId) return null;
  const flow = flows.find((f) => f.id === activeFlowId);
  if (!flow) return null;
  return computeFlowRoles(flow.connectionIds, connections);
}, [selection, hoveredFlowId, flows, connections]);
```

with:

```ts
const flowOrderData = useMemo(() => {
  const activeFlowId = hoveredFlowId ?? (selection?.type === "flow" ? selection.id : null);
  if (!activeFlowId) return null;
  const flow = flows.find((f) => f.id === activeFlowId);
  if (!flow) return null;

  // Members are nodes that appear as either endpoint of any of the flow's connections.
  const memberIds = new Set<string>();
  for (const cid of flow.connectionIds) {
    const c = connections.find((x) => x.id === cid);
    if (c) {
      memberIds.add(c.from);
      memberIds.add(c.to);
    }
  }

  const starts = new Set(flow.startNodeIds ?? []);
  const ends = new Set(flow.endNodeIds ?? []);
  const orders = flow.nodeOrders ?? {};

  const map = new Map<string, { role: 'start' | 'end' | 'middle'; order: number | undefined }>();
  for (const nid of memberIds) {
    const role = starts.has(nid) ? 'start' : ends.has(nid) ? 'end' : 'middle';
    map.set(nid, { role, order: orders[nid] });
  }
  return map;
}, [selection, hoveredFlowId, flows, connections]);
```

Remove the `import { computeFlowRoles } from "../utils/flowUtils";` line at the top of the file.

- [ ] **Step 3.4: Run the tests to confirm they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts
```

Expected: all PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.ts \
        src/app/knowledge_base/features/diagram/hooks/useDiagramFlowFocus.test.ts
git commit -m "refactor(diagram): flowOrderData reads FlowDef.startNodeIds/endNodeIds/nodeOrders"
```

---

## Task 4: Remove dead `computeFlowRoles`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/utils/flowUtils.ts`
- Modify: `src/app/knowledge_base/features/diagram/utils/flowUtils.test.ts`

- [ ] **Step 4.1: Confirm no other callers**

```bash
grep -rn "computeFlowRoles" src/ docs/ test-cases/ 2>/dev/null
```

Expected: only the definition (`flowUtils.ts`) and its tests (`flowUtils.test.ts`). The call site in `useDiagramFlowFocus.ts` was removed in Task 3.

- [ ] **Step 4.2: Delete the function from `flowUtils.ts`**

Locate the `export function computeFlowRoles(` block and delete it together with its preceding JSDoc comment. Leave the rest of the file (`isContiguous`, `orderConnections`, `findBrokenFlows`, etc.) untouched.

- [ ] **Step 4.3: Delete the matching tests in `flowUtils.test.ts`**

Locate the `describe("computeFlowRoles"` block (or similar) and delete it.

- [ ] **Step 4.4: Run the remaining tests**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/utils/flowUtils.test.ts
```

Expected: PASS (other utilities unaffected).

- [ ] **Step 4.5: Typecheck**

```bash
npm run typecheck
```

Expected: clean.

- [ ] **Step 4.6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/utils/flowUtils.ts \
        src/app/knowledge_base/features/diagram/utils/flowUtils.test.ts
git commit -m "refactor(diagram): remove computeFlowRoles (replaced by manual FlowDef fields)"
```

---

## Task 5: `OrderBadge` component (read-only mode)

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/OrderBadge.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/OrderBadge.test.tsx`

The component renders the corner numeral for a node in a focused or locked flow.

- [ ] **Step 5.1: Write the failing tests**

Create `OrderBadge.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OrderBadge } from "./OrderBadge";

describe("OrderBadge", () => {
  it("renders nothing when value is undefined and editable is false", () => {
    const { container } = render(<OrderBadge value={undefined} editable={false} onChange={() => {}} nodeId="n1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the number when value is provided in read mode", () => {
    render(<OrderBadge value={3} editable={false} onChange={() => {}} nodeId="n1" />);
    expect(screen.getByTestId("order-badge-n1")).toHaveTextContent("3");
  });

  it("renders an empty editable badge when value undefined and editable", () => {
    render(<OrderBadge value={undefined} editable={true} onChange={() => {}} nodeId="n1" />);
    const badge = screen.getByTestId("order-badge-n1");
    expect(badge).toHaveTextContent("");
    expect(badge).toHaveClass("border-dashed");
  });

  it("calls onChange with the parsed integer when input commits via Enter", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={1} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it("calls onChange with undefined when the input is cleared and committed", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={2} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not call onChange on Escape", () => {
    const onChange = vi.fn();
    render(<OrderBadge value={4} editable={true} onChange={onChange} nodeId="n1" />);
    fireEvent.click(screen.getByTestId("order-badge-n1"));
    const input = screen.getByTestId("order-badge-input-n1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5.2: Run the tests to confirm they fail**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/OrderBadge.test.tsx
```

Expected: import error / module not found.

- [ ] **Step 5.3: Implement `OrderBadge`**

Create `OrderBadge.tsx`:

```tsx
import { useState, useRef, useEffect } from "react";

interface OrderBadgeProps {
  /** The numeric order of this node within the focused flow. Undefined hides the badge in read mode. */
  value: number | undefined;
  /** When true, the badge is interactive: an empty placeholder shows even if value is undefined. */
  editable: boolean;
  /** Called with the new value (integer) or `undefined` when the input is cleared. */
  onChange: (next: number | undefined) => void;
  /** Stable identifier for testability. */
  nodeId: string;
}

/**
 * Corner numeral badge displayed at the top-left of a node when a flow is focused.
 *
 * Read mode: solid blue circle with the order numeral. Hidden when value is undefined.
 * Edit mode: dashed-border editable rectangle. Click → input opens. Enter or blur commits;
 * Escape cancels. Empty value commits as `undefined`.
 */
export function OrderBadge({ value, editable, onChange, nodeId }: OrderBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value?.toString() ?? "");
  }, [value]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (!editable && value === undefined) return null;

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      onChange(undefined);
    } else {
      const n = parseInt(trimmed, 10);
      if (!Number.isNaN(n)) onChange(n);
    }
    setIsEditing(false);
  };
  const cancel = () => {
    setDraft(value?.toString() ?? "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        data-testid={`order-badge-input-${nodeId}`}
        className="absolute -top-3 -left-3 w-9 h-7 px-1 text-xs font-bold text-blue-800 bg-white border-2 border-dashed border-blue-500 rounded text-center"
        value={draft}
        inputMode="numeric"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
      />
    );
  }

  const isEmpty = value === undefined;
  return (
    <button
      type="button"
      data-testid={`order-badge-${nodeId}`}
      onClick={editable ? () => setIsEditing(true) : undefined}
      className={
        "absolute -top-3 -left-3 w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center border-2 " +
        (isEmpty
          ? "bg-white text-blue-800 border-dashed border-blue-500"
          : "bg-blue-600 text-white border-white shadow") +
        (editable ? " cursor-pointer" : " cursor-default")
      }
      tabIndex={editable ? 0 : -1}
      aria-label={isEmpty ? `Order: unset for ${nodeId}` : `Order ${value} for ${nodeId}`}
    >
      {value ?? ""}
    </button>
  );
}
```

- [ ] **Step 5.4: Run the tests to confirm they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/OrderBadge.test.tsx
```

Expected: all PASS.

- [ ] **Step 5.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/OrderBadge.tsx \
        src/app/knowledge_base/features/diagram/components/OrderBadge.test.tsx
git commit -m "feat(diagram): OrderBadge — corner numeral with read + edit modes"
```

---

## Task 6: Render `OrderBadge` from `Element.tsx` and `ConditionElement.tsx`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/Element.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/ConditionElement.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx`

The badge is positioned absolutely relative to the node container (the same parent that already hosts the `flow-role-pill` from KB-032). Both `Element` and `ConditionElement` already accept a `flowRole` prop; we add a new `order` prop and an `orderEditable` flag.

- [ ] **Step 6.1: Extend `flowOrderData` type in `DiagramNodeLayer.tsx`**

Find the line:

```ts
flowOrderData?: Map<string, { role: 'start' | 'end' | 'middle' }> | null;
```

Replace with:

```ts
flowOrderData?: Map<string, { role: 'start' | 'end' | 'middle'; order: number | undefined }> | null;
```

Then in the rendering loop, where `flowEntry` is read (around line 217), pass `flowEntry?.order` and the editability flag to the rendered `Element` / `ConditionElement`. Add new props in the JSX:

```tsx
order={flowEntry?.order}
orderEditable={isLocked && !readOnly && flowEntry !== undefined}
onOrderChange={(next) => onChangeNodeOrder?.(node.id, next)}
```

`isLocked`, `readOnly`, and `onChangeNodeOrder` are new props that flow into `DiagramNodeLayer`. Add them to the props interface:

```ts
isLocked?: boolean;
readOnly?: boolean;
onChangeNodeOrder?: (nodeId: string, next: number | undefined) => void;
```

Destructure them in the function signature.

- [ ] **Step 6.2: Add the new props to `Element.tsx`**

In `Element.tsx`'s props interface, after the existing `flowRole` prop, add:

```ts
order?: number;
orderEditable?: boolean;
onOrderChange?: (next: number | undefined) => void;
```

Destructure them in the function signature.

Inside the JSX, immediately after the existing `flow-role-pill` block (around line 155–162), add:

```tsx
{(orderEditable || order !== undefined) && (
  <OrderBadge
    value={order}
    editable={!!orderEditable}
    onChange={(next) => onOrderChange?.(next)}
    nodeId={id}
  />
)}
```

Add the import at the top of `Element.tsx`:

```ts
import { OrderBadge } from "./OrderBadge";
```

In the React.memo equality check (around line 288), add the new props to the comparison:

```ts
p.order === n.order &&
p.orderEditable === n.orderEditable &&
p.onOrderChange === n.onOrderChange &&
```

- [ ] **Step 6.3: Apply the same change to `ConditionElement.tsx`**

Mirror the steps in 6.2 in `ConditionElement.tsx`. The badge is positioned with the same `-top-3 -left-3` absolute offset relative to the diamond's bounding box wrapper.

- [ ] **Step 6.4: Wire `onChangeNodeOrder` from the parent**

`DiagramNodeLayer` already receives a callback bag from `DiagramCanvas`. Trace the prop and add `onChangeNodeOrder` to the bag, plumbed up to `DiagramView.tsx`. In `DiagramView.tsx`, define the handler:

```ts
const handleChangeNodeOrder = useCallback((nodeId: string, next: number | undefined) => {
  if (!lockedFlowId) return; // Only meaningful in lock mode.
  setFlows((prev) => prev.map((f) => {
    if (f.id !== lockedFlowId) return f;
    const orders = { ...(f.nodeOrders ?? {}) };
    if (next === undefined) delete orders[nodeId];
    else orders[nodeId] = next;
    return { ...f, nodeOrders: orders };
  }));
  recordAction(); // existing history hook
}, [lockedFlowId, setFlows, recordAction]);
```

`lockedFlowId` is added in Task 8; for now, leave the handler stubbed or commit Task 6 without persisting (a follow-up step in Task 8 wires it in).

- [ ] **Step 6.5: Run tests + manual visual check**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/Element.test.tsx \
                    src/app/knowledge_base/features/diagram/components/Element.memo.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6.6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/Element.tsx \
        src/app/knowledge_base/features/diagram/components/ConditionElement.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "feat(diagram): render OrderBadge on members of focused/locked flow"
```

---

## Task 7: `FlowProperties` — Member nodes section

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx`

Add a new collapsible section between the existing "Identity" and "Connections" sections. The section lists every member node (sorted by current order, then label) with an order input and start/end checkboxes. A "Number sequentially" button stamps `1..n` in current sort order.

- [ ] **Step 7.1: Write the failing test**

Append to `FlowProperties.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FlowProperties } from "./FlowProperties";
import type { FlowDef, Connection, NodeData } from "../types";

const NODES: NodeData[] = [
  { id: "a", label: "A", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "b", label: "B", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
  { id: "c", label: "C", layer: "ly", x: 0, y: 0, w: 100, icon: (() => null) as never },
];
const CONNS: Connection[] = [
  { id: "c1", from: "a", to: "b", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
  { id: "c2", from: "b", to: "c", fromAnchor: "right-1", toAnchor: "left-1", color: "#000", label: "" },
];

function renderProps(flow: FlowDef, onUpdate = vi.fn()) {
  render(
    <FlowProperties
      id="f"
      flows={[flow]}
      connections={CONNS}
      nodes={NODES}
      allFlowIds={["f"]}
      onUpdate={onUpdate}
    />,
  );
  return { onUpdate };
}

describe("FlowProperties — Member nodes section", () => {
  it("lists every flow-member node sorted by order then label", () => {
    renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"], nodeOrders: { c: 1, a: 2 } });
    const rows = screen.getAllByTestId(/^flow-member-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "flow-member-row-c", // order 1
      "flow-member-row-a", // order 2
      "flow-member-row-b", // unset → after numbered, alphabetical
    ]);
  });

  it("calls onUpdate with new nodeOrders when the input commits", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const input = screen.getByTestId("flow-member-order-input-a") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ nodeOrders: { a: 5 } }));
  });

  it("toggles startNodeIds when the start checkbox changes", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const cb = screen.getByTestId("flow-member-start-checkbox-a") as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ startNodeIds: ["a"] }));
  });

  it("toggles endNodeIds when the end checkbox changes", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    const cb = screen.getByTestId("flow-member-end-checkbox-c") as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({ endNodeIds: ["c"] }));
  });

  it("Number sequentially button stamps 1..n by current sort", () => {
    const { onUpdate } = renderProps({ id: "f", name: "F", connectionIds: ["c1", "c2"] });
    fireEvent.click(screen.getByTestId("flow-number-sequentially"));
    expect(onUpdate).toHaveBeenCalledWith("f", expect.objectContaining({
      nodeOrders: { a: 1, b: 2, c: 3 },
    }));
  });
});
```

- [ ] **Step 7.2: Run the tests to confirm they fail**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
```

Expected: query failures (the new section doesn't exist).

- [ ] **Step 7.3: Implement the Member nodes section**

In `FlowProperties.tsx`, widen the `onUpdate` prop type to accept the new fields:

```ts
onUpdate?: (id: string, updates: Partial<{
  id: string;
  name: string;
  category: string;
  nodeOrders: Record<string, number>;
  startNodeIds: string[];
  endNodeIds: string[];
}>) => void;
```

Below the existing `nodeItems` memo, add a sorted-and-decorated list:

```tsx
const memberRows = useMemo(() => {
  if (!flow) return [];
  const orders = flow.nodeOrders ?? {};
  const startSet = new Set(flow.startNodeIds ?? []);
  const endSet = new Set(flow.endNodeIds ?? []);
  return nodeItems
    .map((n) => ({
      id: n.id,
      label: n.name,
      order: orders[n.id],
      isStart: startSet.has(n.id),
      isEnd: endSet.has(n.id),
    }))
    .sort((x, y) => {
      if (x.order !== undefined && y.order !== undefined) return x.order - y.order || x.label.localeCompare(y.label);
      if (x.order !== undefined) return -1;
      if (y.order !== undefined) return 1;
      return x.label.localeCompare(y.label);
    });
}, [flow, nodeItems]);
```

Then render a new `Section` titled "Member nodes" between the existing "Identity" and the existing "Connections" sections:

```tsx
<Section title="Member nodes">
  <div className="flex justify-end mb-1">
    <button
      type="button"
      data-testid="flow-number-sequentially"
      className="text-xs text-blue-700 hover:underline disabled:opacity-50"
      disabled={readOnly || memberRows.length === 0}
      onClick={() => {
        const nodeOrders: Record<string, number> = {};
        memberRows.forEach((r, i) => { nodeOrders[r.id] = i + 1; });
        onUpdate?.(flow.id, { nodeOrders });
      }}
    >
      Number sequentially
    </button>
  </div>
  {memberRows.map((row) => (
    <div
      key={row.id}
      data-testid={`flow-member-row-${row.id}`}
      className="flex items-center gap-2 text-xs py-0.5"
    >
      <span className="flex-1 truncate">{row.label}</span>
      <input
        data-testid={`flow-member-order-input-${row.id}`}
        type="text"
        inputMode="numeric"
        className="w-12 px-1 py-0.5 border rounded text-center"
        defaultValue={row.order ?? ""}
        disabled={readOnly}
        onBlur={(e) => {
          const v = e.target.value.trim();
          const next = v === "" ? undefined : parseInt(v, 10);
          const orders = { ...(flow.nodeOrders ?? {}) };
          if (next === undefined || Number.isNaN(next)) delete orders[row.id];
          else orders[row.id] = next;
          onUpdate?.(flow.id, { nodeOrders: orders });
        }}
      />
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          data-testid={`flow-member-start-checkbox-${row.id}`}
          checked={row.isStart}
          disabled={readOnly}
          onChange={() => {
            const set = new Set(flow.startNodeIds ?? []);
            row.isStart ? set.delete(row.id) : set.add(row.id);
            onUpdate?.(flow.id, { startNodeIds: [...set] });
          }}
        />
        <span>Start</span>
      </label>
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          data-testid={`flow-member-end-checkbox-${row.id}`}
          checked={row.isEnd}
          disabled={readOnly}
          onChange={() => {
            const set = new Set(flow.endNodeIds ?? []);
            row.isEnd ? set.delete(row.id) : set.add(row.id);
            onUpdate?.(flow.id, { endNodeIds: [...set] });
          }}
        />
        <span>End</span>
      </label>
    </div>
  ))}
  {memberRows.length === 0 && <p className="text-xs text-mute">No member nodes — flow has no connections.</p>}
</Section>
```

- [ ] **Step 7.4: Run the tests to confirm they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
```

Expected: all PASS.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx
git commit -m "feat(diagram): FlowProperties — Member nodes section with order + start/end edits"
```

---

## Task 8: `LockedFlowProvider` in `DiagramInteractionContext`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.tsx`

Following the existing slice-based pattern (one provider per slice, `useSelection` / `useHovered` / `useContextMenu` / etc.), add a new slice for `lockedFlowId`.

- [ ] **Step 8.1: Add the slice**

Below the existing `HoveredNodeProvider` block, add:

```tsx
// ─── Locked flow ─────────────────────────────────────────────────────

export interface LockedFlowContextValue {
  lockedFlowId: string | null;
  setLockedFlowId: React.Dispatch<React.SetStateAction<string | null>>;
}
const LockedFlowContext = createContext<LockedFlowContextValue | null>(null);

function LockedFlowProvider({ children }: { children: React.ReactNode }) {
  const [lockedFlowId, setLockedFlowId] = useState<string | null>(null);
  const value = useMemo(() => ({ lockedFlowId, setLockedFlowId }), [lockedFlowId]);
  return <LockedFlowContext.Provider value={value}>{children}</LockedFlowContext.Provider>;
}

export function useLockedFlow(): LockedFlowContextValue {
  const ctx = useContext(LockedFlowContext);
  if (!ctx) throw new Error("useLockedFlow must be used within DiagramInteractionProvider");
  return ctx;
}
```

- [ ] **Step 8.2: Nest the provider inside the master `DiagramInteractionProvider`**

Find the existing `DiagramInteractionProvider` composition (the function that nests `SelectionProvider`, `HoveredNodeProvider`, etc.). Insert `LockedFlowProvider` as the innermost wrapper:

```tsx
return (
  <SelectionProvider>
    <HoveredNodeProvider>
      <ContextMenuProvider>
        {/* … other providers … */}
        <LockedFlowProvider>
          {children}
        </LockedFlowProvider>
      </ContextMenuProvider>
    </HoveredNodeProvider>
  </SelectionProvider>
);
```

(Place it after every other provider so other slices remain stable.)

- [ ] **Step 8.3: Add a focused test**

Append to `DiagramInteractionContext.test.tsx` (create the file if it does not exist):

```tsx
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DiagramInteractionProvider, useLockedFlow } from "./DiagramInteractionContext";

describe("useLockedFlow", () => {
  it("starts null and toggles on demand", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DiagramInteractionProvider>{children}</DiagramInteractionProvider>
    );
    const { result } = renderHook(() => useLockedFlow(), { wrapper });
    expect(result.current.lockedFlowId).toBeNull();
    act(() => result.current.setLockedFlowId("flow-x"));
    expect(result.current.lockedFlowId).toBe("flow-x");
    act(() => result.current.setLockedFlowId(null));
    expect(result.current.lockedFlowId).toBeNull();
  });
});
```

- [ ] **Step 8.4: Run tests + typecheck**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.tsx \
        src/app/knowledge_base/features/diagram/state/DiagramInteractionContext.test.tsx
git commit -m "feat(diagram): LockedFlow slice in DiagramInteractionContext"
```

---

## Task 9: `LockBanner` component

**Files:**
- Create: `src/app/knowledge_base/features/diagram/components/LockBanner.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/LockBanner.test.tsx`

A small pill rendered top-right of the canvas that names the locked flow and exposes an Unlock action.

- [ ] **Step 9.1: Write the failing test**

Create `LockBanner.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LockBanner } from "./LockBanner";

describe("LockBanner", () => {
  it("renders the flow name and an Unlock button", () => {
    render(<LockBanner flowName="Auth" onUnlock={() => {}} />);
    expect(screen.getByTestId("lock-banner")).toHaveTextContent("Auth");
    expect(screen.getByTestId("lock-banner-unlock")).toHaveTextContent("Unlock");
  });

  it("calls onUnlock when the button is clicked", () => {
    const onUnlock = vi.fn();
    render(<LockBanner flowName="Auth" onUnlock={onUnlock} />);
    fireEvent.click(screen.getByTestId("lock-banner-unlock"));
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 9.2: Run the tests to confirm they fail**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/LockBanner.test.tsx
```

Expected: import error.

- [ ] **Step 9.3: Implement `LockBanner`**

```tsx
import { Lock } from "lucide-react";

interface LockBannerProps {
  flowName: string;
  onUnlock: () => void;
}

export function LockBanner({ flowName, onUnlock }: LockBannerProps) {
  return (
    <div
      data-testid="lock-banner"
      className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-full shadow-sm"
    >
      <Lock size={12} />
      <span>{flowName}</span>
      <button
        type="button"
        data-testid="lock-banner-unlock"
        onClick={onUnlock}
        className="ml-1 px-2 py-0.5 text-amber-900 bg-amber-200 hover:bg-amber-300 rounded"
      >
        Unlock
      </button>
    </div>
  );
}
```

- [ ] **Step 9.4: Run the tests to confirm they pass**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/LockBanner.test.tsx
```

Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/LockBanner.tsx \
        src/app/knowledge_base/features/diagram/components/LockBanner.test.tsx
git commit -m "feat(diagram): LockBanner component"
```

---

## Task 10: Wire `lockedFlowId` into `DiagramCanvas` and apply pointer-events guard

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramCanvas.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramLinesOverlay.tsx`

When `lockedFlowId !== null`, every non-member node and connection gets `pointer-events: none` in addition to the existing dim styling. We use the existing `flowDimSets` infrastructure, but now we need to know whether the dimming source is a *lock* (apply pointer-events) or a *hover* (visual only).

- [ ] **Step 10.1: Pass `isLocked` through `DiagramCanvas`**

In `DiagramCanvas.tsx`:

1. Read the locked flow:

```ts
import { useLockedFlow } from "../state/DiagramInteractionContext";
// inside the component:
const { lockedFlowId, setLockedFlowId } = useLockedFlow();
const isLocked = lockedFlowId !== null;
const lockedFlow = useMemo(
  () => flows.find((f) => f.id === lockedFlowId) ?? null,
  [flows, lockedFlowId],
);
```

2. Render `<LockBanner>` when locked. Add the import at the top:

```ts
import { LockBanner } from "./LockBanner";
```

3. In the JSX, inside the canvas wrapper, before the children:

```tsx
{lockedFlow && (
  <LockBanner flowName={lockedFlow.name} onUnlock={() => setLockedFlowId(null)} />
)}
```

4. Pass `isLocked` to `DiagramNodeLayer` and `DiagramLinesOverlay`.

- [ ] **Step 10.2: Apply pointer-events guard in `DiagramNodeLayer`**

Locate the rendering loop. For each node, the existing dim treatment uses `flowDimSets`. Replace it (or augment) so that non-members in lock mode also get pointer-events disabled. In the JSX:

```tsx
const isMember = !flowDimSets || flowDimSets.nodeIds.has(node.id);
const dimmed = !isMember;
const lockedNonMember = isLocked && !isMember;
// pass lockedNonMember down to <Element />

<div
  style={{
    pointerEvents: lockedNonMember ? "none" : undefined,
    opacity: dimmed ? 0.22 : 1,
    filter: dimmed ? "grayscale(70%)" : undefined,
  }}
  // ...
>
  <Element ... lockedNonMember={lockedNonMember} />
</div>
```

Add `lockedNonMember` as an optional prop on `Element` (for memoization purposes; it gates the order-edit behavior in Task 12).

- [ ] **Step 10.3: Mirror in `DiagramLinesOverlay`**

For each connection, if `flowDimSets && !flowDimSets.connIds.has(c.id) && isLocked`, add `pointer-events: none` to the SVG element wrapping the line.

- [ ] **Step 10.4: Smoke test**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/DiagramCanvas.test.tsx 2>/dev/null || true
npm run typecheck
```

Expected: typecheck clean. (If a DiagramCanvas test exists and depends on rendering, ensure the new `LockBanner` import doesn't break it.)

- [ ] **Step 10.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/DiagramCanvas.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramLinesOverlay.tsx \
        src/app/knowledge_base/features/diagram/components/Element.tsx
git commit -m "feat(diagram): apply lock-mode pointer-events guard + render LockBanner"
```

---

## Task 11: Suppress canvas-click deselect when locked

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts` (or whichever hook owns the empty-canvas click; locate it via grep below).

- [ ] **Step 11.1: Find the deselect handler**

```bash
grep -rn "setSelection(null)" src/app/knowledge_base/features/diagram/ | head
```

Expected: a single hit in `useCanvasInteraction.ts` (or `DiagramCanvas.tsx`) inside the empty-canvas mousedown / click handler.

- [ ] **Step 11.2: Add the lock guard**

At the top of the handler, replace:

```ts
setSelection(null);
```

with:

```ts
if (lockedFlowId) return; // Lock mode: canvas click does not deselect.
setSelection(null);
```

If `lockedFlowId` is not in scope where this handler lives, import `useLockedFlow` and read it at the top of the hook / component.

- [ ] **Step 11.3: Add a regression test**

In the corresponding test file (`useCanvasInteraction.test.ts` or `DiagramCanvas.test.tsx`), add a test that simulates a canvas-empty click while `lockedFlowId !== null` and asserts that `setSelection` is not called.

- [ ] **Step 11.4: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.test.ts 2>/dev/null || true
```

- [ ] **Step 11.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.ts \
        src/app/knowledge_base/features/diagram/hooks/useCanvasInteraction.test.ts 2>/dev/null
git commit -m "fix(diagram): canvas-empty click does not deselect when a flow is locked"
```

---

## Task 12: PropertiesPanel — stack mode when locked

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/PropertiesPanel.test.tsx`

When `lockedFlowId !== null`, render `<FlowProperties>` as the always-visible top section. Below it, render whatever the current selection-driven panel would normally render (NodeProperties / LineProperties / LayerProperties), but only when the selection is a member of the locked flow.

- [ ] **Step 12.1: Write the failing test**

Append to `PropertiesPanel.test.tsx`:

```tsx
it("stacks FlowProperties + NodeProperties when locked and a member node is selected", () => {
  // Render PropertiesPanel inside DiagramInteractionProvider with lockedFlowId set to "flow-1"
  // and selection = { type: "node", id: "a" } where "a" is a member of flow-1.
  // Assert both data-testids "flow-properties-panel" and "node-properties-panel" are present.
});
```

(Adapt the test harness: existing tests render `PropertiesPanel` with mocked props; you'll need to wrap with `DiagramInteractionProvider` and use a small helper to seed `lockedFlowId`.)

- [ ] **Step 12.2: Run to confirm failure**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/PropertiesPanel.test.tsx
```

Expected: FAIL — `flow-properties-panel` not rendered when selection is a node.

- [ ] **Step 12.3: Modify the panel routing**

Near the top of the function body in `PropertiesPanel.tsx`:

```tsx
import { useLockedFlow } from "../state/DiagramInteractionContext";
import { FlowProperties } from "./FlowProperties";

// inside the component:
const { lockedFlowId } = useLockedFlow();
const lockedFlow = lockedFlowId ? flows.find((f) => f.id === lockedFlowId) : null;
```

In the existing return JSX, when `lockedFlow` is non-null, render the stack:

```tsx
{lockedFlow ? (
  <>
    <div data-testid="flow-properties-panel">
      <FlowProperties
        id={lockedFlow.id}
        flows={flows}
        connections={connections}
        nodes={nodes}
        allFlowIds={flows.map((f) => f.id)}
        onUpdate={onUpdateFlow}
        onDelete={onDeleteFlow}
        readOnly={readOnly}
        // (other existing FlowProperties props threaded through)
      />
    </div>
    {selection && selection.type !== "flow" && (
      <div data-testid="element-properties-panel" className="mt-4 border-t pt-4">
        {/* existing selection-driven routing — extracted into a renderForSelection() helper */}
        {renderForSelection()}
      </div>
    )}
  </>
) : (
  // existing non-locked rendering: renderForSelection()
  renderForSelection()
)}
```

Where `renderForSelection()` is a local helper that returns the JSX previously produced for the various selection types (node / layer / line / flow / multi-* / null). Extract the existing switch-on-`selection.type` block into this helper so both the locked and unlocked paths share it.

- [ ] **Step 12.4: Run the tests**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/PropertiesPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 12.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/PropertiesPanel.tsx \
        src/app/knowledge_base/features/diagram/properties/PropertiesPanel.test.tsx
git commit -m "feat(diagram): PropertiesPanel stacks FlowProperties + ElementProperties when locked"
```

---

## Task 13: "Lock into Flow" button in `FlowProperties`; `Cmd/Ctrl+L` shortcut

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts`
- Modify: `src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 13.1: Write the failing tests**

Append to `FlowProperties.test.tsx`:

```tsx
it("calls onLock when Lock into Flow button is clicked", () => {
  const onLock = vi.fn();
  render(
    <FlowProperties
      id="f"
      flows={[{ id: "f", name: "F", connectionIds: [] }]}
      connections={[]}
      nodes={[]}
      allFlowIds={["f"]}
      onLock={onLock}
    />,
  );
  fireEvent.click(screen.getByTestId("flow-lock-button"));
  expect(onLock).toHaveBeenCalledWith("f");
});
```

Append to `useKeyboardShortcuts.test.ts`:

```tsx
it("Cmd/Ctrl+L toggles the locked flow when a flow is selected", () => {
  // Use the existing shortcut-test harness to dispatch a keydown event with
  // metaKey: true, key: "l", with selection = { type: "flow", id: "f" }, and
  // assert setLockedFlowId is called with "f".
});
```

- [ ] **Step 13.2: Implement the button**

In `FlowProperties.tsx`, add an `onLock?: (flowId: string) => void` prop and render the button below the existing Identity section:

```tsx
{onLock && (
  <button
    type="button"
    data-testid="flow-lock-button"
    className="text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded px-2 py-1 mt-2"
    onClick={() => onLock(flow.id)}
  >
    🔒 Lock into Flow (⌘L)
  </button>
)}
```

Wire `onLock` from `PropertiesPanel.tsx` so the click calls `setLockedFlowId(flowId)` from `useLockedFlow`.

- [ ] **Step 13.3: Implement the shortcut**

In `useKeyboardShortcuts.ts`, near the existing `Cmd/Ctrl+G` (create flow) handler, add:

```ts
if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
  e.preventDefault();
  if (lockedFlowId !== null) {
    setLockedFlowId(null);
    return;
  }
  if (selection?.type === "flow") {
    setLockedFlowId(selection.id);
  }
  return;
}
```

Pull `lockedFlowId` and `setLockedFlowId` from the `useLockedFlow` hook (or pass them in via the hook's input bag — match the existing pattern).

- [ ] **Step 13.4: Run the tests**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx \
                    src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.test.ts
```

Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx \
        src/app/knowledge_base/features/diagram/properties/FlowProperties.test.tsx \
        src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.ts \
        src/app/knowledge_base/features/diagram/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat(diagram): Lock into Flow button + Cmd/Ctrl+L shortcut"
```

---

## Task 14: Click-toggle role pill in lock+edit

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/Element.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/ConditionElement.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/Element.test.tsx`

The existing `flow-role-pill-{id}` already renders `Start` / `End`. In lock+edit, clicking the area where the pill would appear cycles the role: `none → start → end → none`. When no role applies, render an invisible-but-clickable affordance area so the author can stamp a start/end onto a member node.

- [ ] **Step 14.1: Write the failing test**

In `Element.test.tsx`, add:

```tsx
it("clicking the role-toggle area cycles role: none → start → end → none in lock+edit", () => {
  const onRoleToggle = vi.fn();
  render(
    <Element
      id="n1"
      // ... required props ...
      flowRole={null}
      lockEditRoleToggle={true}
      onRoleToggle={onRoleToggle}
    />,
  );
  fireEvent.click(screen.getByTestId("flow-role-toggle-n1"));
  expect(onRoleToggle).toHaveBeenLastCalledWith("start");

  // simulate the new prop value flowing back in:
  // re-render with flowRole='start' and click again
});
```

- [ ] **Step 14.2: Implement the toggle**

In `Element.tsx`, replace the existing `flow-role-pill` block with a conditional that supports both display-only and click-to-toggle:

```tsx
{(flowRole === 'start' || flowRole === 'end' || lockEditRoleToggle) && (
  <button
    type="button"
    data-testid={lockEditRoleToggle ? `flow-role-toggle-${id}` : `flow-role-pill-${id}`}
    onClick={lockEditRoleToggle ? () => {
      const next = flowRole === 'start' ? 'end' : flowRole === 'end' ? null : 'start';
      onRoleToggle?.(next);
    } : undefined}
    className={
      "absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full " +
      (flowRole === 'start'
        ? "bg-green-600 text-white"
        : flowRole === 'end'
          ? "bg-red-600 text-white"
          : "bg-slate-200 text-slate-500 border border-dashed border-slate-400")
    }
    aria-label={
      flowRole === 'start' ? "Start of flow" :
      flowRole === 'end'   ? "End of flow"   :
      lockEditRoleToggle   ? `Click to mark ${id} as start of flow` : ""
    }
  >
    {flowRole === 'start' ? 'Start' : flowRole === 'end' ? 'End' : '·'}
  </button>
)}
```

Add the new props `lockEditRoleToggle?: boolean` and `onRoleToggle?: (next: 'start' | 'end' | null) => void` to the props interface and the React.memo equality check.

- [ ] **Step 14.3: Wire from `DiagramNodeLayer`**

In `DiagramNodeLayer.tsx`, compute `lockEditRoleToggle = isLocked && !readOnly && isMember` and pass `onRoleToggle={(next) => onChangeNodeRole?.(node.id, next)}`.

In `DiagramView.tsx`, define `onChangeNodeRole`:

```ts
const handleChangeNodeRole = useCallback((nodeId: string, next: 'start' | 'end' | null) => {
  if (!lockedFlowId) return;
  setFlows((prev) => prev.map((f) => {
    if (f.id !== lockedFlowId) return f;
    const startSet = new Set(f.startNodeIds ?? []);
    const endSet = new Set(f.endNodeIds ?? []);
    startSet.delete(nodeId);
    endSet.delete(nodeId);
    if (next === 'start') startSet.add(nodeId);
    if (next === 'end') endSet.add(nodeId);
    return { ...f, startNodeIds: [...startSet], endNodeIds: [...endSet] };
  }));
  recordAction();
}, [lockedFlowId, setFlows, recordAction]);
```

- [ ] **Step 14.4: Mirror in `ConditionElement.tsx`**

Same modifications for the diamond shape.

- [ ] **Step 14.5: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/Element.test.tsx \
                    src/app/knowledge_base/features/diagram/components/ConditionElement.test.tsx
npm run typecheck
```

Expected: PASS, clean.

- [ ] **Step 14.6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/components/Element.tsx \
        src/app/knowledge_base/features/diagram/components/ConditionElement.tsx \
        src/app/knowledge_base/features/diagram/components/Element.test.tsx \
        src/app/knowledge_base/features/diagram/components/DiagramNodeLayer.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "feat(diagram): click-toggle start/end role on member nodes in lock+edit"
```

---

## Task 15: File-switch clears lock

**Files:**
- Modify: wherever `activeFile` / file-switch is observed in the diagram pane (likely `DiagramView.tsx` or `useDiagramFileLoading.ts`).

- [ ] **Step 15.1: Find the file-switch effect**

```bash
grep -rn "activeFile" src/app/knowledge_base/features/diagram/ | head
```

- [ ] **Step 15.2: Add the lock-clear effect**

In `DiagramView.tsx` (or wherever the file-switch observation lives), add:

```ts
const { lockedFlowId, setLockedFlowId } = useLockedFlow();
useEffect(() => {
  if (lockedFlowId !== null) setLockedFlowId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeFile]);
```

- [ ] **Step 15.3: Add a regression test (optional, only if a `useDiagramFileLoading.test.ts` style harness exists)**

If the file-switch path is unit-tested elsewhere, add an assertion that `setLockedFlowId(null)` is called when `activeFile` changes. Otherwise rely on manual e2e validation in Task 16.

- [ ] **Step 15.4: Commit**

```bash
git add src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "fix(diagram): file switch clears lock-into-flow state"
```

---

## Task 16: Update `Features.md` and `test-cases/03-diagram.md`

**Files:**
- Modify: `Features.md`
- Modify: `test-cases/03-diagram.md`

- [ ] **Step 16.1: Update `Features.md` §3.1 — `FlowDef` shape**

Locate the bullet `⚙️ **FlowDef** — id, name, optional category, connectionIds[].` and replace with:

```markdown
- ⚙️ **FlowDef** — id, name, optional category, `connectionIds[]`. Optional `nodeOrders` (per-flow node-order map), `startNodeIds`, `endNodeIds` for manually authored flow-traversal metadata.
```

- [ ] **Step 16.2: Update `Features.md` §3.10 — start/end and order**

Replace the current "Flow start/end highlighting" bullet with one that describes the manual fields and the new order badge. Add a new bullet for "Lock into Flow" describing the dim treatment, panel stack, banner, and `Cmd/Ctrl+L` shortcut.

- [ ] **Step 16.3: Update `Features.md` §3.13 — Properties panel**

Append a sub-bullet to FlowProperties: "Member nodes section with editable per-node order, Start/End checkboxes, and a Number-sequentially button. Lock-into-Flow button + Cmd/Ctrl+L shortcut."

- [ ] **Step 16.4: Add new test-case IDs to `test-cases/03-diagram.md`**

Open the file and find the next free ID in §3.10. Add (using the existing Gherkin-lite shape):

```markdown
- DIAG-3.10-XX ❌: Given a flow with nodeOrders { a:1, b:2 }, when I focus the flow, then nodes a and b show blue corner numerals "1" and "2".
- DIAG-3.10-XX ❌: Given startNodeIds=[a], endNodeIds=[c], when I focus the flow, then a glows green with a "Start" pill and c glows red with an "End" pill.
- DIAG-3.10-XX ❌: Given empty startNodeIds and endNodeIds, when I focus the flow, then no node renders a glow border or pill.
- DIAG-3.10-XX ❌: When I lock a flow, then non-member nodes and connections render dimmed and pointer-events disabled.
- DIAG-3.10-XX ❌: When I lock a flow and click empty canvas, then the flow remains selected and locked.
- DIAG-3.10-XX ❌: When I lock a flow and click a member node, then PropertiesPanel stacks FlowProperties on top and NodeProperties below.
- DIAG-3.10-XX ❌: When the diagram is in edit mode and I lock a flow and click a member's order badge, then an editable input appears and Enter commits the new order.
- DIAG-3.10-XX ❌: When I press Cmd/Ctrl+L while a flow is selected, then the flow becomes locked; pressing again unlocks.
- DIAG-3.10-XX ❌: When I switch to a different file while a flow is locked, then the lock state clears.
- DIAG-3.10-XX ❌: Given lockedFlow + edit mode, when I click the role-toggle pill above a member node, then the role cycles none → start → end → none.
```

- [ ] **Step 16.5: Commit**

```bash
git add Features.md test-cases/03-diagram.md
git commit -m "docs(diagram): Features.md + test-cases for Flow Ordering MVP"
```

---

## Task 17: Final validation

- [ ] **Step 17.1: Full type + test run**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run typecheck
npm run test:run
```

Expected: clean typecheck, all unit tests pass.

- [ ] **Step 17.2: Production build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 17.3: Manual verification**

Start the dev server (`npm run dev`) and load a diagram with at least one flow. Verify:

1. Selecting the flow shows existing dim behavior; without manual `startNodeIds`/`endNodeIds`, no green/red glow appears (regression check from removing `computeFlowRoles`).
2. Setting `startNodeIds: [<some-node>]` via FlowProperties → green glow + "Start" pill on that node.
3. Setting `nodeOrders: {<id>: 1}` → blue corner numeral.
4. Click "Lock into Flow" → non-members dim and become non-clickable. LockBanner appears top-right.
5. Click a member node → PropertiesPanel stacks FlowProperties + NodeProperties.
6. Click empty canvas → flow stays locked.
7. Edit-mode + click order badge → input opens. Enter commits.
8. Click role-toggle area → cycles. End → none clears the role.
9. `Cmd/Ctrl+L` toggles. Switching file clears.

- [ ] **Step 17.4: Push and open PR**

```bash
git push -u origin feat/diagram-flow-enhancements
gh pr create --title "feat(diagram): Flow Ordering MVP — manual start/end, order numbers, Lock into Flow" \
  --body "$(cat <<'EOF'
## Summary

- `FlowDef` gains optional `nodeOrders`, `startNodeIds`, `endNodeIds`.
- `useDiagramFlowFocus.flowOrderData` now reads manual fields directly; `computeFlowRoles` deleted.
- New `OrderBadge` component (corner numeral, read + edit modes).
- `FlowProperties` grows a Member-Nodes section with per-row order input, Start/End checkboxes, and Number-sequentially button.
- New `LockedFlow` slice in `DiagramInteractionContext`.
- `LockBanner` component, pointer-events guard for non-members, stack-mode `PropertiesPanel`, canvas-click suppression, `Cmd/Ctrl+L` shortcut.
- File switch clears lock state.
- Click-toggle role pill in lock+edit.

## Spec

`docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slices 1–5).

## Test plan

- [ ] All unit tests pass (`npm run test:run`).
- [ ] Typecheck clean (`npm run typecheck`).
- [ ] Production build clean (`npm run build`).
- [ ] Manual verification per Task 17.3.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review

After completing all tasks, before declaring done, run this checklist:

1. **Spec coverage** — every behavior in spec §4.1 (data model), §5 (UX flow ordering), §10 (skill expects new fields) is implemented or explicitly deferred to a follow-up plan. Sources field (§9), cross-entity attachment (§6), wiki-link anchors (§7), richer flow descriptions (§8) are deferred to plans 2–5.
2. **Placeholder scan** — no "TBD"/"TODO" left in code or commits.
3. **Type consistency** — `flowOrderData` map shape (`{ role, order }`) is identical at definition (Task 3), consumer (Task 6 — `DiagramNodeLayer`), and prop interface (Task 6 — `Element` / `ConditionElement`).
4. **Naming consistency** — `lockedFlowId` everywhere (not `lockedFlow` or `flowLockId`); `nodeOrders` everywhere (not `orders` or `flowOrders`).
5. **Read-only handling** — every new edit affordance (`OrderBadge` editable, member-row inputs, role-toggle pill, Lock button) honors `readOnly: true` by hiding or disabling the affordance.
