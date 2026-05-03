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

    const settings = new Settings();
    settings.player.enablePlayer = true;
    settings.player.soundFont = SOUNDFONT_URL;
    settings.core.logLevel = LOG_LEVEL_INFO;

    const api = new ApiCtor(container, settings);
    const session = new AlphaTabSession(api);
    if (opts.initialSource) await session.load(opts.initialSource);
    return session;
  }
}

class AlphaTabSession implements TabSession {
  private listeners = new Map<TabEvent, Set<TabEventHandler>>();
  private latestMetadata: TabMetadata | null = null;
  private disposed = false;

  constructor(private api: AlphaTabApiLike) {
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
    this.latestMetadata = scoreToMetadata(score);
    this.emit({ event: "loaded", metadata: this.latestMetadata });
  }
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
