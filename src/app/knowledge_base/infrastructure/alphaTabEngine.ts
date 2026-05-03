/**
 * `TabEngine` implementation backed by `@coderline/alphatab`.
 *
 * `mount()` does a dynamic `import()` so the alphatab chunk is pulled in
 * only when the user opens a tab pane.
 *
 * TAB-005 flips `enablePlayer` to `true` and wires the SoundFont URL.
 * Playback methods translate to alphaTab's `play()` / `pause()` / `stop()`
 * / `tickPosition` / `playbackSpeed` / `playbackRange`. Player events
 * (`playerReady`, `playerStateChanged`, `playerPositionChanged`) are
 * re-emitted on the engine's own event bus as `"ready"` / `"played"` /
 * `"paused"` / `"tick"`.
 */
import type {
  BeatRange,
  MountOpts,
  TabEditOp,
  TabEngine,
  TabEvent,
  TabEventHandler,
  TabMetadata,
  TabSession,
  TabSource,
  Unsubscribe,
} from "../domain/tabEngine";
import { SOUNDFONT_URL } from "./alphaTabAssets";

interface AlphaTabSettingsLike {
  player: { enablePlayer: boolean; soundFont: string };
  core: { engine: string; logLevel: number };
}

interface AlphaTabApiLike {
  tex(text: string): void;
  renderTracks(): void;
  renderScore(score: unknown, trackIndexes?: number[]): void;
  destroy(): void;
  play(): boolean;
  pause(): void;
  stop(): void;
  tickPosition: number;
  playbackSpeed: number;
  playbackRange: { startTick: number; endTick: number } | null;
  isLooping: boolean;
  scoreLoaded: { on(handler: (score: unknown) => void): void };
  error: { on(handler: (err: Error) => void): void };
  playerReady: { on(handler: () => void): void };
  playerStateChanged: { on(handler: (args: { state: number; stopped: boolean }) => void): void };
  playerPositionChanged: { on(handler: (args: { currentTick: number; endTick: number; currentTime: number; endTime: number }) => void): void };
}

type AlphaTabApiCtor = new (el: HTMLElement, settings: AlphaTabSettingsLike) => AlphaTabApiLike;

/** Minimal structural shape for alphaTab Note used in applyEdit mutations. */
interface NoteShape {
  fret: number;
  string: number;
  // Technique flags — all optional because they start uninitialised on a fresh Note.
  isHammerPullOrigin?: boolean;
  bendType?: number;
  bendPoints?: Array<{ value: number; offset: number }> | null;
  slideOutType?: number;
  isTieDestination?: boolean;
  isGhost?: boolean;
  vibrato?: number;
  isLetRing?: boolean;
  isPalmMute?: boolean;
  harmonicType?: number;
  // Parent beat reference — alphaTab sets this when the note is added to a beat.
  beat?: BeatShape;
}

/** Minimal structural shape for alphaTab Beat used in applyEdit mutations. */
interface BeatShape {
  duration: number;
  notes: NoteShape[];
  tap?: boolean;
  tremoloSpeed?: number | null;
  addNote(note: NoteShape): void;
  removeNote(note: NoteShape): void;
}

/** Per-technique apply / remove mutators, built once after the dynamic import. */
interface TechniqueMutator {
  apply(note: NoteShape): void;
  remove(note: NoteShape): void;
}

type TechniqueMutatorMap = Record<string, TechniqueMutator>;

/** Minimal structural shape for a MasterBar used in structural ops. */
interface MasterBarShape {
  section: SectionShape | null | undefined;
  tempoAutomations: AutomationShape[];
  index: number;
}

/** Minimal structural shape for a Section marker. */
interface SectionShape {
  text: string;
  marker: string;
}

/** Minimal structural shape for an Automation entry. */
interface AutomationShape {
  type: number;
  value: number;
  isLinear: boolean;
  ratioPosition: number;
}

/** Minimal structural shape for a Bar used in add/remove ops. */
interface BarShape {
  voices: Array<{
    beats: BeatShape[];
    addBeat(beat: BeatShape): void;
  }>;
  addVoice(voice: BarShapeVoice): void;
}

/** Voice shape for constructing new bars. */
interface BarShapeVoice {
  beats: BeatShape[];
  addBeat(beat: BeatShape): void;
}

/** Minimal structural shape for walking a Score to its beats. */
interface ScoreShape {
  masterBars: MasterBarShape[];
  tracks: Array<{
    staves: Array<{
      bars: Array<BarShape>;
    }>;
  }>;
}

/**
 * Build a frozen map of apply/remove mutators for each Technique value.
 * Called once after the alphaTab dynamic import so enum values are available.
 *
 * Bend uses Guitar-Pro scale: 50 = ½-step, 100 = 1 full step.
 * BendPoints = [{offset:0, value:0}, {offset:60, value:50}] for a default ½-step bend.
 *
 * hammer-on and pull-off share `isHammerPullOrigin`; alphaTab resolves the
 * direction from pitch at render time, so a single flag covers both.
 *
 * tremolo and tap are Beat-level properties accessed via `note.beat` because
 * alphaTab's Note model has no tremolo/tap field of its own.
 */
function buildTechniqueMutators(
  enums: {
    BendType: { None: number; Bend: number };
    SlideOutType: { None: number; Shift: number };
    VibratoType: { None: number; Slight: number };
    HarmonicType: { None: number; Natural: number };
    Duration: { Eighth: number; Quarter: number };
  },
  BendPointCtor: new (offset?: number, value?: number) => { offset: number; value: number },
): TechniqueMutatorMap {
  const { BendType, SlideOutType, VibratoType, HarmonicType, Duration } = enums;

  return Object.freeze({
    "hammer-on": {
      apply:  (n) => { n.isHammerPullOrigin = true; },
      remove: (n) => { n.isHammerPullOrigin = false; },
    },
    // pull-off shares isHammerPullOrigin — alphaTab resolves direction from pitch at render.
    "pull-off": {
      apply:  (n) => { n.isHammerPullOrigin = true; },
      remove: (n) => { n.isHammerPullOrigin = false; },
    },
    "bend": {
      apply: (n) => {
        n.bendType = BendType.Bend;
        // Default ½-step bend: Guitar-Pro scale (50 = ½ step, 100 = full step).
        n.bendPoints = [new BendPointCtor(0, 0), new BendPointCtor(60, 50)];
      },
      remove: (n) => {
        n.bendType = BendType.None;
        n.bendPoints = null;
      },
    },
    "slide": {
      apply:  (n) => { n.slideOutType = SlideOutType.Shift; },
      remove: (n) => { n.slideOutType = SlideOutType.None; },
    },
    "tie": {
      apply:  (n) => { n.isTieDestination = true; },
      remove: (n) => { n.isTieDestination = false; },
    },
    "ghost": {
      apply:  (n) => { n.isGhost = true; },
      remove: (n) => { n.isGhost = false; },
    },
    "vibrato": {
      apply:  (n) => { n.vibrato = VibratoType.Slight; },
      remove: (n) => { n.vibrato = VibratoType.None; },
    },
    "let-ring": {
      apply:  (n) => { n.isLetRing = true; },
      remove: (n) => { n.isLetRing = false; },
    },
    "palm-mute": {
      apply:  (n) => { n.isPalmMute = true; },
      remove: (n) => { n.isPalmMute = false; },
    },
    // tremolo is Beat-level in alphaTab (note.beat.tremoloSpeed).
    // Use the deprecated tremoloSpeed setter — simpler than constructing TremoloPickingEffect.
    "tremolo": {
      apply:  (n) => { if (n.beat) n.beat.tremoloSpeed = Duration.Eighth; },
      remove: (n) => { if (n.beat) n.beat.tremoloSpeed = null; },
    },
    // tap is Beat-level in alphaTab (note.beat.tap).
    "tap": {
      apply:  (n) => { if (n.beat) n.beat.tap = true; },
      remove: (n) => { if (n.beat) n.beat.tap = false; },
    },
    "harmonic": {
      apply:  (n) => { n.harmonicType = HarmonicType.Natural; },
      remove: (n) => { n.harmonicType = HarmonicType.None; },
    },
  } satisfies TechniqueMutatorMap);
}

const PLAYBACK_SPEED_MIN = 0.25;
const PLAYBACK_SPEED_MAX = 2.0;

const PLAYER_STATE_PAUSED = 0;
const PLAYER_STATE_PLAYING = 1;

// alphaTab LogLevel.Info (upstream default). Debug=1 was carry-over from
// TAB-004 and was too noisy in the browser console once playback shipped.
const LOG_LEVEL_INFO = 2;

export class AlphaTabEngine implements TabEngine {
  async mount(container: HTMLElement, opts: MountOpts): Promise<TabSession> {
    const mod = await import("@coderline/alphatab");
    const Settings = mod.Settings as new () => AlphaTabSettingsLike;
    const ApiCtor = mod.AlphaTabApi as unknown as AlphaTabApiCtor;
    // Captured so AlphaTabSession can construct new Note instances for set-fret.
    const NoteCtor = mod.model.Note as unknown as new () => NoteShape;
    // Captured for buildTechniqueMutators — enums are part of the lazy chunk.
    const BendPointCtor = mod.model.BendPoint as unknown as new (offset?: number, value?: number) => { offset: number; value: number };
    const enums = {
      BendType:     mod.model.BendType     as { None: number; Bend: number },
      SlideOutType: mod.model.SlideOutType as { None: number; Shift: number },
      VibratoType:  mod.model.VibratoType  as { None: number; Slight: number },
      HarmonicType: mod.model.HarmonicType as { None: number; Natural: number },
      Duration:     mod.model.Duration     as { Eighth: number; Quarter: number },
    };
    const techniqueMutators = buildTechniqueMutators(enums, BendPointCtor);

    // Structural op constructors — captured here so they live inside the lazy chunk.
    const MasterBarCtor  = mod.model.MasterBar  as unknown as new () => MasterBarShape;
    const SectionCtor    = mod.model.Section    as unknown as new () => SectionShape;
    const BarCtor        = mod.model.Bar        as unknown as new () => BarShape;
    const VoiceCtor      = mod.model.Voice      as unknown as new () => BarShapeVoice;
    const BeatCtor       = mod.model.Beat       as unknown as new () => BeatShape;
    const AutomationCtor = mod.model.Automation as unknown as new () => AutomationShape;
    const AutomationType = mod.model.AutomationType as { Tempo: number };
    const DurationEnum   = mod.model.Duration   as { Quarter: number };

    const settings = new Settings();
    settings.player.enablePlayer = true;
    settings.player.soundFont = SOUNDFONT_URL;
    settings.core.logLevel = LOG_LEVEL_INFO;

    const api = new ApiCtor(container, settings);
    const session = new AlphaTabSession(
      api,
      NoteCtor,
      techniqueMutators,
      { MasterBarCtor, SectionCtor, BarCtor, VoiceCtor, BeatCtor, AutomationCtor, AutomationType, DurationEnum },
    );
    if (opts.initialSource) await session.load(opts.initialSource);
    return session;
  }
}

class AlphaTabSession implements TabSession {
  private listeners = new Map<TabEvent, Set<TabEventHandler>>();
  private latestMetadata: TabMetadata | null = null;
  private latestScore: ScoreShape | null = null;
  private disposed = false;

  constructor(
    private api: AlphaTabApiLike,
    private NoteCtor: new () => NoteShape,
    private techniqueMutators: TechniqueMutatorMap,
    private structCtors: {
      MasterBarCtor:  new () => MasterBarShape;
      SectionCtor:    new () => SectionShape;
      BarCtor:        new () => BarShape;
      VoiceCtor:      new () => BarShapeVoice;
      BeatCtor:       new () => BeatShape;
      AutomationCtor: new () => AutomationShape;
      AutomationType: { Tempo: number };
      DurationEnum:   { Quarter: number };
    },
  ) {
    api.scoreLoaded.on((score) => this.handleScoreLoaded(score));
    api.error.on((err) => this.emit({ event: "error", error: err }));
    api.playerReady.on(() => this.emit({ event: "ready" }));
    api.playerStateChanged.on((args) => {
      if (args.state === PLAYER_STATE_PLAYING) {
        this.emit({ event: "played" });
      } else if (args.state === PLAYER_STATE_PAUSED) {
        this.emit({ event: "paused" });
      }
    });
    api.playerPositionChanged.on((args) => {
      this.emit({ event: "tick", beat: args.currentTick });
    });
  }

  async load(source: TabSource): Promise<TabMetadata> {
    if (source.kind !== "alphatex") {
      throw new Error(`AlphaTabEngine only supports alphatex sources in TAB-004; got "${source.kind}"`);
    }
    return new Promise<TabMetadata>((resolve, reject) => {
      const off = this.on("loaded", (payload) => {
        off();
        if (payload.event === "loaded") resolve(payload.metadata);
      });
      const offErr = this.on("error", (payload) => {
        offErr();
        if (payload.event === "error") reject(payload.error);
      });
      this.api.tex(source.text);
    });
  }

  render(): void { this.api.renderTracks(); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.api.destroy();
    this.listeners.clear();
  }

  play(): void { this.api.play(); }
  pause(): void { this.api.pause(); }
  stop(): void { this.api.stop(); }
  seek(beat: number): void { this.api.tickPosition = beat; }

  setTempoFactor(factor: number): void {
    const clamped = Math.max(PLAYBACK_SPEED_MIN, Math.min(PLAYBACK_SPEED_MAX, factor));
    this.api.playbackSpeed = clamped;
  }

  setLoop(range: BeatRange | null): void {
    if (range === null) {
      this.api.playbackRange = null;
      this.api.isLooping = false;
      return;
    }
    this.api.playbackRange = { startTick: range.start, endTick: range.end };
    this.api.isLooping = true;
  }

  setMute(): void { /* TAB-009 multi-track */ }
  setSolo(): void { /* TAB-009 multi-track */ }

  on(event: TabEvent, handler: TabEventHandler): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  private emit(payload: Parameters<TabEventHandler>[0]): void {
    const set = this.listeners.get(payload.event as TabEvent);
    if (!set) return;
    for (const handler of set) handler(payload);
  }

  private handleScoreLoaded(score: unknown): void {
    this.latestScore = score as ScoreShape;
    this.latestMetadata = scoreToMetadata(score);
    this.emit({ event: "loaded", metadata: this.latestMetadata });
  }

  applyEdit(op: TabEditOp): TabMetadata {
    if (this.disposed) throw new Error("Session disposed");
    if (!this.latestScore) throw new Error("No score loaded");

    switch (op.type) {
      case "set-fret":
        this.applySetFret(op);
        break;
      case "set-duration":
        this.applySetDuration(op);
        break;
      case "add-technique":
        this.applyTechnique(op, "apply");
        break;
      case "remove-technique":
        this.applyTechnique(
          op as unknown as Extract<TabEditOp, { type: "add-technique" }>,
          "remove",
        );
        break;
      case "set-tempo":
        this.applySetTempo(op);
        break;
      case "set-section":
        this.applySetSection(op);
        break;
      case "add-bar":
        this.applyAddBar(op);
        break;
      case "remove-bar":
        this.applyRemoveBar(op);
        break;
      default:
        throw new Error(`Unsupported op: ${(op as { type: string }).type}`);
    }

    // Re-derive metadata before renderScore so we can return it synchronously.
    // renderScore will fire scoreLoaded → handleScoreLoaded → emit("loaded").
    // No explicit emit here — that would produce a duplicate loaded event.
    const metadata = scoreToMetadata(this.latestScore);
    this.latestMetadata = metadata;
    this.api.renderScore(this.latestScore);
    return metadata;
  }

  private applySetFret(op: Extract<TabEditOp, { type: "set-fret" }>): void {
    const beat = locateBeat(this.latestScore!, op.beat);
    if (!beat) throw new Error(`Beat ${op.beat} not found`);
    const existing = beat.notes.find((n) => n.string === op.string);
    if (op.fret === null) {
      if (existing) beat.removeNote(existing);
      return;
    }
    if (existing) {
      existing.fret = op.fret;
    } else {
      const note = new this.NoteCtor();
      note.string = op.string;
      note.fret = op.fret;
      beat.addNote(note);
    }
  }

  private applySetDuration(op: Extract<TabEditOp, { type: "set-duration" }>): void {
    const beat = locateBeat(this.latestScore!, op.beat);
    if (!beat) throw new Error(`Beat ${op.beat} not found`);
    // op.duration numeric values match alphaTab's Duration enum values exactly
    // (1=Whole, 2=Half, 4=Quarter, 8=Eighth, 16=Sixteenth, 32=ThirtySecond, 64=SixtyFourth)
    beat.duration = op.duration as unknown as number;
  }

  private applyTechnique(
    op: Extract<TabEditOp, { type: "add-technique" }>,
    mode: "apply" | "remove",
  ): void {
    const beat = locateBeat(this.latestScore!, op.beat);
    if (!beat) throw new Error(`Beat ${op.beat} not found`);
    const note = beat.notes.find((n) => n.string === op.string);
    if (!note) throw new Error(`Note on string ${op.string} at beat ${op.beat} not found`);
    this.techniqueMutators[op.technique][mode](note);
  }

  private applySetTempo(op: Extract<TabEditOp, { type: "set-tempo" }>): void {
    const score = this.latestScore!;
    const barIdx = locateBarIndex(score, op.beat);
    if (barIdx === -1) throw new Error(`Beat ${op.beat} not found`);
    const masterBar = score.masterBars[barIdx];
    // Replace (not push) so repeated calls stay idempotent — one automation per bar.
    // Note: score.tempo is derived from masterBars[0].tempoAutomations[0].value, so
    // setting bar 0 also updates the score-level tempo reflected in metadata.
    const { AutomationCtor, AutomationType } = this.structCtors;
    const automation = new AutomationCtor();
    automation.type = AutomationType.Tempo;
    automation.value = op.bpm;
    automation.isLinear = false;
    automation.ratioPosition = 0;
    masterBar.tempoAutomations = [automation];
  }

  private applySetSection(op: Extract<TabEditOp, { type: "set-section" }>): void {
    const score = this.latestScore!;
    const barIdx = locateBarIndex(score, op.beat);
    if (barIdx === -1) throw new Error(`Beat ${op.beat} not found`);
    const masterBar = score.masterBars[barIdx];
    if (op.name === null) {
      masterBar.section = null;
    } else {
      const { SectionCtor } = this.structCtors;
      const section = new SectionCtor();
      section.text = op.name;
      section.marker = op.name;
      masterBar.section = section;
    }
  }

  private applyAddBar(op: Extract<TabEditOp, { type: "add-bar" }>): void {
    const score = this.latestScore!;
    const barIdx = locateBarIndex(score, op.afterBeat);
    if (barIdx === -1) throw new Error(`Beat ${op.afterBeat} not found`);
    const { MasterBarCtor, BarCtor, VoiceCtor, BeatCtor, DurationEnum } = this.structCtors;

    // Insert a new MasterBar after the targeted bar.
    const newMasterBar = new MasterBarCtor();
    score.masterBars.splice(barIdx + 1, 0, newMasterBar);

    // For every track and every staff, insert a new Bar with one rest Beat.
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        const newBar = new BarCtor();
        const newVoice = new VoiceCtor();
        const newBeat = new BeatCtor();
        // Quarter rest — notes.length === 0 means isRest === true at render time.
        (newBeat as unknown as { duration: number }).duration = DurationEnum.Quarter;
        newVoice.addBeat(newBeat);
        newBar.addVoice(newVoice);
        staff.bars.splice(barIdx + 1, 0, newBar);
      }
    }
  }

  private applyRemoveBar(op: Extract<TabEditOp, { type: "remove-bar" }>): void {
    const score = this.latestScore!;
    if (score.masterBars.length === 1) {
      throw new Error("Cannot remove the only bar in a score");
    }
    const barIdx = locateBarIndex(score, op.beat);
    if (barIdx === -1) throw new Error(`Beat ${op.beat} not found`);

    score.masterBars.splice(barIdx, 1);
    for (const track of score.tracks) {
      for (const staff of track.staves) {
        staff.bars.splice(barIdx, 1);
      }
    }
  }
}

/**
 * Walk tracks[0] → staves[0] → bars and return the zero-based bar index that
 * contains the given global beat index.  Returns -1 if not found.
 * Single-track scope: tracks[0] only.
 */
function locateBarIndex(score: ScoreShape, globalBeatIndex: number): number {
  let counter = 0;
  const bars = score.tracks[0].staves[0].bars;
  for (let i = 0; i < bars.length; i++) {
    const beatCount = bars[i].voices[0].beats.length;
    if (globalBeatIndex < counter + beatCount) return i;
    counter += beatCount;
  }
  return -1;
}

/**
 * Walk tracks[0] → staves[0] → bars → voices[0] → beats and return the beat
 * at the given zero-based global index (across all bars).
 * Single-track scope: tracks[0] only.
 */
function locateBeat(score: ScoreShape, globalBeatIndex: number): BeatShape | null {
  let counter = 0;
  for (const bar of score.tracks[0].staves[0].bars) {
    for (const beat of bar.voices[0].beats) {
      if (counter === globalBeatIndex) return beat;
      counter++;
    }
  }
  return null;
}

function scoreToMetadata(score: unknown): TabMetadata {
  const s = (score && typeof score === "object" ? score : {}) as {
    title?: string;
    artist?: string;
    subtitle?: string;
    tempo?: number;
    tracks?: { name?: string }[];
  };
  return {
    title: s.title ?? "Untitled",
    artist: s.artist,
    subtitle: s.subtitle,
    tempo: typeof s.tempo === "number" ? s.tempo : 120,
    timeSignature: { numerator: 4, denominator: 4 },
    capo: 0,
    tuning: [],
    tracks: (s.tracks ?? []).map((t, i) => ({
      id: String(i),
      name: t.name ?? `Track ${i + 1}`,
      instrument: "guitar",
    })),
    sections: [],
    totalBeats: 0,
    durationSeconds: 0,
  };
}
