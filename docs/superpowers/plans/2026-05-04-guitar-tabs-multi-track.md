# TAB-009 Guitar Tabs Multi-Track + Multi-Voice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship multi-track + multi-voice editing on top of TAB-008's single-track editor, closing the M2 acceptance contract: per-track tuning + capo, add / remove track, mute / solo (session-only), V1 / V2 voice editing, and TAB-009a track-level attachments folded in.

**Architecture:** Per-track is the only source of truth — top-level `TabMetadata.tuning` + `.capo` are removed; everything reads `tracks[i]`. `CursorLocation` gains `voiceIndex: 0 | 1`. New `TabEditOp` variants `add-track` / `remove-track`; existing beat-touching ops gain optional `trackId` + `voiceIndex` (defaulting to active cursor). Sidecar (`<file>.alphatex.refs.json`) bumps to v2 with a `trackRefs` map. UI changes are localized to `TabProperties.Tracks` (interactive) + a single new V1/V2 toolbar segmented toggle. Mute/solo is session-only via a new `TabSession.setPlaybackState` method — no domain op, no persistence.

**Tech Stack:** Next.js (project's modified version — read `node_modules/next/dist/docs/`), TypeScript, Tailwind, Vitest + React Testing Library, Playwright, alphaTab `@coderline/alphatab` v1.6.x.

---

## Pre-implementation context

### Verified during brainstorm (no need to re-check)

- TAB-008 shipped: `applyEdit` with per-op pre-state captures, click-to-place overlay, useTabCursor / useTabKeyboard / useTabEditHistory, sidecar v1 (`sectionRefs` only), Edit/Read toggle, lazy editor chunk, SelectedNoteDetails subsection.
- Sidecar location and read/write contract: `<file>.alphatex.refs.json`, `tabRefsRepo` reads/writes via the existing `RepositoryContext` (TAB-008 T6).
- `applyAddBar` / `applyRemoveBar` already iterate every track + staff — pattern extends.
- Input/select/textarea keyboard guard from TAB-008 C4 is in place; new shortcuts inherit it for free.
- Property panel collapse key: `PROPERTIES_COLLAPSED_KEY` (TAB-008 T9), shared across DocumentView / DiagramView / TabView.
- alphaTex grammar: `\tuning` and `\capo` live inside `\track` blocks; alphaTexExporter emits per-track.

### Plan-phase open items (T0 verifies, then unblocks dependent tasks)

1. **alphaTab `Track` API surface for mutation** — confirm constructors used by `applyAddBar`'s `structCtors` capture also expose `TrackCtor`, `StaffCtor`, and the per-track properties we need (`tuning`, `capo`, `gain`, `playbackInfo` or similar for mute/solo). Read `node_modules/@coderline/alphatab/dist/alphaTab.d.ts`.
2. **Two-voice rendering surface** — confirm alphaTab renders `voices[1]` automatically when present (we don't need to set a flag). Same `.d.ts` file.
3. **Per-track gain / mute API** — what's the publicly-exported way to mute/solo a track in alphaTab? Likely `api.changeTrackMute(tracks, mute)` and/or `api.changeTrackSolo(tracks, solo)`. Confirm signature.

T0 produces a **probe doc** at `docs/superpowers/plans/2026-05-04-guitar-tabs-multi-track-verification.md` summarizing exactly what was confirmed. Subsequent tasks reference it instead of re-grepping.

---

## Task graph

```
T0 (verification probe)
  ↓
T1 (domain types — breaks compile)
  ├→ T2 (sidecar v2)
  ├→ T3 (engine locate helpers)         ┐
  │     ↓                                │
  │   T4 (existing ops trackId/voiceIndex)
  │     ↓
  │   T5 (applyAddTrack)
  │     ↓
  │   T6 (applyRemoveTrack)
  │     ↓
  │   T7 (scoreToMetadata per-track) ── closes compile break in engine
  │     ↓
  │   T8 (setPlaybackState)
  │
  ├→ T9 (inverseOf new ops)             ┐
  │     ↓                                │
  │   T10 (sidecarReconcile + call sites)
  │
  ├→ T11 (useTabCursor multi-track) ── closes another compile break
  │     ↓
  │   T12 (useTabKeyboard [/])
  │
  └→ T13 (close compile breaks in Tuning + SelectedNoteDetails)
        ↓
      T14 (VoiceToggle component)
        ↓
      T15 (TabEditorToolbar wiring)
        ↓
      T16–T20 (TabProperties.Tracks interactive UI)
        ↓
      T21–T24 (tab-track entity type + attachments)
        ↓
      T25–T26 (TabView wiring + mute/solo state)
        ↓
      T27 (test-cases §11.10)
        ↓
      T28 (Features.md)
        ↓
      T29 (handoff doc)
```

After T1 ships, the build is broken until T7, T11, T13, and T26 each close their portion of the compile error. Run `npm run typecheck` after each of those tasks to confirm the surface shrinks correctly.

---

## Tasks

### T0 — Plan-phase verification probe

**Goal:** Confirm alphaTab API surface for track mutation, two-voice rendering, and mute/solo before we commit to the engine plan.

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-guitar-tabs-multi-track-verification.md`

- [ ] **Step 1: Inspect alphaTab `.d.ts` for track mutation surface**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
grep -nE "class Track |class Staff |TrackCtor|capo|tuning|gain|mute|solo|changeTrackMute|changeTrackSolo|renderTracks" node_modules/@coderline/alphatab/dist/alphaTab.d.ts | head -60
```

Look for: `Track` class shape, `tuning` property type, `capo` property type, public mute/solo methods on `AlphaTabApi`.

- [ ] **Step 2: Verify two-voice rendering**

```bash
grep -nE "class Voice |Voice\)|voices: " node_modules/@coderline/alphatab/dist/alphaTab.d.ts | head -20
```

Confirm `Bar.addVoice(voice: Voice)` is the API and that `voices[1]` is rendered by default if present.

- [ ] **Step 3: Write the verification probe doc**

Write `docs/superpowers/plans/2026-05-04-guitar-tabs-multi-track-verification.md` summarizing:
- Confirmed: list of public API methods we'll call (with `.d.ts` line numbers).
- Constructor names captured from the existing `structCtors` capture in `alphaTabEngine.ts` that we need (e.g. `TrackCtor`, `StaffCtor`, plus the existing `BarCtor`, `VoiceCtor`, `BeatCtor`, `DurationEnum`).
- Mute/solo API choice + signature.
- Any gotchas discovered (e.g. `gain` getter/setter behaviour, transposition semantics).

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-04-guitar-tabs-multi-track-verification.md
git commit -m "docs(tabs): TAB-009 plan-phase verification probe"
```

---

### T1 — Domain types update (breaks compile, closed by T7/T11/T13)

**Goal:** Land the breaking-change shape: per-track tuning/capo, voiceIndex on cursor, new ops, setPlaybackState. Compile breaks across consumers — closed by subsequent tasks.

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts` (whole file shape change)
- Test: `src/app/knowledge_base/domain/tabSectionIds.test.ts` (will need adjustment if the test fixture passes a top-level tuning — check)

- [ ] **Step 1: Write the failing test for per-track tuning shape**

Create or extend `src/app/knowledge_base/domain/tabMetadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { TabMetadata } from "./tabEngine";

describe("TabMetadata shape", () => {
  it("requires tuning + capo on each track", () => {
    const m: TabMetadata = {
      title: "x", tempo: 120,
      timeSignature: { numerator: 4, denominator: 4 },
      tracks: [{
        id: "0", name: "Lead", instrument: "guitar",
        tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0,
      }],
      sections: [], totalBeats: 0, durationSeconds: 0,
    };
    expect(m.tracks[0].tuning).toHaveLength(6);
    expect(m.tracks[0].capo).toBe(0);
  });

  it("does not allow top-level tuning/capo", () => {
    // @ts-expect-error -- top-level tuning removed
    const _bad: TabMetadata = { tuning: [] };
    expect(true).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
npm run test:run -- src/app/knowledge_base/domain/tabMetadata.test.ts
```

Expected: fails because `TabMetadata.tracks[0].tuning` and `.capo` don't exist yet, and `TabMetadata.tuning` is still allowed.

- [ ] **Step 3: Update `TabMetadata`, `CursorLocation`, `TabEditOp`, `TabSession`**

Modify `src/app/knowledge_base/domain/tabEngine.ts`:

```ts
export interface TabMetadata {
  title: string;
  artist?: string;
  subtitle?: string;
  tempo: number;
  key?: string;
  timeSignature: { numerator: number; denominator: number };
  tracks: {
    id: string;
    name: string;
    instrument: "guitar" | "bass";
    tuning: string[];   // moved here from top-level
    capo: number;       // moved here from top-level
  }[];
  sections: { name: string; startBeat: number }[];
  totalBeats: number;
  durationSeconds: number;
}

export interface CursorLocation {
  trackIndex: number;
  voiceIndex: 0 | 1;   // NEW
  beat: number;
  string: number;
}

export type TabEditOp =
  | { type: "set-fret"; beat: number; string: number; fret: number | null;
      trackId?: string; voiceIndex?: 0 | 1 }
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
      tuning: string[]; capo: number }
  | { type: "remove-track"; trackId: string };

export interface TabSession {
  // ...all existing methods preserved...
  setPlaybackState(state: {
    mutedTrackIds: string[];
    soloedTrackIds: string[];
  }): void;
}
```

- [ ] **Step 4: Run domain test to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/domain/tabMetadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full typecheck (will surface compile breaks across the codebase — that's expected; T2–T13 close them)**

```bash
npm run typecheck 2>&1 | head -60
```

Expected: a list of errors in `alphaTabEngine.ts`, `TabProperties.tsx` (Tuning subcomponent reads `metadata.tuning`), `useTabCursor.ts` (`moveString` reads `metadata.tuning`), `SelectedNoteDetails.tsx`, possibly tests. Each one is closed in a later task.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/domain/tabMetadata.test.ts
git commit -m "feat(tabs): TAB-009 T1 — domain types: per-track tuning/capo, voiceIndex, new ops"
```

---

### T2 — Sidecar v2 schema + `tabRefsRepo`

**Goal:** Bump the `.alphatex.refs.json` sidecar schema from v1 to v2 by adding a `trackRefs` map. Read path is forward-compatible (v1 reads as v2 with empty `trackRefs`); write always emits v2.

**Files:**
- Modify: `src/app/knowledge_base/domain/tabRefs.ts` (interface)
- Modify: `src/app/knowledge_base/infrastructure/tabRefsRepo.ts` (read/write)
- Test: `src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts` (extend)

- [ ] **Step 1: Write failing tests for sidecar v2**

Add to `tabRefsRepo.test.ts`:

```ts
describe("tabRefsRepo v2 — trackRefs", () => {
  it("round-trips a v2 payload with sectionRefs + trackRefs", async () => {
    const repo = createTabRefsRepo(makeStubFsHandle());
    const payload = {
      version: 2 as const,
      sectionRefs: { "intro": "Intro" },
      trackRefs: { "tk1": "Lead", "tk2": "Bass" },
    };
    await repo.write("song.alphatex", payload);
    const read = await repo.read("song.alphatex");
    expect(read).toEqual(payload);
  });

  it("reads a v1 payload (no trackRefs) as v2 with empty trackRefs", async () => {
    const repo = createTabRefsRepo(makeStubFsHandle({
      "song.alphatex.refs.json": JSON.stringify({
        version: 1, sectionRefs: { "intro": "Intro" },
      }),
    }));
    const read = await repo.read("song.alphatex");
    expect(read).toEqual({
      version: 2, sectionRefs: { "intro": "Intro" }, trackRefs: {},
    });
  });

  it("writes upgrade v1 to v2 on next write", async () => {
    const fs = makeStubFsHandle({
      "song.alphatex.refs.json": JSON.stringify({
        version: 1, sectionRefs: { "intro": "Intro" },
      }),
    });
    const repo = createTabRefsRepo(fs);
    const read = await repo.read("song.alphatex");
    await repo.write("song.alphatex", read!);
    const after = JSON.parse(await fs.readText("song.alphatex.refs.json"));
    expect(after.version).toBe(2);
    expect(after.trackRefs).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify failures**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
```

Expected: FAIL — `version: 2` rejected, `trackRefs` missing.

- [ ] **Step 3: Update `TabRefsPayload` interface**

Modify `src/app/knowledge_base/domain/tabRefs.ts`:

```ts
export interface TabRefsPayload {
  version: 2;
  sectionRefs: Record<string, string>;
  trackRefs: Record<string, string>;
}

// Internal v1 shape kept only for the read-path migration.
interface TabRefsPayloadV1 {
  version: 1;
  sectionRefs: Record<string, string>;
}
```

- [ ] **Step 4: Update `tabRefsRepo` read/write**

In `src/app/knowledge_base/infrastructure/tabRefsRepo.ts`:

```ts
export function createTabRefsRepo(fs: FsHandle): TabRefsRepo {
  return {
    async read(filePath: string): Promise<TabRefsPayload | null> {
      const sidecarPath = `${filePath}.refs.json`;
      const raw = await readOrNull(fs, sidecarPath);
      if (raw === null) return null;
      const parsed = JSON.parse(raw) as TabRefsPayloadV1 | TabRefsPayload;
      if (parsed.version === 1) {
        return { version: 2, sectionRefs: parsed.sectionRefs, trackRefs: {} };
      }
      return parsed;
    },
    async write(filePath: string, payload: TabRefsPayload): Promise<void> {
      const sidecarPath = `${filePath}.refs.json`;
      const v2: TabRefsPayload = {
        version: 2,
        sectionRefs: payload.sectionRefs,
        trackRefs: payload.trackRefs,
      };
      await fs.writeText(sidecarPath, JSON.stringify(v2, null, 2));
    },
  };
}
```

- [ ] **Step 5: Update existing v1 round-trip test fixtures**

Sweep `tabRefsRepo.test.ts` for any `version: 1` literals in test fixtures and add the corresponding `trackRefs: {}` to keep the existing tests green when read flows back through the migration.

- [ ] **Step 6: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/domain/tabRefs.ts \
        src/app/knowledge_base/infrastructure/tabRefsRepo.ts \
        src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
git commit -m "feat(tabs): TAB-009 T2 — sidecar v2 with trackRefs (v1 forward-compat read)"
```

---

### T3 — Engine track-aware locate helpers

**Goal:** Parameterize `locateBarIndex` and `locateBeat` (currently hardcoded to `tracks[0].staves[0].voices[0]`) to accept `(trackId, voiceIndex)` and look up by stable id.

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` — `locateBarIndex`, `locateBeat`, helpers
- Test: `src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts` — extend

- [ ] **Step 1: Write failing test — multi-track locate**

Add to `alphaTabEngine.applyEdit.test.ts`:

```ts
it("locates beat in the requested trackIndex / voiceIndex", () => {
  const score = makeScore({
    tracks: [
      { name: "T0", bars: [{ voices: [["beat0a", "beat0b"], []] }] },
      { name: "T1", bars: [{ voices: [["beat1a"], ["beat1b-v2"]] }] },
    ],
  });
  expect(locateBeat(score, 0, "1", 1)).toMatchObject({ id: "beat1b-v2" });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: FAIL — `locateBeat` ignores `trackId` / `voiceIndex`.

- [ ] **Step 3: Update locate helpers**

In `alphaTabEngine.ts`, replace the existing helpers:

```ts
function findTrack(score: ScoreShape, trackId: string): TrackShape | null {
  const t = score.tracks.find((t) => String(t.id) === trackId || t.index === Number(trackId));
  return t ?? null;
}

function locateBarIndex(
  score: ScoreShape,
  globalBeatIndex: number,
  trackId: string = String(score.tracks[0].id),
  voiceIndex: 0 | 1 = 0,
): number {
  const track = findTrack(score, trackId);
  if (!track) return -1;
  const bars = track.staves[0].bars;
  let counter = 0;
  for (let i = 0; i < bars.length; i++) {
    const voice = bars[i].voices[voiceIndex] ?? bars[i].voices[0];
    const beatCount = voice.beats.length;
    if (globalBeatIndex < counter + beatCount) return i;
    counter += beatCount;
  }
  return -1;
}

function locateBeat(
  score: ScoreShape,
  globalBeatIndex: number,
  trackId: string = String(score.tracks[0].id),
  voiceIndex: 0 | 1 = 0,
): BeatShape | null {
  const track = findTrack(score, trackId);
  if (!track) return null;
  let counter = 0;
  for (const bar of track.staves[0].bars) {
    const voice = bar.voices[voiceIndex] ?? bar.voices[0];
    for (const beat of voice.beats) {
      if (counter === globalBeatIndex) return beat;
      counter++;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): TAB-009 T3 — track-aware locate helpers"
```

---

### T4 — `applyEdit` honors `trackId` + `voiceIndex` on existing beat ops

**Goal:** Wire `set-fret`, `set-duration`, `add-technique`, `remove-technique` to thread `trackId` + `voiceIndex` to the locate helpers. Default to `tracks[0]` + `voices[0]` when omitted (preserving call-site ergonomics for single-track callers).

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` — applyEdit handlers
- Test: `alphaTabEngine.applyEdit.test.ts` — extend

- [ ] **Step 1: Write failing test — set-fret on track[1] doesn't mutate track[0]**

```ts
it("set-fret with trackId='1' targets track[1] only", async () => {
  const session = await mountWithMultiTrack();
  await session.applyEdit({
    type: "set-fret", beat: 0, string: 1, fret: 7,
    trackId: "1", voiceIndex: 0,
  });
  const score = session.getScore();
  expect(beatNoteFret(score, "0", 0, 0, 1)).toBeNull();      // T0 untouched
  expect(beatNoteFret(score, "1", 0, 0, 1)).toBe(7);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: FAIL — current handlers ignore `trackId`.

- [ ] **Step 3: Thread `trackId` + `voiceIndex` through every beat-touching handler**

For each of `applySetFret`, `applySetDuration`, `applyAddTechnique`, `applyRemoveTechnique` in `alphaTabEngine.ts`, replace the existing `locateBeat(score, op.beat)` calls with:

```ts
const trackId = op.trackId ?? String(score.tracks[0].id);
const voiceIndex = op.voiceIndex ?? 0;
const beat = locateBeat(score, op.beat, trackId, voiceIndex);
```

Same change in `captureState`'s pre-op snapshot path (look up via `scoreNavigation` helpers — they already take trackId/voiceIndex from T3? if not, extend them).

- [ ] **Step 4: Update `scoreNavigation.ts` helpers to accept trackId / voiceIndex**

```ts
export function findBeat(
  score: Score,
  beat: number,
  trackId?: string,
  voiceIndex?: 0 | 1,
): Beat | null { /* mirror of locateBeat */ }
```

Update the corresponding `scoreNavigation.test.ts` cases.

- [ ] **Step 5: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts \
                    src/app/knowledge_base/features/tab/editor/scoreNavigation.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts \
        src/app/knowledge_base/features/tab/editor/scoreNavigation.ts \
        src/app/knowledge_base/features/tab/editor/scoreNavigation.test.ts
git commit -m "feat(tabs): TAB-009 T4 — applyEdit threads trackId/voiceIndex on existing ops"
```

---

### T5 — Engine `applyAddTrack`

**Goal:** Add a new track to the score with the same bar count as existing tracks, populated with rest beats.

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` — `applyAddTrack`, `structCtors` (add `TrackCtor`, `StaffCtor`)
- Test: `alphaTabEngine.applyEdit.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("add-track appends a new track with matching bar count", async () => {
  const session = await mountWithMultiTrack(); // 2 tracks, 4 bars each
  await session.applyEdit({
    type: "add-track", name: "Drums",
    instrument: "guitar",
    tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0,
  });
  const score = session.getScore();
  expect(score.tracks).toHaveLength(3);
  expect(score.tracks[2].name).toBe("Drums");
  expect(score.tracks[2].staves[0].bars).toHaveLength(4);
  // Each new bar has one rest beat in voice[0]
  for (const bar of score.tracks[2].staves[0].bars) {
    expect(bar.voices[0].beats).toHaveLength(1);
    expect(bar.voices[0].beats[0].notes).toHaveLength(0); // rest
  }
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: FAIL — handler doesn't exist.

- [ ] **Step 3: Capture `TrackCtor` + `StaffCtor` in `structCtors`**

Locate the `structCtors` capture during `scoreLoaded` in `alphaTabEngine.ts`. Add:

```ts
this.structCtors = {
  ...existing,
  TrackCtor: (score.tracks[0] as object).constructor as new () => TrackShape,
  StaffCtor: (score.tracks[0].staves[0] as object).constructor as new () => StaffShape,
};
```

- [ ] **Step 4: Implement `applyAddTrack`**

```ts
private applyAddTrack(op: Extract<TabEditOp, { type: "add-track" }>): void {
  const score = this.latestScore!;
  const { TrackCtor, StaffCtor, BarCtor, VoiceCtor, BeatCtor, DurationEnum } = this.structCtors;

  const track = new TrackCtor();
  (track as unknown as { name: string }).name = op.name;
  (track as unknown as { tuning: number[] }).tuning =
    op.tuning.map(scientificPitchToMidi);
  (track as unknown as { capo: number }).capo = op.capo;

  const staff = new StaffCtor();
  const barCount = score.tracks[0].staves[0].bars.length;
  for (let i = 0; i < barCount; i++) {
    const bar = new BarCtor();
    const voice = new VoiceCtor();
    const beat = new BeatCtor();
    (beat as unknown as { duration: number }).duration = DurationEnum.Quarter;
    voice.addBeat(beat);
    bar.addVoice(voice);
    staff.bars.push(bar);
  }
  track.staves.push(staff);
  score.tracks.push(track);
}
```

(Helper `scientificPitchToMidi` exists if used elsewhere; if not, write it: `E2 = 40`, `A2 = 45`, etc.)

- [ ] **Step 5: Wire into `applyEdit` switch**

```ts
case "add-track": this.applyAddTrack(op); break;
```

- [ ] **Step 6: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): TAB-009 T5 — applyAddTrack handler"
```

---

### T6 — Engine `applyRemoveTrack` (last-track guard)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Test: `alphaTabEngine.applyEdit.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("remove-track splices the target track", async () => {
  const session = await mountWithMultiTrack(); // 2 tracks
  await session.applyEdit({ type: "remove-track", trackId: "1" });
  expect(session.getScore().tracks).toHaveLength(1);
  expect(session.getScore().tracks[0].name).toBe("T0");
});

it("remove-track of last track throws", async () => {
  const session = await mountWithMultiTrack(); // 2 tracks
  await session.applyEdit({ type: "remove-track", trackId: "1" });
  await expect(
    session.applyEdit({ type: "remove-track", trackId: "0" })
  ).rejects.toThrow(/only track/i);
});
```

- [ ] **Step 2: Run tests to verify failure**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `applyRemoveTrack`**

```ts
private applyRemoveTrack(op: Extract<TabEditOp, { type: "remove-track" }>): void {
  const score = this.latestScore!;
  if (score.tracks.length === 1) {
    throw new Error("Cannot remove the only track in a score");
  }
  const idx = score.tracks.findIndex((t) => String(t.id) === op.trackId);
  if (idx === -1) throw new Error(`Track ${op.trackId} not found`);
  score.tracks.splice(idx, 1);
}
```

Wire into `applyEdit` switch.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): TAB-009 T6 — applyRemoveTrack with last-track guard"
```

---

### T7 — `scoreToMetadata` per-track tuning + capo extraction (closes engine compile break from T1)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` — `scoreToMetadata`
- Test: `alphaTabEngine.test.ts` (extend)

- [ ] **Step 1: Write failing test**

```ts
it("scoreToMetadata extracts per-track tuning + capo", () => {
  const score = makeScore({
    tracks: [
      { name: "Lead", tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0 },
      { name: "Bass", tuning: ["E1","A1","D2","G2"], capo: 2 },
    ],
  });
  const m = scoreToMetadata(score);
  expect(m.tracks[0].tuning).toEqual(["E2","A2","D3","G3","B3","E4"]);
  expect(m.tracks[0].capo).toBe(0);
  expect(m.tracks[1].tuning).toEqual(["E1","A1","D2","G2"]);
  expect(m.tracks[1].capo).toBe(2);
});
```

- [ ] **Step 2: Update `scoreToMetadata` to read per-track**

Replace the existing implementation:

```ts
function scoreToMetadata(score: unknown): TabMetadata {
  const s = ((score && typeof score === "object" ? score : {}) as ScoreLike);
  return {
    title: s.title ?? "Untitled",
    artist: s.artist,
    subtitle: s.subtitle,
    tempo: typeof s.tempo === "number" ? s.tempo : 120,
    timeSignature: { numerator: 4, denominator: 4 },
    tracks: (s.tracks ?? []).map((t, i) => ({
      id: String(t.id ?? i),
      name: t.name ?? `Track ${i + 1}`,
      instrument: (t.instrument as "guitar" | "bass") ?? "guitar",
      tuning: (t.tuning ?? []).map(midiToScientificPitch),
      capo: typeof t.capo === "number" ? t.capo : 0,
    })),
    sections: extractSections(s),
    totalBeats: extractTotalBeats(s),
    durationSeconds: typeof s.durationSeconds === "number" ? s.durationSeconds : 0,
  };
}
```

(Need `midiToScientificPitch`. If alphaTab stores tuning as MIDI ints, write the inverse of `scientificPitchToMidi`.)

- [ ] **Step 3: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts
npm run typecheck 2>&1 | grep -E "alphaTabEngine|scoreToMetadata" || echo "engine clean"
```

Expected: PASS + engine compile errors gone.

- [ ] **Step 4: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts
git commit -m "fix(tabs): TAB-009 T7 — scoreToMetadata extracts per-track tuning/capo"
```

---

### T8 — Engine `setPlaybackState` (mute/solo)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` — `setPlaybackState`
- Test: `alphaTabEngine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("setPlaybackState forwards mute/solo to alphaTab API", async () => {
  const session = await mountWithMultiTrack();
  const fakeApi = session.__api;
  session.setPlaybackState({ mutedTrackIds: ["1"], soloedTrackIds: [] });
  expect(fakeApi.changeTrackMute).toHaveBeenCalledWith([1], true);
});
```

- [ ] **Step 2: Implement `setPlaybackState`**

Use the API method confirmed in T0 (likely `api.changeTrackMute(tracks: Track[], mute: boolean)` and `api.changeTrackSolo(tracks: Track[], solo: boolean)`):

```ts
public setPlaybackState(state: {
  mutedTrackIds: string[]; soloedTrackIds: string[];
}): void {
  if (!this.api) return;
  const allTracks = this.latestScore!.tracks;
  const muted = allTracks.filter((t) => state.mutedTrackIds.includes(String(t.id)));
  const soloed = allTracks.filter((t) => state.soloedTrackIds.includes(String(t.id)));
  this.api.changeTrackMute(allTracks, false);
  this.api.changeTrackSolo(allTracks, false);
  if (muted.length > 0) this.api.changeTrackMute(muted, true);
  if (soloed.length > 0) this.api.changeTrackSolo(soloed, true);
}
```

- [ ] **Step 3: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(tabs): TAB-009 T8 — setPlaybackState mute/solo forwarding"
```

---

### T9 — `inverseOf` for `add-track` / `remove-track`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/editHistory/inverseOf.ts`
- Test: `inverseOf.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("add-track inverse is remove-track with the new id", () => {
  const op: TabEditOp = { type: "add-track", name: "Drums",
    instrument: "guitar", tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0 };
  const preState = { trackCount: 2 } as PreOpState;
  const inv = inverseOf(op, preState);
  expect(inv).toEqual({ type: "remove-track", trackId: "2" });
});

it("remove-track inverse is add-track with captured fields", () => {
  const op: TabEditOp = { type: "remove-track", trackId: "1" };
  const preState = {
    trackCount: 2,
    removedTrack: { id: "1", name: "Bass", instrument: "bass",
      tuning: ["E1","A1","D2","G2"], capo: 2 },
  } as PreOpState;
  const inv = inverseOf(op, preState);
  expect(inv).toEqual({ type: "add-track", name: "Bass",
    instrument: "bass", tuning: ["E1","A1","D2","G2"], capo: 2 });
});
```

- [ ] **Step 2: Extend `PreOpState` capture**

The existing `captureState` lives in `TabEditor.tsx` (per TAB-008 C1 fix using `scoreNavigation` helpers). Add a `removedTrack?: { id; name; instrument; tuning; capo }` field that's populated for `remove-track` ops (read the about-to-be-removed track from the live score) and a `trackCount: number` field for `add-track`.

- [ ] **Step 3: Implement inverses in `inverseOf.ts`**

```ts
case "add-track":
  return { type: "remove-track", trackId: String(preState.trackCount) };
case "remove-track": {
  if (!preState.removedTrack) {
    throw new Error("inverseOf(remove-track) needs removedTrack in preState");
  }
  const r = preState.removedTrack;
  return { type: "add-track", name: r.name, instrument: r.instrument,
    tuning: r.tuning, capo: r.capo };
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/editHistory/inverseOf.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(tabs): TAB-009 T9 — inverseOf for add-track/remove-track"
```

---

### T10 — `sidecarReconcile` for `add-track` / `remove-track` + call sites

**Files:**
- Modify: `src/app/knowledge_base/features/tab/sidecarReconcile.ts`
- Test: `sidecarReconcile.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("add-track registers a new stableId in trackRefs", () => {
  const prev = { version: 2, sectionRefs: {}, trackRefs: { "tk1": "Lead" } };
  const op: TabEditOp = { type: "add-track", name: "Drums",
    instrument: "guitar", tuning: [], capo: 0 };
  const next = updateSidecarOnEdit(prev, op, { newTrackId: "2" });
  expect(next.trackRefs).toEqual({ "tk1": "Lead", "tk2": "Drums" });
});

it("remove-track drops the entry", () => {
  const prev = { version: 2, sectionRefs: {}, trackRefs: { "tk1": "Lead", "tk2": "Bass" } };
  const op: TabEditOp = { type: "remove-track", trackId: "2" };
  const next = updateSidecarOnEdit(prev, op);
  expect(next.trackRefs).toEqual({ "tk1": "Lead" });
});
```

- [ ] **Step 2: Implement reconcile cases**

In `sidecarReconcile.ts`, extend `updateSidecarOnEdit`:

```ts
case "add-track":
  return {
    ...prev,
    trackRefs: { ...prev.trackRefs, [`tk${context.newTrackId}`]: op.name },
  };
case "remove-track": {
  const { [`tk${op.trackId}`]: _drop, ...rest } = prev.trackRefs;
  return { ...prev, trackRefs: rest };
}
```

- [ ] **Step 3: Wire into the call site**

In `useTabContent.ts` (or wherever the post-applyEdit sidecar reconcile happens — TAB-008 T18), call `updateSidecarOnEdit` for `add-track`/`remove-track` ops in addition to the existing section ops.

- [ ] **Step 4: Run tests to verify pass**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/sidecarReconcile.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(tabs): TAB-009 T10 — sidecarReconcile + call sites for track ops"
```

---

### T11 — `useTabCursor` multi-track (closes hook compile break)

**Goal:** Add `voiceIndex` to `CursorLocation`, point `moveString` at the active track's tuning, expose `nextTrack` / `prevTrack`.

**Files:**
- Modify: `src/app/knowledge_base/features/tab/editor/hooks/useTabCursor.ts`
- Test: `useTabCursor.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("moveString clamps to active track's tuning length", () => {
  const m = makeMetadata({
    tracks: [
      { id:"0", tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0, ... },  // 6
      { id:"1", tuning: ["E1","A1","D2","G2"], capo: 0, ... },             // 4
    ],
  });
  const { result } = renderHook(() => useTabCursor(m));
  act(() => result.current.setCursor({ trackIndex: 1, voiceIndex: 0, beat: 0, string: 1 }));
  act(() => result.current.moveString(1));
  act(() => result.current.moveString(1));
  act(() => result.current.moveString(1));
  act(() => result.current.moveString(1));
  expect(result.current.cursor!.string).toBe(4); // clamped at bass's 4 strings
});

it("nextTrack / prevTrack clamp at ends", () => {
  const m = makeMetadata({ tracks: [a, b, c] });
  const { result } = renderHook(() => useTabCursor(m));
  act(() => result.current.setCursor({ trackIndex: 0, voiceIndex: 0, beat: 0, string: 1 }));
  act(() => result.current.prevTrack());
  expect(result.current.cursor!.trackIndex).toBe(0); // no wrap
  act(() => result.current.nextTrack());
  expect(result.current.cursor!.trackIndex).toBe(1);
  act(() => result.current.nextTrack());
  act(() => result.current.nextTrack()); // tries to go to 3, clamps at 2
  expect(result.current.cursor!.trackIndex).toBe(2);
});
```

- [ ] **Step 2: Update `useTabCursor`**

```ts
export function useTabCursor(
  metadata: TabMetadata | null,
  barStartBeats?: number[],
): UseTabCursorResult {
  const [cursor, setCursorState] = useState<CursorLocation | null>(null);

  const moveString = useCallback((delta: 1 | -1) => {
    setCursorState((c) => {
      if (!c || !metadata) return c;
      const numStrings = metadata.tracks[c.trackIndex]?.tuning.length ?? 6;
      return { ...c, string: clamp(c.string + delta, 1, numStrings) };
    });
  }, [metadata]);

  const nextTrack = useCallback(() => {
    setCursorState((c) => {
      if (!c || !metadata) return c;
      return { ...c, trackIndex: clamp(c.trackIndex + 1, 0, metadata.tracks.length - 1),
        voiceIndex: 0 as const };
    });
  }, [metadata]);

  const prevTrack = useCallback(() => {
    setCursorState((c) => {
      if (!c || !metadata) return c;
      return { ...c, trackIndex: clamp(c.trackIndex - 1, 0, metadata.tracks.length - 1),
        voiceIndex: 0 as const };
    });
  }, [metadata]);

  // setCursor / clear / moveBeat / moveBar unchanged signatures; setCursor accepts
  // CursorLocation with the new voiceIndex field.

  return { cursor, setCursor, clear, moveBeat, moveString, moveBar, nextTrack, prevTrack };
}
```

Update default-cursor creation everywhere it's used (e.g. on click from overlay) to include `voiceIndex: 0`.

- [ ] **Step 3: Run tests + typecheck**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/editor/hooks/useTabCursor.test.ts
npm run typecheck 2>&1 | grep -E "useTabCursor|moveString" || echo "cursor clean"
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(tabs): TAB-009 T11 — useTabCursor multi-track + voiceIndex"
```

---

### T12 — `useTabKeyboard` `[` / `]` shortcuts

**Files:**
- Modify: `src/app/knowledge_base/features/tab/editor/hooks/useTabKeyboard.ts`
- Test: `useTabKeyboard.test.ts`

- [ ] **Step 1: Write failing test**

```ts
it("'[' calls prevTrack and ']' calls nextTrack", () => {
  const prevTrack = vi.fn();
  const nextTrack = vi.fn();
  renderHook(() => useTabKeyboard({ ...stubProps(), prevTrack, nextTrack }));
  fireKeyDown("[");
  expect(prevTrack).toHaveBeenCalled();
  fireKeyDown("]");
  expect(nextTrack).toHaveBeenCalled();
});

it("'[' / ']' do not fire when typing in an input", () => {
  // ... existing input-guard pattern from C4
});
```

- [ ] **Step 2: Wire keys into the dispatcher**

In `useTabKeyboard.ts` keydown handler, add:

```ts
case "[": prevTrack(); ev.preventDefault(); return;
case "]": nextTrack(); ev.preventDefault(); return;
```

- [ ] **Step 3: Run tests**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/editor/hooks/useTabKeyboard.test.ts
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(tabs): TAB-009 T12 — useTabKeyboard [/] cycles tracks"
```

---

### T13 — Close compile breaks in `TabProperties.Tuning` + `SelectedNoteDetails`

**Goal:** Existing read-only consumers of top-level `metadata.tuning` now read from the active (or first) track. This closes the remaining `npm run typecheck` errors from T1.

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` — `Tuning` subcomponent
- Modify: `src/app/knowledge_base/features/tab/properties/SelectedNoteDetails.tsx`
- Test: `TabProperties.test.tsx`, `SelectedNoteDetails.test.tsx`

- [ ] **Step 1: Update `Tuning` subcomponent to read per-track**

```tsx
function Tuning({ metadata, activeTrackIndex }: {
  metadata: TabMetadata; activeTrackIndex: number;
}): ReactElement | null {
  const tuning = metadata.tracks[activeTrackIndex]?.tuning ?? [];
  if (tuning.length === 0) return null;
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Tuning</h3>
      <p className="font-mono text-xs">{tuning.join(" ")}</p>
    </section>
  );
}
```

Pass `activeTrackIndex` from `TabProperties` (default `0` if no cursor).

- [ ] **Step 2: Update `SelectedNoteDetails`**

Wherever it displays the string label, replace `metadata.tuning[...]` with `metadata.tracks[cursor.trackIndex].tuning[...]`.

- [ ] **Step 3: Update tests**

Existing `TabProperties.test.tsx` cases that pass `metadata.tuning: [...]` need to move that into `metadata.tracks[0].tuning`. Same for `SelectedNoteDetails.test.tsx`.

- [ ] **Step 4: Run typecheck — should now be clean**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
npm run test:run
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git commit -am "fix(tabs): TAB-009 T13 — Tuning + SelectedNoteDetails read per-track tuning"
```

---

### T14 — `VoiceToggle` component

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/components/VoiceToggle.tsx`
- Test: `src/app/knowledge_base/features/tab/editor/components/VoiceToggle.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, fireEvent } from "@testing-library/react";
import { VoiceToggle } from "./VoiceToggle";

describe("VoiceToggle", () => {
  it("renders V1 / V2 with correct aria-pressed", () => {
    const { getByRole } = render(<VoiceToggle voiceIndex={0} onChange={() => {}} />);
    expect(getByRole("button", { name: /Voice 1/ })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: /Voice 2/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking V2 fires onChange(1)", () => {
    const onChange = vi.fn();
    const { getByRole } = render(<VoiceToggle voiceIndex={0} onChange={onChange} />);
    fireEvent.click(getByRole("button", { name: /Voice 2/ }));
    expect(onChange).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

- [ ] **Step 3: Implement `VoiceToggle`**

```tsx
"use client";
import type { ReactElement } from "react";

export function VoiceToggle({
  voiceIndex, onChange,
}: {
  voiceIndex: 0 | 1;
  onChange: (v: 0 | 1) => void;
}): ReactElement {
  return (
    <div className="inline-flex rounded border border-line p-0.5" role="group" aria-label="Voice">
      {[0, 1].map((v) => {
        const active = voiceIndex === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={`Voice ${v + 1}`}
            aria-pressed={active}
            onClick={() => onChange(v as 0 | 1)}
            className={`px-2 py-0.5 text-xs font-medium rounded cursor-pointer
              focus-visible:ring-2 focus-visible:ring-accent
              ${active ? "bg-accent/20 text-accent" : "text-mute hover:text-fg"}`}
          >
            V{v + 1}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests + commit**

```bash
npm run test:run -- src/app/knowledge_base/features/tab/editor/components/VoiceToggle.test.tsx
git add src/app/knowledge_base/features/tab/editor/components/VoiceToggle.tsx \
        src/app/knowledge_base/features/tab/editor/components/VoiceToggle.test.tsx
git commit -m "feat(tabs): TAB-009 T14 — VoiceToggle component"
```

---

### T15 — `TabEditorToolbar` adds `VoiceToggle`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/editor/TabEditorToolbar.tsx`
- Modify: `TabEditorToolbar.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it("renders VoiceToggle and forwards onChange", () => {
  const onVoiceChange = vi.fn();
  const { getByRole } = render(
    <TabEditorToolbar {...stubProps()} voiceIndex={0} onVoiceChange={onVoiceChange} />
  );
  fireEvent.click(getByRole("button", { name: /Voice 2/ }));
  expect(onVoiceChange).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 2: Wire VoiceToggle into the toolbar**

```tsx
<DurationButtons ... />
<VoiceToggle voiceIndex={voiceIndex} onChange={onVoiceChange} />
<TechniqueButtons ... />
```

Add `voiceIndex: 0 | 1` and `onVoiceChange: (v: 0 | 1) => void` to `TabEditorToolbarProps`.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T15 — TabEditorToolbar wires VoiceToggle"
```

---

### T16 — `TabProperties.Tracks` interactive: active-row + click

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` — `Tracks` subcomponent
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it("clicking a track row fires onSwitchActiveTrack with that track's index", () => {
  const onSwitch = vi.fn();
  const { getByText } = render(
    <TabProperties {...stubProps()} activeTrackIndex={0}
      tracks={[{ id:"0", name:"Lead", ... }, { id:"1", name:"Bass", ... }]}
      onSwitchActiveTrack={onSwitch} />
  );
  fireEvent.click(getByText("Bass"));
  expect(onSwitch).toHaveBeenCalledWith(1);
});

it("active row has accent border-l + bold name + filled dot indicator", () => {
  const { getByText } = render(<TabProperties ... activeTrackIndex={0} ... />);
  const lead = getByText("Lead").closest("[data-track-row]");
  expect(lead).toHaveClass("border-l-accent");
  expect(lead).toHaveClass("font-semibold");
  expect(lead!.querySelector("[data-active-dot]")).toHaveAttribute("data-filled", "true");
});
```

- [ ] **Step 2: Update `Tracks` subcomponent**

```tsx
function Tracks({ metadata, activeTrackIndex, onSwitchActiveTrack }: TracksProps) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">
        Tracks ({metadata.tracks.length})
      </h3>
      <ul className="space-y-1">
        {metadata.tracks.map((track, i) => {
          const active = i === activeTrackIndex;
          return (
            <li key={track.id}
                data-track-row
                className={`rounded border border-line/50 px-2 py-1 cursor-pointer
                  border-l-3 focus-visible:ring-2 focus-visible:ring-accent
                  ${active
                    ? "border-l-accent bg-accent/5 font-semibold"
                    : "border-l-transparent text-mute"}`}
                tabIndex={0}
                onClick={() => onSwitchActiveTrack(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSwitchActiveTrack(i);
                  }
                }}>
              <span data-active-dot data-filled={active}
                className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${
                  active ? "bg-accent" : "border border-mute"}`} />
              {track.name}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T16 — Tracks active-row visual + click switch"
```

---

### T17 — `TabProperties.Tracks` M / S buttons

**Files:**
- Modify: `TabProperties.tsx` — `Tracks` subcomponent
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("clicking M toggles mute via onToggleMute(trackId)", () => {
  const onToggleMute = vi.fn();
  const { getByLabelText } = render(<TabProperties ... onToggleMute={onToggleMute} />);
  fireEvent.click(getByLabelText("Mute Lead"));
  expect(onToggleMute).toHaveBeenCalledWith("0");
});

it("M button has aria-pressed reflecting muted state", () => {
  const { getByLabelText } = render(
    <TabProperties ... mutedTrackIds={["0"]} ... />
  );
  expect(getByLabelText("Mute Lead")).toHaveAttribute("aria-pressed", "true");
  expect(getByLabelText("Mute Bass")).toHaveAttribute("aria-pressed", "false");
});

// Mirror the above for solo (S button).
```

- [ ] **Step 2: Add M / S buttons to each row**

```tsx
<button type="button"
  aria-label={`Mute ${track.name}`}
  aria-pressed={mutedTrackIds.includes(track.id)}
  onClick={(e) => { e.stopPropagation(); onToggleMute(track.id); }}
  className={`w-5 h-5 rounded text-[10px] font-bold cursor-pointer
    focus-visible:ring-2 focus-visible:ring-accent
    ${mutedTrackIds.includes(track.id) ? "bg-warning/30 text-warning" : "text-mute"}`}>
  M
</button>
<button type="button"
  aria-label={`Solo ${track.name}`}
  aria-pressed={soloedTrackIds.includes(track.id)}
  onClick={(e) => { e.stopPropagation(); onToggleSolo(track.id); }}
  className={...}>
  S
</button>
```

`e.stopPropagation()` prevents the row-click switching active track when the user clicks M/S.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T17 — Tracks mute/solo buttons (aria-pressed)"
```

---

### T18 — `TabProperties.Tracks` per-track tuning + capo inline editor

**Files:**
- Modify: `TabProperties.tsx` — `Tracks` subcomponent
- Create: `src/app/knowledge_base/features/tab/properties/TrackEditor.tsx` (split if Tracks file is growing too big)
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("active track expand shows 6 string inputs for guitar", () => {
  const { getAllByLabelText } = render(
    <TabProperties ... activeTrackIndex={0}
      tracks={[guitarTrack(), bassTrack()]} />
  );
  expect(getAllByLabelText(/String \d/)).toHaveLength(6);
});

it("changing a string fires onSetTrackTuning with the new array", () => {
  const onSetTuning = vi.fn();
  const { getByLabelText } = render(<TabProperties ... onSetTrackTuning={onSetTuning} />);
  fireEvent.change(getByLabelText("String 1"), { target: { value: "F2" }});
  fireEvent.blur(getByLabelText("String 1"));
  expect(onSetTuning).toHaveBeenCalledWith("0",
    ["F2","A2","D3","G3","B3","E4"]);
});

it("changing capo fires onSetTrackCapo", () => {
  const onSetCapo = vi.fn();
  const { getByLabelText } = render(<TabProperties ... onSetTrackCapo={onSetCapo} />);
  fireEvent.change(getByLabelText("Capo"), { target: { value: "3" }});
  fireEvent.blur(getByLabelText("Capo"));
  expect(onSetCapo).toHaveBeenCalledWith("0", 3);
});

it("invalid pitch input shows inline error and does not fire onSetTrackTuning", () => {
  const onSetTuning = vi.fn();
  const { getByLabelText, getByText } = render(<TabProperties ... onSetTrackTuning={onSetTuning} />);
  fireEvent.change(getByLabelText("String 1"), { target: { value: "Z9" }});
  fireEvent.blur(getByLabelText("String 1"));
  expect(getByText(/invalid pitch/i)).toBeInTheDocument();
  expect(onSetTuning).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement `TrackEditor` with inline form**

```tsx
const PITCH_RE = /^[A-G][#b]?[0-7]$/;

export function TrackEditor({ track, onSetTuning, onSetCapo }: ...) {
  const [error, setError] = useState<string | null>(null);
  const handleStringBlur = (idx: number, value: string) => {
    if (!PITCH_RE.test(value)) {
      setError(`Invalid pitch at string ${idx + 1}`);
      return;
    }
    setError(null);
    const next = [...track.tuning];
    next[idx] = value;
    onSetTuning(track.id, next);
  };
  return (
    <div className="...">
      {track.tuning.map((s, i) => (
        <input key={i} aria-label={`String ${i + 1}`} defaultValue={s}
          onBlur={(e) => handleStringBlur(i, e.target.value)} />
      ))}
      <input type="number" aria-label="Capo" min={0} max={24}
        defaultValue={track.capo}
        onBlur={(e) => onSetCapo(track.id, Math.max(0, Math.min(24, +e.target.value)))} />
      {error && <p role="alert" className="text-xs text-error">{error}</p>}
    </div>
  );
}
```

Render `<TrackEditor>` inline beneath the active row in `Tracks`.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T18 — per-track tuning + capo inline editor"
```

---

### T19 — `TabProperties.Tracks` `+ Add track` inline form

**Files:**
- Modify: `TabProperties.tsx` — `Tracks` subcomponent
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("clicking + Add track expands an inline form with Name and Instrument", () => {
  const { getByText, getByLabelText } = render(<TabProperties ... />);
  fireEvent.click(getByText("+ Add track"));
  expect(getByLabelText("Name")).toBeInTheDocument();
  expect(getByLabelText("Instrument")).toBeInTheDocument();
});

it("Save dispatches onAddTrack with form values + active track tuning", () => {
  const onAddTrack = vi.fn();
  const { getByText, getByLabelText } = render(
    <TabProperties ... activeTrackIndex={0}
      tracks={[{ id:"0", name:"Lead", tuning:["E2","A2","D3","G3","B3","E4"], capo:0,
        instrument:"guitar" }]}
      onAddTrack={onAddTrack} />);
  fireEvent.click(getByText("+ Add track"));
  fireEvent.change(getByLabelText("Name"), { target: { value: "Rhythm" }});
  fireEvent.click(getByText("Save"));
  expect(onAddTrack).toHaveBeenCalledWith({
    name: "Rhythm", instrument: "guitar",
    tuning: ["E2","A2","D3","G3","B3","E4"], capo: 0,
  });
});

it("Cancel collapses without firing onAddTrack", () => {
  const onAddTrack = vi.fn();
  const { getByText } = render(<TabProperties ... onAddTrack={onAddTrack} />);
  fireEvent.click(getByText("+ Add track"));
  fireEvent.click(getByText("Cancel"));
  expect(onAddTrack).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Implement add-track form state**

```tsx
const [adding, setAdding] = useState(false);
const [name, setName] = useState("");
const [instrument, setInstrument] = useState<"guitar" | "bass">("guitar");

const activeTrack = metadata.tracks[activeTrackIndex];

return (
  <>
    {/* track rows */}
    {!adding ? (
      <button onClick={() => setAdding(true)}
        className="w-full border border-dashed border-line/50 rounded px-2 py-1
                   text-xs text-mute cursor-pointer focus-visible:ring-2">
        + Add track
      </button>
    ) : (
      <div className="border border-line rounded p-2 space-y-2">
        <label>Name <input aria-label="Name" value={name}
          onChange={(e) => setName(e.target.value)} /></label>
        <label>Instrument
          <select aria-label="Instrument" value={instrument}
            onChange={(e) => setInstrument(e.target.value as "guitar" | "bass")}>
            <option value="guitar">Guitar</option>
            <option value="bass">Bass</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button onClick={() => {
            if (!name.trim()) return;
            onAddTrack({ name: name.trim(), instrument,
              tuning: activeTrack?.tuning ?? defaultTuning(instrument),
              capo: 0 });
            setAdding(false); setName(""); setInstrument("guitar");
          }}>Save</button>
          <button onClick={() => { setAdding(false); setName(""); }}>Cancel</button>
        </div>
      </div>
    )}
  </>
);
```

`defaultTuning("guitar") = ["E2","A2","D3","G3","B3","E4"]`, `defaultTuning("bass") = ["E1","A1","D2","G2"]`.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T19 — + Add track inline form"
```

---

### T20 — `TabProperties.Tracks` kebab + remove + last-track guard

**Files:**
- Modify: `TabProperties.tsx`
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("kebab → Remove fires onRemoveTrack after confirm", async () => {
  const onRemoveTrack = vi.fn();
  window.confirm = vi.fn(() => true);
  const { getAllByLabelText, getByText } = render(
    <TabProperties ... tracks={[t0, t1]} onRemoveTrack={onRemoveTrack} />
  );
  fireEvent.click(getAllByLabelText(/Track menu/)[1]);
  fireEvent.click(getByText("Remove track"));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Bass"));
  expect(onRemoveTrack).toHaveBeenCalledWith("1");
});

it("kebab on the only remaining track does not show Remove", () => {
  const { getByLabelText, queryByText } = render(
    <TabProperties ... tracks={[t0]} />
  );
  fireEvent.click(getByLabelText(/Track menu/));
  expect(queryByText("Remove track")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Implement kebab menu (lightweight popover)**

```tsx
function TrackKebab({ track, canRemove, onRemove }: ...) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button aria-label={`Track menu ${track.name}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>⋯</button>
      {open && (
        <div role="menu" className="absolute right-0 top-5 bg-bg border border-line rounded shadow-md z-10">
          {canRemove && (
            <button role="menuitem" onClick={() => {
              const noteCount = countNotesOnTrack(track); // helper from useSelectedNoteDetails or similar
              const msg = noteCount > 0
                ? `Remove ${track.name}? This deletes ${noteCount} note(s).`
                : `Remove ${track.name}?`;
              if (window.confirm(msg)) onRemove(track.id);
              setOpen(false);
            }}>Remove track</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Wire `canRemove` = `metadata.tracks.length > 1`**

- [ ] **Step 4: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T20 — track kebab + remove + last-track guard"
```

---

### T21 — `TabPaneContext` supports `tab-track` entity type

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabPaneContext.tsx` (and any type union files it imports)
- Test: `TabPaneContext.test.tsx` if exists, else `TabView.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
it("registers a tab-track entity for an attachment", () => {
  const ctx = createTabPaneContext({ filePath: "song.alphatex" });
  ctx.registerEntity({ type: "tab-track", id: "song.alphatex#track:tk1" });
  expect(ctx.entities).toContainEqual({ type: "tab-track", id: "song.alphatex#track:tk1" });
});
```

- [ ] **Step 2: Extend the entity-type union**

```ts
export type TabEntityType = "tab" | "tab-section" | "tab-track";
```

Update consumers' switch statements to cover `tab-track`. The `DocumentPicker` open call should already accept any entity type — verify in `TabPaneContext.tsx`.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T21 — TabPaneContext supports tab-track entity"
```

---

### T22 — `migrateAttachments` handles `tab-track`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/migrateAttachments.ts` (or wherever it lives — TAB-007a)
- Test: corresponding test file

- [ ] **Step 1: Write failing test**

```ts
it("migrateAttachments preserves tab-track entityType when path is unchanged", () => {
  const docs = [{ path: "doc.md", attachedTo: [{ type: "tab-track", id: "song.alphatex#track:tk1" }] }];
  const migrated = migrateAttachments(docs, "song.alphatex", "song.alphatex");
  expect(migrated[0].attachedTo[0]).toEqual({ type: "tab-track", id: "song.alphatex#track:tk1" });
});

it("migrateAttachments rewrites tab-track ids when the tab file is renamed", () => {
  const docs = [{ path: "doc.md", attachedTo: [{ type: "tab-track", id: "old.alphatex#track:tk1" }] }];
  const migrated = migrateAttachments(docs, "old.alphatex", "new.alphatex");
  expect(migrated[0].attachedTo[0].id).toBe("new.alphatex#track:tk1");
});
```

- [ ] **Step 2: Add `tab-track` case to the switch (or extend the prefix-rewrite logic)**

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T22 — migrateAttachments handles tab-track"
```

---

### T23 — Track row attachment badges + `+` button

**Files:**
- Modify: `TabProperties.tsx` — `Tracks` subcomponent
- Test: `TabProperties.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("track row shows badges for attached docs scoped to that track", () => {
  const docs = [{ path: "lead-tab-tips.md", title: "Lead tab tips",
    attachedTo: [{ type: "tab-track", id: "song.alphatex#track:tk1" }] }];
  const { getByText } = render(<TabProperties ... documents={docs}
    tracks={[{ id:"0", ... }, { id:"1", ... }]} />);
  expect(getByText("Lead tab tips")).toBeInTheDocument();
});

it("+ button opens DocumentPicker scoped to tab-track", () => {
  const onOpenDocPicker = vi.fn();
  const { getAllByLabelText } = render(<TabProperties ... onOpenDocPicker={onOpenDocPicker} />);
  fireEvent.click(getAllByLabelText(/Attach doc to track/)[0]);
  expect(onOpenDocPicker).toHaveBeenCalledWith("tab-track",
    expect.stringMatching(/track:/));
});
```

- [ ] **Step 2: Render attached-doc badges + `+` button per row**

Mirror the existing `Sections` subcomponent's attachment rendering exactly — same `DocumentPicker.open` call, same badge component, same detach affordance.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T23 — track row attachment badges + attach button"
```

---

### T24 — Doc-side backlinks for `tab-track`

**Files:**
- Modify: `src/app/knowledge_base/features/document/DocumentProperties.tsx` (whichever file shows "Tabs that reference this")
- Test: corresponding test

- [ ] **Step 1: Write failing test**

```tsx
it("shows 'Tabs that reference this track' backlinks", () => {
  const linkIndex = makeLinkIndex({
    "doc.md": [{ source: "song.alphatex", entity: { type: "tab-track", id: "song.alphatex#track:tk1" }}],
  });
  const { getByText } = render(<DocumentProperties path="doc.md" linkIndex={linkIndex} />);
  expect(getByText(/Tabs that reference this track/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Update DocumentProperties (or its backlinks subcomponent)**

Add a `tab-track` group to the backlinks rendering, mirroring the existing `tab-section` group.

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T24 — doc-side tab-track backlinks"
```

---

### T25 — `TabView` mute/solo state + setPlaybackState wiring

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Test: `TabView.editor.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("clicking mute calls engine.setPlaybackState", async () => {
  const setPlaybackState = vi.fn();
  const session = makeStubSession({ setPlaybackState });
  const { getByLabelText } = render(<TabView ... session={session} />);
  fireEvent.click(getByLabelText("Mute Lead"));
  expect(setPlaybackState).toHaveBeenCalledWith({
    mutedTrackIds: ["0"], soloedTrackIds: [],
  });
});

it("mute state resets when filePath changes (pane reload semantics)", async () => {
  const { rerender, getByLabelText } = render(<TabView filePath="a.alphatex" ... />);
  fireEvent.click(getByLabelText("Mute Lead"));
  rerender(<TabView filePath="b.alphatex" ... />);
  expect(getByLabelText("Mute Lead")).toHaveAttribute("aria-pressed", "false");
});
```

- [ ] **Step 2: Add mute/solo state + effect to wire to engine**

```tsx
const [mutedTrackIds, setMutedTrackIds] = useState<string[]>([]);
const [soloedTrackIds, setSoloedTrackIds] = useState<string[]>([]);

useEffect(() => {
  setMutedTrackIds([]); setSoloedTrackIds([]);
}, [filePath]);

useEffect(() => {
  session?.setPlaybackState({ mutedTrackIds, soloedTrackIds });
}, [session, mutedTrackIds, soloedTrackIds]);

const handleToggleMute = (trackId: string) =>
  setMutedTrackIds((s) => s.includes(trackId) ? s.filter(x => x !== trackId) : [...s, trackId]);
const handleToggleSolo = (trackId: string) =>
  setSoloedTrackIds((s) => s.includes(trackId) ? s.filter(x => x !== trackId) : [...s, trackId]);
```

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T25 — TabView mute/solo state + engine wiring"
```

---

### T26 — `TabView` wires Tracks subcomponent props (active-track, add, remove, tuning, capo)

**Files:**
- Modify: `TabView.tsx` — pass props to `TabProperties`
- Test: `TabView.editor.test.tsx` extend

- [ ] **Step 1: Write failing tests**

```tsx
it("clicking + Add track dispatches add-track via applyEdit", async () => {
  const apply = vi.fn();
  const { getByText, getByLabelText } = render(<TabView ... applyEdit={apply} />);
  fireEvent.click(getByText("+ Add track"));
  fireEvent.change(getByLabelText("Name"), { target: { value: "Rhythm" }});
  fireEvent.click(getByText("Save"));
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({
    type: "add-track", name: "Rhythm",
  }));
});

it("clicking a different track row updates cursor.trackIndex", async () => {
  const { getByText, getEventHook } = render(<TabView ... />);
  fireEvent.click(getByText("Bass"));
  expect(getEventHook("cursor").trackIndex).toBe(1);
});
```

- [ ] **Step 2: Wire all `TabProperties` props**

```tsx
<TabProperties
  metadata={metadata}
  activeTrackIndex={cursor?.trackIndex ?? 0}
  mutedTrackIds={mutedTrackIds}
  soloedTrackIds={soloedTrackIds}
  onSwitchActiveTrack={(i) => setCursor({ trackIndex: i, voiceIndex: 0, beat: 0, string: 1 })}
  onToggleMute={handleToggleMute}
  onToggleSolo={handleToggleSolo}
  onAddTrack={(track) => applyEdit({ type: "add-track", ...track })}
  onRemoveTrack={(trackId) => applyEdit({ type: "remove-track", trackId })}
  onSetTrackTuning={(trackId, tuning) => applyEdit({ type: "set-track-tuning", trackId, tuning })}
  onSetTrackCapo={(trackId, fret) => applyEdit({ type: "set-track-capo", trackId, fret })}
  onVoiceChange={(v) => setCursor({ ...cursor!, voiceIndex: v })}
  voiceIndex={cursor?.voiceIndex ?? 0}
  /* existing props (filePath, documents, backlinks, etc.) preserved */ />
```

Hand `voiceIndex` + `onVoiceChange` through to the `TabEditorToolbar` via `TabEditor` (which mounts the toolbar).

- [ ] **Step 3: Run tests + commit**

```bash
git commit -am "feat(tabs): TAB-009 T26 — TabView wires all multi-track props"
```

---

### T27 — `test-cases/11-tabs.md` §11.10

**Files:**
- Modify: `test-cases/11-tabs.md` — add §11.10

- [ ] **Step 1: Add §11.10 with the 15 cases from the spec**

Append to `test-cases/11-tabs.md` (under §11.9 Editor v1):

```markdown
## §11.10 Multi-track + multi-voice (TAB-009 / TAB-009a)

- **TAB-11.10-01** ✅ **Active track switch via row click flips cursor.trackIndex** — _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-02** ✅ **`[` / `]` keyboard shortcuts cycle active track (clamp at ends)** — _(unit: `useTabKeyboard.test.ts`.)_
- **TAB-11.10-03** ✅ **Add track via inline form appends and switches active** — _(component: `TabProperties.test.tsx`, integration: `TabView.editor.test.tsx`.)_
- **TAB-11.10-04** ✅ **Remove track via kebab + confirm; last-track guard hides item** — _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-05** ✅ **Per-track tuning edit is local to that track** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-06** ✅ **Per-track capo edit is local to that track** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-07** ✅ **Mute / solo session-only — resets on filePath change** — _(component: `TabView.editor.test.tsx`.)_
- **TAB-11.10-08** ✅ **Solo precedence over mute** — _(unit: `alphaTabEngine.test.ts`.)_
- **TAB-11.10-09** ✅ **Voice V1 / V2 toggle drives cursor.voiceIndex** — _(component: `VoiceToggle.test.tsx`, integration: `TabEditor.test.tsx`.)_
- **TAB-11.10-10** ✅ **Edit on track[1] doesn't mutate track[0] in alphatex output** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
- **TAB-11.10-11** ✅ **Track-level attachment via `DocumentPicker` against `tab-track` entity** — _(component: `TabProperties.test.tsx`.)_
- **TAB-11.10-12** ✅ **Track row backlinks render from sidecar `trackRefs`** — _(unit: `tabRefsRepo.test.ts`, component: `TabProperties.test.tsx`.)_
- **TAB-11.10-13** ✅ **Sidecar v1 → v2 forward-compat read + on-write upgrade** — _(unit: `tabRefsRepo.test.ts`.)_
- **TAB-11.10-14** ✅ **Add / remove track undo/redo restores cursor + track state** — _(integration: `TabEditor.test.tsx`.)_
- **TAB-11.10-15** ✅ **Last-track engine throw verified** — _(unit: `alphaTabEngine.applyEdit.test.ts`.)_
```

Update the "Future sections" footer at the bottom of `11-tabs.md` to remove §11.10.

- [ ] **Step 2: Commit**

```bash
git add test-cases/11-tabs.md
git commit -m "test(tabs): TAB-009 T27 — §11.10 multi-track test cases"
```

---

### T28 — `Features.md` §11 update

**Files:**
- Modify: `Features.md`

- [ ] **Step 1: Add multi-track sub-section under Guitar Tabs**

Locate the §11 Guitar Tabs section in `Features.md` and add an `Editor v2 (multi-track + multi-voice)` sub-block:

```markdown
### Editor v2 — multi-track + multi-voice (TAB-009 + TAB-009a)

- ✅ **Active track switch** via Properties panel row click + `[` / `]` keyboard. (`TabProperties.tsx` Tracks subcomponent, `useTabKeyboard.ts`)
- ✅ **Per-track tuning + capo** editable inline under the active track row. (`TrackEditor.tsx`)
- ✅ **Add / remove track** via inline form + kebab menu; last-track non-removable.
- ✅ **Mute / solo per track** session-only via `M` / `S` icon-buttons (aria-pressed). Wired to `TabSession.setPlaybackState`. (`TabView.tsx`, `alphaTabEngine.ts`)
- ✅ **Multi-voice editing** (V1 / V2) via toolbar segmented toggle drives `cursor.voiceIndex`. (`VoiceToggle.tsx`, `TabEditorToolbar.tsx`, `useTabCursor.ts`)
- ✅ **Track-level attachments** via `DocumentPicker` scoped to `tab-track` entity. (`TabPaneContext.tsx`, `TabProperties.tsx`)
- ⚙️ **Sidecar `<file>.alphatex.refs.json` v2** stores stable section ids + stable track ids. v1 read forward-compat; v2 written on next save. (`tabRefsRepo.ts`)
```

Strike or remove the `?` placeholder if §11.10 was previously sketched.

- [ ] **Step 2: Commit**

```bash
git commit -am "docs(tabs): TAB-009 T28 — Features.md multi-track section"
```

---

### T29 — Handoff doc update (per Doc-update protocol)

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`

- [ ] **Step 1: Apply the 7-step Doc-update protocol**

1. **Last updated** — bump to today (2026-05-04 PM) and parenthetical "TAB-009 multi-track + multi-voice merged".
2. **Where we are table** — flip `TAB-008` row to ✅ Merged (#111) — already done as part of merge — and add a new row for TAB-009 with PR link placeholder, `[#TBD]`. Once the PR is created, update the placeholder.
3. **Remaining tickets** — strike/remove the TAB-009 row from the M2 table; remove TAB-009a entirely (folded in).
4. **Open follow-up items** — add anything surfaced during the TAB-009 review as deferred. Remove items closed by TAB-009 (none from the existing list — TAB-009 didn't touch parked items).
5. **Reference architecture** — add `VoiceToggle.tsx`, `TrackEditor.tsx` (if split), `setPlaybackState` method on `TabSession`, sidecar v2 `trackRefs`. Remove top-level `metadata.tuning` / `metadata.capo` references everywhere they appear in the architecture map.
6. **Next Action** — replace TAB-009 bootstrap with **TAB-010 Export — MIDI / WAV / PDF**. Spec source: `docs/superpowers/specs/2026-05-02-guitar-tabs-design.md` → "Acceptance for M2 ship" final bullet. Mention alphaTab's export APIs (`exportMidi`, `exportPdf`, etc. — verify in T0-equivalent for TAB-010).
7. **Cross-reference counts** — bump §11.10 case count if mentioned anywhere.

- [ ] **Step 2: Commit**

```bash
git commit -am "docs(handoffs): refresh after TAB-009 — M2 closed, TAB-010 next"
```

---

## Out of scope (re-pinning the spec for fresh agents)

- Track-level **automation** (volume/pan curves) — out for M2.
- Mute/solo **persistence** across pane reload — by design, see D3.
- Drums/piano instrument scope — guitar/bass only at M2.
- MIDI / WAV / PDF export — TAB-010.
- Raw alphaTex power-user mode — M3 deferred.
- Bend/slide cycle UX (parked item #15) — TAB-008b polish ticket.
- Editor canvas overlay rendering geometry (parked item #16) — defer until visible problem.
- `useTabContent` `dirty` cross-file state reset (parked item #17) — TAB-008b.

## Risks & mitigations

- **alphaTab Track AST mutation** (T5) — covered by T0 verification probe + T5 test asserting bar count + voice shape parity. If the constructor capture path needs more reach, reuse the existing `structCtors` pattern from TAB-008's `applyAddBar`.
- **Per-track tuning input validation** (T18) — pitch regex (`PITCH_RE`); inline error UI; op not dispatched until valid.
- **Voice rendering correctness in alphaTab** — Playwright still blocked by parked item #14 (Bravura font 404). Multi-track cases will share the existing `test.fixme()` until #14 is addressed.
- **Sidecar v1 → v2 migration timing** — read forward-compat; v2 writes on next edit. Files never edited keep v1 forever, which is fine.
- **`SelectedNoteDetails` / `Tuning` compile breaks from T1** — closed in T7 + T13. Run `npm run typecheck` after each task and inspect the shrinking error list.

## Process

1. Land tasks in order. After each task: run `npm run test:run` for the touched files + `npm run typecheck` after T1, T7, T11, T13, T26.
2. After T26, run the full test suite: `npm run test:run` + `npm run lint`.
3. Run e2e: `npm run test:e2e` (multi-track scenario will be `test.fixme()`'d alongside the existing TAB-008 e2e — same Bravura-font blocker).
4. Spawn `superpowers:code-reviewer` over the whole branch diff before pushing.
5. Address critical/important review issues on the same branch.
6. Invoke `ui-ux-pro-max` skill for the UI audit (Task #7 in the running task list — per the new CLAUDE.md rule).
7. Update `Features.md` + `test-cases/11-tabs.md` + handoff doc in the same branch (T27/T28/T29).
8. `superpowers:finishing-a-development-branch` → `git push -u origin plan/guitar-tabs-multi-track` → `gh pr create` with full test plan.

## Self-review checklist

- [ ] Every spec acceptance bullet has a covering task. (T1–T26 cover the 8 acceptance bullets. ✓)
- [ ] No placeholders. (Verified — all code blocks are complete; "TBD" appears once intentionally for the PR-link placeholder in T29 step 1, replaced after PR creation.)
- [ ] Type consistency: `voiceIndex` is `0 | 1` everywhere (cursor, op, toolbar prop). `trackId` is `string` (matches `tracks[i].id`). `mutedTrackIds` / `soloedTrackIds` are `string[]`. ✓
- [ ] Compile-break tasks (T7/T11/T13) actually close the breaks introduced by T1. ✓
- [ ] Sidecar v2 round-trip + v1 forward-compat tested (T2). ✓
- [ ] `inverseOf` + `sidecarReconcile` cover both new ops (T9/T10). ✓
- [ ] `migrateAttachments` learns `tab-track` (T22). ✓
- [ ] Handoff doc updated per the 7-step protocol (T29). ✓
- [ ] UI/UX audit task in the running task list (Task #7). ✓ (Outside this plan but contracted in CLAUDE.md.)
