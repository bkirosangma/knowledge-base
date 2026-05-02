"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 30000;
const IDLE_THRESHOLD_MS = 2 * 60 * 1000;
const SUBSCRIBER_SLOT_MS = 1000;

interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
  /**
   * Epoch ms of the most recent completed poll cycle. Initialised at mount
   * so consumer chips ("Last synced N s ago") have something meaningful to
   * show before the first 5 s tick.
   */
  lastSyncedAt: number;
}

const FileWatcherContext = createContext<FileWatcherContextValue | null>(null);

export function useFileWatcher(): FileWatcherContextValue {
  const ctx = useContext(FileWatcherContext);
  if (!ctx)
    throw new Error(
      "useFileWatcher must be used within FileWatcherProvider"
    );
  return ctx;
}

export function FileWatcherProvider({ children }: { children: ReactNode }) {
  const subscribersRef = useRef(new Map<string, () => Promise<void>>());
  const slotTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleCountRef = useRef<number>(0);
  const scheduleNextRef = useRef<(() => void) | null>(null);
  // useState's lazy initializer is the React-blessed way to read an impure
  // source (Date.now()) once at mount; we mirror it into a ref for the
  // poll loop and event listeners, which need mutable access without
  // triggering re-renders.
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now());
  const lastInputAtRef = useRef<number>(lastSyncedAt);

  // Background poll: stagger subscribers across 1 s slots so a tick with N
  // subscribers doesn't flood the disk all at once.
  const runStaggered = useCallback(async () => {
    // Clear any in-flight slot timers from a previous (overlapping) cycle.
    slotTimeoutsRef.current.forEach((t) => clearTimeout(t));
    slotTimeoutsRef.current.clear();

    const subs = [...subscribersRef.current.entries()];
    if (subs.length === 0) {
      setLastSyncedAt(Date.now());
      return;
    }

    // Round-robin: rotate which subscriber owns slot 0 each cycle so no
    // single subscriber is permanently last.
    const start = cycleCountRef.current % subs.length;
    cycleCountRef.current = cycleCountRef.current + 1;
    const ordered = [...subs.slice(start), ...subs.slice(0, start)];

    const settlements = ordered.map(([, fn], slotIndex) => {
      // Slot 0 fires synchronously on the poll tick (matches the prior
      // setInterval semantics and keeps fake-timer tests deterministic —
      // a nested setTimeout(fn, 0) is not drained inside the same
      // advanceTimersByTime window). Slots 1..N-1 stagger at 1 s steps.
      if (slotIndex === 0) {
        return fn().catch(() => undefined);
      }
      return new Promise<void>((resolve) => {
        const handle = setTimeout(() => {
          slotTimeoutsRef.current.delete(handle);
          void fn()
            .catch(() => undefined)
            .finally(() => resolve());
        }, slotIndex * SUBSCRIBER_SLOT_MS);
        slotTimeoutsRef.current.add(handle);
      });
    });

    await Promise.all(settlements);
    setLastSyncedAt(Date.now());
  }, []);

  // User-triggered refresh: fires every subscriber on the same tick. The
  // manual "I want it now" intent overrides the stagger that exists to
  // smooth out background poll storms.
  const runImmediate = useCallback(async () => {
    const subs = [...subscribersRef.current.values()];
    await Promise.allSettled(subs.map((fn) => fn()));
    setLastSyncedAt(Date.now());
  }, []);

  const subscribe = useCallback((id: string, fn: () => Promise<void>) => {
    subscribersRef.current.set(id, fn);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const refresh = useCallback(() => {
    void runImmediate();
  }, [runImmediate]);

  // Poll loop with idle backoff. We use a self-rescheduling setTimeout
  // (rather than setInterval) so each cycle picks 5 s vs 30 s based on the
  // freshest input timestamp.
  useEffect(() => {
    let cancelled = false;
    const slotTimeouts = slotTimeoutsRef.current;

    const cancelPending = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const scheduleNext = () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        // Hidden tab: don't schedule. Visibility listener resumes us.
        return;
      }
      const idleMs = Date.now() - lastInputAtRef.current;
      const interval = idleMs >= IDLE_THRESHOLD_MS ? IDLE_POLL_MS : ACTIVE_POLL_MS;
      pollTimeoutRef.current = setTimeout(() => {
        pollTimeoutRef.current = null;
        void runStaggered();
        scheduleNext();
      }, interval);
    };

    scheduleNextRef.current = () => {
      cancelPending();
      scheduleNext();
    };

    scheduleNext();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        cancelPending();
      } else {
        // Resume: treat focus as input activity, fire an immediate catch-up
        // (tab was hidden — user wants the latest disk state now, not
        // staggered over the next N seconds), and re-arm the active cadence.
        lastInputAtRef.current = Date.now();
        cancelPending();
        void runImmediate();
        scheduleNext();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      cancelPending();
      slotTimeouts.forEach((t) => clearTimeout(t));
      slotTimeouts.clear();
      document.removeEventListener("visibilitychange", handleVisibility);
      scheduleNextRef.current = null;
    };
  }, [runStaggered, runImmediate]);

  // Track input activity. On any input we stamp lastInputAt and, when the
  // pending poll is sitting on the 30 s idle timer, immediately reschedule
  // it at the 5 s active cadence so the user-perceived "I touched the app,
  // it should refresh" promise holds.
  useEffect(() => {
    const onInput = () => {
      const wasIdle = Date.now() - lastInputAtRef.current >= IDLE_THRESHOLD_MS;
      lastInputAtRef.current = Date.now();
      if (wasIdle) scheduleNextRef.current?.();
    };
    window.addEventListener("keydown", onInput, { passive: true });
    window.addEventListener("pointermove", onInput, { passive: true });
    window.addEventListener("scroll", onInput, { passive: true, capture: true });
    return () => {
      window.removeEventListener("keydown", onInput);
      window.removeEventListener("pointermove", onInput);
      window.removeEventListener("scroll", onInput, { capture: true } as EventListenerOptions);
    };
  }, []);

  const value = useMemo<FileWatcherContextValue>(
    () => ({ subscribe, unsubscribe, refresh, lastSyncedAt }),
    [subscribe, unsubscribe, refresh, lastSyncedAt],
  );

  return (
    <FileWatcherContext.Provider value={value}>
      {children}
    </FileWatcherContext.Provider>
  );
}
