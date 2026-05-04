# TAB-010 Export — alphaTab API Verification (T0)

**Date:** 2026-05-04
**Branch:** `plan/guitar-tabs-export`
**Source:** `node_modules/@coderline/alphatab/dist/alphaTab.d.ts` (alphaTab v1.6.x)
**Question this resolves:** Exact alphaTab surface for MIDI / WAV / PDF export so the brainstorm and plan can commit to a real architecture instead of an assumed one.

---

## Headline findings

| Format | Native? | API path | FSA save-picker compatible? |
|---|---|---|---|
| **MIDI** | ✅ | `MidiFileGenerator` → `MidiFile.toBinary(): Uint8Array` (custom path) **or** `api.downloadMidi(format?)` (browser-trigger path) | ✅ via `MidiFile.toBinary()` |
| **WAV** | ✅ (raw samples) | `api.exportAudio(opts) → IAudioExporter.render(ms): Promise<AudioExportChunk \| undefined>` (chunked, pull-based) — we own Float32 → 16-bit PCM WAV encoding | ✅ |
| **PDF** | ❌ | Only `api.print(width?, additionalSettings?)` — opens popup with A4-optimised view; user prints to PDF via OS print dialog | ❌ (no direct save) |
| **SVG** | ⚠️ partial | Capture `renderResult` payload from `partialRenderFinished` events when `engine: 'svg'`; stitch partials into one SVG ourselves | ✅ (custom assembly) |

---

## 1. MIDI export

### Browser-trigger path — already shipped in alphaTab

```ts
// alphaTab.d.ts:307
downloadMidi(format?: MidiFileFormat): void;
```

`api.downloadMidi()` generates a SMF1.0 file and triggers a browser download. **No path control** — the user gets the browser's default download dialog/folder. SMF1.0 limitation: per-note bends not preserved when multiple bends apply on one beat (vibrato + bend).

### Custom path — what TAB-010 actually wants

To save via FSA `showSaveFilePicker` (consistent with the rest of the app), build the binary ourselves:

```ts
// alphaTab.d.ts:11242 — MidiFile
declare class MidiFile {
  format: MidiFileFormat;
  division: number;
  toBinary(): Uint8Array;            // ← we want this
  writeTo(s: IWriteable): void;
  ...
}

// alphaTab.d.ts:11302 — MidiFileGenerator
declare class MidiFileGenerator {
  constructor(score: Score, settings: Settings | null, handler: IMidiFileHandler);
  generate(): void;
  ...
}

// alphaTab.d.ts:217 — concrete handler
declare class AlphaSynthMidiFileHandler implements IMidiFileHandler {
  constructor(midiFile: MidiFile, smf1Mode?: boolean);
  ...
}

// alphaTab.d.ts:11287 — formats
declare enum MidiFileFormat {
  SingleTrackMultiChannel = 0,  // SMF Type 0
  MultiTrack = 1                // SMF Type 1
}
```

**Recipe:**

```ts
const midiFile = new alphaTab.midi.MidiFile();
midiFile.format = alphaTab.midi.MidiFileFormat.MultiTrack;
const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(midiFile, /* smf1Mode */ true);
const generator = new alphaTab.midi.MidiFileGenerator(api.score!, api.settings, handler);
generator.generate();
const bytes: Uint8Array = midiFile.toBinary();
// → write `bytes` to FSA-picked file
```

**Open question:** Whether the namespace exports are exactly `alphaTab.midi.MidiFile` etc. — verify at implementation time by importing from `@coderline/alphatab` and TypeScript-introspecting. Likely accessor shape based on `exporter` namespace pattern at `alphaTab.d.ts:8286`.

---

## 2. WAV export

### API surface

```ts
// alphaTab.d.ts:3132 — entry point
exportAudio(options: AudioExportOptions): Promise<IAudioExporter>;

// alphaTab.d.ts:9145 — pull-based streaming exporter
declare interface IAudioExporter extends Disposable {
  render(milliseconds: number): Promise<AudioExportChunk | undefined>;
  destroy(): void;
}

// alphaTab.d.ts:4182 — chunk shape (progress is here)
declare class AudioExportChunk {
  samples: Float32Array;       // mono or stereo? — confirm at runtime; channelCount comes from settings
  currentTime: number;          // ms
  endTime: number;              // ms — total song length
  currentTick: number;
  endTick: number;
}

// alphaTab.d.ts:4209 — options
declare class AudioExportOptions {
  soundFonts?: Uint8Array[];   // we pass our bundled Sonivox SoundFont
  sampleRate: number;          // default 44100
  useSyncPoints: boolean;      // default true
  masterVolume: number;        // 0.0–3.0, default 1.0
  metronomeVolume: number;     // 0.0–3.0, default 0.0
  playbackRange?: PlaybackRange;
  trackVolume: Map<number, number>;
  trackTransposition?: Map<number, number>;
  ...
}
```

`render()` returns `undefined` when the song completes — that's our loop terminator. Each chunk carries `currentTime` / `endTime` so we can drive a progress bar.

### Encoding

alphaTab gives us raw Float32 PCM. We own the WAV-container assembly: 44-byte RIFF/WAVE/fmt /data header + Float32 → Int16 sample conversion. This is ~30 lines; well-known recipe; no third-party dep needed.

### Notes
- alphaTab docs page referenced in the API: <https://www.alphatab.net/docs/guides/audio-export> — read this when implementing for any post-1.6.0 caveats.
- We pass our existing `public/soundfonts/sonivox.sf2` via `options.soundFonts = [bytes]` (or omit if the loaded synth already has it cached — confirm at runtime).
- Worker-mode exporter exists (`IAudioExporterWorker`, `alphaTab.d.ts:9169`) but the public `exportAudio()` already wraps it; we don't need to manage workers manually.
- **Cancellation:** the `render()` call is per-chunk, so we naturally cancel by stopping the loop and calling `exporter.destroy()`. We should expose a Cancel button on the Export progress UI.

---

## 3. PDF export

**No native PDF export in alphaTab.** Confirmed by exhaustive grep of `pdf|Pdf|PDF|toPdf|exportPdf` against the .d.ts — zero matches.

The only built-in path is:

```ts
// alphaTab.d.ts:290
print(width?: string, additionalSettings?: unknown): void;
```

`api.print()` opens a new popup window with a print-optimised view (A4, scale 0.8, lazy loading off). The user invokes the OS print dialog from that popup and saves to PDF via the OS "Save as PDF" sink.

### Options for "real" PDF export (decision deferred to brainstorm)

1. **Ship `api.print()` only** — labelled "Print / Save as PDF" — minimal effort, leverages OS-level PDF capture. Cost: doesn't fit FSA save-picker pattern (popup + print dialog instead of file picker).
2. **Stitch SVG → PDF via jsPDF** — render with `engine: 'svg'`, capture all `partialRenderFinished` payloads, assemble pages, convert SVG→canvas via off-screen `<img>`, embed in jsPDF. Cost: extra dep (~50 KB), two-step rasterise, font fidelity risk (parked item #14 — Bravura).
3. **Stitch SVG into one big SVG file (no PDF)** — save as `.svg`. Loses the "vector-PDF" deliverable but is honest and cheap. Could be paired with option 1.
4. **Defer PDF entirely** — ship MIDI + WAV in TAB-010, open TAB-010b for PDF.

The acceptance criterion in `2026-05-02-guitar-tabs-design.md` says "Export to MIDI / WAV / PDF" — option 4 doesn't satisfy it on the surface, but neither does option 1 satisfy it in spirit (the file output is whatever the OS print sink produces, with limited control). Brainstorm decides.

---

## 4. SVG export (bonus — useful for option-2 PDF or as a separate format)

```ts
// alphaTab.d.ts:14305 — RenderFinishedEventArgs
declare class RenderFinishedEventArgs {
  id: string;
  x: number; y: number; width: number; height: number;
  totalWidth: number; totalHeight: number;
  firstMasterBarIndex: number;
  lastMasterBarIndex: number;
  renderResult: unknown;       // ← SVG string when engine === 'svg'
}

// alphaTab.d.ts:2467
readonly postRenderFinished: IEventEmitter;
// Plus the streaming variant on the renderer:
// alphaTab.d.ts:10002 — partialRenderFinished: IEventEmitterOfT<RenderFinishedEventArgs>
```

When `settings.core.engine === 'svg'`, each `partialRenderFinished` event hands us an SVG payload (the partial). To export a single-file SVG of the full score, collect all partials between `renderStarted` and `postRenderFinished` and concatenate into one `<svg viewBox="0 0 totalWidth totalHeight">` wrapper.

### Why this matters for TAB-010

Even if we don't ship SVG export as a user-visible format, it's the building block if option 2 (jsPDF) is chosen for PDF. And: the cost of shipping it as a user-visible format is small (≤ a few hours) once we're capturing the events anyway.

---

## Implications for brainstorm

1. **MIDI + WAV are clean wins** — known APIs, FSA-compatible, modest code. Likely to fit the original 2-day estimate.
2. **PDF is the scope question.** Recommend the brainstorm explicitly choose between (a) "Print → OS save-as-PDF" via `api.print()` for low cost, (b) jsPDF integration for true file-system PDF, or (c) defer PDF, ship MIDI + WAV + SVG. The 2-day estimate likely survives (a) or (c); (b) probably needs +1–2 days.
3. **WAV progress UX is feasible** — chunked render + per-chunk `currentTime / endTime` makes a progress bar trivial. We should design for it (not just a spinner).
4. **Mobile gating** — exports read the source and write a *new* file. The mobile constraint isn't write-to-source; it's whether `showSaveFilePicker` works on mobile Safari (it doesn't reliably) and whether the audio render works without a user gesture. Distinct from TAB-012's `paneReadOnly` gate. Brainstorm decides per format.
5. **Bravura font (#14)** — relevant only if PDF goes via path (a) `api.print()` (the popup needs the font for visual fidelity) or path (b) jsPDF (rasterising SVG needs the font in the document). MIDI + WAV are unaffected.

---

## Verbatim grep evidence

```
$ grep -nEi "pdf|Pdf|PDF|toPdf|exportPdf" node_modules/@coderline/alphatab/dist/alphaTab.d.ts
# (no output)

$ grep -nEi "exportMidi|exportPdf|exportAudio|exportWav|export[A-Z][a-z]+|generateMidi|renderMidi" \
    node_modules/@coderline/alphatab/dist/alphaTab.d.ts
99:    exportAudio(options: AudioExportOptions, midi: MidiFile, syncPoints: BackingTrackSyncPoint[], mainTranspositionPitches: Map<number, number>): IAlphaSynthAudioExporter;
3132:    exportAudio(options: AudioExportOptions): Promise<IAudioExporter>;
3706:declare class AlphaTexExporter extends ScoreExporter {
3709:    exportToString(score: Score, settings?: Settings | null): string;
8286:export declare namespace exporter {
8682:declare class Gp7Exporter extends ScoreExporter {
9035:    render(milliseconds: number): AudioExportChunk | undefined;
9159:    render(milliseconds: number): Promise<AudioExportChunk | undefined>;
14955:    exportFlatSyncPoints(): FlatSyncPoint[];
... (plus MidiFile / MidiFileGenerator / IAudioExporter / etc.)
```

— end of probe.
