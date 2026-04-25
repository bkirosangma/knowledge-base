import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { FileWatcherProvider, useFileWatcher } from "./FileWatcherContext";

function Harness({ onTick }: { onTick: () => Promise<void> }) {
  const { subscribe, unsubscribe } = useFileWatcher();
  const ref = { current: false };
  if (!ref.current) {
    ref.current = true;
    subscribe("test", onTick);
  }
  return <button onClick={() => unsubscribe("test")}>unsub</button>;
}

describe("FileWatcherContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("calls subscribers on the 5s interval", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );
    expect(tick).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(2);
  });

  it("refresh() calls all subscribers immediately", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    function RefreshButton() {
      const { refresh, subscribe } = useFileWatcher();
      subscribe("r", tick);
      return <button onClick={refresh}>refresh</button>;
    }
    render(
      <FileWatcherProvider>
        <RefreshButton />
      </FileWatcherProvider>
    );
    await act(async () => screen.getByRole("button").click());
    expect(tick).toHaveBeenCalledOnce();
  });

  it("unsubscribe removes the subscriber", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );
    await act(async () => screen.getByRole("button").click()); // unsubscribe
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).not.toHaveBeenCalled();
  });

  it("throws when useFileWatcher is used outside provider", () => {
    function Bad() {
      useFileWatcher();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(
      "useFileWatcher must be used within FileWatcherProvider"
    );
  });
});
