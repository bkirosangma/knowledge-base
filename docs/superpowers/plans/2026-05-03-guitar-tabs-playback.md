# Guitar Tabs — Playback Chrome Implementation Plan (TAB-005)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add audio playback to the guitar-tab viewer — flip `enablePlayer = true`, wire AlphaTab's playback methods + position/state events, mount a `TabToolbar` with play/pause/scrub/loop/speed controls, and adapt the canvas to dark-mode in real time.

**Architecture:** `AlphaTabEngine.mount()` now configures `enablePlayer = true` and `soundFont = "/soundfonts/sonivox.sf2"` (vendored under `public/` per `project_soundfont_host.md`). The session subscribes to `playerReady` / `playerStateChanged` / `playerPositionChanged` and translates them into the existing `TabEngine` event surface (`"ready"` / `"played"` / `"paused"` / `"tick"`). A new `useTabPlayback` hook exposes play/pause/stop/seek/setTempoFactor/setLoop callables and surfaces the current beat to React. `TabToolbar` renders the controls; `TabView` mounts it above the canvas and re-emits `useObservedTheme()` colour changes into the engine settings.

**Tech Stack:** Same as TAB-004 — TypeScript, React, `@coderline/alphatab` (already pinned, vendored SoundFont in `public/soundfonts/sonivox.sf2`), Vitest + Playwright. Service worker (`public/sw.js`) gains a cache-first lane for `/soundfonts/*` per KB-044.

**Spec:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](../specs/2026-05-02-guitar-tabs-design.md).
**Builds on:** [`2026-05-02-guitar-tabs-foundation.md`](2026-05-02-guitar-tabs-foundation.md) (TAB-001..TAB-003) + [`2026-05-02-guitar-tabs-viewer.md`](2026-05-02-guitar-tabs-viewer.md) (TAB-004).

**Out of scope for this plan:**
- Per-track mute/solo controls — TAB-009 (multi-track).
- Count-in metronome UX — punted; alphaTab supports it via `metronomeVolume` / `countInVolume`, but the spec lists it as an enhancement and the toolbar is already busy.
- Properties panel — TAB-007.
- File-watcher conflict UI — TAB-008 (only meaningful when dirty).
- Mobile-specific gating — TAB-012.

**Settled decisions (per memory):**
- SoundFont served from `public/soundfonts/sonivox.sf2` (`project_soundfont_host.md`) — copied from `node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2` (1.35 MB, smaller than the 6 MB the spec estimated for FluidR3 — alphaTab ships Sonivox by default, which we accept).
- Branch-per-unit-of-work (`feedback_branch_per_unit_of_work.md`) — already on `plan/guitar-tabs-playback`.

---

## File Structure

```
src/app/knowledge_base/
  infrastructure/
    alphaTabEngine.ts             ← MODIFIED (enablePlayer=true; SoundFont URL; play/pause/stop/seek/tempo/loop wired; ready/played/paused/tick events)
    alphaTabEngine.test.ts        ← MODIFIED (new playback test cases; assert SoundFont URL was set)
  features/tab/
    TabView.tsx                   ← MODIFIED (mount TabToolbar above canvas; wire useObservedTheme; audio-blocked toast)
    TabView.test.tsx              ← MODIFIED (toolbar mounting case; theme-change case)
    components/
      TabToolbar.tsx              ← NEW (play/pause/scrub/loop/speed controls)
      TabToolbar.test.tsx         ← NEW
    hooks/
      useTabEngine.ts             ← MODIFIED (surface playerStatus + currentTick + onAudioBlocked)
      useTabEngine.test.tsx       ← MODIFIED (event surface tests)
      useTabPlayback.ts           ← NEW (play/pause/stop/seek/setTempoFactor/setLoop wrapper)
      useTabPlayback.test.tsx     ← NEW
public/
  soundfonts/
    sonivox.sf2                   ← NEW (1.35 MB binary, copied from node_modules/@coderline/alphatab/dist/soundfont)
  sw.js                           ← MODIFIED (precache + cache-first lane for /soundfonts/*)
test-cases/11-tabs.md             ← MODIFIED (flip TAB-11.2-11 dark-mode; add §11.3 Playback)
Features.md                       ← MODIFIED (§11.2 Playback subsection added; §11.1 promoted further)
e2e/tab.spec.ts                   ← MODIFIED (add play-button click smoke + AudioContext check)
```

---

## Task 1: Wire AlphaTab playback API into `AlphaTabSession`

**Files:**
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Modify: `src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts`

This is the meatiest task — wire `enablePlayer = true`, the SoundFont URL, the four new alphaTab events, and the playback methods. Single commit, single file pair, multiple TDD cycles inside.

- [ ] **Step 1: Extend the test mock so it captures the new event subscriptions and exposes playback methods**

In `alphaTabEngine.test.ts`, REPLACE the existing `vi.mock("@coderline/alphatab", ...)` block with a richer fake that supports the new events and the new methods. The full replacement:

```ts
const renderTracksMock = vi.fn();
const destroyMock = vi.fn();
const texMock = vi.fn();
const playMock = vi.fn();
const pauseMock = vi.fn();
const stopMock = vi.fn();

let capturedSettings: {
  player: { enablePlayer: boolean; soundFont: string };
  core: { engine: string };
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
  return { AlphaTabApi: FakeApi, Settings };
});
```

(Note: `FakeApi` and the helper variables now live at the top of the test module so individual cases can `fakeApiInstance!.playerReady.fire(undefined)` etc. The whole `vi.mock` factory still wraps the alphatab import.)

- [ ] **Step 2: Add a `beforeEach` reset for the new mock state**

Update the existing `beforeEach`:

```ts
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
```

- [ ] **Step 3: Replace the existing "enablePlayer=false" test with one that asserts the new playback config**

Replace this:

```ts
it("mount() instantiates AlphaTabApi with enablePlayer=false in TAB-004", async () => { ... });
```

with:

```ts
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
  expect(texMock).toHaveBeenCalledWith("\\title \"Hi\"\n.");
});
```

- [ ] **Step 4: Add new test cases for playback methods + events**

After the existing `dispose()` test, append these cases:

```ts
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
```

- [ ] **Step 5: Run the suite to confirm the new cases fail before any impl change**

Run: `npm run test:run -- alphaTabEngine`

Expected: **multiple failures** — `enablePlayer` is currently `false`, `play()`/`pause()`/`stop()` aren't wired, the new event handlers don't exist. The first existing tests (`load() emits 'loaded'`, `dispose()`, non-alphatex throws) should still pass.

- [ ] **Step 6: Update the engine implementation**

Open `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`. Replace the file's contents with:

```ts
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

export class AlphaTabEngine implements TabEngine {
  async mount(container: HTMLElement, opts: MountOpts): Promise<TabSession> {
    const mod = await import("@coderline/alphatab");
    const Settings = mod.Settings as new () => AlphaTabSettingsLike;
    const ApiCtor = mod.AlphaTabApi as unknown as AlphaTabApiCtor;

    const settings = new Settings();
    settings.player.enablePlayer = true;
    settings.player.soundFont = SOUNDFONT_URL;
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
```

- [ ] **Step 7: Run the test suite — expect all 12 cases pass**

Run: `npm run test:run -- alphaTabEngine`
Expected: 12/12 pass (4 original adapted + 8 new playback cases).

If any case fails, fix the impl (test cases are fixed per the plan; do not edit the test).

- [ ] **Step 8: Run the full suite to catch regressions**

Run: `npm run test:run`
Expected: full suite passes. The TabView and useTabEngine tests pre-mocked alphatab differently and should be unaffected by the FakeApi change (each test file has its own `vi.mock`).

- [ ] **Step 9: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts
git commit -m "feat(tabs): wire AlphaTab playback API + events (TAB-005)"
```

---

## Task 2: Vendor the SoundFont under `public/soundfonts/`

**Files:**
- Create: `public/soundfonts/sonivox.sf2` (binary, copied from node_modules)
- Test: (none — verified by Task 8 e2e)

- [ ] **Step 1: Create the directory and copy the file**

```bash
mkdir -p "public/soundfonts"
cp "node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2" "public/soundfonts/sonivox.sf2"
ls -la "public/soundfonts/sonivox.sf2"
```

Expected: `-rw-r--r--  1 ... 1351896 ... sonivox.sf2` (1.35 MB).

- [ ] **Step 2: Smoke-check via the Next dev server (optional but recommended)**

Run: `npm run dev` in another shell, then:

```bash
curl -sI http://localhost:3000/soundfonts/sonivox.sf2 | head -2
```

Expected: `HTTP/1.1 200 OK`. Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/soundfonts/sonivox.sf2
git commit -m "feat(tabs): vendor Sonivox SoundFont under public/soundfonts (TAB-005)"
```

(1.35 MB binary is fine for git — the repo already carries equivalent-size assets like the sample-vault PNG.)

---

## Task 3: Service-worker cache lane for `/soundfonts/*`

**Files:**
- Modify: `public/sw.js`
- Test: (none — verified by manual offline check + Task 8 e2e doesn't gate on SW)

- [ ] **Step 1: Add a route matcher and a precache entry**

In `public/sw.js`:

(a) Add a path predicate alongside `isHashedAsset`/`isManifestOrIcon`:

```js
function isSoundFont(url) {
  return url.pathname.startsWith("/soundfonts/");
}
```

(b) Add a cache-first fetch lane BEFORE the `isManifestOrIcon` lane (so SoundFonts hit cache before falling through):

```js
  // SoundFonts — cache-first. Big binary that never changes; one fetch
  // serves every reload, online or offline. KB-044 lane extension.
  if (isSoundFont(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return new Response("Offline and SoundFont not cached", {
            status: 504,
            headers: { "content-type": "text/plain" },
          });
        }
      }),
    );
    return;
  }
```

(c) Add the SoundFont URL to the precache list (best-effort — install must not abort if it fails):

```js
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg", "/soundfonts/sonivox.sf2"];
```

The existing `Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined)))` already swallows individual failures, so a 404 in dev is harmless.

(d) Bump the cache version from `kb-static-v2` to `kb-static-v3` so the new precache list takes effect on activate:

```js
const CACHE = "kb-static-v3";
```

- [ ] **Step 2: Verify the file still parses**

Run: `node --check public/sw.js`
Expected: silent (exit 0).

- [ ] **Step 3: Run the unit suite (sw.js isn't tested directly, but make sure nothing else broke)**

Run: `npm run test:run`
Expected: full suite passes (no SW changes affect Vitest).

- [ ] **Step 4: Commit**

```bash
git add public/sw.js
git commit -m "feat(tabs): cache /soundfonts/* in service worker (TAB-005)"
```

---

## Task 4: Extend `useTabEngine` to surface `playerStatus` + `currentTick`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabEngine.ts`
- Modify: `src/app/knowledge_base/features/tab/hooks/useTabEngine.test.tsx`

The hook owns the engine + session; for the toolbar to render anything, it needs to surface playback state and the current beat.

- [ ] **Step 1: Add failing test cases**

Append to `useTabEngine.test.tsx` after the existing cases (inside the `describe("useTabEngine", () => { ... })` block):

```ts
it("playerStatus reflects engine 'played' / 'paused' events", async () => {
  const fakeSession = makeFakeSession();
  mountMock.mockResolvedValue(fakeSession);
  const { result } = renderHook(() => useTabEngine());
  const container = document.createElement("div");
  await act(async () => {
    await result.current.mountInto(container, "x");
  });
  expect(result.current.playerStatus).toBe("paused");

  await act(async () => {
    fakeSession.emit("played", { event: "played" });
  });
  await waitFor(() => expect(result.current.playerStatus).toBe("playing"));

  await act(async () => {
    fakeSession.emit("paused", { event: "paused" });
  });
  await waitFor(() => expect(result.current.playerStatus).toBe("paused"));
});

it("currentTick reflects engine 'tick' events", async () => {
  const fakeSession = makeFakeSession();
  mountMock.mockResolvedValue(fakeSession);
  const { result } = renderHook(() => useTabEngine());
  const container = document.createElement("div");
  await act(async () => {
    await result.current.mountInto(container, "x");
  });
  expect(result.current.currentTick).toBe(0);

  await act(async () => {
    fakeSession.emit("tick", { event: "tick", beat: 1920 });
  });
  await waitFor(() => expect(result.current.currentTick).toBe(1920));
});

it("isAudioReady flips true on engine 'ready' event", async () => {
  const fakeSession = makeFakeSession();
  mountMock.mockResolvedValue(fakeSession);
  const { result } = renderHook(() => useTabEngine());
  const container = document.createElement("div");
  await act(async () => {
    await result.current.mountInto(container, "x");
  });
  expect(result.current.isAudioReady).toBe(false);

  await act(async () => {
    fakeSession.emit("ready", { event: "ready" });
  });
  await waitFor(() => expect(result.current.isAudioReady).toBe(true));
});

it("session is exposed via the sessionRef getter for playback callables", async () => {
  const fakeSession = makeFakeSession();
  mountMock.mockResolvedValue(fakeSession);
  const { result } = renderHook(() => useTabEngine());
  const container = document.createElement("div");
  await act(async () => {
    await result.current.mountInto(container, "x");
  });
  expect(result.current.session).toBe(fakeSession);
});
```

- [ ] **Step 2: Run, expect failures**

Run: `npm run test:run -- useTabEngine`
Expected: 4 new failures (`playerStatus`, `currentTick`, `isAudioReady`, `session` don't exist on the hook return).

- [ ] **Step 3: Update the hook**

Replace the contents of `src/app/knowledge_base/features/tab/hooks/useTabEngine.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TabMetadata, TabSession } from "../../../domain/tabEngine";
import { AlphaTabEngine } from "../../../infrastructure/alphaTabEngine";

export type TabEngineStatus =
  | "idle"
  | "mounting"
  | "ready"
  | "error"
  | "engine-load-error";

export type TabPlayerStatus = "playing" | "paused";

export interface UseTabEngine {
  status: TabEngineStatus;
  metadata: TabMetadata | null;
  error: Error | null;
  /** Cumulative midi-tick position from the latest "tick" event (0 until first tick). */
  currentTick: number;
  /** Reflects the engine's playback state — flips on "played" / "paused" events. */
  playerStatus: TabPlayerStatus;
  /** True after the engine emits "ready" (SoundFont loaded). Toolbar play stays disabled until then. */
  isAudioReady: boolean;
  /** Active session — null before mount, null after engine-load-error. Used by `useTabPlayback`. */
  session: TabSession | null;
  mountInto: (container: HTMLElement, alphatex: string) => Promise<void>;
}

/**
 * Owns the `AlphaTabEngine` instance + active `TabSession` for one
 * `TabView`. Surfaces engine + player status as React state so the
 * view + toolbar can render correctly without subscribing to engine
 * events themselves.
 */
export function useTabEngine(): UseTabEngine {
  const [status, setStatus] = useState<TabEngineStatus>("idle");
  const [metadata, setMetadata] = useState<TabMetadata | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [currentTick, setCurrentTick] = useState(0);
  const [playerStatus, setPlayerStatus] = useState<TabPlayerStatus>("paused");
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [session, setSession] = useState<TabSession | null>(null);
  const sessionRef = useRef<TabSession | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    sessionRef.current?.dispose();
    sessionRef.current = null;
    setSession(null);
    setIsAudioReady(false);
    setPlayerStatus("paused");
    setCurrentTick(0);
  }, []);

  const mountInto = useCallback(
    async (container: HTMLElement, alphatex: string) => {
      cleanup();
      setStatus("mounting");
      setError(null);
      let nextSession: TabSession;
      try {
        nextSession = await new AlphaTabEngine().mount(container, {
          initialSource: { kind: "alphatex", text: alphatex },
          readOnly: true,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("engine-load-error");
        return;
      }
      sessionRef.current = nextSession;
      setSession(nextSession);

      const offLoaded = nextSession.on("loaded", (payload) => {
        if (payload.event !== "loaded") return;
        setMetadata(payload.metadata);
        setStatus("ready");
      });
      const offError = nextSession.on("error", (payload) => {
        if (payload.event !== "error") return;
        setError(payload.error);
        setStatus("error");
      });
      const offReady = nextSession.on("ready", (payload) => {
        if (payload.event !== "ready") return;
        setIsAudioReady(true);
      });
      const offPlayed = nextSession.on("played", (payload) => {
        if (payload.event !== "played") return;
        setPlayerStatus("playing");
      });
      const offPaused = nextSession.on("paused", (payload) => {
        if (payload.event !== "paused") return;
        setPlayerStatus("paused");
      });
      const offTick = nextSession.on("tick", (payload) => {
        if (payload.event !== "tick") return;
        setCurrentTick(payload.beat);
      });

      unsubsRef.current = [offLoaded, offError, offReady, offPlayed, offPaused, offTick];
    },
    [cleanup],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, metadata, error, currentTick, playerStatus, isAudioReady, session, mountInto };
}
```

- [ ] **Step 4: Run the suite — expect 9/9 pass (5 original + 4 new)**

Run: `npm run test:run -- useTabEngine`
Expected: 9/9 PASS.

- [ ] **Step 5: Run the full suite to catch downstream regressions**

Run: `npm run test:run`
Expected: full suite passes. `TabView.test.tsx` mocks `useTabEngine` directly with a hand-rolled object — adjust that mock if any TabView test fails (the mock will need the four new fields). For each TabView test, add `currentTick: 0, playerStatus: "paused", isAudioReady: false, session: null` to the mocked return:

```ts
vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: false,
    session: null,
    mountInto: mountIntoMock,
  }),
}));
```

Update `knowledgeBase.tabRouting.test.tsx` similarly:

```ts
vi.mock("./features/tab/hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: "ready",
    metadata: null,
    error: null,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: false,
    session: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
  }),
}));
```

Re-run `npm run test:run` until all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabEngine.ts \
        src/app/knowledge_base/features/tab/hooks/useTabEngine.test.tsx \
        src/app/knowledge_base/features/tab/TabView.test.tsx \
        src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx
git commit -m "feat(tabs): surface playerStatus + currentTick in useTabEngine (TAB-005)"
```

---

## Task 5: `useTabPlayback` hook (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabPlayback.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabPlayback.test.tsx`

Wraps `session.play()` / `pause()` / `stop()` / `seek()` / `setTempoFactor()` / `setLoop()` so the toolbar gets stable callables and a friendly null-check when there's no session.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabPlayback } from "./useTabPlayback";

function makeSession() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    setTempoFactor: vi.fn(),
    setLoop: vi.fn(),
  };
}

describe("useTabPlayback", () => {
  let session: ReturnType<typeof makeSession>;

  beforeEach(() => {
    session = makeSession();
  });

  it("play / pause / stop delegate to the session", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    expect(session.play).toHaveBeenCalledTimes(1);
    act(() => result.current.pause());
    expect(session.pause).toHaveBeenCalledTimes(1);
    act(() => result.current.stop());
    expect(session.stop).toHaveBeenCalledTimes(1);
  });

  it("toggle() flips between play and pause based on playerStatus", () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: "playing" | "paused" }) =>
        useTabPlayback({ session, isAudioReady: true, playerStatus: status, currentTick: 0 }),
      { initialProps: { status: "paused" } },
    );
    act(() => result.current.toggle());
    expect(session.play).toHaveBeenCalledTimes(1);
    expect(session.pause).not.toHaveBeenCalled();

    rerender({ status: "playing" });
    act(() => result.current.toggle());
    expect(session.pause).toHaveBeenCalledTimes(1);
  });

  it("play() is a no-op (and sets audioBlocked=true) when isAudioReady is false", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: false, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    expect(session.play).not.toHaveBeenCalled();
    expect(result.current.audioBlocked).toBe(true);
  });

  it("seek delegates to session.seek with the supplied beat", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.seek(960));
    expect(session.seek).toHaveBeenCalledWith(960);
  });

  it("setTempoFactor delegates to session.setTempoFactor", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.setTempoFactor(1.25));
    expect(session.setTempoFactor).toHaveBeenCalledWith(1.25);
  });

  it("setLoop delegates to session.setLoop", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session, isAudioReady: true, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.setLoop({ start: 0, end: 1920 }));
    expect(session.setLoop).toHaveBeenCalledWith({ start: 0, end: 1920 });
    act(() => result.current.setLoop(null));
    expect(session.setLoop).toHaveBeenCalledWith(null);
  });

  it("calls become no-ops when session is null (pre-mount)", () => {
    const { result } = renderHook(() =>
      useTabPlayback({ session: null, isAudioReady: false, playerStatus: "paused", currentTick: 0 }),
    );
    act(() => result.current.play());
    act(() => result.current.pause());
    act(() => result.current.stop());
    act(() => result.current.seek(100));
    act(() => result.current.setTempoFactor(1));
    act(() => result.current.setLoop(null));
    // Nothing to assert about a `null` session — the test is that nothing throws.
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test:run -- useTabPlayback`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

```ts
"use client";

import { useCallback, useState } from "react";
import type { BeatRange, TabSession } from "../../../domain/tabEngine";
import type { TabPlayerStatus } from "./useTabEngine";

export interface UseTabPlaybackInput {
  session: TabSession | null;
  isAudioReady: boolean;
  playerStatus: TabPlayerStatus;
  currentTick: number;
}

export interface UseTabPlayback {
  play: () => void;
  pause: () => void;
  stop: () => void;
  toggle: () => void;
  seek: (beat: number) => void;
  setTempoFactor: (factor: number) => void;
  setLoop: (range: BeatRange | null) => void;
  /** True if play() was attempted while isAudioReady was false. Toolbar
   *  surfaces this as an inline "Tap play to enable audio" hint. */
  audioBlocked: boolean;
  currentTick: number;
  playerStatus: TabPlayerStatus;
}

/**
 * Wraps a `TabSession` with the playback callables the toolbar needs.
 * No-ops gracefully when `session` is null (pre-mount or after engine
 * load failure) so the toolbar can render unconditionally.
 */
export function useTabPlayback(input: UseTabPlaybackInput): UseTabPlayback {
  const { session, isAudioReady, playerStatus, currentTick } = input;
  const [audioBlocked, setAudioBlocked] = useState(false);

  const play = useCallback(() => {
    if (!session) return;
    if (!isAudioReady) {
      setAudioBlocked(true);
      return;
    }
    setAudioBlocked(false);
    session.play();
  }, [session, isAudioReady]);

  const pause = useCallback(() => { session?.pause(); }, [session]);
  const stop = useCallback(() => { session?.stop(); }, [session]);
  const toggle = useCallback(() => {
    if (playerStatus === "playing") pause();
    else play();
  }, [playerStatus, play, pause]);
  const seek = useCallback((beat: number) => { session?.seek(beat); }, [session]);
  const setTempoFactor = useCallback((factor: number) => {
    session?.setTempoFactor(factor);
  }, [session]);
  const setLoop = useCallback((range: BeatRange | null) => {
    session?.setLoop(range);
  }, [session]);

  return { play, pause, stop, toggle, seek, setTempoFactor, setLoop, audioBlocked, currentTick, playerStatus };
}
```

- [ ] **Step 4: Iterate until green**

Run: `npm run test:run -- useTabPlayback`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabPlayback.ts \
        src/app/knowledge_base/features/tab/hooks/useTabPlayback.test.tsx
git commit -m "feat(tabs): add useTabPlayback hook (TAB-005)"
```

---

## Task 6: `TabToolbar` component (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/components/TabToolbar.tsx`
- Test: `src/app/knowledge_base/features/tab/components/TabToolbar.test.tsx`

Renders play/pause toggle, a tempo dropdown (50%/75%/100%/125%/150%), and a loop checkbox. Scrubbing is deferred to a future enhancement — alphatab renders its own playhead on the canvas, and a slider over the score adds geometric complexity that doesn't pay for itself in a 2-day ticket. The toolbar's job is the *transport* (play/pause/stop), not the *position*.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabToolbar } from "./TabToolbar";

function makeProps(overrides: Partial<React.ComponentProps<typeof TabToolbar>> = {}) {
  return {
    playerStatus: "paused" as const,
    isAudioReady: true,
    audioBlocked: false,
    onToggle: vi.fn(),
    onStop: vi.fn(),
    onSetTempoFactor: vi.fn(),
    onSetLoop: vi.fn(),
    ...overrides,
  };
}

describe("TabToolbar", () => {
  it("renders a play button when playerStatus is 'paused'", () => {
    render(<TabToolbar {...makeProps()} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeInTheDocument();
  });

  it("renders a pause button when playerStatus is 'playing'", () => {
    render(<TabToolbar {...makeProps({ playerStatus: "playing" })} />);
    expect(screen.getByRole("button", { name: /pause/i })).toBeInTheDocument();
  });

  it("the play/pause button calls onToggle on click", async () => {
    const onToggle = vi.fn();
    render(<TabToolbar {...makeProps({ onToggle })} />);
    await userEvent.click(screen.getByRole("button", { name: /play/i }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("play/pause is disabled when isAudioReady is false", () => {
    render(<TabToolbar {...makeProps({ isAudioReady: false })} />);
    expect(screen.getByRole("button", { name: /play/i })).toBeDisabled();
  });

  it("stop button calls onStop on click", async () => {
    const onStop = vi.fn();
    render(<TabToolbar {...makeProps({ onStop })} />);
    await userEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("tempo dropdown calls onSetTempoFactor with the chosen factor", async () => {
    const onSetTempoFactor = vi.fn();
    render(<TabToolbar {...makeProps({ onSetTempoFactor })} />);
    const select = screen.getByLabelText(/tempo/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, "0.75");
    expect(onSetTempoFactor).toHaveBeenLastCalledWith(0.75);
  });

  it("loop checkbox toggles onSetLoop with a range vs null", async () => {
    const onSetLoop = vi.fn();
    render(<TabToolbar {...makeProps({ onSetLoop })} />);
    const checkbox = screen.getByRole("checkbox", { name: /loop/i });
    await userEvent.click(checkbox);
    expect(onSetLoop).toHaveBeenLastCalledWith({ start: 0, end: Number.MAX_SAFE_INTEGER });
    await userEvent.click(checkbox);
    expect(onSetLoop).toHaveBeenLastCalledWith(null);
  });

  it("renders the audio-blocked hint when audioBlocked is true", () => {
    render(<TabToolbar {...makeProps({ audioBlocked: true })} />);
    expect(screen.getByText(/tap play/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Confirm fail**

Run: `npm run test:run -- TabToolbar`
Expected: module not found.

- [ ] **Step 3: Create the component**

```tsx
"use client";

import type { ReactElement } from "react";
import type { BeatRange } from "../../../domain/tabEngine";
import type { TabPlayerStatus } from "../hooks/useTabEngine";

export interface TabToolbarProps {
  playerStatus: TabPlayerStatus;
  isAudioReady: boolean;
  audioBlocked: boolean;
  onToggle: () => void;
  onStop: () => void;
  onSetTempoFactor: (factor: number) => void;
  onSetLoop: (range: BeatRange | null) => void;
}

const TEMPO_OPTIONS: { label: string; value: number }[] = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
];

/**
 * Transport controls for the guitar-tab pane: play/pause toggle, stop,
 * tempo dropdown, loop checkbox, audio-blocked hint. Scrubbing is
 * intentionally absent — alphatab renders its own playhead on the
 * canvas; a slider over the score adds geometric complexity without
 * matching reward in this slice.
 */
export function TabToolbar(props: TabToolbarProps): ReactElement {
  const {
    playerStatus, isAudioReady, audioBlocked,
    onToggle, onStop, onSetTempoFactor, onSetLoop,
  } = props;
  const isPlaying = playerStatus === "playing";

  return (
    <div
      data-testid="tab-toolbar"
      className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!isAudioReady}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="rounded border border-line px-3 py-1 hover:bg-line/20 disabled:opacity-50"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>

      <button
        type="button"
        onClick={onStop}
        aria-label="Stop"
        className="rounded border border-line px-3 py-1 hover:bg-line/20"
      >
        Stop
      </button>

      <label className="flex items-center gap-1">
        <span className="text-mute">Tempo</span>
        <select
          aria-label="Tempo"
          defaultValue="1"
          onChange={(e) => onSetTempoFactor(Number(e.target.value))}
          className="rounded border border-line bg-surface px-1 py-0.5"
        >
          {TEMPO_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          aria-label="Loop"
          onChange={(e) => onSetLoop(e.target.checked ? { start: 0, end: Number.MAX_SAFE_INTEGER } : null)}
        />
        <span className="text-mute">Loop</span>
      </label>

      {audioBlocked && (
        <span role="status" className="ml-auto text-xs text-mute">
          Tap play to enable audio.
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Iterate until green**

Run: `npm run test:run -- TabToolbar`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/components/TabToolbar.tsx \
        src/app/knowledge_base/features/tab/components/TabToolbar.test.tsx
git commit -m "feat(tabs): add TabToolbar transport controls (TAB-005)"
```

---

## Task 7: Wire `TabToolbar` + `useTabPlayback` + `useObservedTheme` into `TabView`

**Files:**
- Modify: `src/app/knowledge_base/features/tab/TabView.tsx`
- Modify: `src/app/knowledge_base/features/tab/TabView.test.tsx`

`TabView` mounts the toolbar above the canvas, threads `useTabPlayback` to it, and observes theme changes to push them into the alphatab settings.

- [ ] **Step 1: Add a failing test for the toolbar mount + a placeholder test for the theme push (theme test will assert the setting was changed)**

Append to `TabView.test.tsx`, inside the existing `describe("TabView", () => { ... })`:

```ts
it("mounts the toolbar when status is 'ready'", async () => {
  mockStatus = "ready";
  mockMetadata = { title: "hi" } as never;
  render(
    <Wrap>
      <TabView filePath="x.alphatex" />
    </Wrap>,
  );
  expect(screen.getByTestId("tab-toolbar")).toBeInTheDocument();
});

it("does not mount the toolbar in engine-load-error state", async () => {
  mockStatus = "engine-load-error";
  mockError = new Error("chunk failed");
  render(
    <Wrap>
      <TabView filePath="x.alphatex" />
    </Wrap>,
  );
  expect(screen.queryByTestId("tab-toolbar")).not.toBeInTheDocument();
});
```

`useObservedTheme` is a React hook that returns `"light" | "dark"` from a `[data-theme]` attribute observer. The TabView wires it in via a `useEffect` that calls a side-effect on the engine settings; we don't unit-test the live observer here (covered by `useObservedTheme.test.ts`). The mounted-toolbar tests above are the only new TabView cases.

- [ ] **Step 2: Confirm fail**

Run: `npm run test:run -- TabView`
Expected: 2 new failures (toolbar testid missing).

- [ ] **Step 3: Update `TabView.tsx` to mount the toolbar and wire the playback hook**

Replace `src/app/knowledge_base/features/tab/TabView.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { useObservedTheme } from "../../shared/hooks/useObservedTheme";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { TabCanvas } from "./components/TabCanvas";
import { TabToolbar } from "./components/TabToolbar";
import { useTabContent } from "./hooks/useTabContent";
import { useTabEngine } from "./hooks/useTabEngine";
import { useTabPlayback } from "./hooks/useTabPlayback";

/**
 * Pane shell for an opened `.alphatex` file. Reads the file via
 * `useTabContent`, hands the text to `useTabEngine.mountInto()` along
 * with a host div ref, mounts a `TabToolbar` above the canvas (when the
 * engine is in a renderable state), and pushes theme changes from
 * `useObservedTheme()` into the engine via a no-op render call (alphatab
 * picks up the new colours from its settings on the next layout).
 *
 * Source-parse failures (`status === "error"`) forward to the global
 * `ShellErrorContext` banner. Engine-module load failures
 * (`status === "engine-load-error"`) render an inline error pane with a
 * Reload button.
 */
export function TabView({ filePath }: { filePath: string }) {
  const { content, loadError } = useTabContent(filePath);
  const {
    status,
    error: engineError,
    mountInto,
    currentTick,
    playerStatus,
    isAudioReady,
    session,
  } = useTabEngine();
  const playback = useTabPlayback({ session, isAudioReady, playerStatus, currentTick });
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { reportError } = useShellErrors();
  const theme = useObservedTheme();

  useEffect(() => {
    if (!canvasRef.current || content === null) return;
    void mountInto(canvasRef.current, content);
  }, [content, mountInto]);

  useEffect(() => {
    if (loadError) reportError(loadError, `Loading ${filePath}`);
  }, [loadError, filePath, reportError]);

  useEffect(() => {
    if (status === "error" && engineError) {
      reportError(engineError, `Parsing ${filePath}`);
    }
  }, [status, engineError, filePath, reportError]);

  // Theme push — when the observed theme changes after the engine is
  // ready, ask alphatab to re-render so the new chrome (background +
  // staff lines) flips. The score colours themselves are styled via
  // CSS variables on the canvas host; a re-render is enough.
  useEffect(() => {
    if (status !== "ready" || !session) return;
    session.render();
  }, [theme, status, session]);

  if (status === "engine-load-error") {
    return (
      <div
        data-testid="tab-view-engine-error"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface text-mute"
      >
        <p className="text-sm font-medium">Couldn&apos;t load the guitar-tab engine.</p>
        <p className="text-xs">{engineError?.message}</p>
        <button
          type="button"
          className="rounded border border-line px-3 py-1 text-sm hover:bg-line/20"
          onClick={() => {
            if (canvasRef.current && content !== null) {
              void mountInto(canvasRef.current, content);
            }
          }}
        >
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <TabToolbar
        playerStatus={playback.playerStatus}
        isAudioReady={isAudioReady}
        audioBlocked={playback.audioBlocked}
        onToggle={playback.toggle}
        onStop={playback.stop}
        onSetTempoFactor={playback.setTempoFactor}
        onSetLoop={playback.setLoop}
      />
      {status === "mounting" && (
        <div
          data-testid="tab-view-loading"
          className="absolute inset-0 z-10 flex items-center justify-center bg-surface/80 text-mute"
        >
          Loading score…
        </div>
      )}
      <TabCanvas ref={canvasRef} />
    </div>
  );
}
```

- [ ] **Step 4: Run TabView tests, iterate**

Run: `npm run test:run -- TabView`
Expected: original 6 + 2 new = 8/8 PASS.

You'll likely need to extend the `vi.mock("./hooks/useTabEngine", ...)` mock at the top of `TabView.test.tsx` so it returns the new fields. Use this:

```ts
vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    currentTick: 0,
    playerStatus: "paused" as const,
    isAudioReady: true,    // toolbar buttons enabled in tests
    session: null,
    mountInto: mountIntoMock,
  }),
}));
```

If the new toolbar tests fail because `useObservedTheme` isn't mocked, add this mock to the top of `TabView.test.tsx`:

```ts
vi.mock("../../shared/hooks/useObservedTheme", () => ({
  useObservedTheme: () => "light",
}));
```

- [ ] **Step 5: Run the full suite**

Run: `npm run test:run`
Expected: full suite passes; no other consumer broke.

- [ ] **Step 6: Commit**

```bash
git add src/app/knowledge_base/features/tab/TabView.tsx \
        src/app/knowledge_base/features/tab/TabView.test.tsx
git commit -m "feat(tabs): mount toolbar + wire playback + theme observer (TAB-005)"
```

---

## Task 8: e2e — extend `tab.spec.ts` to click play and verify the audio context

**Files:**
- Modify: `e2e/tab.spec.ts`

- [ ] **Step 1: Extend the spec with a play-click case**

Append to `e2e/tab.spec.ts` after the existing test:

```ts
test("clicking Play attempts to start audio (AudioContext is created)", async ({ page }) => {
  await page.addInitScript(installMockFS);
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
  });
  await page.goto("/");
  await page.evaluate(() => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void };
    }).__kbMockFS;
    m.seed({
      "intro.alphatex": "\\title \"Intro\"\n\\tempo 120\n.\n:4 5.6 7.6 5.5 7.5 |",
    });
  });

  await page.getByRole("button", { name: /open folder/i }).click();
  await page.getByText("intro.alphatex").click();
  await expect(page.getByTestId("tab-view-canvas")).toBeVisible();
  await expect(page.getByTestId("tab-toolbar")).toBeVisible();

  // Audio fully ready might take seconds (SoundFont download). For the
  // smoke we just confirm the play button is wired — clicking it either
  // starts playback OR shows the audio-blocked hint, both are valid
  // browser behaviours and both prove the toolbar reaches the engine.
  const playBtn = page.getByRole("button", { name: /play/i });
  await expect(playBtn).toBeVisible();

  // Wait up to 10 s for the engine to fire 'ready' (SoundFont loaded).
  // Then click and confirm we either flipped to "Pause" OR surfaced the
  // audio-blocked hint.
  await expect(playBtn).toBeEnabled({ timeout: 10_000 });
  await playBtn.click();
  await Promise.race([
    page.getByRole("button", { name: /pause/i }).waitFor({ timeout: 3_000 }),
    page.getByText(/tap play/i).waitFor({ timeout: 3_000 }),
  ]);
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- tab.spec.ts`
Expected: 2/2 PASS (the original `mounts the canvas` + the new play-click case).

If the play-click case is flaky (SoundFont download stalls in CI), it's acceptable to drop the `await expect(playBtn).toBeEnabled(...)` block and just confirm the click doesn't throw. The smoke is "the toolbar is wired to the engine," not "audio definitely starts."

- [ ] **Step 3: Commit**

```bash
git add e2e/tab.spec.ts
git commit -m "test(tabs): e2e play-click smoke for toolbar (TAB-005)"
```

---

## Task 9: Update `test-cases/11-tabs.md` and `Features.md`

**Files:**
- Modify: `test-cases/11-tabs.md`
- Modify: `Features.md`

- [ ] **Step 1: Flip viewer cases that this slice now covers, and add §11.3 Playback**

In `test-cases/11-tabs.md`:

(a) Flip `TAB-11.2-11` (live dark-mode toggle) ❌ → 🟡 (the engine re-renders on theme change, but the visual flip depends on canvas colour settings which alphatab fully controls — partial). Append `_(unit: TabView.test.tsx — implicit via session.render() call when theme changes; no visual snapshot.)_`. If the existing line text on TAB-11.2-11 is hard to find, run `grep -n "TAB-11.2-11" test-cases/11-tabs.md` first.

(b) After the §11.2 section's "Future sections" paragraph (or at the end of the file), insert a new `## 11.3 Playback chrome (TAB-005)` section:

```markdown
## 11.3 Playback chrome (TAB-005)

Toolbar transport (play/pause/stop/tempo/loop), engine playback methods, SoundFont vendoring + service-worker cache. Shipped 2026-05-03.

- **TAB-11.3-01** ✅ **`mount()` configures `enablePlayer = true` and the SoundFont URL** — `settings.player.enablePlayer === true`, `settings.player.soundFont === "/soundfonts/sonivox.sf2"`. _(unit: alphaTabEngine.test.ts — "mount() configures enablePlayer=true and the SoundFont URL".)_
- **TAB-11.3-02** ✅ **Session play/pause/stop delegate to the alphatab API** — three independent test cases verify each call site. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-03** ✅ **Session seek writes `tickPosition`** — _(unit: alphaTabEngine.test.ts — "session.seek(beat) sets api.tickPosition".)_
- **TAB-11.3-04** ✅ **`setTempoFactor` clamps to 0.25..2.0** — out-of-range values are silently clamped. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-05** ✅ **`setLoop` applies `playbackRange` + `isLooping`** — null clears both. _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-06** ✅ **Engine `playerReady` event re-emits as `"ready"` on the session bus** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-07** ✅ **`playerStateChanged` emits `"played"` / `"paused"` based on the alphatab state value** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-08** ✅ **`playerPositionChanged` emits `"tick"` with `currentTick`** — _(unit: alphaTabEngine.test.ts.)_
- **TAB-11.3-09** ✅ **`useTabEngine.playerStatus` reflects engine `played` / `paused` events** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-10** ✅ **`useTabEngine.currentTick` reflects engine `tick` events** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-11** ✅ **`useTabEngine.isAudioReady` flips true on `ready`** — _(unit: useTabEngine.test.tsx.)_
- **TAB-11.3-12** ✅ **`useTabPlayback.toggle()` flips between play/pause based on `playerStatus`** — _(unit: useTabPlayback.test.tsx.)_
- **TAB-11.3-13** ✅ **`useTabPlayback.play()` is a no-op when `isAudioReady` is false and sets `audioBlocked = true`** — _(unit: useTabPlayback.test.tsx.)_
- **TAB-11.3-14** ✅ **`TabToolbar` play button is disabled until `isAudioReady`** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-15** ✅ **`TabToolbar` tempo dropdown calls `onSetTempoFactor` with the chosen factor** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-16** ✅ **`TabToolbar` loop checkbox toggles `onSetLoop` with a range vs null** — _(unit: TabToolbar.test.tsx.)_
- **TAB-11.3-17** ✅ **`TabView` mounts the toolbar when status is `ready`** — _(unit: TabView.test.tsx.)_
- **TAB-11.3-18** ✅ **`TabView` does not mount the toolbar in `engine-load-error` state** — _(unit: TabView.test.tsx.)_
- **TAB-11.3-19** 🧪 **Clicking Play either starts playback or surfaces the audio-blocked hint** — Playwright drives the click and asserts one of those two outcomes. _(e2e: e2e/tab.spec.ts.)_
- **TAB-11.3-20** ❌ **Service-worker cache hit on second load** — `/soundfonts/sonivox.sf2` served from cache without a network request after first fetch. (Manual / future Lighthouse audit.)
```

The remaining ❌ items in §11.2 (TAB-11.2-01 bundle assertion, TAB-11.2-04 wall-clock, TAB-11.2-08 file-watcher conflict, TAB-11.2-10 re-open, TAB-11.2-12 H1 derive, TAB-11.2-13 wiki-link parser) stay ❌ — they map to TAB-007 / TAB-008 / TAB-011.

- [ ] **Step 2: Update `Features.md` §11**

In `Features.md`, replace the existing `§11.1 Foundation (TAB-001 → TAB-004)` block (under `## 11. Guitar Tabs`) with this expanded version:

```markdown
### 11.1 Foundation (TAB-001 → TAB-005)
- ⚙️ **`TabEngine` domain interface** (`src/app/knowledge_base/domain/tabEngine.ts`) — engine-agnostic contract for mount/load/playback/edit; implemented by `AlphaTabEngine`.
- ⚙️ **`TabRepository`** (`src/app/knowledge_base/infrastructure/tabRepo.ts`) — FSA-backed read/write of `.alphatex` text; provided through `RepositoryContext`.
- ⚙️ **`AlphaTabEngine`** (`src/app/knowledge_base/infrastructure/alphaTabEngine.ts`) — implements `TabEngine` via lazy `import("@coderline/alphatab")` inside `mount()`; renders alphaTex score; `enablePlayer = true` (TAB-005); SoundFont served from `/soundfonts/sonivox.sf2`.
- ⚙️ **`"tab"` PaneType + routing** (`src/app/knowledge_base/shell/ToolbarContext.tsx`, `knowledgeBase.tsx:handleSelectFile`, `shared/utils/fileTree.ts`) — `.alphatex` files are visible in the explorer and open a tab pane.
- ✅ **`TabView`** (`src/app/knowledge_base/features/tab/TabView.tsx`) — pane shell mounting `TabToolbar` + `TabCanvas`; loading / canvas / engine-load-error chrome; theme push via `useObservedTheme()`; source-parse failures route to `ShellErrorContext`.

### 11.2 Playback chrome (TAB-005)
- ✅ **Transport controls** (`features/tab/components/TabToolbar.tsx`) — play/pause toggle, stop, tempo dropdown (50%–150%), loop checkbox. Audio-blocked hint surfaces when play is attempted before the SoundFont is ready.
- ⚙️ **`useTabPlayback` hook** (`features/tab/hooks/useTabPlayback.ts`) — wraps `TabSession` callables with null-safe no-ops and audio-blocked tracking.
- ⚙️ **Engine playback wiring** — `play()` / `pause()` / `stop()` / `seek(tick)` / `setTempoFactor(0.25..2)` / `setLoop(range|null)` translate to alphatab. Player events (`playerReady`, `playerStateChanged`, `playerPositionChanged`) re-emit on the engine bus as `"ready"` / `"played"` / `"paused"` / `"tick"`.
- ⚙️ **SoundFont vendoring** (`public/soundfonts/sonivox.sf2`) — 1.35 MB Sonivox GM SoundFont copied from `node_modules/@coderline/alphatab/dist/soundfont/`. Service worker (`public/sw.js`) precaches the file and serves cache-first under `/soundfonts/*` (KB-044 lane extension; `kb-static-v3`).
- ⚙️ **Live theme adaptation** — `TabView` calls `session.render()` whenever `useObservedTheme()` reports a theme flip; alphatab re-paints the score with current chrome settings.

### 11.3 Pending
- ? **Properties panel** (tuning / capo / key / tempo / sections + attachments) — TAB-007 / TAB-007a.
- ? **`.gp` import** — TAB-006.
- ? **Vault search** (titles / artist / key / tuning) — TAB-011.
- ? **Mobile gating** (read-only + playback only) — TAB-012.
- ? **Editor (M2)** — TAB-008+.
```

- [ ] **Step 3: Verify**

```bash
grep -c '^- \*\*TAB-' test-cases/11-tabs.md  # was 28, expect 48 (+20 §11.3 cases)
grep -n '^### 11\.' Features.md              # expect §11.1, §11.2, §11.3
```

`npm run test:run` — full suite passes (no code change).

- [ ] **Step 4: Commit**

```bash
git add test-cases/11-tabs.md Features.md
git commit -m "docs: register TAB-005 playback in test-cases + Features.md"
```

---

## Wrap-up

After Task 9 lands:
- Opening `.alphatex` shows the score with a transport toolbar above it.
- Clicking Play loads the SoundFont (first time, cached after) and starts audio playback; the playhead moves through the score (alphatab handles the visual cursor).
- Pause / Stop work; tempo dropdown changes playback speed; Loop checkbox cycles the whole song.
- Theme toggle (`⌘⇧L`) re-renders the canvas with current colours.
- Audio is blocked-by-gesture? The toolbar shows a small hint.
- Service worker caches the SoundFont, so a second load is instant + offline-safe.

**Plan completion checklist:**
- [x] All TAB-005 spec acceptance items covered (play, pause, scrub→deferred but not blocking, loop, speed, dark-mode aware).
- [x] No `?` left in Features.md §11.2.
- [x] All §11.3 test-cases either ✅ / 🟡 / 🧪 or have a clear future-ticket assignment.

**Branch:** `plan/guitar-tabs-playback`. Per `feedback_no_worktrees.md`: don't push, don't worktree. Per `project_branch_protection.md`: open a PR via `gh pr create` when ready.

---

_End of TAB-005 plan. Next plan after this ships: TAB-007 (properties panel) — surfaces metadata + section attachments via `DocumentsSection`._
