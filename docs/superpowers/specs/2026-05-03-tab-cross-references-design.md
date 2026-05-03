# TAB-007a — Tab Properties Cross-References (Design)

**Status:** Spec approved 2026-05-03. Implementation targets branch `plan/guitar-tabs-properties-cross-refs`.
**Depends on:** TAB-007 (TabProperties shell), TAB-011 (vault search + wiki-link integration).
**Closes:** Open follow-up #7 (unstable React keys on duplicate section names).
**Out of scope:** `tab-track` (TAB-009a / M2), `tab-bar` (M3), SVG/diagram → tab attachments (deferred), editor surfaces (TAB-008).

---

## 1. Goal

Extend the tab Properties panel so a tab — and each of its sections — can carry references to other vault docs, mirroring the existing diagram pattern. Two streams converge into one "References" list per entity:

- **Explicit attachments** via `useDocuments.attachDocument(docPath, entityType, entityId)`.
- **Wiki-link backlinks** from `linkManager.getBacklinksFor(filePath)`, optionally filtered by `section`.

The result is the layout the parent spec describes (`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` ~L327): a "Whole-file references" group at the bottom of the panel, plus a "References (n)" sub-list under each section row.

## 2. Entity types and IDs

`DocumentMeta.attachedTo[].type` widens additively from `'root' | 'node' | 'connection' | 'flow' | 'type'` to also include `'tab' | 'tab-section'`.

| `entityType` | `entityId` | Notes |
|---|---|---|
| `"tab"` | `filePath` (e.g. `tabs/song.alphatex`) | Whole-file attachment. |
| `"tab-section"` | `${filePath}#${sectionId}` | Composite to avoid cross-file collisions when section names overlap between tabs. Matches the `path#section` shape `BacklinkEntry.linkedFrom[]` already uses. |

`tab-track` and `tab-bar` are reserved by the parent spec but not implemented here.

## 3. Section ID derivation

Two pure helpers on `domain/tabEngine.ts`:

```ts
export function slugifySectionName(name: string): string;
// "Verse 1" → "verse-1"; collapses whitespace, strips punctuation, lowercases.

export function getSectionIds(sections: TabSection[]): string[];
// Returns id[] aligned 1:1 with sections. On collision (same slug appears twice),
// suffixes "-2", "-3", … in order of appearance. Stable, deterministic.
```

Both pure (no DOM, no React, no I/O) and live alongside `TabMetadata` so the engine and UI share a single derivation. Tested in isolation.

`Sections` in `TabProperties` switches its React `key` from `section.name` to `getSectionIds(metadata.sections)[i]` — closes follow-up #7.

## 4. Section-rename reconciliation

Section ids are derived from names, so a rename in the source `.alphatex` would otherwise orphan a `tab-section` attachment. We reconcile at the boundary where new metadata arrives.

**`useTabSectionSync(filePath, metadata, docManager)`** — new hook in `features/tab/properties/`:

1. Maintains a per-file ref of the previous section-id list.
2. When `metadata.sections` changes, computes a position-based diff:
   - For each index *i* in `[0, min(prev.length, next.length))`: if `prevIds[i] !== nextIds[i]` → emit `{ from: prevIds[i], to: nextIds[i] }`.
   - If `prev.length > next.length`, the extra `prevIds[i]` entries (truncation / deletion at the end) get no migration; their `attachedTo` rows orphan naturally.
   - If `next.length > prev.length`, the extra `nextIds[i]` entries are new sections; nothing to migrate.
3. Calls `docManager.migrateAttachments(filePath, migrations)` (new helper, §5) only when `migrations.length > 0`.

**Heuristic boundaries:**

- Position-based migration breaks if the user renames *and* reorders in the same save. Acceptable for M1 (no editor UI yet — renames happen by hand-editing the `.alphatex`, rarely with concurrent reorder). The orphan-badge UX (§7) makes the failure visible rather than silent.
- True rename-survival requires a side-car `name → stableId` mapping per tab; deferred to TAB-008/M2 when the editor lands and renames become first-class.

**Wiki-link side:** no new code. `linkManager` already re-indexes on save; a stale `[[song#Verse 1]]` becomes a broken link on next render, mirroring `.md`→`.md` behavior.

## 5. `useDocuments.migrateAttachments`

New helper added to `useDocuments`:

```ts
migrateAttachments(
  filePath: string,
  migrations: { from: string; to: string }[]
): void;
```

For each `documents[d].attachedTo[a]` whose `type === "tab-section"` and `id === ${filePath}#${migration.from}`, rewrites the id to `${filePath}#${migration.to}`. Idempotent (a no-op migration leaves state unchanged). Bulk-applies all migrations in one `setDocuments` call to avoid intermediate renders.

## 6. New component: `TabReferencesList`

Lives in `features/tab/properties/TabReferencesList.tsx`. ~80 lines.

**Props:**
```ts
{
  attachments: DocumentMeta[];          // pre-filtered by parent
  backlinks: { sourcePath: string; section?: string }[];  // pre-filtered by parent
  readOnly?: boolean;
  onPreview?: (path: string) => void;
  onDetach?: (docPath: string) => void;
}
```

**Parent-side filter rules** (so the component itself stays trivial):

```ts
// File-level instance
attachments = documents.filter(d =>
  d.attachedTo?.some(a => a.type === "tab" && a.id === filePath)
);
backlinks = allBacklinks.filter(bl => !bl.section);

// Per-section instance
attachments = documents.filter(d =>
  d.attachedTo?.some(a => a.type === "tab-section" && a.id === `${filePath}#${sectionId}`)
);
backlinks = allBacklinks.filter(bl => bl.section === sectionId);
```

**Behavior:**

- **Merge + de-dupe by `sourcePath`.** A doc that both attaches and wiki-links to the entity appears once. Precedence: **attached wins** (offers more actions).
- **Visual distinction:**
  - Attached → 📎 icon, "Detach" affordance on hover.
  - Wiki-link only → → icon, no Detach (immutable here; the source of truth is the doc's content).
- `readOnly` hides Detach buttons but still renders the list.
- Empty state: `<p class="text-mute">No references</p>`.

**Why not extend `DocumentsSection`?** That component is a pure wiki-link backlink renderer used by diagrams; widening it to handle attachments would force diagram callers to consume props they don't need. Diagrams already handle attachments via `FlowProperties`-style per-entity views; we follow the same shape for tabs without conflating the two.

## 7. UI structure

```
TabProperties (existing)
  ├─ Header / General / Tuning / Tracks                 (unchanged)
  ├─ Sections
  │     • <name>            [📎 Attach…]                ← new, hidden in readOnly
  │       └─ References (n)                              ← TabReferencesList per section
  └─ Whole-file references (n)                          ← new
        [📎 Attach…]                                    ← file-level, hidden in readOnly
```

Section rows use `getSectionIds(metadata.sections)[i]` as the React key.

**Orphan rendering (deferred polish):** if `documents` contains a `tab-section` attachment whose section id isn't in `metadata.sections`, render under "Whole-file references" with an "(orphaned section)" badge so the doc isn't lost. Implementation is small; if it grows, defer to a follow-up.

## 8. Wiring

`TabView` props grow to mirror `DiagramView`'s attachment surface:

```ts
{
  filePath: string;
  documents: DocumentMeta[];
  onAttachDocument: (docPath, entityType, entityId) => void;
  onDetachDocument: (docPath, entityType, entityId) => void;
  onCreateAndAttach?: (entityType, entityId, filename, editNow) => Promise<void>;
  onCreateDocument?: ...;
  onLoadDocuments?: ...;
  backlinks: BacklinkEntry["linkedFrom"];     // pre-fetched in parent
  onPreviewDocument?: (path: string) => void;
  onOpenDocPicker?: (entityType, entityId) => void;
  getDocumentReferences?: ...;
  deleteDocumentWithCleanup?: (path) => Promise<void>;
  readOnly?: boolean;
}
```

`knowledgeBase.tsx` plumbs them when rendering `TabView` — copy-paste the shape from the `DiagramView` block at lines 940–987, swapping diagram-only fields for tab equivalents.

`TabProperties` receives the subset it needs and threads them down to `TabReferencesList` and the per-row Attach affordance.

## 9. Tests

**Pure helpers:**
- `domain/tabEngine.slugify.test.ts` — slug rules: spaces, mixed case, punctuation, unicode, empty string.
- `domain/tabEngine.getSectionIds.test.ts` — collision suffixes, stable order, all-unique, all-collision.

**Hook:**
- `useTabSectionSync.test.tsx` — rename at index emits migration; delete at end yields orphan, no migration; no-change is a no-op; switching `filePath` resets the cache.

**State:**
- `useDocuments.migrateAttachments.test.ts` — single migration, multiple migrations, idempotent no-op, no-match unchanged.

**Component:**
- `TabReferencesList.test.tsx` — attachments-only, backlinks-only, both-merged-deduped, attached-wins precedence, readOnly hides Detach, empty state.

**Integration:**
- `TabProperties.test.tsx` — extend with: file-level Attach affordance opens picker; per-section Attach passes composite id; references list renders for both layers; readOnly hides all Attach buttons; rename in metadata migrates attachments via the sync hook.

**Catalog:**
- `test-cases/11-tabs.md` §11.7 (next free section, no renumbering): cross-references cases — attach via picker, detach, rename migrates, delete orphans, wiki-link backlink renders, de-dupe with attachment, readOnly suppresses chrome.

**Spec/Features sync:**
- `Features.md` §11.5 (or §11.6) gains a bullet for tab cross-references with paths to `TabReferencesList.tsx`, `useTabSectionSync.ts`, the helpers in `tabEngine.ts`.

## 10. File-by-file impact

```
src/app/knowledge_base/domain/tabEngine.ts                                    +slugifySectionName, +getSectionIds
src/app/knowledge_base/features/document/types.ts                             attachedTo.type widens
src/app/knowledge_base/features/document/hooks/useDocuments.ts                +migrateAttachments
src/app/knowledge_base/features/tab/properties/TabProperties.tsx              + props, +Attach affordances, key swap
src/app/knowledge_base/features/tab/properties/TabReferencesList.tsx          NEW
src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts           NEW
src/app/knowledge_base/features/tab/TabView.tsx                               props grow + thread-through
src/app/knowledge_base/knowledgeBase.tsx                                      + TabView prop wiring (mirror DiagramView)
test-cases/11-tabs.md                                                         + §11.7 cases (next free)
Features.md                                                                   + cross-references bullet
docs/superpowers/handoffs/2026-05-03-guitar-tabs.md                           updated at ticket close (per protocol)
```

Plus tests listed in §9.

## 11. Parked follow-ups (record at ticket close)

- **Audit diagram flow rename/delete attachment integrity.** Flow ids are stable so rename is safe by construction, but deletion may leave orphan `attachedTo` entries — no cleanup hook visible in `DiagramView`. Verify and spec a fix once tabs ship. (Triggered by user request during TAB-007a brainstorm.)
- **Side-car stable section ids for tabs.** Persist a `name → stableId` mapping per tab so section renames survive even with concurrent reorder. Targets TAB-008/M2 when the editor lands.
- **Orphan-attachment UX polish.** If §7's inline orphan badge proves confusing, design a dedicated "Orphaned attachments" group with a "reassign / delete" affordance.

## 12. Acceptance checklist

- [ ] `slugifySectionName` and `getSectionIds` land in `domain/tabEngine.ts` with passing tests including collisions.
- [ ] `DocumentMeta.attachedTo[].type` includes `'tab' | 'tab-section'`.
- [ ] `useDocuments.migrateAttachments` exists with passing tests.
- [ ] `useTabSectionSync` exists with passing tests for rename/delete/no-op.
- [ ] `TabReferencesList` renders merged + de-duplicated lists; readOnly hides Detach.
- [ ] `TabProperties` renders file-level + per-section "References" sub-lists, with Attach affordances when not readOnly. React key is the deterministic id.
- [ ] `knowledgeBase.tsx` plumbs the full attachment surface into `TabView`.
- [ ] Test cases in `test-cases/11-tabs.md` §11.7 added (status ❌ → ✅ in same commit as the tests that cover them).
- [ ] `Features.md` updated with the new cross-references entry.
- [ ] Handoff doc bumped per protocol at ticket close.
- [ ] Two new follow-ups parked in the handoff (diagram audit, side-car stable ids).
