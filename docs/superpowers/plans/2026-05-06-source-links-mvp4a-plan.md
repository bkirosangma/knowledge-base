# Source Links MVP-4a Implementation Plan (Re-grounded)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the spec's "sources on every primary entity" story for the entities whose persistence already exists today: **diagram top-level + diagram entities (node, connection, layer, flow) + document**. Add a shared `<SourcesSection>` Properties UI mounted on every panel that has a working data layer.

**Why "MVP-4a":** The original plan (`docs/superpowers/plans/2026-05-05-source-links-mvp-plan.md`) targets `SvgMeta` (in `features/svgEditor/types.ts`) and `TabMeta` (in `features/tab/types.ts`) — neither type nor file exists. SVG persists raw XML via `useSVGPersistence.writeSvg` with no metadata sidecar; Tab uses `TabMetadata` (engine output, in `domain/tabEngine.ts`) and `TabRefsPayload` v2 (refs sidecar). Adding `sources` for SVG/Tab requires designing a new metadata-sidecar protocol — the **same blocker** that deferred SVG/Tab attachment persistence in MVP 2. Splitting that work into MVP-4b mirrors the MVP-2a/2b precedent.

**Spec:** `docs/superpowers/specs/2026-05-05-diagram-flow-enhancements-design.md` §9 (Source links), §14 slice 10. Empty-list valid; whitelist `http(s)://` only.

**Depends on:** Nothing — MVP 3 (Wiki-Link Anchors) merged via PR #132. MVP-2b (cross-entity attachments) merged via PR #129.

**Deferred to MVP-4b (unified with MVP-2 SVG/Tab attachment persistence deferral):** SVG `.meta.json` sidecar shape, Tab `\sources` AlphaTex header (or `<file>.alphatex.attachments.json` sidecar). Pre-conditions: a brainstorm + spec slice on the SVG/Tab metadata-persistence pattern. Once that lands, MVP-4b can plug `sources` into the same shape as `attachedTo`.

---

## File Map

| File | Action |
|------|--------|
| `src/app/knowledge_base/shared/types/sources.ts` | **New** — `SourceLink` type + `isValidSourceUrl` + `sourceDisplayLabel`. |
| `src/app/knowledge_base/shared/types/sources.test.ts` | **New**. |
| `src/app/knowledge_base/features/diagram/types.ts` | Modify — add `sources?: SourceLink[]` to `NodeIdentity`, `SerializedNodeData`, `Connection`, `LayerDef`, `FlowDef`. |
| `src/app/knowledge_base/shared/utils/types.ts` | Modify — add `sources?: SourceLink[]` to `DiagramData` (top-level lives here, not in `features/diagram/types.ts` — same drift MVP-2a hit). |
| `src/app/knowledge_base/shared/utils/persistence.ts` (or wherever `serializeNodes`/`loadDiagramFromData` live — locate via grep) | Modify — pass `sources` through serialization. |
| `src/app/knowledge_base/features/document/types.ts` | Modify — add `sources?: SourceLink[]` to `DocumentMeta`. |
| `src/app/knowledge_base/features/document/utils/frontmatter.ts` | **New** — `parseFrontmatter(text)` + `serializeFrontmatter({frontmatter, body})`. The codebase **strips** frontmatter today (e.g. `getFirstHeading.ts`, `WikiLinkHoverCard.tsx`); no parser exists. |
| `src/app/knowledge_base/features/document/utils/frontmatter.test.ts` | **New**. |
| `src/app/knowledge_base/features/document/hooks/useDocumentContent.ts` | Modify — surface frontmatter `sources` and accept updates that re-emit body+frontmatter. |
| `src/app/knowledge_base/shared/components/SourcesSection.tsx` | **New** — list + add / edit / remove rows; `readOnly` hides edit affordances. |
| `src/app/knowledge_base/shared/components/SourcesSection.test.tsx` | **New**. |
| `src/app/knowledge_base/features/diagram/properties/{Diagram,Node,Line,Layer,Flow}Properties.tsx` | Modify — wire `<SourcesSection>` and widen `onUpdate?` partials to include `sources`. |
| `src/app/knowledge_base/features/document/properties/DocumentProperties.tsx` | Modify — accept `sources` + `onUpdateSources` props, mount `<SourcesSection>`. |
| `src/app/knowledge_base/knowledgeBase.tsx` (DiagramView/DocumentView shells — locate via grep) | Modify — pass `sources` and `onUpdateSources` props through to DocumentProperties; same for DiagramProperties top-level. |
| `Features.md` | Modify — entry under §3 (Diagram) and §4 (Document) for source links. |
| `test-cases/03-diagram.md`, `test-cases/04-document.md` | New `SRC-3.x-NN` and `SRC-4.x-NN` IDs. |

**Adaptations baked in (apply per task):**
- **Tiptap v3 named exports** — only relevant if a heading extension is touched (it shouldn't be in this plan).
- **No `useLinkUpdates.ts`** — irrelevant here; document save still goes through `useDocumentContent` + the existing save pipeline that pushes content to `linkManager.updateDocumentLinks`. When you add frontmatter handling, the **content** that pipeline sees is the full file (frontmatter + body), so wiki-link extraction must continue to skip frontmatter as it does today.
- **`useRepositories()` only works below `RepositoryProvider`** — Properties panels are below the provider; safe to use the hook there if needed. `KnowledgeBaseInner` is above — pass props from there, don't call the hook.

---

## Task 1: `SourceLink` type + helpers

**Files:**
- Create: `src/app/knowledge_base/shared/types/sources.ts`
- Create: `src/app/knowledge_base/shared/types/sources.test.ts`

- [ ] **Step 1.1: Define type, validator, label helper**

```ts
export interface SourceLink {
  /** http(s):// URL only — other schemes rejected. */
  url: string;
  /** Optional display label; falls back to URL host when blank. */
  title?: string;
}

export function isValidSourceUrl(input: string): boolean {
  try {
    const u = new URL(input);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function sourceDisplayLabel(s: SourceLink): string {
  if (s.title && s.title.trim() !== "") return s.title;
  try { return new URL(s.url).host; } catch { return s.url; }
}
```

- [ ] **Step 1.2: Tests**

Cover: http+https accepted; `javascript:`, `data:`, `file:` rejected; garbage rejected; title falls back to host when blank/missing; raw URL when host parsing fails.

- [ ] **Step 1.3: Verify + commit**

```bash
npm run test:run -- src/app/knowledge_base/shared/types/sources.test.ts
git add src/app/knowledge_base/shared/types/sources.ts \
        src/app/knowledge_base/shared/types/sources.test.ts
git commit -m "feat(sources): SourceLink type + URL validator + display helper"
```

---

## Task 2: Add `sources?` to diagram + document types

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/types.ts`
- Modify: `src/app/knowledge_base/shared/utils/types.ts` (this is where `DiagramData` lives — same drift MVP-2a hit)
- Modify: `src/app/knowledge_base/features/document/types.ts`

- [ ] **Step 2.1: Diagram entity types**

In `features/diagram/types.ts`, import:

```ts
import type { SourceLink } from "../../shared/types/sources";
```

Add `sources?: SourceLink[]` to: `NodeIdentity`, `SerializedNodeData`, `Connection`, `LayerDef`, `FlowDef`.

- [ ] **Step 2.2: DiagramData top-level**

In `shared/utils/types.ts`, add `sources?: SourceLink[]` to `DiagramData` (top-level entity sources). If a runtime shape guard like `isDiagramData` exists in this file, accept the optional field.

- [ ] **Step 2.3: DocumentMeta**

In `features/document/types.ts`, add `sources?: SourceLink[]` to `DocumentMeta`.

- [ ] **Step 2.4: Typecheck**

```bash
npm run typecheck
```

Expected: clean. Field is optional — existing call sites unaffected.

- [ ] **Step 2.5: Commit**

```bash
git add -A
git commit -m "feat(sources): sources?: SourceLink[] on DiagramData/Node/Connection/Layer/Flow + DocumentMeta"
```

---

## Task 3: Persist `sources` through diagram JSON

**Files:**
- Modify the file that owns `serializeNodes` + `loadDiagramFromData` (locate via grep — likely `shared/utils/persistence.ts` or `shared/utils/types.ts`).
- Add tests alongside.

- [ ] **Step 3.1: Locate the serializer**

```bash
grep -rn "serializeNodes\|loadDiagramFromData" src/app/knowledge_base/shared/ src/app/knowledge_base/features/diagram/ | head
```

- [ ] **Step 3.2: Pass `sources` through `serializeNodes`**

Append to the per-node spread:
```ts
...(n.sources && n.sources.length > 0 ? { sources: n.sources } : {}),
```

In the deserializer (or wherever `SerializedNodeData → NodeData` happens), pass `n.sources` through verbatim.

- [ ] **Step 3.3: Round-trip tests**

For each: top-level `DiagramData.sources`, `NodeData.sources`, `Connection.sources`, `LayerDef.sources`, `FlowDef.sources`. Mirror the test style of the existing MVP-2a `attachedTo` tests in this file.

- [ ] **Step 3.4: Verify + commit**

```bash
npm run test:run -- shared/utils/persistence
git add -A
git commit -m "feat(sources): persist sources through diagram serialization"
```

---

## Task 4: `SourcesSection` shared component

**Files:**
- Create: `src/app/knowledge_base/shared/components/SourcesSection.tsx`
- Create: `SourcesSection.test.tsx`

- [ ] **Step 4.1: Tests first** (TDD)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SourcesSection } from "./SourcesSection";

describe("SourcesSection", () => {
  it("renders 'No sources recorded.' when empty in read-only", () => {
    render(<SourcesSection sources={[]} onChange={() => {}} readOnly />);
    expect(screen.getByText("No sources recorded.")).toBeInTheDocument();
    expect(screen.queryByTestId("sources-add")).toBeNull();
  });
  it("renders Add button when not readOnly", () => {
    render(<SourcesSection sources={[]} onChange={() => {}} />);
    expect(screen.getByTestId("sources-add")).toBeInTheDocument();
  });
  it("renders one row per source with display label", () => { /* … */ });
  it("calls onChange with new array when adding a source", () => { /* … */ });
  it("rejects invalid URLs on blur (does not commit)", () => { /* … */ });
  it("calls onChange with the row removed when 'Remove' clicked", () => { /* … */ });
  it("Open button has target=_blank and rel=noopener noreferrer", () => { /* … */ });
  it("hides edit affordances when readOnly", () => { /* … */ });
});
```

- [ ] **Step 4.2: Implement**

Follow the original plan's `SourcesSection.tsx` shape (Trash2 + ExternalLink icons, blur-validates URL, errors shown inline). Rule: empty `url` is allowed for in-progress draft rows; only commit / persist when the URL passes `isValidSourceUrl`. `readOnly` hides Add and Remove and disables inputs.

- [ ] **Step 4.3: Verify + commit**

```bash
npm run test:run -- src/app/knowledge_base/shared/components/SourcesSection.test.tsx
git add -A
git commit -m "feat(sources): SourcesSection shared component"
```

---

## Task 5: Wire `<SourcesSection>` into Diagram Properties panels

**Files:**
- Modify: `features/diagram/properties/DiagramProperties.tsx`
- Modify: `features/diagram/properties/NodeProperties.tsx`
- Modify: `features/diagram/properties/LineProperties.tsx`
- Modify: `features/diagram/properties/LayerProperties.tsx`
- Modify: `features/diagram/properties/FlowProperties.tsx`

- [ ] **Step 5.1: NodeProperties pattern (apply to all five)**

Read the existing `onUpdate?: (id, Partial<{...}>) => void` signature (e.g. `NodeProperties.tsx:21`). Widen the partial to include `sources: SourceLink[]`. Inside the JSX, near the existing Attachments section, add:

```tsx
<SourcesSection
  sources={node.sources ?? []}
  readOnly={readOnly}
  onChange={(next) => onUpdate?.(id, { sources: next })}
/>
```

For `DiagramProperties` (top-level diagram): the diagram-level update callback may not exist yet — locate by grepping `onUpdateDiagram\|onUpdateDiagramMeta\|setDiagramData`. If absent, add a `onUpdateDiagram?: (updates: Partial<DiagramData>) => void` prop and thread it from the shell (`knowledgeBase.tsx` / `DiagramView`) the same way other diagram updates flow.

- [ ] **Step 5.2: Tests**

For each panel that gains `<SourcesSection>`, add **one** RTL test asserting:
1. The section renders with the entity's sources.
2. Edits propagate to `onUpdate?.(id, { sources: [...] })`.

- [ ] **Step 5.3: Verify + commit**

```bash
npm run test:run -- features/diagram/properties
npm run typecheck
git add -A
git commit -m "feat(sources): SourcesSection wired into Diagram/Node/Line/Layer/Flow Properties"
```

---

## Task 6: Frontmatter parse/emit utility + load/save plumbing

**Files:**
- Create: `src/app/knowledge_base/features/document/utils/frontmatter.ts`
- Create: `src/app/knowledge_base/features/document/utils/frontmatter.test.ts`

> **Why this is a meaty task:** the codebase **strips** frontmatter (`getFirstHeading.ts:24`, `WikiLinkHoverCard.tsx:49`) but no parser exists. We add one here so document `sources` round-trip through the .md file. No new npm dep needed if the YAML shape is constrained — keep it small.

- [ ] **Step 6.1: Define the shape we support**

Constrain the frontmatter to a **flat YAML map** whose values are strings or arrays of objects (`{url, title}`). Reject anything else — those documents pass through untouched (frontmatter preserved verbatim, `sources` reported as undefined).

```ts
export interface ParsedFrontmatter {
  /** Parsed key → value (only `sources` is consumed today, but the map is general). */
  data: Record<string, unknown>;
  /** Raw YAML body between the `---` fences (so we can re-emit verbatim if we don't understand it). */
  rawYaml: string | null;
  /** Document body after the closing `---` fence (or the whole file if no frontmatter). */
  body: string;
}

export function parseFrontmatter(text: string): ParsedFrontmatter;
export function serializeFrontmatter(input: { data: Record<string, unknown>; body: string }): string;
```

`parseFrontmatter` recognises `---\n…\n---\n` at file head; `serializeFrontmatter` emits `---\n<yaml>\n---\n<body>` when `data` is non-empty, otherwise emits `body` verbatim.

For the YAML serializer: only handle the keys we own (`sources` as an array of `{url, title?}`). For all other keys round-trip the raw YAML lines unchanged (preserve them in `rawYaml` and re-emit before our own keys, or merge — implementer's call as long as round-trip is a fixed point).

- [ ] **Step 6.2: Tests**

Round-trip cases (parse → serialize must be a fixed point for all of these):
- File with no frontmatter.
- File with frontmatter that contains only `sources`.
- File with frontmatter that contains `sources` plus an unknown scalar key (e.g. `tags: bar`) — unknown key must survive round-trip.
- File with malformed frontmatter (e.g. unclosed fence) — `parseFrontmatter` returns `data: {}, rawYaml: null, body: <full text>`; `serializeFrontmatter` emits the body unchanged.

Edge cases: empty file, file with body that happens to start with `---` mid-document (must NOT be parsed as frontmatter — only file-leading `---\n` triggers parsing).

- [ ] **Step 6.3: Plumb through `useDocumentContent`**

In `features/document/hooks/useDocumentContent.ts` (locate the load + save points):
- On load: parse the file content; expose `body` (without frontmatter) to the editor and `data.sources` to consumers as `sources: SourceLink[] | undefined`.
- On save: re-serialize body + current `data` (carry-over unknown keys + the `sources` we wrote).
- Expose an `updateSources(next: SourceLink[])` callback that calls the same `setContent` pipeline that handles dirty/save/undo.

**Constraint:** the wiki-link / Tiptap editor must continue to see only the **body** (no frontmatter). Today, `getFirstHeading` and `WikiLinkHoverCard` both strip frontmatter as a precaution — once we handle frontmatter centrally, audit these to either keep their belt-and-suspenders strip OR rely on the parser. Document the decision in the PR description.

- [ ] **Step 6.4: Verify + commit**

```bash
npm run test:run -- features/document/utils/frontmatter
npm run test:run -- features/document/hooks/useDocumentContent
npm run typecheck
git add -A
git commit -m "feat(sources): frontmatter parse/emit + sources round-trip through useDocumentContent"
```

---

## Task 7: Wire `<SourcesSection>` into `DocumentProperties`

**Files:**
- Modify: `features/document/properties/DocumentProperties.tsx`
- Modify: `features/document/DocumentView.tsx` (or wherever `<DocumentProperties>` is mounted — locate via grep)
- Modify: tests for `DocumentProperties.tsx`

- [ ] **Step 7.1: Add props**

```ts
interface DocumentPropertiesProps {
  // … existing
  sources?: SourceLink[];
  onUpdateSources?: (next: SourceLink[]) => void;
}
```

Mount `<SourcesSection>` near the existing layout sections (above or below "History" — pick the position closest to other entity-level metadata).

- [ ] **Step 7.2: Plumb through `DocumentView`**

`DocumentView` reads `sources` from `useDocumentContent` (Task 6.3) and passes `onUpdateSources={updateSources}` to `<DocumentProperties>`.

- [ ] **Step 7.3: Test**

A single RTL test: render `<DocumentProperties sources={[{ url: "https://x.com" }]} onUpdateSources={fn} />`, assert the section renders, simulate Add → assert `onUpdateSources` called with the expected array.

- [ ] **Step 7.4: Verify + commit**

```bash
npm run test:run -- features/document
npm run typecheck
git add -A
git commit -m "feat(sources): SourcesSection wired into DocumentProperties"
```

---

## Task 8: `Features.md` + `test-cases`

- [ ] **Step 8.1: Features.md**

Add bullets under §3 (Diagram entities) and §4 (Document):
- §3.x: "Sources — every diagram entity (top-level, node, connection, layer, flow) carries an optional `sources?: SourceLink[]` editable in its Properties panel; round-trips through diagram JSON. (`shared/types/sources.ts`, `shared/components/SourcesSection.tsx`, `shared/utils/persistence.ts`)"
- §4.x: "Sources — documents carry an optional `sources?: SourceLink[]` persisted in YAML frontmatter; editable in DocumentProperties. (`features/document/utils/frontmatter.ts`, `features/document/properties/DocumentProperties.tsx`)"

Promote any `?` to `✅` once tests are green.

- [ ] **Step 8.2: test-cases**

Add new IDs (use the next free number per file's existing numbering — never renumber). Suggested skeleton:

```
SRC-3.1-NN ❌: DiagramData top-level sources round-trip through save/load.
SRC-3.5-NN ❌: NodeData sources round-trip through serializeNodes/loadDiagramFromData.
SRC-3.10-NN ❌: FlowDef sources round-trip.
SRC-3.13-NN ❌: SourcesSection in NodeProperties supports add/edit/remove.
SRC-3.13-NN ❌: SourcesSection rejects invalid URLs on blur.
SRC-3.13-NN ❌: SourcesSection in read-only hides Add and Remove.
SRC-4.x-NN ❌: DocumentMeta sources round-trip via frontmatter.
SRC-4.x-NN ❌: Frontmatter unknown keys round-trip unchanged when sources are edited.
```

Flip status markers to ✅ as the corresponding tests land. Cross-reference test names with the IDs.

- [ ] **Step 8.3: Verify + commit + push**

```bash
npm run typecheck
npm run test:run
npm run build
git add Features.md test-cases/
git commit -m "docs(sources): Features.md + test-cases for source links MVP-4a"
git push -u origin feat/diagram-mvp4a-source-links
```

- [ ] **Step 8.4: PR**

```bash
gh pr create --title "feat(sources): Source Links MVP-4a — sources on diagram entities + document"
```

PR body summary points: SourceLink type + diagram entity persistence + frontmatter for documents + SourcesSection UI in 6 panels (Diagram/Node/Line/Layer/Flow + Document); SVG/Tab deferred to MVP-4b (unified with the SVG/Tab attachment-persistence deferral); empty list valid; http(s) only.

---

## Self-review

1. **Spec coverage** — §9 covered for diagram entities + document. SVG + Tab consciously deferred to MVP-4b with a unified blocker (SVG/Tab metadata-persistence design slice).
2. **Type drift handled** — `DiagramData` is in `shared/utils/types.ts`, not `features/diagram/types.ts` (same MVP-2a observation). Acknowledged in File Map.
3. **Empty-list valid** — UI shows "No sources recorded." in read-only, "No sources recorded — add one below." in edit; persistence omits the field when empty.
4. **Read-only handling** — `SourcesSection` hides Add and Remove; URL `Open` link still works.
5. **Frontmatter is real new infra** — Task 6 acknowledges no parser exists today; YAML shape is constrained to what we own; unknown keys round-trip; non-leading `---` doesn't trigger parsing.
6. **No worktrees, branch already created** — `feat/diagram-mvp4a-source-links` (renamed from `feat/diagram-mvp4-source-links` so the branch matches the MVP-2a/2b precedent). `main` is protected; PR-only merge.
7. **No skill enforcement here** — the spec's "mandatory at generation time" rule is MVP 5's concern. This plan ships the data + UX so manual entry works today.
