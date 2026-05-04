/**
 * Tests for AlphaTabSession.applyEdit — set-fret and set-duration ops.
 *
 * Strategy: mock AlphaTabApi so that tex() fires scoreLoaded with a real
 * Score object (parsed by the real AlphaTexImporter).  This lets us verify
 * in-place mutation without needing a canvas / workers (unavailable in jsdom).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mutable state shared between the vi.mock factory and tests.
// ---------------------------------------------------------------------------
let fakeApiInstance: {
  scoreLoaded: { fire(p: unknown): void };
  renderScoreMock: ReturnType<typeof vi.fn>;
  texPayload: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} & Record<string, any>;

class FakeEvent<T> {
  private handlers: ((payload: T) => void)[] = [];
  on(handler: (payload: T) => void) {
    this.handlers.push(handler);
  }
  fire(payload: T) {
    for (const h of this.handlers) h(payload);
  }
}

vi.mock("@coderline/alphatab", async (importOriginal) => {
  const real = await importOriginal<typeof import("@coderline/alphatab")>();

  class FakeApiCtor {
    scoreLoaded = new FakeEvent<unknown>();
    error = new FakeEvent<Error>();
    playerReady = new FakeEvent<void>();
    playerStateChanged = new FakeEvent<{ state: number; stopped: boolean }>();
    playerPositionChanged = new FakeEvent<{
      currentTick: number;
      endTick: number;
      currentTime: number;
      endTime: number;
    }>();
    tickPosition = 0;
    playbackSpeed = 1;
    playbackRange: { startTick: number; endTick: number } | null = null;
    isLooping = false;
    renderScoreMock = vi.fn();
    changeTrackMute = vi.fn();
    changeTrackSolo = vi.fn();
    texPayload: unknown = null;

    tex(_text: string) {
      // fire scoreLoaded synchronously with the pre-parsed real Score
      if (this.texPayload !== null) {
        this.scoreLoaded.fire(this.texPayload);
      }
    }
    renderTracks() {}
    destroy() {}
    play() { return true; }
    pause() {}
    stop() {}
    renderScore(score: unknown) {
      this.renderScoreMock(score);
      // Mirror production: renderScore re-fires scoreLoaded, which triggers
      // handleScoreLoaded → emit("loaded").  Without this the fake is a no-op
      // and the double-emit bug goes undetected.
      this.scoreLoaded.fire(score);
    }

    constructor(_el: HTMLElement, _settings: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeApiInstance = this as any;
    }
  }

  return { ...real, AlphaTabApi: FakeApiCtor };
});

import { AlphaTabEngine, findTrack, locateBarIndex, locateBeat, scientificPitchToMidi } from "./alphaTabEngine";

// ---------------------------------------------------------------------------
// FIXTURE: one bar, 4 quarter-note beats on string 6 with frets 5,0,0,0.
// beat index 0 → fret 5, string 6
// ---------------------------------------------------------------------------
const FIXTURE = `\\title "Edit Probe"\n.\n:4 5.6 0.6 0.6 0.6 |`;

async function buildScore() {
  const mod = await import("@coderline/alphatab");
  const importer = new mod.importer.AlphaTexImporter();
  const settings = new mod.Settings();
  importer.init(mod.io.ByteBuffer.empty(), settings);
  importer.initFromString(FIXTURE, settings);
  return importer.readScore();
}

// ---------------------------------------------------------------------------
// Score-walk helpers
// (Use `any` because the alphaTab Score type tree is deep; typed enough for tests)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBeat(session: any, globalBeatIndex: number): any {
  const score = session.latestScore;
  if (!score) throw new Error("No score on session");
  let counter = 0;
  for (const bar of score.tracks[0].staves[0].bars) {
    for (const beat of bar.voices[0].beats) {
      if (counter === globalBeatIndex) return beat;
      counter++;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNoteFret(session: any, beatIndex: number, stringNum: number): number | null {
  const beat = findBeat(session, beatIndex);
  if (!beat) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note = beat.notes.find((n: any) => n.string === stringNum);
  return note != null ? note.fret : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBeatDuration(session: any, beatIndex: number): number {
  const beat = findBeat(session, beatIndex);
  if (!beat) throw new Error(`Beat ${beatIndex} not found`);
  return beat.duration as number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNote(session: any, beatIndex: number, stringNum: number): any {
  const beat = findBeat(session, beatIndex);
  if (!beat) throw new Error(`Beat ${beatIndex} not found`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return beat.notes.find((n: any) => n.string === stringNum) ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findScore(session: any): any {
  const score = session.latestScore;
  if (!score) throw new Error("No score on session");
  return score;
}

/**
 * Return the global beat index of the first beat in barIdx (0-based).
 * Walks tracks[0]→staves[0]→bars[0..barIdx-1] summing beat counts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getFirstBeatOfBar(session: any, barIdx: number): number {
  const score = findScore(session);
  const bars = score.tracks[0].staves[0].bars;
  let counter = 0;
  for (let i = 0; i < barIdx; i++) {
    counter += bars[i].voices[0].beats.length;
  }
  return counter;
}

/**
 * Read the appropriate flag from the note for the given technique.
 * Returns boolean (true = technique is active).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNoteHasTechnique(session: any, beatIndex: number, stringNum: number, technique: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note = findNote(session, beatIndex, stringNum) as any;
  if (!note) throw new Error(`Note at beat ${beatIndex} string ${stringNum} not found`);
  switch (technique) {
    case "hammer-on": return note.isHammerPullOrigin === true;
    case "pull-off":  return note.isHammerPullOrigin === true;
    case "bend":      return note.bendType !== 0 && note.bendType != null;
    case "slide":     return note.slideOutType !== 0 && note.slideOutType != null;
    case "tie":       return note.isTieDestination === true;
    case "ghost":     return note.isGhost === true;
    case "vibrato":   return note.vibrato !== 0 && note.vibrato != null;
    case "let-ring":  return note.isLetRing === true;
    case "palm-mute": return note.isPalmMute === true;
    case "tremolo":   return note.beat?.tremoloSpeed != null;
    case "tap":       return note.beat?.tap === true;
    case "harmonic":  return note.harmonicType !== 0 && note.harmonicType != null;
    default:          throw new Error(`Unknown technique: ${technique}`);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("AlphaTabSession.applyEdit", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any;

  beforeEach(async () => {
    const score = await buildScore();

    // Mount with a no-op source; override texPayload so tex() fires scoreLoaded
    // with the real Score.  The trick: fakeApiInstance is set synchronously in
    // the FakeApiCtor constructor which runs inside mount() before load() is
    // called.  mount() does: new ApiCtor(el, settings) → then session.load(src).
    // We interpose by patching texPayload between construction and load() via
    // a promise-racing trick — BUT the simpler and correct way is: since the
    // import() inside mount() is the only async boundary, fakeApiInstance is
    // available by the time load() calls tex().
    //
    // Actual call order inside mount():
    //   await import(...)           ← async boundary
    //   new ApiCtor(el, settings)   ← sets fakeApiInstance  (sync)
    //   session.load(source)        ← calls api.tex()        (sync-ish)
    //
    // So we can't set texPayload *before* mount() returns from the import().
    // Solution: provide a custom source text that the fake api ignores, and
    // manually fire scoreLoaded after mount() resolves by setting texPayload
    // then calling a second load().

    const engine = new AlphaTabEngine();
    const container = document.createElement("div");
    document.body.appendChild(container);

    // Phase 1: mount with no initial source to just get the session constructed.
    session = await engine.mount(container, { readOnly: false });

    // Phase 2: inject the real Score and do a manual load.
    fakeApiInstance.texPayload = score;
    await session.load({ kind: "alphatex", text: FIXTURE });
  });

  it("set-fret mutates the targeted note", () => {
    const meta = session.applyEdit({
      type: "set-fret",
      beat: 0,
      string: 6,
      fret: 12,
    });
    expect(meta).toBeDefined();
    expect(getNoteFret(session, 0, 6)).toBe(12);
  });

  it("set-fret with fret=null removes the note", () => {
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: null });
    expect(getNoteFret(session, 0, 6)).toBeNull();
  });

  it("set-fret on a string with no existing note adds the note", () => {
    // beat 0 only has a note on string 6; adding to string 1 must create new note
    session.applyEdit({ type: "set-fret", beat: 0, string: 1, fret: 3 });
    expect(getNoteFret(session, 0, 1)).toBe(3);
  });

  it("set-duration changes the beat duration", () => {
    // Duration.Eighth = 8
    session.applyEdit({ type: "set-duration", beat: 0, duration: 8 });
    expect(getBeatDuration(session, 0)).toBe(8);
  });

  it("throws when the targeted beat does not exist", () => {
    expect(() =>
      session.applyEdit({ type: "set-fret", beat: 999, string: 6, fret: 0 }),
    ).toThrow(/beat/i);
  });

  it("applyEdit calls api.renderScore with the mutated score", () => {
    fakeApiInstance.renderScoreMock.mockClear();
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: 7 });
    expect(fakeApiInstance.renderScoreMock).toHaveBeenCalledOnce();
  });

  it("applyEdit emits a loaded event with updated metadata", () => {
    const events: unknown[] = [];
    session.on("loaded", (e: unknown) => events.push(e));
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: 7 });
    expect(events).toHaveLength(1);
  });

  it("throws for unsupported op type", () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.applyEdit({ type: "totally-unknown-op" as any, beat: 0 }),
    ).toThrow(/Unsupported op/i);
  });

  // ---------------------------------------------------------------------------
  // Technique ops (add-technique / remove-technique)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // NOTE: The fixture `:4 5.6 0.6 0.6 0.6` uses AlphaTex notation where
  // `fret.string` orders from the high-E string (1) upward.  alphaTab stores
  // the note internally with string=1 (the lowest string index from the top).
  // All technique tests therefore target string=1 which is where beat 0's note
  // actually lives in the parsed Score.
  // The "throws when note does not exist" test uses string=99 (absent).
  // ---------------------------------------------------------------------------

  it("add-technique sets the technique flag on the targeted note (hammer-on)", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "hammer-on" });
    expect(getNoteHasTechnique(session, 0, 1, "hammer-on")).toBe(true);
  });

  it("remove-technique clears the flag (hammer-on)", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "hammer-on" });
    session.applyEdit({ type: "remove-technique", beat: 0, string: 1, technique: "hammer-on" });
    expect(getNoteHasTechnique(session, 0, 1, "hammer-on")).toBe(false);
  });

  it("bend applies a default ½-step bend", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "bend" });
    const note = findNote(session, 0, 1);
    expect(note.bendType).toBeTruthy();
    expect(note.bendPoints![1].value).toBe(50);
  });

  describe("applyEdit add-technique bend — amount cycle", () => {
    it("amount 50 produces a half-step bend (default behavior preserved when omitted)", () => {
      session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "bend" });
      const note = findNote(session, 0, 1);
      expect(note.bendType).toBeTruthy();
      expect(note.bendPoints![1].value).toBe(50);
    });

    it("amount 100 produces a full-step bend", () => {
      session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "bend", amount: 100 });
      const note = findNote(session, 0, 1);
      expect(note.bendType).toBeTruthy();
      expect(note.bendPoints![1].value).toBe(100);
    });

    it("explicit amount 50 matches default", () => {
      session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "bend", amount: 50 });
      const note = findNote(session, 0, 1);
      expect(note.bendType).toBeTruthy();
      expect(note.bendPoints![1].value).toBe(50);
    });
  });

  it("slide applies slide-up by default", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "slide" });
    expect(findNote(session, 0, 1).slideOutType).toBeTruthy();
  });

  it("throws when the targeted note does not exist", () => {
    expect(() =>
      session.applyEdit({ type: "add-technique", beat: 0, string: 99, technique: "hammer-on" }),
    ).toThrow(/note/i);
  });

  it("add-technique pull-off sets isHammerPullOrigin (same flag as hammer-on)", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "pull-off" });
    expect(getNoteHasTechnique(session, 0, 1, "pull-off")).toBe(true);
  });

  it("add-technique ghost sets isGhost on the note", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "ghost" });
    expect(getNoteHasTechnique(session, 0, 1, "ghost")).toBe(true);
  });

  it("add-technique let-ring sets isLetRing on the note", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "let-ring" });
    expect(getNoteHasTechnique(session, 0, 1, "let-ring")).toBe(true);
  });

  it("add-technique palm-mute sets isPalmMute on the note", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "palm-mute" });
    expect(getNoteHasTechnique(session, 0, 1, "palm-mute")).toBe(true);
  });

  it("add-technique vibrato sets vibrato on the note", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "vibrato" });
    expect(getNoteHasTechnique(session, 0, 1, "vibrato")).toBe(true);
  });

  it("add-technique harmonic sets harmonicType on the note", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "harmonic" });
    expect(getNoteHasTechnique(session, 0, 1, "harmonic")).toBe(true);
  });

  it("add-technique tap sets beat.tap on the note's parent beat", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "tap" });
    expect(getNoteHasTechnique(session, 0, 1, "tap")).toBe(true);
  });

  it("add-technique tremolo sets beat.tremoloSpeed on the note's parent beat", () => {
    session.applyEdit({ type: "add-technique", beat: 0, string: 1, technique: "tremolo" });
    expect(getNoteHasTechnique(session, 0, 1, "tremolo")).toBe(true);
  });

  it("emits exactly one 'loaded' event per applyEdit call", () => {
    const loadedEvents: unknown[] = [];
    session.on("loaded", (e: unknown) => loadedEvents.push(e));
    // Clear any events captured during beforeEach setup
    loadedEvents.length = 0;
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    expect(loadedEvents).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // Structural ops: set-tempo, set-section, add-bar, remove-bar
  // ---------------------------------------------------------------------------

  it("set-tempo writes a tempo automation at the targeted beat", () => {
    session.applyEdit({ type: "set-tempo", beat: 0, bpm: 140 });
    const meta = session.applyEdit({ type: "set-tempo", beat: 0, bpm: 140 }); // idempotent
    expect(meta.tempo).toBe(140);
  });

  it("set-section adds a section name to the bar containing the beat", () => {
    session.applyEdit({ type: "set-section", beat: 0, name: "Intro" });
    const score = findScore(session);
    expect(score.masterBars[0].section?.text).toBe("Intro");
  });

  it("set-section with name=null removes the section marker", () => {
    session.applyEdit({ type: "set-section", beat: 0, name: "Intro" });
    session.applyEdit({ type: "set-section", beat: 0, name: null });
    expect(findScore(session).masterBars[0].section).toBeFalsy();
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
});

// ---------------------------------------------------------------------------
// Unit tests for exported locate helpers (findTrack, locateBarIndex, locateBeat)
// These tests use hand-rolled ScoreShape objects so they don't depend on the
// AlphaTexImporter and exercise the helpers in isolation.
// ---------------------------------------------------------------------------
describe("locate helpers", () => {
  // Minimal beat objects — identity checks use object reference.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeBeat = () => ({ duration: 4, notes: [], addNote() {}, removeNote() {} } as any);

  // Build a minimal two-track ScoreShape:
  //   track 0 (index 0): 1 bar, voice 0 has 2 beats [beat0a, beat0b]
  //   track 1 (index 1): 1 bar, voice 0 has 1 beat  [beat1a]
  //                               voice 1 has 1 beat  [beat1b_v2]
  const beat0a = makeBeat();
  const beat0b = makeBeat();
  const beat1a = makeBeat();
  const beat1b_v2 = makeBeat();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score: any = {
    masterBars: [],
    tracks: [
      {
        index: 0,
        staves: [{ bars: [{ voices: [{ beats: [beat0a, beat0b], addBeat() {} }] }] }],
      },
      {
        index: 1,
        staves: [
          {
            bars: [
              {
                voices: [
                  { beats: [beat1a],     addBeat() {} },
                  { beats: [beat1b_v2],  addBeat() {} },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  it("findTrack returns null for an unknown trackId", () => {
    expect(findTrack(score, "99")).toBeNull();
  });

  it("findTrack returns the matching track by string-index", () => {
    expect(findTrack(score, "1")).toBe(score.tracks[1]);
  });

  it("locateBeat defaults to track 0, voice 0", () => {
    expect(locateBeat(score, 0)).toBe(beat0a);
    expect(locateBeat(score, 1)).toBe(beat0b);
  });

  it("locateBeat returns null for a beat index beyond the track length", () => {
    expect(locateBeat(score, 99)).toBeNull();
  });

  it("locateBeat returns null for an unknown trackId", () => {
    expect(locateBeat(score, 0, "99")).toBeNull();
  });

  it("locateBeat locates beat in the requested trackIndex / voiceIndex (TAB-009 T3)", () => {
    // beat1b_v2 is track[1] (trackId "1"), voice 1, beat index 0 within that voice
    expect(locateBeat(score, 0, "1", 1)).toBe(beat1b_v2);
  });

  it("locateBeat falls back to voice 0 when voiceIndex 1 is absent", () => {
    // track 0 only has voice 0; requesting voice 1 should fall back to voice 0
    expect(locateBeat(score, 0, "0", 1)).toBe(beat0a);
  });

  it("locateBarIndex defaults to track 0, voice 0", () => {
    expect(locateBarIndex(score, 0)).toBe(0);
    expect(locateBarIndex(score, 1)).toBe(0);
  });

  it("locateBarIndex returns -1 for a beat index beyond the track length", () => {
    expect(locateBarIndex(score, 99)).toBe(-1);
  });

  it("locateBarIndex returns -1 for an unknown trackId", () => {
    expect(locateBarIndex(score, 0, "99")).toBe(-1);
  });

  it("locateBarIndex locates bar in the requested trackIndex / voiceIndex", () => {
    expect(locateBarIndex(score, 0, "1", 1)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Multi-track applyEdit tests (TAB-009 T4)
// Uses a two-track alphatex fixture:
//   track 0 (index 0): 1 bar, 2 quarter beats — fret 5 on string 6, fret 0 on string 6
//   track 1 (index 1): 1 bar, 2 quarter beats — fret 3 on string 3, fret 1 on string 3
// beat global index within each track: 0 and 1
// ---------------------------------------------------------------------------
const MT_FIXTURE = `\\title "MultiTrack"\n.\n\\track "T0"\n:4 5.6 0.6 |\n\\track "T1"\n:4 3.3 1.3 |`;

async function buildMultiTrackScore() {
  const mod = await import("@coderline/alphatab");
  const importer = new mod.importer.AlphaTexImporter();
  const settings = new mod.Settings();
  importer.init(mod.io.ByteBuffer.empty(), settings);
  importer.initFromString(MT_FIXTURE, settings);
  return importer.readScore();
}

/**
 * Walk a specific track (by trackId) to find the beat at globalBeatIndex.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBeatOnTrack(session: any, trackId: string, globalBeatIndex: number): any {
  const score = session.latestScore;
  if (!score) throw new Error("No score on session");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const track = score.tracks.find((t: any) => String(t.index) === trackId);
  if (!track) throw new Error(`Track ${trackId} not found`);
  let counter = 0;
  for (const bar of track.staves[0].bars) {
    for (const beat of bar.voices[0].beats) {
      if (counter === globalBeatIndex) return beat;
      counter++;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNoteFretOnTrack(session: any, trackId: string, beatIndex: number, stringNum: number): number | null {
  const beat = findBeatOnTrack(session, trackId, beatIndex);
  if (!beat) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note = beat.notes.find((n: any) => n.string === stringNum);
  return note != null ? note.fret : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getBeatDurationOnTrack(session: any, trackId: string, beatIndex: number): number {
  const beat = findBeatOnTrack(session, trackId, beatIndex);
  if (!beat) throw new Error(`Beat ${beatIndex} not found on track ${trackId}`);
  return beat.duration as number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNoteHasTechniqueOnTrack(session: any, trackId: string, beatIndex: number, stringNum: number, technique: string): boolean {
  const beat = findBeatOnTrack(session, trackId, beatIndex);
  if (!beat) throw new Error(`Beat ${beatIndex} not found on track ${trackId}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note = beat.notes.find((n: any) => n.string === stringNum);
  if (!note) throw new Error(`Note on string ${stringNum} at beat ${beatIndex} track ${trackId} not found`);
  switch (technique) {
    case "hammer-on": return note.isHammerPullOrigin === true;
    case "ghost":     return note.isGhost === true;
    default:          throw new Error(`Unknown technique in test helper: ${technique}`);
  }
}

describe("AlphaTabSession.applyEdit — multi-track / multi-voice (TAB-009 T4)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any;

  beforeEach(async () => {
    const score = await buildMultiTrackScore();

    const engine = new AlphaTabEngine();
    const container = document.createElement("div");
    document.body.appendChild(container);

    session = await engine.mount(container, { readOnly: false });

    fakeApiInstance.texPayload = score;
    await session.load({ kind: "alphatex", text: MT_FIXTURE });
  });

  it("fixture has two tracks with expected frets (sanity check)", () => {
    // track 0, beat 0: fret 5 on string 6 (or string 1 depending on alphatex direction)
    const t0b0 = findBeatOnTrack(session, "0", 0);
    const t1b0 = findBeatOnTrack(session, "1", 0);
    expect(t0b0).not.toBeNull();
    expect(t1b0).not.toBeNull();
    // They must be different beat objects
    expect(t0b0).not.toBe(t1b0);
  });

  it("set-fret on track[1] does not mutate track[0] (TAB-009 T4)", () => {
    // Read the original fret on track[0] beat[0] string[1]
    const t0b0Before = findBeatOnTrack(session, "0", 0);
    const t0NoteBefore = t0b0Before?.notes?.[0];
    const originalT0Fret = t0NoteBefore?.fret ?? null;
    const originalT0String = t0NoteBefore?.string ?? null;

    // Apply set-fret only to track[1]
    session.applyEdit({
      type: "set-fret",
      beat: 0,
      string: originalT0String ?? 1,
      fret: 99,
      trackId: "1",
    });

    // track[0] must be unchanged
    const t0FretAfter = getNoteFretOnTrack(session, "0", 0, originalT0String ?? 1);
    expect(t0FretAfter).toBe(originalT0Fret);
  });

  it("set-fret on track[1] mutates only track[1] beat (TAB-009 T4)", () => {
    // Find which string track[1] beat[0] has a note on
    const t1b0 = findBeatOnTrack(session, "1", 0);
    const t1String = t1b0?.notes?.[0]?.string ?? 1;

    session.applyEdit({
      type: "set-fret",
      beat: 0,
      string: t1String,
      fret: 77,
      trackId: "1",
    });

    expect(getNoteFretOnTrack(session, "1", 0, t1String)).toBe(77);
  });

  it("set-duration on track[1] does not affect track[0] duration (TAB-009 T4)", () => {
    const t0DurationBefore = getBeatDurationOnTrack(session, "0", 0);

    session.applyEdit({
      type: "set-duration",
      beat: 0,
      duration: 8, // Eighth
      trackId: "1",
    });

    // track[0] beat[0] duration unchanged
    expect(getBeatDurationOnTrack(session, "0", 0)).toBe(t0DurationBefore);
    // track[1] beat[0] duration changed
    expect(getBeatDurationOnTrack(session, "1", 0)).toBe(8);
  });

  it("add-technique on track[1] does not leak into track[0] (TAB-009 T4)", () => {
    // Get the string for track[1] beat[0]
    const t1b0 = findBeatOnTrack(session, "1", 0);
    const t1String = t1b0?.notes?.[0]?.string ?? 1;

    // Get the string for track[0] beat[0]
    const t0b0 = findBeatOnTrack(session, "0", 0);
    const t0String = t0b0?.notes?.[0]?.string ?? 1;

    session.applyEdit({
      type: "add-technique",
      beat: 0,
      string: t1String,
      technique: "ghost",
      trackId: "1",
    });

    // track[1] beat[0] has the technique
    expect(getNoteHasTechniqueOnTrack(session, "1", 0, t1String, "ghost")).toBe(true);

    // track[0] beat[0] must NOT have the technique (if same string number exists)
    if (t0String === t1String) {
      expect(getNoteHasTechniqueOnTrack(session, "0", 0, t0String, "ghost")).toBe(false);
    }
  });

  // Voice-isolation: use a hand-rolled ScoreShape (voice 1 alphatex syntax is unreliable)
  // Verify that a voiceIndex:1 edit targets voice 1, not voice 0.
  it("set-fret with voiceIndex:1 targets voice 1 beat, not voice 0 beat (TAB-009 T4)", () => {
    // Hand-build a score with two voices on track 0
    const voice0Beat = { duration: 4, notes: [] as Array<{ fret: number; string: number }>, addNote(n: { fret: number; string: number }) { this.notes.push(n); }, removeNote(n: { fret: number; string: number }) { const i = this.notes.indexOf(n); if (i >= 0) this.notes.splice(i, 1); } };
    const voice1Beat = { duration: 4, notes: [] as Array<{ fret: number; string: number }>, addNote(n: { fret: number; string: number }) { this.notes.push(n); }, removeNote(n: { fret: number; string: number }) { const i = this.notes.indexOf(n); if (i >= 0) this.notes.splice(i, 1); } };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handScore: any = {
      masterBars: [],
      tracks: [{
        index: 0,
        staves: [{ bars: [{
          voices: [
            { beats: [voice0Beat], addBeat() {} },
            { beats: [voice1Beat], addBeat() {} },
          ],
        }] }],
      }],
    };

    // Directly inject hand-built score onto session (bypass tex loading)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session as any).latestScore = handScore;

    session.applyEdit({
      type: "set-fret",
      beat: 0,
      string: 1,
      fret: 42,
      voiceIndex: 1,
    });

    // voice 1 beat got the note
    expect(voice1Beat.notes.find((n) => n.string === 1)?.fret).toBe(42);
    // voice 0 beat is untouched
    expect(voice0Beat.notes.find((n) => n.string === 1)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// scientificPitchToMidi unit tests (TAB-009 T5)
// ---------------------------------------------------------------------------
describe("scientificPitchToMidi", () => {
  it("converts standard 6-string tuning strings to expected MIDI values", () => {
    // Standard 6-string E-A-D-G-B-E (high → low): [64, 59, 55, 50, 45, 40]
    expect(scientificPitchToMidi("E4")).toBe(64);
    expect(scientificPitchToMidi("B3")).toBe(59);
    expect(scientificPitchToMidi("G3")).toBe(55);
    expect(scientificPitchToMidi("D3")).toBe(50);
    expect(scientificPitchToMidi("A2")).toBe(45);
    expect(scientificPitchToMidi("E2")).toBe(40);
  });

  it("converts standard 4-string bass tuning strings to expected MIDI values", () => {
    // Bass E-A-D-G (high → low): [43, 38, 33, 28]
    expect(scientificPitchToMidi("G2")).toBe(43);
    expect(scientificPitchToMidi("D2")).toBe(38);
    expect(scientificPitchToMidi("A1")).toBe(33);
    expect(scientificPitchToMidi("E1")).toBe(28);
  });

  it("handles sharp notation", () => {
    expect(scientificPitchToMidi("C#4")).toBe(61);
    expect(scientificPitchToMidi("F#3")).toBe(54);
    expect(scientificPitchToMidi("D#2")).toBe(39);
  });

  it("handles flat notation", () => {
    expect(scientificPitchToMidi("Db4")).toBe(61); // same as C#4
    expect(scientificPitchToMidi("Gb3")).toBe(54); // same as F#3
    expect(scientificPitchToMidi("Eb2")).toBe(39); // same as D#2
  });

  it("handles C-1 (MIDI 0) and A4 (MIDI 69)", () => {
    expect(scientificPitchToMidi("C-1")).toBe(0);
    expect(scientificPitchToMidi("A4")).toBe(69);
  });

  it("6-string round-trip: convert tuning array and compare to known MIDI values", () => {
    const tuningStrings = ["E4", "B3", "G3", "D3", "A2", "E2"];
    const midiValues = tuningStrings.map(scientificPitchToMidi);
    expect(midiValues).toEqual([64, 59, 55, 50, 45, 40]);
  });
});

// ---------------------------------------------------------------------------
// applyAddTrack tests (TAB-009 T5)
// Uses a 4-bar, 2-track fixture so bar-count assertions are meaningful.
// ---------------------------------------------------------------------------

// 2 tracks × 4 bars, each bar has 1 quarter beat
const MT_FIXTURE_4BAR = [
  `\\title "MultiTrack4Bar"`,
  `.`,
  `\\track "T0"`,
  `:4 5.6 | :4 0.6 | :4 3.6 | :4 7.6 |`,
  `\\track "T1"`,
  `:4 3.3 | :4 1.3 | :4 2.3 | :4 4.3 |`,
].join("\n");

async function buildMultiTrackScore4Bar() {
  const mod = await import("@coderline/alphatab");
  const importer = new mod.importer.AlphaTexImporter();
  const settings = new mod.Settings();
  importer.init(mod.io.ByteBuffer.empty(), settings);
  importer.initFromString(MT_FIXTURE_4BAR, settings);
  return importer.readScore();
}

describe("AlphaTabSession.applyEdit — applyAddTrack (TAB-009 T5)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any;

  beforeEach(async () => {
    const score = await buildMultiTrackScore4Bar();

    const engine = new AlphaTabEngine();
    const container = document.createElement("div");
    document.body.appendChild(container);

    session = await engine.mount(container, { readOnly: false });

    fakeApiInstance.texPayload = score;
    await session.load({ kind: "alphatex", text: MT_FIXTURE_4BAR });
  });

  it("add-track appends a new track with matching bar count", async () => {
    session.applyEdit({
      type: "add-track",
      name: "Drums",
      instrument: "guitar",
      tuning: ["E2", "A2", "D3", "G3", "B3", "E4"],
      capo: 0,
    });
    const score = session.latestScore;
    expect(score.tracks).toHaveLength(3);
    expect(score.tracks[2].name).toBe("Drums");
    expect(score.tracks[2].staves[0].bars).toHaveLength(4);
    for (const bar of score.tracks[2].staves[0].bars) {
      expect(bar.voices[0].beats).toHaveLength(1);
      expect(bar.voices[0].beats[0].notes).toHaveLength(0); // rest
    }
  });

  it("add-track preserves tuning (MIDI values) on the new track's staff", async () => {
    // Standard 6-string tuning: high → low E4-B3-G3-D3-A2-E2 = [64,59,55,50,45,40]
    session.applyEdit({
      type: "add-track",
      name: "Lead",
      instrument: "guitar",
      tuning: ["E4", "B3", "G3", "D3", "A2", "E2"],
      capo: 0,
    });
    const score = session.latestScore;
    const newTrack = score.tracks[2];
    const tunings = newTrack.staves[0].stringTuning.tunings;
    expect(tunings).toEqual([64, 59, 55, 50, 45, 40]);
  });

  it("add-track preserves capo on the new track's staff", async () => {
    session.applyEdit({
      type: "add-track",
      name: "Capo Lead",
      instrument: "guitar",
      tuning: ["E4", "B3", "G3", "D3", "A2", "E2"],
      capo: 3,
    });
    const score = session.latestScore;
    const newTrack = score.tracks[2];
    expect(newTrack.staves[0].capo).toBe(3);
  });

  it("add-track with bass instrument sets 4-string bass tuning correctly", async () => {
    // Bass standard tuning (high → low): G2-D2-A1-E1 = [43,38,33,28]
    session.applyEdit({
      type: "add-track",
      name: "Bass",
      instrument: "bass",
      tuning: ["G2", "D2", "A1", "E1"],
      capo: 0,
    });
    const score = session.latestScore;
    const bassTrack = score.tracks[2];
    expect(bassTrack.name).toBe("Bass");
    const tunings = bassTrack.staves[0].stringTuning.tunings;
    expect(tunings).toEqual([43, 38, 33, 28]);
  });

  it("add-track does not mutate existing tracks", async () => {
    const scoreBefore = session.latestScore;
    const track0BarCountBefore = scoreBefore.tracks[0].staves[0].bars.length;
    const track1BarCountBefore = scoreBefore.tracks[1].staves[0].bars.length;

    session.applyEdit({
      type: "add-track",
      name: "Extra",
      instrument: "guitar",
      tuning: ["E4", "B3", "G3", "D3", "A2", "E2"],
      capo: 0,
    });

    const scoreAfter = session.latestScore;
    expect(scoreAfter.tracks[0].staves[0].bars).toHaveLength(track0BarCountBefore);
    expect(scoreAfter.tracks[1].staves[0].bars).toHaveLength(track1BarCountBefore);
  });

  it("new track index is assigned correctly (findTrack returns it)", async () => {
    session.applyEdit({
      type: "add-track",
      name: "New",
      instrument: "guitar",
      tuning: ["E4", "B3", "G3", "D3", "A2", "E2"],
      capo: 0,
    });
    const score = session.latestScore;
    // After addTrack, score.addTrack sets track.index = tracks.length - 1 = 2
    const found = findTrack(score, "2");
    expect(found).not.toBeNull();
    expect(found?.name).toBe("New");
  });
});

// ---------------------------------------------------------------------------
// applyRemoveTrack tests (TAB-009 T6)
// Uses the same 4-bar, 2-track fixture from T5.
// ---------------------------------------------------------------------------

/** Build a session loaded with MT_FIXTURE_4BAR (2 tracks × 4 bars). */
async function mountWithMultiTrack() {
  const score = await buildMultiTrackScore4Bar();

  const engine = new AlphaTabEngine();
  const container = document.createElement("div");
  document.body.appendChild(container);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session: any = await engine.mount(container, { readOnly: false });

  fakeApiInstance.texPayload = score;
  await session.load({ kind: "alphatex", text: MT_FIXTURE_4BAR });
  return session;
}

describe("AlphaTabSession.applyEdit — applyRemoveTrack (TAB-009 T6)", () => {
  it("remove-track splices the target track (TAB-009-T6-01)", async () => {
    const session = await mountWithMultiTrack(); // 2 tracks: T0 at [0], T1 at [1]
    session.applyEdit({ type: "remove-track", trackId: "1" });
    expect(session.latestScore.tracks).toHaveLength(1);
    expect(session.latestScore.tracks[0].name).toBe("T0");
  });

  it("remove-track of last track throws (TAB-009-T6-02)", async () => {
    const session = await mountWithMultiTrack(); // 2 tracks
    session.applyEdit({ type: "remove-track", trackId: "1" });
    expect(() =>
      session.applyEdit({ type: "remove-track", trackId: "0" }),
    ).toThrow(/only track/i);
  });

  it("remove-track[0] slides remaining tracks down — new [0] was old [1] (TAB-009-T6-03)", async () => {
    const session = await mountWithMultiTrack();
    const oldT1Name = session.latestScore.tracks[1].name; // "T1"

    session.applyEdit({ type: "remove-track", trackId: "0" });

    const score = session.latestScore;
    expect(score.tracks).toHaveLength(1);
    expect(score.tracks[0].name).toBe(oldT1Name);
    // .index must be reset to 0
    expect(score.tracks[0].index).toBe(0);
  });

  it("findTrack('0') returns the slid-down track after remove of track[0] (TAB-009-T6-04)", async () => {
    const session = await mountWithMultiTrack();
    const oldT1Name = session.latestScore.tracks[1].name; // "T1"

    session.applyEdit({ type: "remove-track", trackId: "0" });

    const found = findTrack(session.latestScore, "0");
    expect(found).not.toBeNull();
    expect(found?.name).toBe(oldT1Name);
  });

  it("throws for unknown trackId (TAB-009-T6-05)", async () => {
    const session = await mountWithMultiTrack();
    expect(() =>
      session.applyEdit({ type: "remove-track", trackId: "99" }),
    ).toThrow(/Track 99 not found/i);
  });

  it("set-fret on surviving track still works after remove (TAB-009-T6-06)", async () => {
    const session = await mountWithMultiTrack();
    // Remove track[1]; track[0] remains at index 0
    session.applyEdit({ type: "remove-track", trackId: "1" });

    // Get the string that track[0] beat[0] has a note on
    const beat0 = findBeatOnTrack(session, "0", 0);
    const string0 = beat0?.notes?.[0]?.string ?? 6;

    session.applyEdit({ type: "set-fret", beat: 0, string: string0, fret: 11, trackId: "0" });
    expect(getNoteFretOnTrack(session, "0", 0, string0)).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// AlphaTabSession.setPlaybackState — mute/solo forwarding (TAB-009 T8)
// These tests exercise setPlaybackState, NOT applyEdit.  They live here
// because mountWithMultiTrack() is defined in this file.
// ---------------------------------------------------------------------------
describe("AlphaTabSession.setPlaybackState — mute/solo (TAB-009 T8)", () => {
  it("setPlaybackState forwards mute to alphaTab API (TAB-009-T8-01)", async () => {
    const session = await mountWithMultiTrack(); // 2 tracks: index 0 and 1
    vi.clearAllMocks();

    session.setPlaybackState({ mutedTrackIds: ["1"], soloedTrackIds: [] });

    // Reset call: all tracks muted=false
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 1 }),
      ]),
      false,
    );
    // Apply call: just track[1] muted=true
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledWith(
      [expect.objectContaining({ index: 1 })],
      true,
    );
  });

  it("setPlaybackState forwards solo to alphaTab API (TAB-009-T8-02)", async () => {
    const session = await mountWithMultiTrack();
    vi.clearAllMocks();

    session.setPlaybackState({ mutedTrackIds: [], soloedTrackIds: ["1"] });

    // Reset call: all tracks soloed=false
    expect(fakeApiInstance.changeTrackSolo).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 1 }),
      ]),
      false,
    );
    // Apply call: just track[1] soloed=true
    expect(fakeApiInstance.changeTrackSolo).toHaveBeenCalledWith(
      [expect.objectContaining({ index: 1 })],
      true,
    );
  });

  it("setPlaybackState handles mute and solo on same track (TAB-009-T8-03)", async () => {
    const session = await mountWithMultiTrack();
    vi.clearAllMocks();

    session.setPlaybackState({ mutedTrackIds: ["0"], soloedTrackIds: ["0"] });

    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledWith(
      [expect.objectContaining({ index: 0 })],
      true,
    );
    expect(fakeApiInstance.changeTrackSolo).toHaveBeenCalledWith(
      [expect.objectContaining({ index: 0 })],
      true,
    );
  });

  it("empty state fires only reset calls — no apply calls (TAB-009-T8-04)", async () => {
    const session = await mountWithMultiTrack();
    vi.clearAllMocks();

    session.setPlaybackState({ mutedTrackIds: [], soloedTrackIds: [] });

    // Only the reset calls (mute=false and solo=false on all tracks)
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledTimes(1);
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 1 }),
      ]),
      false,
    );
    expect(fakeApiInstance.changeTrackSolo).toHaveBeenCalledTimes(1);
    expect(fakeApiInstance.changeTrackSolo).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 1 }),
      ]),
      false,
    );
  });

  it("unknown trackId is filtered out (TAB-009-T8-05)", async () => {
    const session = await mountWithMultiTrack();
    vi.clearAllMocks();

    // "99" doesn't match any track — filter returns empty array, no apply call
    session.setPlaybackState({ mutedTrackIds: ["99"], soloedTrackIds: [] });

    // Only the reset call fires
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledTimes(1);
    expect(fakeApiInstance.changeTrackMute).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ index: 0 }),
        expect.objectContaining({ index: 1 }),
      ]),
      false,
    );
    // No apply call with true
    expect(fakeApiInstance.changeTrackMute).not.toHaveBeenCalledWith(
      expect.anything(),
      true,
    );
  });
});
