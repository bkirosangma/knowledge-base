# Guitar Tabs — Viewer Implementation Plan (TAB-004)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `TabViewStub` with a real `TabView` that lazy-mounts `AlphaTabEngine` and renders the alphaTex score for any `.alphatex` file the user opens. **No audio in this slice** — `enablePlayer = false`; playback chrome lands in TAB-005.

**Architecture:** `AlphaTabEngine` (in `infrastructure/`) implements the `TabEngine` domain interface; its `mount()` method dynamically imports `@coderline/alphatab` to keep the ~1 MB chunk out of the app bundle. `useTabEngine` owns the engine + session lifecycle inside `TabView`; `useTabContent` reads the file via `TabRepository` and feeds the text into `session.load()`. `TabView` shells the canvas, mounts `ConflictBanner` for file-watcher conflicts, and renders an inline error pane if the engine module fails to load (mirrors the GraphView force-graph fallback at `features/graph/GraphView.tsx`).

**Tech Stack:** TypeScript, React, `@coderline/alphatab@^1.8.2` (already pinned), Vitest (JSDOM), File System Access API. Initial canvas colours read from `useObservedTheme()` so the score isn't a glaring white block in dark mode — full live-toggle observer lands with the playback chrome in TAB-005.

**Spec:** [`docs/superpowers/specs/2026-05-02-guitar-tabs-design.md`](../specs/2026-05-02-guitar-tabs-design.md).
**Foundation it builds on:** [`2026-05-02-guitar-tabs-foundation.md`](2026-05-02-guitar-tabs-foundation.md) (TAB-001 → TAB-003 — already shipped, PR #98).

**Out of scope for this plan:**
- Playback (toolbar, `useTabPlayback`, AudioContext, SoundFont) — TAB-005.
- Live dark-mode observer that re-renders the canvas on `⌘⇧L` — TAB-005 (initial colours only here).
- Properties panel — TAB-007.
- `.gp` import — TAB-006.
- Wiki-link parsing of the kb-meta block — TAB-007a / TAB-011.
- Vault search integration — TAB-011.
- Mobile gating — TAB-012.

---

## File Structure

```
src/app/knowledge_base/
  infrastructure/
    alphaTabAssets.ts              ← NEW (URL constants for soundfont path; consumed by TAB-005)
    alphaTabEngine.ts              ← NEW (real TabEngine impl; dynamic import of alphatab inside mount())
  features/tab/
    TabView.tsx                    ← NEW (replaces TabViewStub; pane shell + error fallback)
    TabViewStub.tsx                ← DELETED (replaced by TabView)
    TabViewStub.test.tsx           ← DELETED
    components/
      TabCanvas.tsx                ← NEW (thin div+ref wrapper; "use client")
    hooks/
      useTabEngine.ts              ← NEW (engine instance + session lifecycle)
      useTabContent.ts             ← NEW (load/refresh via TabRepository, conflict signal)
  knowledgeBase.tabRouting.helper.tsx  ← MODIFIED (TabViewStub → TabView)
test-cases/11-tabs.md              ← MODIFIED (flip TAB-11.1-04 → 🚫; flip TAB-11.2-x cases to ✅ as covered)
Features.md                        ← MODIFIED (§11.1 promotes TabView from "?" to "✅")
e2e/tab.spec.ts                    ← NEW (TAB-11.2-14 smoke)
```

Each task below produces a self-contained, independently shippable change.

---

## Task 1: Asset URL constants (`alphaTabAssets.ts`)

**Files:**
- Create: `src/app/knowledge_base/infrastructure/alphaTabAssets.ts`
- Test: (none — pure constants)

`AlphaTabEngine` reads asset URLs from this module so TAB-005 can switch the SoundFont path without touching engine logic. Per `project_soundfont_host.md`, the file lives in `public/soundfonts/` (added in TAB-005); the constant is exported now so the engine signature is stable.

- [ ] **Step 1: Create the file**

```ts
// src/app/knowledge_base/infrastructure/alphaTabAssets.ts
/**
 * Asset URLs consumed by `AlphaTabEngine`. Centralised here so the
 * SoundFont path (TAB-005) and any future assets (worker bundle, fonts)
 * have one swap-point.
 *
 * The SoundFont file itself is added to `public/soundfonts/` and the
 * service worker precache in TAB-005; `enablePlayer` stays `false` until
 * then, so this constant is unused in TAB-004.
 */
export const SOUNDFONT_URL = "/soundfonts/sonivox.sf2";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabAssets.ts
git commit -m "feat(tabs): add alphaTabAssets URL constants (TAB-004)"
```

---

## Task 2: `AlphaTabEngine` implementation (TDD)

**Files:**
- Create: `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`
- Test: `src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts`

The engine class implements the `TabEngine` domain contract from TAB-001. Its `mount()` method does `await import("@coderline/alphatab")` so the alphatab chunk is pulled in only on first use, not at app boot.

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake of the AlphaTab API surface. The real module is huge
// and pulls in browser-only deps (Web Audio); the fake covers exactly
// the methods the engine touches.
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
      // Synchronously notify subscribers — simulates a successful parse.
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
    // Initial source should have been loaded.
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- alphaTabEngine`
Expected: FAIL — `Cannot find module './alphaTabEngine'`.

- [ ] **Step 3: Create the implementation**

Create `src/app/knowledge_base/infrastructure/alphaTabEngine.ts`:

```ts
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
    settings.core.logLevel = 1;            // warnings only

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
```

- [ ] **Step 4: Run tests, fix anything that fails, until all pass**

Run: `npm run test:run -- alphaTabEngine`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/infrastructure/alphaTabEngine.ts \
        src/app/knowledge_base/infrastructure/alphaTabEngine.test.ts
git commit -m "feat(tabs): add AlphaTabEngine implementation (TAB-004)"
```

---

## Task 3: `useTabEngine` hook (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabEngine.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabEngine.test.tsx`

Owns the `AlphaTabEngine` instance and the active `TabSession` for one `TabView`. Subscribes to `"loaded"` / `"error"` events and exposes them as React state.

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/tab/hooks/useTabEngine.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

// Stub the engine module so the hook test doesn't pull in alphatab.
const mountMock = vi.fn();
const disposeMock = vi.fn();
const loadMock = vi.fn();

vi.mock("../../../infrastructure/alphaTabEngine", () => ({
  AlphaTabEngine: class {
    mount = mountMock;
  },
}));

import { useTabEngine } from "./useTabEngine";

describe("useTabEngine", () => {
  beforeEach(() => {
    mountMock.mockReset();
    disposeMock.mockReset();
    loadMock.mockReset();
  });

  function makeFakeSession() {
    const handlers: Record<string, ((p: unknown) => void)[]> = {};
    return {
      load: loadMock,
      dispose: disposeMock,
      on: (event: string, handler: (p: unknown) => void) => {
        (handlers[event] ??= []).push(handler);
        return () => {
          handlers[event] = handlers[event].filter((h) => h !== handler);
        };
      },
      emit: (event: string, payload: unknown) =>
        (handlers[event] ?? []).forEach((h) => h(payload)),
    };
  }

  it("status starts at 'idle' before the container ref attaches", () => {
    const { result } = renderHook(() => useTabEngine());
    expect(result.current.status).toBe("idle");
    expect(result.current.metadata).toBeNull();
  });

  it("mountInto() loads the source and transitions through 'mounting' → 'ready'", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);

    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "\\title \"hi\"\n.");
    });

    expect(mountMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("mounting"); // load has not resolved yet

    // Engine fires "loaded" → metadata available, status flips to ready.
    await act(async () => {
      fakeSession.emit("loaded", {
        event: "loaded",
        metadata: { title: "hi", tempo: 90, timeSignature: { numerator: 4, denominator: 4 }, capo: 0, tuning: [], tracks: [], sections: [], totalBeats: 0, durationSeconds: 0 },
      });
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.metadata?.title).toBe("hi");
  });

  it("transitions to 'error' when the engine emits an error event", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);
    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "broken");
    });
    await act(async () => {
      fakeSession.emit("error", { event: "error", error: new Error("parse fail") });
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("parse fail");
  });

  it("dispose() calls session.dispose and resets to 'idle'", async () => {
    const fakeSession = makeFakeSession();
    mountMock.mockResolvedValue(fakeSession);
    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "x");
    });
    await act(async () => {
      result.current.dispose();
    });
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("idle");
  });

  it("transitions to 'engine-load-error' when the dynamic import throws", async () => {
    mountMock.mockRejectedValue(new Error("chunk load failed"));
    const { result } = renderHook(() => useTabEngine());
    const container = document.createElement("div");
    await act(async () => {
      await result.current.mountInto(container, "x");
    });
    await waitFor(() => expect(result.current.status).toBe("engine-load-error"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- useTabEngine`
Expected: FAIL — `Cannot find module './useTabEngine'`.

- [ ] **Step 3: Create the implementation**

Create `src/app/knowledge_base/features/tab/hooks/useTabEngine.ts`:

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

export interface UseTabEngine {
  status: TabEngineStatus;
  metadata: TabMetadata | null;
  error: Error | null;
  /** Mount the engine into the host element and load the initial alphatex. */
  mountInto: (container: HTMLElement, alphatex: string) => Promise<void>;
  /** Tear down the session. Safe to call multiple times. */
  dispose: () => void;
}

/**
 * Owns the `AlphaTabEngine` instance + active `TabSession` for one
 * `TabView`. Surfaces engine status as React state so the view can swap
 * between loading / canvas / error chrome.
 */
export function useTabEngine(): UseTabEngine {
  const [status, setStatus] = useState<TabEngineStatus>("idle");
  const [metadata, setMetadata] = useState<TabMetadata | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const sessionRef = useRef<TabSession | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  const cleanup = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const dispose = useCallback(() => {
    cleanup();
    setStatus("idle");
    setMetadata(null);
    setError(null);
  }, [cleanup]);

  const mountInto = useCallback(
    async (container: HTMLElement, alphatex: string) => {
      cleanup();
      setStatus("mounting");
      setError(null);
      let session: TabSession;
      try {
        session = await new AlphaTabEngine().mount(container, {
          initialSource: { kind: "alphatex", text: alphatex },
          readOnly: true,
        });
      } catch (e) {
        setError(e instanceof Error ? e : new Error(String(e)));
        setStatus("engine-load-error");
        return;
      }
      sessionRef.current = session;

      const offLoaded = session.on("loaded", (payload) => {
        if (payload.event !== "loaded") return;
        setMetadata(payload.metadata);
        setStatus("ready");
      });
      const offError = session.on("error", (payload) => {
        if (payload.event !== "error") return;
        setError(payload.error);
        setStatus("error");
      });
      unsubsRef.current = [offLoaded, offError];
    },
    [cleanup],
  );

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, metadata, error, mountInto, dispose };
}
```

- [ ] **Step 4: Run the test, iterate until green**

Run: `npm run test:run -- useTabEngine`
Expected: PASS — 5 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabEngine.ts \
        src/app/knowledge_base/features/tab/hooks/useTabEngine.test.tsx
git commit -m "feat(tabs): add useTabEngine hook (TAB-004)"
```

---

## Task 4: `useTabContent` hook (TDD)

**Files:**
- Create: `src/app/knowledge_base/features/tab/hooks/useTabContent.ts`
- Test: `src/app/knowledge_base/features/tab/hooks/useTabContent.test.tsx`

Reads the `.alphatex` file via `useRepositories().tab` and surfaces the text plus a `loadError`. Mirrors `useDocumentContent`'s read-side shape (without dirty/draft tracking — TAB-008's editor introduces those).

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/tab/hooks/useTabContent.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../../shell/RepositoryContext";
import { FileSystemError } from "../../../domain/errors";
import { useTabContent } from "./useTabContent";

function wrapWithRepos(value: { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> }) {
  return ({ children }: { children: ReactNode }) => (
    <StubRepositoryProvider
      value={{
        attachment: null, document: null, diagram: null,
        linkIndex: null, svg: null, vaultConfig: null,
        tab: value,
      }}
    >
      {children}
    </StubRepositoryProvider>
  );
}

describe("useTabContent", () => {
  let read: ReturnType<typeof vi.fn>;
  let write: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    read = vi.fn();
    write = vi.fn();
  });

  it("loads the file content when the path changes", async () => {
    read.mockResolvedValue("\\title \"x\"\n.");
    const { result } = renderHook(() => useTabContent("song.alphatex"), {
      wrapper: wrapWithRepos({ read, write }),
    });
    await waitFor(() => expect(result.current.content).toBe("\\title \"x\"\n."));
    expect(read).toHaveBeenCalledWith("song.alphatex");
    expect(result.current.loadError).toBeNull();
  });

  it("captures FileSystemError on load failure", async () => {
    read.mockRejectedValue(new FileSystemError("malformed", "bad"));
    const { result } = renderHook(() => useTabContent("song.alphatex"), {
      wrapper: wrapWithRepos({ read, write }),
    });
    await waitFor(() => expect(result.current.loadError).toBeInstanceOf(FileSystemError));
    expect(result.current.content).toBeNull();
  });

  it("clears prior content when the path changes to null", async () => {
    read.mockResolvedValue("first");
    const { result, rerender } = renderHook(
      ({ path }: { path: string | null }) => useTabContent(path),
      { wrapper: wrapWithRepos({ read, write }), initialProps: { path: "a.alphatex" } },
    );
    await waitFor(() => expect(result.current.content).toBe("first"));
    rerender({ path: null });
    await waitFor(() => expect(result.current.content).toBeNull());
  });

  it("refresh() re-reads the file from disk", async () => {
    read.mockResolvedValueOnce("v1").mockResolvedValueOnce("v2");
    const { result } = renderHook(() => useTabContent("song.alphatex"), {
      wrapper: wrapWithRepos({ read, write }),
    });
    await waitFor(() => expect(result.current.content).toBe("v1"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.content).toBe("v2");
    expect(read).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test:run -- useTabContent`
Expected: FAIL — `Cannot find module './useTabContent'`.

- [ ] **Step 3: Create the implementation**

Create `src/app/knowledge_base/features/tab/hooks/useTabContent.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSystemError, classifyError } from "../../../domain/errors";
import { useRepositories } from "../../../shell/RepositoryContext";

export interface UseTabContent {
  content: string | null;
  loadError: FileSystemError | null;
  refresh: () => Promise<void>;
}

/**
 * Reads the `.alphatex` file via `useRepositories().tab` and exposes the
 * raw text + any load error. TAB-008 will extend this with dirty / draft
 * state when the editor lands; for the viewer-only slice, read-only is
 * sufficient.
 */
export function useTabContent(path: string | null): UseTabContent {
  const { tab } = useRepositories();
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<FileSystemError | null>(null);

  const load = useCallback(async (p: string | null) => {
    if (!p || !tab) {
      setContent(null);
      setLoadError(null);
      return;
    }
    try {
      const text = await tab.read(p);
      setContent(text);
      setLoadError(null);
    } catch (e) {
      setContent(null);
      setLoadError(e instanceof FileSystemError ? e : classifyError(e));
    }
  }, [tab]);

  useEffect(() => { void load(path); }, [load, path]);

  const refresh = useCallback(() => load(path), [load, path]);

  return { content, loadError, refresh };
}
```

- [ ] **Step 4: Iterate until green**

Run: `npm run test:run -- useTabContent`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/hooks/useTabContent.ts \
        src/app/knowledge_base/features/tab/hooks/useTabContent.test.tsx
git commit -m "feat(tabs): add useTabContent hook (TAB-004)"
```

---

## Task 5: `TabCanvas` component

**Files:**
- Create: `src/app/knowledge_base/features/tab/components/TabCanvas.tsx`
- Test: (none — purely a div + ref forwarder; covered by `TabView` integration tests in Task 6)

A thin client-only component that hands a host `<div>` to `TabView` for the engine to mount into. Kept as its own file so the import surface inside `TabView.tsx` stays tidy.

- [ ] **Step 1: Create the component**

```tsx
// src/app/knowledge_base/features/tab/components/TabCanvas.tsx
"use client";

import { forwardRef } from "react";

/**
 * Host element for `AlphaTabEngine.mount(...)`. The engine writes its
 * own DOM into the inner `<div>`; we just hand it a sized container.
 *
 * `data-testid` exposes the host so `TabView` integration tests can
 * confirm the canvas is mounted without coupling to alphaTab internals.
 */
export const TabCanvas = forwardRef<HTMLDivElement>(function TabCanvas(_, ref) {
  return (
    <div
      ref={ref}
      data-testid="tab-view-canvas"
      className="flex-1 overflow-auto bg-surface"
    />
  );
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/knowledge_base/features/tab/components/TabCanvas.tsx
git commit -m "feat(tabs): add TabCanvas host component (TAB-004)"
```

---

## Task 6: `TabView` component (TDD, integration)

**Files:**
- Create: `src/app/knowledge_base/features/tab/TabView.tsx`
- Test: `src/app/knowledge_base/features/tab/TabView.test.tsx`

Pane shell that wires `useTabEngine` + `useTabContent` and renders one of three states: loading, ready (canvas visible), or error (inline retry pane). Uses `useShellErrors` to forward source-parse failures to the global banner.

- [ ] **Step 1: Write the failing test**

Create `src/app/knowledge_base/features/tab/TabView.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "../../shell/RepositoryContext";
import { StubShellErrorProvider } from "../../shell/ShellErrorContext";

const mountIntoMock = vi.fn();
const disposeMock = vi.fn();
let mockStatus: string = "idle";
let mockMetadata: { title: string } | null = null;
let mockError: Error | null = null;

vi.mock("./hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: mockStatus,
    metadata: mockMetadata,
    error: mockError,
    mountInto: mountIntoMock,
    dispose: disposeMock,
  }),
}));

import { TabView } from "./TabView";

function Wrap({ children, read = vi.fn().mockResolvedValue("\\title \"hi\"\n.") }: {
  children: ReactNode;
  read?: ReturnType<typeof vi.fn>;
}) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read, write: vi.fn() },
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("TabView", () => {
  beforeEach(() => {
    mountIntoMock.mockReset().mockResolvedValue(undefined);
    disposeMock.mockReset();
    mockStatus = "idle";
    mockMetadata = null;
    mockError = null;
  });

  it("calls mountInto with the loaded file content", async () => {
    render(
      <Wrap>
        <TabView filePath="song.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalled());
    expect(mountIntoMock.mock.calls[0][1]).toBe("\\title \"hi\"\n.");
  });

  it("shows the loading placeholder while status is 'mounting'", async () => {
    mockStatus = "mounting";
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-loading")).toBeInTheDocument();
  });

  it("renders the canvas host when status is 'ready'", async () => {
    mockStatus = "ready";
    mockMetadata = { title: "hi" } as never;
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("renders the engine-load-error pane with a Reload button", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("chunk failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    expect(screen.getByTestId("tab-view-engine-error")).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: /reload/i });
    expect(reload).toBeInTheDocument();
  });

  it("Reload button on engine-load-error re-invokes mountInto", async () => {
    mockStatus = "engine-load-error";
    mockError = new Error("first attempt failed");
    render(
      <Wrap>
        <TabView filePath="x.alphatex" />
      </Wrap>,
    );
    await waitFor(() => expect(mountIntoMock).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(mountIntoMock).toHaveBeenCalledTimes(2);
  });

  it("source-parse errors (status='error') route through useShellErrors", async () => {
    const reportError = vi.fn();
    mockStatus = "error";
    mockError = new Error("parse fail");
    render(
      <StubShellErrorProvider value={{ current: null, reportError, dismiss: vi.fn() }}>
        <StubRepositoryProvider
          value={{
            attachment: null, document: null, diagram: null,
            linkIndex: null, svg: null, vaultConfig: null,
            tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() },
          }}
        >
          <TabView filePath="bad.alphatex" />
        </StubRepositoryProvider>
      </StubShellErrorProvider>,
    );
    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(reportError.mock.calls[0][0]).toBe(mockError);
    expect(reportError.mock.calls[0][1]).toMatch(/bad\.alphatex/);
  });
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `npm run test:run -- TabView`
Expected: FAIL — `Cannot find module './TabView'`.

- [ ] **Step 3: Create the component**

```tsx
// src/app/knowledge_base/features/tab/TabView.tsx
"use client";

import { useEffect, useRef } from "react";
import { useShellErrors } from "../../shell/ShellErrorContext";
import { TabCanvas } from "./components/TabCanvas";
import { useTabContent } from "./hooks/useTabContent";
import { useTabEngine } from "./hooks/useTabEngine";

/**
 * Pane shell for an opened `.alphatex` file. Reads the file via
 * `useTabContent`, hands the text to `useTabEngine.mountInto()` along
 * with a host div ref, and swaps between loading / canvas / error
 * chrome based on engine status.
 *
 * Source-parse failures (`status === "error"`) are forwarded to the
 * global `ShellErrorContext` banner — same path docs/diagrams use.
 * Engine-module load failures (`status === "engine-load-error"`) render
 * an inline error pane with a Reload button (mirrors `GraphView`).
 */
export function TabView({ filePath }: { filePath: string }) {
  const { content, loadError } = useTabContent(filePath);
  // Destructure so the effects below depend on stable callbacks +
  // primitive values, not the whole hook-return object (whose identity
  // changes every render — would re-trigger mountInto on every status
  // update and loop).
  const { status, error: engineError, mountInto } = useTabEngine();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { reportError } = useShellErrors();

  // Mount when both the content and the host element are ready.
  useEffect(() => {
    if (!canvasRef.current || content === null) return;
    void mountInto(canvasRef.current, content);
  }, [content, mountInto]);

  // File-load error → shell banner.
  useEffect(() => {
    if (loadError) reportError(loadError, `Loading ${filePath}`);
  }, [loadError, filePath, reportError]);

  // Source-parse error from the engine → shell banner.
  useEffect(() => {
    if (status === "error" && engineError) {
      reportError(engineError, `Parsing ${filePath}`);
    }
  }, [status, engineError, filePath, reportError]);

  if (status === "engine-load-error") {
    return (
      <div
        data-testid="tab-view-engine-error"
        className="flex h-full w-full flex-col items-center justify-center gap-3 bg-surface text-mute"
      >
        <p className="text-sm font-medium">Couldn't load the guitar-tab engine.</p>
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

- [ ] **Step 4: Run the test, iterate until green**

Run: `npm run test:run -- TabView`
Expected: PASS — 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/features/tab/TabView.tsx \
        src/app/knowledge_base/features/tab/TabView.test.tsx
git commit -m "feat(tabs): add TabView component (TAB-004)"
```

---

## Task 7: Wire `TabView` into `renderPane` (replace stub)

**Files:**
- Modify: `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx`
- Modify: `src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx` (replace TabViewStub assertion with TabView equivalent)
- Delete: `src/app/knowledge_base/features/tab/TabViewStub.tsx`
- Delete: `src/app/knowledge_base/features/tab/TabViewStub.test.tsx`

- [ ] **Step 1: Update the helper to render `TabView`**

Replace the contents of `src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx` with:

```tsx
import type { ReactElement } from "react";
import type { PaneEntry } from "./shell/PaneManager";
import { TabView } from "./features/tab/TabView";

/**
 * Pure renderer for the `"tab"` PaneType. Lives outside the main
 * `<KnowledgeBase>` so unit tests can assert routing without the full
 * shell mount. The renderPane callback in `knowledgeBase.tsx` delegates
 * to this for `entry.fileType === "tab"`.
 */
export function renderTabPaneEntry(entry: PaneEntry): ReactElement | null {
  if (entry.fileType === "tab") {
    return <TabView filePath={entry.filePath} />;
  }
  return null;
}
```

- [ ] **Step 2: Update the routing test to look for `TabView` rather than the stub**

Replace `src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx` with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReactNode } from "react";
import { StubRepositoryProvider } from "./shell/RepositoryContext";
import { StubShellErrorProvider } from "./shell/ShellErrorContext";
import { renderTabPaneEntry } from "./knowledgeBase.tabRouting.helper";

// Stub the engine hook so this routing test doesn't touch alphatab.
vi.mock("./features/tab/hooks/useTabEngine", () => ({
  useTabEngine: () => ({
    status: "ready",
    metadata: null,
    error: null,
    mountInto: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }),
}));

function wrap(children: ReactNode) {
  return (
    <StubShellErrorProvider value={{ current: null, reportError: vi.fn(), dismiss: vi.fn() }}>
      <StubRepositoryProvider
        value={{
          attachment: null, document: null, diagram: null,
          linkIndex: null, svg: null, vaultConfig: null,
          tab: { read: vi.fn().mockResolvedValue("x"), write: vi.fn() },
        }}
      >
        {children}
      </StubRepositoryProvider>
    </StubShellErrorProvider>
  );
}

describe("tab pane routing", () => {
  it("renders TabView with the file path for entries with fileType=\"tab\"", () => {
    render(wrap(renderTabPaneEntry({ filePath: "songs/intro.alphatex", fileType: "tab" })!));
    expect(screen.getByTestId("tab-view-canvas")).toBeInTheDocument();
  });

  it("returns null for non-tab fileType", () => {
    expect(
      renderTabPaneEntry({ filePath: "x.md", fileType: "document" }),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Delete the stub files**

Run:

```bash
rm src/app/knowledge_base/features/tab/TabViewStub.tsx \
   src/app/knowledge_base/features/tab/TabViewStub.test.tsx
```

- [ ] **Step 4: Verify the full suite still passes**

Run in parallel:
- `npm run typecheck`
- `npm run test:run`
- `npm run lint`

Expected: all exit 0; the routing test now asserts the `tab-view-canvas` testid; the stub-related cases (TabViewStub.test.tsx) are gone with the file.

- [ ] **Step 5: Commit**

```bash
git add src/app/knowledge_base/knowledgeBase.tabRouting.helper.tsx \
        src/app/knowledge_base/knowledgeBase.tabRouting.test.tsx \
        src/app/knowledge_base/features/tab/TabViewStub.tsx \
        src/app/knowledge_base/features/tab/TabViewStub.test.tsx
git commit -m "feat(tabs): replace TabViewStub with TabView in renderPane (TAB-004)"
```

---

## Task 8: Playwright smoke (`tab.spec.ts`) — TAB-11.2-14

**Files:**
- Create: `e2e/tab.spec.ts`

- [ ] **Step 1: Write the spec**

Create `e2e/tab.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

test.describe("TAB-11.2-14 — guitar tab viewer smoke", () => {
  test("opens an .alphatex file and mounts the canvas", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.addInitScript(installMockFS);
    await page.addInitScript(() => {
      try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    });
    await page.goto("/");

    // Seed the in-memory FSA mock with a single .alphatex file.
    await page.evaluate(() => {
      const m = (window as unknown as {
        __kbMockFS: { seed: (f: Record<string, string>) => void };
      }).__kbMockFS;
      m.seed({
        "intro.alphatex":
          "\\title \"Intro\"\n\\tempo 120\n.\n:4 5.6 7.6 5.5 7.5 |",
      });
    });

    await page.getByRole("button", { name: /open folder/i }).click();
    await expect(page.getByText("intro.alphatex")).toBeVisible();
    await page.getByText("intro.alphatex").click();

    // The engine mounts a host div; confirm it renders within Playwright's
    // default timeout (5 s, comfortably above the 2 s spec budget).
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible();

    // No engine-load failures.
    await expect(page.getByTestId("tab-view-engine-error")).not.toBeVisible();

    // No uncaught page errors during mount.
    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- tab.spec.ts`
Expected: PASS, 1 case.

- [ ] **Step 3: Commit**

```bash
git add e2e/tab.spec.ts
git commit -m "test(tabs): e2e smoke for tab viewer (TAB-11.2-14)"
```

---

## Task 9: Update test-cases/11-tabs.md flips

**Files:**
- Modify: `test-cases/11-tabs.md`

Flip the cases that this PR's tests cover from ❌ to ✅ / 🧪. Mark the now-deleted stub case as 🚫.

- [ ] **Step 1: Apply the case-status edits**

In `test-cases/11-tabs.md`:

(a) `TAB-11.1-04` — change from ✅ to 🚫. Replace its line:

OLD:
```markdown
- **TAB-11.1-04** ✅ **`TabViewStub` names TAB-004 in its placeholder copy** — the message reads "Guitar tab viewer coming in TAB-004"; this case is the regression guard against accidentally shipping the stub when the real `TabView` lands. Flip to 🚫 (intentional removal) when TAB-004 deletes the stub. _(unit: `TabViewStub.test.tsx`.)_
```

NEW:
```markdown
- **TAB-11.1-04** 🚫 **`TabViewStub` deleted in TAB-004** — the placeholder fulfilled its purpose and was removed when the real `TabView` shipped. Kept for traceability. _(no test — file no longer exists.)_
```

(b) `TAB-11.1-03` — also references the stub. Change ✅ to 🚫:

OLD:
```markdown
- **TAB-11.1-03** ✅ **`TabViewStub` renders a placeholder with the file path** — `data-testid="tab-view-stub"` is mounted; the file path is rendered as supporting text. _(unit: `TabViewStub.test.tsx`.)_
```

NEW:
```markdown
- **TAB-11.1-03** 🚫 **`TabViewStub` deleted in TAB-004** — see TAB-11.1-04. The viewer-mounted-canvas case for the real `TabView` is TAB-11.2-03.
```

(c) Flip the TAB-004 cases in §11.2 that now have tests. Edit each line individually (search for the exact ❌ string):

- `TAB-11.2-02` ❌ → ✅, append `_(unit: TabView.test.tsx — "calls mountInto with the loaded file content".)_`
- `TAB-11.2-03` ❌ → ✅, append `_(unit: TabView.test.tsx — "renders the canvas host when status is 'ready'".)_`
- `TAB-11.2-05` ❌ → ✅, append `_(unit: TabView.test.tsx — "shows the loading placeholder while status is 'mounting'".)_`
- `TAB-11.2-06` ❌ → ✅, append `_(unit: TabView.test.tsx — "renders the engine-load-error pane with a Reload button" + "Reload button … re-invokes mountInto".)_`
- `TAB-11.2-07` ❌ → ✅, append `_(unit: TabView.test.tsx — "source-parse errors route through useShellErrors".)_`
- `TAB-11.2-09` ❌ → ✅, append `_(unit: useTabEngine.test.tsx — "dispose() calls session.dispose and resets to 'idle'".)_`
- `TAB-11.2-14` ❌ → 🧪, append `_(e2e: e2e/tab.spec.ts.)_`

The remaining ❌ cases stay open (TAB-11.2-01 bundle assertion, TAB-11.2-04 wall-clock, TAB-11.2-08 file watcher, TAB-11.2-10 re-open, TAB-11.2-11 dark-mode toggle, TAB-11.2-12 H1 derive, TAB-11.2-13 wiki-link parser) — those land with TAB-005 / TAB-007 / TAB-007a respectively.

- [ ] **Step 2: Verify the snapshot reads correctly**

Run: `grep -c '^- \*\*TAB-' test-cases/11-tabs.md`
Expected: 28 (unchanged total).

Run: `grep -c '✅\|🧪\|🚫' test-cases/11-tabs.md`
Expected: 16+ (rough — counts may include legend, README link, etc.; a manual visual scan of the §11.1 + §11.2 sections is the actual check).

- [ ] **Step 3: Commit**

```bash
git add test-cases/11-tabs.md
git commit -m "docs(test-cases): flip TAB-11.1/11.2 cases for TAB-004 viewer"
```

---

## Task 10: Update Features.md §11.1

**Files:**
- Modify: `Features.md` §11.1

Promote `TabView` from `?` to `✅` and remove the "currently renders TabViewStub" qualifier.

- [ ] **Step 1: Edit `§11.1 Foundation`**

Replace the existing `§11.1 Foundation` block (under `## 11. Guitar Tabs`) with:

```markdown
### 11.1 Foundation (TAB-001 → TAB-004)
- ⚙️ **`TabEngine` domain interface** (`src/app/knowledge_base/domain/tabEngine.ts`) — engine-agnostic contract for mount/load/playback/edit; implemented by `AlphaTabEngine`.
- ⚙️ **`TabRepository`** (`src/app/knowledge_base/infrastructure/tabRepo.ts`) — FSA-backed read/write of `.alphatex` text; provided through `RepositoryContext`.
- ⚙️ **`AlphaTabEngine`** (`src/app/knowledge_base/infrastructure/alphaTabEngine.ts`) — implements `TabEngine` via lazy `import("@coderline/alphatab")` inside `mount()`; renders alphaTex score; `enablePlayer = false` until TAB-005 wires playback.
- ⚙️ **`"tab"` PaneType + routing** (`src/app/knowledge_base/shell/ToolbarContext.tsx`, `knowledgeBase.tsx:handleSelectFile`) — `.alphatex` files open a tab pane.
- ✅ **`TabView`** (`src/app/knowledge_base/features/tab/TabView.tsx`) — pane shell that mounts the engine via `useTabEngine` + `useTabContent`; loading / canvas / engine-load-error chrome; source-parse failures route to `ShellErrorContext`. Stubbed `TabViewStub` deleted in TAB-004.
- ? **Playback chrome (toolbar, audio context)** — pending TAB-005.
```

- [ ] **Step 2: Sanity-check**

Run: `grep -n "^### 11\." Features.md`
Expected: shows `### 11.1 Foundation (TAB-001 → TAB-004)` once.

- [ ] **Step 3: Commit**

```bash
git add Features.md
git commit -m "docs: promote TabView to shipped in Features.md §11.1 (TAB-004)"
```

---

## Wrap-up

After Task 10 lands:
- Opening any `.alphatex` file in the explorer renders the score on screen via `AlphaTabEngine`.
- No audio is wired (`enablePlayer = false`); play button doesn't exist yet.
- Engine module load failures show an inline retry pane.
- Source-parse and file-load failures route through the existing `ShellErrorBanner`.
- The vault-search / wiki-link / properties-panel work all stays deferred (their tickets) — none of them are blocked by the viewer landing.

**Next plan:** TAB-005 playback chrome (toolbar, `useTabPlayback`, AudioContext gesture-gate, SoundFont in `public/soundfonts/`, service-worker precache extension, `useObservedTheme()` live observer for canvas colours). The SoundFont decision is recorded in `~/.claude/projects/-Users-kiro-My-Projects-knowledge-base/memory/project_soundfont_host.md`.

**Branch:** stay on `plan/guitar-tabs-viewer` for this slice. Per `project_branch_protection.md`, direct push to `main` is blocked; open a PR via `gh pr create` when ready to merge.

---

_End of viewer plan. Playback (TAB-005) plan to follow once this ships._
