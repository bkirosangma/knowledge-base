# TAB-010 Guitar Tabs Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Export — MIDI / WAV / PDF — for the Guitar Tabs editor, closing the M2 ship-point.

**Architecture:** Pure WAV encoder utility in `domain/`; three new export methods on `TabSession` in `infrastructure/alphaTabEngine.ts` (synchronous MIDI via `MidiFileGenerator.toBinary()`, chunked-streaming WAV via `api.exportAudio()`, popup-print PDF via `api.print()`). A `useTabExport` hook in `features/tab/hooks/` owns the FSA `showSaveFilePicker` flow and renders an inline progress UI in a new `ExportSection` Properties sub-component. Palette commands in `KnowledgeBaseInner` invoke the active pane's exports through a `TabExportHandle` ref filled by `TabView` (mirrors the `leftDocBridgeRef` pattern). Mobile (`paneReadOnly`) hides all surfaces.

**Tech Stack:** TypeScript, React, Vitest + RTL, alphaTab `@coderline/alphatab` v1.6.x, FSA `showSaveFilePicker`. Spec: `docs/superpowers/specs/2026-05-04-guitar-tabs-export-design.md`. T0 probe: `docs/superpowers/plans/2026-05-04-guitar-tabs-export-verification.md`.

---

## File map (locked at plan-write time)

| Path | Purpose | New / Edit |
|---|---|---|
| `src/app/knowledge_base/domain/wavEncoder.ts` | Pure Float32 → 16-bit PCM WAV encoder | New |
| `src/app/knowledge_base/domain/wavEncoder.test.ts` | Header bytes, sample conversion, edge cases | New |
| `src/app/knowledge_base/domain/tabEngine.ts` | Add `exportMidi/exportAudio/exportPdf` to `TabSession` interface; add `ExportAudioOptions` + `MidiFileFormat` re-export | Edit |
| `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` | Implement the three methods on the session class | Edit |
| `src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts` | Engine-level export plumbing tests | New |
| `src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.ts` | Pure helper for filename derivation | New |
| `src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.test.ts` | Helper tests | New |
| `src/app/knowledge_base/features/tab/hooks/useTabExport.ts` | Hook wiring engine ↔ FSA ↔ ShellErrorContext | New |
| `src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx` | Hook unit tests | New |
| `src/app/knowledge_base/features/tab/properties/ExportSection.tsx` | Three Export buttons + WAV progress row | New |
| `src/app/knowledge_base/features/tab/properties/ExportSection.test.tsx` | Visibility, click, progress, cancel tests | New |
| `src/app/knowledge_base/features/tab/properties/TabProperties.tsx` | Mount `<ExportSection>` after the existing sub-sections | Edit |
| `src/app/knowledge_base/features/tab/TabView.tsx` | Call `useTabExport`; populate `onTabExportReady` callback; pass props to `<TabProperties>` → `<ExportSection>` | Edit |
| `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx` | Extend `TabPaneContext` with `onTabExportReady?: (handle) => void`; thread through `buildTabPaneContext` | Edit |
| `src/app/knowledge_base/knowledgeBase.tsx` | Declare per-side `tabExportRef`; build palette commands via `buildExportTabCommands`; register | Edit |
| `src/app/knowledge_base/knowledgeBase.exportTab.test.tsx` | Test `buildExportTabCommands` mobile gating | New |
| `Features.md` | Add §11.x Export sub-section | Edit |
| `test-cases/11-tabs.md` | Add §11.11 Export cases (T11.11-01 .. -08) | Edit |

`public/font/Bravura.*` files only land if T16 verification finds glyphs missing in dev print popup.

---

## Task 1: Pure WAV encoder

**Files:**
- Create: `src/app/knowledge_base/domain/wavEncoder.ts`
- Test: `src/app/knowledge_base/domain/wavEncoder.test.ts`

- [ ] **Step 1.1: Write the failing tests**

```ts
// src/app/knowledge_base/domain/wavEncoder.test.ts
import { describe, it, expect } from "vitest";
import { encodeWav } from "./wavEncoder";

function readUint32LE(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8) | (bytes[off + 2]! << 16) | (bytes[off + 3]! << 24)) >>> 0;
}
function readUint16LE(bytes: Uint8Array, off: number): number {
  return (bytes[off]! | (bytes[off + 1]! << 8)) & 0xffff;
}
function readInt16LE(bytes: Uint8Array, off: number): number {
  const u = readUint16LE(bytes, off);
  return u >= 0x8000 ? u - 0x10000 : u;
}

describe("encodeWav", () => {
  it("writes a valid RIFF/WAVE/fmt /data header for an empty payload", () => {
    const out = encodeWav([], 44100, 2);
    expect(out.length).toBe(44);
    expect(String.fromCharCode(...out.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...out.slice(8, 12))).toBe("WAVE");
    expect(String.fromCharCode(...out.slice(12, 16))).toBe("fmt ");
    expect(String.fromCharCode(...out.slice(36, 40))).toBe("data");
    expect(readUint32LE(out, 16)).toBe(16);          // fmt subchunk size
    expect(readUint16LE(out, 20)).toBe(1);           // PCM format
    expect(readUint16LE(out, 22)).toBe(2);           // channels
    expect(readUint32LE(out, 24)).toBe(44100);       // sample rate
    expect(readUint32LE(out, 28)).toBe(44100 * 2 * 2); // byte rate
    expect(readUint16LE(out, 32)).toBe(4);           // block align
    expect(readUint16LE(out, 34)).toBe(16);          // bits per sample
    expect(readUint32LE(out, 40)).toBe(0);           // data subchunk size = 0
    expect(readUint32LE(out, 4)).toBe(36);           // RIFF size = 36 + data size
  });

  it("converts Float32 samples to 16-bit PCM with full-scale boundaries", () => {
    const out = encodeWav([new Float32Array([0, 1, -1, 0.5, -0.5])], 44100, 1);
    expect(readUint32LE(out, 40)).toBe(5 * 2);        // 5 samples × 2 bytes
    expect(readInt16LE(out, 44)).toBe(0);
    expect(readInt16LE(out, 46)).toBe(0x7fff);        // +1.0 → 0x7fff
    expect(readInt16LE(out, 48)).toBe(-0x7fff);       // −1.0 → −0x7fff (clamped)
    expect(readInt16LE(out, 50)).toBe(Math.round(0.5 * 0x7fff));
    expect(readInt16LE(out, 52)).toBe(Math.round(-0.5 * 0x7fff));
  });

  it("clamps Float32 outside [-1, 1]", () => {
    const out = encodeWav([new Float32Array([1.5, -1.5, 2, -2])], 44100, 1);
    expect(readInt16LE(out, 44)).toBe(0x7fff);
    expect(readInt16LE(out, 46)).toBe(-0x7fff);
    expect(readInt16LE(out, 48)).toBe(0x7fff);
    expect(readInt16LE(out, 50)).toBe(-0x7fff);
  });

  it("concatenates multiple chunks in order", () => {
    const a = new Float32Array([0.25, 0.5]);
    const b = new Float32Array([-0.25]);
    const out = encodeWav([a, b], 22050, 1);
    expect(readUint32LE(out, 40)).toBe(3 * 2);
    expect(readInt16LE(out, 44)).toBe(Math.round(0.25 * 0x7fff));
    expect(readInt16LE(out, 46)).toBe(Math.round(0.5 * 0x7fff));
    expect(readInt16LE(out, 48)).toBe(Math.round(-0.25 * 0x7fff));
  });

  it("respects the supplied sample rate and channel count", () => {
    const out = encodeWav([new Float32Array(0)], 48000, 1);
    expect(readUint32LE(out, 24)).toBe(48000);
    expect(readUint16LE(out, 22)).toBe(1);
    expect(readUint32LE(out, 28)).toBe(48000 * 1 * 2); // byte rate
    expect(readUint16LE(out, 32)).toBe(2);             // block align (1 ch × 2 bytes)
  });

  it("writes monotonically increasing data subchunk size", () => {
    const out = encodeWav([new Float32Array(100)], 44100, 2);
    // 100 samples (interleaved), 2 bytes each → 200 bytes
    expect(readUint32LE(out, 40)).toBe(200);
    expect(readUint32LE(out, 4)).toBe(36 + 200);
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/domain/wavEncoder.test.ts`
Expected: FAIL with "Cannot find module './wavEncoder'".

- [ ] **Step 1.3: Implement `wavEncoder.ts`**

```ts
// src/app/knowledge_base/domain/wavEncoder.ts
const RIFF_HEADER_SIZE = 44;

function writeAscii(view: DataView, off: number, ascii: string): void {
  for (let i = 0; i < ascii.length; i++) view.setUint8(off + i, ascii.charCodeAt(i));
}

export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
  channels: number,
): Uint8Array {
  let totalSamples = 0;
  for (const c of chunks) totalSamples += c.length;
  const dataSize = totalSamples * 2; // 16-bit PCM = 2 bytes/sample
  const out = new Uint8Array(RIFF_HEADER_SIZE + dataSize);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, /* littleEndian */ true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);                                 // fmt subchunk size
  view.setUint16(20, 1, true);                                  // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);          // byte rate
  view.setUint16(32, channels * 2, true);                       // block align
  view.setUint16(34, 16, true);                                 // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let off = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]!));
      // Symmetric: clamp -1.0 to -0x7fff (not -0x8000) so endpoints round-trip cleanly
      const int16 = Math.round(s * 0x7fff);
      view.setInt16(off, int16, true);
      off += 2;
    }
  }
  return out;
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx vitest run src/app/knowledge_base/domain/wavEncoder.test.ts`
Expected: 6 passed.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/knowledge_base/domain/wavEncoder.ts src/app/knowledge_base/domain/wavEncoder.test.ts
git commit -m "feat(tabs): TAB-010 T1 — wavEncoder pure utility (Float32 → 16-bit PCM WAV)"
```

---

## Task 2: TabSession.exportMidi

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts` (interface)
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` (impl)
- Test: `src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts` (new)

- [ ] **Step 2.1: Extend the `TabSession` interface**

Add to `src/app/knowledge_base/domain/tabEngine.ts` immediately before the closing `}` of `interface TabSession`:

```ts
  /** Synchronous MIDI export. Default format = SMF Type 1 (multi-track). */
  exportMidi(format?: TabMidiFileFormat): Uint8Array;
```

And after the `TabSession` interface:

```ts
/** Mirrors alphaTab's MidiFileFormat enum. */
export enum TabMidiFileFormat {
  SingleTrackMultiChannel = 0,
  MultiTrack = 1,
}
```

- [ ] **Step 2.2: Write the failing engine test**

Create `src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`:

```ts
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

class FakeApi {
  scoreLoaded = { on: vi.fn() };
  error = { on: vi.fn() };
  playerReady = { on: vi.fn() };
  playerStateChanged = { on: vi.fn() };
  playerPositionChanged = { on: vi.fn() };
  settings = { player: { enablePlayer: false, soundFont: "" }, core: { engine: "default", logLevel: 0 } };
  score: unknown = { tracks: [{ index: 0 }, { index: 1 }] };
  destroy = vi.fn();
  tex = vi.fn();
  print = printMock;
  exportAudio = exportAudioMock;
  changeTrackMute = vi.fn();
  changeTrackSolo = vi.fn();
  changeTrackVolume = vi.fn();
}

vi.mock("@coderline/alphatab", () => ({
  AlphaTabApi: FakeApi,
  Settings: class { player = { enablePlayer: false, soundFont: "" }; core = { engine: "default", logLevel: 0 }; },
  midi: {
    MidiFile: FakeMidiFile,
    MidiFileFormat: { SingleTrackMultiChannel: 0, MultiTrack: 1 },
    MidiFileGenerator: FakeMidiGenerator,
    AlphaSynthMidiFileHandler: FakeMidiHandler,
  },
  model: { Note: class {} },
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
    const session = await engine.mount(container, {});
    const bytes = session.exportMidi();
    expect(generateMock).toHaveBeenCalledOnce();
    expect(toBinaryMock).toHaveBeenCalledOnce();
    expect(Array.from(bytes)).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("defaults to MultiTrack (SMF Type 1) format", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    session.exportMidi();
    // The MidiFile instance constructed in exportMidi should have its `format`
    // set to MultiTrack before generate(); we can't read it back through the
    // mock cleanly, but we can assert that explicit-format calls flow through.
    session.exportMidi(TabMidiFileFormat.SingleTrackMultiChannel);
    expect(generateMock).toHaveBeenCalledTimes(2);
  });

  it("throws if score is null", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    // Force score to null on the captured api instance for this scenario.
    // (Cast through unknown; the test mock exposes `score` as a writable field.)
    (session as unknown as { _api: { score: unknown } })._api.score = null;
    expect(() => session.exportMidi()).toThrow(/score/i);
  });
});
```

> **Note on test introspection:** the engine implementation should expose its underlying api via a private-but-test-accessible property (e.g., assigning `this._api = api` in the session ctor for tests, or an exported `__getApiForTest`). Pick whichever pattern the existing engine tests use; if none, add a tiny test-only accessor.

- [ ] **Step 2.3: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: FAIL with `session.exportMidi is not a function`.

- [ ] **Step 2.4: Implement `exportMidi`**

In `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`, locate the session class (or factory). Add:

```ts
import * as alphaTab from "@coderline/alphatab";
import type { TabMidiFileFormat } from "../domain/tabEngine";

// Inside the session class/factory:
exportMidi(format?: TabMidiFileFormat): Uint8Array {
  const api = this._api;
  const score = api.score;
  if (!score) throw new Error("Cannot export MIDI: no score loaded");
  const midiFile = new alphaTab.midi.MidiFile();
  midiFile.format = format ?? alphaTab.midi.MidiFileFormat.MultiTrack;
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile, /* smf1Mode */ true);
  const generator = new alphaTab.midi.MidiFileGenerator(score, api.settings, handler);
  generator.generate();
  return midiFile.toBinary();
}
```

If `alphaTab.midi` is not directly accessible at the namespace shape above, fall back to a typed import path that the existing engine code uses (the import line at top of file). The contract — `MidiFile`, `MidiFileFormat`, `MidiFileGenerator`, `AlphaSynthMidiFileHandler`, `toBinary()` — is the load-bearing surface.

- [ ] **Step 2.5: Run tests to verify they pass**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 3 passed.

- [ ] **Step 2.6: Commit**

```bash
git add src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts
git commit -m "feat(tabs): TAB-010 T2 — TabSession.exportMidi via MidiFileGenerator.toBinary"
```

---

## Task 3: TabSession.exportAudio (chunked WAV render)

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts` (add method + options interface)
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` (impl)
- Test: extend `alphaTabEngine.export.test.ts`

- [ ] **Step 3.1: Extend the interface**

Append to `tabEngine.ts`:

```ts
export interface ExportAudioOptions {
  onProgress?: (progress: { currentTime: number; endTime: number }) => void;
  signal?: AbortSignal;
  /** Output sample rate (default 44100). */
  sampleRate?: number;
}
```

And inside `interface TabSession`:

```ts
  /** Asynchronous WAV export. Loops chunked render → encodes → returns bytes. */
  exportAudio(opts?: ExportAudioOptions): Promise<Uint8Array>;
```

- [ ] **Step 3.2: Append failing tests**

Add to `alphaTabEngine.export.test.ts` after the existing `describe`:

```ts
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
    const session = await engine.mount(container, {});
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
    const session = await engine.mount(container, {});
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
    const session = await engine.mount(container, {});

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
```

- [ ] **Step 3.3: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 3 new tests FAIL with `session.exportAudio is not a function`.

- [ ] **Step 3.4: Implement `exportAudio`**

In `alphaTabEngine.ts` session class/factory:

```ts
import { encodeWav } from "../domain/wavEncoder";
import type { ExportAudioOptions } from "../domain/tabEngine";

async exportAudio(opts: ExportAudioOptions = {}): Promise<Uint8Array> {
  const api = this._api;
  if (!api.score) throw new Error("Cannot export audio: no score loaded");
  const sampleRate = opts.sampleRate ?? 44100;
  const audioOpts = { sampleRate, useSyncPoints: true };
  // (Track-volume mapping for mute/solo lands in T4.)
  const exporter = await api.exportAudio(audioOpts);
  const chunks: Float32Array[] = [];
  let aborted = false;
  try {
    while (true) {
      if (opts.signal?.aborted) { aborted = true; break; }
      const chunk = await exporter.render(1000);
      if (!chunk) break;
      chunks.push(chunk.samples);
      opts.onProgress?.({ currentTime: chunk.currentTime, endTime: chunk.endTime });
      if (opts.signal?.aborted) { aborted = true; break; }
    }
  } finally {
    exporter.destroy();
  }
  if (aborted) {
    const err = new Error("Aborted");
    (err as Error & { name: string }).name = "AbortError";
    throw err;
  }
  // Channel count: alphaTab synth is stereo by default; verified at T0.
  // If runtime inspection later reveals a different layout, adjust here.
  return encodeWav(chunks, sampleRate, 2);
}
```

- [ ] **Step 3.5: Run tests to verify they pass**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 6 passed.

- [ ] **Step 3.6: Commit**

```bash
git add -p src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts
git commit -m "feat(tabs): TAB-010 T3 — TabSession.exportAudio (chunked WAV render with progress + abort)"
```

---

## Task 4: exportAudio respects mute/solo via trackVolume

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`

- [ ] **Step 4.1: Append failing tests**

Add a third `describe` block to `alphaTabEngine.export.test.ts`:

```ts
describe("TabSession.exportAudio — track scope", () => {
  let container: HTMLElement;
  let capturedOpts: { trackVolume?: Map<number, number> } | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    capturedOpts = null;
    exportAudioMock.mockImplementation(async (opts: { trackVolume?: Map<number, number> }) => {
      capturedOpts = opts;
      FakeAudioExporter.chunks = [{ samples: new Float32Array(0), currentTime: 0, endTime: 0 }];
      return new FakeAudioExporter();
    });
  });

  it("maps muted track ids to trackVolume = 0", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    session.setPlaybackState({ mutedTrackIds: ["1"], soloedTrackIds: [] });
    await session.exportAudio({ sampleRate: 44100 });
    expect(capturedOpts?.trackVolume?.get(1)).toBe(0);
    expect(capturedOpts?.trackVolume?.get(0) ?? 1).toBe(1); // unmuted defaults to 1
  });

  it("when any track is soloed, non-soloed tracks → 0", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    session.setPlaybackState({ mutedTrackIds: [], soloedTrackIds: ["0"] });
    await session.exportAudio({});
    expect(capturedOpts?.trackVolume?.get(0)).toBe(1);
    expect(capturedOpts?.trackVolume?.get(1)).toBe(0); // not soloed → muted
  });

  it("solo wins over mute for a soloed track", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    session.setPlaybackState({ mutedTrackIds: ["0"], soloedTrackIds: ["0"] });
    await session.exportAudio({});
    expect(capturedOpts?.trackVolume?.get(0)).toBe(1);
  });
});
```

- [ ] **Step 4.2: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 3 new tests fail (trackVolume not populated).

- [ ] **Step 4.3: Implement track-volume mapping**

In `alphaTabEngine.ts` `exportAudio`, replace `const audioOpts = { sampleRate, useSyncPoints: true };` with:

```ts
const tracks = (api.score as { tracks: { index: number }[] }).tracks;
const muted = new Set(this._playbackState.mutedTrackIds.map((id) => Number(id)));
const soloed = new Set(this._playbackState.soloedTrackIds.map((id) => Number(id)));
const anySoloed = soloed.size > 0;
const trackVolume = new Map<number, number>();
for (const t of tracks) {
  if (anySoloed) {
    trackVolume.set(t.index, soloed.has(t.index) ? 1 : 0);
  } else if (muted.has(t.index)) {
    trackVolume.set(t.index, 0);
  } else {
    trackVolume.set(t.index, 1);
  }
}
const audioOpts = { sampleRate, useSyncPoints: true, trackVolume };
```

(`this._playbackState` is the field that backs `setPlaybackState` from TAB-009 T8 — confirm the property name in the existing class; if it's named differently, use that name.)

- [ ] **Step 4.4: Run tests to verify they pass**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 9 passed.

- [ ] **Step 4.5: Commit**

```bash
git add -p src/app/knowledge_base/infrastructure/alphaTabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts
git commit -m "feat(tabs): TAB-010 T4 — exportAudio respects mute/solo via AudioExportOptions.trackVolume"
```

---

## Task 5: TabSession.exportPdf

**Files:**
- Modify: `src/app/knowledge_base/domain/tabEngine.ts` (add method)
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts` (impl)
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`

- [ ] **Step 5.1: Add interface method**

In `interface TabSession`, append:

```ts
  /** Opens alphaTab's print popup (user prints to PDF via OS print dialog). */
  exportPdf(): void;
```

- [ ] **Step 5.2: Append failing test**

```ts
describe("TabSession.exportPdf", () => {
  let container: HTMLElement;
  beforeEach(() => { container = document.createElement("div"); document.body.appendChild(container); printMock.mockReset(); });

  it("calls api.print()", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    session.exportPdf();
    expect(printMock).toHaveBeenCalledOnce();
  });

  it("does not throw if api.print is undefined", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {});
    (session as unknown as { _api: { print?: unknown } })._api.print = undefined;
    expect(() => session.exportPdf()).not.toThrow();
  });
});
```

- [ ] **Step 5.3: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: new tests FAIL with `session.exportPdf is not a function`.

- [ ] **Step 5.4: Implement**

In `alphaTabEngine.ts`:

```ts
exportPdf(): void {
  const print = this._api.print;
  if (typeof print === "function") print.call(this._api);
}
```

- [ ] **Step 5.5: Run tests to verify they pass**

Run: `npx vitest run src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts`
Expected: 11 passed.

- [ ] **Step 5.6: Commit**

```bash
git add -p src/app/knowledge_base/domain/tabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.ts src/app/knowledge_base/infrastructure/alphaTabEngine.export.test.ts
git commit -m "feat(tabs): TAB-010 T5 — TabSession.exportPdf wraps api.print()"
```

---

## Task 6: deriveExportBaseName helper

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.test.ts`

- [ ] **Step 6.1: Write the failing tests**

```ts
// deriveExportBaseName.test.ts
import { describe, it, expect } from "vitest";
import { deriveExportBaseName } from "./deriveExportBaseName";

describe("deriveExportBaseName", () => {
  it("strips path and .alphatex suffix", () => {
    expect(deriveExportBaseName("songs/wonderwall.alphatex")).toBe("wonderwall");
  });
  it("handles nested paths", () => {
    expect(deriveExportBaseName("a/b/c/song.alphatex")).toBe("song");
  });
  it("handles a bare filename without path separators", () => {
    expect(deriveExportBaseName("song.alphatex")).toBe("song");
  });
  it("returns 'tab' when filePath is null", () => {
    expect(deriveExportBaseName(null)).toBe("tab");
  });
  it("returns 'tab' for an empty string", () => {
    expect(deriveExportBaseName("")).toBe("tab");
  });
  it("preserves names without an .alphatex suffix as-is", () => {
    expect(deriveExportBaseName("a/b/odd.txt")).toBe("odd.txt");
  });
});
```

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `npx vitest run src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement**

```ts
// deriveExportBaseName.ts
export function deriveExportBaseName(filePath: string | null): string {
  if (!filePath) return "tab";
  const last = filePath.split("/").pop() ?? "";
  if (!last) return "tab";
  return last.endsWith(".alphatex") ? last.slice(0, -".alphatex".length) : last;
}
```

- [ ] **Step 6.4: Run tests to verify they pass**

Expected: 6 passed.

- [ ] **Step 6.5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.ts src/app/knowledge_base/features/tab/hooks/deriveExportBaseName.test.ts
git commit -m "feat(tabs): TAB-010 T6 — deriveExportBaseName helper"
```

---

## Task 7: useTabExport — MIDI flow

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabExport.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx`

- [ ] **Step 7.1: Write the failing hook tests for MIDI**

```tsx
// useTabExport.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { useTabExport } from "./useTabExport";
import { ShellErrorContext } from "../../../shell/ShellErrorContext";

const reportMock = vi.fn();
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ShellErrorContext.Provider value={{ report: reportMock, dismiss: () => {}, banner: null }}>
    {children}
  </ShellErrorContext.Provider>
);

const writeMock = vi.fn();
const closeMock = vi.fn();
const showSaveFilePickerMock = vi.fn();

beforeEach(() => {
  reportMock.mockReset();
  writeMock.mockReset();
  closeMock.mockReset();
  showSaveFilePickerMock.mockReset();
  showSaveFilePickerMock.mockResolvedValue({
    createWritable: async () => ({ write: writeMock, close: closeMock }),
  });
  (globalThis as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = showSaveFilePickerMock;
});

describe("useTabExport — MIDI", () => {
  it("calls session.exportMidi, opens FSA picker with derived name, writes bytes, closes writable", async () => {
    const session = {
      exportMidi: vi.fn(() => new Uint8Array([1, 2, 3])),
      exportAudio: vi.fn(),
      exportPdf: vi.fn(),
    };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "songs/wonderwall.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(session.exportMidi).toHaveBeenCalledOnce();
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(expect.objectContaining({
      suggestedName: "wonderwall.mid",
    }));
    expect(writeMock).toHaveBeenCalledOnce();
    expect(closeMock).toHaveBeenCalledOnce();
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("no-ops when paneReadOnly is true", async () => {
    const session = { exportMidi: vi.fn(), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: true }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(session.exportMidi).not.toHaveBeenCalled();
    expect(showSaveFilePickerMock).not.toHaveBeenCalled();
  });

  it("treats AbortError from showSaveFilePicker as a silent cancel", async () => {
    showSaveFilePickerMock.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { name: "AbortError" }));
    const session = { exportMidi: vi.fn(() => new Uint8Array([1])), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("reports write errors via ShellErrorContext", async () => {
    writeMock.mockRejectedValueOnce(new Error("Quota exceeded"));
    const session = { exportMidi: vi.fn(() => new Uint8Array([1])), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportMidi(); });
    expect(reportMock).toHaveBeenCalledOnce();
    expect(reportMock.mock.calls[0]![0]).toMatchObject({ context: expect.stringMatching(/MIDI/i) });
  });
});
```

> **Note on `ShellErrorContext`:** the import path / shape must match what's actually exported. If it's a hook (`useShellError()`) instead of a `Context.Provider`, swap the wrapper accordingly. Verify in `src/app/knowledge_base/shell/ShellErrorContext.tsx` before writing the hook.

- [ ] **Step 7.2: Run tests to verify they fail**

Expected: FAIL — `useTabExport` not found.

- [ ] **Step 7.3: Implement the hook (MIDI branch only)**

```ts
// useTabExport.ts
import { useCallback, useState } from "react";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import { deriveExportBaseName } from "./deriveExportBaseName";
import type { TabSession } from "../../../domain/tabEngine";

export interface UseTabExportArgs {
  session: Pick<TabSession, "exportMidi" | "exportAudio" | "exportPdf"> | null;
  filePath: string | null;
  paneReadOnly: boolean;
}

export type WavPhase = "idle" | "rendering" | "saving";

export interface WavState {
  phase: WavPhase;
  progress: { currentTime: number; endTime: number } | null;
  cancel: () => void;
}

const noop = () => {};
const idleWavState: WavState = { phase: "idle", progress: null, cancel: noop };

function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

export function useTabExport(args: UseTabExportArgs) {
  const { reportError } = useShellErrors();
  const [exportingMidi, setExportingMidi] = useState(false);
  const [wavState, setWavState] = useState<WavState>(idleWavState);

  const exportMidi = useCallback(async () => {
    if (!args.session || args.paneReadOnly) return;
    setExportingMidi(true);
    try {
      const bytes = args.session.exportMidi();
      const base = deriveExportBaseName(args.filePath);
      const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<{ createWritable(): Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
        suggestedName: `${base}.mid`,
        types: [{ description: "MIDI", accept: { "audio/midi": [".mid", ".midi"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (e) {
      if (isAbortError(e)) return;
      reportError(e, "Export MIDI");
    } finally {
      setExportingMidi(false);
    }
  }, [args.session, args.paneReadOnly, args.filePath, reportError]);

  // Stubs for T8 + T9 (next tasks fill these in):
  const exportWav = useCallback(async () => { /* T8 */ }, []);
  const exportPdf = useCallback(() => { /* T9 */ }, []);

  return { exportMidi, exportWav, exportPdf, wavState, exportingMidi };
}
```

> If `useShellErrors()`'s actual signature uses `report(...)` directly (not `reportError(error, context)`), adjust the call shape — the test mock has both styles available; pick whichever the codebase uses.

- [ ] **Step 7.4: Run tests to verify they pass**

Expected: 4 passed.

- [ ] **Step 7.5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabExport.ts src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx
git commit -m "feat(tabs): TAB-010 T7 — useTabExport (MIDI flow)"
```

---

## Task 8: useTabExport — WAV flow with state machine

**Files:**
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabExport.ts`
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx`

- [ ] **Step 8.1: Append failing WAV tests**

```tsx
describe("useTabExport — WAV", () => {
  it("phase transitions idle → rendering → saving → idle on success", async () => {
    const exportAudio = vi.fn(async (opts: { onProgress?: (p: { currentTime: number; endTime: number }) => void } = {}) => {
      opts.onProgress?.({ currentTime: 100, endTime: 1000 });
      opts.onProgress?.({ currentTime: 1000, endTime: 1000 });
      return new Uint8Array([0, 0, 0]);
    });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    expect(result.current.wavState.phase).toBe("idle");
    await act(async () => { await result.current.exportWav(); });
    expect(result.current.wavState.phase).toBe("idle");
    expect(showSaveFilePickerMock).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "song.wav" }));
    expect(writeMock).toHaveBeenCalledOnce();
  });

  it("cancel() aborts the in-flight export", async () => {
    let progressCb: ((p: { currentTime: number; endTime: number }) => void) | null = null;
    let resolveExport!: (b: Uint8Array) => void;
    const exportAudio = vi.fn((opts: { onProgress?: typeof progressCb; signal?: AbortSignal }) => {
      progressCb = opts.onProgress ?? null;
      return new Promise<Uint8Array>((resolve, reject) => {
        opts.signal?.addEventListener("abort", () => {
          const e = new Error("Aborted"); (e as Error & { name: string }).name = "AbortError";
          reject(e);
        });
        resolveExport = resolve;
      });
    });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    let exportPromise!: Promise<void>;
    act(() => { exportPromise = result.current.exportWav(); });
    // Tick once so React commits the rendering state
    await act(async () => { progressCb?.({ currentTime: 50, endTime: 300 }); });
    expect(result.current.wavState.phase).toBe("rendering");
    await act(async () => { result.current.wavState.cancel(); await exportPromise; });
    expect(result.current.wavState.phase).toBe("idle");
    expect(reportMock).not.toHaveBeenCalled();
    void resolveExport;
  });

  it("non-abort errors reach ShellErrorContext", async () => {
    const exportAudio = vi.fn(async () => { throw new Error("Synth failed"); });
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    await act(async () => { await result.current.exportWav(); });
    expect(result.current.wavState.phase).toBe("idle");
    expect(reportMock).toHaveBeenCalledOnce();
    expect(reportMock.mock.calls[0]![0]).toMatchObject({ context: expect.stringMatching(/WAV/i) });
  });

  it("paneReadOnly = true makes exportWav a no-op", async () => {
    const exportAudio = vi.fn();
    const session = { exportMidi: vi.fn(), exportAudio, exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: true }),
      { wrapper },
    );
    await act(async () => { await result.current.exportWav(); });
    expect(exportAudio).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8.2: Run tests to verify they fail**

Expected: 4 new tests fail (`exportWav` is the placeholder no-op).

- [ ] **Step 8.3: Replace the `exportWav` stub**

In `useTabExport.ts`:

```ts
const exportWav = useCallback(async () => {
  if (!args.session || args.paneReadOnly) return;
  const controller = new AbortController();
  setWavState({ phase: "rendering", progress: null, cancel: () => controller.abort() });
  try {
    const bytes = await args.session.exportAudio({
      signal: controller.signal,
      onProgress: (p) => setWavState((s) => ({ ...s, phase: s.phase, progress: p })),
    });
    setWavState({ phase: "saving", progress: null, cancel: noop });
    const base = deriveExportBaseName(args.filePath);
    const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<{ createWritable(): Promise<{ write: (b: Uint8Array) => Promise<void>; close: () => Promise<void> }> }> }).showSaveFilePicker({
      suggestedName: `${base}.wav`,
      types: [{ description: "WAV audio", accept: { "audio/wav": [".wav"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  } catch (e) {
    if (isAbortError(e)) return;
    reportError(e, "Export WAV");
  } finally {
    setWavState(idleWavState);
  }
}, [args.session, args.paneReadOnly, args.filePath, reportError]);
```

> Use the `setWavState` callback form so `phase: 'rendering'` doesn't get clobbered when chunked progress events arrive — hence the explicit spread.

- [ ] **Step 8.4: Run tests to verify they pass**

Expected: 8 passed.

- [ ] **Step 8.5: Commit**

```bash
git add -p src/app/knowledge_base/features/tab/hooks/useTabExport.ts src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx
git commit -m "feat(tabs): TAB-010 T8 — useTabExport WAV flow with phase machine + cancel"
```

---

## Task 9: useTabExport — PDF flow

**Files:**
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabExport.ts`
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx`

- [ ] **Step 9.1: Append failing tests**

```tsx
describe("useTabExport — PDF", () => {
  it("calls session.exportPdf()", () => {
    const session = { exportMidi: vi.fn(), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    act(() => { result.current.exportPdf(); });
    expect(session.exportPdf).toHaveBeenCalledOnce();
  });
  it("no-ops when paneReadOnly", () => {
    const session = { exportMidi: vi.fn(), exportAudio: vi.fn(), exportPdf: vi.fn() };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: true }),
      { wrapper },
    );
    act(() => { result.current.exportPdf(); });
    expect(session.exportPdf).not.toHaveBeenCalled();
  });
  it("reports thrown errors", () => {
    const session = { exportMidi: vi.fn(), exportAudio: vi.fn(), exportPdf: vi.fn(() => { throw new Error("Popup blocked"); }) };
    const { result } = renderHook(
      () => useTabExport({ session, filePath: "song.alphatex", paneReadOnly: false }),
      { wrapper },
    );
    act(() => { result.current.exportPdf(); });
    expect(reportMock).toHaveBeenCalledOnce();
    expect(reportMock.mock.calls[0]![0]).toMatchObject({ context: expect.stringMatching(/PDF/i) });
  });
});
```

- [ ] **Step 9.2: Verify failing**

Expected: 3 new tests fail.

- [ ] **Step 9.3: Replace `exportPdf` stub**

```ts
const exportPdf = useCallback(() => {
  if (!args.session || args.paneReadOnly) return;
  try { args.session.exportPdf(); }
  catch (e) { reportError(e, "Export PDF"); }
}, [args.session, args.paneReadOnly, reportError]);
```

- [ ] **Step 9.4: Verify passing**

Expected: 11 passed.

- [ ] **Step 9.5: Commit**

```bash
git add -p src/app/knowledge_base/features/tab/hooks/useTabExport.ts src/app/knowledge_base/features/tab/hooks/useTabExport.test.tsx
git commit -m "feat(tabs): TAB-010 T9 — useTabExport PDF flow"
```

---

## Task 10: ExportSection (basic three buttons + paneReadOnly gate)

**Files:**
- Create: `src/app/knowledge_base/features/tab/properties/ExportSection.tsx`
- Test: `src/app/knowledge_base/features/tab/properties/ExportSection.test.tsx`

- [ ] **Step 10.1: Write failing tests**

```tsx
// ExportSection.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportSection } from "./ExportSection";

const idleWav = { phase: "idle" as const, progress: null, cancel: () => {} };

describe("ExportSection", () => {
  function defaultProps() {
    return {
      exportMidi: vi.fn(),
      exportWav: vi.fn(),
      exportPdf: vi.fn(),
      wavState: idleWav,
      exportingMidi: false,
      paneReadOnly: false,
    };
  }

  it("renders three buttons when not paneReadOnly", () => {
    render(<ExportSection {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /export midi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export wav/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /(print|pdf)/i })).toBeInTheDocument();
  });

  it("returns null when paneReadOnly = true", () => {
    const { container } = render(<ExportSection {...defaultProps()} paneReadOnly={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking Export MIDI calls exportMidi", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /export midi/i }));
    expect(props.exportMidi).toHaveBeenCalledOnce();
  });

  it("clicking Export WAV calls exportWav", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /export wav/i }));
    expect(props.exportWav).toHaveBeenCalledOnce();
  });

  it("clicking Print/PDF calls exportPdf", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /(print|pdf)/i }));
    expect(props.exportPdf).toHaveBeenCalledOnce();
  });

  it("disables all export buttons while a MIDI export is in flight", () => {
    render(<ExportSection {...defaultProps()} exportingMidi={true} />);
    expect(screen.getByRole("button", { name: /export midi/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export wav/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /(print|pdf)/i })).toBeDisabled();
  });
});
```

- [ ] **Step 10.2: Verify failing**

Expected: FAIL — module not found.

- [ ] **Step 10.3: Implement the component**

```tsx
// ExportSection.tsx
import React from "react";
import type { WavState } from "../hooks/useTabExport";

export interface ExportSectionProps {
  exportMidi: () => Promise<void> | void;
  exportWav: () => Promise<void> | void;
  exportPdf: () => void;
  wavState: WavState;
  exportingMidi: boolean;
  paneReadOnly: boolean;
}

export function ExportSection(props: ExportSectionProps): React.ReactElement | null {
  if (props.paneReadOnly) return null;
  const wavBusy = props.wavState.phase !== "idle";
  const anyBusy = props.exportingMidi || wavBusy;

  return (
    <section aria-label="Export" className="tab-properties-subsection">
      <h3 className="tab-properties-subsection__heading">Export</h3>
      <div className="tab-properties-export-row">
        <button type="button" disabled={anyBusy} onClick={() => props.exportMidi()}>
          Export MIDI
        </button>
      </div>
      <div className="tab-properties-export-row">
        {/* WAV progress UI lands in T11 — for now, render the button with the disabled gate. */}
        <button type="button" disabled={anyBusy} onClick={() => props.exportWav()}>
          Export WAV
        </button>
      </div>
      <div className="tab-properties-export-row">
        <button type="button" disabled={anyBusy} onClick={() => props.exportPdf()}>
          Print or Save as PDF
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 10.4: Verify passing**

Expected: 6 passed.

- [ ] **Step 10.5: Commit**

```bash
git add src/app/knowledge_base/features/tab/properties/ExportSection.tsx src/app/knowledge_base/features/tab/properties/ExportSection.test.tsx
git commit -m "feat(tabs): TAB-010 T10 — ExportSection (three buttons, paneReadOnly gate)"
```

---

## Task 11: ExportSection — WAV progress row

**Files:**
- Modify: `src/app/knowledge_base/features/tab/properties/ExportSection.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/ExportSection.test.tsx`

- [ ] **Step 11.1: Append failing tests**

```tsx
describe("ExportSection — WAV progress", () => {
  it("renders progress row when wavState.phase === 'rendering'", () => {
    const cancel = vi.fn();
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "rendering", progress: { currentTime: 12000, endTime: 95000 }, cancel }}
      exportingMidi={false} paneReadOnly={false}
    />);
    // Progress text: "12s / 95s" (formatted from ms)
    expect(screen.getByText(/12s\s*\/\s*95s/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("renders 'Saving…' (no Cancel) when wavState.phase === 'saving'", () => {
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "saving", progress: null, cancel: () => {} }}
      exportingMidi={false} paneReadOnly={false}
    />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("hides the WAV button while progress row is active", () => {
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "rendering", progress: { currentTime: 0, endTime: 1000 }, cancel: () => {} }}
      exportingMidi={false} paneReadOnly={false}
    />);
    expect(screen.queryByRole("button", { name: /export wav/i })).toBeNull();
  });
});
```

- [ ] **Step 11.2: Verify failing**

Expected: 3 new tests fail.

- [ ] **Step 11.3: Update `ExportSection.tsx`**

Replace the WAV row block with:

```tsx
<div className="tab-properties-export-row">
  {props.wavState.phase === "idle" ? (
    <button type="button" disabled={anyBusy} onClick={() => props.exportWav()}>
      Export WAV
    </button>
  ) : (
    <WavProgressRow wavState={props.wavState} />
  )}
</div>
```

Add the helper component at the bottom of the file:

```tsx
function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function WavProgressRow({ wavState }: { wavState: WavState }): React.ReactElement {
  if (wavState.phase === "saving") {
    return <span aria-live="polite">Saving…</span>;
  }
  const cur = wavState.progress?.currentTime ?? 0;
  const end = wavState.progress?.endTime ?? 0;
  const pct = end > 0 ? Math.round((cur / end) * 100) : 0;
  return (
    <span className="tab-properties-export-progress">
      <span aria-live="polite">
        Rendering audio… {formatSeconds(cur)} / {formatSeconds(end)}
      </span>
      <progress max={100} value={pct} aria-label="Export progress" />
      <button type="button" onClick={wavState.cancel}>Cancel</button>
    </span>
  );
}
```

- [ ] **Step 11.4: Verify passing**

Expected: 9 passed.

- [ ] **Step 11.5: Commit**

```bash
git add -p src/app/knowledge_base/features/tab/properties/ExportSection.tsx src/app/knowledge_base/features/tab/properties/ExportSection.test.tsx
git commit -m "feat(tabs): TAB-010 T11 — ExportSection WAV progress row + cancel"
```

---

## Task 12: TabView — call useTabExport, populate handle, render <ExportSection>

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/features/tab/properties/TabProperties.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx` (if it exists — extend with one new assertion)

> Note: this task wires the hook into the view; the upward ref signaling lands in T13.

- [ ] **Step 12.1: Modify `TabView.tsx`**

Add near the other hooks:

```tsx
import { useTabExport } from "./hooks/useTabExport";

// Inside the TabView component body, after `session` is available:
const tabExport = useTabExport({
  session,
  filePath: filePath ?? null,
  paneReadOnly,
});
```

Pass exports down into `<TabProperties>`:

```tsx
<TabProperties
  /* … existing props … */
  exportMidi={tabExport.exportMidi}
  exportWav={tabExport.exportWav}
  exportPdf={tabExport.exportPdf}
  wavState={tabExport.wavState}
  exportingMidi={tabExport.exportingMidi}
  paneReadOnly={paneReadOnly}
/>
```

- [ ] **Step 12.2: Modify `TabProperties.tsx`**

Add the matching props to its interface; render `<ExportSection>` after the existing sub-sections:

```tsx
import { ExportSection } from "./ExportSection";

// In the props interface:
interface TabPropertiesProps {
  /* … existing fields … */
  exportMidi: () => Promise<void> | void;
  exportWav: () => Promise<void> | void;
  exportPdf: () => void;
  wavState: WavState;
  exportingMidi: boolean;
  paneReadOnly: boolean;
}

// At the end of the JSX (still inside the panel container):
<ExportSection
  exportMidi={props.exportMidi}
  exportWav={props.exportWav}
  exportPdf={props.exportPdf}
  wavState={props.wavState}
  exportingMidi={props.exportingMidi}
  paneReadOnly={props.paneReadOnly}
/>
```

`WavState` import: from `../hooks/useTabExport`.

- [ ] **Step 12.3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (or only pre-existing errors not introduced by this task).

- [ ] **Step 12.4: Run the tab test bucket**

Run: `npx vitest run src/app/knowledge_base/features/tab`
Expected: all green.

- [ ] **Step 12.5: Commit**

```bash
git add -p src/app/knowledge_base/features/tab/TabView.tsx src/app/knowledge_base/features/tab/properties/TabProperties.tsx
git commit -m "feat(tabs): TAB-010 T12 — TabView wires useTabExport; TabProperties mounts <ExportSection>"
```

---

## Task 13: TabPaneContext extension + KnowledgeBaseInner ref

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`

- [ ] **Step 13.1: Extend `TabPaneContext`**

In `knowledgeBase.tabRouting.helper.tsx`, add to `TabPaneContext`:

```ts
export interface TabExportHandle {
  exportMidi: () => Promise<void>;
  exportWav: () => Promise<void>;
  exportPdf: () => void;
  paneReadOnly: boolean;
}

export interface TabPaneContext {
  /* … existing fields … */
  onTabExportReady?: (handle: TabExportHandle | null) => void;
}
```

Thread `onTabExportReady` through `BuildTabPaneContextArgs` and `buildTabPaneContext`.

- [ ] **Step 13.2: TabView populates the handle**

In `TabView.tsx`, inside the component body:

```tsx
useEffect(() => {
  if (!props.onTabExportReady) return;
  props.onTabExportReady({
    exportMidi: tabExport.exportMidi,
    exportWav: tabExport.exportWav,
    exportPdf: tabExport.exportPdf,
    paneReadOnly,
  });
  return () => props.onTabExportReady?.(null);
}, [props.onTabExportReady, tabExport.exportMidi, tabExport.exportWav, tabExport.exportPdf, paneReadOnly]);
```

(`props.onTabExportReady` lands in via `renderTabPaneEntry` which already spreads context onto TabView.)

- [ ] **Step 13.3: KnowledgeBaseInner declares the refs**

Near the doc-bridge refs in `knowledgeBase.tsx`:

```tsx
const leftTabExportRef = useRef<TabExportHandle | null>(null);
const rightTabExportRef = useRef<TabExportHandle | null>(null);
```

In the tab-pane render branch (~line 1027), pass `onTabExportReady` into `buildTabPaneContext`:

```tsx
onTabExportReady: (handle) => {
  if (side === "left") leftTabExportRef.current = handle;
  else rightTabExportRef.current = handle;
},
```

- [ ] **Step 13.4: Type-check + tab test bucket**

Run: `npx tsc --noEmit && npx vitest run src/app/knowledge_base/features/tab`
Expected: clean.

- [ ] **Step 13.5: Commit**

```bash
git add -p src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx src/app/knowledge_base/features/tab/TabView.tsx src/app/knowledge_base/knowledgeBase.tsx
git commit -m "feat(tabs): TAB-010 T13 — TabExportHandle ref bridge between TabView and KnowledgeBaseInner"
```

---

## Task 14: Palette commands

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tsx`
- Create: `src/app/knowledge_base/knowledgeBase.exportTab.test.tsx`

- [ ] **Step 14.1: Add `buildExportTabCommands` helper**

In `knowledgeBase.tsx`, after `buildImportGpCommands`:

```tsx
import type { TabExportHandle } from "./knowledgeBase.tabRouting.helper";

export function buildExportTabCommands(args: {
  getActiveExport: () => TabExportHandle | null;
  isMobile: boolean;
}): Command[] {
  const isInvocable = () => {
    if (args.isMobile) return false;
    const handle = args.getActiveExport();
    return handle != null && !handle.paneReadOnly;
  };
  return [
    {
      id: "tabs.export-midi",
      title: "Export tab as MIDI",
      group: "Tab",
      when: isInvocable,
      run: () => { void args.getActiveExport()?.exportMidi(); },
    },
    {
      id: "tabs.export-wav",
      title: "Export tab as WAV",
      group: "Tab",
      when: isInvocable,
      run: () => { void args.getActiveExport()?.exportWav(); },
    },
    {
      id: "tabs.export-pdf",
      title: "Print tab or save as PDF",
      group: "Tab",
      when: isInvocable,
      run: () => args.getActiveExport()?.exportPdf(),
    },
  ];
}
```

- [ ] **Step 14.2: Register in `KnowledgeBaseInner`**

After the existing `useRegisterCommands(importGpCommands);` call:

```tsx
const exportTabCommands = useMemo(
  () => buildExportTabCommands({
    getActiveExport: () => {
      // Active side detection mirrors how doc-bridge ref is read elsewhere.
      // Default to left-side ref when both are present (TAB-009 follows same convention).
      return rightTabExportRef.current ?? leftTabExportRef.current;
    },
    isMobile,
  }),
  [isMobile],
);
useRegisterCommands(exportTabCommands);
```

> **Note:** if your codebase already has an `activePaneSide` signal (check `panes`/`paneManager`), prefer that over the right-then-left fallback. The fallback is correct for the common single-pane case.

- [ ] **Step 14.3: Write the helper test**

```tsx
// knowledgeBase.exportTab.test.tsx
import { describe, it, expect, vi } from "vitest";
import { buildExportTabCommands } from "./knowledgeBase";
import type { TabExportHandle } from "./knowledgeBase.tabRouting.helper";

const makeHandle = (paneReadOnly = false): TabExportHandle => ({
  exportMidi: vi.fn().mockResolvedValue(undefined),
  exportWav: vi.fn().mockResolvedValue(undefined),
  exportPdf: vi.fn(),
  paneReadOnly,
});

describe("buildExportTabCommands", () => {
  it("returns three commands with stable ids", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(), isMobile: false });
    expect(cmds.map((c) => c.id)).toEqual([
      "tabs.export-midi",
      "tabs.export-wav",
      "tabs.export-pdf",
    ]);
  });

  it("when() is false on mobile", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(), isMobile: true });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("when() is false if no active handle", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => null, isMobile: false });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("when() is false if active handle has paneReadOnly = true", () => {
    const cmds = buildExportTabCommands({ getActiveExport: () => makeHandle(true), isMobile: false });
    for (const c of cmds) expect(c.when?.()).toBe(false);
  });

  it("run() dispatches to the right handle method", () => {
    const handle = makeHandle();
    const cmds = buildExportTabCommands({ getActiveExport: () => handle, isMobile: false });
    cmds[0]!.run();
    cmds[1]!.run();
    cmds[2]!.run();
    expect(handle.exportMidi).toHaveBeenCalledOnce();
    expect(handle.exportWav).toHaveBeenCalledOnce();
    expect(handle.exportPdf).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 14.4: Verify all tests**

Run: `npx vitest run src/app/knowledge_base/knowledgeBase.exportTab.test.tsx`
Expected: 5 passed.

- [ ] **Step 14.5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tsx src/app/knowledge_base/knowledgeBase.exportTab.test.tsx
git commit -m "feat(tabs): TAB-010 T14 — palette commands tabs.export-midi/wav/pdf"
```

---

## Task 15: Bravura font verification (parked-item #14)

This task is gated on observation: do the verification first, then conditionally add the asset.

- [ ] **Step 15.1: Run the dev server and observe a print popup**

```bash
npm run dev
# In another terminal:
open http://localhost:3000
# Open a tab pane in the app, then in DevTools console:
#   window.dispatchEvent(new CustomEvent('tabs.export-pdf'));
# OR click "Print or Save as PDF" in the Properties Export sub-section.
```

- [ ] **Step 15.2: Inspect the popup**

If the popup music notation renders correctly with stems, beams, noteheads, and articulations → font is bundled by Next.js production-style; **skip Steps 15.3–15.5** and go to Step 15.6.

If glyphs render as squares / missing → font asset wiring is broken in dev; continue.

- [ ] **Step 15.3: Copy font assets**

```bash
mkdir -p public/font
cp node_modules/@coderline/alphatab/dist/font/Bravura.{woff2,woff,otf,svg,eot} public/font/
ls public/font/
```

- [ ] **Step 15.4: Configure alphaTab fontDirectory**

In `infrastructure/alphaTabEngine.ts`, in the settings construction:

```ts
settings.core.fontDirectory = "/font/";
```

- [ ] **Step 15.5: Re-test the popup**

Reload the dev server, repeat Step 15.2's print test. Glyphs should now render correctly.

- [ ] **Step 15.6: Commit (only if assets/code changed)**

```bash
git add -p src/app/knowledge_base/infrastructure/alphaTabEngine.ts public/font/
git commit -m "chore(tabs): TAB-010 T15 — wire Bravura font for print popup (closes parked #14)"
```

If no changes were needed, leave a short comment in the PR description noting "Bravura already resolved correctly in dev; no font asset wiring required."

---

## Task 16: Features.md update

**Files:**
- Modify: `Features.md`

- [ ] **Step 16.1: Read existing §11 structure**

Run: `grep -n "^### §11" Features.md`
Identify the next sub-section number.

- [ ] **Step 16.2: Add the Export sub-section**

Append (or insert in the right position) under §11 Guitar Tabs:

```markdown
### §11.x Export

- ✅ **Export MIDI** — Properties panel button + `tabs.export-midi` palette command. Generates SMF Type 1 multi-track MIDI via `MidiFileGenerator.toBinary()`; saved through FSA `showSaveFilePicker`. (`features/tab/hooks/useTabExport.ts`, `infrastructure/alphaTabEngine.ts`)
- ✅ **Export WAV** — Properties panel button + `tabs.export-wav` palette command. Streaming chunked render via `api.exportAudio()`; respects current per-track mute/solo state via `AudioExportOptions.trackVolume`; inline progress bar with cancel; encoded as 16-bit PCM WAV in `domain/wavEncoder.ts`. (`features/tab/properties/ExportSection.tsx`, `domain/wavEncoder.ts`)
- ✅ **Print / Save as PDF** — Properties panel button + `tabs.export-pdf` palette command. Wraps alphaTab's `api.print()` (popup with A4-optimised score → user prints to PDF via OS dialog). (`infrastructure/alphaTabEngine.ts`)
- ⚙️ Mobile: all export surfaces hidden when `paneReadOnly` (TAB-012 mobile gate).
```

(Pick the actual numbering once you've inspected the file. The bullet style + symbol legend already in §11 is the source of truth.)

- [ ] **Step 16.3: Commit**

```bash
git add Features.md
git commit -m "docs(features): TAB-010 — §11 Export sub-section (MIDI / WAV / PDF)"
```

---

## Task 17: test-cases/11-tabs.md update

**Files:**
- Modify: `test-cases/11-tabs.md`

- [ ] **Step 17.1: Append §11.11 Export**

```markdown
## §11.11 Export

11.11-01 ✅ Export MIDI: click "Export MIDI" → save picker opens with `<base>.mid` → user accepts → file is written and is a valid SMF1 multi-track MIDI.
11.11-02 ✅ Export MIDI palette: invoke `tabs.export-midi` from ⌘P → same flow as 11.11-01.
11.11-03 ✅ Export WAV: click "Export WAV" → progress row appears with elapsed/total seconds → save picker opens with `<base>.wav` → file is written as 16-bit PCM WAV.
11.11-04 ✅ Export WAV cancel: click Cancel during render → progress row clears → no file written → no error banner.
11.11-05 ✅ Export WAV M/S scope: with one track muted, the exported WAV's audio for that track is silent (zero amplitude in its segments).
11.11-06 ✅ Export PDF: click "Print or Save as PDF" → alphaTab popup opens with the score laid out for A4.
11.11-07 ✅ Mobile gating: when `paneReadOnly`, the Export sub-section is absent from the panel and all three palette commands are unavailable.
11.11-08 ✅ FSA picker cancel: user dismisses the save dialog mid-flow → no error banner; UI returns to idle.
```

Status markers — flip to ✅ as each test passes; if any case is still ❌ at PR time, leave it as ❌ with a one-line note (mirrors the rest of the file's discipline). Cross-reference: each test name should include its case ID (e.g. `it("11.11-01: export MIDI", …)`).

- [ ] **Step 17.2: Commit**

```bash
git add test-cases/11-tabs.md
git commit -m "docs(test-cases): TAB-010 — §11.11 Export cases"
```

---

## Task 18: Final verification + handoff close-out

- [ ] **Step 18.1: Type-check the whole tree**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 18.2: Run the full Vitest suite**

Run: `npm run test:run`
Expected: every test green; new export tests counted in the summary.

- [ ] **Step 18.3: Run lint**

Run: `npm run lint`
Expected: clean (no new warnings introduced).

- [ ] **Step 18.4: Manual dev smoke**

```bash
npm run dev
# 1. Open a tab pane, click each Export button.
# 2. Verify MIDI saves a file and that the file opens in any DAW (or `file <path>` reports MIDI).
# 3. Verify WAV progress bar moves; play the saved file in the OS audio player.
# 4. Verify Print popup opens and you can save-as-PDF.
# 5. Toggle mobile breakpoint in DevTools; confirm Export section disappears + palette hides commands.
```

- [ ] **Step 18.5: Update the handoff doc — TAB-010 → ✅ Merged-to-be**

In `docs/superpowers/handoffs/2026-05-03-guitar-tabs.md`:
- Flip the TAB-010 row in "Where we are" to ✅ Merged with the actual PR number when it's opened.
- Drop the "M2 editor ship-point" / "Remaining tickets" sub-section once TAB-010 closes.
- Rewrite the **Next Action** to point at parked-item triage (#11 diagram orphan attachments + TAB-008b candidates #15, #17, #18).
- Bump **Last updated**.

(Mechanical edits per the Doc-update protocol already documented in the handoff.)

- [ ] **Step 18.6: Commit handoff refresh + open PR**

```bash
git add docs/superpowers/handoffs/2026-05-03-guitar-tabs.md
git commit -m "docs(handoffs): TAB-010 close-out — M2 ship-point complete"
git push -u origin plan/guitar-tabs-export
gh pr create --title "TAB-010: Export — MIDI / WAV / PDF (M2 ship)" --body "$(cat <<'EOF'
## Summary
- Adds `TabSession.exportMidi()` / `exportAudio()` / `exportPdf()` to the alphaTab engine.
- New pure `wavEncoder` (Float32 → 16-bit PCM); chunked WAV render with progress + cancel.
- New `ExportSection` Properties sub-component + `tabs.export-{midi,wav,pdf}` palette commands.
- Mobile gate: hides all surfaces when `paneReadOnly` (TAB-012 wiring).
- Closes M2 (editor) ship-point.

## Test plan
- [ ] `npm run test:run` — all green
- [ ] `npx tsc --noEmit` — clean
- [ ] Manual: export MIDI → opens in DAW
- [ ] Manual: export WAV → plays in OS audio player; M/S scope respected
- [ ] Manual: print popup opens; OS Save-as-PDF works
- [ ] Manual: mobile breakpoint hides Export section + palette commands

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 18.7: After PR merge — clean up**

```bash
git checkout main && git pull --ff-only
git branch -D plan/guitar-tabs-export
```

---

## Self-review (run after writing the plan)

Done after the plan was authored — checked spec coverage, placeholders, and type consistency:

1. **Spec coverage:**
   - Architecture (engine + hook + UI + palette) → T2–T5 + T7–T11 + T12–T14. ✓
   - Per-format track scope → T4. ✓
   - Mobile gate → enforced in T7–T9 + T10 + T14. ✓
   - Filename derivation → T6. ✓
   - WAV progress UX → T8 (state machine) + T11 (UI). ✓
   - Error surfacing → T7–T9 (every catch routes to ShellErrorContext). ✓
   - Bravura parked item #14 → T15. ✓
   - Test cases (§11.11 + Features.md) → T16, T17. ✓
2. **Placeholder scan:** No "TBD" / "implement later" / "similar to Task N" / "etc.". Every code step shows the actual code. The two "Note:" footnotes are concrete cross-checks for the engineer (verify property name, verify hook signature) — not placeholders.
3. **Type consistency:**
   - `WavState` shape stable across T7 → T8 → T10 → T11 → T13. ✓
   - `TabExportHandle` shape (T13) matches `useTabExport` return shape (T7–T9). ✓
   - `ExportAudioOptions` shape stable across T3 → T4 → T7. ✓
4. **Scope check:** ~16 implementation tasks + 3 docs/cleanup tasks. Each task TDD-style, ~5–15 minutes for a focused engineer. Fits the 2-day estimate.

— end of plan.
