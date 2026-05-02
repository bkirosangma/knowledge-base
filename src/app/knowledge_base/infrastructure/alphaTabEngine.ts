/**
 * Real `TabEngine` implementation backed by `@coderline/alphatab`.
 *
 * `mount()` does a dynamic `import()` so the ~1 MB alphatab chunk is
 * pulled in only when the user opens a tab pane — not at app boot. The
 * engine is instantiated synchronously by `useTabEngine` (cheap, just a
 * class), but no alphatab code runs until `mount()`.
 *
 * TAB-004 ships with `enablePlayer = false`: the score renders, no
 * AudioContext is created, no SoundFont is fetched. TAB-005 flips the
 * flag and wires the soundfont URL from `alphaTabAssets.ts`.
 */
import type {
  MountOpts,
  TabEngine,
  TabEvent,
  TabEventHandler,
  TabMetadata,
  TabSession,
  TabSource,
  Unsubscribe,
} from "../domain/tabEngine";

type AlphaTabApiCtor = new (el: HTMLElement, settings: unknown) => AlphaTabApiInstance;
interface AlphaTabApiInstance {
  tex(text: string): void;
  renderTracks(): void;
  destroy(): void;
  scoreLoaded: { on(handler: (score: unknown) => void): void };
  error: { on(handler: (err: Error) => void): void };
}

export class AlphaTabEngine implements TabEngine {
  async mount(container: HTMLElement, opts: MountOpts): Promise<TabSession> {
    const mod = await import("@coderline/alphatab");
    const Settings = mod.Settings as new () => {
      player: { enablePlayer: boolean; soundFont: string };
      core: { engine: string; logLevel: number };
    };
    const ApiCtor = mod.AlphaTabApi as unknown as AlphaTabApiCtor;

    const settings = new Settings();
    settings.player.enablePlayer = false; // TAB-005 flips this.
    settings.core.logLevel = 1;

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

  constructor(private api: AlphaTabApiInstance) {
    api.scoreLoaded.on((score) => this.handleScoreLoaded(score));
    api.error.on((err) => this.emit({ event: "error", error: err }));
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

  // Playback methods — no-ops in TAB-004; TAB-005 wires them.
  play(): void { /* no-op until TAB-005 */ }
  pause(): void { /* no-op until TAB-005 */ }
  stop(): void { /* no-op until TAB-005 */ }
  seek(): void { /* no-op until TAB-005 */ }
  setTempoFactor(): void { /* no-op until TAB-005 */ }
  setLoop(): void { /* no-op until TAB-005 */ }
  setMute(): void { /* no-op until TAB-005 */ }
  setSolo(): void { /* no-op until TAB-005 */ }

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
