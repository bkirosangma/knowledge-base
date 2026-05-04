# DocumentMeta Persistence Refactor — Design Spec

**Date:** 2026-05-04
**Status:** Draft (brainstorm complete, awaiting user review)
**Branch:** `plan/document-meta-persistence`
**Closes:** Guitar-Tabs handoff parked item #11 (audit diagram flow rename/delete attachment integrity) — replaced by the broader cross-entity cleanup that becomes possible only after this refactor lands. Implementation of that cleanup is part of this ticket's deliverables.

## Background

`DocumentMeta` (with `attachedTo`) is currently embedded in each `.kbjson` diagram file as `DiagramData.documents`. The in-memory store (`useDocuments` at `KnowledgeBaseInner`) is loaded wholesale via `onLoadDocuments` whenever a diagram opens, and is wiped (`onLoadDocuments([])`) when no diagram is loaded.

This shape has three failure modes:

1. **Attachments leak across diagrams.** Attaching a doc from a tab pane lands the row in whichever diagram's snapshot is currently in memory. Switching diagrams overwrites that snapshot wholesale; the next save persists only the loaded diagram's view.
2. **Tab-pane attachments can be lost.** With no diagram loaded (`useFileActions.ts:139`), `onLoadDocuments([])` clears the in-memory store. Any tab attachments made prior are dropped before any persistence path runs.
3. **Cross-diagram cleanup is impossible.** `migrateAttachments` (tab-section renames) and any in-flight delete cleanup mutate only the loaded diagram's snapshot. Other diagrams' embedded snapshots remain stale until reloaded.

The original goal — clean up orphan `attachedTo` entries on entity delete — cannot be implemented correctly under this model. The fix has to invert the storage: attachments become workspace-scoped, decoupled from diagram files.

## Goals

- Move `DocumentMeta` persistence out of per-diagram JSON into a single workspace-scoped store.
- Reduce the model: drop the unused `id` field and the derivable `title` field; persist a flat relations table `{ docPath, entityType, entityId }`.
- Implement the cross-entity orphan cleanup that this refactor unblocks (originally parked as item #11): in-flight diagram delete (node, connection, broken-flow cascade), tab `remove-track`, and file-tree delete of `.alphatex` and `.kbjson` files.
- Keep diagram-undo coherent: structural undo restores diagram-scope attachments only; workspace-scope rows (tab/tab-section/tab-track) are not affected by diagram undo.
- Preserve backward compatibility for existing vaults via lazy migration (no manual user step).

## Non-goals

- **`type` entity extinction/revival.** Soft orphan; deferred.
- **Workspace-level attach/detach undo history.** Tab-pane attach/detach is not undoable from any UI surface in this ticket.
- **Multi-vault attachments.** Single-vault model preserved.
- **Concurrent-user file locking.** Single-user FSA app; not needed.
- **Migration to read rows directly in callers.** The `documents: DocumentMeta[]` projection stays as a memoized derivation for back-compat; future cleanup may migrate readers to `rows`.
- **Vault-wide draft-orphan reaper.** A diagram-scoped reaper at load was rejected (would falsely orphan cross-diagram rows since entity ids are workspace-pseudo-unique, not file-scoped). A vault-wide reaper that walks every `.kbjson` to build the canonical entity-id set is a future ticket. See D8.

## Decisions

### D1 — Flat relations store, not nested DocumentMeta

```ts
type AttachmentLink = {
  docPath: string;       // path relative to vault root, e.g. "notes/foo.md"
  entityType: EntityType;
  entityId: string;
}
type EntityType = 'root' | 'node' | 'connection' | 'flow' | 'type' | 'tab' | 'tab-section' | 'tab-track';
```

The current `DocumentMeta.id` is never used as a join key. `DocumentMeta.title` is `docPath.split("/").pop()?.replace(".md", "")` — recomputable on demand. Both go away. Identity becomes the row tuple `(docPath, entityType, entityId)`.

### D2 — Workspace-scoped persistence at `<vault>/.kb/attachment-links.json`

Single JSON file at `<vault>/.kb/attachment-links.json` holding `Array<AttachmentLink>`. Dot-prefixed folder leaves room for future workspace-scoped infrastructure files (history log, lock files, etc.). The folder is created on first write; missing-file reads return `[]`.

### D3 — Lazy migration on first diagram load

Existing diagrams keep their `documents` field until they're next loaded. `useFileActions`' diagram-load path adds one inline step after parsing the JSON:

```ts
if (data.documents?.length) {
  attachments.batchAdd(flatten(data.documents));
  await diagramRepo.write(path, { ...data, documents: [] });
}
```

The flatten step is `flatMap(d => d.attachedTo?.map(a => ({ docPath: d.filename, entityType: a.type, entityId: a.id })) ?? [])`. The `attachments.batchAdd` call dedupes against existing rows by `(docPath, entityType, entityId)`. Idempotent: re-loading a migrated diagram is a no-op. After migration, the diagram file's `documents` field is `[]`.

### D4 — Diagram history snapshots only the diagram-relevant subset

`useDiagramHistoryStore` no longer captures the full `documents` array. On `scheduleRecord`, it computes:

```ts
const diagramEntityIds = new Set([
  ...nodeIds, ...connectionIds, ...flowIds,
  ...typesDerivedFromNodes, // optional: node[].type values
]);
const diagramAttachmentLinks = rows.filter(r =>
  diagramEntityTypes.has(r.entityType) && diagramEntityIds.has(r.entityId)
);
```

where `diagramEntityTypes = new Set(["node", "connection", "flow", "type", "root"])`. The snapshot stores `diagramAttachmentLinks`. On undo: `attachments.replaceSubset(diagramEntityTypes, diagramEntityIds, snapshot.diagramAttachmentLinks)` — removes rows for this diagram, re-adds the snapshot rows; tab/workspace rows untouched.

### D5 — Batch-aware writes, immediate flush by default

`useAttachments` exposes `withBatch(fn)`. Mutations inside the callback defer the write; the counter returns to zero on callback return → one write. Single-call mutations write immediately. Used by `useDeletion` for cascade ops, by lazy migration for the bulk add, by file-tree delete for the prefix-scan.

Implementation: a `pendingDepth: number` counter and a `pendingWrite: boolean` flag. On non-zero depth, mutations set `pendingWrite = true` instead of flushing. On counter return-to-zero, if `pendingWrite`, flush.

### D6 — Detach-before-remove ordering

Every delete site calls `detachAttachmentsFor` (or `detachDocument` for single rows) before applying the entity removal. Diagram in-flight delete: cleanup is inside `withBatch` along with the state mutations, so history snapshot captures the post-detach state and undo restores both atomically. Tab `remove-track`: cleanup runs before `propertiesApply`. File-tree delete: cleanup runs before `diagramBridge.handleDeleteFile`.

### D7 — Read precedence is sole-source after migration

Once migrated, `.kb/attachment-links.json` is the only source of truth. The diagram's `documents` field is read only during the lazy-migration step. We do not union or reconcile dual sources at read time. (This is the difference between option (b) and option (c) from Q4 — we picked (b).)

### D8 — Draft-orphan accumulation accepted as a known limitation

Within a session, attach/detach writes immediately to `.kb/attachment-links.json`. A user who attaches a doc to a draft (unsaved) entity, then exits without saving the diagram, leaves the row pointing at an entity id that exists nowhere on disk. Because diagram entity ids are workspace-pseudo-unique (`el-${ts}-${rand}`) and not file-scoped, **the loaded-diagram reaper option was rejected**: it would falsely orphan cross-diagram rows whose entity ids happen to live in a diagram that isn't currently loaded.

**Accepted limitation:** stale rows accumulate slowly when users abandon draft attachments. Penalty is benign — the UI never renders the stale attachment because the host entity is gone. A future ticket can add a vault-wide "Clean up orphan attachments" command that walks every `.kbjson` to build the canonical entity-id set, or an opt-in periodic reaper.

**Tab-side analogue is moot.** Tab edits write to the underlying file as they happen (no draft semantics for tab structure today), so this class of orphan doesn't arise on the tab side.

## Architecture

### New module surface

```
src/app/knowledge_base/domain/attachmentLinks.ts
  + type AttachmentLink, EntityType
  + addRow(rows, row): AttachmentLink[]                       (idempotent, returns same ref if no-op)
  + removeRow(rows, row): AttachmentLink[]
  + removeMatchingRows(rows, matcher): { rows, removed }
  + migrateRows(rows, idMap): AttachmentLink[]                (renames tab-section/tab-track ids)
  + replaceSubset(rows, entityTypes, entityIds, replacement): AttachmentLink[]
  + isSameRow(a, b): boolean

src/app/knowledge_base/infrastructure/attachmentLinksRepo.ts
  + createAttachmentLinksRepository(rootHandle: FileSystemDirectoryHandle): AttachmentsRepository
  + read(): Promise<AttachmentLink[]>     (returns [] on missing file; throws FileSystemError on malformed)
  + write(rows): Promise<void>           (creates .kb/ if absent)
  + ATTACHMENTS_FILE = ".kb/attachment-links.json"

src/app/knowledge_base/features/document/hooks/useDocuments.ts → useAttachments (semantically; file path unchanged)
  internal state: rows: AttachmentLink[]
  exposes:
    rows                               (raw store)
    documents                          (memoized DocumentMeta[] projection)
    attachDocument(docPath, entityType, entityId)
    detachDocument(docPath, entityType, entityId)
    detachAttachmentsFor(matcher)      ← cleanup primitive
    migrateAttachments(filePath, migrations)
    withBatch(fn)
    getDocumentsForEntity(entityType, entityId)
    hasDocuments(entityType, entityId)
    collectDocPaths, existingDocPaths  (unchanged)
```

### Removed surfaces

- `onLoadDocuments` prop chain — `DiagramView` → `useDiagramController` → `useDiagramHistoryStore` → `useFileActions`. All four signatures lose the prop.
- `useFileActions`' explicit `documents` parameter and the per-save `documents` field write.
- `DiagramData.documents` is **deprecated** but still typed — read at migration time, written as `[]` post-migration. Remove the field from new diagram writes after one release cycle if no production data has stale fields.
- `useDiagramController.ts:321` `handleDeleteFlow` wrapper — flow-direct cleanup now goes through `useDeletion` like the cascade paths.

### Data flow per delete site

```
[diagram in-flight delete]
  user → useDeletion.deleteSelection(sel)
    → tryDeletion: computeRemovedConnections(...) yields removedConnIds
    → findBrokenFlows yields brokenFlows
    → executeDeletion(nodeIds, layerIds, lineIds, brokenFlowIds):
        attachments.withBatch(() => {
          attachments.detachAttachmentsFor(r =>
            (r.entityType === "node" && allNodeIds.has(r.entityId)) ||
            (r.entityType === "connection" && allConnIds.has(r.entityId)) ||
            (r.entityType === "flow" && brokenFlowIds.has(r.entityId)));
          setNodes / setConnections / setFlows / setLayerDefs / setMeasuredSizes;
        })
        setSelection(null);
        onActionComplete("Delete N items");      (history snapshot fires here)

[tab in-flight remove-track]
  user → handleRemoveTrack(trackId)
    → removedPosition = Number(trackId)
    → stableUuid = sidecar?.trackRefs[removedPosition]?.id
    → if stableUuid:
        attachments.detachAttachmentsFor(r =>
          r.entityType === "tab-track" && r.entityId === `${filePath}#track:${stableUuid}`)
    → propertiesApply({ type: "remove-track", trackId })
    → setCursor + sidecar reconcile

[file-tree delete]
  user → handleDeleteFileWithLinks(path, event)
    → if path endsWith ".alphatex":
        attachments.detachAttachmentsFor(r =>
          (r.entityType === "tab" && r.entityId === path) ||
          ((r.entityType === "tab-section" || r.entityType === "tab-track") && r.entityId.startsWith(path + "#")))
    → else if path endsWith ".kbjson":
        try {
          json = await diagramRepo.read(path)
          ids = collectDiagramEntityIds(json)
          attachments.detachAttachmentsFor(r =>
            (r.entityType === "node" || r.entityType === "connection" || r.entityType === "flow") && ids.has(r.entityId))
        } catch (e) {
          reportError(e, `Reading ${path} for attachment cleanup`)
        }
    → else if path endsWith ".md":
        attachments.detachAttachmentsFor(r => r.docPath === path)
    → diagramBridgeRef.current.handleDeleteFile(path, event)   (existing unlink + linkManager)
```

### Lazy migration data flow

```
useFileActions diagram-load:
  data = await diagramRepo.read(path)
  if (data.documents?.length) {
    rows = flatten(data.documents)
    await attachments.batchAdd(rows)                ← inserts deduped rows + writes file
    await diagramRepo.write(path, { ...data, documents: [] })
  }
  applyDiagramToState(loadDiagramFromData(data))
  // onLoadDocuments call REMOVED
```

### Boot-time load

```
KnowledgeBaseInner mount:
  if (rootHandle):
    rows = await attachmentLinksRepo.read()    ← returns [] if missing
  else:
    rows = []
  setRows(rows)
```

The boot read happens once per vault. Subsequent vault reopens (rootHandle change) re-read.

## Error Handling

| Scenario | Handling |
|---|---|
| Boot read fails (permission denied) | Log via `reportError`; treat as empty store. Subsequent mutations write to disk normally; existing on-disk state may be overwritten. |
| Boot read returns malformed JSON | `FileSystemError("malformed")` thrown by repo; boot path catches, logs, treats as empty. **Never overwrite a malformed file silently** — the boot path additionally backs up to `.kb/attachment-links.json.broken` before writing. (Catches user errors during dogfooding.) |
| Write fails during flush | In-memory state already updated. Log via `reportError`. Retry on next mutation. Lost-edit window is between mutation and write — same risk shape as today's debounced `useTabContent`. |
| Migration rewrite fails (`diagramRepo.write` of `documents: []`) | Rows already in-memory and (if write succeeded) in `attachment-links.json`. Diagram file still has stale `data.documents`. Subsequent loads re-attempt migration; idempotent dedupe makes this safe. |
| `.kbjson` read fails during file-tree delete | Log; proceed with unlink without detach. Orphan rows left; not a data-loss issue. |
| `.kb/` directory absent on first write | `attachmentLinksRepo.write` creates it. No special handling. |
| Concurrent React state burst | `withBatch` collapses to one in-memory mutation pass and one write. Only one writer (single-user FSA), so no race. |
| Diagram-undo when workspace rows changed mid-session | Subset replacement removes only `(diagramEntityTypes, diagramEntityIds)` rows; tab/workspace rows survive. Test exercises a tab-attach between two diagram-undos. |

## Testing Strategy

### Unit tests

1. **`attachments.test.ts` — domain helpers**
   - `addRow` idempotent on duplicate `(docPath, entityType, entityId)`.
   - `removeRow` removes one match; no-op when absent.
   - `removeMatchingRows(matcher)` returns `{ rows, removed: number }`.
   - `migrateRows(map)` rewrites only `tab-section` / `tab-track` ids.
   - `replaceSubset` removes existing subset, adds replacement, preserves out-of-subset rows.

2. **`attachmentLinksRepo.test.ts` — FSA round-trip**
   - Write then read returns identical rows.
   - Read on missing file returns `[]`.
   - Malformed JSON throws `FileSystemError("malformed", …)`.
   - Shape guard rejects non-row arrays (e.g., array of `DocumentMeta`).
   - Write creates `.kb/` directory if absent.
   - Malformed file → backup written to `.kb/attachment-links.json.broken`.

3. **`useAttachments.test.ts`** (extends/replaces existing `useDocuments.test.ts`)
   - All existing attach/detach/migrate semantics preserved against rows model.
   - `documents` projection: rows grouped by `docPath` produce expected `DocumentMeta` shape (back-compat).
   - `withBatch` defers writes; counter return-to-zero triggers one write.
   - Nested `withBatch` calls only flush at outermost return.
   - `detachAttachmentsFor(matcher)` removes matching rows; idempotent.
   - First mutation creates the file; subsequent mutations overwrite.
   - Boot read failure → empty rows + reportError.

4. **`useFileActions.lazyMigration.test.ts`**
   - Diagram with `documents: [doc1, doc2]` triggers migration: rows added (deduped), diagram rewritten with `documents: []`.
   - Diagram with `documents: []` (or missing) skips migration.
   - Migration rewrite failure → in-memory state still updated; rewrite retries on next load (idempotent).
   - Re-loading a migrated diagram is a no-op.

5. **`useDiagramHistoryStore.test.ts` — subset snapshot**
   - Snapshot captures only this diagram's `(entityType, entityId)` pairs.
   - Tab-attached rows excluded from snapshot.
   - Undo restores subset; tab rows untouched.
   - Cross-diagram safety: open A, attach to A's node, switch to B, attach to B's node, undo on B → A's row preserved.

6. **`useDeletion.test.ts` — cleanup integration**
   - Delete single node → matching rows removed.
   - Delete cascading to connections + broken flows → all matching rows removed in one batch (assert single write call).
   - Delete layer cascades to nodes → row cleanup follows.
   - Delete flow direct → matching rows removed (replaces today's `useDiagramController:321` test).

7. **`TabView.test.tsx` — remove-track cleanup**
   - Remove track 1 → `tab-track` rows for `${filePath}#track:${uuid1}` removed.
   - Remove track when sidecar absent → no detach attempted; engine splice still runs.

8. **`knowledgeBase.test.tsx` — file-tree delete cleanup**
   - `.alphatex` delete → all `tab` / `tab-section` / `tab-track` rows for that file removed.
   - `.kbjson` delete → reads file, extracts ids, removes matching diagram-entity rows.
   - `.kbjson` read failure → unlink proceeds, no detach, error reported.
   - `.md` delete → all rows with `docPath === path` removed.

### Test-cases catalog updates

- **`04-document.md`** (new section ~4.x or appended): rows-model semantics, batch primitive, migration scenarios. ~6–8 cases.
- **`03-diagram.md`**: in-flight cleanup cases (~5–6) and `.kbjson` file-delete cleanup including read-failure branch (~3 cases).
- **`11-tabs.md`**: `remove-track` cleanup + `.alphatex` file-delete cleanup. ~3 cases.

Numbering follows the "next free" rule; no renumbering of existing IDs.

## Risks

- **Lazy-migration corruption window.** If the app crashes between `attachments.batchAdd` and `diagramRepo.write({...data, documents: []})`, the diagram file still has stale `documents`. Next load re-runs migration; dedupe makes it safe. Verified by test #4 above.
- **`documents` projection memoization cost.** Memoizing the `DocumentMeta[]` derivation on every row change is O(N) where N = total rows. For vaults with thousands of rows this could matter; acceptable today (vaults are hundreds of files). Tagged for follow-up if profiling shows hot path.
- **Diagram history bloat.** Each `scheduleRecord` now stores the subset of rows for that diagram instead of the full `documents`. For diagrams with many attachments (>50), the per-snapshot size grows. Today's full-snapshot size is the worst case; subset is strictly ≤ that. Not a regression.
- **Diagram file format drift.** `collectDiagramEntityIds` assumes today's `.kbjson` shape (`nodes`, `connections`, `flows`). Future entity collections must be added to this helper. A test that fails on unknown top-level keys would catch drift; included in test suite.
- **Backup file accumulation.** `.kb/attachment-links.json.broken` is written on malformed-read failure. Backups don't auto-rotate. If the failure is transient, repeated boots could pile up. Mitigated by the fact that malformed-file scenarios are rare (we don't write malformed files ourselves); user-driven cleanup acceptable.
- **Draft-orphan accumulation (D8).** Attaching a doc to a draft entity and exiting without saving the diagram leaves a stale row referencing a no-longer-extant entity id. UI penalty is zero (the host entity is gone), but the store grows unboundedly. Future ticket can add a vault-wide "Clean up orphan attachments" command that walks every `.kbjson` to build the canonical id set.

## Ship plan

- Branch: `plan/document-meta-persistence` (already created).
- One PR via `gh pr create`. Diff scope: domain types + new repo (~150 LOC), `useAttachments` rewrite (~250 LOC), lazy migration step (~30 LOC), history-subset snapshot (~50 LOC), `useDeletion` integration (~30 LOC), tab `remove-track` (~15 LOC), file-tree delete branch (~50 LOC), `onLoadDocuments` removal cascade (4 signatures), Features.md + test-cases catalog updates.
- Estimated 14–18 TDD tasks. Larger than typical TAB tickets — touches diagram, tab, and file-tree paths plus the history store.
- After merge: update Guitar-Tabs handoff doc to flip parked item #11 to closed (the cleanup behaviour ships as part of this ticket).

## How to read this spec

If you arrived from a fresh context: read **Background** + **Decisions** + **Architecture** in order. Section 1 of the design (Architecture) is the load-bearing summary; Sections 2–3 (Data flow, Testing) are reference detail. The brainstorm transcript that led here is captured in the conversation log; key forks were Q1 (flat rows over DocumentMeta nested), Q2 (lazy over eager migration), Q3 (subset snapshot for diagram undo), Q4 (batch + immediate over debounced).
