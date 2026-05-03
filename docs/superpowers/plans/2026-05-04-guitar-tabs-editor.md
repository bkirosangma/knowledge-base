# TAB-008 — Guitar Tabs Editor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first interactive editor for `.alphatex` tabs — click any cell, type a fret, apply techniques and durations via keyboard / toolbar, undo and redo, save back to disk. Single-track scope. M2 ship-point entry.

**Architecture:** alphaTab Score AST mutation in memory (`api.renderScore` for live re-render); `AlphaTexExporter` for save serialization; persistent cursor + direct-keypress UX; per-op undo/redo with inverse ops; section-id sidecar (`<file>.alphatex.refs.json`) for rename-survives-reorder cross-references. The editor is a `next/dynamic({ ssr: false })` sibling chunk to `TabView`, gated on `effectiveReadOnly = paneReadOnly || perFileReadOnly`.

**Tech Stack:** TypeScript, React, Next.js (App Router), `@coderline/alphatab` ≥ 1.6, Vitest + RTL, Playwright, File System Access API.

**Branch:** `plan/guitar-tabs-editor` (already created)
**Spec:** `docs/superpowers/specs/2026-05-04-guitar-tabs-editor-design.md`
**Depends on:** TAB-001 → TAB-007a + TAB-011 + TAB-012 (all M1 tickets merged).
**Effort:** ~2 weeks. Largest single ticket on the roadmap.

---

## Pre-implementation context

### Verified during brainstorm (no need to re-check)

| Item | Resolution | Source |
|---|---|---|
| `api.renderScore(score, trackIndexes?, renderHints?)` is publicly exported | ✅ confirmed | `node_modules/@coderline/alphatab/dist/alphaTab.d.ts:663` |
| `AlphaTexExporter extends ScoreExporter` is publicly exported | ✅ confirmed | `alphaTab.d.ts:3706` (declaration), `:8288` (export bag) |
| `useDocumentContent` debounce timing | `DRAFT_DEBOUNCE_MS = 500 ms` | `src/app/knowledge_base/features/document/hooks/useDocumentContent.ts:14` |
| `useReadOnlyState(filePath, prefix)` exists with toggle + per-file localStorage persistence | ✅ confirmed | `src/app/knowledge_base/shared/hooks/useReadOnlyState.ts` |
| `next/dynamic({ ssr: false })` precedent in this repo | ✅ confirmed (`GraphView`, `GraphifyView`) | `src/app/knowledge_base/features/graph/GraphView.tsx:33` |
| `TabPaneContext.readOnly` is already plumbed end-to-end | ✅ confirmed in TAB-012 | `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx:14` |
| `TabEditOp` discriminated union covers every op TAB-008 needs | ✅ confirmed | `src/app/knowledge_base/domain/tabEngine.ts:85-95` |
| Marker comment for editor lazy-load | Present at `TabView.tsx:170-172` (replaced in T13) | `src/app/knowledge_base/features/tab/TabView.tsx` |

### Plan-phase open items (T0 verifies, then unblocks dependent tasks)

1. **In-place Score mutation safety** — does mutating an already-rendered Score in place trigger a renderScore re-render correctly, or does alphaTab require `score.clone()` per edit? Affects whether T2 takes the cheap path or budgets a clone per `applyEdit`.
2. **Click-to-cursor hit-test API** — does alphaTab expose `BeatMouseDownEventArgs` (or equivalent) for translating a canvas click → `{ trackIndex, barIndex, beatIndex, stringIndex }`? If not, T15 computes from render geometry.
3. **Keydown handler focus path** — confirm that mounting a focused, transparent overlay div (`tabIndex={-1}` + programmatic focus on first cursor placement) reliably receives `keydown` ahead of any browser default for bare letters.

---

## Task graph

```
T0 (verify) ─┬─ T1 (alphaTexExporter)
             ├─ T2..T4 (applyEdit ops)
             ├─ T5..T7 (sidecar + resolver)
             ├─ T8..T9 (edit-mode wiring)
             └─ T10..T18 (editor chunk + UI)
                                 ↓
                              T19 (e2e)
                                 ↓
                       T20..T21 (Features + test-cases)
```

T1 unblocks T2 (applyEdit tests need round-trip via the exporter).
T8 unblocks T13 (chunk gate uses effectiveReadOnly).
T6 unblocks T7 (resolver uses repo).
T11 unblocks T14, T15, T16, T17.

---

## Tasks

### T0 — Plan-phase verification probe

**Files:**
- Create: `docs/superpowers/plans/2026-05-04-guitar-tabs-editor-verification.md` (findings doc; deleted after ticket ships, kept on the branch for reviewers)

**Goal:** Resolve the three plan-phase open items empirically before any code is written.

- [ ] **Step 1: Mount a `score.clone()` probe**

In a scratch test (`src/app/knowledge_base/infrastructure/__scratch__/scoreMutate.scratch.test.ts`, gitignored), import alphaTab, load a tiny alphaTex source, capture the resulting `Score` from `scoreLoaded`, mutate one note's `fret` field, call `api.renderScore(score)`, and observe:
- Does the canvas re-render visually?
- Does `scoreLoaded` re-fire?
- Does the mutated Score round-trip through `AlphaTexExporter` to a string with the new fret?

If yes to all three: in-place mutation is safe. If `renderScore` ignores in-place changes, document that `score.clone()` is required.

- [ ] **Step 2: Hit-test API probe**

`grep -rn "MouseDown\|beatHit\|nodeForBeat" node_modules/@coderline/alphatab/dist/alphaTab.d.ts` and confirm whether alphaTab exposes a beat-level hit-test event. Common candidate names from alphaTab docs: `beatMouseDown`, `noteMouseDown`. Document the exact signature.

- [ ] **Step 3: Keydown overlay focus probe**

In a scratch React component, mount a transparent absolutely-positioned div over a child element with `tabIndex={-1}`, focus it programmatically on click, and check `keydown` fires for bare letters (q, h, etc.) without bubbling to the browser default. Confirm `preventDefault()` is honoured.

- [ ] **Step 4: Write findings doc**

```markdown
# TAB-008 Verification Findings (T0)

## Score mutation
- In-place mutation: <safe | unsafe; if unsafe, document clone() requirement>
- renderScore re-render: <triggers | does not trigger>

## Hit-test API
- Event name: <beatMouseDown | other | unavailable>
- Payload type: <signature>
- Fallback: <if unavailable, geometry-based plan>

## Keydown overlay
- Focus path: <works | requires capture-phase listener | requires global handler>
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-05-04-guitar-tabs-editor-verification.md
git commit -m "docs(tabs): TAB-008 T0 verification findings"
```

---

### T1 — `alphaTexExporter` wrapper

**Files:**
- Create: `src/app/knowledge_base/infrastructure/alphaTexExporter.ts`
- Test: `src/app/knowledge_base/infrastructure/alphaTexExporter.test.ts`

**Goal:** Wrap alphaTab's `AlphaTexExporter` so callers depend on a one-function module instead of importing the alphaTab class directly. Mirrors how `alphaTabAssets.ts` wraps the SoundFont URL constant.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/knowledge_base/infrastructure/alphaTexExporter.test.ts
import { describe, it, expect } from "vitest";
import { serializeScoreToAlphatex } from "./alphaTexExporter";

const FIXTURE_ALPHATEX = `\\title "Smoke Test"\n\\tempo 120\n.\n:4 0.6 1.6 2.6 3.6 |`;

describe("serializeScoreToAlphatex", () => {
  it("round-trips a minimal score back to alphaTex", async () => {
    const { AlphaTexImporter } = await import("@coderline/alphatab");
    const importer = new AlphaTexImporter();
    importer.initFromString(FIXTURE_ALPHATEX, /* settings */ undefined);
    const score = importer.readScore();

    const out = await serializeScoreToAlphatex(score);

    expect(out).toContain("Smoke Test");
    expect(out).toMatch(/0\.6/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- alphaTexExporter
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```typescript
// src/app/knowledge_base/infrastructure/alphaTexExporter.ts
/**
 * Score → alphaTex serializer. Wraps `@coderline/alphatab`'s
 * `AlphaTexExporter` behind a stable function signature so consumers
 * (`useTabContent`, the editor chunk) don't depend on the alphaTab
 * class surface directly.
 *
 * Lazy-imports alphatab — keeps callers off the alphatab chunk in
 * read-only flows that never serialize.
 */
import type { Score } from "@coderline/alphatab/dist/alphaTab";

export async function serializeScoreToAlphatex(score: Score): Promise<string> {
  const mod = await import("@coderline/alphatab");
  const exporter = new mod.AlphaTexExporter();
  exporter.export(score);
  return exporter.toTex();
}
```

If T0 found that `AlphaTexExporter`'s public API differs (e.g. takes `(score, settings)` or requires a separate `init`), adjust the wrapper body to match. The test from Step 1 is authoritative — make it green.

- [ ] **Step 4: Run test**

```bash
npm test -- alphaTexExporter
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTexExporter.ts \
        src/app/knowledge_base/infrastructure/alphaTexExporter.test.ts
git commit -m "feat(tabs): alphaTexExporter wrapper for Score → alphaTex serialization"
```

---

### T2 — `applyEdit` for note-level ops (`set-fret`, `set-duration`)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Test: `src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts`

**Goal:** Implement `AlphaTabSession.applyEdit` for the two beat-level ops: `set-fret` (change a note's fret value, including null = remove note) and `set-duration` (change the beat's duration). Each op mutates the Score AST → calls `api.renderScore(score)` → returns re-derived `TabMetadata`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { AlphaTabEngine } from "./alphaTabEngine";

const FIXTURE = `\\title "Edit Probe"\n.\n:4 5.6 0.6 0.6 0.6 |`;

describe("AlphaTabSession.applyEdit", () => {
  let session: any; // AlphaTabSession; concrete shape from mount()

  beforeEach(async () => {
    const engine = new AlphaTabEngine();
    const container = document.createElement("div");
    document.body.appendChild(container);
    session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: FIXTURE },
      readOnly: false,
    });
  });

  it("set-fret mutates the targeted note", () => {
    const meta = session.applyEdit({
      type: "set-fret",
      beat: 0, // first beat of bar 0
      string: 6,
      fret: 12,
    });
    expect(meta).toBeDefined();
    // Round-trip via the score to verify mutation:
    expect(getNoteFret(session, /* beat */ 0, /* string */ 6)).toBe(12);
  });

  it("set-fret with fret=null removes the note", () => {
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: null });
    expect(getNoteFret(session, 0, 6)).toBeNull();
  });

  it("set-duration changes the beat duration", () => {
    session.applyEdit({ type: "set-duration", beat: 0, duration: 8 });
    expect(getBeatDuration(session, 0)).toBe(8);
  });

  it("throws when the targeted beat does not exist", () => {
    expect(() =>
      session.applyEdit({ type: "set-fret", beat: 999, string: 6, fret: 0 }),
    ).toThrow(/beat/i);
  });
});

// Helpers — lift to a test util if reused beyond this file.
function getNoteFret(session: any, beat: number, string: number): number | null {
  const note = findNote(session, beat, string);
  return note ? note.fret : null;
}
function getBeatDuration(session: any, beat: number): number {
  return findBeat(session, beat).duration;
}
function findBeat(session: any, beat: number) { /* walk score */ }
function findNote(session: any, beat: number, string: number) { /* walk score */ }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- alphaTabEngine.applyEdit
```
Expected: FAIL — `applyEdit` not implemented.

- [ ] **Step 3: Implement**

In `alphaTabEngine.ts`, extend `AlphaTabSession`:

```typescript
applyEdit(op: TabEditOp): TabMetadata {
  if (this.disposed) throw new Error("Session disposed");
  if (!this.latestScore) throw new Error("No score loaded");

  switch (op.type) {
    case "set-fret":   this.applySetFret(op); break;
    case "set-duration": this.applySetDuration(op); break;
    default: throw new Error(`Unsupported op: ${op.type}`);
  }

  this.api.renderScore(this.latestScore);
  this.latestMetadata = scoreToMetadata(this.latestScore);
  this.emit({ event: "loaded", metadata: this.latestMetadata });
  return this.latestMetadata;
}

private applySetFret(op: Extract<TabEditOp, { type: "set-fret" }>): void {
  const beat = locateBeat(this.latestScore!, op.beat);
  if (!beat) throw new Error(`Beat ${op.beat} not found`);
  const existing = beat.notes.find((n: any) => n.string === op.string);
  if (op.fret === null) {
    if (existing) beat.notes = beat.notes.filter((n: any) => n !== existing);
    return;
  }
  if (existing) existing.fret = op.fret;
  else beat.notes.push(buildNote(op.string, op.fret));
}

private applySetDuration(op: Extract<TabEditOp, { type: "set-duration" }>): void {
  const beat = locateBeat(this.latestScore!, op.beat);
  if (!beat) throw new Error(`Beat ${op.beat} not found`);
  beat.duration = op.duration;
}
```

Capture the Score in `handleScoreLoaded`:

```typescript
private latestScore: Score | null = null;

private handleScoreLoaded(score: unknown): void {
  this.latestScore = score as Score; // typed when we import alphaTab types
  this.latestMetadata = scoreToMetadata(score);
  this.emit({ event: "loaded", metadata: this.latestMetadata });
}
```

`locateBeat(score, globalBeatIndex)` walks tracks → bars → voices → beats and returns the beat at the global beat counter. `buildNote(string, fret)` constructs an alphaTab `Note` with the project's defaults. Both are private helpers in the same file.

If T0 found that in-place mutation requires `score.clone()`, switch each `applyEdit` to clone before mutating and assign `this.latestScore = clone` after.

- [ ] **Step 4: Run tests**

```bash
npm test -- alphaTabEngine.applyEdit
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): applyEdit for set-fret and set-duration"
```

---

### T3 — `applyEdit` techniques (`add-technique`, `remove-technique`)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Test: extend `alphaTabEngine.applyEdit.test.ts`

**Goal:** Add the two technique ops. alphaTab's `Note` model carries technique flags (`isHammerPullOrigin`, `slideOutType`, `bendType`, etc.); each `Technique` enum value maps to one or two Note properties.

- [ ] **Step 1: Define the technique-to-note-property mapping**

In `alphaTabEngine.ts` add (private to module):

Verified enum names + values (from `node_modules/@coderline/alphatab/dist/alphaTab.d.ts`):

| Enum | Value used | Notes |
|---|---|---|
| `BendType` | `BendType.Bend` (= 2) | "Simple bend from unbended string to a higher note." Default ½-step amount via `bendPoints`. |
| `SlideOutType` | `SlideOutType.Shift` (= 1) | "Shift slide to next note on same string." |
| `VibratoType` | `VibratoType.Slight` | "A slight vibrato." |
| `HarmonicType` | `HarmonicType.Natural` (= 1) | "Natural harmonic." |
| `Duration` (for tremolo) | grep `^declare enum Duration` for the exact `Eighth` symbol — has negative values for QuadrupleWhole / DoubleWhole; positive values for Whole / Half / Quarter / Eighth / Sixteenth / etc. Use `Duration.Eighth` (verify exact case). |

Note property names (from the `Note` class in alphaTab.d.ts): `isHammerPullOrigin`, `bendType`, `bendPoints`, `slideOutType`, `slideTargetNote`, `isTieDestination`, `isGhost`, `vibrato`, `isLetRing`, `isPalmMute`, `tremoloSpeed`, `isTap`, `harmonicType`. Spell-check against the d.ts before committing.

```typescript
type TechniqueMutator = {
  apply: (note: Note) => void;
  remove: (note: Note) => void;
};

const TECHNIQUE_MUTATORS: Record<Technique, TechniqueMutator> = {
  "hammer-on": {
    apply: (n) => { n.isHammerPullOrigin = true; },
    remove: (n) => { n.isHammerPullOrigin = false; },
  },
  "pull-off": {
    // alphaTab uses the same flag; the directionality is resolved at render
    // time by comparing fret to the previous beat's note on the same string.
    apply: (n) => { n.isHammerPullOrigin = true; },
    remove: (n) => { n.isHammerPullOrigin = false; },
  },
  "bend": {
    apply: (n) => {
      n.bendType = BendType.Bend;
      // Default ½-step bend — alphaTab's bendPoints scale: 50 = ½-step (100 cents = 1 semitone? verify with d.ts)
      n.bendPoints = [{ offset: 0, value: 0 }, { offset: 60, value: 50 }];
    },
    remove: (n) => { n.bendType = BendType.None; n.bendPoints = []; },
  },
  "slide": {
    apply: (n) => { n.slideOutType = SlideOutType.Shift; },
    remove: (n) => { n.slideOutType = SlideOutType.None; },
  },
  "tie": {
    apply: (n) => { n.isTieDestination = true; },
    remove: (n) => { n.isTieDestination = false; },
  },
  "ghost": {
    apply: (n) => { n.isGhost = true; },
    remove: (n) => { n.isGhost = false; },
  },
  "vibrato": {
    apply: (n) => { n.vibrato = VibratoType.Slight; },
    remove: (n) => { n.vibrato = VibratoType.None; },
  },
  "let-ring": {
    apply: (n) => { n.isLetRing = true; },
    remove: (n) => { n.isLetRing = false; },
  },
  "palm-mute": {
    apply: (n) => { n.isPalmMute = true; },
    remove: (n) => { n.isPalmMute = false; },
  },
  "tremolo": {
    apply: (n) => { n.tremoloSpeed = Duration.Eighth; },
    remove: (n) => { n.tremoloSpeed = null; }, // verify nullable in d.ts
  },
  "tap": {
    apply: (n) => { n.isTap = true; },
    remove: (n) => { n.isTap = false; },
  },
  "harmonic": {
    apply: (n) => { n.harmonicType = HarmonicType.Natural; },
    remove: (n) => { n.harmonicType = HarmonicType.None; },
  },
};
```

The exact bend `bendPoints` value scale and the `tremoloSpeed` null-handling are still worth confirming against the d.ts — leave the assertions in T3 Step 1 covering the externally-observable behaviour ("bend amount is ½-step", "tremolo flag set when added; cleared when removed"), and let the implementation match alphaTab's actual conventions.

- [ ] **Step 2: Write failing tests**

```typescript
it("add-technique sets the technique flag on the targeted note", () => {
  session.applyEdit({ type: "add-technique", beat: 0, string: 6, technique: "hammer-on" });
  expect(getNoteHasTechnique(session, 0, 6, "hammer-on")).toBe(true);
});

it("remove-technique clears the flag", () => {
  session.applyEdit({ type: "add-technique", beat: 0, string: 6, technique: "hammer-on" });
  session.applyEdit({ type: "remove-technique", beat: 0, string: 6, technique: "hammer-on" });
  expect(getNoteHasTechnique(session, 0, 6, "hammer-on")).toBe(false);
});

it("bend applies a default ½-step bend (D5 in spec)", () => {
  session.applyEdit({ type: "add-technique", beat: 0, string: 6, technique: "bend" });
  const note = findNote(session, 0, 6);
  expect(note.bendType).toBeTruthy();
  // Default amount: ½-step (50 cents in alphaTab's bend-point scale)
  expect(note.bendPoints[1].value).toBe(50);
});

it("slide applies slide-up by default (D5 in spec)", () => {
  session.applyEdit({ type: "add-technique", beat: 0, string: 6, technique: "slide" });
  expect(findNote(session, 0, 6).slideOutType).toBeTruthy();
});

it("throws when the targeted note does not exist", () => {
  expect(() =>
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "hammer-on" }),
  ).toThrow(/note/i);
});
```

- [ ] **Step 3: Run failing**

```bash
npm test -- alphaTabEngine.applyEdit
```
Expected: FAIL — `add-technique` / `remove-technique` not handled.

- [ ] **Step 4: Implement**

```typescript
// in the applyEdit switch:
case "add-technique": this.applyTechnique(op, "apply"); break;
case "remove-technique": this.applyTechnique(op, "remove"); break;
```

```typescript
private applyTechnique(
  op: Extract<TabEditOp, { type: "add-technique" | "remove-technique" }>,
  mode: "apply" | "remove",
): void {
  const beat = locateBeat(this.latestScore!, op.beat);
  if (!beat) throw new Error(`Beat ${op.beat} not found`);
  const note = beat.notes.find((n: any) => n.string === op.string);
  if (!note) throw new Error(`Note on string ${op.string} at beat ${op.beat} not found`);
  TECHNIQUE_MUTATORS[op.technique][mode](note);
}
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- alphaTabEngine.applyEdit
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): applyEdit for add-technique and remove-technique"
```

---

### T4 — `applyEdit` structural ops (`set-tempo`, `set-section`, `add-bar`, `remove-bar`)

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Test: extend `alphaTabEngine.applyEdit.test.ts`

**Goal:** The four bar-or-score-level ops. `set-tempo` writes a tempo automation at the beat. `set-section` adds/renames/removes a section marker at a bar. `add-bar` / `remove-bar` insert or drop a `MasterBar` and propagate to every track's bar list.

- [ ] **Step 1: Tests**

```typescript
it("set-tempo writes a tempo automation at the targeted beat", () => {
  session.applyEdit({ type: "set-tempo", beat: 0, bpm: 140 });
  const meta = session.applyEdit({ type: "set-tempo", beat: 0, bpm: 140 }); // idempotent
  expect(meta.tempo).toBe(140);
});

it("set-section adds a section name to the bar containing the beat", () => {
  session.applyEdit({ type: "set-section", beat: 0, name: "Intro" });
  const sections = findScore(session).masterBars[0].section;
  expect(sections.text).toBe("Intro");
});

it("set-section with name=null removes the section marker", () => {
  session.applyEdit({ type: "set-section", beat: 0, name: "Intro" });
  session.applyEdit({ type: "set-section", beat: 0, name: null });
  expect(findScore(session).masterBars[0].section).toBeUndefined();
});

it("add-bar appends a master bar after the target beat's bar", () => {
  const before = findScore(session).masterBars.length;
  session.applyEdit({ type: "add-bar", afterBeat: 0 });
  expect(findScore(session).masterBars.length).toBe(before + 1);
});

it("remove-bar drops the master bar containing the beat", () => {
  session.applyEdit({ type: "add-bar", afterBeat: 0 });
  const before = findScore(session).masterBars.length;
  session.applyEdit({ type: "remove-bar", beat: getFirstBeatOfBar(session, 1) });
  expect(findScore(session).masterBars.length).toBe(before - 1);
});

it("remove-bar refuses to drop the only bar in a track", () => {
  expect(() =>
    session.applyEdit({ type: "remove-bar", beat: 0 }),
  ).toThrow(/last bar|only bar/i);
});
```

- [ ] **Step 2: Run failing**

```bash
npm test -- alphaTabEngine.applyEdit
```

- [ ] **Step 3: Implement**

```typescript
case "set-tempo":   this.applySetTempo(op); break;
case "set-section": this.applySetSection(op); break;
case "add-bar":     this.applyAddBar(op); break;
case "remove-bar":  this.applyRemoveBar(op); break;
```

`set-tempo`: walk to the target master bar; set `masterBar.tempoAutomation` (or push automation entry per alphaTab's API).
`set-section`: target master bar; assign `masterBar.section = new Section(name)` or `delete masterBar.section`.
`add-bar`: clone the previous master bar's structure (signature, time signature) into a new MasterBar; for every track, push a corresponding empty Bar with one rest beat.
`remove-bar`: if `score.masterBars.length === 1`, throw. Else splice from `masterBars` and from every track's `bars`.

Use alphaTab's exported types (`MasterBar`, `Section`, `Bar`, `Voice`, `Beat`, `Note`) for type safety.

- [ ] **Step 4: Run + commit**

```bash
npm test -- alphaTabEngine.applyEdit
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.applyEdit.test.ts
git commit -m "feat(tabs): applyEdit for set-tempo, set-section, add-bar, remove-bar"
```

---

### T5 — `tabRefsRepo` (FSA-backed sidecar repo)

**Files:**
- Create: `src/app/knowledge_base/infrastructure/tabRefsRepo.ts`
- Create: `src/app/knowledge_base/domain/tabRefs.ts` (interface + types)
- Test: `src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts`

**Goal:** A minimal FSA-backed repository for `<file>.alphatex.refs.json` sidecar files. Mirrors `tabRepo.ts`'s shape: `read(filePath)` / `write(filePath, payload)`, both via the existing `rootHandle` provider. Lazy creation only — `read` returns `null` when no sidecar exists.

- [ ] **Step 1: Define the domain interface**

```typescript
// src/app/knowledge_base/domain/tabRefs.ts
export interface TabRefsPayload {
  version: 1;
  sections: Record<string /* stableId */, {
    currentName: string;
    createdAt: number;
  }>;
}

export interface TabRefsRepository {
  read(filePath: string): Promise<TabRefsPayload | null>;
  write(filePath: string, payload: TabRefsPayload): Promise<void>;
}

export function emptyTabRefs(): TabRefsPayload {
  return { version: 1, sections: {} };
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createMockRoot } from "../../../../test/fsMock";
import { createTabRefsRepository } from "./tabRefsRepo";

describe("createTabRefsRepository", () => {
  let root: ReturnType<typeof createMockRoot>;

  beforeEach(() => { root = createMockRoot(); });

  it("read returns null when the sidecar does not exist", async () => {
    const repo = createTabRefsRepository(root.handle);
    expect(await repo.read("song.alphatex")).toBeNull();
  });

  it("write then read round-trips the payload", async () => {
    const repo = createTabRefsRepository(root.handle);
    await repo.write("song.alphatex", {
      version: 1,
      sections: { "intro": { currentName: "Intro", createdAt: 1746500000000 } },
    });
    const got = await repo.read("song.alphatex");
    expect(got).toEqual({
      version: 1,
      sections: { "intro": { currentName: "Intro", createdAt: 1746500000000 } },
    });
  });

  it("write surfaces FSA failures as FileSystemError", async () => {
    const repo = createTabRefsRepository(root.handleThrowsOnWrite("permission"));
    await expect(repo.write("song.alphatex", emptyTabRefs())).rejects.toMatchObject({
      kind: "permission",
    });
  });

  it("read in nested subdirectories", async () => {
    const repo = createTabRefsRepository(root.handle);
    await repo.write("subdir/song.alphatex", emptyTabRefs());
    expect(await repo.read("subdir/song.alphatex")).toEqual(emptyTabRefs());
  });
});
```

- [ ] **Step 3: Run failing**

```bash
npm test -- tabRefsRepo
```

- [ ] **Step 4: Implement**

```typescript
// src/app/knowledge_base/infrastructure/tabRefsRepo.ts
import type { TabRefsPayload, TabRefsRepository } from "../domain/tabRefs";
import { classifyError } from "../domain/errors";
import { readOrNull } from "../domain/repositoryHelpers";

const SIDECAR_SUFFIX = ".refs.json";

export function createTabRefsRepository(rootHandle: FileSystemDirectoryHandle): TabRefsRepository {
  return {
    async read(filePath) {
      const text = await readOrNull(() => readFile(rootHandle, sidecarPath(filePath)));
      if (text === null) return null;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.version !== 1) return null; // future versions: ticket bumps when migrating
        return parsed as TabRefsPayload;
      } catch {
        return null; // corrupt sidecar; treat as absent — lazy migration overwrites on next save
      }
    },
    async write(filePath, payload) {
      try {
        const json = JSON.stringify(payload, null, 2);
        await writeFile(rootHandle, sidecarPath(filePath), json);
      } catch (err) {
        throw classifyError(err);
      }
    },
  };
}

function sidecarPath(alphatexPath: string): string {
  return alphatexPath + SIDECAR_SUFFIX;
}

// readFile / writeFile: mirror tabRepo.ts's existing path-walk helpers exactly.
// If TAB-008 makes a third caller, prefer extracting to shared/fsHelpers.ts; otherwise
// inline the walk to keep the infra layer flat.
```

The `readOrNull` wrapper returns `null` on FileSystemError "not-found" and re-throws everything else; signature is `<T>(fn: () => Promise<T>) => Promise<T | null>`. Confirmed live at `domain/repositoryHelpers.ts:19`.

- [ ] **Step 5: Run + commit**

```bash
npm test -- tabRefsRepo
git add src/app/knowledge_base/domain/tabRefs.ts \
        src/app/knowledge_base/infrastructure/tabRefsRepo.ts \
        src/app/knowledge_base/infrastructure/tabRefsRepo.test.ts
git commit -m "feat(tabs): tabRefsRepo + TabRefsPayload domain types"
```

---

### T6 — Provide `tabRefs` in `RepositoryContext`

**Files:**
- Modify: `src/app/knowledge_base/shell/RepositoryContext.tsx`
- Modify: `src/app/knowledge_base/shell/StubRepositoryProvider.tsx`
- Test: `src/app/knowledge_base/shell/RepositoryContext.test.tsx` (extend)

**Goal:** Add `tabRefs: TabRefsRepository | null` to the `RepositoryProvider` bag so consumers below get `useRepositories().tabRefs`. Stub provider returns an in-memory implementation for tests.

- [ ] **Step 1: Extend `useRepositories` test**

```typescript
it("RepositoryProvider exposes tabRefs when a rootHandle is mounted", () => {
  // Mirror the existing tab-repo test at TAB-11.1-10
  const { result } = renderHook(() => useRepositories(), {
    wrapper: ({ children }) => (
      <RepositoryProvider rootHandle={mockRoot}>{children}</RepositoryProvider>
    ),
  });
  expect(result.current.tabRefs).not.toBeNull();
  expect(typeof result.current.tabRefs.read).toBe("function");
});

it("RepositoryProvider sets tabRefs = null when no rootHandle is mounted", () => {
  const { result } = renderHook(() => useRepositories(), {
    wrapper: ({ children }) => (
      <RepositoryProvider rootHandle={null}>{children}</RepositoryProvider>
    ),
  });
  expect(result.current.tabRefs).toBeNull();
});
```

- [ ] **Step 2: Run failing**

- [ ] **Step 3: Implement**

In `RepositoryContext.tsx`, add `tabRefs` to the bag built by the provider:

```typescript
const tabRefs = useMemo(
  () => (rootHandle ? createTabRefsRepository(rootHandle) : null),
  [rootHandle],
);
const value = useMemo(() => ({ ...existing, tabRefs }), [existing, tabRefs]);
```

In `StubRepositoryProvider.tsx`, add an in-memory stub that backs onto a `Map<string, TabRefsPayload>`. Export `createTabRefsStub()` for tests that want isolated state.

- [ ] **Step 4: Run + commit**

```bash
npm test -- RepositoryContext
git add src/app/knowledge_base/shell/RepositoryContext.tsx \
        src/app/knowledge_base/shell/StubRepositoryProvider.tsx \
        src/app/knowledge_base/shell/RepositoryContext.test.tsx
git commit -m "feat(tabs): expose tabRefs in RepositoryContext + stub"
```

---

### T7 — `tabSectionIds` resolver

**Files:**
- Create: `src/app/knowledge_base/domain/tabSectionIds.ts`
- Test: `src/app/knowledge_base/domain/tabSectionIds.test.ts`

**Goal:** Pure function that combines `TabMetadata.sections` with an optional `TabRefsPayload` and returns the stable id for each section. When sidecar data is present, it wins; absent entries fall back to today's `slugifySectionName + collision suffix`.

- [ ] **Step 1: Tests**

```typescript
import { describe, it, expect } from "vitest";
import { resolveSectionIds } from "./tabSectionIds";
import type { TabRefsPayload } from "./tabRefs";

describe("resolveSectionIds", () => {
  it("uses slug fallback when no sidecar exists", () => {
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], null))
      .toEqual(["intro", "verse-1"]);
  });

  it("collision-suffixes duplicate slugs in slug fallback", () => {
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Intro" }], null))
      .toEqual(["intro", "intro-2"]);
  });

  it("uses sidecar entry when currentName matches", () => {
    const refs: TabRefsPayload = {
      version: 1,
      sections: {
        "section-7": { currentName: "Verse 1", createdAt: 1 },
        "section-8": { currentName: "Intro", createdAt: 1 },
      },
    };
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], refs))
      .toEqual(["section-8", "section-7"]);
  });

  it("falls back to slug when sidecar has no entry for a current section", () => {
    const refs: TabRefsPayload = {
      version: 1,
      sections: { "section-7": { currentName: "Verse 1", createdAt: 1 } },
    };
    expect(resolveSectionIds([{ name: "Intro" }, { name: "Verse 1" }], refs))
      .toEqual(["intro", "section-7"]);
  });

  it("rename: same stableId resolves both before and after the name change", () => {
    const refs: TabRefsPayload = {
      version: 1,
      sections: { "stable-x": { currentName: "Verse 1", createdAt: 1 } },
    };
    expect(resolveSectionIds([{ name: "Verse 1" }], refs))[0]).toBe("stable-x");
    // Simulate rename — in real flow, T19 calls tabRefsRepo.write to update currentName.
  });
});
```

- [ ] **Step 2..4: Implement → run → pass**

```typescript
// src/app/knowledge_base/domain/tabSectionIds.ts
import { slugifySectionName, getSectionIds } from "./tabEngine";
import type { TabRefsPayload } from "./tabRefs";

export function resolveSectionIds(
  sections: { name: string }[],
  refs: TabRefsPayload | null,
): string[] {
  if (!refs) return getSectionIds(sections);
  const byName = invert(refs.sections);
  const usedFallbacks = new Map<string, number>();
  return sections.map((s) => {
    const stable = byName.get(s.name);
    if (stable) return stable;
    const base = slugifySectionName(s.name);
    const seen = usedFallbacks.get(base) ?? 0;
    usedFallbacks.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

function invert(sections: TabRefsPayload["sections"]): Map<string, string> {
  const m = new Map<string, string>();
  for (const [stable, entry] of Object.entries(sections)) m.set(entry.currentName, stable);
  return m;
}
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tabs): resolveSectionIds — sidecar-aware stable id resolver"
```

---

### T8 — `useTabEditMode` hook

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabEditMode.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabEditMode.test.ts`

**Goal:** Compose `useReadOnlyState(filePath, "tab-read-only")` + `paneReadOnly` (the prop from `TabPaneContext`) into `effectiveReadOnly`. Mirrors `DocumentView`'s pattern but accounts for the mobile force-true override.

- [ ] **Step 1: Tests**

```typescript
import { renderHook, act } from "@testing-library/react";
import { useTabEditMode } from "./useTabEditMode";

describe("useTabEditMode", () => {
  it("forces effectiveReadOnly true when paneReadOnly=true regardless of per-file state", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", true));
    expect(result.current.effectiveReadOnly).toBe(true);
    act(() => result.current.toggleReadOnly());
    expect(result.current.effectiveReadOnly).toBe(true); // stays gated by pane
  });

  it("uses per-file readOnly when paneReadOnly=false", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", false));
    expect(result.current.effectiveReadOnly).toBe(true); // default
    act(() => result.current.toggleReadOnly());
    expect(result.current.effectiveReadOnly).toBe(false);
  });

  it("toggle writes to localStorage with prefix tab-read-only", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", false));
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("tab-read-only:song.alphatex")).toBe("false");
  });
});
```

- [ ] **Step 2..5: Implement**

```typescript
// src/app/knowledge_base/features/tab/hooks/useTabEditMode.ts
import { useReadOnlyState } from "../../../shared/hooks/useReadOnlyState";

export function useTabEditMode(
  filePath: string | null,
  paneReadOnly: boolean,
): { effectiveReadOnly: boolean; perFileReadOnly: boolean; toggleReadOnly: () => void } {
  const { readOnly: perFileReadOnly, toggleReadOnly } = useReadOnlyState(
    filePath,
    "tab-read-only",
  );
  return {
    effectiveReadOnly: paneReadOnly || perFileReadOnly,
    perFileReadOnly,
    toggleReadOnly,
  };
}
```

```bash
npm test -- useTabEditMode
git add src/app/knowledge_base/features/tab/hooks/useTabEditMode.ts \
        src/app/knowledge_base/features/tab/hooks/useTabEditMode.test.ts
git commit -m "feat(tabs): useTabEditMode hook composing per-file + pane readOnly"
```

---

### T9 — Shared `PROPERTIES_COLLAPSED_KEY` constant (parked #6 fix)

**Files:**
- Create: `src/app/knowledge_base/shared/constants/paneStorage.ts`
- Modify: `src/app/knowledge_base/features/document/DocumentView.tsx` (find current `"properties-collapsed"` literal)
- Modify: `src/app/knowledge_base/features/diagram/hooks/useDiagramLayoutState.ts`
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx` (find current `"properties-collapsed"` literal)
- Test: `src/app/knowledge_base/shared/constants/paneStorage.test.ts` (compile-only assertion)

**Goal:** Replace the duplicated `"properties-collapsed"` localStorage literal across three call sites with `PROPERTIES_COLLAPSED_KEY`. Closes parked item #6 from the handoff doc.

- [ ] **Step 1: Create the constant**

```typescript
// src/app/knowledge_base/shared/constants/paneStorage.ts
/**
 * Shared localStorage keys for pane-level UI state.
 *
 * Multiple panes (document / diagram / tab) persist a "properties panel
 * collapsed?" boolean. Today they share a single key so toggling collapse
 * in one pane carries to the others (which the user asked to keep). Keep
 * the key shared until somebody asks for per-pane state.
 */
export const PROPERTIES_COLLAPSED_KEY = "properties-collapsed";
```

- [ ] **Step 2: Refactor each call site**

In `DocumentView.tsx`, `useDiagramLayoutState.ts`, and `TabView.tsx`, replace `"properties-collapsed"` literals with `PROPERTIES_COLLAPSED_KEY` imported from `shared/constants/paneStorage`. `grep -rn '"properties-collapsed"' src/` finds all sites.

- [ ] **Step 3: Run the existing pane tests**

```bash
npm test -- DocumentView DiagramView TabView
```
Expected: PASS — no behavioural change.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: hoist properties-collapsed localStorage key to a shared constant (parked #6)"
```

---

### T10 — `useTabEditHistory` hook (per-op ring buffer)

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabEditHistory.ts`
- Create: `src/app/knowledge_base/features/tab/editHistory/inverseOf.ts` (pure helper)
- Test: `src/app/knowledge_base/features/tab/hooks/useTabEditHistory.test.ts`
- Test: `src/app/knowledge_base/features/tab/editHistory/inverseOf.test.ts`

**Goal:** Per-op undo/redo with inverse-op storage. The hook owns `{ past: HistoryFrame[], future: HistoryFrame[] }`, capped at 200 frames; FIFO eviction. `apply(op)` snapshots pre-state, computes the inverse, dispatches the op, pushes a frame. `undo` and `redo` move frames between stacks and dispatch.

- [ ] **Step 1: `inverseOf` tests**

```typescript
describe("inverseOf", () => {
  it("set-fret(beat,string,X) ↔ set-fret(beat,string,prevValue)", () => {
    const op = { type: "set-fret", beat: 0, string: 6, fret: 12 } as const;
    const inverse = inverseOf(op, /* preState */ { fret: 5 });
    expect(inverse).toEqual({ type: "set-fret", beat: 0, string: 6, fret: 5 });
  });

  it("set-fret with new note (preState.fret = null) inverts to remove (fret = null)", () => {
    const op = { type: "set-fret", beat: 0, string: 6, fret: 12 } as const;
    const inverse = inverseOf(op, { fret: null });
    expect(inverse).toEqual({ type: "set-fret", beat: 0, string: 6, fret: null });
  });

  it("add-technique(X) ↔ remove-technique(X)", () => {
    const op = { type: "add-technique", beat: 0, string: 6, technique: "hammer-on" } as const;
    expect(inverseOf(op, /* preState n/a */ {})).toEqual({
      type: "remove-technique", beat: 0, string: 6, technique: "hammer-on",
    });
  });

  it("set-tempo inverts to set-tempo with previous bpm", () => {
    expect(inverseOf({ type: "set-tempo", beat: 0, bpm: 140 }, { bpm: 120 }))
      .toEqual({ type: "set-tempo", beat: 0, bpm: 120 });
  });

  // ... one test per TabEditOp variant
});
```

- [ ] **Step 2: Implement `inverseOf`**

`inverseOf(op, preState)` — pure function returning the reverse op. `preState` is whatever the caller captured before dispatch (a small struct per op type). Discriminate on `op.type` and return the inverse using `preState`.

- [ ] **Step 3: `useTabEditHistory` tests**

```typescript
describe("useTabEditHistory", () => {
  it("apply pushes a frame; undo dispatches the inverse", () => {
    const dispatch = vi.fn();
    const captureState = vi.fn().mockReturnValue({ fret: 5 });
    const { result } = renderHook(() => useTabEditHistory({ dispatch, captureState }));

    act(() => result.current.apply({ type: "set-fret", beat: 0, string: 6, fret: 12 }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 12 });

    act(() => result.current.undo());
    expect(dispatch).toHaveBeenLastCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 5 });
  });

  it("redo re-dispatches after undo", () => { /* ... */ });

  it("apply clears the future stack", () => { /* ... */ });

  it("evicts oldest frame when past exceeds 200", () => {
    const { result } = renderHook(() => useTabEditHistory({ /* ... */ }));
    for (let i = 0; i < 250; i++) {
      act(() => result.current.apply(/* synthetic op */));
    }
    expect(result.current.canUndo).toBe(true);
    // Undo 200 times — past is empty, can't undo further:
    for (let i = 0; i < 200; i++) act(() => result.current.undo());
    expect(result.current.canUndo).toBe(false);
  });
});
```

- [ ] **Step 4: Implement**

```typescript
const MAX_DEPTH = 200;

export function useTabEditHistory(deps: {
  dispatch: (op: TabEditOp) => void;
  captureState: (op: TabEditOp) => unknown;
}) {
  const [past, setPast] = useState<HistoryFrame[]>([]);
  const [future, setFuture] = useState<HistoryFrame[]>([]);

  const apply = useCallback((op: TabEditOp) => {
    const preState = deps.captureState(op);
    const inverse = inverseOf(op, preState);
    deps.dispatch(op);
    setPast((p) => {
      const next = [...p, { op, inverse, ts: Date.now() }];
      return next.length > MAX_DEPTH ? next.slice(next.length - MAX_DEPTH) : next;
    });
    setFuture([]);
  }, [deps]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const frame = p[p.length - 1];
      deps.dispatch(frame.inverse);
      setFuture((f) => [...f, frame]);
      return p.slice(0, -1);
    });
  }, [deps]);

  const redo = useCallback(() => { /* mirror of undo */ }, [deps]);

  return { apply, undo, redo, canUndo: past.length > 0, canRedo: future.length > 0 };
}
```

- [ ] **Step 5: Run + commit**

```bash
npm test -- useTabEditHistory inverseOf
git add src/app/knowledge_base/features/tab/hooks/useTabEditHistory.ts \
        src/app/knowledge_base/features/tab/hooks/useTabEditHistory.test.ts \
        src/app/knowledge_base/features/tab/editHistory/inverseOf.ts \
        src/app/knowledge_base/features/tab/editHistory/inverseOf.test.ts
git commit -m "feat(tabs): useTabEditHistory + inverseOf — per-op undo/redo with 200-frame depth"
```

---

### T11 — Editor chunk skeleton + lazy-load gate

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/TabEditor.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx` (replace marker comment with `next/dynamic` import + chunk gate)
- Test: `src/app/knowledge_base/features/tab/TabView.editor.test.tsx`

**Goal:** Skeleton editor chunk that mounts when `effectiveReadOnly === false`. The chunk is a single `<TabEditor>` component that, in this task, only renders a placeholder div with `data-testid="tab-editor"`. Real content lands in subsequent tasks. The point of T11 is to lock the chunk-loading wiring before any of the editor internals depend on it.

- [ ] **Step 1: Tests**

```typescript
describe("TabView editor chunk gate", () => {
  it("does not load TabEditor when paneReadOnly=true (mobile)", async () => {
    render(<TabView filePath="song.alphatex" /* paneReadOnly */ readOnly={true} />);
    await waitFor(() => {});
    expect(screen.queryByTestId("tab-editor")).toBeNull();
  });

  it("does not load TabEditor when perFileReadOnly=true (default)", async () => {
    render(<TabView filePath="song.alphatex" readOnly={false} />);
    await waitFor(() => {});
    expect(screen.queryByTestId("tab-editor")).toBeNull(); // perFileReadOnly defaults to true
  });

  it("loads TabEditor when both readOnly flags are false", async () => {
    localStorage.setItem("tab-read-only:song.alphatex", "false");
    render(<TabView filePath="song.alphatex" readOnly={false} />);
    expect(await screen.findByTestId("tab-editor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2..4: Implement**

```tsx
// src/app/knowledge_base/features/tab/editor/TabEditor.tsx
"use client";
import type { ReactElement } from "react";

export interface TabEditorProps {
  filePath: string;
  // Subsequent tasks add: session, score, dispatch, etc.
}

export default function TabEditor({ filePath }: TabEditorProps): ReactElement {
  return (
    <div data-testid="tab-editor" className="absolute inset-0 pointer-events-none">
      {/* T13–T17 fill this in */}
    </div>
  );
}
```

In `TabView.tsx`, replace the marker comment:

```tsx
// Top of file
import dynamic from "next/dynamic";
const LazyTabEditor = dynamic(() => import("./editor/TabEditor"), { ssr: false });

// Inside TabView component:
const { effectiveReadOnly } = useTabEditMode(filePath, readOnly /* paneReadOnly prop */);

// Replace the marker comment area with:
{!effectiveReadOnly && filePath && <LazyTabEditor filePath={filePath} />}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/editor/TabEditor.tsx \
        src/app/knowledge_base/features/tab/TabView.tsx \
        src/app/knowledge_base/features/tab/TabView.editor.test.tsx
git commit -m "feat(tabs): editor chunk skeleton + next/dynamic gate behind effectiveReadOnly"
```

---

### T12 — Edit/Read toggle button on `TabToolbar`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/components/TabToolbar.tsx`
- Test: `src/app/knowledge_base/features/tab/components/TabToolbar.editToggle.test.tsx`

**Goal:** Add a desktop-only toggle button that flips `perFileReadOnly` via `useTabEditMode`. Hidden on mobile because `paneReadOnly` overrides anyway. Mirrors the `Edit/Read` toggle button on `DocumentView`.

- [ ] **Step 1: Test**

```typescript
it("renders Edit toggle on desktop only", () => {
  // mock useViewport().isMobile = false
  render(<TabToolbar /* … existing props */ paneReadOnly={false} filePath="song.alphatex" />);
  expect(screen.getByRole("button", { name: /edit|read/i })).toBeInTheDocument();
});

it("does not render Edit toggle when paneReadOnly=true (mobile)", () => {
  render(<TabToolbar paneReadOnly={true} filePath="song.alphatex" />);
  expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
});

it("clicking the toggle flips perFileReadOnly state in localStorage", () => {
  render(<TabToolbar paneReadOnly={false} filePath="song.alphatex" />);
  fireEvent.click(screen.getByRole("button", { name: /edit/i }));
  expect(localStorage.getItem("tab-read-only:song.alphatex")).toBe("false");
});
```

- [ ] **Step 2..5: Implement, run, commit**

Pull the same pattern `DocumentView`'s toolbar uses. If `DocumentView`'s toggle is inline in `DocumentView.tsx` rather than a sub-component, mirror inline; don't pre-extract. Commit:

```bash
git commit -m "feat(tabs): TabToolbar Edit/Read toggle (desktop only)"
```

---

### T13 — `useTabCursor` (cursor state + arrow / Tab navigation)

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/hooks/useTabCursor.ts`
- Test: `src/app/knowledge_base/features/tab/editor/hooks/useTabCursor.test.ts`

**Goal:** Owns cursor state `{ trackIndex, beat, string } | null`. Exposes `setCursor(loc)`, `clear()`, and movement helpers `moveBeat(±1)`, `moveString(±1)`, `moveBar(±1)`. Movement clamps at score boundaries.

- [ ] **Step 1..5: Standard TDD cycle**

```typescript
const initial = { trackIndex: 0, beat: 4, string: 6 };
const meta = { totalBeats: 16, tracks: [{ tuning: 6 string array }, …] };

it("setCursor updates the cursor", () => { /* ... */ });
it("clear sets cursor to null", () => { /* ... */ });
it("moveBeat(+1) advances within bounds", () => { /* ... */ });
it("moveBeat(+1) at end clamps", () => { /* ... */ });
it("moveString(-1) at top string clamps", () => { /* ... */ });
it("moveBar(+1) snaps to first beat of next bar", () => { /* ... */ });
```

Implementation: `useState` for the cursor; movement helpers do the math against the `TabMetadata` passed in. No alphaTab dependency — pure hook.

```bash
git commit -m "feat(tabs): useTabCursor — cursor state + movement"
```

---

### T14 — `TabEditorCanvasOverlay` (click-to-cursor)

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/TabEditorCanvasOverlay.tsx`
- Test: `src/app/knowledge_base/features/tab/editor/TabEditorCanvasOverlay.test.tsx`

**Goal:** Transparent absolutely-positioned div over the TabCanvas. Receives pointer events; on click, computes the target `{ trackIndex, beat, string }` and calls `setCursor`. Renders a highlight box over the active cell (positioned via the Score's bar/beat geometry).

- [ ] **Step 1..5:**

If T0 confirmed alphaTab exposes a beat-level mouse-down event, the overlay subscribes via `api.beatMouseDown.on(...)` (or whichever name T0 documented) and translates the event payload into a `{ trackIndex, beat, string }` cursor target.

If alphaTab does NOT expose a beat hit-test, the overlay falls back to geometry: alphaTab provides `api.layout.regions` (or similar — verify in d.ts) which gives bar bounding boxes. Translate click coords → bar → beat by linear partition; string is determined by Y-offset within the bar relative to the tuning's number of strings.

**Acceptance — testability contract for T19:**

Each cursor-targetable cell renders as an invisible button (`<button>` with `pointer-events: auto` over an otherwise pointer-passthrough overlay) carrying:

```tsx
<button
  data-testid={`tab-editor-cursor-target-${beat}-${string}`}
  className="absolute opacity-0"
  style={{ left, top, width, height }}
  onClick={() => setCursor({ trackIndex, beat, string })}
/>
```

This makes the e2e click in T19 deterministic without depending on render geometry. The highlight (visible cursor) is a sibling element rendered at the active cell's coordinates.

Highlight styling: an absolutely-positioned rectangle (`bg-cyan-200/30 ring-2 ring-cyan-500`).

Tests use a mocked alphaTab API surface returning canned hit-test events. Component test asserts:
- A click on a `tab-editor-cursor-target-N-S` test-id fires `setCursor({ beat: N, string: S })`.
- The cursor highlight repositions on cursor state change.
- `data-testid` is present on every cursorable cell (count matches `metadata.totalBeats × tuning.length`).

```bash
git commit -m "feat(tabs): TabEditorCanvasOverlay — click-to-cursor + highlight"
```

---

### T15 — `useTabKeyboard` (keydown dispatcher)

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/hooks/useTabKeyboard.ts`
- Test: `src/app/knowledge_base/features/tab/editor/hooks/useTabKeyboard.test.ts`

**Goal:** Owns the keydown handler. Maps:

| Key | Action |
|---|---|
| `0`-`9` | digit accumulator → `set-fret` op on commit (timeout 500ms or non-digit press) |
| `Q` `W` `E` `R` `T` `Y` | `set-duration` op for the active cell (whole / half / quarter / eighth / sixteenth / thirty-second) |
| `H` `P` `B` `S` `L` `~` | `add-technique` (or `remove-technique` if already on) for hammer-on / pull-off / bend / slide / tie / vibrato |
| `Shift+M` | toggle palm-mute |
| `Shift+L` | toggle let-ring |
| `←` `→` | `cursor.moveBeat(±1)` |
| `↑` `↓` | `cursor.moveString(∓1)` (up = lower string index in scientific tuning order) |
| `Tab` `Shift+Tab` | `moveBar(±1)` |
| `Esc` | `cursor.clear()` |
| `⌘Z` `Ctrl+Z` | `history.undo()` |
| `⌘⇧Z` `Ctrl+Y` | `history.redo()` |

- [ ] **Step 1: Tests** — one test per key category, plus the multi-digit accumulator timing.

```typescript
it("0-9 accumulates digits and commits a set-fret op after 500ms", async () => {
  const apply = vi.fn();
  render(<TestHarness onApply={apply} />);
  fireEvent.keyDown(window, { key: "1" });
  fireEvent.keyDown(window, { key: "2" });
  vi.advanceTimersByTime(500);
  expect(apply).toHaveBeenCalledWith({ type: "set-fret", beat: 0, string: 6, fret: 12 });
});

it("non-digit key flushes the accumulator", () => {
  // type "1" then "h" → set-fret(1) committed before add-technique fires
});

it("Q maps to set-duration whole", () => { /* ... */ });
it("L maps to add-technique tie", () => { /* ... */ });
it("Shift+L maps to add-technique let-ring (not tie)", () => { /* ... */ });
it("⌘Z calls history.undo", () => { /* ... */ });
```

- [ ] **Step 2..4: Implement**

The handler uses `event.key` for digits / letters and `event.ctrlKey || event.metaKey` for the cmd-modifier shortcuts. Bare letter handling: lowercase the `event.key` before matching. `event.preventDefault()` on every recognised key to suppress browser defaults (the verification probe T0/Step 3 confirmed focus path).

Multi-digit accumulator: a ref holding the current digit string + a `setTimeout` ref. Each digit press resets the timer; non-digit key commits immediately.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(tabs): useTabKeyboard — keydown dispatcher for fret/duration/technique/history"
```

---

### T16 — `TabEditorToolbar` + sub-buttons

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/TabEditorToolbar.tsx`
- Create: `src/app/knowledge_base/features/tab/editor/components/DurationButtons.tsx`
- Create: `src/app/knowledge_base/features/tab/editor/components/TechniqueButtons.tsx`
- Create: `src/app/knowledge_base/features/tab/editor/components/HistoryButtons.tsx`
- Test: `src/app/knowledge_base/features/tab/editor/TabEditorToolbar.test.tsx`

**Goal:** The dedicated toolbar row that sits below the existing `TabToolbar` when in edit mode. Carries 6 duration buttons (`Q W E R T Y` shortcut letters in tooltips), 8 technique toggles (lit when active on the current cell), and undo/redo buttons (disabled when their respective stacks are empty).

- [ ] **Step 1..5:**

Each sub-component is small (~30 lines). Buttons use the project's `<Button>` primitive (find in `shared/ui/`). State for "is technique active on selected cell" comes from `useSelectedNoteDetails` (T17).

Tests verify rendering, click → dispatch, and disabled states for undo/redo.

```bash
git commit -m "feat(tabs): TabEditorToolbar + duration/technique/history sub-buttons"
```

---

### T17 — `useSelectedNoteDetails` + Properties panel "Selected note details"

**Files:**
- Create: `src/app/knowledge_base/features/tab/editor/hooks/useSelectedNoteDetails.ts`
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` (add `<SelectedNoteDetails />` subsection)
- Create: `src/app/knowledge_base/features/tab/properties/SelectedNoteDetails.tsx`
- Test: `src/app/knowledge_base/features/tab/properties/SelectedNoteDetails.test.tsx`

**Goal:** Read the current note from the Score given the cursor location, and render an editable "Selected note details" subsection in `TabProperties` carrying:
- bend amount (½ / full / 1½ / custom number input)
- slide direction (up / down / target — with target-fret input when "target")
- ghost / tap / tremolo / harmonic flag toggles (the techniques NOT in the keyboard set)

Each control dispatches via the editor's `apply(op)` (passed down from `TabEditor`).

- [ ] **Step 1..5: Standard cycle**

Subsection only renders when `cursor !== null && !readOnly`. Uses `<Disclosure>` or whatever expand/collapse primitive `TabProperties` already uses for sections.

```bash
git commit -m "feat(tabs): SelectedNoteDetails subsection in TabProperties + useSelectedNoteDetails"
```

---

### T18 — `useTabContent` extension + `useTabSectionSync` sidecar branching

**Files:**
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabContent.ts`
- Modify: `src/app/knowledge_base/features/tab/properties/useTabSectionSync.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabContent.test.ts` (extend)
- Test: `src/app/knowledge_base/features/tab/properties/useTabSectionSync.test.ts` (extend)

**Goal:** Two integration points wired up:

1. `useTabContent` grows `score`, `dirty`, and a `flush` function that calls `serializeScoreToAlphatex` + `tabRepo.write` debounced at `DRAFT_DEBOUNCE_MS = 500ms`. Read-only callers continue to receive raw text only.
2. `useTabSectionSync` checks `useRepositories().tabRefs?.read(filePath)` once per metadata change; if a sidecar payload exists, the position-based reconciliation is skipped.

**Sidecar update on section ops:** when the editor's `apply(op)` succeeds for `set-section` / `add-bar` / `remove-bar`, follow up with a `tabRefsRepo.write` call that mutates the sidecar accordingly. This logic lives in `TabEditor.tsx` (or a small `useTabRefsSync` hook colocated with the editor) rather than in `useTabContent` — keeps `useTabContent` agnostic of section semantics.

- [ ] **Step 1..5:** Standard cycle. Tests for:
- `useTabContent.flush` calls `serializeScoreToAlphatex` then `tabRepo.write`.
- Debounce: rapid mutations coalesce into one write.
- Sidecar branch: `useTabSectionSync` returns no migrations when a sidecar exists.
- Sidecar update on `set-section` rename: existing entry's `currentName` is overwritten.

```bash
git commit -m "feat(tabs): useTabContent dirty/score/flush + useTabSectionSync sidecar branch"
```

---

### T19 — e2e tab-editor smoke (defines parked #4/#5 fixture pattern)

**Files:**
- Create: `e2e/tabEditor.spec.ts`
- Create: `e2e/fixtures/tabFixtures.ts` (small alphaTex strings reusable across tab e2e tests)

**Goal:** End-to-end smoke proving the editor wires up correctly. Open a fixture `.alphatex`, toggle edit mode, click a string at a beat, type a fret, save, reopen, assert persistence. Defines the fixture pattern for subsequent tab e2e tests (closes parked items #4 and #5 by establishing a working pattern, even if those specific tests are written later).

- [ ] **Step 1: Write the fixture helper**

The repo uses `installMockFS` from `e2e/fixtures/fsMock.ts` (verified). The mock exposes `window.__kbMockFS` with `seed`, `read`, `reset`, `failNextWrite`. Pattern: install via `page.addInitScript(installMockFS)` once per test, seed files via `page.evaluate((files) => window.__kbMockFS.seed(files), {...})`, then drive the regular "Open Folder" button (the mocked picker resolves the seeded vault).

```typescript
// e2e/fixtures/tabFixtures.ts
/**
 * Tab e2e fixtures. Built on the existing fsMock pattern (installMockFS +
 * window.__kbMockFS). This file establishes the shared alphaTex source
 * strings + a small ergonomic wrapper for seeding multiple tabs at once.
 *
 * Future tab e2e tests should import these constants and use the mock's
 * `seed` / `read` directly via `page.evaluate(...)` rather than wrap further.
 */
import type { Page } from "@playwright/test";

export const SMOKE_TAB = `\\title "Smoke"\n.\n:4 0.6 1.6 2.6 3.6 |\n`;
export const TWO_BAR_TAB = `\\title "Two Bar"\n.\n:4 0.6 0.6 0.6 0.6 | :4 5.6 7.6 5.6 0.6 |\n`;

/** Seed one or more `.alphatex` paths into the mock vault. */
export async function seedTabs(page: Page, files: Record<string, string>): Promise<void> {
  await page.evaluate((seedFiles) => {
    if (!window.__kbMockFS) throw new Error("installMockFS must run before seedTabs");
    window.__kbMockFS.seed(seedFiles);
  }, files);
}

/** Read a file out of the mock vault for assertions. */
export async function readVaultFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => window.__kbMockFS?.read(p), path);
}
```

- [ ] **Step 2: Spec**

```typescript
import { test, expect } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";
import { SMOKE_TAB, seedTabs, readVaultFile } from "./fixtures/tabFixtures";

test.describe("tab editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(installMockFS);
  });

  test("click-edit-save round-trip", async ({ page }) => {
    await page.goto("/");
    await seedTabs(page, { "smoke.alphatex": SMOKE_TAB });

    // Open the (mocked) folder picker — resolves to the seeded vault root.
    await page.getByRole("button", { name: /open folder/i }).click();

    // Open the seeded file from the explorer
    await page.getByRole("button", { name: /smoke\.alphatex/ }).click();
    await expect(page.getByTestId("tab-canvas")).toBeVisible();

    // Toggle edit mode (per-file readOnly was true by default)
    await page.getByRole("button", { name: /edit/i }).click();
    await expect(page.getByTestId("tab-editor")).toBeAttached();

    // Click cursor target for beat 0, string 6 (T14's data-testid contract)
    await page.getByTestId("tab-editor-cursor-target-0-6").click();
    await page.keyboard.press("Digit5");
    // Wait for digit-accumulator commit (500ms timeout) + debounced save (500ms)
    await page.waitForTimeout(1200);

    // Read the persisted alphaTex out of the mock vault
    const persisted = await readVaultFile(page, "smoke.alphatex");
    expect(persisted).toBeDefined();
    expect(persisted).toContain("5.6"); // alphaTex grammar: fret 5 on string 6
  });
});
```

- [ ] **Step 3: Run**

```bash
npm run test:e2e -- tabEditor
```

The cursor target test-ids come from T14's acceptance contract. If the canvas itself isn't ready when the test asserts, add `await page.waitForFunction(() => !!document.querySelector('[data-testid^="tab-editor-cursor-target-"]'))` before the click. Audio-engine readiness flake (per the existing `feedback_preview_verification_limits.md` ceiling) is not a concern here — this test does not exercise playback.

- [ ] **Step 4: Commit**

```bash
git add e2e/tabEditor.spec.ts e2e/fixtures/tabFixtures.ts
git commit -m "test(tabs): TAB-008 e2e editor smoke + fixture pattern (parked #4/#5)"
```

---

### T20 — Update `Features.md` §11.8

**Files:**
- Modify: `Features.md`

**Goal:** Insert a new `### 11.8 Editor v1 (TAB-008)` between the existing `### 11.7 Mobile (TAB-012)` and `### 11.8 Pending`; renumber the existing Pending block to `### 11.9` and drop its `Editor (M2)` placeholder bullet (now ✅ in §11.8). The numbering in `Features.md` is independent from `test-cases/11-tabs.md` — test cases live at §11.9 there because that file already used §11.8 for Mobile (TAB-012).

- [ ] **Step 1: Insert the new section**

```markdown
### 11.8 Editor v1 (TAB-008)

Click-to-place + keyboard editing for `.alphatex` tabs. Single-track scope. Lazy-loaded sibling chunk gated behind `effectiveReadOnly`.

- ✅ **Persistent cursor + click-to-place fret.** Click any string × beat → cursor highlights; bare digits 0–9 set fret. Multi-digit auto-commits after 500 ms or on next non-digit. Arrow / Tab / Shift+Tab navigate; Esc clears.
- ✅ **Q W E R T Y duration shortcuts.** Whole / half / quarter / eighth / sixteenth / thirty-second.
- ✅ **Technique keys.** `H` `P` `B` `S` `L` `~` `Shift+M` `Shift+L` toggle hammer-on / pull-off / bend / slide / tie / vibrato / palm-mute / let-ring. Bend defaults to ½-step; slide defaults to slide-up. Per-note adjustments live in the Properties panel.
- ✅ **Per-op undo/redo.** Inverse-op storage; ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Y). 200-frame depth.
- ✅ **Section-id sidecar.** `<file>.alphatex.refs.json` persists `stableId → currentName` so renames + reorders survive cross-references.
- ✅ **Edit/Read toggle.** `useTabEditMode` composes per-file localStorage state + pane-level `readOnly`; mobile force-reads. Toolbar toggle visible on desktop only.
- ✅ **Selected note details.** `TabProperties` grows a subsection for bend amount / slide direction / ghost / tap / tremolo / harmonic.
- ⚙️ **Lazy editor chunk.** `next/dynamic({ ssr: false })`; chunk excluded from mobile bundle and from read-only desktop sessions.

### 11.9 Pending

- ? **Multi-track + per-track tuning/capo (TAB-009)**
- ? **Export — MIDI / WAV / PDF (TAB-010)**
```

- [ ] **Step 2: Commit**

```bash
git add Features.md
git commit -m "docs: Features.md §11.8 — TAB-008 editor v1"
```

---

### T21 — Update `test-cases/11-tabs.md` §11.8

**Files:**
- Modify: `test-cases/11-tabs.md`

**Goal:** Add `## 11.8 Editor v1 (TAB-008)` after the existing `## 11.7 Cross-references`. Renumber the old `## 11.8 Mobile` section (which TAB-012 added) — wait, check the current numbering: TAB-012 added §11.8 Mobile. So this becomes §11.9 Editor v1. Verify numbering before committing.

- [ ] **Step 1: Audit current numbering**

```bash
grep -n "^## 11\." test-cases/11-tabs.md
```

If §11.8 is already Mobile (from TAB-012), the editor is `## 11.9 Editor v1`. Update the §11.9 reference in T20 (Features.md) to match.

- [ ] **Step 2: Add cases**

Pick 20–25 case IDs that map directly to the spec acceptance + each task's test list. Examples:

```markdown
## 11.9 Editor v1 (TAB-008)

[summary line]

- **TAB-11.9-01** ❌ **Click on a string × beat sets the cursor** — _(component: TabEditorCanvasOverlay.test.tsx.)_
- **TAB-11.9-02** ❌ **Bare digit accumulator commits set-fret after 500ms timeout** — _(unit: useTabKeyboard.test.ts.)_
- **TAB-11.9-03** ❌ **Bare digit accumulator commits on non-digit key** — _(unit.)_
- **TAB-11.9-04** ❌ **Q sets active duration to whole** — _(unit: useTabKeyboard.test.ts.)_
- **TAB-11.9-05** ❌ **L toggles tie technique on the current note** — _(unit.)_
- **TAB-11.9-06** ❌ **Shift+L toggles let-ring (not tie)** — _(unit.)_
- **TAB-11.9-07** ❌ **B applies default ½-step bend** — _(unit: alphaTabEngine.applyEdit.test.ts.)_
- **TAB-11.9-08** ❌ **S applies slide-up by default; repeated S cycles direction** — _(unit.)_
- **TAB-11.9-09** ❌ **⌘Z dispatches the inverse of the last op** — _(unit: useTabEditHistory.test.ts.)_
- **TAB-11.9-10** ❌ **Undo/redo across 250 ops evicts oldest at depth 200** — _(unit.)_
- **TAB-11.9-11** ❌ **applyEdit set-fret throws on missing beat** — _(unit: alphaTabEngine.applyEdit.test.ts.)_
- **TAB-11.9-12** ❌ **applyEdit set-fret with fret=null removes the note** — _(unit.)_
- **TAB-11.9-13** ❌ **applyEdit add-technique sets the technique flag** — _(unit.)_
- **TAB-11.9-14** ❌ **applyEdit remove-technique clears the flag** — _(unit.)_
- **TAB-11.9-15** ❌ **applyEdit set-section adds/renames/removes** — _(unit.)_
- **TAB-11.9-16** ❌ **applyEdit add-bar appends a master bar** — _(unit.)_
- **TAB-11.9-17** ❌ **applyEdit remove-bar refuses last bar** — _(unit.)_
- **TAB-11.9-18** ❌ **resolveSectionIds prefers sidecar over slug fallback** — _(unit: tabSectionIds.test.ts.)_
- **TAB-11.9-19** ❌ **resolveSectionIds rename: same stableId both before + after** — _(unit.)_
- **TAB-11.9-20** ❌ **tabRefsRepo round-trips a payload** — _(unit: tabRefsRepo.test.ts.)_
- **TAB-11.9-21** ❌ **tabRefsRepo read returns null when sidecar absent** — _(unit.)_
- **TAB-11.9-22** ❌ **useTabEditMode forces read-only when paneReadOnly=true** — _(unit.)_
- **TAB-11.9-23** ❌ **TabView does not load editor chunk in read-only mode** — _(component: TabView.editor.test.tsx.)_
- **TAB-11.9-24** ❌ **TabEditorToolbar shows Edit toggle on desktop only** — _(component.)_
- **TAB-11.9-25** ❌ **Selected note details subsection only renders with cursor + edit mode** — _(component.)_
- **TAB-11.9-26** 🧪 **e2e click-edit-save round-trip** — _(playwright: tabEditor.spec.ts.)_
- **TAB-11.9-27** ❌ **PROPERTIES_COLLAPSED_KEY consolidated across DocumentView/DiagramView/TabView** — _(grep assertion in `paneStorage.test.ts`.)_
```

- [ ] **Step 3: Flip statuses to ✅ as tasks land**

The maintenance contract requires status flips in the same commit as the test. Don't batch.

- [ ] **Step 4: Commit**

```bash
git add test-cases/11-tabs.md
git commit -m "docs(tabs): test-cases §11.9 Editor v1 (TAB-008)"
```

---

## Out of scope

- Multi-track editing (TAB-009).
- Per-track tuning / capo (TAB-009).
- Export to MIDI / WAV / PDF (TAB-010).
- Raw alphaTex power-user mode (deferred to M3).
- Recording from real guitar (out per source-spec non-goals).
- Diagram attachment integrity audit (parked #11 stays out per D9).

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `score.clone()` required per edit (T0 finds in-place mutation unsafe) | Switch each `applyEdit` to clone before mutating; cost is well-bounded since Score is small relative to render time. |
| alphaTab beat hit-test API absent | T14 falls back to geometry — slower to write, but the overlay's `data-testid` attributes keep tests green. |
| Bare-letter keydown swallowed by browser default | T15 `preventDefault`s on every recognised key; T0/Step 3 verifies focus path. |
| Editor chunk size exceeds budget | `next build --analyze` once T11 lands; if chunk is heavy, split duration/technique buttons into a deeper sub-chunk. |
| `tabRefsRepo` write failure leaves cross-references broken | Sidecar update is best-effort; failure surfaces a banner via `useShellErrors` and retries on next save (D7 flow). |
| Playwright audio readiness flake bleeds into editor e2e | T19 doesn't touch playback — pure edit-save-reload. Tab editor tests run with `enablePlayer: false` if alphaTab settings allow; otherwise rely on overlay test-ids only. |
| Concurrent multi-pane edits to the same file | Existing `ConflictBanner` + file-watcher path catches this; behaviour unchanged from M1. |

---

## Process

1. Subagent-driven, ordered: T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12 → T13 → T14 → T15 → T16 → T17 → T18 → T19 → T20 → T21.
2. Two-stage review per task (Sonnet for impl, Haiku for cheap verification reviews per the handoff Process recipe).
3. Final reviewer pass over the branch diff before PR.
4. Verification ceiling per `feedback_preview_verification_limits.md`: clean build + clean Vitest + clean Playwright (within fixture-pattern bounds) + clean console.
5. After merge: handoff doc Doc-update protocol; M2 entry checked off; TAB-009 becomes Next Action.

---

## Self-review checklist

Before invoking subagent-driven-development:

- [ ] Every spec D-decision has a task that implements it (D1 → T0+T2-T4; D2 → T13-T15; D3 → T8+T11+T12; D4 → T16; D5 → T3+T17; D6 → T10; D7 → T5-T7+T18; D8 → T9; D9 → out of scope, no task).
- [ ] No placeholders ("TBD", "implement later", "similar to") in any task.
- [ ] Type names consistent across tasks (`TabRefsPayload`, `TabRefsRepository`, `TabEditOp`, `TabMetadata`).
- [ ] Test case IDs renumbered to match the actual current §11.x in `test-cases/11-tabs.md` (audit at T21/Step 1).
- [ ] Branch is `plan/guitar-tabs-editor`; every task commits there.
