# TAB-010 — Guitar Tabs Export (MIDI / WAV / PDF) — Design Spec

**Date:** 2026-05-04
**Branch:** `plan/guitar-tabs-export`
**Ticket:** TAB-010 (final M2 item)
**Verification:** [`docs/superpowers/plans/2026-05-04-guitar-tabs-export-verification.md`](../plans/2026-05-04-guitar-tabs-export-verification.md)
**Spec source:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](2026-05-02-guitar-tabs-design.md) → "Acceptance for M2 ship" (the export bullet)

---

## Goal

Close the M2 (editor) ship-point by giving users three ways to get their tab content out of the app:

- **MIDI** — share/play in any DAW or tab tool.
- **WAV** — share an audio rendering, no app required to listen.
- **PDF** — printable engraving for offline reading or score-sharing.

All three flow from APIs alphaTab already exposes (or, for PDF, the only path it offers — `api.print()`). The acceptance criterion in the M2 spec reads "Export to MIDI / WAV / PDF"; this design lands MIDI + WAV via the existing FSA save-picker flow and PDF via `api.print()` (popup → OS save-as-PDF).

## Non-goals

- jsPDF / SVG composition for direct file-system PDF write — deferred to TAB-010b if a user trips on the print-dialog flow.
- Per-export track-picker dialog — deferred; per-format defaults below cover the common cases.
- Streaming partial-SVG single-file export — deferred.
- Mobile export support — mobile is read-only + playback only (TAB-012 stance).
- Worker-mode audio export — `IAudioExporterWorker` exists but `api.exportAudio()` already wraps it; we don't need to drive workers manually.

## Architecture

### Layered overview

```
┌────────────────────────────────────────────────────────────────────┐
│  knowledgeBase.tsx (above provider)                                │
│   ├─ palette: tabs.export-midi / tabs.export-wav / tabs.export-pdf │
│   └─ each command takes session+repo as prop, gated on paneReadOnly│
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  features/tab/hooks/useTabExport.ts (below provider)               │
│   ├─ exportMidi() / exportWav() / exportPdf()                      │
│   ├─ owns FSA showSaveFilePicker calls + filename derivation       │
│   ├─ owns AbortController + wavState progress UI state             │
│   └─ reports errors via useShellError() + classifyError            │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  features/tab/properties/ExportSection.tsx                          │
│   └─ three buttons; WAV row morphs into progress + cancel during   │
│      render; whole sub-section hidden when paneReadOnly            │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  infrastructure/alphaTabEngine.ts — TabSession (extended)          │
│   ├─ exportMidi(format?: MidiFileFormat): Uint8Array               │
│   ├─ exportAudio({ onProgress, signal, sampleRate? }):             │
│   │      Promise<Uint8Array>  (PCM-WAV bytes)                      │
│   └─ exportPdf(): void  (wraps api.print())                        │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│  domain/wavEncoder.ts — pure utility                               │
│   └─ encodeWav(chunks: Float32Array[], sampleRate, channels):      │
│        Uint8Array  (RIFF/WAVE/fmt /data, 16-bit PCM)               │
└────────────────────────────────────────────────────────────────────┘
```

### File map

| Path | Purpose | New / Edit |
|---|---|---|
| `domain/wavEncoder.ts` | Pure Float32 → 16-bit PCM WAV encoder | New |
| `domain/wavEncoder.test.ts` | Header bytes, sample conversion, edge cases | New |
| `infrastructure/alphaTabEngine.ts` | Add three export methods on `TabSession` | Edit |
| `infrastructure/alphaTabEngine.export.test.ts` | Engine-level export plumbing tests | New |
| `features/tab/hooks/useTabExport.ts` | Hook wiring engine → FSA → ShellErrorContext | New |
| `features/tab/hooks/useTabExport.test.tsx` | Hook unit tests (FSA mock, abort, error reporting) | New |
| `features/tab/properties/ExportSection.tsx` | The three Export buttons + progress row | New |
| `features/tab/properties/ExportSection.test.tsx` | Visibility, click→method, progress, cancel | New |
| `features/tab/properties/TabProperties.tsx` | Mount `<ExportSection>` after the existing sub-sections | Edit |
| `features/tab/TabView.tsx` | Inject `paneReadOnly` into `<ExportSection>` | Edit |
| `knowledgeBase.tsx` | Register `tabs.export-midi/wav/pdf` palette commands | Edit |
| `knowledgeBase.tabRouting.helper.tsx` | Add export callables to `TabPaneContext` if needed | Edit (likely tiny) |
| `Features.md` §11 | New "Export" sub-section | Edit |
| `test-cases/11-tabs.md` §11.11 | New section with ~8 export cases | Edit |

## Components

### `domain/wavEncoder.ts`

```ts
export function encodeWav(
  chunks: Float32Array[],
  sampleRate: number,
  channels: number,
): Uint8Array;
```

- Concatenates chunks lazily (no re-copy if possible — single typed-array allocation).
- Converts Float32 in [−1, 1] → Int16 PCM with `Math.max(-1, Math.min(1, s)) * 0x7fff`.
- Writes the standard 44-byte RIFF/WAVE/fmt /data header.
- Channel layout: interleaved samples assumed (alphaTab returns interleaved — verify at impl time; if planar, interleave here).

**Pure function. No DOM. No alphaTab. Easy to unit-test.**

### `infrastructure/alphaTabEngine.ts` — `TabSession` additions

```ts
interface TabSession {
  // … existing methods (load, play, pause, seek, applyEdit, setPlaybackState, …)

  /** Synchronous MIDI export. Default: SMF Type 1 (multi-track). */
  exportMidi(format?: MidiFileFormat): Uint8Array;

  /** Asynchronous WAV export. Loops chunked render → encodes → returns bytes. */
  exportAudio(opts: ExportAudioOptions): Promise<Uint8Array>;

  /** Opens alphaTab's print popup. No return. */
  exportPdf(): void;
}

export interface ExportAudioOptions {
  /** Called on each rendered chunk with progress in milliseconds. */
  onProgress?: (progress: { currentTime: number; endTime: number }) => void;
  /** Aborts the render loop. Calls IAudioExporter.destroy() on abort. */
  signal?: AbortSignal;
  /** Output sample rate (default 44100). */
  sampleRate?: number;
}
```

Behavior:

- **`exportMidi`** — `score = api.score`; if null, throw a typed error. Build `MidiFile` + `AlphaSynthMidiFileHandler(midiFile, /*smf1Mode*/ true)` + `MidiFileGenerator(score, settings, handler)` → `generator.generate()` → return `midiFile.toBinary()`. SMF1 is the safest interop default; `format` parameter lets callers pick `SingleTrackMultiChannel` if they need it.
- **`exportAudio`** — translate current `playbackState.mutedTrackIds` and `soloedTrackIds` into `AudioExportOptions.trackVolume` (muted → 0; if any soloed, all non-soloed → 0; else all → 1). Pass the bundled SoundFont (already loaded into the synth) — let alphaTab use the active synth's SoundFont rather than re-loading. Loop:
  ```ts
  const exporter = await api.exportAudio({ sampleRate, trackVolume });
  const chunks: Float32Array[] = [];
  let lastProgress = 0;
  while (!signal?.aborted) {
    const chunk = await exporter.render(1000);
    if (!chunk) break;
    chunks.push(chunk.samples);
    onProgress?.({ currentTime: chunk.currentTime, endTime: chunk.endTime });
  }
  exporter.destroy();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const channels = /* derived from synth output, default 2 (stereo) — verify at impl time */;
  return encodeWav(chunks, sampleRate ?? 44100, channels);
  ```
- **`exportPdf`** — `api.print()` (no width/settings overrides for v1; popup uses A4 default). If `api.print` is missing (e.g., test stub), no-op silently.

### `features/tab/hooks/useTabExport.ts`

Below the provider; consumes `useRepositories().tab` for the `TabRepository` and `useShellError()` for error reporting.

```ts
type WavPhase = 'idle' | 'rendering' | 'saving';

interface WavState {
  phase: WavPhase;
  progress: { currentTime: number; endTime: number } | null;
  cancel: () => void;
}

export function useTabExport(args: {
  session: TabSession | null;
  filePath: string | null;          // active tab path → suggested filename base
  paneReadOnly: boolean;             // mobile gate; export ops are no-ops if true
}): {
  exportMidi: () => Promise<void>;
  exportWav: () => Promise<void>;
  exportPdf: () => void;
  wavState: WavState;
  exportingMidi: boolean;            // disables Export-MIDI button while in flight
};
```

Flow:

- Suggested filename: derive a base via `deriveExportBaseName(filePath)` — take the last path segment, strip a trailing `.alphatex` suffix if present, return `'tab'` when `filePath` is null. Suffix is appended per format: `.mid`, `.wav`, `.pdf`. (`deriveExportBaseName` lives next to the hook and is its own tiny pure-function unit, easy to test.)
- `exportMidi`:
  ```ts
  if (!session || paneReadOnly) return;
  setExportingMidi(true);
  try {
    const bytes = session.exportMidi();
    const handle = await window.showSaveFilePicker({
      suggestedName: `${base}.mid`,
      types: [{ description: 'MIDI', accept: { 'audio/midi': ['.mid', '.midi'] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  } catch (e) {
    if (isAbortError(e)) return; // user cancelled the picker
    shell.report({ context: 'Export MIDI', error: classifyError(e) });
  } finally {
    setExportingMidi(false);
  }
  ```
- `exportWav` mirrors that flow but wraps the loop with `wavState`:
  - `phase='rendering'` while loop runs; `progress` updates on each chunk.
  - `phase='saving'` after the loop completes; FSA picker + write happens here.
  - `cancel` calls `controller.abort()`; the engine throws `AbortError` which we catch and reset to `idle`.
- `exportPdf`:
  ```ts
  if (!session || paneReadOnly) return;
  try { session.exportPdf(); }
  catch (e) { shell.report({ context: 'Export PDF', error: classifyError(e) }); }
  ```

### `features/tab/properties/ExportSection.tsx`

```tsx
interface ExportSectionProps {
  exportMidi: () => Promise<void>;
  exportWav: () => Promise<void>;
  exportPdf: () => void;
  wavState: WavState;
  exportingMidi: boolean;
  paneReadOnly: boolean;
}

export function ExportSection(props: ExportSectionProps) {
  if (props.paneReadOnly) return null;
  // … three buttons; WAV row replaced with <WavProgressRow> while phase !== 'idle'
}
```

- Heading: "Export" (matches the existing `<TabPropertiesSubsection>` shell).
- Body: vertical flex of three rows.
  - **MIDI row**: `<button onClick={exportMidi} disabled={exportingMidi || wavState.phase !== 'idle'}>Export MIDI</button>`
  - **WAV row**: `<button onClick={exportWav} disabled={…}>Export WAV</button>` swapped for `<WavProgressRow progress={…} onCancel={wavState.cancel} />` while `phase !== 'idle'`. The progress row shows: "Rendering audio… 12s / 95s" + a `<progress>` bar + a Cancel button. During `phase='saving'`: "Saving…" with no Cancel.
  - **PDF row**: `<button onClick={exportPdf}>Print or Save as PDF</button>` (label clarifies the OS-print-dialog flow).
- Disabled-button rule: any export in flight disables the others to prevent overlapping side effects.

### `knowledgeBase.tsx` — palette commands

Mirrors `tabs.import-gp` registration. Three commands:

```ts
useRegisterCommands([
  {
    id: 'tabs.export-midi',
    title: 'Export tab as MIDI',
    when: () => activeTabSession != null && !mobilePaneReadOnly,
    run: () => activeTabExport?.exportMidi(),
  },
  // … export-wav, export-pdf
]);
```

**Wiring strategy** (concrete — picks one, not "decide at impl time"):

Mirror the existing **doc-bridge ref pattern** already in `knowledgeBase.tsx` (`leftDocBridgeRef` / `rightDocBridgeRef`). `useTabExport` lives **inside `TabView`** (below the provider) where it has direct access to `session` from `useTabEngine`. `KnowledgeBaseInner` declares a `tabExportRef = useRef<TabExportHandle | null>(null)` for each pane side and passes it down via `TabPaneContext` as `onTabExportReady?: (handle: TabExportHandle | null) => void`. `TabView` calls that callback on mount and on cleanup; the parent stashes the handle in the ref. Palette commands read the active pane's ref to dispatch.

`TabExportHandle` shape:
```ts
interface TabExportHandle {
  exportMidi: () => Promise<void>;
  exportWav: () => Promise<void>;
  exportPdf: () => void;
  paneReadOnly: boolean;
}
```

UI state (`wavState`, `exportingMidi`) stays inside `TabView` and flows down via React state — `<ExportSection>` consumes them as props from `TabProperties`. The progress UI is local to the pane that invoked the export; this also means each pane has its own concurrent export state (correct behavior for split-pane setups).

This pattern: zero new contexts, no React context for transient state, mirrors the doc-bridge ref already used by `KnowledgeBaseInner`, keeps `useTabEngine` in its current home.

## Data flow

### MIDI

1. User clicks Export MIDI (or runs palette command).
2. Hook: `bytes = session.exportMidi()`.
3. Hook: `handle = await showSaveFilePicker(...)`. User picks `<base>.mid`.
4. Hook: `await writable.write(bytes); await writable.close()`.
5. Done. No success toast (matches TAB-006 import — silent success).

### WAV

1. User clicks Export WAV.
2. Hook: instantiate `AbortController`, set `wavState.phase='rendering'`.
3. Hook: `bytes = await session.exportAudio({ onProgress, signal })`.
4. Each chunk: `wavState.progress` updates → `<WavProgressRow>` re-renders.
5. Loop completes → `wavState.phase='saving'` → FSA picker → write → close.
6. Reset `wavState` to `idle`. Done.
7. Cancel branch: user clicks Cancel → `controller.abort()` → engine throws AbortError → hook catches silently → reset to `idle`.

### PDF

1. User clicks Print or Save as PDF.
2. Hook: `session.exportPdf()` → `api.print()` opens popup.
3. User uses OS print dialog → "Save as PDF" → done. (We don't track completion.)

## Per-format track scope

- **MIDI**: all tracks (notation invariant — exporting only some tracks would silently lose information).
- **WAV**: respects current editor `mutedTrackIds`/`soloedTrackIds` via `AudioExportOptions.trackVolume`. Rationale: WAV represents what the user *hears*, and the user has set those flags during playback specifically to control what they hear.
- **PDF**: all tracks (engraving invariant — the printed score is the full piece).

This per-format coherence is intentional and documented in the spec; do not unify into "always all" or "always M/S" — each format does what its medium implies.

## Mobile gate

- `paneReadOnly` flows in via `TabPaneContext` (TAB-012 wiring). Mobile detection isn't done here; we trust the upstream injector.
- `ExportSection` returns `null` when `paneReadOnly === true`.
- Palette commands' `when` predicate checks the same flag → not invocable from ⌘P on mobile.
- Test cases include both surfaces (panel hidden + palette unavailable) for mobile.

## Error surfacing

- All errors flow through `useShellError().report({ context, error })` with `classifyError`.
- Contexts: `'Export MIDI'`, `'Export WAV'`, `'Export PDF'`.
- User-cancelled FSA picker (AbortError on `showSaveFilePicker`) is **silent** — not an error.
- WAV cancel via our AbortController is **silent** — not an error.
- File-write errors (permission denied, quota exceeded) classified normally.
- PDF popup-blocked (rare; alphaTab opens a same-origin popup which is usually allowed) → silent for v1; revisit if a user trips on it (parked-item candidate).

## Parked-item interaction

- **#14 Bravura font 404** — relevant for PDF. The print popup loads alphaTab's chunked Bravura font; if the dev server doesn't serve `/font/...`, glyphs render as squares. Production may already work via Next.js bundling — verify in dev as a small task within TAB-010. If broken: copy `node_modules/@coderline/alphatab/dist/font/Bravura.{woff2,woff,otf,svg,eot}` → `public/font/`, set `settings.core.fontDirectory = '/font/'` in `alphaTabEngine.ts`. Affects PDF only; MIDI + WAV are unaffected.

## Test plan

### Unit (Vitest)

- `wavEncoder.test.ts` (~6 cases):
  - 44-byte RIFF/WAVE/fmt /data header bytes correct.
  - Float32 [−1, 1] → Int16 conversion correct (boundary samples 1.0 → 0x7fff, −1.0 → 0x8000).
  - Multi-channel interleaving correct.
  - Empty input produces a valid (empty-data) WAV.
  - Sample rate written little-endian.
  - byteRate / blockAlign computed correctly.

- `alphaTabEngine.export.test.ts` (~8 cases):
  - `exportMidi()` returns a Uint8Array of non-zero length (mock alphaTab MidiFileGenerator).
  - `exportMidi(format)` passes format through to `MidiFile`.
  - `exportAudio` calls `api.exportAudio`, loops `render`, accumulates chunks, encodes, returns bytes.
  - `exportAudio` invokes `onProgress` per chunk with the chunk's `currentTime` / `endTime`.
  - `exportAudio` aborts on signal: `exporter.destroy()` called, function rejects with AbortError.
  - `exportAudio` translates `mutedTrackIds` → `trackVolume[i] = 0`.
  - `exportAudio` translates `soloedTrackIds` → other tracks `trackVolume[i] = 0`.
  - `exportPdf()` calls `api.print()`.

### Hook (Vitest + RTL)

- `useTabExport.test.tsx` (~8 cases):
  - `exportMidi`: calls session method, calls FSA picker with correct suggestedName, writes bytes, closes writable.
  - `exportMidi` no-ops when `paneReadOnly === true`.
  - `exportMidi`: AbortError from picker is silent.
  - `exportMidi`: write error → `shell.report({ context: 'Export MIDI', ... })`.
  - `exportWav`: phase transitions `idle → rendering → saving → idle` across the lifecycle.
  - `exportWav`: `cancel()` aborts the controller; phase resets to `idle`; no banner.
  - `exportWav`: error from `session.exportAudio` (non-Abort) → reported.
  - `exportPdf`: calls session method; no-ops when `paneReadOnly`.

### Component (Vitest + RTL)

- `ExportSection.test.tsx` (~6 cases):
  - Renders three buttons when `paneReadOnly === false`.
  - Returns null when `paneReadOnly === true`.
  - Click MIDI button → calls `exportMidi`.
  - Click WAV button → calls `exportWav`.
  - WAV row swaps to progress UI when `wavState.phase !== 'idle'`; shows current/end time text + `<progress>` + Cancel.
  - Cancel button click → calls `wavState.cancel`.
  - All export buttons disabled while any export is in flight.

### Cross-reference (existing files)

- `TabView.test.tsx` — extend to assert `<ExportSection>` mount + `paneReadOnly` prop wiring.
- `knowledgeBase.test.tsx` — extend to assert palette command registration + `when` predicate behavior under mobile.

### e2e (deferred)

- WAV: requires audio context + SoundFont in headless Chromium → unreliable; defer per existing TAB-005 ceiling.
- MIDI: technically feasible (no audio), but FSA `showSaveFilePicker` requires a custom Playwright shim. Defer to a follow-up if ever needed.
- PDF: `api.print()` opens a popup; Playwright can detect popup; deferred — popup contents won't render Bravura without font asset wiring.

### test-cases/11-tabs.md §11.11 (new section, ~8 cases)

```
## §11.11 Export

11.11-01 Export MIDI: click Export MIDI button → FSA picker opens with `<base>.mid` → user accepts → file is written and a valid SMF1 multi-track MIDI.
11.11-02 Export MIDI: palette command `tabs.export-midi` runs the same flow.
11.11-03 Export WAV: click Export WAV → progress row appears → progress increments → save picker opens with `<base>.wav` → file is written as 16-bit PCM WAV.
11.11-04 Export WAV cancel: click Cancel during render → progress row disappears → no file written → no error banner.
11.11-05 Export WAV M/S scope: with one track muted, exported WAV has that track's audio at zero amplitude in the corresponding region.
11.11-06 Export PDF: click Print or Save as PDF → alphaTab popup opens with the score laid out for A4.
11.11-07 Mobile gating: on a mobile pane (paneReadOnly), the Export sub-section is absent and palette commands are not available.
11.11-08 FSA picker cancel: user dismisses the save dialog mid-export → no error banner; UI returns to idle.
```

## Effort estimate

- T0 verification probe: ✅ done.
- Brainstorm + spec: ~half a day (this work).
- Engine methods + wavEncoder + tests: ~half a day.
- Hook + ExportSection + tests: ~half a day.
- Palette wiring + mobile gate + cross-reference tests: ~quarter day.
- `Features.md` + `test-cases/11-tabs.md`: ~quarter day.
- Self-review + code-reviewer + PR: ~half a day.

**Total: ~2 days, matches the original estimate.**

## Risks

- **Float32 channel layout assumption** — if alphaTab returns planar (LLLL…RRRR…) instead of interleaved (LRLRLR…), `encodeWav` needs to interleave. Verify at impl time by inspecting one rendered chunk; either path is ~5 lines. Doesn't change the design.
- **Track index ↔ MIDI track numbering** — `AudioExportOptions.trackVolume` is keyed by track index; alphaTab's `score.tracks[i].index` is the source of truth. TAB-009 verified `Track.index` is positional and stable within a session, which is exactly what we need here. No new identity-stability concern.
- **PDF popup-blocked silent failure** — if a user has aggressive pop-up blocking, `api.print()` does nothing visible. Acceptable for v1 as we have no users yet; revisit if it surfaces.
- **WAV bytes for a long song** — a 5-minute stereo 44.1kHz WAV is ~50 MB. We accumulate the full byte array in memory before writing. Acceptable for our use case (single-user vault, songs of 1-5 min). Could stream to FSA writable in a future iteration.

## Out of scope (TAB-010b candidates)

- jsPDF / SVG-rasterise PDF for true file-system PDF write.
- Track picker dialog before export (multi-track selective export).
- Streaming partial-SVG → single SVG file export.
- Worker-mode WAV render to keep the UI thread fully smooth (likely unnecessary; Float32 chunks are small).
- Sample-rate / bit-depth options in the UI (default 44.1k 16-bit covers the use case).
- Export progress in the title bar / pane title.
- Print dialog blocked-by-browser detection + recovery.

— end of design spec.
