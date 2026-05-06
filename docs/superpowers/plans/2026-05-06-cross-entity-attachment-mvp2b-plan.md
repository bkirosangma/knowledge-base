# Cross-Entity Attachment MVP-2b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the UI half of Cross-Entity Attachment — rename the four document-only components (`DocInfoBadge`, `DocPreviewModal`, `CreateAttachDocModal`, plus a brand-new `AttachmentsSection`) to a 4-way type-aware contract (`'document' | 'diagram' | 'svg' | 'tab'`), widen the helpers and selectors, and wire the new components together. SVG/Tab/Diagram-as-source branches are runtime no-ops with extension points; only document rows exist at the data layer.

**Architecture:**

- **4-way at the UI contract; document-only at the data layer.** All renamed components accept the full `AttachmentSourceType` union (`'document' | 'diagram' | 'svg' | 'tab'`), but the persistence store (`.kb/attachment-links.json` rows in `useDocuments`) continues to track only document↔entity rows in MVP-2b. The picker, badge, modal, and section show all four type lanes; in production today only the document lane has rows. When SVG/Tab persistence ships in a future MVP, the `AttachmentLink` row shape widens — no UI changes required.
- **Conservative helper rename.** `documentAttachments.ts` becomes `entityAttachments.ts` — `hasDocuments` / `getDocumentsForEntity` keep their existing signatures (used by `useDiagramController`), and we add new bucket-returning selectors alongside. No risky shape change to existing callers.
- **No `DocumentsSection` rename.** The existing `DocumentsSection` displays inbound wiki-link backlinks ("References") and is unrelated to attachments. We add a brand-new `AttachmentsSection` for outbound attachments. Both coexist in the properties panels.
- **Read-only renderer extraction is deferred.** The new `AttachmentPreviewModal` body dispatches on type, but Diagram/SVG/Tab branches render a placeholder ("Preview not yet implemented for `<type>` attachments — opens via Open in pane."). Only the document branch renders content in MVP-2b. Extraction of `DiagramView`/`TabView` read-only variants is left to the future SVG/Tab persistence MVP.
- **TDD throughout.** Every rename + new component lands with a Vitest spec written first. Smoke-tests cover the 4-way type discriminator (assert all four type tabs render, assert non-doc bodies show the placeholder).

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, Tailwind 4, Tiptap 3, Next.js 16 (Turbopack), `lucide-react` icons.

---

## Pre-flight

You are on branch `feat/diagram-mvp2b-cross-entity-attachment-ui` (already created off `main` post-MVP-2a merge `006cf5f`). Confirm with:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git status                            # expect: clean working tree
git branch --show-current             # expect: feat/diagram-mvp2b-cross-entity-attachment-ui
git log --oneline -3                  # expect: cdbd688 docs(diagram)... 006cf5f feat(diagram): MVP-2a... 2ff16da feat(diagram): Flow Ordering...
nvm use                               # expect: matches .nvmrc
npm ci                                # expect: clean install
npm run test:run -- --reporter=basic  # expect: all green (baseline)
npm run typecheck                     # expect: clean
```

If any of the above fail, stop and surface to the user before starting Task 1.

---

## File Map

### Created

| File | Purpose |
|---|---|
| `src/app/knowledge_base/features/diagram/utils/entityAttachments.ts` | Renamed-from `documentAttachments.ts` plus new bucket-returning selectors. |
| `src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts` | Renamed-from `documentAttachments.test.ts` plus new bucket tests. |
| `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.tsx` | Renamed-from `DocInfoBadge.tsx` with 4-way glyph row. |
| `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx` | Renamed-from `DocInfoBadge.test.tsx`. |
| `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.tsx` | Renamed-from `DocPreviewModal.tsx` with left rail + 4-way body dispatcher. |
| `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx` | Renamed-from `DocPreviewModal.test.tsx`. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.tsx` | Renamed-from `CreateAttachDocModal.tsx` with 4-tab type strip. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx` | Renamed-from `CreateAttachDocModal.test.tsx`. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx` | Brand-new section listing outbound attachments grouped by type. |
| `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx` | Brand-new tests. |

### Deleted

| File | Reason |
|---|---|
| `src/app/knowledge_base/features/diagram/utils/documentAttachments.ts` | Replaced by `entityAttachments.ts`. |
| `src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts` | Replaced by `entityAttachments.test.ts`. |
| `src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx` | Replaced by `AttachmentIndicator.tsx`. |
| `src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx` | Replaced by `AttachmentIndicator.test.tsx`. |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx` | Replaced by `AttachmentPreviewModal.tsx`. |
| `src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx` | Replaced by `AttachmentPreviewModal.test.tsx`. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx` | Replaced by `CreateAttachEntityModal.tsx`. |
| `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx` | Replaced by `CreateAttachEntityModal.test.tsx`. |

### Modified

| File | Why |
|---|---|
| `src/app/knowledge_base/features/document/hooks/useDocuments.ts` | New selector `attachmentsByType(target)` returns 4 buckets. |
| `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts` | Update import path; consume new selector for indicator counts. |
| `src/app/knowledge_base/features/diagram/components/Element.tsx` | Pass `attachmentCounts` prop to `AttachmentIndicator`. |
| `src/app/knowledge_base/features/diagram/components/DataLine.tsx` | Pass `attachmentCounts` prop to `AttachmentIndicator`. |
| `src/app/knowledge_base/features/diagram/components/DiagramLinesOverlay.tsx` | Source counts via new selector. |
| `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx` | Mount renamed modals; wire indicator click. |
| `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx` | Render `<AttachmentsSection>`. |
| `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx` | Render `<AttachmentsSection>`. |
| `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx` | Render `<AttachmentsSection>`. |
| `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx` | Render `<AttachmentsSection>` (for flow-scoped attachments — currently document-only). |
| `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx` | Render `<AttachmentsSection>` for root-level attachments. |
| `src/app/knowledge_base/knowledgeBase.tsx` | Pass new selector + the four type lists to the picker; wire renamed modal. |
| `Features.md` | §3.18 retitled "Cross-Entity Attachment". |
| `test-cases/03-diagram.md` | New cases under §3.18. |

---

## Task 1: Rename `documentAttachments.ts` → `entityAttachments.ts`; add bucket selectors and shared types

**Files:**
- Delete: `src/app/knowledge_base/features/diagram/utils/documentAttachments.ts`
- Delete: `src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts`
- Create: `src/app/knowledge_base/features/diagram/utils/entityAttachments.ts`
- Create: `src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts`
- Modify: `src/app/knowledge_base/features/document/types.ts` (add `Attachable`, `EntitySources`, `AttachmentBuckets`)
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts:7` (import path)

**Goal:** Move existing helpers under the new filename, preserving their signatures (used by `useDiagramController:473-474`); add a new bucket-returning helper that maps a target to `{docs, diagrams, svgs, tabs}`; co-locate the shared types `Attachable` / `EntitySources` / `AttachmentBuckets` next to `EntityAttachment` in `features/document/types.ts`. In MVP-2b, `diagrams`/`svgs`/`tabs` always return `[]` because no rows of those source types exist.

- [ ] **Step 1.1: Read the current `documentAttachments.ts` and its test fixture**

```bash
cat src/app/knowledge_base/features/diagram/utils/documentAttachments.ts
cat src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts
```

You should see two helpers (`hasDocuments`, `getDocumentsForEntity`) and a test fixture using `DocumentMeta[]` literals.

- [ ] **Step 1.1a: Add shared types to `features/document/types.ts`**

Open `src/app/knowledge_base/features/document/types.ts` and append:

```ts
/** Minimal shape any attachable entity satisfies. `DocumentMeta` already conforms structurally; future `SvgFile`/`TabFile`/diagram entries will too once their persistence sidecars exist. */
export interface Attachable {
  filename: string;
  title?: string;
  attachedTo?: EntityAttachment[];
}

/** Per-source-type list shape. MVP-2b only populates `documents`; the other three are reserved for future SVG/Tab/Diagram-source MVPs. */
export interface EntitySources {
  documents: Attachable[];
  diagrams: Attachable[]; // always [] in MVP-2b
  svgs: Attachable[];     // always [] in MVP-2b
  tabs: Attachable[];     // always [] in MVP-2b
}

export interface AttachmentBuckets {
  docs: Attachable[];
  diagrams: Attachable[];
  svgs: Attachable[];
  tabs: Attachable[];
}
```

These types are imported from `entityAttachments.ts` (Task 1) and from `useDocuments.ts` (Task 2) and from every consumer (`AttachmentsSection`, `useDiagramController`). Co-locating with `EntityAttachment` keeps the type contract in one place and avoids the `document → diagram` feature import direction issue.

- [ ] **Step 1.2: Write the failing test for the new bucket helper**

Create `src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { DocumentMeta, EntitySources } from "../../document/types";
import { hasDocuments, getDocumentsForEntity, attachmentsByType } from "./entityAttachments";

const docA: DocumentMeta = {
  id: "doc-a",
  filename: "a.md",
  title: "A",
  attachedTo: [{ type: "node", id: "n1" }],
};
const docB: DocumentMeta = {
  id: "doc-b",
  filename: "b.md",
  title: "B",
  attachedTo: [{ type: "node", id: "n1" }, { type: "connection", id: "c1" }],
};

describe("entityAttachments — back-compat helpers", () => {
  it("hasDocuments returns true when any document is attached", () => {
    expect(hasDocuments([docA, docB], "node", "n1")).toBe(true);
  });

  it("hasDocuments returns false when nothing is attached", () => {
    expect(hasDocuments([docA, docB], "node", "n2")).toBe(false);
  });

  it("getDocumentsForEntity returns matching docs only", () => {
    expect(getDocumentsForEntity([docA, docB], "node", "n1")).toEqual([docA, docB]);
    expect(getDocumentsForEntity([docA, docB], "connection", "c1")).toEqual([docB]);
    expect(getDocumentsForEntity([docA, docB], "flow", "f1")).toEqual([]);
  });
});

describe("entityAttachments — attachmentsByType (4-way buckets)", () => {
  const sources: EntitySources = { documents: [docA, docB], diagrams: [], svgs: [], tabs: [] };

  it("returns matching docs in the docs bucket; other buckets empty", () => {
    const buckets = attachmentsByType(sources, { type: "node", id: "n1" });
    expect(buckets.docs).toEqual([docA, docB]);
    expect(buckets.diagrams).toEqual([]);
    expect(buckets.svgs).toEqual([]);
    expect(buckets.tabs).toEqual([]);
  });

  it("returns all-empty buckets when no source matches the target", () => {
    const buckets = attachmentsByType(sources, { type: "node", id: "n999" });
    expect(buckets).toEqual({ docs: [], diagrams: [], svgs: [], tabs: [] });
  });

  it("returns all-empty buckets when sources are empty", () => {
    const empty: EntitySources = { documents: [], diagrams: [], svgs: [], tabs: [] };
    const buckets = attachmentsByType(empty, { type: "node", id: "n1" });
    expect(buckets).toEqual({ docs: [], diagrams: [], svgs: [], tabs: [] });
  });
});
```

- [ ] **Step 1.3: Run the test — expect FAIL (file not yet created)**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts
```

Expected: FAIL with "Cannot find module './entityAttachments'".

- [ ] **Step 1.4: Create the implementation**

Create `src/app/knowledge_base/features/diagram/utils/entityAttachments.ts`:

```ts
import type {
  DocumentMeta,
  EntityAttachment,
  EntityAttachmentTarget,
  Attachable,
  EntitySources,
  AttachmentBuckets,
} from "../../document/types";

/** True if any document in `documents` is attached to the given entity. (Back-compat with `documentAttachments.hasDocuments`.) */
export function hasDocuments(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): boolean {
  return documents.some((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}

/** Every document attached to the given entity (empty if none). (Back-compat with `documentAttachments.getDocumentsForEntity`.) */
export function getDocumentsForEntity(
  documents: DocumentMeta[],
  entityType: string,
  entityId: string,
): DocumentMeta[] {
  return documents.filter((d) =>
    d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
  );
}

interface TargetQuery {
  type: EntityAttachmentTarget;
  id: string;
  diagramPath?: string;
}

function matchesTarget(a: EntityAttachment, t: TargetQuery): boolean {
  if (a.type !== t.type) return false;
  if (a.id !== t.id) return false;
  if (t.diagramPath === undefined) return true;
  if (a.diagramPath === undefined) return true; // legacy doc-centric rows lack diagramPath
  return a.diagramPath === t.diagramPath;
}

/** Returns `{docs, diagrams, svgs, tabs}` for a target. In MVP-2b only `docs` is ever non-empty. */
export function attachmentsByType(
  sources: EntitySources,
  target: TargetQuery,
): AttachmentBuckets {
  const filter = (xs: Attachable[]): Attachable[] =>
    xs.filter((x) => x.attachedTo?.some((a) => matchesTarget(a, target)));
  return {
    docs: filter(sources.documents),
    diagrams: filter(sources.diagrams),
    svgs: filter(sources.svgs),
    tabs: filter(sources.tabs),
  };
}
```

- [ ] **Step 1.5: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/utils/entityAttachments.test.ts
```

Expected: PASS, all 6 cases green.

- [ ] **Step 1.6: Update the importer in `useDiagramController.ts`**

Replace the existing import line:

```bash
grep -n "documentAttachments" src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts
```

You should see line 7 has:

```ts
import { hasDocuments as hasDocsFor, getDocumentsForEntity as getDocsForEntity } from "../utils/documentAttachments";
```

Change to:

```ts
import { hasDocuments as hasDocsFor, getDocumentsForEntity as getDocsForEntity } from "../utils/entityAttachments";
```

No other changes in `useDiagramController.ts` for this task — the helper signatures are preserved.

- [ ] **Step 1.7: Delete the old files**

```bash
git rm src/app/knowledge_base/features/diagram/utils/documentAttachments.ts \
       src/app/knowledge_base/features/diagram/utils/documentAttachments.test.ts
```

- [ ] **Step 1.8: Run typecheck + full test suite**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean typecheck; all tests pass.

- [ ] **Step 1.9: Commit**

```bash
git add -A
git commit -m "refactor(diagram): rename documentAttachments → entityAttachments; add attachmentsByType selector"
```

---

## Task 2: Add `attachmentsByType` selector to `useDocuments` hook

**Files:**
- Modify: `src/app/knowledge_base/features/document/hooks/useDocuments.ts` (add memoised callback returning `AttachmentBuckets`)
- Test: `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts` (find existing or create)

**Goal:** Expose the bucket-returning selector through the `useDocuments` hook so callers (`useDiagramController`, properties panels, indicator wiring) can ask "what's attached to this target?" with one call. In MVP-2b only `docs` is populated.

- [ ] **Step 2.1: Locate the existing `useDocuments` test, or create a new one**

```bash
ls src/app/knowledge_base/features/document/hooks/useDocuments.test.ts 2>&1
```

If the file exists, read it to learn the harness pattern; if not, create a new file.

- [ ] **Step 2.2: Write the failing test for the new selector**

Append to (or create) `src/app/knowledge_base/features/document/hooks/useDocuments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDocuments } from "./useDocuments";

describe("useDocuments — attachmentsByType", () => {
  it("returns 4-way buckets; only docs is populated in MVP-2b", () => {
    const { result } = renderHook(() => useDocuments());
    act(() => {
      result.current.attachDocument("a.md", "node", "n1");
      result.current.attachDocument("b.md", "node", "n1");
      result.current.attachDocument("c.md", "connection", "c1");
    });
    const buckets = result.current.attachmentsByType({ type: "node", id: "n1" });
    expect(buckets.docs.map((d) => d.filename)).toEqual(["a.md", "b.md"]);
    expect(buckets.diagrams).toEqual([]);
    expect(buckets.svgs).toEqual([]);
    expect(buckets.tabs).toEqual([]);
  });

  it("returns all-empty buckets when target has no attachments", () => {
    const { result } = renderHook(() => useDocuments());
    const buckets = result.current.attachmentsByType({ type: "node", id: "n1" });
    expect(buckets).toEqual({ docs: [], diagrams: [], svgs: [], tabs: [] });
  });
});
```

- [ ] **Step 2.3: Run the test — expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
```

Expected: FAIL with "result.current.attachmentsByType is not a function".

- [ ] **Step 2.4: Add the selector to `useDocuments`**

Open `src/app/knowledge_base/features/document/hooks/useDocuments.ts`. Just after the existing `getDocumentsForEntity` and `hasDocuments` `useCallback` selectors (around line 175–195), add an inline `useCallback` selector — **no import from `features/diagram/`**, so the hook stays self-contained and matches the existing pattern of inline selectors.

```ts
// At the top of useDocuments.ts, alongside existing imports:
import type { EntityAttachmentTarget, AttachmentBuckets } from "../types";

interface AttachmentTargetQuery {
  type: EntityAttachmentTarget;
  id: string;
  diagramPath?: string;
}

// ... inside the hook body, alongside getDocumentsForEntity:

const attachmentsByType = useCallback(
  (target: AttachmentTargetQuery): AttachmentBuckets => {
    const matches = (a: { type: string; id: string; diagramPath?: string }): boolean => {
      if (a.type !== target.type) return false;
      if (a.id !== target.id) return false;
      if (target.diagramPath === undefined) return true;
      if (a.diagramPath === undefined) return true; // legacy doc-centric rows lack diagramPath
      return a.diagramPath === target.diagramPath;
    };
    return {
      docs: documents.filter((d) => d.attachedTo?.some(matches)),
      diagrams: [],
      svgs: [],
      tabs: [],
    };
  },
  [documents],
);
```

Add `attachmentsByType` to the hook's return alongside the existing selectors. The `entityAttachments.attachmentsByType` pure helper from Task 1 stays available for non-hook callers (tests, future server-side consumers) but is not imported here.

> **Why inline:** matches `getDocumentsForEntity` / `hasDocuments` already in this hook, avoids `document → diagram` feature import direction, and keeps `useDocuments` self-contained. The shared types live in `features/document/types.ts` (Task 1 step 1.1a), so both `entityAttachments.ts` and `useDocuments.ts` import the same `AttachmentBuckets` shape — no drift.

- [ ] **Step 2.5: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
```

Expected: PASS, both cases green.

- [ ] **Step 2.6: Run typecheck + full suite**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean.

- [ ] **Step 2.7: Commit**

```bash
git add src/app/knowledge_base/features/document/hooks/useDocuments.ts \
        src/app/knowledge_base/features/document/hooks/useDocuments.test.ts
git commit -m "feat(documents): expose attachmentsByType selector returning 4-way buckets"
```

---

## Task 3: Rename `DocInfoBadge` → `AttachmentIndicator` (4-way glyph row)

**Files:**
- Delete: `src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx`
- Delete: `src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx`

**Goal:** The on-canvas badge becomes type-aware. It accepts a `counts: { docs, diagrams, svgs, tabs }` prop and renders one glyph per non-empty type. The single-onClick handler still opens the unified preview modal. Today only `docs` is ever > 0.

- [ ] **Step 3.1: Read the existing `DocInfoBadge.tsx` to capture exact CSS classes and dropdown behavior**

```bash
cat src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx
cat src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx
```

The current badge takes a single `documentPaths: string[]` prop and renders a coloured circle plus an optional dropdown when more than one document is attached. The new component replaces "dropdown of paths" with "glyph row of types"; clicking opens the modal (preserving today's intent of "see what's attached").

- [ ] **Step 3.2: Write the failing test**

Create `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentIndicator, type AttachmentCounts } from "./AttachmentIndicator";

const noAttachments: AttachmentCounts = { docs: 0, diagrams: 0, svgs: 0, tabs: 0 };

describe("AttachmentIndicator", () => {
  it("renders nothing when all counts are zero", () => {
    const { container } = render(
      <AttachmentIndicator
        counts={noAttachments}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders one glyph per non-empty type bucket", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 2, diagrams: 0, svgs: 0, tabs: 0 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(screen.getByTestId("attachment-indicator-glyph-docs")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-indicator-glyph-diagrams")).toBeNull();
    expect(screen.queryByTestId("attachment-indicator-glyph-svgs")).toBeNull();
    expect(screen.queryByTestId("attachment-indicator-glyph-tabs")).toBeNull();
  });

  it("renders all four glyphs when every bucket has content", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 1, diagrams: 1, svgs: 1, tabs: 1 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(screen.getByTestId("attachment-indicator-glyph-docs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-diagrams")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-svgs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-tabs")).toBeInTheDocument();
  });

  it("calls onClick once when clicked, stopping propagation", () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <AttachmentIndicator
          counts={{ docs: 1, diagrams: 0, svgs: 0, tabs: 0 }}
          color="#3b82f6"
          position={{ x: 10, y: 20 }}
          onClick={onClick}
          testId="ind-1"
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId("attachment-indicator-ind-1"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("includes an aria-label listing populated types", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 1, diagrams: 1, svgs: 0, tabs: 0 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    const button = screen.getByTestId("attachment-indicator-ind-1");
    expect(button.getAttribute("aria-label")).toMatch(/docs/i);
    expect(button.getAttribute("aria-label")).toMatch(/diagrams/i);
  });
});
```

- [ ] **Step 3.3: Run the test — expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx
```

Expected: FAIL with "Cannot find module './AttachmentIndicator'".

- [ ] **Step 3.4: Implement the component**

Create `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.tsx`:

```tsx
"use client";

import React from "react";
import { FileText, Network, Image as ImageIcon, Music } from "lucide-react";

export interface AttachmentCounts {
  docs: number;
  diagrams: number;
  svgs: number;
  tabs: number;
}

const TYPE_GLYPH = {
  docs: FileText,
  diagrams: Network,
  svgs: ImageIcon,
  tabs: Music,
} as const;

const TYPE_LABEL = {
  docs: "docs",
  diagrams: "diagrams",
  svgs: "svgs",
  tabs: "tabs",
} as const;

interface AttachmentIndicatorProps {
  counts: AttachmentCounts;
  color: string;                              // existing prop preserved
  position: { x: number; y: number };         // existing prop preserved
  onClick: () => void;                        // single click handler (no dropdown)
  testId: string;                             // unique per-element scope
}

export function AttachmentIndicator({
  counts,
  color,
  position,
  onClick,
  testId,
}: AttachmentIndicatorProps) {
  const populated = (Object.keys(counts) as Array<keyof AttachmentCounts>)
    .filter((k) => counts[k] > 0);

  if (populated.length === 0) return null;

  const ariaLabel = `Attachments: ${populated.map((k) => TYPE_LABEL[k]).join(", ")}`;

  return (
    <button
      type="button"
      data-testid={`attachment-indicator-${testId}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{ left: position.x, top: position.y, borderColor: color }}
      className="absolute flex items-center gap-0.5 px-1.5 py-0.5 bg-white border rounded-full shadow-sm hover:bg-slate-50"
      aria-label={ariaLabel}
    >
      {populated.map((kind) => {
        const Glyph = TYPE_GLYPH[kind];
        return (
          <Glyph
            key={kind}
            data-testid={`attachment-indicator-glyph-${kind}`}
            size={11}
            color={color}
          />
        );
      })}
    </button>
  );
}
```

(Note: the new component has no dropdown — the unified preview modal replaces in-place navigation. This is intentional per spec §6.2: "Click → opens the unified attachment preview modal".)

- [ ] **Step 3.5: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/AttachmentIndicator.test.tsx
```

Expected: PASS, all 5 cases green.

- [ ] **Step 3.6: Find every importer and refactor (preserve compile)**

```bash
grep -rln "DocInfoBadge" src/
```

Expected importers (verify):
- `src/app/knowledge_base/features/diagram/components/Element.tsx`
- `src/app/knowledge_base/features/diagram/components/DataLine.tsx`
- (none in `DiagramOverlays` — `DocInfoBadge` is rendered inside the element, not as overlay; verify with grep)

For each importer:

1. Replace the import:
   ```ts
   import DocInfoBadge from "./DocInfoBadge";
   ```
   with:
   ```ts
   import { AttachmentIndicator, type AttachmentCounts } from "./AttachmentIndicator";
   ```

2. Replace JSX. Today's site (e.g. in `Element.tsx`):
   ```tsx
   {hasDocuments && documentPaths && (
     <DocInfoBadge
       color={badgeColor}
       position={badgePosition}
       documentPaths={documentPaths}
       onNavigate={onDocNavigate}
     />
   )}
   ```
   becomes:
   ```tsx
   {attachmentCounts && hasAnyAttachment(attachmentCounts) && (
     <AttachmentIndicator
       counts={attachmentCounts}
       color={badgeColor}
       position={badgePosition}
       onClick={() => onAttachmentIndicatorClick(elementId)}
       testId={elementId}
     />
   )}
   ```
   Add the helper at top of the same file (or to `entityAttachments.ts` and re-import):
   ```ts
   const hasAnyAttachment = (c: AttachmentCounts) => c.docs + c.diagrams + c.svgs + c.tabs > 0;
   ```

3. Update the importer's prop signature: replace `hasDocuments?: boolean; documentPaths?: string[]; onDocNavigate?: (path: string) => void;` with:
   ```ts
   attachmentCounts?: AttachmentCounts;
   onAttachmentIndicatorClick?: (id: string) => void;
   ```
   (Keep the older `documentPaths` / `onDocNavigate` props for now ONLY if removing them breaks other call sites you haven't yet updated; otherwise remove. Audit `git grep` to confirm before deleting.)

- [ ] **Step 3.7: Update Element.test.tsx and DataLine.test.tsx fixtures (if any)**

```bash
grep -rln "DocInfoBadge\|hasDocuments\|documentPaths" src/app/knowledge_base/features/diagram/components/Element.test.tsx src/app/knowledge_base/features/diagram/components/DataLine.test.tsx 2>&1
```

Update prop fixtures to match the new signature.

- [ ] **Step 3.8: Delete the old files**

```bash
git rm src/app/knowledge_base/features/diagram/components/DocInfoBadge.tsx \
       src/app/knowledge_base/features/diagram/components/DocInfoBadge.test.tsx
```

- [ ] **Step 3.9: Typecheck + full suite + targeted test**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean.

> **Defer signal:** if the typecheck reveals a third importer of `DocInfoBadge` not covered above (e.g., a snapshot test fixture), update it before committing — do not commit a partial rename.

- [ ] **Step 3.10: Commit**

```bash
git add -A
git commit -m "feat(diagram): AttachmentIndicator — 4-way glyph row replaces DocInfoBadge"
```

---

## Task 4: Rename `DocPreviewModal` → `AttachmentPreviewModal` (left rail + 4-way body dispatcher)

**Files:**
- Delete: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx`
- Delete: `src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx`

**Goal:** The preview modal becomes type-aware. New props: `items: PreviewItem[]` (each carrying `type`, `filename`, `title?`); a left rail visible when `items.length > 1`; a body dispatcher branching on `item.type`. In MVP-2b only `type === 'document'` renders real content; the other three branches show a "Preview not yet implemented" placeholder.

- [ ] **Step 4.1: Read the existing `DocPreviewModal.tsx`**

```bash
cat src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx | head -120
```

Capture: the resizable shell (~680px default, min 480px), `useFocusTrap`, the `markdownToHtml` + `DOMPurify` pipeline, the wiki-link-click forwarding, the close affordances. The new modal preserves all of these for the document branch.

- [ ] **Step 4.2: Write the failing test**

Create `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AttachmentPreviewModal,
  type PreviewItem,
} from "./AttachmentPreviewModal";

function makeProps(items: PreviewItem[]) {
  return {
    open: true,
    items,
    onClose: vi.fn(),
    onOpenInPane: vi.fn(),
    readDocument: vi.fn(async (path: string) => `# Hello from ${path}\n\nbody`),
    resolveWikiLinkPath: (linkPath: string) => linkPath,
  };
}

describe("AttachmentPreviewModal", () => {
  it("renders nothing when open is false", () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    const { container } = render(<AttachmentPreviewModal {...props} open={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when items list is empty", () => {
    const props = makeProps([]);
    const { container } = render(<AttachmentPreviewModal {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it("hides the left rail when only one item is present", () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.queryByTestId("attachment-rail")).toBeNull();
  });

  it("shows the left rail with grouped headings when items > 1", () => {
    const items: PreviewItem[] = [
      { type: "document", filename: "a.md" },
      { type: "document", filename: "b.md" },
      { type: "diagram", filename: "x.diagram" },
    ];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByTestId("attachment-rail")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-rail-group-document")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-rail-group-diagram")).toBeInTheDocument();
  });

  it("dispatches to the document body when active item type is document", async () => {
    const props = makeProps([{ type: "document", filename: "a.md" }]);
    render(<AttachmentPreviewModal {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("attachment-body-document")).toBeInTheDocument(),
    );
  });

  it("renders the placeholder body for diagram type in MVP-2b", () => {
    const items: PreviewItem[] = [
      { type: "diagram", filename: "x.diagram" },
    ];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByTestId("attachment-body-placeholder-diagram")).toBeInTheDocument();
    expect(screen.getByText(/preview not yet implemented for diagram/i)).toBeInTheDocument();
  });

  it("renders the placeholder body for svg type in MVP-2b", () => {
    const items: PreviewItem[] = [
      { type: "svg", filename: "x.svg" },
    ];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByTestId("attachment-body-placeholder-svg")).toBeInTheDocument();
  });

  it("renders the placeholder body for tab type in MVP-2b", () => {
    const items: PreviewItem[] = [
      { type: "tab", filename: "x.alphatex" },
    ];
    const props = makeProps(items);
    render(<AttachmentPreviewModal {...props} />);
    expect(screen.getByTestId("attachment-body-placeholder-tab")).toBeInTheDocument();
  });

  it("Open in pane button forwards the active filename and closes the modal", () => {
    const onOpenInPane = vi.fn();
    const onClose = vi.fn();
    const props = {
      ...makeProps([{ type: "document", filename: "a.md" }]),
      onOpenInPane,
      onClose,
    };
    render(<AttachmentPreviewModal {...props} />);
    fireEvent.click(screen.getByTestId("attachment-modal-open-in-pane"));
    expect(onOpenInPane).toHaveBeenCalledWith("a.md", null);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4.3: Run the test — expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx
```

Expected: FAIL with "Cannot find module './AttachmentPreviewModal'".

- [ ] **Step 4.4: Implement the component (preserves the existing shell + pipeline; adds rail + dispatcher)**

Create `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.tsx`:

```tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { markdownToHtml } from "../../document/extensions/markdownSerializer";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

export type PreviewItemType = "document" | "diagram" | "svg" | "tab";

export interface PreviewItem {
  type: PreviewItemType;
  filename: string;
  title?: string;
  entityName?: string;
}

interface AttachmentPreviewModalProps {
  open: boolean;
  items: PreviewItem[];
  initialFilename?: string;
  onClose: () => void;
  onOpenInPane: (filename: string, anchor: string | null) => void;
  readDocument: (path: string) => Promise<string | null>;
  resolveWikiLinkPath?: (linkPath: string, currentDocDir: string) => string;
}

const TYPE_GROUP_ORDER: PreviewItemType[] = ["document", "diagram", "svg", "tab"];

export function AttachmentPreviewModal({
  open,
  items,
  initialFilename,
  onClose,
  onOpenInPane,
  readDocument,
  resolveWikiLinkPath,
}: AttachmentPreviewModalProps) {
  const [active, setActive] = useState<PreviewItem | null>(() =>
    items.length === 0
      ? null
      : items.find((it) => it.filename === initialFilename) ?? items[0],
  );
  useEffect(() => {
    if (items.length === 0) {
      setActive(null);
      return;
    }
    if (!active || !items.some((it) => it.filename === active.filename)) {
      setActive(items.find((it) => it.filename === initialFilename) ?? items[0]);
    }
  }, [items, initialFilename, active]);

  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);

  if (!open || items.length === 0 || !active) return null;

  return (
    <div
      ref={containerRef}
      data-testid="attachment-modal"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-line rounded-lg shadow-xl flex flex-col" style={{ width: 680, minWidth: 480, maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-line">
          <span className="text-xs font-semibold flex-1 truncate">{active.title ?? active.filename}</span>
          <span className="text-[10px] uppercase text-mute px-1.5 py-0.5 bg-surface-2 rounded">read only</span>
          <button
            type="button"
            data-testid="attachment-modal-open-in-pane"
            onClick={() => {
              onOpenInPane(active.filename, null);
              onClose();
            }}
            className="text-xs text-accent hover:underline"
          >
            Open in pane
          </button>
          <button
            type="button"
            data-testid="attachment-modal-close"
            onClick={onClose}
            aria-label="Close"
            className="text-mute hover:text-ink-2"
          >
            ×
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          {items.length > 1 && (
            <aside data-testid="attachment-rail" className="w-64 border-r border-line overflow-y-auto">
              {TYPE_GROUP_ORDER.map((type) => {
                const group = items.filter((i) => i.type === type);
                if (group.length === 0) return null;
                return (
                  <div key={type} data-testid={`attachment-rail-group-${type}`}>
                    <h4 className="px-3 py-1 text-[10px] uppercase text-mute tracking-wide">{type}s</h4>
                    {group.map((it) => (
                      <button
                        key={it.filename}
                        type="button"
                        data-testid={`attachment-rail-item-${it.filename}`}
                        onClick={() => setActive(it)}
                        className={
                          "w-full text-left px-3 py-1 text-xs " +
                          (active.filename === it.filename ? "bg-accent-soft text-accent" : "hover:bg-surface-2")
                        }
                      >
                        {it.title ?? it.filename}
                      </button>
                    ))}
                  </div>
                );
              })}
            </aside>
          )}
          <div className="flex-1 overflow-y-auto p-4 text-sm">
            <BodyDispatcher
              item={active}
              readDocument={readDocument}
              resolveWikiLinkPath={resolveWikiLinkPath}
              onOpenInPane={(filename, anchor) => {
                onOpenInPane(filename, anchor);
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface BodyDispatcherProps {
  item: PreviewItem;
  readDocument: AttachmentPreviewModalProps["readDocument"];
  resolveWikiLinkPath: AttachmentPreviewModalProps["resolveWikiLinkPath"];
  onOpenInPane: AttachmentPreviewModalProps["onOpenInPane"];
}

function BodyDispatcher({ item, readDocument, resolveWikiLinkPath, onOpenInPane }: BodyDispatcherProps) {
  switch (item.type) {
    case "document":
      return (
        <DocumentBody
          filename={item.filename}
          readDocument={readDocument}
          resolveWikiLinkPath={resolveWikiLinkPath}
          onOpenInPane={onOpenInPane}
        />
      );
    case "diagram":
    case "svg":
    case "tab":
      return (
        <div
          data-testid={`attachment-body-placeholder-${item.type}`}
          className="text-xs text-mute italic"
        >
          Preview not yet implemented for {item.type} attachments — use Open in pane to view.
        </div>
      );
  }
}

interface DocumentBodyProps {
  filename: string;
  readDocument: AttachmentPreviewModalProps["readDocument"];
  resolveWikiLinkPath: AttachmentPreviewModalProps["resolveWikiLinkPath"];
  onOpenInPane: AttachmentPreviewModalProps["onOpenInPane"];
}

function DocumentBody({ filename, readDocument, resolveWikiLinkPath, onOpenInPane }: DocumentBodyProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    readDocument(filename)
      .then((md) => {
        if (cancelled) return;
        if (md == null) {
          setError("Document not found");
          return;
        }
        setHtml(DOMPurify.sanitize(markdownToHtml(md)));
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [filename, readDocument]);

  const onClick = useMemo(
    () =>
      (e: React.MouseEvent<HTMLDivElement>) => {
        const target = e.target as HTMLElement;
        const wikiLink = target.closest<HTMLElement>("[data-wiki-link]");
        if (!wikiLink) return;
        e.preventDefault();
        const linkPath = wikiLink.getAttribute("data-wiki-link") ?? "";
        const anchor = wikiLink.getAttribute("data-wiki-section");
        const dir = filename.includes("/") ? filename.slice(0, filename.lastIndexOf("/")) : "";
        const resolved = resolveWikiLinkPath ? resolveWikiLinkPath(linkPath, dir) : linkPath;
        onOpenInPane(resolved, anchor || null);
      },
    [filename, resolveWikiLinkPath, onOpenInPane],
  );

  if (error) return <div className="text-xs text-error">{error}</div>;
  if (html == null) return <div className="text-xs text-mute italic">Loading…</div>;
  return (
    <div
      data-testid="attachment-body-document"
      className="prose prose-sm max-w-none"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

- [ ] **Step 4.5: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.test.tsx
```

Expected: PASS, all 9 cases green.

- [ ] **Step 4.6: Update importers**

```bash
grep -rln "DocPreviewModal" src/
```

Expected: `DiagramOverlays.tsx` (and possibly `knowledgeBase.tsx`).

For each importer, change:
```ts
import DocPreviewModal from "./DocPreviewModal";
// or
import DocPreviewModal from "../components/DocPreviewModal";
```
to:
```ts
import { AttachmentPreviewModal, type PreviewItem } from "./AttachmentPreviewModal";
```

Update the JSX. Today's site (in `DiagramOverlays.tsx`):
```tsx
{previewedDocPath !== null && (
  <DocPreviewModal
    docPath={previewedDocPath}
    entityName={previewedEntityName}
    onClose={() => setPreviewedDocPath(null)}
    onOpenInPane={onOpenInPane}
    readDocument={readDocument}
  />
)}
```

becomes:
```tsx
{previewedItems !== null && previewedItems.length > 0 && (
  <AttachmentPreviewModal
    open
    items={previewedItems}
    onClose={() => setPreviewedItems(null)}
    onOpenInPane={(filename, anchor) => {
      setPreviewedItems(null);
      onOpenInPane(filename, anchor);
    }}
    readDocument={readDocument}
    resolveWikiLinkPath={resolveWikiLinkPath}
  />
)}
```

Replace `previewedDocPath: string | null` state with `previewedItems: PreviewItem[] | null`. Audit the call site that *opens* the modal — Task 7 below wires the indicator click handler that builds `PreviewItem[]` from `attachmentsByType(target)`; for now the importer updates can leave the open-handler untouched, returning `null` (modal closed).

- [ ] **Step 4.7: Delete the old files**

```bash
git rm src/app/knowledge_base/features/diagram/components/DocPreviewModal.tsx \
       src/app/knowledge_base/features/diagram/components/DocPreviewModal.test.tsx
```

- [ ] **Step 4.8: Typecheck + full suite**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean. If typecheck flags `previewedItems` not yet wired to a setter, leave a temporary `const [previewedItems] = useState<PreviewItem[] | null>(null);` — Task 7 wires the setter through.

- [ ] **Step 4.9: Commit**

```bash
git add -A
git commit -m "feat(diagram): AttachmentPreviewModal — left rail + 4-way body dispatcher (placeholder bodies for non-doc)"
```

---

## Task 5: Rename `CreateAttachDocModal` → `CreateAttachEntityModal` (4-tab type strip)

**Files:**
- Delete: `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx`
- Delete: `src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.tsx`
- Create: `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx`

**Goal:** Type-aware picker. Today's modal accepts a filename and an "Edit now" checkbox; the new one adds a tab strip with `Document | Diagram | SVG | Tab`. The Document tab is fully functional; the other three tabs render but their "Create & Attach" button is disabled with the helper text "Persistence ships in a future MVP."

- [ ] **Step 5.1: Read the existing component**

```bash
cat src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx
```

- [ ] **Step 5.2: Write the failing test**

Create `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateAttachEntityModal } from "./CreateAttachEntityModal";

function makeProps() {
  return {
    open: true,
    defaultFilename: "untitled.md",
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };
}

describe("CreateAttachEntityModal", () => {
  it("renders with Document tab active by default", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    const tab = screen.getByTestId("create-attach-type-document");
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).toBeNull();
  });

  it("disables confirm when SVG tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-svg"));
    const confirm = screen.getByTestId("create-attach-confirm");
    expect(confirm.getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText(/persistence ships in a future mvp/i)).toBeInTheDocument();
  });

  it("disables confirm when Diagram tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-diagram"));
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).not.toBeNull();
  });

  it("disables confirm when Tab tab is active (deferred persistence)", () => {
    render(<CreateAttachEntityModal {...makeProps()} />);
    fireEvent.click(screen.getByTestId("create-attach-type-tab"));
    expect(screen.getByTestId("create-attach-confirm").getAttribute("disabled")).not.toBeNull();
  });

  it("calls onConfirm with type='document' and the filename", () => {
    const onConfirm = vi.fn();
    render(<CreateAttachEntityModal {...makeProps()} onConfirm={onConfirm} />);
    const input = screen.getByTestId("create-attach-filename") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "notes.md" } });
    fireEvent.click(screen.getByTestId("create-attach-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("notes.md", false, "document");
  });

  it("toggling 'Edit now' is forwarded to onConfirm", () => {
    const onConfirm = vi.fn();
    render(<CreateAttachEntityModal {...makeProps()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("create-attach-edit-now"));
    fireEvent.click(screen.getByTestId("create-attach-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("untitled.md", true, "document");
  });

  it("Cancel calls onCancel", () => {
    const onCancel = vi.fn();
    render(<CreateAttachEntityModal {...makeProps()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("create-attach-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("renders nothing when open is false", () => {
    const { container } = render(<CreateAttachEntityModal {...makeProps()} open={false} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 5.3: Run the test — expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx
```

Expected: FAIL with "Cannot find module './CreateAttachEntityModal'".

- [ ] **Step 5.4: Implement the component**

Create `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.tsx`:

```tsx
"use client";

import React, { useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";
import type { PreviewItemType } from "./AttachmentPreviewModal";

interface CreateAttachEntityModalProps {
  open: boolean;
  defaultFilename: string;
  onConfirm: (filename: string, editNow: boolean, type: PreviewItemType) => void;
  onCancel: () => void;
}

const TYPES: PreviewItemType[] = ["document", "diagram", "svg", "tab"];

const TYPE_LABEL: Record<PreviewItemType, string> = {
  document: "Document",
  diagram: "Diagram",
  svg: "SVG",
  tab: "Tab",
};

export function CreateAttachEntityModal({
  open,
  defaultFilename,
  onConfirm,
  onCancel,
}: CreateAttachEntityModalProps) {
  const [activeType, setActiveType] = useState<PreviewItemType>("document");
  const [filename, setFilename] = useState(defaultFilename);
  const [editNow, setEditNow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, open);

  if (!open) return null;

  const isDocumentTab = activeType === "document";
  const confirmDisabled = !isDocumentTab || filename.trim().length === 0;

  return (
    <div
      ref={containerRef}
      data-testid="create-attach-modal"
      className="fixed inset-0 z-modal flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface border border-line rounded-lg shadow-xl w-[480px]">
        <div className="flex gap-2 px-4 pt-3 text-xs border-b border-line">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === activeType}
              data-testid={`create-attach-type-${t}`}
              onClick={() => setActiveType(t)}
              className={
                "px-2 py-1 -mb-px border-b-2 " +
                (t === activeType
                  ? "border-accent text-accent font-semibold"
                  : "border-transparent text-mute hover:text-ink-2")
              }
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span>Filename</span>
            <input
              type="text"
              data-testid="create-attach-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              disabled={!isDocumentTab}
              className="px-2 py-1 border border-line rounded bg-surface-2 text-sm disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              data-testid="create-attach-edit-now"
              checked={editNow}
              onChange={(e) => setEditNow(e.target.checked)}
              disabled={!isDocumentTab}
            />
            Edit now
          </label>
          {!isDocumentTab && (
            <p className="text-[11px] text-mute italic">
              {TYPE_LABEL[activeType]} attachment persistence ships in a future MVP.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              data-testid="create-attach-cancel"
              onClick={onCancel}
              className="text-xs px-2 py-1 hover:underline"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="create-attach-confirm"
              onClick={() => onConfirm(filename.trim(), editNow, activeType)}
              disabled={confirmDisabled}
              className="text-xs px-2 py-1 rounded bg-accent text-on-accent disabled:opacity-50"
            >
              Create &amp; Attach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.5: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.test.tsx
```

Expected: PASS, all 8 cases green.

- [ ] **Step 5.6: Update importers**

```bash
grep -rln "CreateAttachDocModal" src/
```

Expected: `DiagramOverlays.tsx`. Replace the import:
```ts
import CreateAttachDocModal from "./CreateAttachDocModal";
```
with:
```ts
import { CreateAttachEntityModal } from "./CreateAttachEntityModal";
```

Update the JSX call site. Old:
```tsx
{createModalTarget && (
  <CreateAttachDocModal
    defaultFilename={createModalTarget.defaultFilename}
    onConfirm={(filename, editNow) => {
      handleCreateAttachConfirm(createModalTarget.flowId, filename, editNow);
      setCreateModalTarget(null);
    }}
    onCancel={() => setCreateModalTarget(null)}
  />
)}
```
becomes:
```tsx
{createModalTarget && (
  <CreateAttachEntityModal
    open
    defaultFilename={createModalTarget.defaultFilename}
    onConfirm={(filename, editNow, type) => {
      // MVP-2b: only 'document' fires here (other tabs disable confirm).
      handleCreateAttachConfirm(createModalTarget.flowId, filename, editNow, type);
      setCreateModalTarget(null);
    }}
    onCancel={() => setCreateModalTarget(null)}
  />
)}
```

Update `handleCreateAttachConfirm` (likely in `useDiagramController` or `knowledgeBase.tsx`) to accept the new `type: PreviewItemType` parameter. In MVP-2b, it can be ignored for the document branch — but include it in the signature so future SVG/Tab branches have a hook.

- [ ] **Step 5.7: Delete the old files**

```bash
git rm src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.tsx \
       src/app/knowledge_base/features/diagram/components/CreateAttachDocModal.test.tsx
```

- [ ] **Step 5.8: Typecheck + full suite**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean.

- [ ] **Step 5.9: Commit**

```bash
git add -A
git commit -m "feat(diagram): CreateAttachEntityModal — 4-tab type strip; non-doc tabs disabled (deferred persistence)"
```

---

## Task 6: Create new `AttachmentsSection` component (properties panel)

**Files:**
- Create: `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx`
- Create: `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx`

> **NOT a rename.** The existing `DocumentsSection.tsx` shows inbound wiki-link backlinks ("References") and is unrelated. It stays as-is. We add a brand-new `AttachmentsSection` that renders outbound attachments grouped by source type.

**Goal:** Render a per-entity "Attachments" section with one sub-list per non-empty source type, an "Attach" button (opens `CreateAttachEntityModal`), and per-row "Detach" / "Preview" actions. In MVP-2b only the docs sub-list ever has rows.

- [ ] **Step 6.1: Write the failing test**

Create `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentsSection } from "./AttachmentsSection";
import type { AttachmentBuckets } from "../../document/types";

const empty: AttachmentBuckets = { docs: [], diagrams: [], svgs: [], tabs: [] };

function makeProps(buckets: Partial<AttachmentBuckets> = {}) {
  return {
    buckets: { ...empty, ...buckets } as AttachmentBuckets,
    onPreview: vi.fn(),
    onDetach: vi.fn(),
    onAttach: vi.fn(),
    readOnly: false,
  };
}

describe("AttachmentsSection", () => {
  it("renders the section title with no rows when all buckets are empty", () => {
    render(<AttachmentsSection {...makeProps()} />);
    expect(screen.getByText(/attachments/i)).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-row-a.md")).toBeNull();
  });

  it("renders rows under the docs group when docs bucket has entries", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} />);
    expect(screen.getByTestId("attachment-group-docs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-row-a.md")).toBeInTheDocument();
  });

  it("hides empty groups", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} />);
    expect(screen.queryByTestId("attachment-group-diagrams")).toBeNull();
    expect(screen.queryByTestId("attachment-group-svgs")).toBeNull();
    expect(screen.queryByTestId("attachment-group-tabs")).toBeNull();
  });

  it("Preview button calls onPreview with filename and type", () => {
    const onPreview = vi.fn();
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId("attachment-preview-a.md"));
    expect(onPreview).toHaveBeenCalledWith("a.md", "document");
  });

  it("Detach button calls onDetach with filename and type", () => {
    const onDetach = vi.fn();
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} onDetach={onDetach} />);
    fireEvent.click(screen.getByTestId("attachment-detach-a.md"));
    expect(onDetach).toHaveBeenCalledWith("a.md", "document");
  });

  it("Attach button calls onAttach", () => {
    const onAttach = vi.fn();
    render(<AttachmentsSection {...makeProps()} onAttach={onAttach} />);
    fireEvent.click(screen.getByTestId("attachment-attach-button"));
    expect(onAttach).toHaveBeenCalled();
  });

  it("hides Attach + Detach buttons when readOnly is true", () => {
    const props = makeProps({
      docs: [{ id: "doc-1", filename: "a.md", title: "Notes A", attachedTo: [] }],
    });
    render(<AttachmentsSection {...props} readOnly />);
    expect(screen.queryByTestId("attachment-attach-button")).toBeNull();
    expect(screen.queryByTestId("attachment-detach-a.md")).toBeNull();
  });
});
```

- [ ] **Step 6.2: Run the test — expect FAIL**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx
```

Expected: FAIL with "Cannot find module './AttachmentsSection'".

- [ ] **Step 6.3: Implement the component**

Create `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx`:

```tsx
"use client";

import React from "react";
import { FileText, Network, Image as ImageIcon, Music } from "lucide-react";
import type { AttachmentBuckets } from "../../document/types";
import type { PreviewItemType } from "../components/AttachmentPreviewModal";
import { Section } from "./shared";

interface AttachmentsSectionProps {
  buckets: AttachmentBuckets;
  onPreview: (filename: string, type: PreviewItemType) => void;
  onDetach: (filename: string, type: PreviewItemType) => void;
  onAttach: () => void;
  readOnly?: boolean;
}

type GroupKey = keyof AttachmentBuckets;

const GROUPS: { key: GroupKey; type: PreviewItemType; label: string; Icon: typeof FileText }[] = [
  { key: "docs", type: "document", label: "Documents", Icon: FileText },
  { key: "diagrams", type: "diagram", label: "Diagrams", Icon: Network },
  { key: "svgs", type: "svg", label: "SVG", Icon: ImageIcon },
  { key: "tabs", type: "tab", label: "Tabs", Icon: Music },
];

export function AttachmentsSection({
  buckets,
  onPreview,
  onDetach,
  onAttach,
  readOnly = false,
}: AttachmentsSectionProps) {
  const total =
    buckets.docs.length + buckets.diagrams.length + buckets.svgs.length + buckets.tabs.length;
  return (
    <Section title={`Attachments${total > 0 ? ` (${total})` : ""}`}>
      <div className="flex flex-col gap-2">
        {GROUPS.map(({ key, type, label, Icon }) => {
          const rows = buckets[key];
          if (rows.length === 0) return null;
          return (
            <div key={key} data-testid={`attachment-group-${key}`}>
              <h5 className="text-[10px] uppercase text-mute tracking-wide mb-1">{label}</h5>
              <div className="flex flex-col gap-1">
                {rows.map((row) => (
                  <div
                    key={row.filename}
                    data-testid={`attachment-row-${row.filename}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-line text-xs"
                  >
                    <Icon size={12} className="flex-shrink-0 text-accent" />
                    <button
                      type="button"
                      data-testid={`attachment-preview-${row.filename}`}
                      onClick={() => onPreview(row.filename, type)}
                      className="flex-1 text-left text-accent hover:underline truncate"
                    >
                      {row.title || row.filename.split("/").pop()}
                    </button>
                    {!readOnly && (
                      <button
                        type="button"
                        data-testid={`attachment-detach-${row.filename}`}
                        onClick={() => onDetach(row.filename, type)}
                        className="text-[10px] text-mute hover:text-error"
                      >
                        Detach
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {!readOnly && (
          <button
            type="button"
            data-testid="attachment-attach-button"
            onClick={onAttach}
            className="self-start text-xs text-accent hover:underline mt-1"
          >
            + Attach
          </button>
        )}
      </div>
    </Section>
  );
}
```

- [ ] **Step 6.4: Run the test — expect PASS**

```bash
npm run test:run -- src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx
```

Expected: PASS, all 7 cases green.

- [ ] **Step 6.5: Typecheck + full suite**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean.

- [ ] **Step 6.6: Commit**

```bash
git add src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx \
        src/app/knowledge_base/features/diagram/properties/AttachmentsSection.test.tsx
git commit -m "feat(diagram): AttachmentsSection — outbound attachments grouped by source type"
```

---

## Task 7a: Wire `useDiagramController` to expose `attachmentsByType` + indicator/preview state

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramController.ts`
- Modify: `src/app/knowledge_base/features/diagram/components/Element.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DataLine.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramLinesOverlay.tsx`
- Modify: `src/app/knowledge_base/features/diagram/components/DiagramOverlays.tsx`

**Goal:** Plumb `attachmentsByType` through the controller, compute per-element + per-connection counts, wire the indicator click → preview state, mount the modal in `DiagramOverlays`. After this task: hover-indicator on a node opens the preview modal end-to-end.

- [ ] **Step 7a.1: Add indicator click handler in `useDiagramController`**

Locate the section of `useDiagramController.ts` returning helpers (around line 514). Add:

```ts
const [previewedItems, setPreviewedItems] = useState<PreviewItem[] | null>(null);

const openAttachmentPreviewFor = useCallback(
  (target: { type: EntityAttachmentTarget; id: string; diagramPath?: string }) => {
    const buckets = attachmentsByType(target);
    const items: PreviewItem[] = [
      ...buckets.docs.map((d) => ({ type: "document" as const, filename: d.filename, title: d.title })),
      ...buckets.diagrams.map((d) => ({ type: "diagram" as const, filename: d.filename, title: d.title })),
      ...buckets.svgs.map((d) => ({ type: "svg" as const, filename: d.filename, title: d.title })),
      ...buckets.tabs.map((d) => ({ type: "tab" as const, filename: d.filename, title: d.title })),
    ];
    if (items.length === 0) return;
    setPreviewedItems(items);
  },
  [attachmentsByType],
);

const closeAttachmentPreview = useCallback(() => setPreviewedItems(null), []);
```

Add to the returned object: `attachmentsByType`, `openAttachmentPreviewFor`, `closeAttachmentPreview`, `previewedItems`.

> **Watch the existing return.** The hook returns `hasDocuments`, `getDocumentsForEntity`, `onOpenDocument` today; preserve those for any consumers we haven't widened yet.

- [ ] **Step 7a.2: Compute `attachmentCounts` per element + per line**

In `useDiagramController` (or wherever the per-element memos live), add:

```ts
const attachmentCountsForNode = useCallback(
  (nodeId: string): AttachmentCounts => {
    const b = attachmentsByType({ type: "node", id: nodeId });
    return { docs: b.docs.length, diagrams: b.diagrams.length, svgs: b.svgs.length, tabs: b.tabs.length };
  },
  [attachmentsByType],
);

const attachmentCountsForConnection = useCallback(
  (connId: string): AttachmentCounts => {
    const b = attachmentsByType({ type: "connection", id: connId });
    return { docs: b.docs.length, diagrams: b.diagrams.length, svgs: b.svgs.length, tabs: b.tabs.length };
  },
  [attachmentsByType],
);
```

Pass these helpers down through the same prop pipeline used by the previous `hasDocuments` / `getDocumentsForEntity` pair.

- [ ] **Step 7a.3: Update `Element.tsx` and `DataLine.tsx` to consume the new prop**

In each, remove the `hasDocuments` / `documentPaths` / `onDocNavigate` prop trio and replace with:

```tsx
attachmentCounts: AttachmentCounts;
onAttachmentIndicatorClick: () => void;
```

Render the new `<AttachmentIndicator counts={attachmentCounts} ... onClick={onAttachmentIndicatorClick} testId={elementId} />` in place of the old `<DocInfoBadge>` (already done in Task 3 for the local replace; now widen the data).

- [ ] **Step 7a.4: Update `DiagramLinesOverlay.tsx`**

Replace:
```tsx
hasDocuments={hasDocuments("connection", line.id)}
documentPaths={getDocumentsForEntity("connection", line.id).map((d) => d.filename)}
onDocNavigate={onOpenDocument}
```
with:
```tsx
attachmentCounts={attachmentCountsForConnection(line.id)}
onAttachmentIndicatorClick={() =>
  openAttachmentPreviewFor({ type: "connection", id: line.id })
}
```

Pass `attachmentCountsForConnection` and `openAttachmentPreviewFor` from props (they originate in `useDiagramController`).

- [ ] **Step 7a.5: Mount the modal in `DiagramOverlays.tsx`**

Already done at the import level in Task 4; now wire the open handler. The overlay receives `previewedItems` + `closeAttachmentPreview` from the controller. The `onOpenInPane` handler (existing) is forwarded.

- [ ] **Step 7a.6: Smoke-test 7a integration**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean. The indicator should now light up on a node with attachments and clicking it opens the modal. AttachmentsSection is not yet rendered in the properties panels — that lands in Task 7b.

- [ ] **Step 7a.7: Commit**

```bash
git add -A
git commit -m "feat(diagram): wire attachmentsByType + indicator click → AttachmentPreviewModal"
```

---

## Task 7b: Mount `AttachmentsSection` in every properties panel

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/properties/NodeProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LineProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/LayerProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/FlowProperties.tsx`
- Modify: `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx`

**Goal:** Render `<AttachmentsSection>` in each properties panel with the right `target`. Attach button opens `CreateAttachEntityModal`. Detach forwards to existing detach handlers (extended with the type param in Task 5).

- [ ] **Step 7b.1: Render `<AttachmentsSection>` in each Properties panel**

For each of the 5 properties files, add a section:

```tsx
import { AttachmentsSection } from "./AttachmentsSection";
// ... inside the component body:
<AttachmentsSection
  buckets={attachmentsByType({ type: "node", id: selectedNodeId })}    // or connection / flow / layer / 'root' for diagram
  onPreview={(filename, type) =>
    openAttachmentPreviewFor({ type: "node", id: selectedNodeId })     // open modal seeded with all this entity's attachments
  }
  onDetach={(filename, type) => onDetachAttachment(filename, "node", selectedNodeId, type)}
  onAttach={() => openCreateAttachModal({ type: "node", id: selectedNodeId })}
  readOnly={isReadOnly}
/>
```

For `DiagramProperties`, the target is `{ type: "root", id: diagramFilename }`.

`onDetachAttachment` and `openCreateAttachModal` are existing handlers on the controller (today they take `documentPath` only — extend them with the `type` param; in MVP-2b ignore non-doc types in the body).

- [ ] **Step 7b.2: Smoke-test 7b integration**

```bash
npm run typecheck
npm run test:run -- --reporter=basic
```

Expected: clean. Properties panels now show the `<AttachmentsSection>` for the selected entity.

- [ ] **Step 7b.3: Commit**

```bash
git add -A
git commit -m "feat(diagram): render AttachmentsSection in every properties panel"
```

---

## Task 7c: Pass selectors through `knowledgeBase.tsx` to the diagram view

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Modify: `src/app/knowledge_base/features/diagram/DiagramView.tsx` (signature widening only)

**Goal:** Plumb `attachmentsByType` from the shell-mounted `useDocuments` down through `DiagramView` to `useDiagramController`. After this task: end-to-end behaviour is verifiable in the browser.

- [ ] **Step 7c.1: Pass new selectors through `knowledgeBase.tsx` to the diagram controller**

`knowledgeBase.tsx` already has `useDocuments` mounted (line ~179). Pass `attachmentsByType` to the diagram view alongside `documents`:

```tsx
<DiagramView
  ...
  documents={docManager.documents}
  attachmentsByType={docManager.attachmentsByType}
  ...
/>
```

`DiagramView` forwards it to `useDiagramController`, which uses it as shown in Step 7a.1.

- [ ] **Step 7c.2: Smoke-test full integration**

```bash
npm run test:run -- --reporter=basic
npm run typecheck
```

If a typecheck error names a prop you renamed but didn't propagate, fix the offending file in this same task (do not commit a partial integration).

Manually verify in dev mode (after `npm run dev`):
1. Open a diagram with at least one document attached to a node.
2. Hover the node — see the indicator render with the `FileText` glyph.
3. Click the indicator — `AttachmentPreviewModal` opens with the document body.
4. Click "Open in pane" — modal closes, document opens in the other pane.
5. Open the node's properties panel — see the `AttachmentsSection` listing the document under "Documents".
6. Click "+ Attach" — `CreateAttachEntityModal` opens; click each tab; verify only Document tab can submit.

> If preview MCP is unavailable (per `feedback_preview_verification_limits.md`), the verification ceiling is "clean build + clean console + automated tests pass."

- [ ] **Step 7c.3: Commit**

```bash
git add -A
git commit -m "feat(diagram): plumb attachmentsByType through knowledgeBase shell to DiagramView"
```

---

## Task 8: Update `Features.md` and `test-cases/03-diagram.md`

**Files:**
- Modify: `Features.md` (§3.18 retitled, sub-bullets)
- Modify: `test-cases/03-diagram.md` (new test cases under §3.18)

- [ ] **Step 8.1: Read existing §3.18**

```bash
grep -n "^### 3\\.18\|^## 3\\." Features.md | head
sed -n '/^### 3\.18/,/^### 3\./p' Features.md | head -60
```

The current §3.18 ("Document Integration" or similar) describes document-only attachment. We retitle and rewrite.

- [ ] **Step 8.2: Edit `Features.md` §3.18**

Replace the §3.18 heading with:

```markdown
### 3.18 Cross-Entity Attachment

✅ Attachment indicator on nodes — bottom-right glyph row, one glyph per non-empty source type (`docs`, `diagrams`, `svgs`, `tabs`). Path: `src/app/knowledge_base/features/diagram/components/AttachmentIndicator.tsx`.

✅ Unified attachment preview modal — left rail (visible when more than one item) groups attachments by type; body dispatches to a per-type renderer. Document body is fully implemented; diagram, svg, tab show "Preview not yet implemented" placeholders pending future-MVP persistence. Path: `src/app/knowledge_base/features/diagram/components/AttachmentPreviewModal.tsx`.

✅ Type-aware create-attach picker — 4-tab type strip (`Document | Diagram | SVG | Tab`); only the Document tab is functional in MVP-2b. Path: `src/app/knowledge_base/features/diagram/components/CreateAttachEntityModal.tsx`.

✅ Attachments section in properties panels — outbound attachments grouped by source type, with Preview / Detach / + Attach affordances. Mounted in every properties panel (Node, Line, Layer, Flow, Diagram). Path: `src/app/knowledge_base/features/diagram/properties/AttachmentsSection.tsx`.

⚙️ Bucket-returning selector — `useDocuments.attachmentsByType(target)` returns `{docs, diagrams, svgs, tabs}` for any entity-attachment target. Path: `src/app/knowledge_base/features/document/hooks/useDocuments.ts`.

⚙️ Generic helpers — `entityAttachments.attachmentsByType(sources, target)` plus back-compat `hasDocuments` / `getDocumentsForEntity`. Path: `src/app/knowledge_base/features/diagram/utils/entityAttachments.ts`.

? Diagram / SVG / Tab attachment persistence — UI scaffolding accepts them at the type contract; data layer (`AttachmentLink` row schema) still tracks documents only. Persistence sidecars deferred to a future MVP.
```

- [ ] **Step 8.3: Edit `test-cases/03-diagram.md`**

Find the next free ID under §3.18 and add:

```markdown
- DIAG-3.18-NN ❌: Hovering a node with a document attachment shows the AttachmentIndicator with the docs glyph.
- DIAG-3.18-NN ❌: Hovering a node with no attachment hides the AttachmentIndicator entirely.
- DIAG-3.18-NN ❌: Clicking the AttachmentIndicator opens AttachmentPreviewModal seeded with the node's attachments.
- DIAG-3.18-NN ❌: AttachmentPreviewModal hides the left rail when only one item is attached.
- DIAG-3.18-NN ❌: AttachmentPreviewModal renders the document body via markdownToHtml + sanitizer.
- DIAG-3.18-NN ❌: AttachmentPreviewModal shows the placeholder body for diagram / svg / tab item types.
- DIAG-3.18-NN ❌: CreateAttachEntityModal disables the Confirm button when SVG / Diagram / Tab tab is active.
- DIAG-3.18-NN ❌: CreateAttachEntityModal forwards the active type with onConfirm.
- DIAG-3.18-NN ❌: AttachmentsSection groups rows by source type and hides empty groups.
- DIAG-3.18-NN ❌: AttachmentsSection hides + Attach and Detach buttons in read-only mode.
- DIAG-3.18-NN ❌: Open in pane in AttachmentPreviewModal forwards the active filename and closes the modal.
```

(Replace `NN` with concrete sequential numbers after reading the file's current highest ID.)

- [ ] **Step 8.4: Commit**

```bash
git add Features.md test-cases/03-diagram.md
git commit -m "docs(attachments): Features.md §3.18 retitled; test-cases/03-diagram.md adds 11 cases under §3.18"
```

---

## Task 9: Final validation, manual QA, and PR

- [ ] **Step 9.1: Full type + test + build**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use
npm run typecheck
npm run test:run -- --reporter=basic
npm run test:e2e -- --reporter=line
npm run build
```

Expected: every check green. If a Playwright test fails, investigate before proceeding — MVP-2a's E2E fix (`8030`) shows that fixtures sometimes need explicit data; verify that the new components' test IDs (`attachment-indicator-*`, `attachment-modal-*`) are stable.

- [ ] **Step 9.2: Manual smoke (verification ceiling)**

```bash
npm run dev
```

In the browser:
1. Open a vault with a known document↔node attachment.
2. Hover the node → indicator visible with FileText glyph only.
3. Click indicator → modal opens; markdown body renders; "Open in pane" closes modal and opens the document.
4. Open Properties → Node panel → AttachmentsSection lists the document under "Documents"; "+ Attach" opens CreateAttachEntityModal.
5. In the create modal, click "Diagram"/"SVG"/"Tab" tabs → Confirm is disabled and a "persistence ships in a future MVP" message renders.
6. Console: no warnings.

> Per `feedback_preview_verification_limits.md`: if the FSA folder picker isn't drivable, the build + automated tests + clean console form the verification ceiling.

- [ ] **Step 9.3: Push and open PR**

```bash
git push -u origin feat/diagram-mvp2b-cross-entity-attachment-ui
gh pr create --title "feat(diagram): MVP-2b — Cross-Entity Attachment UI (4-way type contract)" --body "$(cat <<'EOF'
## Summary
- Renames document-specific UI (`DocInfoBadge`, `DocPreviewModal`, `CreateAttachDocModal`) to a 4-way type-aware contract (`AttachmentIndicator`, `AttachmentPreviewModal`, `CreateAttachEntityModal`).
- Adds a brand-new `AttachmentsSection` component to every properties panel (the existing `DocumentsSection` continues to display inbound wiki-link "References" and is unrelated).
- Adds `attachmentsByType(target)` selector to `useDocuments` and `entityAttachments` helpers (renamed from `documentAttachments`, with back-compat shape preserved for `useDiagramController`).
- 4-way at the UI contract; document-only at the data layer. SVG/Diagram-as-source/Tab tabs render but are runtime no-ops — `AttachmentLink` schema widening + per-type persistence sidecars are deferred to a future MVP.

## Test plan
- [ ] `npm run typecheck` clean
- [ ] `npm run test:run` 100% pass (~9 new test files)
- [ ] `npm run test:e2e` clean
- [ ] `npm run build` clean
- [ ] Manual: hover-indicator → modal → open-in-pane works for a doc-attached node
- [ ] Manual: AttachmentsSection renders in every Properties panel; "+ Attach" opens picker; non-doc tabs are disabled

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL in the response.

- [ ] **Step 9.4: After PR opens, update the handoff doc**

On a new commit on the same branch:

```bash
# Edit docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md:
#   - bump "Last updated" with the PR number
#   - add a row to the implementation summary noting the PR is open
git add docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md
git commit -m "docs(diagram): handoff notes MVP-2b PR open"
git push
```

---

## Self-review

1. **Spec coverage** — §6 (cross-entity attachment) implemented:
   - §6.1 attach surface → Tasks 5 + 6 (CreateAttachEntityModal + AttachmentsSection).
   - §6.2 on-canvas attachment indicator → Task 3.
   - §6.3 unified attachment preview modal → Task 4 (placeholder bodies for non-doc until persistence ships).
   - §6.4 attachment store hooks → Task 2 (`attachmentsByType` selector). The full `useEntityAttachments(entityType, path)` hook signature is deferred — current selector is target-keyed only, which is sufficient for MVP-2b's UI surface.
2. **No placeholders in plan** — every step has actual code or an exact grep target. The "placeholder bodies" inside the modal for non-doc types are intentional product behavior for MVP-2b, not plan placeholders.
3. **Type consistency** — `EntityAttachment` (from `features/document/types.ts`) is the single shared type; `AttachmentBuckets` and `EntitySources` (from `entityAttachments.ts`) and `PreviewItem` (from `AttachmentPreviewModal.tsx`) wrap it for UI. `PreviewItemType` is exported from the modal and reused by the section + create modal.
4. **Read-only handling** — `AttachmentsSection` hides "+ Attach" and "Detach" when `readOnly`. Indicator stays visible (navigation affordance, not edit). Modal forces "Read only" chip in header.
5. **Branch discipline** — all work happens on `feat/diagram-mvp2b-cross-entity-attachment-ui`. Each task is a single commit; the PR opens after Task 9.
6. **Conventions honoured** —
   - Branch-per-MVP (`feedback_branch_per_unit_of_work.md` + `feedback_no_worktrees.md`).
   - Main is protected (`project_branch_protection.md`) — no direct pushes.
   - `useRepositories()` is mounted at shell layer; `useDocuments` already operates above the provider (no change here).
   - Tiptap v3 named exports continue to be used in `markdownSerializer.ts`.
   - Verification ceiling is build + tests + clean console (`feedback_preview_verification_limits.md`).
7. **Future MVP hooks** — when SVG/Tab/Diagram-as-source persistence ships, only these surfaces must change:
   - `AttachmentLink` row shape gains `sourceType` (and storage path) → `useDocuments` widens its row reads.
   - `attachmentsByType` widens its bucket population beyond `docs`.
   - `AttachmentPreviewModal` placeholder bodies are replaced with real renderers.
   - `CreateAttachEntityModal` enables non-doc tabs.
   No other UI changes are required — that is the load-bearing point of MVP-2b's "4-way at the UI contract."
