# MVP-2 SVG Attachments + Diagram Wiki-Link Backlinks

**Status:** Design approved 2026-05-07. Ready for plan.
**Predecessors:** MVP-2a (PR #128, data-model + persistence) + MVP-2b (PR #129, document-side UI for diagrams + tabs) + MVP-4b (PR #145, SVG/Tab metadata persistence + source links).
**Handoff context:** `docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md` — "MVP-2 SVG + Tab attachment branches stays deferred" (Tab already shipped via TAB-007a; this MVP closes the SVG side and folds in a related diagram polish).

## 1. Goal

Two related slices in one MVP:

1. **SVG attachments.** Bring SVG files to parity with diagrams and tabs — let users attach documents to a `.svg`, detach them, and see incoming wiki-link backlinks alongside explicit attachments. UI lives in `SvgProperties`.
2. **Diagram wiki-link backlinks.** Diagrams currently show only explicit `attachedTo` rows in their root-level reference list. Tab merges in `[[diagram.json]]`-style backlinks; this MVP adds the same merge to diagrams.

Behind both slices: extract two shared UI primitives (`<ReferenceRow>` and `<FileLevelReferencesGroup>`) so Tab, SVG, and Diagram (root scope) stop reimplementing the same thing.

## 2. Scope

### In scope

- New `"svg"` value on the `EntityType` (and `AttachedToScope`) union — whole-file only.
- File-level attachments UI in `SvgProperties` — attach, detach, cascade-detach modal, wiki-link-backlinks merge.
- Path-rewrite + delete-propagation for `"svg"` rows in `attachmentLinks.json`.
- Diagram root-scope reference list now merges wiki-link backlinks with explicit attachments.
- Two extracted shared components: `<ReferenceRow>` (row primitive used by Diagrams, Tab, SVG) and `<FileLevelReferencesGroup>` (file-scope container used by Tab + SVG).
- Tests: domain, repo, file matcher, rename, delete, UI for both slices.

### Out of scope (deliberate)

- Per-shape SVG attachments (`"svg-shape"` scope). Real cost — would require minting + persisting stable IDs on every SVG element through `@svgedit/svgcanvas`. Defer until user demand surfaces; the type union is open enough that adding the scope later is purely additive.
- Sidecar-based attachment storage. The forward-compat `attachedTo?` field in `<file>.svg.refs.json` and v3 `.alphatex.refs.json` stays unused; a comment in both domain types makes that explicit so a future reader doesn't think it's load-bearing. Canonical store stays the workspace flat file.
- Generalising the diagram `AttachmentsSection` to consume `<FileLevelReferencesGroup>`. Diagrams have a multi-bucket surface (docs + diagrams + svgs) that doesn't downgrade cleanly; they reuse only the row primitive.

## 3. Architecture

### 3.1 EntityType extension

```ts
// src/app/knowledge_base/domain/attachmentLinks.ts
export type EntityType =
  | "root" | "node" | "connection" | "flow" | "type"
  | "tab" | "tab-section" | "tab-track"
  | "svg";   // new — whole-file only
```

Mirror the same addition in `src/app/knowledge_base/shared/types/attachments.ts` `AttachedToScope`.

`entityId` for `"svg"` rows is the vault-relative SVG path (e.g. `"diagrams/logo.svg"`), matching the convention `"tab"` already uses.

### 3.2 Shared UI primitives

Two new components in `src/app/knowledge_base/shared/components/`:

**`<ReferenceRow>`** — pure leaf, no I/O. Renders one row of an attachment list:

```ts
interface ReferenceRowProps {
  filePath: string;
  label: string;
  fileKind: "document" | "diagram" | "svg" | "tab";
  source: "attached" | "wiki-link";   // controls icon + tooltip
  readOnly?: boolean;
  onPreview?: () => void;
  onDetach?: () => void;              // hidden when source === "wiki-link" or readOnly
}
```

Replaces inline row markup in `AttachmentsSection.tsx` (diagrams), `TabReferencesList.tsx` (tabs), and the new SVG attachments list. Visual contract preserved — this is a refactor, not a redesign.

**`<FileLevelReferencesGroup>`** — file-scope container that merges explicit `attachedTo` rows with wiki-link backlinks for one file:

```ts
interface FileLevelReferencesGroupProps {
  filePath: string;
  fileKind: "tab" | "svg";   // diagrams keep their multi-bucket UI
  entityType: "tab" | "svg"; // EntityType for the attachmentLinks query
  attachedRows: AttachmentLink[];   // pre-filtered for this file
  backlinks: WikiLinkBacklink[];    // pre-filtered for this file
  documents: DocumentMeta[];
  readOnly?: boolean;
  onPreview?: (path: string) => void;
  onDetach?: (path: string) => void;
  onAttach?: () => void;            // opens DocumentPicker
}
```

Internal: merges `attachedRows` and `backlinks`, de-dupes by `docPath` (attachment wins), preserves caller-supplied insertion order (attachments first, then unique backlinks), renders one `<ReferenceRow>` per item, plus a "+ Attach document" affordance at the bottom (hidden when `readOnly` or `onAttach` is undefined). Sort order is the caller's responsibility; the existing `TabReferencesList` behaviour (no internal sort) is preserved.

`TabProperties.tsx` migrates to consume `<FileLevelReferencesGroup>` for its file-level group, replacing the existing inline merge logic. No behaviour change for tabs.

### 3.3 SvgProperties UI

`src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` gains a new section above the existing Sources block:

```tsx
<section>
  <h3>References</h3>
  <FileLevelReferencesGroup
    filePath={filePath}
    fileKind="svg"
    entityType="svg"
    attachedRows={…filtered from attachmentLinks…}
    backlinks={…filtered from linkIndex…}
    documents={…}
    readOnly={readOnly}
    onPreview={…opens doc in opposite pane…}
    onDetach={…calls attachmentLinks.write to remove the row…}
    onAttach={…opens DocumentPicker(entityType: "svg", entityId: filePath)…}
  />
</section>
```

Body still gates on `filePath !== null` (no file open → no references list).

### 3.4 DocumentPicker integration

Existing `DocumentPicker` already accepts `(entityType, entityId)`. SVG just calls it with `entityType: "svg"`. The picker's create-and-attach flow needs a one-line addition to write the new row through `attachmentLinks.write` — same pattern as the existing tab/diagram entries. No new picker shape.

### 3.5 Cascade-detach

Existing `DetachDocModal` handles "detach this doc; if it has no other attachments, also delete the doc?". Mount it from `<FileLevelReferencesGroup>` on detach. SVG inherits the behaviour for free.

### 3.6 Diagram wiki-link backlinks merge

The diagram root-level reference list lives in `DiagramProperties.tsx` (or is rendered via `AttachmentsSection.tsx` configured for the root scope — locate exact site at plan time). Today it only consumes explicit `attachedTo` rows. We extend it to also consume the same `WikiLinkBacklink[]` for the diagram's path that Tab already consumes, merging via the same de-dupe rule (attachment wins).

This applies **only at the root scope**. Per-node / per-flow / per-layer wiki-link merging is out of scope — node IDs aren't stable wiki-link targets.

The merge logic is small (~10 lines) and lives in a tiny shared helper `mergeAttachmentsWithBacklinks(rows, backlinks): MergedReference[]` so Tab, SVG, and Diagram-root all use the exact same de-dupe.

### 3.7 File operations

**SVG rename / move.** When a `.svg` is renamed, rows in `attachmentLinks.json` whose `entityType === "svg"` and `entityId === oldPath` need rewriting to `newPath`. The existing rename pipeline (locate exact call site at plan time — likely `useFileExplorer` rename + a hook into `attachmentLinks.write`) already does this for `"tab"` whole-file rows. Extend the same matcher to also match `"svg"`.

**SVG delete.** New `svgFileMatcher(svgPath): (row) => boolean` parallel to the existing `tabFileMatcher`, checks `entityType === "svg" && entityId === svgPath`. Wired into the file-tree delete propagation alongside the tab matcher in `fileTreeMatchers.ts`.

**No `migrateAttachments` involvement.** That hook only handles intra-file ID rewrites for `tab-section` / `tab-track`. Whole-file `"svg"` and `"tab"` rows have no ID-rewrite story.

### 3.8 Sidecar `attachedTo?` field — explicitly unused

Add a one-line comment to both `domain/svgRefs.ts` and `domain/tabRefs.ts` clarifying that the `attachedTo?` field is forward-compat only — the canonical attachment store is `attachmentLinks.json`, and writing to the sidecar would create a divergent second source of truth. The field stays in the type unions because it was promised in MVP-4b and downstream tools may already round-trip it.

## 4. Data flow

### Attach a doc to an SVG

```
SvgProperties → FileLevelReferencesGroup.onAttach
  → DocumentPicker(entityType: "svg", entityId: svgPath)
  → user picks doc D
  → attachmentLinks.write([...rows, { docPath: D, entityType: "svg", entityId: svgPath }])
  → linkIndex re-emits → SvgProperties re-renders → row visible
```

### Detach a doc from an SVG

```
ReferenceRow paperclip → FileLevelReferencesGroup.onDetach(D)
  → DetachDocModal mounts (asks: "delete doc too?" if no other attachments)
  → user confirms
  → attachmentLinks.write(rows.filter(r => !(r.docPath === D && r.entityType === "svg" && r.entityId === svgPath)))
  → optional: documentRepo.delete(D) when cascade-delete chosen
```

### SVG file rename

```
useFileExplorer rename → existing path-rewrite pipeline
  → attachmentLinks.write(rows.map(r => r.entityType === "svg" && r.entityId === oldPath
                                      ? { ...r, entityId: newPath }
                                      : r))
```

### SVG file delete

```
useFileExplorer delete → existing delete-propagation pipeline
  → svgFileMatcher (new) selects rows matching the deleted path
  → attachmentLinks.write(rows.filter(not matched))
```

### Diagram wiki-backlinks merge

```
DiagramProperties (root scope reference list)
  → attachmentLinks rows for this diagram
  → linkIndex backlinks for this diagram path
  → mergeAttachmentsWithBacklinks(rows, backlinks)
  → render via existing list (or migrated to <ReferenceRow>)
```

## 5. Error handling

- All attachment writes go through `attachmentLinksRepo.write`, which already wraps in `classifyError` + surfaces via `ShellErrorContext`. No new error paths.
- Picker cancel: silent no-op (existing behaviour).
- Detach during a concurrent file rename: the merge guard pattern from `useTabSources` does NOT apply here — `attachmentLinks.json` is workspace-flat, not file-scoped, so there's no read-modify-write inside a debounced flush. Writes are synchronous-from-the-user's-POV (pickers debounce nothing).

## 6. Tests

### Domain
- `EntityType` includes `"svg"` (compile-time + a tiny runtime test in `attachmentLinks.test.ts`).
- `AttachedToScope` includes `"svg"` (mirror update in `attachments.test.ts`).

### Repo
- `attachmentLinksRepo` round-trips a row with `entityType: "svg"`.

### File matchers
- `svgFileMatcher("foo.svg")` matches `{ entityType: "svg", entityId: "foo.svg" }` and **not** other entity types or other paths.
- Prefix-discriminator equivalent of the tab `path#` test — confirm `entityId: "foo.svg"` does NOT match `entityId: "foo.svg.bak"`.

### Rename / delete
- Renaming `foo.svg` → `bar.svg` rewrites `attachmentLinks` rows.
- Deleting `foo.svg` removes its rows.

### Shared components
- `<ReferenceRow>` renders, click → onPreview, paperclip → onDetach, readOnly hides paperclip, wiki-link source has no paperclip.
- `<FileLevelReferencesGroup>` merges + de-dupes (attachment wins on duplicate path), sorts by title, attach button calls `onAttach`, detach calls `onDetach`.
- `mergeAttachmentsWithBacklinks` unit test for the merge rules.

### UI integration
- `SvgProperties` shows the references group; attach via picker writes a row; detach removes one; cascade-detach modal appears when the doc has no other attachments.
- `TabProperties` continues to behave identically after migrating to `<FileLevelReferencesGroup>` (regression coverage on existing TAB-007a cases).
- `DiagramProperties` (or wherever the root reference list lives) now surfaces wiki-link backlinks alongside explicit attachments.

### Test cases (test-cases/)
- New `SVG-?-NN` IDs in `test-cases/06-svg-editor.md` for attach / detach / rename / delete / wiki-backlinks.
- New `DIAG-3.x-NN` IDs in `test-cases/03-diagram.md` for the new wiki-backlinks merge at root scope.

## 7. Acceptance criteria

- [ ] User can attach a document to an SVG via the SVG properties pane; row persists in `attachmentLinks.json`.
- [ ] User can detach; cascade-detach modal appears when the doc has no other attachments.
- [ ] Wiki-link backlinks (any `[[drawing.svg]]` in any doc body) appear alongside explicit attachments in SvgProperties.
- [ ] Renaming the SVG rewrites all `"svg"` rows pointing to the old path.
- [ ] Deleting the SVG removes all `"svg"` rows pointing to it.
- [ ] DiagramProperties root-scope list now merges wiki-link backlinks with explicit attachments.
- [ ] `<ReferenceRow>` consumed by AttachmentsSection (diagrams), TabReferencesList (tabs), and the new SVG list — all visually identical to before.
- [ ] `<FileLevelReferencesGroup>` consumed by Tab and SVG; TAB-007a regression suite green.
- [ ] No new typecheck errors, no new lint errors, full vitest suite green, build clean.

## 8. Files added / modified (preview — finalised in plan)

Added:
- `src/app/knowledge_base/shared/components/ReferenceRow.tsx` + `.test.tsx`
- `src/app/knowledge_base/shared/components/FileLevelReferencesGroup.tsx` + `.test.tsx`
- `src/app/knowledge_base/shared/utils/mergeAttachmentsWithBacklinks.ts` + `.test.ts`
- `src/app/knowledge_base/shared/utils/svgFileMatcher.ts` (or extension of `fileTreeMatchers.ts`)

Modified:
- `src/app/knowledge_base/domain/attachmentLinks.ts` — extend `EntityType`.
- `src/app/knowledge_base/domain/attachmentLinks.test.ts` — coverage for `"svg"`.
- `src/app/knowledge_base/shared/types/attachments.ts` — extend `AttachedToScope`.
- `src/app/knowledge_base/shared/types/attachments.test.ts` — coverage for `"svg"`.
- `src/app/knowledge_base/domain/svgRefs.ts` + `domain/tabRefs.ts` — comment clarifying `attachedTo?` is unused canon.
- `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx` (+ `.test.tsx`) — mount the new group.
- `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` (+ `.test.tsx`) — migrate to `<FileLevelReferencesGroup>`.
- `src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx` — migrate row markup to `<ReferenceRow>`.
- `src/app/knowledge_base/features/diagram/properties/DiagramProperties.tsx` (+ `.test.tsx`) or `AttachmentsSection.tsx` — root-scope wiki-link merge, migrate row markup to `<ReferenceRow>`.
- File-tree rename / delete pipeline — extend matcher / rewrite to also handle `"svg"` rows.
- `Features.md` — entries under §4.18 (SVG) and §3 (Diagram) for the new behaviours.
- `test-cases/06-svg-editor.md` and `test-cases/03-diagram.md` — new IDs.

## 9. Rollout

Single PR on `feat/diagram-mvp2-svg-attachments`. No feature flag. Backwards compatible by construction — new scope is additive; existing vaults have no `"svg"` rows; diagram users see additional backlinks but nothing breaks. The shared component extractions are pure refactors with regression tests in place.

## 10. Out-of-scope items captured for the future

- **Per-shape SVG attachments.** Adding `"svg-shape"` would require stable IDs in the SVG canvas. Significant editor surgery. Defer until requested.
- **Sidecar-canonical storage.** The MVP-4b forward-compat `attachedTo?` field stays unused. Migrating from flat-file to sidecar would be a much larger architecture change with unclear payoff.
- **Wiki-link backlinks at non-root diagram scopes.** Per-node / per-layer wiki-link merging would require nodes to be stable wiki-link targets, which they aren't today. Out of scope.
