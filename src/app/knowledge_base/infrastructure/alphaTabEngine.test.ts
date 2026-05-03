import { describe, it, expect, vi, beforeEach } from "vitest";

const renderTracksMock = vi.fn();
const destroyMock = vi.fn();
const texMock = vi.fn();
const playMock = vi.fn();
const pauseMock = vi.fn();
const stopMock = vi.fn();

let capturedSettings: {
  player: { enablePlayer: boolean; soundFont: string };
  core: { engine: string; logLevel: number };
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
    // Tests need to fire events on the constructed instance from outside;
    // exposing it via a module-level ref is the simplest fixture pattern.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

import { AlphaTabEngine } from "./alphaTabEngine";

describe("AlphaTabEngine", () => {
  let container: HTMLElement;

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
    // alphaTab LogLevel.Info — Debug=1 was carried over from TAB-004 and was
    // too noisy in the browser console once playback shipped.
    expect(capturedSettings!.core.logLevel).toBe(2);
    expect(texMock).toHaveBeenCalledWith("\\title \"Hi\"\n.");
  });

  it("session.load() emits a 'loaded' event with the parsed metadata", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    const loaded = vi.fn();
    session.on("loaded", loaded);
    await session.load({ kind: "alphatex", text: "\\title \"Riff\"\n." });
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(loaded.mock.calls[0][0]).toMatchObject({
      event: "loaded",
      metadata: expect.objectContaining({ title: "Untitled", tempo: 120 }),
    });
  });

  it("session.dispose() calls destroy on the underlying api", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    session.dispose();
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  it("non-alphatex sources throw — only alphatex is supported in this slice", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "x" },
      readOnly: true,
    });
    await expect(
      session.load({ kind: "gp", bytes: new Uint8Array() }),
    ).rejects.toThrow(/alphatex/i);
  });

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
});
