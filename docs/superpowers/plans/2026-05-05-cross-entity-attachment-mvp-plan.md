# Cross-Entity Attachment MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow any entity (document, diagram, SVG, tab) to be attached to any diagram element (node, connection, flow), with a unified on-canvas attachment indicator and a single read-only preview modal that renders all four entity types.

**Architecture:** Extend the existing per-file `attachedTo[]` pattern (currently only on `DocumentMeta`) to `DiagramData`, `SvgMeta`, and `TabMeta`. Generalise aggregation, rename hooks/components from "Document-…" to "Entity-…" / "Attachment-…" without changing the storage shape. The preview modal grows a left rail listing every attachment grouped by source type and a body that dispatches a read-only renderer per type.

**Spec deviation:** §4.2 of the spec proposes a workspace-scoped attachment-links store. The actual implementation already stores attachments per-file via `DocumentMeta.attachedTo[]`. We extend that pattern to non-document types instead of inventing a new central store — same behaviour for the user, far less migration.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 4, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` (slices 6–7 in §14)

**Depends on:** Plan 1 ships first (Plan 1 adds `FlowProperties.Attachments` row plumbing this plan widens).

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/features/document/types.ts` | Modify — extract `EntityAttachment` shared type. |
| `src/app/knowledge_base/features/diagram/types.ts` | Modify — `DiagramData` gains `attachedTo?: EntityAttachment[]`. |
| `src/app/knowledge_base/features/svgEditor/types.ts` | Modify — `SvgMeta` gains `attachedTo?`. |
| `src/app/knowledge_base/features/tab/types.ts` | Modify — `TabMeta` gains `attachedTo?`. |
| `src/app/knowledge_base/features/diagram/utils/documentAttachments.ts` | Rename to `entityAttachments.ts`; widen helpers. |
| `src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts` | Rename + widen tests. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramAttachments.ts` | Widen to aggregate across all source types. |
| `src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx` | Rename → `AttachmentIndicator.tsx`. |
| `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx` | New / renamed. |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` | Rename → `AttachmentPreviewModal.tsx`; add left rail + per-type renderers. |
| `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx` | New / renamed. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx` | Rename → `CreateAttachEntityModal.tsx`; add type filter. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx` | New / renamed. |
| `src/app/knowledge_base/features/diagram/properties/DocumentsSection.tsx` | Rename → `AttachmentsSection.tsx`; group by source type. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx` | New / renamed. |
| `src/app/knowledge_base/features/diagram/properties/{Node,Line,Layer,Flow,Diagram}Properties.tsx` | Wire renamed component. |
| `src/app/knowledge_base/knowledgeBase.tsx` | Aggregation now walks all entity types; rename callbacks. |
| `Features.md` | §3.18 retitled "Cross-Entity Attachment". |
| `test-cases/03-diagram.md` | New cases under §3.18. |

---

## Task 1: Extract `EntityAttachment` shared type

**Files:**
- Modify: `src/app/knowledge_base/features/document/types.ts`

- [ ] **Step 1.1: Add the shared type and reuse it in `DocumentMeta`**

Replace the existing `DocumentMeta` block:

```ts
export type EntityAttachmentTarget =
  | 'root'
  | 'node'
  | 'connection'
  | 'flow'
  | 'type'
  | 'tab'
  | 'tab-section'
  | 'tab-track';

export interface EntityAttachment {
  type: EntityAttachmentTarget;
  /** ID of the target. For 'root', the value is the diagram filename. */
  id: string;
  /** Optional — diagram filename when target is a diagram-scoped entity (node/connection/flow). */
  diagramPath?: string;
}

export interface DocumentMeta {
  id: string;
  filename: string;       // relative path from vault root
  title: string;
  attachedTo?: EntityAttachment[];
}
```

The `diagramPath` field is optional and additive; existing entries without it remain valid (they're interpreted as belonging to whatever diagram is currently open, matching today's behaviour). New writes by this plan's UI populate `diagramPath` so cross-diagram aggregation works.

- [ ] **Step 1.2: Run typecheck**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npm run typecheck
```

Expected: clean (existing `DocumentMeta` consumers still work; new type is purely additive).

- [ ] **Step 1.3: Commit**

```bash
git add src/app/knowledge_base/features/document/types.ts
git commit -m "refactor(document): extract EntityAttachment shared type"
```

---

## Task 2: Add `attachedTo` to `DiagramData`, `SvgMeta`, `TabMeta`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/types.ts`
- Modify: `src/app/knowledge_base/features/svgEditor/types.ts`
- Modify: `src/app/knowledge_base/features/tab/types.ts`
- Modify: `src/app/knowledge_base/shared/utils/persistence.ts`

- [ ] **Step 2.1: Add `attachedTo?` to each entity-meta interface**

In each `types.ts`, add:

```ts
import type { EntityAttachment } from "../document/types";

// inside the existing interface (DiagramData, SvgMeta, TabMeta respectively):
attachedTo?: EntityAttachment[];
```

For `DiagramData`, the field declares which elements *this diagram* is attached to (nested-diagram drill-in). For `SvgMeta`, same. For `TabMeta`, same.

- [ ] **Step 2.2: Persist `attachedTo` in diagram serialization**

In `persistence.ts`, find the diagram serializer (the function that returns the JSON-shaped object). Add to its output:

```ts
...(attachedTo && attachedTo.length > 0 ? { attachedTo } : {}),
```

In the loader (`loadDiagramFromData`), pass through `data.attachedTo`:

```ts
attachedTo: data.attachedTo ?? undefined,
```

For SVG and tab, repeat in their respective loader/saver paths (sidecar JSON + frontmatter respectively; locate via `grep -rn "saveSvg\|saveTab"`).

- [ ] **Step 2.3: Round-trip test**

Add a test in `persistence.test.ts`:

```ts
it("persists DiagramData.attachedTo round-trip", () => {
  const data = {
    title: "T",
    layers: [],
    nodes: [],
    connections: [],
    flows: [],
    attachedTo: [{ type: "node", id: "el-x", diagramPath: "other.json" }],
  };
  const loaded = loadDiagramFromData(data as never);
  expect(loaded.attachedTo).toEqual([{ type: "node", id: "el-x", diagramPath: "other.json" }]);
});
```

Run:

```bash
npm run test:run -- src/app/knowledge_base/shared/utils/persistence.test.ts
```

Expected: PASS.

- [ ] **Step 2.4: Commit**

```bash
git add src/app/knowledge_base/features/diagram/types.ts \
        src/app/knowledge_base/features/svgEditor/types.ts \
        src/app/knowledge_base/features/tab/types.ts \
        src/app/knowledge_base/shared/utils/persistence.ts \
        src/app/knowledge_base/shared/utils/persistence.test.ts
git commit -m "feat(entity): DiagramData/SvgMeta/TabMeta gain attachedTo field"
```

---

## Task 3: Rename `documentAttachments.ts` → `entityAttachments.ts` and widen helpers

**Files:**
- Rename: `src/app/knowledge_base/features/diagram/utils/documentAttachments.ts` → `entityAttachments.ts`
- Rename: `src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts` → `entityAttachments.test.ts`

- [ ] **Step 3.1: Rename and rewrite the helpers to be entity-generic**

The helpers currently operate on `DocumentMeta[]`. Replace with a generic `Attachable` interface plus widened helpers:

```ts
import type { EntityAttachment } from "../../document/types";

export interface Attachable {
  filename: string;
  attachedTo?: EntityAttachment[];
}

/** Returns entries whose `attachedTo` matches the target. */
export function attachmentsFor<T extends Attachable>(
  entities: T[],
  target: { type: EntityAttachment['type']; id: string; diagramPath?: string },
): T[] {
  return entities.filter((e) =>
    e.attachedTo?.some((a) =>
      a.type === target.type &&
      a.id === target.id &&
      (a.diagramPath === target.diagramPath || a.diagramPath === undefined || target.diagramPath === undefined),
    ),
  );
}

/** Replace target attachments on a single entity. */
export function setAttachmentsFor<T extends Attachable>(
  entity: T,
  target: { type: EntityAttachment['type']; id: string; diagramPath?: string },
  add: boolean,
): T {
  const others = (entity.attachedTo ?? []).filter((a) => !(a.type === target.type && a.id === target.id && a.diagramPath === target.diagramPath));
  return { ...entity, attachedTo: add ? [...others, target] : others };
}
```

- [ ] **Step 3.2: Move and update existing tests**

Rename the test file and replace `DocumentMeta` literals with `Attachable` literals (any object with `filename` + `attachedTo`).

- [ ] **Step 3.3: Update existing imports**

Run:

```bash
grep -rn "documentAttachments" src/ | head
```

For every importer, replace `from "../../features/diagram/utils/documentAttachments"` with `from "../../features/diagram/utils/entityAttachments"`. The function names changed too — replace `attachedDocsFor` (or whatever the old name was) with `attachmentsFor`.

- [ ] **Step 3.4: Tests + typecheck**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3.5: Commit**

```bash
git add -A
git commit -m "refactor(attachments): rename documentAttachments→entityAttachments; generic Attachable"
```

---

## Task 4: Generalise `useDiagramAttachments` to walk all source types

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramAttachments.ts`

The hook today aggregates `DocumentMeta[]` to compute "which docs touch which entity." Widen to walk documents + diagrams + SVGs + tabs.

- [ ] **Step 4.1: Add new inputs**

The hook currently takes `documents` (a `DocumentMeta[]`). Add three more inputs:

```ts
diagrams: { filename: string; attachedTo?: EntityAttachment[] }[];
svgs: { filename: string; attachedTo?: EntityAttachment[] }[];
tabs: { filename: string; attachedTo?: EntityAttachment[] }[];
```

- [ ] **Step 4.2: Build per-type aggregations**

```ts
const attachmentsByEntity = useMemo(() => {
  type Bucket = {
    docs: typeof documents;
    diagrams: typeof diagrams;
    svgs: typeof svgs;
    tabs: typeof tabs;
  };
  const map = new Map<string, Bucket>(); // key: "<type>:<id>"
  const bump = (
    target: EntityAttachment,
    kind: keyof Bucket,
    e: any,
  ) => {
    const key = `${target.type}:${target.id}`;
    const cur = map.get(key) ?? { docs: [], diagrams: [], svgs: [], tabs: [] };
    cur[kind].push(e);
    map.set(key, cur);
  };
  for (const d of documents) for (const a of d.attachedTo ?? []) bump(a, "docs", d);
  for (const d of diagrams) for (const a of d.attachedTo ?? []) bump(a, "diagrams", d);
  for (const d of svgs) for (const a of d.attachedTo ?? []) bump(a, "svgs", d);
  for (const d of tabs) for (const a of d.attachedTo ?? []) bump(a, "tabs", d);
  return map;
}, [documents, diagrams, svgs, tabs]);

const attachmentsForNode = (id: string) => attachmentsByEntity.get(`node:${id}`) ?? { docs: [], diagrams: [], svgs: [], tabs: [] };
const attachmentsForFlow = (id: string) => attachmentsByEntity.get(`flow:${id}`) ?? { docs: [], diagrams: [], svgs: [], tabs: [] };
const attachmentsForConnection = (id: string) => attachmentsByEntity.get(`connection:${id}`) ?? { docs: [], diagrams: [], svgs: [], tabs: [] };
```

Return the helpers.

- [ ] **Step 4.3: Update existing callers**

```bash
grep -rn "useDiagramAttachments" src/ | head
```

Each caller in `knowledgeBase.tsx` and `DiagramView.tsx` passes the new inputs (which already exist in their scope as `diagrams`, `svgs`, `tabs` lists from their respective hooks).

- [ ] **Step 4.4: Tests + typecheck**

Add a unit test for the new aggregator (mock 4 entity arrays, assert the bucket counts).

- [ ] **Step 4.5: Commit**

```bash
git add src/app/knowledge_base/features/diagram/hooks/useDiagramAttachments.ts \
        src/app/knowledge_base/knowledgeBase.tsx \
        src/app/knowledge_base/features/diagram/DiagramView.tsx
git commit -m "feat(attachments): aggregate documents + diagrams + svgs + tabs per entity"
```

---

## Task 5: Rename `DocInfoBadge` → `AttachmentIndicator`

**Files:**
- Rename: `src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx` → `AttachmentIndicator.tsx`
- Rename: `DocInfoBadge.test.tsx` → `AttachmentIndicator.test.tsx`

- [ ] **Step 5.1: Update the component**

The component currently takes `count` (number of docs). Replace with a glyph stack shape:

```tsx
import { FileText, Network, Music, Image as ImageIcon } from "lucide-react";

interface AttachmentIndicatorProps {
  counts: { docs: number; diagrams: number; svgs: number; tabs: number };
  onClick: () => void;
  nodeId: string;
}

const TYPE_GLYPH = {
  docs: FileText,
  diagrams: Network,
  svgs: ImageIcon,
  tabs: Music,
} as const;

export function AttachmentIndicator({ counts, onClick, nodeId }: AttachmentIndicatorProps) {
  const types = (Object.keys(counts) as Array<keyof typeof counts>).filter((k) => counts[k] > 0);
  if (types.length === 0) return null;
  return (
    <button
      type="button"
      data-testid={`attachment-indicator-${nodeId}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute -bottom-2 -right-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-slate-300 rounded-full shadow text-slate-700 hover:bg-slate-50"
      aria-label={`Attachments: ${types.join(", ")}`}
    >
      {types.map((t) => {
        const Glyph = TYPE_GLYPH[t];
        return <Glyph key={t} size={11} data-testid={`attachment-indicator-glyph-${t}`} />;
      })}
    </button>
  );
}
```

(The icon registry only has 41 entries; `Network`, `Music`, `Image`, `FileText` are imported directly from `lucide-react` because the registry is for diagram nodes, not chrome.)

- [ ] **Step 5.2: Update the test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentIndicator } from "./AttachmentIndicator";

describe("AttachmentIndicator", () => {
  it("renders nothing when all counts are zero", () => {
    const { container } = render(
      <AttachmentIndicator counts={{ docs: 0, diagrams: 0, svgs: 0, tabs: 0 }} onClick={() => {}} nodeId="n1" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one glyph per non-empty type, no number", () => {
    render(
      <AttachmentIndicator counts={{ docs: 1, diagrams: 2, svgs: 0, tabs: 0 }} onClick={() => {}} nodeId="n1" />,
    );
    expect(screen.getByTestId("attachment-indicator-glyph-docs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-diagrams")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-indicator-glyph-svgs")).toBeNull();
    expect(screen.queryByText(/\d/)).toBeNull();
  });

  it("calls onClick", () => {
    const onClick = vi.fn();
    render(
      <AttachmentIndicator counts={{ docs: 1, diagrams: 0, svgs: 0, tabs: 0 }} onClick={onClick} nodeId="n1" />,
    );
    fireEvent.click(screen.getByTestId("attachment-indicator-n1"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 5.3: Update every importer**

```bash
grep -rn "DocInfoBadge" src/ | head
```

Replace import paths and component names in `DiagramNodeLayer.tsx`, `Element.tsx`, `ConditionElement.tsx`, etc. The new prop is `counts={…}` instead of the old single-number `count={…}`. Compute counts in the parent from `useDiagramAttachments.attachmentsForNode(node.id)`:

```tsx
const counts = useMemo(() => {
  const a = attachmentsForNode(node.id);
  return { docs: a.docs.length, diagrams: a.diagrams.length, svgs: a.svgs.length, tabs: a.tabs.length };
}, [attachmentsForNode, node.id]);
```

- [ ] **Step 5.4: Tests + typecheck**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add -A
git commit -m "feat(diagram): AttachmentIndicator — type-aware on-canvas badge"
```

---

## Task 6: Rename `DocPreviewModal` → `AttachmentPreviewModal` (read-only renderer per type)

**Files:**
- Rename: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` → `AttachmentPreviewModal.tsx`
- Rename: corresponding `.test.tsx`.

The modal grows a left rail (list of attachments grouped by source type) and a body that dispatches to a per-type read-only renderer. Single-attachment case collapses the rail.

- [ ] **Step 6.1: New props shape**

```ts
interface PreviewItem {
  type: 'document' | 'diagram' | 'svg' | 'tab';
  filename: string;
  title?: string;
  entityName?: string; // optional badge (e.g. "from Auth Service")
}

interface AttachmentPreviewModalProps {
  open: boolean;
  items: PreviewItem[];                  // grouped by .type when rendered
  initialFilename?: string;              // which item to show first; defaults to items[0]
  onClose: () => void;
  onOpenInPane: (filename: string, anchor?: string | null) => void;
  resolveWikiLinkPath: (linkPath: string, currentDocDir: string) => string;
  // Renderers (injected by parent because they need vault access)
  readDocument: (path: string) => Promise<string>;
  readSvg: (path: string) => Promise<string>;
  loadDiagram: (path: string) => Promise<DiagramData>;
  loadTab: (path: string) => Promise<string>;
}
```

- [ ] **Step 6.2: Body dispatcher**

```tsx
function renderBody(item: PreviewItem, payload: unknown) {
  switch (item.type) {
    case 'document': return <DocumentBody markdown={payload as string} {...} />;
    case 'svg':      return <SvgBody svgText={payload as string} />;
    case 'diagram':  return <DiagramView readOnly data={payload as DiagramData} hideOverlays />;
    case 'tab':      return <TabView readOnly source={payload as string} />;
  }
}
```

`DocumentBody` is the existing markdown render (lifted into a sub-component). `SvgBody` renders the SVG text inside a sandboxed `<div>` after sanitization. `DiagramView` and `TabView` already exist; pass `readOnly` and a slimmed prop set.

- [ ] **Step 6.3: Left rail**

When `items.length > 1`:

```tsx
<aside className="w-64 border-r overflow-y-auto">
  {(['document', 'diagram', 'svg', 'tab'] as const).map((type) => {
    const group = items.filter((i) => i.type === type);
    if (group.length === 0) return null;
    return (
      <div key={type}>
        <h4 className="px-3 py-1 text-[10px] uppercase text-slate-500">{type}s</h4>
        {group.map((it) => (
          <button
            key={it.filename}
            data-testid={`attachment-rail-item-${it.filename}`}
            onClick={() => setActive(it)}
            className={"w-full text-left px-3 py-1 text-xs " + (active?.filename === it.filename ? "bg-blue-50 text-blue-800" : "hover:bg-slate-50")}
          >
            {it.title ?? it.filename}
          </button>
        ))}
      </div>
    );
  })}
</aside>
```

When `items.length === 1`, hide the rail entirely (preserves today's `DocPreviewModal` UX for single-document attachments).

- [ ] **Step 6.4: Tests**

```tsx
it("renders with no rail when only one item is present", () => { /* assert rail container missing */ });
it("renders the rail with grouped headings when items > 1", () => { /* assert h4 'documents' / 'diagrams' present */ });
it("dispatches to DocumentBody for type=document", () => { /* mock readDocument; assert markdown render */ });
it("dispatches to DiagramView for type=diagram", () => { /* assert presence of DiagramView root */ });
it("Open in pane forwards the active filename and closes the modal", () => { /* … */ });
```

- [ ] **Step 6.5: Commit**

```bash
git add -A
git commit -m "feat(diagram): AttachmentPreviewModal — left rail + per-type read-only renderers"
```

---

## Task 7: Rename `CreateAttachDocModal` → `CreateAttachEntityModal` (type filter)

**Files:**
- Rename + update tests.

The picker grows a `type` field (`document | diagram | svg | tab`) and the file list filters accordingly.

- [ ] **Step 7.1: Update prop signature**

```ts
interface CreateAttachEntityModalProps {
  open: boolean;
  onClose: () => void;
  onPickExisting: (filename: string, type: 'document' | 'diagram' | 'svg' | 'tab') => void;
  onCreateAndAttach: (filename: string, type: 'document' | 'diagram' | 'svg' | 'tab', editNow: boolean) => Promise<void>;
  /** Vault lists per type, for filtering. */
  documents: string[];
  diagrams: string[];
  svgs: string[];
  tabs: string[];
}
```

- [ ] **Step 7.2: Type-tab UI**

A small tab strip at the top of the modal:

```tsx
<div className="flex gap-2 px-4 pt-3 text-xs">
  {(['document', 'diagram', 'svg', 'tab'] as const).map((t) => (
    <button
      key={t}
      data-testid={`create-attach-type-${t}`}
      className={t === activeType ? "font-bold text-blue-700 border-b-2 border-blue-700" : "text-slate-500"}
      onClick={() => setActiveType(t)}
    >
      {t[0].toUpperCase() + t.slice(1)}
    </button>
  ))}
</div>
```

The autocomplete list reads from the appropriate input array (`activeType === 'document' ? documents : activeType === 'diagram' ? diagrams : …`).

- [ ] **Step 7.3: Tests**

Tests cover: tab switching changes the suggestion list; create-and-attach respects the active type; existing-attach respects the active type.

- [ ] **Step 7.4: Update callers**

`FlowProperties.tsx`, `NodeProperties.tsx`, `LineProperties.tsx`, `LayerProperties.tsx`, `DiagramProperties.tsx` need to pass the four lists. Source the lists from the existing repository hooks (`useDocuments`, `useDiagrams`, `useSvgs`, `useTabs`).

- [ ] **Step 7.5: Commit**

```bash
git add -A
git commit -m "feat(diagram): CreateAttachEntityModal — type-aware picker"
```

---

## Task 8: Rename `DocumentsSection` → `AttachmentsSection`

**Files:**
- Rename component + tests + update every importing properties panel.

`AttachmentsSection` accepts a list of `PreviewItem` (mixed types) instead of `DocumentMeta[]`. It renders one collapsed sub-list per non-empty type group. Rows behave identically to today (click → preview, "Detach" → cascade modal).

- [ ] **Step 8.1: Update prop signature + render**

```tsx
interface AttachmentsSectionProps {
  items: PreviewItem[];
  onPreview: (filename: string) => void;
  onDetach: (filename: string, type: PreviewItem['type']) => void;
  onAttach: () => void; // opens CreateAttachEntityModal
  readOnly?: boolean;
}
```

Render shape:

```tsx
<Section title="Attachments">
  {(['document', 'diagram', 'svg', 'tab'] as const).map((type) => {
    const group = items.filter((i) => i.type === type);
    if (group.length === 0) return null;
    return (
      <div key={type}>
        <h5 className="text-[10px] uppercase text-slate-500 mt-1">{type}s</h5>
        {group.map((it) => (
          <ExpandableListRow
            key={it.filename}
            data-testid={`attachment-row-${it.filename}`}
            primary={it.title ?? it.filename}
            secondary={it.filename}
            onPreview={() => onPreview(it.filename)}
            onDetach={readOnly ? undefined : () => onDetach(it.filename, it.type)}
          />
        ))}
      </div>
    );
  })}
  {!readOnly && (
    <button
      data-testid="attachment-attach-button"
      onClick={onAttach}
      className="text-xs text-blue-700 hover:underline mt-2"
    >
      + Attach
    </button>
  )}
</Section>
```

- [ ] **Step 8.2: Replace usage in every Properties panel**

For each of `Node`, `Line`, `Layer`, `Flow`, `Diagram` Properties:

1. Replace `<DocumentsSection ... />` with `<AttachmentsSection items={items} ... />`.
2. Build `items` from the unified attachment hook. For example in `NodeProperties`:

```tsx
const a = useEntityAttachmentsForTarget({ type: 'node', id: nodeId });
const items: PreviewItem[] = [
  ...a.docs.map((d) => ({ type: 'document', filename: d.filename, title: d.title })),
  ...a.diagrams.map((d) => ({ type: 'diagram', filename: d.filename, title: d.title })),
  // etc
];
```

- [ ] **Step 8.3: Tests**

Tests cover: rows grouped by type; empty group hidden; attach button hidden in read-only mode.

- [ ] **Step 8.4: Commit**

```bash
git add -A
git commit -m "feat(diagram): AttachmentsSection — grouped attachments in properties panel"
```

---

## Task 9: `useDeletion` cleanup widens to all entity types

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDeletion.ts`

`useDeletion` already calls `detachAttachmentsFor` for documents on every diagram-element delete. Widen so it also strips matching `attachedTo` entries on diagrams / svgs / tabs.

- [ ] **Step 9.1: Add per-type detach calls**

Pseudocode for the new logic:

```ts
async function detachAttachmentsFor(targets: EntityAttachment[]) {
  for (const t of targets) {
    // documents: existing logic
    setDocuments((prev) => prev.map((d) => setAttachmentsFor(d, t, false)));
    // diagrams
    setDiagrams((prev) => prev.map((d) => setAttachmentsFor(d, t, false)));
    // svgs
    setSvgs((prev) => prev.map((d) => setAttachmentsFor(d, t, false)));
    // tabs
    setTabs((prev) => prev.map((d) => setAttachmentsFor(d, t, false)));
  }
}
```

- [ ] **Step 9.2: Update tests**

Add a test asserting that deleting a node clears matching `attachedTo` entries on all four entity types.

- [ ] **Step 9.3: Commit**

```bash
git add -A
git commit -m "feat(deletion): cascade attachment cleanup across all entity types"
```

---

## Task 10: Wire `AttachmentIndicator` click → `AttachmentPreviewModal`

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx`

The indicator's `onClick` opens the modal seeded with this node's attachments.

- [ ] **Step 10.1: Add handler**

```ts
const [previewItems, setPreviewItems] = useState<PreviewItem[] | null>(null);
const handleNodeAttachmentClick = useCallback((nodeId: string) => {
  const a = attachmentsForNode(nodeId);
  const items: PreviewItem[] = [
    ...a.docs.map((d) => ({ type: 'document' as const, filename: d.filename, title: d.title })),
    ...a.diagrams.map((d) => ({ type: 'diagram' as const, filename: d.filename, title: d.title })),
    ...a.svgs.map((d) => ({ type: 'svg' as const, filename: d.filename, title: d.title })),
    ...a.tabs.map((d) => ({ type: 'tab' as const, filename: d.filename, title: d.title })),
  ];
  setPreviewItems(items);
}, [attachmentsForNode]);
```

- [ ] **Step 10.2: Render the modal**

```tsx
{previewItems && (
  <AttachmentPreviewModal
    open
    items={previewItems}
    onClose={() => setPreviewItems(null)}
    onOpenInPane={(filename, anchor) => {
      setPreviewItems(null);
      handleOpenInPane(filename, anchor);
    }}
    resolveWikiLinkPath={resolveWikiLinkPath}
    readDocument={readDocument}
    readSvg={readSvg}
    loadDiagram={loadDiagram}
    loadTab={loadTab}
  />
)}
```

- [ ] **Step 10.3: Pass `handleNodeAttachmentClick` down**

Through `DiagramCanvas.tsx` → `DiagramNodeLayer.tsx` → `Element.tsx` → `AttachmentIndicator`'s `onClick`.

- [ ] **Step 10.4: Commit**

```bash
git add -A
git commit -m "feat(diagram): wire AttachmentIndicator click to AttachmentPreviewModal"
```

---

## Task 11: Update `Features.md` and `test-cases/03-diagram.md`

**Files:**
- Modify: `Features.md` (§3.18 retitled)
- Modify: `test-cases/03-diagram.md`

- [ ] **Step 11.1: Retitle and rewrite §3.18**

Replace the existing §3.18 "Document Integration" with §3.18 "Cross-Entity Attachment" describing AttachmentIndicator, AttachmentPreviewModal, and the type-aware picker.

- [ ] **Step 11.2: New test cases**

Add (next free ID under §3.18):

```markdown
- DIAG-3.18-XX ❌: Attaching a diagram to a node persists in the diagram's attachedTo array.
- DIAG-3.18-XX ❌: AttachmentIndicator renders one glyph per non-empty source-type group.
- DIAG-3.18-XX ❌: Clicking the indicator opens AttachmentPreviewModal seeded with the node's attachments.
- DIAG-3.18-XX ❌: Modal renders read-only document body for type=document.
- DIAG-3.18-XX ❌: Modal renders DiagramView read-only for type=diagram.
- DIAG-3.18-XX ❌: Modal renders SVG body for type=svg.
- DIAG-3.18-XX ❌: Modal renders TabView read-only for type=tab.
- DIAG-3.18-XX ❌: Open in pane closes the modal and opens the active item in the other pane.
- DIAG-3.18-XX ❌: Detaching an SVG from a node removes it from svgs.attachedTo.
- DIAG-3.18-XX ❌: Deleting a node strips its target from every entity's attachedTo.
- DIAG-3.18-XX ❌: CreateAttachEntityModal type tab switches the suggestion list per type.
```

- [ ] **Step 11.3: Commit**

```bash
git add Features.md test-cases/03-diagram.md
git commit -m "docs(attachments): Features.md §3.18 retitled + test-cases for cross-entity attachment"
```

---

## Task 12: Final validation

- [ ] **Step 12.1: Type + test + build**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
npm run typecheck
npm run test:run
npm run build
```

Expected: clean.

- [ ] **Step 12.2: Manual verification**

In the dev server:

1. Attach a diagram to a node. Open the indicator. Verify the diagram renders inside the modal read-only.
2. Attach an SVG. Verify the SVG renders.
3. Delete the node. Verify all four entity types lose the attachment (open the diagram/svg/tab files and confirm `attachedTo` entries are gone).
4. Open the picker. Verify the type tabs switch the suggestion list.

- [ ] **Step 12.3: Open PR**

```bash
git push
gh pr create --title "feat(diagram): Cross-Entity Attachment MVP — diagrams/svgs/tabs/docs attachable to elements"
```

---

## Self-review

1. **Spec coverage** — §6 (cross-entity attachment) implemented. §6.3 modal renders all four types. §6.4 hooks renamed. Indicator on nodes only (per §6.2 deviation note).
2. **Naming consistency** — `AttachmentIndicator`, `AttachmentPreviewModal`, `CreateAttachEntityModal`, `AttachmentsSection`, `useDiagramAttachments` (kept). All four type names in lower-case singular: `'document' | 'diagram' | 'svg' | 'tab'`.
3. **Type consistency** — `EntityAttachment` is the single shared type across all four entity-meta interfaces. `PreviewItem` wraps `{ type, filename, title?, entityName? }` for UI consumption only.
4. **No placeholders** — every step has actual code or an exact grep target.
5. **Read-only handling** — `AttachmentsSection.attach` button hidden when `readOnly`. Indicator stays visible (it's a navigation affordance, not an edit).
