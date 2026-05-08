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
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { tauriBridge } from "../../infrastructure/tauriBridge";

interface FileWatcherContextValue {
  subscribe: (id: string, fn: () => Promise<void>) => void;
  unsubscribe: (id: string) => void;
  refresh: () => void;
  /**
   * Epoch ms of the most recent dispatched event (or mount time before
   * any event). Consumer chips like "Last synced N s ago" read this.
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

interface ProviderProps {
  vaultPath?: string | null;
  children: ReactNode;
}

export function FileWatcherProvider({ vaultPath, children }: ProviderProps) {
  const subscribersRef = useRef(new Map<string, () => Promise<void>>());
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(() => Date.now());

  const fanOut = useCallback(async () => {
    const subs = [...subscribersRef.current.values()];
    await Promise.allSettled(subs.map((fn) => fn()));
    setLastSyncedAt(Date.now());
  }, []);

  // Start/stop the Rust watcher around vault lifecycle.
  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    void tauriBridge.watchStart().catch((err) => {
      if (!cancelled) {
        // Log only; subscribers can still trigger manual refreshes via refresh().
        console.warn("[FileWatcher] watchStart failed:", err);
      }
    });
    return () => {
      cancelled = true;
      void tauriBridge.watchStop().catch(() => undefined);
    };
  }, [vaultPath]);

  // Listen for vault_change events and fan out to subscribers.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;
    void listen("vault_change", () => {
      void fanOut();
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fanOut]);

  const subscribe = useCallback((id: string, fn: () => Promise<void>) => {
    subscribersRef.current.set(id, fn);
  }, []);

  const unsubscribe = useCallback((id: string) => {
    subscribersRef.current.delete(id);
  }, []);

  const refresh = useCallback(() => {
    void fanOut();
  }, [fanOut]);

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
