import { describe, it, expect, vi, beforeEach } from "vitest";

const renderTracksMock = vi.fn();
const destroyMock = vi.fn();
const texMock = vi.fn();

vi.mock("@coderline/alphatab", () => {
  class FakeApi {
    settings: { player: { enablePlayer: boolean }; core: { engine: string } };
    scoreLoaded: { on: (h: (s: unknown) => void) => void };
    error: { on: (h: (e: Error) => void) => void };
    private scoreHandlers: ((s: unknown) => void)[] = [];
    private errorHandlers: ((e: Error) => void)[] = [];

    constructor(public element: HTMLElement, settings: unknown) {
      this.settings = settings as typeof this.settings;
      this.scoreLoaded = { on: (h) => { this.scoreHandlers.push(h); } };
      this.error = { on: (h) => { this.errorHandlers.push(h); } };
    }
    tex(text: string) {
      texMock(text);
      const fakeScore = { title: "Untitled", tempo: 120, tracks: [] };
      this.scoreHandlers.forEach((h) => h(fakeScore));
    }
    renderTracks() { renderTracksMock(); }
    destroy() { destroyMock(); }
  }
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
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("mount() instantiates AlphaTabApi with enablePlayer=false in TAB-004", async () => {
    const engine = new AlphaTabEngine();
    const session = await engine.mount(container, {
      initialSource: { kind: "alphatex", text: "\\title \"Hi\"\n." },
      readOnly: true,
    });
    expect(session).toBeDefined();
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
});
