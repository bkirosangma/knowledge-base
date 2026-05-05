# Diagram Flow Enhancements — Design

**Date:** 2026-05-05
**Status:** Draft (post-brainstorm)
**Scope:** Diagram feature (`src/app/knowledge_base/features/diagram/`), workspace-scoped attachment-links store, wiki-link extension and link index, knowledge-base skill (`~/.claude/skills/knowledge-base/`).

---

## 1. Goals

Make flows in the diagram editor explicitly authored rather than graph-derived, give them visible traversal order, support cross-entity drill-down attachments, and update the knowledge-base skill so generated diagrams and flow documents take advantage of the new model.

Eight discrete goals from the original ask:

1. Per-flow node order numbers, displayed on the canvas.
2. Manually authored start and end nodes per flow (replace today's `from`-only / `to`-only graph heuristic).
3. Multiple start and multiple end nodes per flow.
4. Multiple nodes may share the same order number (parallel steps).
5. Order numbers act as the recommended traversal order in roadmap-style archetypes.
6. Richer, multi-document flow descriptions explaining what is happening, why connections are grouped, and how they work — replacing the current 3–5 sentence + auto-table doc.
7. Any vault entity type (document, diagram, SVG, tab) attachable to any diagram element, with a "drill in" preview UX.
8. Knowledge-base skill updated so generation, edit, validate, and transform sub-commands honour the new model.

## 2. Non-goals

- Real, embedded inline rendering of attached diagrams inside a node (rejected during brainstorm — perf and layout cost too high; modal-based drill-in chosen instead).
- Auto-migration of existing flows. Existing flows that rely on today's `computeFlowRoles` heuristic render with no start/end and no order until an author edits them. The brainstorm explicitly rejected one-shot heuristic-baking.
- Strict validation of completeness. Order numbers and start/end are author-discretion clarity aids, not required structure. The validator does **not** flag missing values.
- Per-step flow documents. The skill writes one rich primary doc per flow, plus optional sibling extension docs only when a subtopic genuinely warrants its own document.
- Persistence of lock-into-flow mode. It is a session-only editing posture.
- Membership editing while locked. Lock mode focuses ordering; adding a non-member to the flow still goes through the existing membership path.

## 3. User stories

- As an architect documenting an authentication flow, I number the steps `1, 2, 3` so a reader can follow them without inferring from layout.
- As a roadmap author, I mark several "Foundations" topics as starts and several "Mastery" topics as ends so a learner sees multiple valid entry and exit points.
- As an author refining ordering for a 30-node flow, I lock the flow, dim the rest of the diagram, and click each member to bump its order without losing my place.
- As a reader exploring an architecture diagram, I see a small attachment indicator on a node, click it, and read the linked deep-dive document inside a modal without leaving the canvas.
- As a vault owner, I link from a node in one diagram to another full diagram so the second diagram is a "drill in" view of the first node's internals.

## 4. Data model

### 4.1 `FlowDef` extension (`features/diagram/types.ts`)

```ts
export interface FlowDef {
  id: string;
  name: string;
  connectionIds: string[];
  category?: string;

  /** Optional per-node order in this flow. Absent = no badge. Multiple nodes may share a number. */
  nodeOrders?: Record<string /* nodeId */, number>;

  /** Optional manually authored start node IDs. Absent or empty = nothing rendered as start. */
  startNodeIds?: string[];

  /** Optional manually authored end node IDs. */
  endNodeIds?: string[];
}
```

Three additive optional fields. Existing files load unchanged.

Persistence (`shared/utils/persistence.ts` `serializeFlows` / `deserializeFlows`): pass-through for the three fields. No backwards-compat shim — older clients that don't read them just ignore.

Invariants enforced at the editing layer (not the schema):
- Every `nodeOrders` key must reference a node that is endpoint-reachable from at least one connection in `connectionIds` (a flow member).
- Every `startNodeIds` / `endNodeIds` entry must be a flow member.
- Order values are integers. Negative values are allowed but discouraged. Decimals are not supported (deterministic display).

### 4.2 Workspace attachment-links store widening

Today the workspace-scoped attachment-links store (§7.1) records `.md` documents attached to diagram entities. The store is the source of truth for the on-canvas `DocInfoBadge`, the properties-panel "Attachments" section, and the `useDocumentAttachments` hook.

The store widens to record any source entity type:

```ts
type AttachmentSourceType = 'document' | 'diagram' | 'svg' | 'tab';
type AttachmentTargetType = 'node' | 'connection' | 'flow';

interface AttachmentRecord {
  source: { type: AttachmentSourceType; path: string };
  target: { type: AttachmentTargetType; diagramPath: string; entityId: string };
}
```

The store remains workspace-scoped (one JSON sidecar at the workspace root). Loaders for each entity type call into the store with their own path on open, so backlinks surface correctly regardless of which side opens first.

### 4.3 Link index — header-anchor tracking

The wiki-link link index (`shared/utils/linkIndex.ts`) currently maps `documentPath → outboundWikiLinks[]`. To support `[[doc.md#header]]` anchors and rename refactoring, each outbound link record gains an optional `anchor?: string` field, and the index gains a per-document `headers: { id: string; text: string; level: 1|2|3|4|5|6 }[]` map populated on parse.

The link-update hook (`useLinkUpdates`) already handles document rename. It extends to handle header rename: when a document's parsed headers diff against the previous headers and a single removal+addition pair has identical content, it is treated as a rename and all referencing wiki-links are auto-updated. Multi-rename or genuine deletion surfaces a banner.

## 5. UX — flow ordering and start/end

### 5.1 Visual treatment on the canvas

When a flow is *focused* (selected in FlowProperties) or *locked*:

- **Order badge** — a 22 px blue solid circle on the top-left corner of each member node carrying a number from `nodeOrders[nodeId]`. White centred numeral, bold. Absent for nodes without an order entry.
- **Start nodes** — existing green glow border (today's behaviour, sourced from `startNodeIds` instead of `from`-only heuristic) plus the existing green "Start" text pill above the node (KB-032's WCAG 1.4.1 fix).
- **End nodes** — existing red glow border + red "End" text pill above the node.
- A node may simultaneously carry an order badge and a start/end pill; the layout supports both (corner badge + pill above are spatially distinct).
- Condition nodes use the same badge + pill treatment, anchored to the diamond's bounding box.

When no flow is focused and the diagram is not locked, no order badges or start/end pills render.

### 5.2 In-canvas editing (lock + edit only)

In lock-into-flow mode, with the diagram in edit mode (read-only off):

- Order badge for member nodes becomes interactive: click → opens an inline numeric input in the same position, focused, with the current value selected. Enter or blur commits; Escape cancels. The dashed-border treatment from the brainstorm mockup distinguishes editable from read-only badge state.
- An empty order badge appears on every member node (no number, dashed border) so the author can stamp a value with one click.
- Start / End pills become click-toggleable when the flow is locked + edit. Clicking the area where a pill would appear (a small affordance above the node in lock+edit) cycles `none → start → end → none`.

No editing affordance appears on non-member (dimmed) nodes. Adding a node to a flow's membership remains a separate operation through the existing connection-based path.

### 5.3 FlowProperties panel

`features/diagram/properties/FlowProperties.tsx` grows three sub-sections (collapsible, in this order after the existing Name / Category fields):

1. **Member nodes** — list of nodes reachable from `connectionIds`, sorted by current order then label. Each row: node label, an editable numeric input for `nodeOrders[id]`, and two checkboxes for "Start" and "End" (binding to membership in `startNodeIds`/`endNodeIds`). A "Number sequentially" button stamps `1..n` in current sort order.
2. **Lock control** — a "Lock into Flow" button (toggle, visible only when not locked) and a keyboard shortcut hint.
3. **Existing fields** — connections, document attachments, delete (unchanged).

NodeProperties stays read-only on these fields. The existing "Member flows" line under NodeProperties grows a per-flow row showing the node's order in that flow (read-only). No editing surface there.

### 5.4 Lock-into-Flow mode

Triggered from FlowProperties or `Cmd/Ctrl+L` while a flow is selected. Stored in `DiagramInteractionContext` as `lockedFlowId: string | null` (session-only, never persisted).

When `lockedFlowId !== null`:

- A **lock banner** appears top-right of the canvas: "🔒 <flow name> [Unlock]". Unlock returns to normal.
- All non-member nodes and connections render with `flowDimSets` treatment (existing dim styling) plus `pointer-events: none`. Hover does nothing; click does nothing.
- Canvas-empty click does **not** deselect the flow. The flow stays selected; only Unlock or selecting a different flow exits lock mode.
- The properties panel renders as a vertical stack: `<FlowProperties>` always at the top, plus `<ElementProperties for current selection>` stacked below when a member node / connection / layer is selected. Each section keeps its own collapse state.
- Selecting a non-member is suppressed by `pointer-events: none`, so the secondary-selection slot only ever holds members.
- Quick Inspector (the floating pill toolbar) is suppressed in lock mode — its actions don't fit the focused-editing workflow and would compete with the in-canvas order edit affordance.
- Read-only diagrams may still enter lock mode (for reading), but the order-edit and start/end-toggle affordances do not appear.

State transitions:
- Entering lock: existing flow selection becomes the locked flow. If lock entered with no flow selected, the action is a no-op.
- Selecting a *different* flow while locked: switch the locked flow to the new selection.
- Switching files: lock mode clears.
- Toggling read-only: lock mode persists; editing affordances appear/disappear accordingly.

### 5.5 Re-using existing infrastructure

- `useDiagramFlowFocus.ts` already produces a `flowOrderData: Map<nodeId, { role }>` and `flowDimSets`. The hook gains `flowOrderData[nodeId].order: number | undefined` and changes `role` derivation to read `startNodeIds` / `endNodeIds` instead of running `computeFlowRoles`. `computeFlowRoles` itself becomes dead code and is removed.
- The FlowDots component (animated dots along connection paths) already handles flow membership; no change needed.

## 6. UX — cross-entity attachment

### 6.1 Attach surface (properties panel)

The existing `CreateAttachDocModal` and `DocumentsSection` rename to `CreateAttachEntityModal` and `AttachmentsSection`. The picker:

- Opens with a type filter: `Document | Diagram | SVG | Tab` (default `Document` to match existing behaviour).
- Lists vault entities of the chosen type, with the existing search / autocomplete affordance.
- "Create & attach new …" creates a blank entity of the selected type at a vault-default location and attaches.
- Detach with optional cascade delete works for every type.

`AttachmentsSection` renders a single grouped list (group headers per source type) instead of a flat docs list. Existing wiki-link backlinks remain a separate section.

### 6.2 On-canvas attachment indicator

`features/diagram/components/DocInfoBadge.tsx` becomes `features/diagram/components/AttachmentIndicator.tsx`.

- Rendered only on nodes (not connections — too small) and only when at least one attachment of any type exists.
- Anchored bottom-right of the node's bounding box.
- Renders a stacked glyph row, one glyph per source type present (no count): `📄` document, `◇` diagram, `🎨` svg, `🎸` tab. (Final glyph choices subject to icon-registry constraints; if Lucide icons are required, the registry adds `FileText`, `Network`, `Music`, `Image` for the four types.)
- Click → opens the unified attachment preview modal (§6.3). Pointer-events disabled when the diagram is dimmed by lock mode and the parent node is not a member.

Connections, layers, and flows do not carry an on-canvas attachment indicator (no spatial budget on connections, redundant on layers/flows). Their attachments surface through the properties panel's AttachmentsSection only.

### 6.3 Unified attachment preview modal

`features/diagram/components/DocPreviewModal.tsx` becomes `features/diagram/components/AttachmentPreviewModal.tsx`.

Modal layout:

- **Left rail (250 px)**: list of attachments grouped by source type (Documents → Diagrams → SVG → Tabs). Each row: type icon, filename, optional entity-name badge.
- **Body**: read-only render of the currently selected attachment.
  - Document → existing `markdownToHtml` + sanitizer pipeline (current behaviour).
  - Diagram → embedded `DiagramView` with `readOnly: true`, fit-to-content, no panels, no minimap (compact preview).
  - SVG → `<img>` with the SVG as data URL, or inline `<object>` for interactive SVGs.
  - Tab → `GuitarTabsViewer` with `readOnly: true` and playback enabled.
- **Header**: filename, "Read only" chip, "Open in pane" button (opens current attachment in the other pane and closes modal), close ✕.
- Wiki-link click inside a document attachment forwards to `onOpenInPane(targetPath)` (existing behaviour); the targeted file becomes the current attachment if it is in the attachment list, otherwise falls through to "Open in pane".

Backwards-compatible: if a node has only document attachments, the modal opens directly to the first document and renders identically to today's `DocPreviewModal`. The left rail can collapse when there is only one item.

### 6.4 Attachment store hooks

`useDocumentAttachments` becomes `useEntityAttachments(entityType, path)`. It accepts any source-entity type and returns attachments where this entity is either the source or the target. The same hook backs the AttachmentsSection in DiagramProperties / FlowProperties / NodeProperties / DocumentProperties / SvgProperties / TabProperties.

`useDeletion` (existing diagram-side cleanup) extends to `useAttachmentCleanup`: when any entity is deleted (file rename / file delete), every attachment record where that entity is source or target is cleaned up.

## 7. Wiki-link header anchors and refactoring

### 7.1 Anchor parsing

The wiki-link Tiptap extension (`features/document/extensions/wikiLinks.ts`) already supports `[[file.md]]` and `[[file.md|alias]]`. Anchor support adds:

- Parse `[[file.md#header text]]` and `[[file.md#header text|alias]]`. The anchor is the text after `#`, slugified to a stable id (`title-case → kebab-case` + de-accent).
- The rendered `<a class="wiki-link" data-wiki-link="file.md" data-wiki-section="header-text">` mirrors today's structure.

### 7.2 Scroll-to-anchor on open

`MarkdownPane` already loads a target document when `onOpenInPane(path)` fires. It grows a second optional argument: `onOpenInPane(path: string, anchor?: string | null)`. When `anchor` is non-null, after content renders the pane scrolls the heading with matching id into view (using `ProseMirror`'s document model to find the heading node by slug, then `view.dom.querySelector` + `scrollIntoView({ block: 'start' })`).

The DocPreviewModal wiki-link click handler and the AttachmentPreviewModal wiki-link click handler both pass `data-wiki-section` through.

### 7.3 Copy-link affordance

Each `<h1..h6>` rendered by the Tiptap editor in non-edit mode (read-only or hover in edit) gets a small "🔗" icon that appears on hover. Click copies `[[<currentDocFilename>#<header-slug>]]` to the clipboard via `navigator.clipboard.writeText`. A toast confirms ("Link copied"). In edit mode, the same icon appears on heading hover but copies the editable link form.

### 7.4 Anchor refactoring

The existing link index already handles file rename refactoring. Anchor refactoring extends it:

- Each indexed document carries a `headers: { id, text, level }[]` array.
- On document save, the new `headers` array is diffed against the indexed one.
  - **Pure rename** — text changed, level identical: rename if exactly one removal + one addition match. Level-only change with identical text is also a rename. Auto-update every `data-wiki-section` reference in every document that wiki-links into this file. The change is part of the link-updates batch and undoable.
  - **Ambiguous diff** — multiple removals and multiple additions in the same save (no clear pairing): treat each removal as removal and each addition as addition; surface the broken-anchor banner.
  - **Removal** — header gone with no rename match: surface a "Broken anchor links" banner listing every referencing document. The author can choose "Remove anchors" (drop `#section` from each reference) or "Leave broken" (keep them; renders as plain text wiki-link).
  - **Addition only** — no action needed.

The diff and refactor pipeline rides on the existing link-update infrastructure (`useLinkUpdates`); no new persistence layer.

## 8. Richer flow descriptions

### 8.1 Document structure

Per flow, the skill writes one rich primary document and optional sibling extension documents:

- **Primary**: `flow-descriptions/<flow-id>.md`. A rich, self-contained document of typically 1500–3000 words covering, in whatever order suits the topic: an overview, what happens through the nodes, why this grouping makes sense, how connections work (with rationale for non-trivial edges), and edge cases. Includes wiki-link cross-references to related diagrams, related flows, and related documents elsewhere in the vault.
- **Extensions**: `flow-descriptions/<flow-id>/<subtopic-slug>.md`. Generated only when a subtopic genuinely warrants its own document (history of a protocol, deep dive into an algorithm, comparison with adjacent flows, etc.). Each extension is itself a self-contained document, wiki-linked from the primary at the relevant section.
- **Cross-linking**: primary → extensions via wiki-links with anchors to the extension's intro section. Extensions → primary via the existing backlinks dropdown (no explicit link required).
- **Diagram registration**: only the primary doc registers in the diagram JSON's `documents[]`. Extensions are reachable via the link graph.

### 8.2 Skill generation policy

- **Default (non-interactive)**: generate the primary doc. Generate extensions only when the skill judges, while drafting the primary, that one or more outline sections are deep enough to stand alone as their own document and dilute the primary if kept inline. Conservative bias — when in doubt, keep the content inline rather than spawn a sibling.
- **Interactive (`-i`)**: after drafting the primary doc, the skill identifies candidate subtopics (one per outline section that grew past a threshold of complexity) and asks the user whether to extract each into an extension. User picks; skill writes only those.
- **Truly deeper dives are out of scope**: if a candidate subtopic is itself a multi-flow concept, the skill suggests starting a new `/kb document` or `/kb create` session and stops there.

### 8.3 Step 3e replacement in `commands/diagram.md`

The existing Step 3e ("Flow Explanation Documents" — 3–5 sentence + auto-table) is replaced by a new Step 3e structured as:

1. For each flow, draft a rich primary doc covering what / why / how at appropriate depth (skill prompt template provided in the command file). Aim for 1500–3000 words; do not pad.
2. Embed the auto-generated tables (still produced by `kb_flow_tables.py`) as an appendix or inline reference, not as the body.
3. Identify candidate extensions per §8.2; in `-i` mode prompt; write each chosen extension as a self-contained document.
4. Wiki-link primary → extensions at the relevant sections.
5. Register each primary doc in the diagram's `documents[]` (one entry per flow). Extensions are not registered.

### 8.4 Skill emits the new flow fields

`commands/diagram.md` Step 3a gains:

- For each flow, decide on `nodeOrders` (a sequential `1..n` numbering when the archetype is order-sensitive, e.g. roadmaps; absent for purely topological architectures unless the topic implies order).
- For each flow, decide on `startNodeIds` and `endNodeIds`. Roadmaps → all "Foundations" nodes as starts, all "Mastery" nodes as ends. Architecture → the request-entry and response-exit nodes. Skill emits the JSON; the result is editable later.

## 9. Knowledge-base skill changes — full scope

| File | Change |
|---|---|
| `commands/diagram.md` | §8.3 (Step 3e replacement) + §8.4 (emit new fields). |
| `commands/edit.md` | Teach `nodeOrders` / `startNodeIds` / `endNodeIds` placement rules. Teach widened `attachedTo` source types. |
| `commands/validate.md` | Validate `nodeOrders` keys are flow members; validate `startNodeIds` / `endNodeIds` are flow members. Validate widened `attachedTo`. **Do not** flag empty values as errors. |
| `commands/transform.md` | Idempotent — never auto-populates the new fields. Only normalises shape (ensures fields are absent rather than `null` if the source had `null`). |
| `archetypes/roadmaps.md` | Add canonical example showing order numbers for traversal sequence and multi-start / multi-end for choose-your-path roadmaps. Add guidance on when to use shared order numbers (parallel topics). |
| `archetypes/software-architecture.md` | Brief example: `flow-login` with order 1..6, `startNodeIds: [el-browser]`, `endNodeIds: [el-session-db]`. |
| `archetypes/_archetype-template.md` | New section: "Ordering conventions" — what makes the archetype's flows ordered or unordered, what start / end means in this domain. |

## 10. Migration and backwards compatibility

- **Diagram files**: new fields are additive optional. Existing diagrams load and save without change. Authors who don't touch the new UI never see the new badges.
- **Attachment store**: the JSON shape gains a `source.type` field; existing entries (which are all documents) get a default `source: { type: 'document', path: <existing-path> }` on first load. The migration runs in-memory at load time and is persisted on the next save.
- **Skill outputs**: previously generated diagrams are not retroactively rewritten. New diagrams generated post-change use the new model.
- **Test cases**: previously-recorded DIAG-3.10-* cases that asserted the auto-derived start/end glow remain valid for *empty* flows but the assertion now is "no glow when no manual start/end" instead of "glow on graph sources". Test bodies update; IDs preserved.

## 11. Test cases (additions to `test-cases/03-diagram.md`)

Numbering continues from existing IDs in §3.10 / §3.18. Sample shape:

- DIAG-3.10-NN: FlowDef with nodeOrders renders blue corner numeral on each member with a value.
- DIAG-3.10-NN: nodeOrders may share a value across multiple nodes; both render the same numeral.
- DIAG-3.10-NN: startNodeIds renders green glow + "Start" pill on every listed node.
- DIAG-3.10-NN: endNodeIds same, red.
- DIAG-3.10-NN: empty start/end → no glow, no pill.
- DIAG-3.10-NN: lock-into-flow dims non-members and disables their pointer events.
- DIAG-3.10-NN: lock + canvas click does not deselect.
- DIAG-3.10-NN: lock + member click stacks ElementProperties below FlowProperties.
- DIAG-3.10-NN: lock + edit + click on order badge opens inline editor; Enter commits.
- DIAG-3.10-NN: Cmd/Ctrl+L toggles lock mode.
- DIAG-3.10-NN: file switch clears lock state.

For attachments (§3.18 → renamed §3.18 Cross-Entity Attachment):
- DIAG-3.18-NN: attaching a diagram, svg, or tab to a node persists in the attachment store.
- DIAG-3.18-NN: AttachmentIndicator renders a glyph stack with one glyph per source type present.
- DIAG-3.18-NN: clicking the indicator opens AttachmentPreviewModal grouped by type.
- DIAG-3.18-NN: modal renders each entity type read-only correctly (doc / diagram / svg / tab).
- DIAG-3.18-NN: "Open in pane" closes the modal and opens the file.
- DIAG-3.18-NN: deleting an attached entity removes the attachment record everywhere it appears.

For wiki-link anchors (under §4.x Document Editor):
- DOC-NN-NN: `[[doc.md#header]]` parses and renders with `data-wiki-section`.
- DOC-NN-NN: clicking such a link in a doc scrolls the target heading into view in MarkdownPane.
- DOC-NN-NN: clicking such a link in DocPreviewModal / AttachmentPreviewModal forwards to onOpenInPane with the anchor.
- DOC-NN-NN: header rename triggers refactoring of every referencing wiki-link in the vault.
- DOC-NN-NN: header delete surfaces broken-anchor banner with "Remove anchors" / "Leave broken".
- DOC-NN-NN: heading hover in editor reveals copy-link icon; click copies wiki-link with anchor; toast confirms.

## 12. Out of scope / future work

- Embedded inline diagram preview (rejected; modal-driven instead).
- Per-step flow documents (rejected; primary + optional extensions).
- Order numbers on connections (rejected; nodes only).
- Heuristic fallback when start/end are empty (rejected; explicit-only).
- Lock mode persistence across sessions (rejected; session-only).
- Decimal order numbers / fractional re-ranking (rejected; integers only).
- Membership editing inside lock mode (rejected; stays a separate operation).
- Quick Inspector grows an "Order" field outside lock mode (deferred; only in-canvas badge in lock+edit for v1).

## 13. Implementation slices (to be expanded in the implementation plan)

The work decomposes into independently-shippable slices. Suggested order, smallest blast radius first:

1. **Data-model extension** — add `nodeOrders` / `startNodeIds` / `endNodeIds` to `FlowDef`, persist round-trip, no UI yet. Tests: serialization round-trip.
2. **Read-only rendering** — wire `useDiagramFlowFocus` to read manual fields; render order badge + glow + pill from manual data. `computeFlowRoles` removed in this slice. Tests: badge rendering, role rendering, no-data fallthrough.
3. **FlowProperties editing** — Member nodes section, Number sequentially button, start/end checkboxes. Tests: edit round-trip, dirty marking, undo/redo.
4. **Lock-into-Flow mode** — interaction context state, dim treatment, panel stack, banner, keyboard shortcut. Tests: state transitions, dim coverage, panel layout.
5. **In-canvas order edit** — editable badge in lock+edit, click toggle for start/end. Tests: input behaviour, commit/cancel, role toggle.
6. **Attachment store widening** — schema migration on load, source-type field, hooks renamed. Tests: round-trip, in-memory migration.
7. **AttachmentsSection + Modal** — widened picker, AttachmentIndicator, AttachmentPreviewModal with read-only renderers per type. Tests: per-type render, "Open in pane", delete cascade.
8. **Wiki-link anchors** — parse/render anchors, scroll-to-anchor on open, copy-link affordance. Tests: parse, render, scroll, copy.
9. **Anchor refactoring** — header diff, auto-rename, broken-anchor banner. Tests: rename refactor, delete warning.
10. **Knowledge-base skill — Step 3e replacement** — rich primary doc generation, conservative extensions, interactive prompts. Tests: skill self-tests / fixture diagrams.
11. **Knowledge-base skill — schema awareness** — edit.md / validate.md / transform.md / archetypes updated. Tests: validate fixtures.

Each slice ships behind a feature flag is **not** required — the data model is additive and renderers fall through to "render nothing" until the field is populated. Slices 1–5 form a coherent flow-ordering MVP; 6–7 are the cross-entity attachment MVP; 8–9 are the anchor MVP; 10–11 are the skill MVP. PRs should bundle by MVP, not by slice.

## 14. Open questions deferred to plan

- Exact glyph choices for the on-canvas attachment indicator (placeholder unicode chosen above; final may need icon-registry additions).
- Whether the link index's header parser uses the existing markdown parser or a lightweight regex (perf vs precision).
- Whether the AttachmentPreviewModal's left rail is always shown or only when more than one attachment is present.

These do not block the spec; they will be answered during implementation planning.
