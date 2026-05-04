# TAB-009 Guitar Tabs Multi-Track + Multi-Voice — Design

**Status:** approved 2026-05-04 (brainstorm)
**Ticket:** TAB-009 (folds in TAB-009a — track-level attachment surface)
**Source spec:** `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` (§ "Acceptance for M2 ship")
**Predecessor:** `docs/superpowers/specs/2026-05-04-guitar-tabs-editor-design.md` (TAB-008, merged 2026-05-04 as PR #111)
**Handoff:** `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`

## Goal

Extend the single-track editor shipped in TAB-008 to support multi-track + multi-voice tabs end-to-end: switch the active track, edit each track independently, add and remove tracks, edit per-track tuning + capo, mute and solo tracks during playback, edit two voices per bar (V1 / V2), and attach docs at track granularity. Closes the M2 acceptance contract that TAB-008 left open.

## Non-goals

- Per-track capo *transposition* of incoming MIDI / playback pitch — alphaTab handles audio output; we set the value, alphaTab renders it.
- Mute/solo persistence across pane reload (session-only by design — see D3).
- Track-level **automation** (volume curves, pan changes mid-song) — out of scope for M2.
- Multi-instrument scope (drums, piano) — guitar / bass only at M2 per source spec open question #4.
- Export — TAB-010.
- Raw alphaTex power-user mode — deferred to M3.

## Acceptance (closes source spec § "Acceptance for M2 ship")

- Active track switches via the Properties panel's track row (click) and via `[` / `]` keyboard shortcuts. Active state shown by 3 signals (filled dot indicator + bold name + accent border-left) — never color alone.
- Add a track via the inline `+ Add track` row at the bottom of the Tracks list. Form fields: Name (required), Instrument (dropdown: guitar, bass). Defaults: tuning copied from currently-active track, capo = 0. New track appears at the end of the track list, becomes active.
- Remove a track via the row's `⋯` kebab menu. Confirm dialog if the track has any notes. The last remaining track is non-removable (engine throw + UI hide).
- Edit per-track tuning: 6 string-pitch inputs (or 4 for bass) shown inline under the active track row. Live validation against alphaTab's pitch grammar.
- Edit per-track capo: number input (0–24) inline under the active track row.
- Mute / solo per track via inline `M` and `S` icon-buttons on each track row. Both have `aria-label` and `aria-pressed`. Solo precedence: any soloed track silences all non-soloed; mute always silences regardless of solo state. Session-only — resets on pane reload.
- Edit two voices per bar: toolbar `[V1 | V2]` segmented toggle drives `cursor.voiceIndex`. New beat ops land in the active voice. Existing V1 content is preserved when V2 is added; voices render in separate stems on the canvas (alphaTab's native rendering).
- Track-level attachments (TAB-009a fold-in): docs can be attached to a specific track via the existing `DocumentPicker` opened against `entityType: "tab-track"`. The track row shows attached doc badges and a `+` button to attach more. The Properties panel surfaces "Tabs that reference this" backlinks at track granularity (mirroring TAB-007a sections).
- Stable track IDs survive rename + reorder via the existing `.alphatex.refs.json` sidecar (extended with a `trackRefs` map mirroring the section-id pattern).
- All beat-touching ops are undo / redo correct under multi-track scope: edits to one track never alter another; the inverse op restores exactly the prior state.

## Decisions log

These are the decisions the brainstorm reached. Implementation must match.

### D1 — Scope: full M2 bundle in one ticket

TAB-009 ships add/remove track + per-track tuning + per-track capo + mute/solo + multi-voice (V1/V2) editing + track-level attachments (TAB-009a fold-in) in a single PR.

**Rejected alternatives:**
- *Defer multi-voice to TAB-009b.* Splits the engine + cursor changes into a follow-up PR. Lower per-PR risk but breaks the M2 ship-point promise.
- *Minimal — multi-track only, defer mute/solo + multi-voice.* Conservative; doesn't close M2 acceptance.

Trade-off accepted: ~1.5 weeks instead of the spec-estimated ~1 week. The infrastructure changes are interdependent (cursor must learn `voiceIndex` before mult-voice works; ops must take `trackId` before per-track tuning serialization works), so splitting buys little.

### D2 — UI placement: Properties panel only

All track management (active-track switching, add, remove, mute / solo, per-track tuning + capo) lives in the existing `TabProperties.tsx → Tracks` subcomponent — extended from read-only to interactive. The editor toolbar gains only the new `[V1 | V2]` voice toggle.

**Rejected alternatives:**
- *Toolbar quick-switcher + Properties detail.* DAW muscle memory benefit, but duplicates active-track state in two surfaces, requiring sync logic on every track change. Violates `feedback_overlay_state_locality.md`.
- *DAW-style left rail.* Introduces a new layout primitive not present in DocumentView or DiagramView. Largest blast radius for the smallest UX win.

The active-track indication uses three signals (filled dot + bold name + accent left-border), enforced by ui-ux-pro-max's "color-only is forbidden" guideline.

### D3 — Mute/solo persistence: session-only

Mute and solo state lives in `TabView` component state (`Map<trackId, { muted, soloed }>`) and is wired to alphaTab via a new `TabSession.setPlaybackState(...)` method. Lost on pane close or reload.

**Rejected alternatives:**
- *Per-file localStorage* — accumulates stale entries; no cleanup hook for renamed/deleted tab files.
- *Sidecar (`.alphatex.refs.json`) extension* — mixes notation-stable concerns with playback-state ephemera in a file that's otherwise a stable references map.

Rationale: mute/solo is a "let me hear just this part right now" while-editing affordance, rarely something users want preserved. No persistence surface = no stale-state bugs.

### D4 — Per-track data model in `TabMetadata`

Top-level `metadata.tuning` and `metadata.capo` are removed. `tracks[i]` gains `tuning: string[]` and `capo: number`. Every existing consumer that reads top-level tuning / capo (`TabProperties` Tuning subcomponent, `useTabCursor.moveString`, `scoreToMetadata`, `SelectedNoteDetails`) is touched in this PR to read from per-track state instead. `useTabSectionSync` and the section sidecar path are unaffected — they consume `sectionRefs`, not tuning / capo.

**Rejected alternatives:**
- *Dual fields — top-level as "track 0's view".* Two sources of truth; subtly desyncs when per-track UI mutates and top-level lags.
- *Top-level becomes "default for new tracks".* Conceptually muddled; the rendering pipeline still has to pick one.

Single source of truth matches alphatex grammar (`\tuning` and `\capo` live inside `\track` blocks). Breaking change is contained — codebase is small enough to update every consumer in one PR.

### D5 — Add-track flow: inline form

The `+ Add track` row at the bottom of the track list expands inline into a form (Name input, Instrument dropdown) with Save / Cancel buttons. No modal. Defaults: tuning copied from the active track, capo = 0. Mirrors the existing `DocumentPicker` create-row inline pattern shipped via parked-cleanup #13.

**Rejected alternatives:**
- *Modal dialog* — heavier UI surface than the action warrants; no existing modal pattern in the tab pane to reuse.
- *Palette command only* — undiscoverable; properties panel is where users already are when managing tracks.

### D6 — Remove-track flow: kebab + confirm + last-track guard

Each track row's `⋯` kebab menu offers a "Remove track" item. If the target track has any notes, a confirm dialog ("Remove `<name>`? This deletes <N> notes.") gates the action. The last remaining track is non-removable: engine throws `"Cannot remove the only track"` (parallels existing `applyRemoveBar` "cannot remove only bar" rule); UI hides the option client-side as the primary guard.

### D7 — Cursor extension: `voiceIndex`, voice toggle in toolbar

`CursorLocation` adds `voiceIndex: 0 | 1`. Default is `0`. The editor toolbar's `[V1 | V2]` segmented toggle drives `cursor.voiceIndex`; new beat ops land in the active voice. Existing V1 content is never touched when the user switches to V2.

`[` and `]` keyboard shortcuts cycle the active track (prev / next, clamp at ends — no wrap). No `Tab` shortcut — would collide with browser focus management. The existing input/select/textarea guard from TAB-008's C4 fix continues to apply.

### D8 — `applyEdit` op signature: `trackId` + `voiceIndex` parameterization

Every beat-touching op variant gains optional `trackId?: string` and `voiceIndex?: 0 | 1`. When omitted, the op acts on the active cursor's track + voice — preserving call-site ergonomics for the common case. New ops:

- `add-track` → `{ type: "add-track"; name: string; instrument: "guitar" | "bass"; tuning: string[]; capo: number }`
- `remove-track` → `{ type: "remove-track"; trackId: string }`

Existing track ops (`set-track-tuning`, `set-track-capo`) already carry `trackId` and just need their infrastructure handlers wired.

No `set-mute` or `set-solo` op — mute/solo is session-only (D3) and goes through `TabSession.setPlaybackState`, not `applyEdit`.

### D9 — Track stable IDs: extend the existing sidecar

`.alphatex.refs.json` (shipped in TAB-008 for sections) gains a `trackRefs: { stableId → currentName }` map. Sidecar schema bumps from v1 → v2. `tabRefsRepo` reads / writes both keys; `updateSidecarOnEdit` reconciles on `add-track` / `remove-track` ops. Lazy creation on first edit — the read path returns `null` for files without a sidecar and the consumer falls back to position-based track ids (`tracks[i].id = String(i)`).

`tab-track` entity ids are `<filePath>#track:<stableTrackId>`, mirroring the existing `tab-section` entity-id pattern.

**Rejected alternatives:**
- *UUIDs assigned at first-edit time, embedded in alphatex as a comment.* Pollutes the file format; sidecar is the established pattern.
- *Separate `<file>.alphatex.tracks.json` sidecar.* More files to keep in sync; one sidecar with two ref maps is cleaner.

### D10 — TAB-009a track-level attachments: fold in

TAB-009a's "Track-level attachment surface" (1-day add-on per source spec) folds into TAB-009. New `entityType: "tab-track"` joins `tab` and `tab-section` in the `TabPaneContext` wiring. `migrateAttachments` learns the new entity type. The track row shows attached doc badges and a `+` button. The doc-side Properties panel surfaces "Tabs that reference this track" backlinks. Same shape as TAB-007a sections.

## Architecture

### Domain (`src/app/knowledge_base/domain/tabEngine.ts`)

```ts
export interface TabMetadata {
  title: string;
  artist?: string;
  subtitle?: string;
  tempo: number;
  key?: string;
  timeSignature: { numerator: number; denominator: number };
  // REMOVED: capo, tuning (top-level)
  tracks: {
    id: string;
    name: string;
    instrument: "guitar" | "bass";
    tuning: string[];
    capo: number;
  }[];
  sections: { name: string; startBeat: number }[];
  totalBeats: number;
  durationSeconds: number;
}

export interface CursorLocation {
  trackIndex: number;
  voiceIndex: 0 | 1; // NEW
  beat: number;
  string: number;
}

export type TabEditOp =
  | { type: "set-fret"; beat: number; string: number; fret: number | null;
      trackId?: string; voiceIndex?: 0 | 1 } // trackId, voiceIndex new
  | { type: "set-duration"; beat: number; duration: NoteDuration;
      trackId?: string; voiceIndex?: 0 | 1 }
  | { type: "add-technique"; beat: number; string: number; technique: Technique;
      trackId?: string; voiceIndex?: 0 | 1 }
  | { type: "remove-technique"; beat: number; string: number; technique: Technique;
      trackId?: string; voiceIndex?: 0 | 1 }
  | { type: "set-tempo"; beat: number; bpm: number }
  | { type: "set-section"; beat: number; name: string | null }
  | { type: "add-bar"; afterBeat: number }
  | { type: "remove-bar"; beat: number }
  | { type: "set-track-tuning"; trackId: string; tuning: string[] }
  | { type: "set-track-capo"; trackId: string; fret: number }
  | { type: "add-track"; name: string; instrument: "guitar" | "bass";
      tuning: string[]; capo: number } // NEW
  | { type: "remove-track"; trackId: string }; // NEW

export interface TabSession {
  // ...existing methods unchanged
  setPlaybackState(state: {
    mutedTrackIds: string[];
    soloedTrackIds: string[];
  }): void; // NEW
}
```

### Infrastructure (`src/app/knowledge_base/infrastructure/alphaTabEngine.ts`)

- `locateBarIndex(score, beat, trackId, voiceIndex)` — currently hardcoded to `tracks[0].staves[0].voices[0]`. Parameterize.
- `locateBeat(score, beat, trackId, voiceIndex)` — same parameterization.
- New `applyAddTrack(op)`: clone a default-shape track structure (1 staff, N bars matching existing track count, 1 voice, rest beats), append to `score.tracks`, emit metadata refresh.
- New `applyRemoveTrack(op)`: throw if last track. Splice from `score.tracks`.
- `applyAddBar` already iterates all tracks/staves — leave alone. Verify `applyRemoveBar` does the same (it does).
- `scoreToMetadata`: extract `tuning` and `capo` per track (alphaTab Score exposes both on `Track` instances). No top-level fields emitted.
- `setPlaybackState`: maps the public `TabSession` arg to alphaTab's per-track gain (mute = gain 0; solo set non-empty = non-soloed tracks gain 0).

### Persistence (`tabRefsRepo.ts`, sidecar v2)

```ts
export interface TabRefsPayload {
  version: 2; // bumped from 1
  sectionRefs: Record<string, string>;     // existing
  trackRefs: Record<string, string>;       // NEW
}
```

- `read(path)` — handles both v1 and v2 payloads. v1 payloads (no `trackRefs`) read as `{ ..., trackRefs: {} }` for forward compat.
- `write(path, payload)` — always writes v2.
- `updateSidecarOnEdit(prev, op)` — extends to handle `add-track` (assigns new `stableId`, registers `stableId → name`) and `remove-track` (drops the entry). Existing section reconciliation untouched.

### Components

**`TabProperties.tsx` — interactive Tracks subcomponent:**
- New props: `onSwitchActiveTrack`, `onAddTrack`, `onRemoveTrack`, `onSetTrackTuning`, `onSetTrackCapo`, `onToggleMute`, `onToggleSolo`, `mutedTrackIds`, `soloedTrackIds`, `activeTrackIndex`.
- Renders track rows + inline expand for active row + `+ Add track` row + add-form state.
- Reads `trackRefs` from sidecar payload to display backlinks per track at the row level.

**`TabEditorToolbar.tsx`:**
- New `<VoiceToggle voiceIndex={cursor.voiceIndex} onChange={setVoice} />` segmented control.

**`useTabCursor.ts`:**
- `CursorLocation` shape extended with `voiceIndex`.
- `moveString` uses `metadata.tracks[cursor.trackIndex].tuning` instead of top-level `metadata.tuning`.
- New `nextTrack` / `prevTrack` actions exposed.

**`useTabKeyboard.ts`:**
- `[` → `prevTrack`. `]` → `nextTrack`. Existing input-element guard applies.

**`TabPaneContext.tsx`:**
- Add `tab-track` to the entity-type union. Same `registerEntity` shape as `tab-section`.

**`SelectedNoteDetails.tsx`:**
- Reads `metadata.tracks[cursor.trackIndex]` for tuning context (string label).

## Data flow

- **Active-track switch**: row click or `[` / `]` → `setCursor({ trackIndex, voiceIndex: 0, beat: 0, string: 1 })` → re-render. Single source of truth — no duplicate state.
- **Edit path**: `useTabKeyboard` / overlay click → builds op with `trackId = metadata.tracks[cursor.trackIndex].id` and `voiceIndex = cursor.voiceIndex` → `useTabEditHistory.applyAndCapture` → `engine.applyEdit(op)` → `engine.serialize()` → `useTabContent` debounced write → `tabRefsRepo.write` reconciles sidecar (sections + tracks) on track-mutating ops.
- **Mute/solo**: row M/S click → `TabView` setState → `engine.setPlaybackState({ mutedTrackIds, soloedTrackIds })` → alphaTab flips per-track gain. No file write, no sidecar write.
- **Add-track**: form save → `applyEdit({ type: "add-track", ... })` → engine appends → metadata emits → sidecar registers new stableId → cursor switches to the new track → form collapses.
- **Remove-track**: kebab → confirm → `applyEdit({ type: "remove-track", trackId })` → engine splices → metadata emits → sidecar drops the stableId → cursor snaps to `trackIndex=0` if the active track was removed.

## Error handling

- `applyAddTrack` failure (alphaTab AST mutation throws) → caught at `applyAndCapture` boundary, surfaces via existing `ShellErrorContext` banner.
- `applyRemoveTrack` of last track → throw `"Cannot remove the only track"` from infrastructure. UI hides the kebab item; the throw is the safety net.
- Sidecar write failure → typed `FileSystemError` via `tabRefsRepo`, banner via `useShellError` (existing path).
- Cursor pointing into a removed track → snap to `trackIndex=0, voiceIndex=0, beat=0` after `remove-track` resolves (mirrors TAB-008's `remove-bar` cursor recovery).
- Sidecar v1 payload encountered → read-path migrates in memory (`trackRefs: {}`); next write upgrades to v2 on disk.
- Invalid tuning input (non-pitch string) → inline validation message under the input; op not dispatched until valid.

## Testing strategy

### Unit (vitest)

- `alphaTabEngine.applyEdit.test.ts`:
  - Multi-track scenario: `set-fret` on track[1] doesn't mutate track[0].
  - `add-track` round-trip: track count grows by 1; new track has the correct tuning, capo, instrument; new track's bar count matches existing.
  - `remove-track`: track count drops; last-track throw asserted.
  - `set-track-tuning` / `set-track-capo`: target track's metadata updates; siblings untouched.
  - Voice scoping: V1 edits don't touch V2 and vice versa.
  - Inverse-op symmetry for new ops (`add-track` ↔ `remove-track`).
- `tabRefsRepo.test.ts`:
  - v2 round-trip with `trackRefs`.
  - v1 payload reads as `{ ..., trackRefs: {} }`.
  - Sidecar v1 → v2 in-place migration on next write.
- `useTabCursor.test.ts`:
  - `voiceIndex` defaults to 0.
  - `nextTrack` / `prevTrack` clamp at ends (no wrap — matches existing `moveBar` clamp behavior).
  - `moveString` reads from active track's tuning length.
- `inverseOf.test.ts`:
  - `add-track` ↔ `remove-track` inverse.
  - All existing op inverses still hold when `trackId` / `voiceIndex` are non-default.
- `sidecarReconcile.test.ts`:
  - `add-track` registers stableId.
  - `remove-track` drops stableId.
- `scoreNavigation.test.ts`:
  - All navigation helpers accept `trackIndex` + `voiceIndex` and respect them.

### Component (vitest + RTL)

- `TabProperties.test.tsx`:
  - Active-track click triggers `onSwitchActiveTrack`.
  - M / S buttons toggle and have correct `aria-pressed`.
  - Add-track form Save dispatches `onAddTrack`; Cancel collapses.
  - Remove-track kebab → confirm → `onRemoveTrack`; last-track guard hides item.
  - Inline tuning + capo inputs dispatch `onSetTrackTuning` / `onSetTrackCapo`.
  - Track-attachment badges render from `documents` prop scoped to `entityType: "tab-track"`.
- `TabEditorToolbar.editToggle.test.tsx` (extend) or new `TabEditorToolbar.voiceToggle.test.tsx`:
  - V1/V2 segmented toggle drives `onVoiceChange`. `aria-pressed` reflects state.
- `TabView.editor.test.tsx`:
  - `[` / `]` keyboard cycles active track.
  - Mute/solo state survives renders within the same pane lifecycle.
  - Mute/solo resets when the file path changes (pane reload semantics).
- `TabView.test.tsx`:
  - Per-track tuning is what the read-only Tuning section displays.

### Integration (vitest)

- `TabEditor.test.tsx`:
  - Multi-track edit + undo round-trip: edit on track[1], undo, assert track[1] reverted, track[0] never mutated.
  - V1 → V2 toggle + edit + undo: V2 edit doesn't touch V1.
  - Add-track → edit on new track → remove-track → undo restores both new track and its edits.

### e2e (Playwright)

- `e2e/tabEditor.spec.ts`: extend with multi-track scenario. Will share the existing Bravura-font `test.fixme()` blocker (parked item #14). Tracked, not fixed in TAB-009.

### test-cases/11-tabs.md

Fill §11.10 Multi-track (already reserved per TAB-008's contract) with cases TAB-11.10-01..N covering:

- TAB-11.10-01 Active track switch via row click flips cursor.
- TAB-11.10-02 `[` / `]` keyboard shortcuts cycle tracks.
- TAB-11.10-03 Add track via inline form appends and switches.
- TAB-11.10-04 Remove track via kebab + confirm; last-track guard.
- TAB-11.10-05 Per-track tuning edit is local to that track.
- TAB-11.10-06 Per-track capo edit is local to that track.
- TAB-11.10-07 Mute / solo session-only; session resets on pane reload.
- TAB-11.10-08 Solo precedence over mute (any solo silences non-soloed regardless of mute).
- TAB-11.10-09 Voice V1 / V2 toggle drives cursor; edits land in active voice.
- TAB-11.10-10 Edit on track[1] doesn't mutate track[0] in alphatex output.
- TAB-11.10-11 Track-level attachment via `DocumentPicker` against `tab-track` entity.
- TAB-11.10-12 Track row backlinks render from sidecar `trackRefs`.
- TAB-11.10-13 Sidecar v1 → v2 migration on next write.
- TAB-11.10-14 Add/remove track undo/redo restores cursor + track state.
- TAB-11.10-15 Last-track engine throw verified.

Each ticket's PR adds the corresponding sub-section + flips its cases ✅ / 🧪 in the same change set, per the working-agreements contract.

## Risks

- **alphaTab AST mutation surface for tracks** — `applyAddTrack` requires constructing a Track + Staff + Bar(s) + Voice(s) + Beat(s) skeleton from alphaTab's internal constructors. TAB-008 already does this for `applyAddBar`; the pattern extends but each new constructor reach is a brittleness vector. Mitigation: cover with multi-track unit tests against the same `structCtors` capture path TAB-008 uses.
- **Voice rendering correctness in alphaTab** — V2 editing relies on alphaTab's native two-voice rendering. If a bar has no V2 content, alphaTab renders normally; if V2 content is added, both voices appear with separate stems. Manual verification in dev required (Playwright blocked by Bravura font issue, parked item #14).
- **Sidecar migration timing** — v1 → v2 happens on next write, not on read. Files that are only read (never edited) keep v1 forever. Acceptable because v1 is forward-compatible (the read path produces empty `trackRefs`); track-level features just won't have stable ids until first edit, same as TAB-008's section sidecar pattern.
- **Per-track tuning input validation surface** — accepting arbitrary string input for pitch grammar is error-prone. Mitigation: validate against alphaTab's pitch regex; reject invalid input inline.
- **Bundle size from the expanded editor chunk** — multi-track UI adds ~3-5 KB gzipped (estimate). Already lazy-loaded behind the editor chunk; no change to mobile bundle.

## Working agreements check

- **One PR per ticket** → TAB-009 + TAB-009a fold-in is one PR.
- **Tests live with code** → unit + component beside files; e2e in `e2e/`.
- **Prose specs are sources of truth** → `test-cases/11-tabs.md` §11.10 fills in this PR; ids `TAB-11.10-NN` follow existing convention.
- **Don't break documented strengths** → `TabEngine` interface boundary preserved; `.alphatex` remains canonical; sidecar pattern reused.
- **Branch per unit of work** → `plan/guitar-tabs-multi-track` already cut.
- **Handoff doc updated in same branch** → mandated by `feedback_handoff_no_doc_only_pr.md`.
- **UI/UX audit** → Task #7 will run `ui-ux-pro-max` against the shipped UI on the same branch before PR, per the new CLAUDE.md rule.

## Open questions

None at brainstorm-close. All design decisions captured in the Decisions log above.

---

_End of design spec. Implementation plan to follow via `superpowers:writing-plans`._
