// src/app/knowledge_base/domain/tabEngine.ts
/**
 * Domain-layer interfaces for guitar-tab rendering and editing engines.
 *
 * The `TabEngine` interface lets consumers (`TabView`, hooks) depend on a
 * contract rather than a concrete renderer; the AlphaTab implementation
 * lives in `infrastructure/alphaTabEngine.ts` (TAB-004) and a future
 * `VexFlowToneEngine` or `CustomJsonEngine` slots in without touching
 * consumers.
 *
 * Source of truth: docs/superpowers/specs/2026-05-02-guitar-tabs-design.md
 */

export interface TabEngine {
  /**
   * Mount a renderer into a host DOM element. Returns a Session that
   * controls a single open tab. Implementations may load assets
   * (worker, SoundFont) lazily on first mount.
   */
  mount(container: HTMLElement, opts: MountOpts): Promise<TabSession>;
}

export interface MountOpts {
  /**
   * Optional. When provided, `mount` calls `session.load(initialSource)` before
   * resolving. Tests that need to inject a parsed Score directly into a fake API
   * (jsdom can't render alphaTab's canvas) mount without an initial source and
   * call `session.load()` manually afterwards.
   */
  initialSource?: TabSource;
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

  /** Optional capability — engines without an editor throw on call. */
  applyEdit?(op: TabEditOp): TabMetadata;

  /** The last loaded/edited score object; null before first load. */
  readonly score?: unknown | null;

  /** Set muted/soloed track state (TAB-009 T8 implements this). */
  setPlaybackState(state: {
    mutedTrackIds: string[];
    soloedTrackIds: string[];
  }): void;

  /**
   * Export the current score as a Standard MIDI File (SMF) binary.
   * Defaults to MultiTrack (SMF Type 1) when format is omitted.
   * Throws if no score has been loaded yet.
   */
  exportMidi(format?: TabMidiFileFormat): Uint8Array;
}

/**
 * Standard MIDI File format selector — mirrors alphaTab's `MidiFileFormat` enum.
 * - `SingleTrackMultiChannel` (0): SMF Type 0 — all tracks merged into one.
 * - `MultiTrack`              (1): SMF Type 1 — one track per instrument (default).
 */
export enum TabMidiFileFormat {
  SingleTrackMultiChannel = 0,
  MultiTrack = 1,
}

export interface RenderOpts {
  /** Force a re-layout (e.g. after a container resize). */
  reflow?: boolean;
}

export interface BeatRange {
  start: number;
  end: number;
}

export type TabSource =
  | { kind: "alphatex"; text: string }
  | { kind: "gp"; bytes: Uint8Array }
  | { kind: "json"; data: TabDocument };

export type TabEvent =
  | "ready"
  | "loaded"
  | "tick"
  | "played"
  | "paused"
  | "error";

export type TabEventHandler = (payload: TabEventPayload) => void;
export type Unsubscribe = () => void;

export type TabEventPayload =
  | { event: "ready" }
  | { event: "loaded"; metadata: TabMetadata }
  | { event: "tick"; beat: number }
  | { event: "played" }
  | { event: "paused" }
  | { event: "error"; error: Error };

export interface CursorLocation {
  trackIndex: number;
  voiceIndex: 0 | 1;   // multi-voice support (TAB-009)
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

export interface TabMetadata {
  title: string;
  artist?: string;
  subtitle?: string;
  tempo: number;
  key?: string;
  timeSignature: { numerator: number; denominator: number };
  // NOTE: top-level capo + tuning removed in TAB-009 — now per-track below
  tracks: {
    id: string;                       // positional — String(track.index)
    name: string;
    instrument: "guitar" | "bass";    // narrowed from string
    /** Scientific pitch low → high (e.g. ["E2", "A2", "D3", "G3", "B3", "E4"]). */
    tuning: string[];                 // moved here from top-level
    capo: number;                     // moved here from top-level
  }[];
  sections: { name: string; startBeat: number }[];
  totalBeats: number;
  durationSeconds: number;
}

/**
 * Reserved for the `TabSource.kind = "json"` future custom format. Empty
 * surface for now — kept so the interface compiles without a bare type ref.
 */
export interface TabDocument {
  version: 1;
}

export type Technique =
  | "hammer-on" | "pull-off" | "bend" | "slide" | "tie"
  | "ghost"     | "vibrato"  | "let-ring" | "palm-mute"
  | "tremolo"   | "tap"      | "harmonic";

export type NoteDuration = 1 | 2 | 4 | 8 | 16 | 32 | 64;

/**
 * Pure function: derive a kebab-case slug from a tab section name.
 * Used as the stable id portion of `tab-section` entity references.
 *
 * Rules: lowercase, strip diacritics to ASCII, collapse non-alphanumeric
 * runs to a single hyphen, trim leading/trailing hyphens. Empty / all-
 * punctuation input returns the literal "section" so callers always get
 * a non-empty id (collisions are then resolved by `getSectionIds`).
 */
export function slugifySectionName(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Derive deterministic, collision-free section ids from `TabMetadata.sections`.
 * Output array is 1:1 with input. Duplicate slugs receive `-2`, `-3`, …
 * suffixes in order of appearance — stable across re-runs given identical
 * input.
 */
export function getSectionIds(sections: { name: string }[]): string[] {
  const counts = new Map<string, number>();
  return sections.map((s) => {
    const base = slugifySectionName(s.name);
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}
