# MVP-4b — SVG/Tab metadata persistence and source links

**Status:** Design approved 2026-05-07. Ready for plan.
**Predecessor:** MVP-4a (PR #133, #135) — `SourceLink[]` shipped on diagram entities + documents.
**Handoff context:** `docs/superpowers/handoffs/2026-05-05-diagram-flow-enhancements.md` § "Deferred to a future MVP — SVG/Tab metadata persistence".

## 1. Goal

Wire `<SourcesSection>` into the SVG and Guitar Tab editors so a user can attach `SourceLink[]` to those file types — matching the document and diagram experience already shipped in MVP-4a. Persist via sidecar files alongside each `.svg` / `.alphatex`. This re-enables MVP 5 Tasks 5 and 6 in the knowledge-base skill (`archetypes/svg.md`, `archetypes/guitar-tabs.md`).

## 2. Scope

### In scope

- File-level `sources: SourceLink[]` on SVG files (one list per `.svg`).
- File-level `sources: SourceLink[]` on Tab files (one list per `.alphatex`).
- Persistence layer for both file types.
- UI: full `SvgProperties` aside (new); `<SourcesSection>` row in `TabProperties` (existing aside).
- Tests for domain shapes, repos, hooks, and UI wiring.

### Out of scope (deferred again, but schema-anticipated)

- `attachedTo: AttachedToEntry[]` for SVG/Tab — MVP-2 deferral; the schemas in this spec **accept** an optional `attachedTo` field so MVP-2 SVG/Tab branches will not need a second migration, but the field is **not wired** by any UI or hook in this MVP.
- Per-track and per-section sources on tabs.
- Inline alphaTex `\sources` header. Rejected: invasive to the user's tab text and forces a parser pass over user-authored notation on every save. Sidecar is cleaner.

## 3. Architecture

### 3.1 Tab — bump `TabRefsPayload` v2 → v3

The existing tab sidecar (`<file>.alphatex.refs.json`) gains optional `sources` and `attachedTo` fields. One sidecar per tab. Read path migrates v1 → v2 → v3 in memory; write always emits v3. Empty arrays are omitted from the emitted JSON to keep diffs minimal.

```ts
// src/app/knowledge_base/domain/tabRefs.ts
export interface TabRefsPayload {
  version: 3;
  sectionRefs: Record<string /* stableId */, string /* currentName */>;
  trackRefs: TabRefEntry[];
  sources?: SourceLink[];           // new in v3 — file-level only
  attachedTo?: AttachedToEntry[];   // reserved for MVP-2; not wired
}

// v1 and v2 shapes retained for read-path migration.
export interface TabRefsPayloadV1 { /* unchanged */ }
export interface TabRefsPayloadV2 {
  version: 2;
  sectionRefs: Record<string, string>;
  trackRefs: TabRefEntry[];
}
```

`emptyTabRefs()` returns a v3 payload with empty `sectionRefs`, empty `trackRefs`, and no `sources` / `attachedTo` keys.

`tabRefsRepo.write` always emits version 3. Empty `sources` / `attachedTo` are dropped from the JSON output (i.e. `JSON.stringify` of a v3 payload that had them populated and then emptied does not retain the empty array).

### 3.2 SVG — new sidecar `<file>.svg.refs.json`

Modelled on `tabRefsRepo.ts` exactly. Lazy creation only (no sidecar exists until the user adds at least one source). `read` returns `null` when no sidecar exists.

```ts
// src/app/knowledge_base/domain/svgRefs.ts
export interface SvgRefsPayload {
  version: 1;
  sources?: SourceLink[];
  attachedTo?: AttachedToEntry[];   // reserved for MVP-2; not wired
}

export interface SvgRefsRepository {
  read(filePath: string): Promise<SvgRefsPayload | null>;
  write(filePath: string, payload: SvgRefsPayload): Promise<void>;
}

export function emptySvgRefs(): SvgRefsPayload {
  return { version: 1 };
}
```

Sidecar suffix: `<file>.svg.refs.json` (i.e. `drawing.svg` → `drawing.svg.refs.json`).

`svgRefsRepo.write` deletes the sidecar entirely (or skips writing it) when the payload's `sources` and `attachedTo` are both empty/absent — keeps the vault clean for files the user opened but never added metadata to. The `tabRefs` sidecar is *not* deletable via this rule because `sectionRefs`/`trackRefs` always carry content; the SVG sidecar exists solely for optional metadata.

### 3.3 `AttachedToEntry` (forward-compat type)

Defined now so both schemas can reference it. Not wired in this MVP.

```ts
// src/app/knowledge_base/shared/types/attachments.ts (new)
export type AttachedToScope =
  | "root" | "node" | "connection" | "flow" | "type"
  | "tab" | "tab-section" | "tab-track";

export interface AttachedToEntry {
  type: AttachedToScope;
  id?: string;          // entity id; absent for "root"
  documentPath: string;
}
```

This is the same shape used by the diagram entities already shipped in MVP-2; collecting it into a shared module lets the SVG and Tab schemas reference one type. **No diagram code changes** as part of this MVP — diagram types stay where they are; the new shared type is for the new SVG/Tab schemas only.

### 3.4 Hooks

**`useTabSources(filePath)`** — sibling to `useTabEngine`, file scope only.

```ts
// src/app/knowledge_base/features/tab/hooks/useTabSources.ts (new)
export function useTabSources(filePath: string | null): {
  sources: SourceLink[];
  setSources: (next: SourceLink[]) => void;
  isDirty: boolean;
};
```

Reads `tabRefs.read(filePath)` on file change. Writes via `tabRefs.write(filePath, payload)` with debounce (200 ms, matching `useSVGPersistence`). Carries the rest of the existing `TabRefsPayload` (sectionRefs, trackRefs) untouched on write — read the current sidecar, merge `sources`, write back. **The hook owns the sources field only**; it must not stamp over sectionRefs / trackRefs that `useTabEngine` writes through the same sidecar. Implementation detail: read-modify-write per save, with a guard that re-reads the sidecar inside `write` and merges before persisting, so a concurrent section-rename doesn't get clobbered.

**`useSvgMeta(filePath)`** — sibling to `useSVGPersistence`.

```ts
// src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts (new)
export function useSvgMeta(filePath: string | null): {
  sources: SourceLink[];
  setSources: (next: SourceLink[]) => void;
  isDirty: boolean;
};
```

Reads `svgRefs.read(filePath)` on file change. Writes via `svgRefs.write(filePath, payload)` with the same 200 ms debounce. Errors classified through `ShellErrorContext`, mirroring `useSVGPersistence`.

### 3.5 UI

**Tab — `TabProperties.tsx`:** Add a new file-level section that mounts `<SourcesSection>` driven by `useTabSources(filePath)`. The exact slot among existing sections (Header / General / Tracks / Sections / FileReferences / ExportSection) is a plan-level call — sources are file-scoped metadata, so a slot adjacent to `FileReferences` is the natural home, but the plan may choose differently. `readOnly` is forwarded from `TabProperties.readOnly` so view mode hides edit affordances.

**SVG — new `SvgProperties.tsx` aside:**

```
src/app/knowledge_base/features/svgEditor/properties/
  SvgProperties.tsx      (new)
  SvgProperties.test.tsx (new)
```

Mirrors `TabProperties` structure: collapsible aside on the right of `SVGEditorView`. Initial content is just `<SourcesSection>` driven by `useSvgMeta(filePath)`. Collapse state is component-local (per `feedback_overlay_state_locality`).

`SVGEditorView` integrates the aside as a right-hand column following the same pattern as `TabView` / `DiagramView`. The collapsed/expanded width tokens (`w-9` / `w-72`) match `TabProperties` for visual consistency. Exact JSX layout (where the new flex-row sits in `SVGEditorView`'s tree of `PaneHeader` / `SVGToolbar` / `SVGCanvas`) is a plan-level call.

The `readOnly` flag from `SVGEditorView`'s `isReadOnly` is forwarded to `SvgProperties`, which forwards to `SourcesSection`.

### 3.6 RepositoryContext extension

```ts
// src/app/knowledge_base/shell/RepositoryContext.tsx
interface Repositories {
  // ...existing
  svgRefs: SvgRefsRepository | null;   // new
}
```

`StubRepositoryProvider` provides an in-memory implementation for tests, mirroring the existing `tabRefs` stub.

### 3.7 Data flow

Tab save path:
```
SourcesSection
  → setSources                       (UI callback)
  → useTabSources                    (debounced 200 ms)
  → tabRefs.write(filePath, payload) (read-modify-write merge)
  → JSON sidecar on disk
```

SVG save path:
```
SourcesSection
  → setSources
  → useSvgMeta                       (debounced 200 ms)
  → svgRefs.write(filePath, payload) (delete-when-empty rule)
  → JSON sidecar on disk
```

## 4. Migration

- **Tab v1 → v3:** existing v1 → v2 migration runs first (already implemented). v2 → v3: add `version: 3`, leave `sources`/`attachedTo` absent. No data lost.
- **Tab v2 → v3:** identical — bump version, leave new fields absent.
- **SVG:** no migration. Sidecar is a new file format and only created on first source add.

Any unknown `version` value falls through to `null` (parser can't make sense of it) — same as today.

## 5. Error handling

- All sidecar reads/writes go through `classifyError` and surface to `ShellErrorContext`, matching the existing repos.
- Malformed sidecar JSON: `read` returns `null` (treated as no metadata), and the user can re-add sources without losing other content.
- File system permission errors during write: dirty flag stays true, banner appears via `ShellErrorContext`.

## 6. Tests

Mirroring existing test layout:

1. **Domain shape (`tabRefs.test.ts`, `svgRefs.test.ts` new)**
   - `emptyTabRefs()` returns v3.
   - `emptySvgRefs()` returns v1.
   - Empty arrays drop from JSON serialisation.

2. **Repo round-trip (`tabRefsRepo.test.ts` extended, `svgRefsRepo.test.ts` new)**
   - Tab: v1 → v3 read migration; v2 → v3 read migration; v3 → v3 round-trip; write always emits v3; sources persisted; attachedTo persisted (round-trip only — no UI).
   - SVG: read missing → `null`; write/read round-trip; delete-when-empty rule; malformed JSON → `null`.

3. **Hooks (`useTabSources.test.tsx`, `useSvgMeta.test.tsx` new)**
   - Initial load reads from repo.
   - `setSources` flips `isDirty` true; debounced write resets to false on success.
   - Write failure leaves `isDirty` true.
   - File-switch flushes pending debounce.
   - **Tab merge guard:** if `sectionRefs` change between read and write inside the hook, sources update doesn't clobber them.

4. **UI (`TabProperties.test.tsx` extended, `SvgProperties.test.tsx` new)**
   - SourcesSection visible at file scope.
   - Add / remove source updates payload via repo.
   - Invalid URL shows error; valid URL persists.
   - readOnly hides edit affordances.

5. **Integration**
   - Existing TAB e2e: smoke that adds a source, reloads, source still there.
   - New SVG e2e: same shape.

## 7. Test cases (Features.md / test-cases/)

New entries under `test-cases/`:

- `test-cases/04-svg-editor.md` (or wherever SVG cases live) — `SVG-?-??: Source links persist via .svg.refs.json sidecar`.
- `test-cases/11-tabs.md` — `TAB-?-??: File-level source links persist via tab sidecar v3`.

Numbers assigned at plan time per the "next free ID" rule.

## 8. Acceptance criteria

- [ ] `<SourcesSection>` appears in `TabProperties` at file scope; add/remove/edit persist to `<file>.alphatex.refs.json`.
- [ ] Reopening the tab restores the source list.
- [ ] `<SourcesSection>` appears in a new `SvgProperties` aside; add/remove/edit persist to `<file>.svg.refs.json`.
- [ ] Reopening the SVG restores the source list.
- [ ] Empty source lists do not leave behind a sidecar (SVG) or do not bloat the JSON (Tab).
- [ ] `tabRefs` v1, v2, v3 all read correctly; writes always emit v3.
- [ ] No regression in existing tab section-id / track-id behaviour.
- [ ] Unit + integration tests green; lint and typecheck clean.

## 9. Files added / modified

Added:
- `src/app/knowledge_base/shared/types/attachments.ts`
- `src/app/knowledge_base/domain/svgRefs.ts`
- `src/app/knowledge_base/infrastructure/svgRefsRepo.ts`
- `src/app/knowledge_base/infrastructure/svgRefsRepo.test.ts`
- `src/app/knowledge_base/features/tab/hooks/useTabSources.ts`
- `src/app/knowledge_base/features/tab/hooks/useTabSources.test.tsx`
- `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.ts`
- `src/app/knowledge_base/features/svgEditor/hooks/useSvgMeta.test.tsx`
- `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.tsx`
- `src/app/knowledge_base/features/svgEditor/properties/SvgProperties.test.tsx`

Modified:
- `src/app/knowledge_base/domain/tabRefs.ts` — v3 type, retained v1/v2 for migration.
- `src/app/knowledge_base/infrastructure/tabRefsRepo.ts` — v2 → v3 read migration; emit v3 on write.
- `src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts` — v2 → v3 cases added.
- `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` — mount SourcesSection.
- `src/app/knowledge_base/features/tab/properties/TabProperties.test.tsx` — section-presence and add-source case.
- `src/app/knowledge_base/features/svgEditor/SVGEditorView.tsx` — flex row + SvgProperties aside.
- `src/app/knowledge_base/features/svgEditor/SVGEditorView.test.tsx` — aside-rendering case.
- `src/app/knowledge_base/shell/RepositoryContext.tsx` — register `svgRefs`.
- `src/app/knowledge_base/shell/RepositoryContext.test.tsx` — stub provider for `svgRefs`.
- `Features.md` — entries for SVG sources and tab file-level sources.
- `test-cases/04-svg-editor.md`, `test-cases/11-tabs.md` — new IDs.

## 10. Rollout

Single PR on a single branch, no feature flag. The change is opt-in by user action (no source = no sidecar = no behaviour change), so no risk to existing files. Skill follow-up (MVP 5 Tasks 5 & 6) is a separate small PR after merge.
