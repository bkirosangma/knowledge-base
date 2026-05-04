# TAB-009 Plan-Phase Verification Probe

**Date:** 2026-05-04  
**Source:** `node_modules/@coderline/alphatab/dist/alphaTab.d.ts`  
**Purpose:** Confirm alphaTab API shapes for T5 / T7 / T8 before implementation begins.

---

## 1. Confirmed APIs

### Track mutation (Score level)

| Symbol | Line | Signature |
|--------|------|-----------|
| `Score.tracks` | 14913 | `tracks: Track[]` |
| `Score.addTrack` | 14943 | `addTrack(track: Track): void` |
| `Track.staves` | 15988 | `staves: Staff[]` (annotated `@json_add addStaff`) |
| `Track.addStaff` | 16047 | `addStaff(staff: Staff): void` |
| `Track.index` | 15976 | `index: number` — zero-based position in `score.tracks` |
| `Track.name` | 16006 | `name: string` |
| `Track.playbackInfo` | 15991 | `playbackInfo: PlaybackInformation` |
| `Staff.capo` | 15546 | `capo: number` — fret number, 0 = no capo |
| `Staff.stringTuning` | 15561 | `stringTuning: Tuning` — the writable tuning object |
| `Staff.tuning` (getter) | 15563 | `get tuning(): number[]` — read-only MIDI int array |
| `Staff.bars` | 15527 | `bars: Bar[]` (annotated `@json_add addBar`) |

### PlaybackInformation (mute/solo state bag on Track)

| Field | Line | Notes |
|-------|------|-------|
| `PlaybackInformation.isMute` | ~13485 | `boolean` — persisted state on data model |
| `PlaybackInformation.isSolo` | ~13487 | `boolean` — persisted state on data model |
| `PlaybackInformation.volume` | ~13455 | `number` (0–16 int, GP-style) |

### AlphaTabApi playback controls (session-only)

| Method | Line | Signature |
|--------|------|-----------|
| `changeTrackMute` | 1518 | `changeTrackMute(tracks: Track[], mute: boolean): void` |
| `changeTrackSolo` | 1485 | `changeTrackSolo(tracks: Track[], solo: boolean): void` |
| `changeTrackVolume` | 1451 | `changeTrackVolume(tracks: Track[], volume: number): void` (0–1 percent) |
| `renderTracks` | 698 | `renderTracks(tracks: Track[], renderHints?: RenderHints): void` |

### Two-voice rendering

| Symbol | Line | Notes |
|--------|------|-------|
| `Bar.voices` | 4448 | `voices: Voice[]` |
| `Bar.addVoice` | 4539 | `addVoice(voice: Voice): void` |
| `Bar.isMultiVoice` | ~4457 | `get isMultiVoice(): boolean` — true when >1 voice has content |
| `Bar.filledVoices` | ~4460 | `get filledVoices(): Set<number>` — indices of voices with beats |
| `Voice.beats` | ~16475 | `beats: Beat[]` |
| `Voice.isEmpty` | ~16478 | `get isEmpty(): boolean` |

`voices[1]` auto-render: the `.d.ts` does not expose a setting that gates voice rendering. The presence of `isMultiVoice` / `filledVoices` suggests alphaTab renders all non-empty voices automatically. **This is not confirmable from types alone — needs a runtime smoke test before the V2-voice T?? task.**

---

## 2. Constructor Capture Path (for T5)

The existing pattern in `alphaTabEngine.ts` (lines ~254–261) captures constructors from the live alphaTab module namespace (`mod.model.*`). For T5, two more are needed:

```ts
// Inside the scoreLoaded callback after score is available:
TrackCtor: (score.tracks[0] as object).constructor as new () => TrackShape,
StaffCtor: (score.tracks[0].staves[0] as object).constructor as new () => StaffShape,
```

This matches the existing `BarCtor` / `VoiceCtor` / `BeatCtor` capture idiom. Both paths require at least one track (and one staff) to be present in the loaded score — safe, since alphaTab always loads at least one track.

The full extended `structCtors` bag for T5 will be:

```ts
{ MasterBarCtor, SectionCtor, BarCtor, VoiceCtor, BeatCtor,
  AutomationCtor, AutomationType, DurationEnum,
  TrackCtor, StaffCtor }   // ← new in T5
```

---

## 3. Mute / Solo API Choice (for T8)

Use `api.changeTrackMute` / `api.changeTrackSolo` — both confirmed public at lines 1518 and 1485. The pattern for a full state reset + apply:

```ts
// Reset all, then apply new state
api.changeTrackMute(allTracks, false);
api.changeTrackSolo(allTracks, false);
if (muted.length > 0) api.changeTrackMute(muted, true);
if (soloed.length > 0) api.changeTrackSolo(soloed, true);
```

These methods take `Track[]` directly (native JS array — no need for `alphaTab.collections.List`; both array and List overloads are accepted per the doc comments at lines 1501/1515 and 1468/1482).

---

## 4. Tuning Shape (for T5 / T7)

`Staff.stringTuning` is a `Tuning` object (line 15561). The MIDI int array lives at `Tuning.tunings: number[]` (line 16262). The read-only getter `Staff.tuning` returns the same array — fine for T7 reads.

For T5 mutation (applyAddTrack setting a custom tuning), write `staff.stringTuning.tunings = midiArray`. Standard E-A-D-G-B-E 6-string in MIDI is `[64, 59, 55, 50, 45, 40]` (high → low, first entry = highest string).

`Tuning` constructor: `new Tuning(name?: string, tuning?: number[] | null, isStandard?: boolean)` (line ~16271).

---

## 5. Gotchas

### CRITICAL — Track has no `id` field (plan defect, affects T8)

`Track` (line 15973) exposes only `index: number` — there is no `id` property. The plan's T8 code uses `String(t.id)` to match against `mutedTrackIds`/`soloedTrackIds`, which will be `undefined` at runtime and fail silently.

**Required plan adjustment:** Domain `trackId` (string) must be the track's position index serialised as a string — i.e. `trackId = String(track.index)`. In T8's `setPlaybackState`, filter using:

```ts
const muted = allTracks.filter((t) => state.mutedTrackIds.includes(String(t.index)));
const soloed = allTracks.filter((t) => state.soloedTrackIds.includes(String(t.index)));
```

T1 domain types must document this convention: a track's stable identity in all domain ops / sidecar refs is `String(alphaTabTrack.index)`.

### `capo` and `tuning` are on `Staff`, not `Track`

Per-track domain properties map to `track.staves[0].capo` and `track.staves[0].tuning` respectively. T5 must populate the first staff; T7 must read from `track.staves[0]`.

### No `gain` property on `Track`

The spec mentions "gain" — this vocabulary does not exist in alphaTab. The equivalent is:
- `track.playbackInfo.volume` (0–16 GP integer, on the data model)
- `api.changeTrackVolume(tracks, 0.0–1.0)` (session-only percentage)

If the plan needs per-track volume in the UI, use `changeTrackVolume`. If only mute/solo is needed (current plan), ignore `volume` entirely.

### Mute/solo state duplication

`PlaybackInformation.isMute` / `.isSolo` on the data model reflect file-loaded state. `api.changeTrackMute/Solo` updates the live session without touching the data model. T8 must not read `playbackInfo.isMute` to detect current state — it only calls the API methods.

### `voices[1]` auto-render unconfirmed

See section 1. Do not assume voice 2 renders automatically until a runtime test confirms it.

---

## 6. Plan Adjustments Needed

| ID | Task affected | Issue | Adjustment |
|----|--------------|-------|------------|
| A1 | T8 | `t.id` does not exist on `Track`; filter uses `undefined` | Replace `String(t.id)` with `String(t.index)` everywhere; document convention in T1 |
| A2 | T?? (V2 voice) | `voices[1]` auto-render not confirmed from `.d.ts` | Add a runtime smoke-test step before the multi-voice rendering task |
