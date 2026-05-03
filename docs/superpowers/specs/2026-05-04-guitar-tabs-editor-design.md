# TAB-008 Guitar Tabs Editor v1 — Design

**Status:** approved 2026-05-04 (brainstorm)
**Ticket:** TAB-008 (M2 entry point)
**Source spec:** `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` (§ "Edit sequence (M2)", § "Acceptance for M2 ship")
**Handoff:** `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`

## Goal

Ship the first interactive editor for `.alphatex` tabs: click any cell on the rendered staff, type a fret number, apply techniques and durations via keyboard / toolbar, undo and redo, and save back to disk. Single-track scope. Multi-track + per-track tuning/capo are TAB-009; export is TAB-010.

## Non-goals

- Multi-track or multi-voice editing (TAB-009).
- Track add/remove, per-track tuning, per-track capo (TAB-009).
- Export to MIDI / WAV / PDF (TAB-010).
- Raw alphaTex power-user mode (deferred to M3 per source spec open question #3).
- Recording from a real guitar (out per source spec non-goals).

## Acceptance (extends source spec § "Acceptance for M2 ship")

- Toggle edit mode via `useReadOnlyState` toolbar button on desktop. Read-only stays forced on mobile via the existing `paneReadOnly` injection on `TabPaneContext`.
- Click any string at any beat → cursor highlights the cell.
- Number keys 0–9 set fret value. Multi-digit values auto-commit on next non-digit keystroke or after 500 ms.
- Arrow keys / Tab / Shift+Tab move the cursor between cells. Esc clears selection.
- `Alt+1` … `Alt+6` set the active duration (`Alt+1` = whole, `Alt+2` = half, `Alt+3` = quarter, `Alt+4` = eighth, `Alt+5` = sixteenth, `Alt+6` = thirty-second). The active duration is what new fret entries get tagged with. Bare `1`–`6` always mean fret values — durations require the modifier to disambiguate from fret entry. The toolbar's six duration buttons remain the primary discoverable surface; the keyboard shortcuts are power-user accelerators.
- Technique keys H, P, B, S, T, ~, P-M (Shift+M), L-R (Shift+L) toggle a technique on the cell at the cursor. `T` toggles tie. B and S apply default parameters; per-note adjustments live in the Properties panel.
- ⌘Z / Ctrl+Z undo; ⌘⇧Z / Ctrl+Y redo. History is per committed `TabEditOp`, ring-buffered to ~200 frames.
- Save is debounced (300 ms) via the existing `tabRepo.write` path; dirty marker shows in the toolbar.
- Section renames in the editor produce a sidecar (`<file>.alphatex.refs.json`) so cross-references survive rename + reorder in the same save.

## Decisions log

These are the decisions the brainstorm reached. Implementation must match.

### D1 — Edit-cycle mechanics

Operate on alphaTab's `Score` AST in memory; persist by serializing the Score to alphaTex.

The session keeps the live `Score` captured from `scoreLoaded`. `applyEdit` mutates the Score (find bar / beat / note → set property), then calls `api.renderScore(score)` to repaint in place. New metadata is re-derived from the mutated Score and emitted on the existing `loaded` event so consumers refresh. On debounced save, the editor chunk serializes the Score back to alphaTex via `alphaTexExporter.ts` and writes through `tabRepo.write`.

**Rejected alternatives:**
- *alphaTex string-rewrite as primary path* — brittle across imported `.gp` content the user didn't author; full-text undo snapshots would be required.
- *Custom intermediate AST* — re-implements a parser + serializer for a grammar alphaTab already implements; round-trip fidelity loss is near-certain.

**Plan-phase verification gate.** Before committing the implementation, the plan must inspect `node_modules/@coderline/alphatab/` and confirm:

1. `api.renderScore(score)` is publicly exported and accepts a mutated `Score`.
2. A `Score` → alphaTex serializer (e.g. `AlphaTexExporter`) exists.
3. In-place Score mutation is safe vs. requiring `score.clone()` per edit (affects performance).

If (2) is missing, the fallback is a **bar-scoped alphaTex rewriter**: keep original alphaTex as base, locate the modified bar via the Score's bar index, regex-rewrite only that bar's text, leave the rest untouched. Materially smaller diff than full string-rewrite because the change is bounded by the op. If this fallback is engaged, the plan amends D1 and the implementation owns the rewriter.

### D2 — Interaction model: persistent cursor + direct keypress

Click a cell → it becomes the active cursor. Number keys 0–9 set fret values; arrow / Tab / Shift+Tab move the cursor; Esc clears.

**Rejected alternatives:**
- *Modal popover at the cell* — extra click + keystroke per note; tab entry is note-dense.
- *Hybrid (cursor + popover for parameter techniques)* — adds a popover sub-system the rest of the UI doesn't need.

### D3 — Edit-mode entry: mirror `useReadOnlyState`

The editor chunk loads only when `effectiveReadOnly === false`, where `effectiveReadOnly = paneReadOnly || perFileReadOnly`. `paneReadOnly` is the existing prop set by `TabPaneContext` (mobile force-true). `perFileReadOnly` comes from `useReadOnlyState(filePath, "tab-read-only")`, mirroring `DocumentView`'s pattern. Toolbar carries an Edit / Read toggle button visible only on desktop (mobile hides it because `paneReadOnly` overrides anyway).

### D4 — Toolbar layout: dedicated row

A second toolbar row sits below the existing `TabToolbar` (transport / tempo / loop) when edit mode is on. It carries:

- 6 duration buttons (whole / half / quarter / eighth / sixteenth / thirty-second).
- 8 technique toggles (H, P, B, S, T, ~, P-M, L-R).
- Undo / redo.

Hidden in read-only mode. Mirrors the industry pattern (Songsterr / Guitar Pro / MuseScore) and stays predictable + testable.

### D5 — Bend / slide parameters: defaults at insertion + Properties panel adjustment

Pressing `B` applies a default ½-step bend. Pressing `S` applies slide-up by default; repeated `S` cycles slide-up → slide-down → off (slide-to-target is not in the cycle because it requires a target fret that the keyboard cycle can't supply meaningfully). Per-note adjustments (bend amount, slide direction including slide-to-target with a target fret, ghost / tap / tremolo / harmonic flags from the wider `Technique` enum) live in a new "Selected note details" subsection in the Properties panel — extends `TabProperties` rather than introducing a new floating UI primitive.

### D6 — Undo / redo: per committed op, inverse-op storage

`useTabEditHistory` stores frames as `{ op, inverse, ts }`. Inverse is computed at apply time from the pre-state (e.g. `set-fret(beat,string,12)` snapshots the previous value into `set-fret(beat,string,prev)`). Multi-digit fret entry produces one frame per *committed* value, not per keystroke. Past array bounded at 200 frames; oldest evicts FIFO. ⌘Z / Ctrl+Z undo; ⌘⇧Z / Ctrl+Y redo.

### D7 — Section-id sidecar (parked item #12 closure)

`<file>.alphatex.refs.json` sits as a sibling next to the canonical `.alphatex`. Lazy creation: written on first `TabEditOp` that successfully applies. Identity-only payload — attachment data stays on the document side (existing reverse index unchanged).

**Schema:**

```json
{
  "version": 1,
  "sections": {
    "intro-riff": { "currentName": "Intro Riff", "createdAt": 1746500000000 },
    "verse-1":    { "currentName": "Verse 1",    "createdAt": 1746500000000 }
  }
}
```

**Lifecycle:**

- *Load.* `tabRefsRepo.load(filePath)` returns `{ version, sections }` or empty. The resolver builds `currentName → stableId` from the sidecar; sections without a sidecar entry fall back to today's `slugifySectionName + collision suffix`.
- *First edit.* When a `TabEditOp` is applied to a sidecar-less file, the editor seeds the sidecar with all current sections, using their slug-derived ids as stable ids, then writes.
- *Rename (`set-section`).* Find by old `currentName` → update to new name. Stable id unchanged.
- *Delete.* Remove the entry. Cross-references become orphaned (existing `migrateAttachments` semantics; no new behaviour).
- *Add.* New entry; new stable id derived from slug at creation time.

`useTabSectionSync` (the existing position-based reconciler) becomes a no-op once a sidecar exists; it stays as the fallback for sidecar-less files (read-only access in older vaults).

### D8 — Parked item #6 fold-in: shared `properties-collapsed` constant

Adding the editor surface (which grows `TabProperties` with a "Selected note details" subsection) is the right moment to consolidate the duplicated `"properties-collapsed"` literal across `DocumentView`, `DiagramView`, and `TabView`. Introduce `shared/constants/paneStorage.ts` exporting `PROPERTIES_COLLAPSED_KEY`. Refactor the three existing call sites in the same PR. The editor chunk's properties hook reads the same key — collapse state is shared across all panes today and stays that way.

### D9 — Parked item #11 stays parked

Diagram attachment integrity (rename / delete cleanup) is unrelated to TAB-008's tab + editor surface. Carry forward as a standalone follow-up; do not expand TAB-008's diff.

## Architecture

### Module layout

```
features/tab/
  TabView.tsx                          existing surface; conditionally lazy-loads editor chunk on !effectiveReadOnly
  hooks/
    useTabEditMode.ts                  composes useReadOnlyState + paneReadOnly into effectiveReadOnly
  editor/                              entire subtree IS the lazy-loaded sibling chunk
    TabEditor.tsx                      chunk entry; renders toolbar + canvas overlay
    TabEditorToolbar.tsx               duration / technique / undo controls
    TabEditorCanvasOverlay.tsx         transparent positioned div over TabCanvas; renders cursor highlight + handles pointer events
    components/
      DurationButtons.tsx              6 duration shortcuts
      TechniqueButtons.tsx             8 toggle buttons; lit when active on selected note
      HistoryButtons.tsx               undo / redo
    hooks/
      useTabCursor.ts                  { trackId, beat, string } cursor state + arrow/Tab navigation
      useTabKeyboard.ts                number / duration / technique keypress dispatch + multi-digit accumulator
      useTabEditHistory.ts             inverse-op ring buffer; exposes apply / undo / redo
      useSelectedNoteDetails.ts        reads current note's bend amount / slide direction for Properties panel
domain/
  tabEngine.ts                         existing; applyEdit declared optional, becomes required-when-chunk-loaded by convention
  tabSectionIds.ts                     stable-id resolver: combines slug-based current ids with sidecar overrides
infrastructure/
  alphaTabEngine.ts                    AlphaTabSession.applyEdit implementation (Score AST mutation)
  alphaTexExporter.ts                  Score → alphaTex serializer (alphaTab exporter wrapper, or fallback bar-scoped rewriter)
  tabRefsRepo.ts                       FSA-backed sidecar repo; load / write / migrate
shared/
  hooks/useReadOnlyState.ts            existing; reused with prefix "tab-read-only"
  constants/paneStorage.ts             NEW; PROPERTIES_COLLAPSED_KEY shared constant (D8)
```

### Bundle gate

`TabView.tsx` lazy-loads `editor/TabEditor.tsx` via `next/dynamic({ ssr: false })`. The dynamic import sits inside a `useMemo` keyed on `effectiveReadOnly` so the chunk is requested at most once per pane lifetime and never on mobile or in read-only mode. The marker comment at `TabView.tsx:170` is removed; the chunk gate replaces it.

### Data flow (one edit, end to end)

```
User cursor on (track=0, bar=4, beat=2, string=3); presses "1" then "2"
  ↓ useTabKeyboard accumulates digits (500 ms timeout or next non-digit)
  ↓ commit → useTabCursor.applyAtCursor({ type: "set-fret", trackId: "0", beat: 4 + 2/4, string: 3, fret: 12 })
  ↓ useTabEditHistory.apply(op)
    ↓ snapshot pre-state at (trackId, beat, string) → inverse = { type: "set-fret", ..., fret: prev }
    ↓ push frame onto past[]; clear future[]
    ↓ session.applyEdit(op)
        ↓ AlphaTabSession mutates Score AST (find bar / beat / note, set fret)
        ↓ api.renderScore(score) re-renders in place
        ↓ scoreToMetadata(score) → emit "loaded" with new metadata
  ↓ useTabEdit consumes metadata → marks dirty
  ↓ useTabContent debounce (300 ms) → serializeScoreToAlphatex(score) → tabRepo.write(filePath, text)
  ↓ on success: clear dirty
  ↓ if op was set-section / add-bar producing a new section / remove-bar dropping one:
        tabRefsRepo.update(filePath, mutation)
```

### Failure modes

| Failure | Surface |
|---|---|
| `applyEdit` throws (op references missing bar / beat) | `ShellErrorBanner` via `useShellErrors().reportError`; cursor remains where it was; history frame not pushed. |
| `serializeScoreToAlphatex` throws | Banner: "Couldn't save tab — the editor produced invalid alphaTex." Dirty state preserved so the user can ⌘Z and try a different op. |
| `tabRefsRepo.write` fails (FS error) | Banner via `useShellErrors`; sidecar update silently retries on next save. The edit itself is committed (degrades to today's slug-only ids until the sidecar lands). |
| `renderScore` not in alphaTab public API | Plan-phase verification catches this; spec is amended; falls back to `tex(serialized)` round-trip with an acknowledged perf hit. |
| `AlphaTexExporter` not in alphaTab public API | Plan-phase verification catches this; D1 fallback engaged (bar-scoped alphaTex rewriter). |

## Persistence

Mirrors `useDocumentContent` exactly: dirty flag in `useTabContent`, debounced `tabRepo.write` at 300 ms after last edit, conflict path via `ConflictBanner` on file-watcher events, `ShellErrorBanner` for write failures. The sidecar (`tabRefsRepo`) writes alongside but only when section-affecting ops touched it; both writes are independent so a sidecar failure doesn't block a content save.

## Properties panel growth

`TabProperties` gains a "Selected note details" subsection rendered when the editor chunk is loaded and the cursor has a value. Initial fields: bend amount (`½ / full / 1½ / custom`), slide direction (`up / down / target`), slide-target fret (when direction = target). Subsection is hidden in read-only mode. Read source: `useSelectedNoteDetails(score, cursor)` resolves the current note's parameters.

## Testing strategy

### Unit (vitest)

- `alphaTabEngine.applyEdit.test.ts` — each op type against a fake Score; verifies AST mutation + metadata re-derivation.
- `tabRefsRepo.test.ts` — load / write / migrate; mirror `documentRepo.test.ts` shape.
- `tabSectionIds.test.ts` — resolver combines slug-based current ids with sidecar overrides; rename + reorder + delete + add cases.
- `useTabEditHistory.test.ts` — ring-buffer semantics; inverse correctness for each op type; depth eviction.
- `alphaTexExporter.test.ts` — round-trip Score → alphaTex → Score for representative fixtures (or, if fallback engaged, bar-scoped rewriter against canonical inputs).

### Component (vitest + RTL)

- `TabEditor.test.tsx` — engine mocked; cursor click → number key → op dispatch verified.
- `TabEditorToolbar.test.tsx` — duration / technique / undo button states + interactions.
- `TabProperties.selectedNote.test.tsx` — selected-note subsection visibility + adjustment dispatch.

### e2e (Playwright)

- `e2e/tab-editor.spec.ts` — open a fixture `.alphatex`, toggle edit mode, click a string, type a fret, save, reopen, assert persistence. Defines and reuses the **e2e fixture pattern** (parked items #4 / #5): a tiny inline alphaTex string written to a temp Playwright vault before the test. This pattern is documented inline in the test file so future tab e2e tests can adopt it.

### Test cases

New `TAB-12.x-NN` IDs added to `test-cases/11-tabs.md` covering:

- Cursor placement, navigation, multi-digit fret entry, Esc clears.
- Each technique toggle (8) + each duration shortcut (6).
- Bend default + Properties panel adjustment.
- Undo / redo per op + depth eviction at 200.
- Section rename + reorder in same save (sidecar migration).
- `effectiveReadOnly` composition (mobile force-true, desktop per-file toggle).
- Conflict-banner path on external file change while dirty.

## Working agreements check

- One PR per ticket — TAB-008 ships as one PR.
- Tests live with code — unit + component beside files; e2e in `e2e/`.
- Prose specs are sources of truth — `test-cases/11-tabs.md` and `Features.md` updated in same PR.
- Don't break documented strengths — `TabEngine` interface is unchanged; `applyEdit` was already declared optional.
- Branch per unit of work — `plan/guitar-tabs-editor`.
- No git worktrees.

## Risks

- **alphaTab API verification gates the implementation.** If `renderScore` and a Score-to-alphaTex serializer are both unavailable in the public API, the spec needs amendment and either path is materially more work. Plan phase resolves this in the first day.
- **Score AST mutation safety.** Mutating an in-place Score that alphaTab is also reading could surface race conditions. If `score.clone()` is required per edit, performance characteristics change (still acceptable but worth measuring).
- **Sidecar write atomicity.** Two writes (content + sidecar) per save means a partial-failure window. Mitigation: write sidecar second; on failure, retry on next save without blocking the content write.
- **Editor chunk size.** Adding cursor + history + toolbar code to the editor chunk should stay well under the alphaTab core chunk's size, but the budget is worth checking with `next build --analyze` once the chunk exists.

## Plan-phase open items

1. Confirm `api.renderScore(score)` is publicly exported and stable in `@coderline/alphatab` ≥ 1.6.x.
2. Confirm `AlphaTexExporter` (or equivalent Score → alphaTex serializer) exists; if not, lock the bar-scoped rewriter fallback.
3. Confirm in-place Score mutation is safe; otherwise budget `score.clone()` per edit.
4. Confirm alphaTab exposes a beat / note hit-test API for click-to-cursor; if not, the canvas overlay computes cell positions from the Score's bar index + render geometry.
