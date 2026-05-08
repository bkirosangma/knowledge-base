import type { ReactNode } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FileWatcherProvider,
  useFileWatcher,
} from "./FileWatcherContext";

// Capture the registered event handler so tests can fire it.
let registeredHandler: ((event: { payload: unknown }) => void) | null = null;
const unlistenMock = vi.fn();

// Use vi.hoisted so these are initialised before vi.mock factories run.
const { watchStartMock, watchStopMock, listenMock } = vi.hoisted(() => ({
  watchStartMock: vi.fn().mockResolvedValue(undefined),
  watchStopMock: vi.fn().mockResolvedValue(undefined),
  listenMock: vi.fn(),
}));

// Re-arm the listen mock implementation each test (mockClear in beforeEach
// wipes the implementation along with call history).
function armListenMock() {
  listenMock.mockImplementation(
    async (_name: string, handler: (e: { payload: unknown }) => void) => {
      registeredHandler = handler;
      return unlistenMock;
    },
  );
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: listenMock,
}));

vi.mock("../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    watchStart: watchStartMock,
    watchStop: watchStopMock,
  },
}));

describe("FileWatcherContext", () => {
  beforeEach(() => {
    registeredHandler = null;
    watchStartMock.mockClear();
    watchStopMock.mockClear();
    unlistenMock.mockClear();
    listenMock.mockClear();
    armListenMock();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  function wrapper(vaultPath: string | null) {
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <FileWatcherProvider vaultPath={vaultPath}>{children}</FileWatcherProvider>
      );
    }
    return Wrapper;
  }

  it("calls watchStart when vaultPath is set and watchStop on unmount", async () => {
    const { unmount } = render(
      <FileWatcherProvider vaultPath="/tmp/vault">{null}</FileWatcherProvider>,
    );
    // microtask flush
    await Promise.resolve();
    expect(watchStartMock).toHaveBeenCalledTimes(1);

    unmount();
    await Promise.resolve();
    expect(watchStopMock).toHaveBeenCalledTimes(1);
  });

  it("does not call watchStart or listen when vaultPath is null", async () => {
    render(<FileWatcherProvider vaultPath={null}>{null}</FileWatcherProvider>);
    await Promise.resolve();
    // Both Tauri APIs reach into window.__TAURI_INTERNALS__, which is
    // undefined in test wrappers that don't mock @tauri-apps/api/*.
    // The provider must remain inert until vaultPath is set.
    expect(watchStartMock).not.toHaveBeenCalled();
    expect(listenMock).not.toHaveBeenCalled();
  });

  it("fires every subscriber on each vault_change event and updates lastSyncedAt", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve(); // let listen() resolve

    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    act(() => {
      result.current.subscribe("a", a);
      result.current.subscribe("b", b);
    });

    const beforeAt = result.current.lastSyncedAt;
    await act(async () => {
      registeredHandler?.({ payload: { kind: "modified", path: "a.md" } });
      // allow Promise.allSettled to flush
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(result.current.lastSyncedAt).toBeGreaterThanOrEqual(beforeAt);
  });

  it("refresh() triggers an immediate fan-out", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve();

    const fn = vi.fn().mockResolvedValue(undefined);
    act(() => result.current.subscribe("x", fn));

    await act(async () => {
      result.current.refresh();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("unsubscribe removes the callback", async () => {
    const { result } = renderHook(() => useFileWatcher(), {
      wrapper: wrapper("/tmp/vault"),
    });
    await Promise.resolve();

    const fn = vi.fn().mockResolvedValue(undefined);
    act(() => result.current.subscribe("x", fn));
    act(() => result.current.unsubscribe("x"));

    await act(async () => {
      registeredHandler?.({ payload: { kind: "modified", path: "a.md" } });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fn).not.toHaveBeenCalled();
  });
});
