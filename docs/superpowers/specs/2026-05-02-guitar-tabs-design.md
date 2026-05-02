# Guitar Tabs — Design Spec

**Date:** 2026-05-02
**Status:** Design approved, ready for implementation plan
**Owner:** TBD
**Reference:** Songsterr-style tab pane (screenshot in conversation)

## Summary

Add Guitar Tabs as a new first-class file type in the knowledge-base vault, alongside `.md` documents and `.json` diagrams. Users can open, render, play, and (in M2) edit guitar tablature inside the app, with cross-references to other vault content (docs, SVGs, diagrams) using the existing wiki-link / attachment graph.

The on-disk format is `.alphatex` — a plain-text DSL parsed by the active rendering engine. The architecture goes through a `TabEngine` interface so the engine implementation can be swapped later without touching consumers.

## Goal

A guitarist or songwriter using this vault as their personal knowledge base can:
- Browse `.alphatex` tab files in the explorer next to their notes and diagrams.
- Open a tab and see Songsterr-style notation with techniques (H, P, bends, slides, ties, ghost notes, let-ring).
- Click play, hear the audio, scrub, loop, change speed, mute tracks, and watch a cursor move through the score.
- Author tabs in-app with click-to-place fret numbers and keyboard-driven note durations + techniques (M2).
- Cross-reference tabs with their music-theory documents and SVG/diagram demonstrations both ways: a tab links to the docs that explain it; the docs surface a backlink to the tab; specific tab sections can have docs explicitly attached as "history" or "theory" notes.

## Scope tier

**(C) Full Songsterr-style** — multi-track, multi-section, dynamics, all standard techniques, MIDI/PDF/audio export, mobile read-only + playback. Decomposed into a viewer (M1) and an editor (M2) ship-point.

## Non-goals

- Guitar Pro 7+ feature parity for exotic notation (microtonal, tablature for instruments other than guitar / bass).
- Live audio input (recording from a real guitar into the tab editor).
- Real-time multi-user collaboration on the same tab.
- Mobile editing (mobile is read-only + playback per the KB-040 stance).
- Auto-transcription from audio files.

## Architecture

### TabEngine interface (domain)

```ts
// src/app/knowledge_base/domain/tabEngine.ts

export interface TabEngine {
  /**
   * Mount a renderer into a host DOM element. Returns a Session that
   * controls a single open tab. Implementations may load assets
   * (worker, SoundFont) lazily on first mount.
   */
  mount(container: HTMLElement, opts: MountOpts): Promise<TabSession>;
}

export interface MountOpts {
  initialSource: TabSource;
  readOnly: boolean;
}

export interface TabSession {
  // Lifecycle
  load(source: TabSource): Promise<TabMetadata>;
  render(opts?: RenderOpts): void;
  dispose(): void;

  // Playback
  play(): void;
  pause(): void;
  stop(): void;
  seek(beat: number): void;
  setTempoFactor(factor: number): void;          // 0.25..2.0
  setLoop(range: BeatRange | null): void;
  setMute(trackId: string, muted: boolean): void;
  setSolo(trackId: string, solo: boolean): void;

  // Events
  on(event: TabEvent, handler: TabEventHandler): Unsubscribe;

  // Edit (optional capability — engines without an editor throw on call)
  applyEdit?(op: TabEditOp): TabMetadata;
}

export type TabSource =
  | { kind: "alphatex"; text: string }
  | { kind: "gp"; bytes: Uint8Array }
  | { kind: "json"; data: TabDocument };  // reserved for a future custom format

export type TabEvent =
  | "ready"
  | "loaded"
  | "tick"        // emits current beat during playback
  | "played"
  | "paused"
  | "error";

export type TabEditOp =
  | { type: "set-fret"; beat: number; string: number; fret: number | null }
  | { type: "set-duration"; beat: number; duration: NoteDuration }
  | { type: "add-technique"; beat: number; string: number; technique: Technique }
  | { type: "remove-technique"; beat: number; string: number; technique: Technique }
  | { type: "set-tempo"; beat: number; bpm: number }
  | { type: "set-section"; beat: number; name: string | null }
  | { type: "add-bar"; afterBeat: number }
  | { type: "remove-bar"; beat: number }
  | { type: "set-track-tuning"; trackId: string; tuning: string[] }
  | { type: "set-track-capo"; trackId: string; fret: number };

export interface TabMetadata {
  title: string;
  artist?: string;
  subtitle?: string;
  tempo: number;
  key?: string;
  timeSignature: { numerator: number; denominator: number };
  capo: number;
  tuning: string[];          // scientific pitch low→high
  tracks: { id: string; name: string; instrument: string }[];
  sections: { name: string; startBeat: number }[];
  totalBeats: number;
  durationSeconds: number;
}

export type Technique =
  | "hammer-on" | "pull-off" | "bend" | "slide" | "tie"
  | "ghost"     | "vibrato"  | "let-ring" | "palm-mute"
  | "tremolo"   | "tap"      | "harmonic";

export type NoteDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64;
```

### AlphaTab implementation (infrastructure)

```ts
// src/app/knowledge_base/infrastructure/alphaTabEngine.ts

import type { TabEngine, TabSession } from "../domain/tabEngine";

export class AlphaTabEngine implements TabEngine {
  async mount(container: HTMLElement, opts: MountOpts): Promise<TabSession> {
    const { AlphaTabApi, Settings } = await import("@coderline/alphatab");
    const settings = new Settings();
    settings.player.enablePlayer = true;
    settings.player.soundFont = "/soundfonts/sonivox.sf2";
    settings.player.scrollMode = "Continuous";
    const api = new AlphaTabApi(container, settings);

    return new AlphaTabSession(api);
  }
}

class AlphaTabSession implements TabSession {
  // ...wraps alphaTab API. applyEdit serializes our cached AST back to
  // alphaTex and calls api.tex(text), which re-parses + re-renders.
}
```

A future `VexFlowToneEngine` or `CustomJsonEngine` implements the same `TabEngine` interface; nothing else changes.

### Boundary sketch

```
src/app/knowledge_base/
  domain/
    tabEngine.ts                  ─ interface (above), no impl
    repositories.ts               ─ + TabRepository: read/write .alphatex
  infrastructure/
    alphaTabEngine.ts             ─ AlphaTabEngine implements TabEngine
    alphaTabAssets.ts             ─ asset URLs (worker, soundfont)
    tabRepo.ts                    ─ TabRepository implementation (FSA-based)
  features/tab/
    TabView.tsx                   ─ pane shell, owns session lifecycle
    TabToolbar.tsx                ─ play/pause, scrub, speed, loop, mute/solo
    TabProperties.tsx             ─ tuning/capo/key/tempo/sections/dynamics
    components/
      TabCanvas.tsx               ─ thin wrapper around session.mount(ref)
      DocumentsSection.tsx        ─ reuse existing component for attachments
    hooks/
      useTabEngine.ts             ─ instantiates TabEngine, manages session
      useTabPlayback.ts           ─ play state, tick subscription, scrubbing
      useTabContent.ts            ─ load/save .alphatex via TabRepository
    state/
      TabContext.tsx              ─ session + dispatch surface
    utils/
      alphatexMetadata.ts         ─ parse/write the % kb-meta block
  shell/
    PaneManager.tsx               ─ + "tab" pane type wiring
    RepositoryContext.tsx         ─ + tabEngine injection slot
```

Consumers (`TabView`, hooks) only know `TabEngine` and `TabRepository`. The implementation lives behind `useRepositories().tabEngine` — same dependency-inversion the project already uses for `documentRepository` / `diagramRepository`.

## Data flow

### Open sequence (M1)

```
explorer click(file.alphatex)
  ↓
PaneManager.openFile(path, "tab")
  ↓
<TabView filePath/>
  ↓ mount
useTabEngine() → import("./infrastructure/alphaTabEngine") → new AlphaTabEngine()
  ↓
TabRepository.read(path) → string
  ↓
session.load({ kind: "alphatex", text })
  ↓ "loaded" event
TabView renders the canvas; toolbar enables; properties panel reads metadata
```

### Playback tick

```
toolbar play()
  → session.play()
  → AudioContext resume (user-gesture gated; iOS / Safari quirk)
  → engine streams audio + emits "tick" with current beat
  ↓
useTabPlayback subscribes "tick" → setState(currentBeat)
  ↓
The red playhead in the canvas is owned by alphaTab itself; we just observe
```

### Edit sequence (M2)

```
user clicks string 3, types "5"
  ↓ TabEditor reducer: { type: "set-fret", beat, string: 3, fret: 5 }
  ↓
session.applyEdit(op)
  ↓
AlphaTabEngine: mutate cached AST → re-serialize alphaTex → load back into engine
  ↓ returns new metadata
TabContext: bump dirty flag, push to history, debounced TabRepository.write()
  ↓ file-watcher subscriber reloads content for the OTHER pane if same file is open there
```

## Failure modes

| Failure | Surface |
|---|---|
| `AudioContext` blocked (no user gesture yet) | Inline toast "Tap play to enable audio". Engine fires an error; we catch and message. |
| SoundFont download stalls | Loading state on the play button until `"ready"` event. Service worker cache-first lane caches the file after the first successful load. |
| Source parse failure (malformed alphaTex / corrupt `.gp`) | `ShellErrorBanner` via `useShellErrors().reportError` — same path repos use today. |
| External file change while dirty | Reuse `ConflictBanner` — the file-watcher signal is the same as docs/diagrams use. |
| Engine module fails to lazy-load | `TabView` renders an inline error pane with "Reload" button; mirrors the pattern `GraphView` uses for force-graph load failures. |

## Persistence

`TabRepository` mirrors `DocumentRepository` exactly so the existing draft/conflict/save plumbing works unchanged:

```ts
export interface TabRepository {
  read(path: string): Promise<string>;             // throws FileSystemError
  write(path: string, content: string): Promise<void>;
}
```

Drafts go to `localStorage["kb-draft:tab:<path>"]`; conflict resolution reuses `ConflictBanner`. Multi-byte safety is the same as `.md` files.

## File format

### Canonical form: `.alphatex`

The alphaTex DSL has a built-in metadata header. We prepend a small `// kb-meta` comment block at the top for vault-specific cross-reference data the renderer ignores (alphaTex uses `//` for line comments, so the block survives parsing):

```alphatex
// kb-meta
// references: [[major-scale-shapes]] [[picking-pattern.svg]] [[song-history.md]]
// generated-by: knowledge-base/guitar-tabs    (only when AI-generated)
// generated-at: 2026-05-02T18:30:00Z

\title "Intro Riff"
\subtitle "demo"
\artist "Me"
\tempo 79
\key Gmaj
\time 4/4
\track "Guitar"
\tuning C#1 F#1 C#2 F#2 A#2 C#3
\capo 0
.
\section "Intro"
:8 7.6 8.6 5.6 |
0.5 0.5 7.5 5.5 5.5 |
...
```

### Import: `.gp` (Guitar Pro 3–7)

Drag-drop a `.gp` file into the explorer (or palette command "Import Guitar Pro file…"). The engine parses it natively; we save back as `.alphatex` and the `.gp` is not retained.

### Reserved: `.tab.json`

Reserved by the `TabSource.kind = "json"` variant. No implementation in M1 or M2 — kept open so a future `CustomJsonEngine` can slot in without breaking the interface.

## Mobile (KB-040 stance)

Read-only + playback only:

- **Files tab:** `.alphatex` files visible alongside docs and diagrams.
- **Read tab:** `TabView` mounts in `readOnly` mode. Toolbar shows play/pause/loop/scrub; the editor surface is dropped from the bundle (`next/dynamic` lazy import only on desktop).
- **Properties panel:** sections + tuning shown read-only.
- No `Create new tab` button on mobile (matches `.md` / `.json` mobile gating).

## Cross-references between tabs and other vault content

Two existing app-level mechanisms cover this. Both extend to tabs without a schema migration.

### Outbound: wiki-links from tabs to anything

The `// references:` line in the alphaTex metadata block carries `[[…]]` tokens. `useLinkIndex` gets a parser entry for `.alphatex` that scrapes the same regex it uses for `.md` from any line beginning with `//`.

Outcome:
- Wiki-links open targets in the opposite pane (existing `handleNavigateWikiLink`).
- The graph view (KB-005.4) shows tab → doc / svg / diagram edges automatically.
- Backlinks surface in the target's properties panel ("Tabs that reference this diagram").

### Inbound: doc attachments to tab entities

The existing `DocumentMeta.attachedTo: { type: string; id: string }[]` already accepts arbitrary `type` strings and `useDocuments.attachDocument(docPath, entityType, entityId)` is generic. Tab-flavoured entity types slot in:

| Entity type | Anchor | Use case |
|---|---|---|
| `"tab"` | the whole file | "history of this song", "production notes" |
| `"tab-section"` | a section label (id is a deterministic kebab-case slug of the `\section "…"` name; e.g. `"Verse 1"` → `"verse-1"`) | "music theory behind the intro chord movement" |
| `"tab-track"` | a track id (M2, multi-track only) | "lead-guitar tone settings" |
| `"tab-bar"` | bar number (M3, niche) | "this bend is the V→I resolution" |

The tab properties panel mounts `DocumentsSection` (already used by diagrams) twice:

```
Tab Properties
  ├─ Tuning / Capo / Key / Tempo
  ├─ Sections
  │     • Intro  [📎 Attach doc] [📎 Attach SVG / diagram]   ◄─ section-level
  │       └─ References (2)
  │            • intro-theory.md       [open]
  │            • intro-shape.svg       [open]
  │     • Verse 1  …
  ├─ Tracks (M2)
  │     • Guitar  [📎 …]
  └─ Whole-file references (3)                              ◄─ tab-level
       • song-history.md
       • producer-notes.md
       • chord-tree.json   (wiki-link backlink, not attached)
```

Each "References" list merges:
- Explicit attachments via `getDocumentReferences("tab" | "tab-section" | "tab-track", id)` — same helper diagrams use today.
- Wiki-link backlinks via `linkManager.getBacklinksFor(filePath)`.

### SVG / diagram → tab attachments (deferred)

Today, only `.md` documents have an `attachedTo` list. SVGs and diagrams attach to tabs via wiki-links from the tab metadata block. Promoting SVG/diagram to first-class attachers requires giving them their own `attachedTo` field, which crosses repo + schema lines unrelated to tabs and is intentionally out of scope. The doc-anchored pattern covers the common case ("a doc with an embedded SVG attached to the tab section").

## Vault search

`searchManager` (KB-010) reindexes on save. Tabs add a new `kind`:

```ts
searchManager.addDoc(path, "tab", {
  title, artist, key,
  tuning: tuning.join(" "),
  tracks: tracks.map((t) => t.name).join(", "),
  body: lyrics                          // when an alphaTex \lyrics directive is present
});
```

Hits open the file in the tab pane.

## Bundle and asset story

- **alphaTab core**: ~1 MB gzip → lazy-loaded via `next/dynamic({ ssr: false })`, same pattern `react-force-graph` uses for the graph view. Zero impact on doc/diagram bundle.
- **SoundFont**: ~6 MB FluidR3 General-MIDI subset, hosted in `public/soundfonts/`. Service worker cache-first lane (extended from KB-044 to cover `/soundfonts/*`) serves it offline after first download.
- **Web Worker**: alphaTab's audio worker is a separate JS bundle, also under `public/`. SW precache adds it on install.

## Theme

Dark-mode follows the project's existing convention: chrome (toolbar, properties panel, conflict banner) uses design tokens (`bg-surface`, `border-line`, `text-mute`, `text-accent`). The alphaTab canvas itself reads its own colour settings; we configure them from `useObservedTheme()` so the score's background, staff lines, and note glyphs flip on `⌘⇧L` without a refresh — the same observer hook the diagram nodes already use.

## Phasing (one-PR-per-ticket aligned)

| # | Title | Effort | Depends |
|---|---|---|---|
| **TAB-001** | Domain interfaces (`TabEngine`, `TabSession`, `TabRepository`) + `@coderline/alphatab` dependency added | 1 day | — |
| **TAB-002** | Tab pane plumbing — `tab` `PaneType`, file extension routing in `handleSelectFile`, palette command stubs | 1 day | TAB-001 |
| **TAB-003** | `TabRepository` (FSA implementation) + draft / file-watcher integration | 2 days | TAB-001 |
| **TAB-004** | `TabView` + lazy-mounted `AlphaTabEngine`, renders alphaTex from disk | 3 days | TAB-002, TAB-003 |
| **TAB-005** | Playback chrome — play/pause, scrub, loop, speed, count-in, dark-mode aware | 2 days | TAB-004 |
| **TAB-006** | `.gp` import → save-as `.alphatex` (drag-drop into explorer + palette command) | 1 day | TAB-004 |
| **TAB-007** | Properties panel — tuning, capo, key, tempo, sections, per-track mute/solo (read-only metadata view) | 2 days | TAB-004 |
| **TAB-007a** | Tab properties: whole-file + section attachments via `DocumentsSection`, wiki-link parsing for the alphaTex `%` metadata block, link-index integration | 2 days | TAB-007, TAB-011 |
| **TAB-008** | Editor v1 — click-to-place fret, type-to-set-fret, keyboard shortcuts for durations, techniques toolbar (H/P/bend/slide/tie/ghost/let-ring), undo/redo through `applyEdit` | ~2 weeks | TAB-007 |
| **TAB-009** | Multi-track + multi-voice editing, track add/remove, per-track tuning + capo | 1 week | TAB-008 |
| **TAB-009a** | Track-level attachment surface (slots into multi-track ticket) | 1 day | TAB-009 |
| **TAB-010** | Export — MIDI, WAV, PDF (alphaTab APIs) | 2 days | TAB-008 |
| **TAB-011** | Vault search + wiki-link integration (titles, tunings, lyrics) | 1 day | TAB-004 |
| **TAB-012** | Mobile read-only + playback (per the KB-040 mobile stance) | 2 days | TAB-005 |

Two ship-points:

- **M1 (Viewer)** = TAB-001 → TAB-007 + TAB-007a + TAB-011 + TAB-012. ~2 weeks. Open + play + tune + import + cross-reference. No editing.
- **M2 (Editor)** = + TAB-008 → TAB-010. ~3 more weeks.

M1 is the natural pause-and-evaluate boundary — get user signal on the engine + UX before sinking time into the editor.

## Testing strategy

- **Unit (vitest):** `alphaTabEngine.test.ts` against a fake `alphaTab` mock — verifies `load → render → events` plumbing without touching real audio. `TabEditOp` apply / undo round-trips at the AST level. `tabRepo.test.ts` mirrors `documentRepo.test.ts`. Target: ~30 tests.
- **Component (vitest + RTL):** `TabView.test.tsx` mocks `TabEngine` to a stub that emits canned events; asserts toolbar wiring, properties panel, conflict banner integration. ~15 tests.
- **e2e (Playwright):** `e2e/tab.spec.ts` drives a Playwright vault with one `.alphatex` fixture: open → canvas mounts → click play → cursor moves → click pause → cursor stops. Audio assertion is "AudioContext was created", not actual sound (Playwright can't verify audio).
- **Manual ceiling:** real audio playback + iOS-gesture gate verified in DevTools per the existing `feedback_preview_verification_limits.md` memory.

## Working agreements check

- **One PR per ticket** → already phased into TAB-001..TAB-012.
- **Tests live with code** → unit + component beside files; e2e in `e2e/`.
- **Prose specs are sources of truth** → new `test-cases/11-tabs.md` lands BEFORE TAB-004 (the first user-visible ticket); IDs `TAB-X.Y-NN` follow the existing convention.
- **Don't break documented strengths** → `TabEngine` interface preserves the domain/infra boundary; `.alphatex` is text so per-vault scoping + design tokens + file watcher all continue to work; tabs get their own bridge type so Bridge ISP isn't violated.

## Open questions

1. Which alphaTab version pin? Currently `1.6.x`; check release cadence before locking.
2. Where does the SoundFont live — bundled in `public/`, lazy-fetched from a CDN, or first-fetch + SW cache? Default to `public/` for offline-by-default behaviour.
3. Should TAB-008's editor support a "raw alphaTex" power-user mode (text editor on the metadata block) alongside the click-to-place UI? Recommended: defer to M3 if asked.
4. Multi-instrument scope (bass, drums, piano) at M2, or guitar-only? Recommended: guitar-only at M2; bass + drums at M3.

## Risks

- **alphaTab bundle size** (~1 MB): mitigated by lazy-load (same pattern as graph view).
- **SoundFont weight** (~6 MB): mitigated by SW cache-first lane; first play has a one-time download.
- **Web Audio + iOS interaction policy**: needs a user gesture before audio starts; surfaced as an inline message on first play attempt without gesture.
- **Editor scope creep**: TAB-008 is two weeks if scoped tightly; cap features by reference to the screenshot's notation set + reject anything not in it.
- **CI audio testing**: not feasible. Manual + integration tests are the ceiling.
- **Engine abandonment**: alphaTab has been actively maintained for 7+ years. The interface boundary insulates us if that ever changes.

## Decision: format `.alphatex` over `.gp` and over `.tab.json`

`.alphatex` was chosen for the canonical on-disk format because:

- **Diff-friendly text** preserves the vault's git-versionable + searchable + wiki-link-able properties (same as `.md`).
- **Engine-native** so we don't write a parser or renderer for M1 — alphaTab handles both.
- **Hand-editable** for power users.
- **Lossless within scope** — alphaTex covers every notation feature in the screenshot; GP-7 exotic features fall outside our non-goals.
- **Cheap fallback** to `.gp` import (alphaTab parses `.gp3-7` natively) without making `.gp` the canonical store.

The `TabEngine` interface keeps the door open to a custom `.tab.json` format later — `TabSource.kind = "json"` is reserved for that path.

## Acceptance for M1 ship

- Open an `.alphatex` file from the explorer → canvas renders within 2s on a mid-tier laptop.
- Press play → audio starts (after first user gesture) and the playhead moves through the score.
- Pause / scrub / loop / speed all work.
- Close and re-open the pane → state preserved (selection, scroll position not in scope; just file content).
- Toggle ⌘⇧L → toolbar, properties panel, and canvas all flip to dark mode without refresh.
- Mobile: open + playback work; create button absent; no editor surface in the bundle.
- Tab-pane file appears in vault search results; wiki-links from `[[…]]` references resolve to docs/svgs/diagrams.
- Doc attached to a tab section shows up in the tab's Properties panel, and the doc's properties panel surfaces a "Tabs that reference this" backlink.

## Acceptance for M2 ship

- Click any string at any beat → fret input opens; type a number → note placed.
- Keyboard shortcuts set duration (`1` whole … `6` 32nd) and toggle techniques (H, P, B, S, T, ~, P-M, L-R).
- Undo/redo across `applyEdit` operations.
- Multi-track: add track, mute/solo per track, set per-track tuning + capo.
- Export to MIDI / WAV / PDF.

---

_End of design spec. Implementation plan to follow via `superpowers:writing-plans`._
