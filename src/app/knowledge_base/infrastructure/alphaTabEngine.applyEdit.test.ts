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
    texPayload: unknown = null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    constructor(_el: HTMLElement, _settings: unknown) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeApiInstance = this as any;
    }
  }

  return { ...real, AlphaTabApi: FakeApiCtor };
});

import { AlphaTabEngine } from "./alphaTabEngine";

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
      session.applyEdit({ type: "set-tempo" as any, beat: 0, bpm: 120 }),
    ).toThrow(/Unsupported op/i);
  });

  it("emits exactly one 'loaded' event per applyEdit call", () => {
    const loadedEvents: unknown[] = [];
    session.on("loaded", (e: unknown) => loadedEvents.push(e));
    // Clear any events captured during beforeEach setup
    loadedEvents.length = 0;
    session.applyEdit({ type: "set-fret", beat: 0, string: 6, fret: 12 });
    expect(loadedEvents).toHaveLength(1);
  });
});
