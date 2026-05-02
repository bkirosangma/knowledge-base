import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { FileWatcherProvider, useFileWatcher } from "./FileWatcherContext";

function Harness({ id = "test", onTick }: { id?: string; onTick: () => Promise<void> }) {
  const { subscribe, unsubscribe } = useFileWatcher();
  useEffect(() => {
    subscribe(id, onTick);
    return () => unsubscribe(id);
  }, [subscribe, unsubscribe, onTick, id]);
  return <button onClick={() => unsubscribe(id)}>unsub</button>;
}

describe("FileWatcherContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("SHELL-1.10-01: calls subscribers on the 5s interval", async () => {
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

  it("SHELL-1.10-02: refresh() calls every subscriber on the same tick (no stagger)", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const c = vi.fn().mockResolvedValue(undefined);
    function RefreshButton() {
      const { refresh } = useFileWatcher();
      return <button onClick={refresh}>refresh</button>;
    }
    render(
      <FileWatcherProvider>
        <Harness id="a" onTick={a} />
        <Harness id="b" onTick={b} />
        <Harness id="c" onTick={c} />
        <RefreshButton />
      </FileWatcherProvider>
    );
    await act(async () => screen.getByText("refresh").click());
    // All three must have fired; refresh() bypasses the 1-second stagger.
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it("SHELL-1.10-03: unsubscribe removes the subscriber", async () => {
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

  it("SHELL-1.10-04: throws when useFileWatcher is used outside provider", () => {
    function Bad() {
      useFileWatcher();
      return null;
    }
    expect(() => render(<Bad />)).toThrow(
      "useFileWatcher must be used within FileWatcherProvider"
    );
  });

  it("SHELL-1.10-05: backs off to 30s polling after 2 minutes idle", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );

    // Burn 24 active 5s cycles = 120s. Each cycle is still scheduled 5s
    // out because lastInputAtRef defaults to mount time.
    for (let i = 0; i < 24; i++) {
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
    }
    expect(tick).toHaveBeenCalledTimes(24);

    // Now we are >= 120s since last input. The very next scheduled poll
    // should sit on a 30s timer, not 5s. Advance 5s more — no fire.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(24);

    // Advance another 25s (30s total since last fire) — fires.
    await act(async () => {
      vi.advanceTimersByTime(25000);
    });
    expect(tick).toHaveBeenCalledTimes(25);

    // Stays on the 30s cadence while idle.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(25);
    await act(async () => {
      vi.advanceTimersByTime(25000);
    });
    expect(tick).toHaveBeenCalledTimes(26);
  });

  it("SHELL-1.10-06: a keypress while idle resumes 5s polling on the next cycle", async () => {
    const tick = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness onTick={tick} />
      </FileWatcherProvider>
    );

    // Drive the watcher into idle territory.
    for (let i = 0; i < 24; i++) {
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
    }
    // Confirm idle: 5s from now does NOT fire.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(24);

    // Send a keypress — this resets lastInputAt. Since the in-flight 30s
    // timer is still ticking, the resume happens on the cycle after that.
    // To match the spec literally ("resume 5s on next input"), we cancel
    // the pending timer and reschedule at +5s on input.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(tick).toHaveBeenCalledTimes(25);
  });

  it("SHELL-1.10-07: subscribers stagger across 1-second slots within a poll", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const c = vi.fn().mockResolvedValue(undefined);
    render(
      <FileWatcherProvider>
        <Harness id="a" onTick={a} />
        <Harness id="b" onTick={b} />
        <Harness id="c" onTick={c} />
      </FileWatcherProvider>
    );

    // Advance to first poll instant.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    // Slot 0 fires immediately.
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(c).not.toHaveBeenCalled();

    // +1s: slot 1.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();

    // +1s: slot 2.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).toHaveBeenCalledTimes(1);
  });

  it("SHELL-1.10-08: stagger order rotates round-robin across cycles", async () => {
    const calls: string[] = [];
    const make = (label: string) => () => {
      calls.push(label);
      return Promise.resolve();
    };
    const a = vi.fn(make("a"));
    const b = vi.fn(make("b"));
    const c = vi.fn(make("c"));
    render(
      <FileWatcherProvider>
        <Harness id="a" onTick={a} />
        <Harness id="b" onTick={b} />
        <Harness id="c" onTick={c} />
      </FileWatcherProvider>
    );

    // Cycle 1: t=5..7s → a, b, c
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(calls).toEqual(["a", "b", "c"]);

    // Cycle 2: t=10..12s → b, c, a
    await act(async () => {
      vi.advanceTimersByTime(3000); // to t=10s, slot 0 of cycle 2 fires
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(calls).toEqual(["a", "b", "c", "b", "c", "a"]);
  });

  it("SHELL-1.10-09: lastSyncedAt is exposed and updates after each poll", async () => {
    let captured: number | null = null;
    function Probe() {
      const { lastSyncedAt } = useFileWatcher();
      captured = lastSyncedAt;
      return null;
    }
    const startEpoch = Date.now();
    render(
      <FileWatcherProvider>
        <Probe />
      </FileWatcherProvider>
    );
    // Initialised to mount time.
    expect(captured).not.toBeNull();
    expect(captured!).toBeGreaterThanOrEqual(startEpoch);
    const initial = captured!;

    // Advance one poll cycle (no subscribers, but the cycle still updates the heartbeat).
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(captured!).toBeGreaterThanOrEqual(initial + 5000);
  });
});
