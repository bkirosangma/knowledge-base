"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";

const POLL_INTERVAL_MS = 5000;

interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runAll = useCallback(async () => {
    // allSettled so one failing subscriber doesn't prevent others from running
    await Promise.allSettled(
      [...subscribersRef.current.values()].map((fn) => fn())
    );
  }, []);

  const subscribe = useCallback((id: string, fn: () => Promise<void>) => {
    subscribersRef.current.set(id, fn);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const refresh = useCallback(() => {
    void runAll();
  }, [runAll]);

  useEffect(() => {
    const start = () => {
      intervalRef.current = setInterval(
        () => void runAll(),
        POLL_INTERVAL_MS
      );
    };
    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    start();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        stop();
        void runAll(); // catch up immediately on tab focus
        start();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runAll]);

  return (
    <FileWatcherContext.Provider value={{ subscribe, unsubscribe, refresh }}>
      {children}
    </FileWatcherContext.Provider>
  );
}
