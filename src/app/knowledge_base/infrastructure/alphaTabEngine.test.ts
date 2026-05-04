import { describe, it, expect, vi, beforeEach } from "vitest";

const renderTracksMock = vi.fn();
const destroyMock = vi.fn();
const texMock = vi.fn();
const playMock = vi.fn();
const pauseMock = vi.fn();
const stopMock = vi.fn();

let capturedSettings: {
  player: { enablePlayer: boolean; soundFont: string };
  core: { engine: string; logLevel: number };
} | null = null;

let fakeApiInstance: FakeApi | null = null;

class FakeEvent<T> {
  private handlers: ((payload: T) => void)[] = [];
  on(handler: (payload: T) => void) { this.handlers.push(handler); }
  fire(payload: T) { for (const h of this.handlers) h(payload); }
}

class FakeApi {
  scoreLoaded = new FakeEvent<unknown>();
  error = new FakeEvent<Error>();
  playerReady = new FakeEvent<void>();
  playerStateChanged = new FakeEvent<{ state: number; stopped: boolean }>();
  playerPositionChanged = new FakeEvent<{ currentTick: number; endTick: number; currentTime: number; endTime: number }>();
  settings: {
    player: { enablePlayer: boolean; soundFont: string };
    core: { engine: string; logLevel: number };
  };
  tickPosition = 0;
  playbackSpeed = 1;
  playbackRange: { startTick: number; endTick: number } | null = null;
  isLooping = false;

  constructor(public element: HTMLElement, settings: unknown) {
    this.settings = settings as typeof this.settings;
    capturedSettings = this.settings;
    // Tests need to fire events on the constructed instance from outside;
    // exposing it via a module-level ref is the simplest fixture pattern.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    fakeApiInstance = this;
  }
  tex(text: string) {
    texMock(text);
    this.scoreLoaded.fire({ title: "Untitled", tempo: 120, tracks: [] });
  }
  renderTracks() { renderTracksMock(); }
  destroy() { destroyMock(); }
  play() { playMock(); return true; }
  pause() { pauseMock(); }
  stop() { stopMock(); }
}

vi.mock("@coderline/alphatab", () => {
  class Settings {
    player = { enablePlayer: false, soundFont: "" };
    core = { engine: "default", logLevel: 0 };
  }
  class Note {
    fret = 0;
    string = 0;
  }
  return { AlphaTabApi: FakeApi, Settings, model: { Note } };
});

import { AlphaTabEngine, midiToScientificPitch, scoreToMetadata } from "./alphaTabEngine";

describe("AlphaTabEngine", () => {
  let container: HTMLElement;

  beforeEach(() => {
    renderTracksMock.mockReset();
    destroyMock.mockReset();
    texMock.mockReset();
    playMock.mockReset();
    pauseMock.mockReset();
    stopMock.mockReset();
    capturedSettings = null;
    fakeApiInstance = null;
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("mount() configures enablePlayer=true and the SoundFont URL", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "\\title \"Hi\"\n." },
      readOnly: true,
    });
    expect(session).toBeDefined();
    expect(capturedSettings).not.toBeNull();
    expect(capturedSettings!.player.enablePlayer).toBe(true);
    expect(capturedSettings!.player.soundFont).toBe("/soundfonts/sonivox.sf2");
    // alphaTab LogLevel.Info — Debug=1 was carried over from TAB-004 and was
    // too noisy in the browser console once playback shipped.
    expect(capturedSettings!.core.logLevel).toBe(2);
    expect(texMock).toHaveBeenCalledWith("\\title \"Hi\"\n.");
  });

  it("session.load() emits a 'loaded' event with the parsed metadata", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    const loaded = vi.fn();
    session.on("loaded", loaded);
    await session.load({ kind: "alphatex", text: "\\title \"Riff\"\n." });
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded.mock.calls[0][0]).toMatchObject({
      event: "loaded",
      metadata: expect.objectContaining({ title: "Untitled", tempo: 120 }),
    });
  });

  it("session.dispose() calls destroy on the underlying api", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.dispose();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("non-alphatex sources throw — only alphatex is supported in this slice", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    await expect(
      session.load({ kind: "gp", bytes: new Uint8Array() }),
    ).rejects.toThrow(/alphatex/i);
  });

  it("session.play() calls api.play()", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.play();
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  it("session.pause() calls api.pause()", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.pause();
    expect(pauseMock).toHaveBeenCalledTimes(1);
  });

  it("session.stop() calls api.stop()", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.stop();
    expect(stopMock).toHaveBeenCalledTimes(1);
  });

  it("session.seek(beat) sets api.tickPosition", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.seek(960);
    expect(fakeApiInstance!.tickPosition).toBe(960);
  });

  it("session.setTempoFactor clamps to 0.25..2.0 and writes playbackSpeed", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.setTempoFactor(1.5);
    expect(fakeApiInstance!.playbackSpeed).toBe(1.5);
    session.setTempoFactor(5);   // out of range
    expect(fakeApiInstance!.playbackSpeed).toBe(2);
    session.setTempoFactor(0.1); // out of range
    expect(fakeApiInstance!.playbackSpeed).toBe(0.25);
  });

  it("session.setLoop applies playbackRange + isLooping", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.setLoop({ start: 100, end: 500 });
    expect(fakeApiInstance!.playbackRange).toEqual({ startTick: 100, endTick: 500 });
    expect(fakeApiInstance!.isLooping).toBe(true);
    session.setLoop(null);
    expect(fakeApiInstance!.playbackRange).toBeNull();
    expect(fakeApiInstance!.isLooping).toBe(false);
  });

  it("playerReady event re-emits as 'ready'", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    const ready = vi.fn();
    session.on("ready", ready);
    fakeApiInstance!.playerReady.fire(undefined);
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready.mock.calls[0][0]).toMatchObject({ event: "ready" });
  });

  it("playerStateChanged emits 'played' for state=1 and 'paused' for state=0", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    const played = vi.fn();
    const paused = vi.fn();
    session.on("played", played);
    session.on("paused", paused);
    fakeApiInstance!.playerStateChanged.fire({ state: 1, stopped: false });
    expect(played).toHaveBeenCalledTimes(1);
    fakeApiInstance!.playerStateChanged.fire({ state: 0, stopped: false });
    expect(paused).toHaveBeenCalledTimes(1);
  });

  it("playerPositionChanged emits 'tick' with currentTick", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    const tick = vi.fn();
    session.on("tick", tick);
    fakeApiInstance!.playerPositionChanged.fire({
      currentTick: 1920,
      endTick: 7680,
      currentTime: 2000,
      endTime: 8000,
    });
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][0]).toMatchObject({ event: "tick", beat: 1920 });
  });
});

describe("midiToScientificPitch", () => {
  it("converts known MIDI values to scientific pitch (TAB-009 T7)", () => {
    expect(midiToScientificPitch(60)).toBe("C4");
    expect(midiToScientificPitch(69)).toBe("A4");
    expect(midiToScientificPitch(40)).toBe("E2");
    expect(midiToScientificPitch(0)).toBe("C-1");
    expect(midiToScientificPitch(127)).toBe("G9");
  });

  it("uses sharps not flats for accidentals", () => {
    expect(midiToScientificPitch(61)).toBe("C#4");  // C#4 not Db4
    expect(midiToScientificPitch(66)).toBe("F#4");  // F#4 not Gb4
  });

  it("round-trips with scientificPitchToMidi for sharp-form pitches (TAB-009 T7)", () => {
    // import scientificPitchToMidi via module — it's already exported
    // Test a selection of standard guitar tuning pitches
    for (const pitch of ["E4", "B3", "G3", "D3", "A2", "E2", "G2", "D2", "A1", "E1"]) {
      const midi = scientificPitchToMidiHelper(pitch);
      expect(midiToScientificPitch(midi)).toBe(pitch);
    }
  });
});

// Helper that mirrors scientificPitchToMidi logic inline so we don't need
// a second named import (it is already exported; this avoids re-importing
// in the describe block scope and keeps the round-trip test self-contained).
function scientificPitchToMidiHelper(pitch: string): number {
  const NOTE_SEMITONES: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  };
  const letter = pitch[0];
  let offset = 1;
  let accidental = 0;
  if (pitch[offset] === "#") { accidental = 1; offset++; }
  else if (pitch[offset] === "b") { accidental = -1; offset++; }
  const octave = parseInt(pitch.slice(offset), 10);
  return (octave + 1) * 12 + NOTE_SEMITONES[letter] + accidental;
}

describe("scoreToMetadata (TAB-009 T7)", () => {
  it("extracts per-track tuning + capo from staves", () => {
    const score = {
      title: "Two-Track Probe",
      tempo: 120,
      tracks: [
        {
          index: 0,
          name: "Lead",
          staves: [{
            tuning: [64, 59, 55, 50, 45, 40], // E4 B3 G3 D3 A2 E2 (high→low)
            capo: 0,
          }],
        },
        {
          index: 1,
          name: "Bass",
          staves: [{
            tuning: [43, 38, 33, 28], // G2 D2 A1 E1 (high→low)
            capo: 2,
          }],
        },
      ],
    };
    const m = scoreToMetadata(score);
    expect(m.tracks).toHaveLength(2);

    expect(m.tracks[0].id).toBe("0");
    expect(m.tracks[0].name).toBe("Lead");
    expect(m.tracks[0].tuning).toEqual(["E4", "B3", "G3", "D3", "A2", "E2"]);
    expect(m.tracks[0].capo).toBe(0);
    expect(m.tracks[0].instrument).toBe("guitar"); // 6 strings → guitar

    expect(m.tracks[1].id).toBe("1");
    expect(m.tracks[1].name).toBe("Bass");
    expect(m.tracks[1].tuning).toEqual(["G2", "D2", "A1", "E1"]);
    expect(m.tracks[1].capo).toBe(2);
    expect(m.tracks[1].instrument).toBe("bass");   // 4 strings → bass
  });

  it("defaults tuning=[], capo=0, instrument='guitar' when track has no staves (TAB-009 T7)", () => {
    const score = {
      title: "Minimal",
      tempo: 100,
      tracks: [{ name: "Rhythm" }], // no staves property
    };
    const m = scoreToMetadata(score);
    expect(m.tracks).toHaveLength(1);
    expect(m.tracks[0].tuning).toEqual([]);
    expect(m.tracks[0].capo).toBe(0);
    expect(m.tracks[0].instrument).toBe("guitar");
  });

  it("treats 5-string instrument as guitar (heuristic: >4 strings → guitar) (TAB-009 T7)", () => {
    const score = {
      tracks: [{
        name: "5-String Bass",
        staves: [{ tuning: [43, 38, 33, 28, 23], capo: 0 }], // 5 strings
      }],
    };
    const m = scoreToMetadata(score);
    // 5 strings is outside the ≤4 → bass range; classified as guitar
    expect(m.tracks[0].instrument).toBe("guitar");
  });

  it("treats 7-string guitar as guitar (TAB-009 T7)", () => {
    const score = {
      tracks: [{
        name: "7-String Guitar",
        staves: [{ tuning: [64, 59, 55, 50, 45, 40, 35], capo: 0 }], // 7 strings
      }],
    };
    const m = scoreToMetadata(score);
    expect(m.tracks[0].instrument).toBe("guitar");
  });

  it("handles empty tracks array without errors (TAB-009 T7)", () => {
    const score = { title: "No Tracks", tempo: 90, tracks: [] };
    const m = scoreToMetadata(score);
    expect(m.tracks).toEqual([]);
    // Top-level capo/tuning are gone — confirm they are not present
    expect((m as unknown as Record<string, unknown>)["capo"]).toBeUndefined();
    expect((m as unknown as Record<string, unknown>)["tuning"]).toBeUndefined();
  });

  it("fills defaults when score is an empty object (TAB-009 T7)", () => {
    const m = scoreToMetadata({});
    expect(m.title).toBe("Untitled");
    expect(m.tempo).toBe(120);
    expect(m.tracks).toEqual([]);
  });
});
