import { describe, it, expect, vi, beforeEach } from "vitest";

const printMock = vi.fn();
const exportAudioMock = vi.fn();
const generateMock = vi.fn();
const toBinaryMock = vi.fn(() => new Uint8Array([0x4d, 0x54, 0x68, 0x64])); // "MThd"

class FakeMidiFile {
  format: number = 1;
  toBinary = toBinaryMock;
}
class FakeMidiHandler {
  constructor(public midiFile: FakeMidiFile, public smf1Mode: boolean) {}
}
class FakeMidiGenerator {
  constructor(public score: unknown, public settings: unknown, public handler: unknown) {}
  generate = generateMock;
}

class FakeEvent<T> {
  private handlers: ((payload: T) => void)[] = [];
  on(handler: (payload: T) => void) { this.handlers.push(handler); }
}

class FakeApi {
  scoreLoaded = new FakeEvent<unknown>();
  error = new FakeEvent<Error>();
  playerReady = new FakeEvent<void>();
  playerStateChanged = new FakeEvent<{ state: number; stopped: boolean }>();
  playerPositionChanged = new FakeEvent<{ currentTick: number; endTick: number; currentTime: number; endTime: number }>();
  settings = { player: { enablePlayer: false, soundFont: "" }, core: { engine: "default", logLevel: 0 } };
  score: unknown = { tracks: [{ index: 0 }, { index: 1 }] };
  tickPosition = 0;
  playbackSpeed = 1;
  playbackRange: { startTick: number; endTick: number } | null = null;
  isLooping = false;
  destroy = vi.fn();
  tex = vi.fn();
  renderTracks = vi.fn();
  renderScore = vi.fn();
  print = printMock;
  exportAudio = exportAudioMock;
  changeTrackMute = vi.fn();
  changeTrackSolo = vi.fn();
  changeTrackVolume = vi.fn();
  play() { return true; }
  pause() {}
  stop() {}
}

vi.mock("@coderline/alphatab", () => ({
  AlphaTabApi: FakeApi,
  Settings: class {
    player = { enablePlayer: false, soundFont: "" };
    core = { engine: "default", logLevel: 0 };
  },
  midi: {
    MidiFile: FakeMidiFile,
    MidiFileFormat: { SingleTrackMultiChannel: 0, MultiTrack: 1 },
    MidiFileGenerator: FakeMidiGenerator,
    AlphaSynthMidiFileHandler: FakeMidiHandler,
  },
  model: {
    Note: class {},
    BendPoint: class { constructor(public offset = 0, public value = 0) {} },
    BendType: { None: 0, Bend: 1 },
    SlideOutType: { None: 0, Shift: 1 },
    VibratoType: { None: 0, Slight: 1 },
    HarmonicType: { None: 0, Natural: 1 },
    Duration: { Eighth: 8, Quarter: 4 },
    MasterBar: class {},
    Section: class {},
    Bar: class {},
    Voice: class {},
    Beat: class {},
    Automation: class {},
    AutomationType: { Tempo: 0 },
    Track: class {},
    Staff: class {},
    Tuning: class {
      constructor(public name = "", public tunings: number[] | null = null, public isStandard = false) {}
    },
  },
}));

import { AlphaTabEngine } from "./alphaTabEngine";
import { TabMidiFileFormat } from "../domain/tabEngine";

describe("TabSession.exportMidi", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    printMock.mockReset();
    exportAudioMock.mockReset();
    generateMock.mockReset();
    toBinaryMock.mockReset();
    toBinaryMock.mockReturnValue(new Uint8Array([0x4d, 0x54, 0x68, 0x64]));
  });

  it("returns the Uint8Array produced by MidiFile.toBinary()", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });
    const bytes = session.exportMidi();
    expect(generateMock).toHaveBeenCalledOnce();
    expect(toBinaryMock).toHaveBeenCalledOnce();
    expect(Array.from(bytes)).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("defaults to MultiTrack (SMF Type 1) format", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });
    session.exportMidi();
    session.exportMidi(TabMidiFileFormat.SingleTrackMultiChannel);
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  it("throws if score is null", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });
    (session as unknown as { api: { score: unknown } }).api.score = null;
    expect(() => session.exportMidi()).toThrow(/score/i);
  });
});

class FakeAudioExporter {
  static chunks: { samples: Float32Array; currentTime: number; endTime: number }[] = [];
  static destroyMock = vi.fn();
  private idx = 0;
  async render(_ms: number) {
    if (this.idx >= FakeAudioExporter.chunks.length) return undefined;
    return FakeAudioExporter.chunks[this.idx++];
  }
  destroy = FakeAudioExporter.destroyMock;
}

describe("TabSession.exportAudio", () => {
  let container: HTMLElement;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    exportAudioMock.mockReset();
    FakeAudioExporter.destroyMock.mockReset();
    FakeAudioExporter.chunks = [];
  });

  it("loops render() until undefined and concatenates samples into a WAV buffer", async () => {
    FakeAudioExporter.chunks = [
      { samples: new Float32Array([0.1, 0.2]), currentTime: 500, endTime: 1500 },
      { samples: new Float32Array([0.3, 0.4]), currentTime: 1000, endTime: 1500 },
      { samples: new Float32Array([0.5, 0.6]), currentTime: 1500, endTime: 1500 },
    ];
    exportAudioMock.mockResolvedValueOnce(new FakeAudioExporter());

    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });
    const bytes = await session.exportAudio({ sampleRate: 44100 });

    // RIFF header + 6 samples × 2 bytes
    expect(bytes.length).toBe(44 + 12);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
    expect(FakeAudioExporter.destroyMock).toHaveBeenCalledOnce();
  });

  it("invokes onProgress with each chunk's currentTime/endTime", async () => {
    FakeAudioExporter.chunks = [
      { samples: new Float32Array([0]), currentTime: 100, endTime: 300 },
      { samples: new Float32Array([0]), currentTime: 200, endTime: 300 },
      { samples: new Float32Array([0]), currentTime: 300, endTime: 300 },
    ];
    exportAudioMock.mockResolvedValueOnce(new FakeAudioExporter());

    const onProgress = vi.fn();
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });
    await session.exportAudio({ onProgress });

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenNthCalledWith(1, { currentTime: 100, endTime: 300 });
    expect(onProgress).toHaveBeenNthCalledWith(3, { currentTime: 300, endTime: 300 });
  });

  it("aborts on signal: destroys exporter and throws AbortError", async () => {
    FakeAudioExporter.chunks = [
      { samples: new Float32Array([0]), currentTime: 100, endTime: 9999 },
      { samples: new Float32Array([0]), currentTime: 200, endTime: 9999 },
      { samples: new Float32Array([0]), currentTime: 300, endTime: 9999 },
    ];
    exportAudioMock.mockResolvedValueOnce(new FakeAudioExporter());

    const controller = new AbortController();
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, { readOnly: false });

    // Abort after the second chunk
    let chunkCount = 0;
    const onProgress = () => {
      chunkCount++;
      if (chunkCount === 2) controller.abort();
    };
    await expect(session.exportAudio({ signal: controller.signal, onProgress })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(FakeAudioExporter.destroyMock).toHaveBeenCalledOnce();
  });
});
