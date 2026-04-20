import { useState, useRef, useCallback } from "react";
import type { HistoryEntry } from "../utils/historyPersistence";

export type { HistoryEntry };

const MAX_HISTORY = 100;

export interface HistoryCore<T> {
  entries: HistoryEntry<T>[];
  currentIndex: number;
  savedIndex: number;
  savedEntryPinned: boolean;
  canUndo: boolean;
  canRedo: boolean;
  recordAction(description: string, snapshot: T): void;
  undo(): T | null;
  redo(): T | null;
  goToEntry(index: number): T | null;
  goToSaved(): T | null;
  initEntries(entries: HistoryEntry<T>[], currentIndex: number, savedIndex: number): void;
  markSaved(): void;
  clear(): void;
  getLatestState(): { entries: HistoryEntry<T>[]; currentIndex: number; savedIndex: number };
}

export function useHistoryCore<T>(options?: { onStateChange?: () => void }): HistoryCore<T> {
  const entriesRef = useRef<HistoryEntry<T>[]>([]);
  const indexRef = useRef(-1);
  const savedIndexRef = useRef(-1);
  const savedEntryPinnedRef = useRef(false);
  const nextIdRef = useRef(0);
  const onStateChangeRef = useRef(options?.onStateChange);
  onStateChangeRef.current = options?.onStateChange;

  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender((n) => n + 1), []);

  const notify = useCallback(() => {
    tick();
    onStateChangeRef.current?.();
  }, [tick]);

  const entries = entriesRef.current;
  const currentIndex = indexRef.current;
  const savedIndex = savedIndexRef.current;
  const savedEntryPinned = savedEntryPinnedRef.current;
  const minUndoIndex = savedEntryPinnedRef.current ? 1 : 0;
  const canUndo = indexRef.current > minUndoIndex;
  const canRedo = indexRef.current < entriesRef.current.length - 1;

  const initEntries = useCallback((
    newEntries: HistoryEntry<T>[],
    newCurrentIndex: number,
    newSavedIndex: number,
  ) => {
    nextIdRef.current = newEntries.length > 0
      ? Math.max(...newEntries.map((e) => e.id)) + 1
      : 0;
    entriesRef.current = newEntries;
    indexRef.current = Math.min(newCurrentIndex, newEntries.length - 1);
    savedIndexRef.current = Math.min(newSavedIndex, newEntries.length - 1);
    savedEntryPinnedRef.current = false;
    tick();
  }, [tick]);

  const recordAction = useCallback((description: string, snapshot: T) => {
    const base = entriesRef.current.slice(0, indexRef.current + 1);
    const entry: HistoryEntry<T> = {
      id: nextIdRef.current++,
      description,
      timestamp: Date.now(),
      snapshot,
    };
    const next = [...base, entry];
    const savedIdx = savedIndexRef.current;
    // Check if saved entry would be pruned
    const wouldPruneSaved = savedIdx >= 0 && savedIdx < Math.max(0, next.length - MAX_HISTORY);
    // If saved would be pruned, we need to prune to MAX_HISTORY-1 to leave room for it
    const targetLength = wouldPruneSaved ? MAX_HISTORY - 1 : MAX_HISTORY;
    const pruned = Math.max(0, next.length - targetLength);

    if (pruned > 0) {
      if (wouldPruneSaved) {
        // Pin the saved entry at index 0
        const savedEntry = next[savedIdx];
        const capped = [savedEntry, ...next.slice(pruned)];
        entriesRef.current = capped;
        indexRef.current = capped.length - 1;
        savedIndexRef.current = 0;
        savedEntryPinnedRef.current = true;
      } else {
        const capped = next.slice(pruned);
        entriesRef.current = capped;
        indexRef.current = capped.length - 1;
        savedIndexRef.current = savedIdx - pruned < 0 ? -1 : savedIdx - pruned;
      }
    } else {
      entriesRef.current = next;
      indexRef.current = next.length - 1;
    }
    notify();
  }, [notify]);

  const undo = useCallback((): T | null => {
    const minIndex = savedEntryPinnedRef.current ? 1 : 0;
    if (indexRef.current <= minIndex) return null;
    indexRef.current -= 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const redo = useCallback((): T | null => {
    if (indexRef.current >= entriesRef.current.length - 1) return null;
    indexRef.current += 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const goToEntry = useCallback((index: number): T | null => {
    if (index < 0 || index >= entriesRef.current.length) return null;
    indexRef.current = index;
    const snapshot = entriesRef.current[index]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const goToSaved = useCallback((): T | null => {
    if (savedIndexRef.current < 0 || savedIndexRef.current >= entriesRef.current.length) return null;
    indexRef.current = savedIndexRef.current;
    const snapshot = entriesRef.current[savedIndexRef.current]?.snapshot ?? null;
    notify();
    return snapshot;
  }, [notify]);

  const markSaved = useCallback(() => {
    savedIndexRef.current = indexRef.current;
    savedEntryPinnedRef.current = false;
    notify();
  }, [notify]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    indexRef.current = -1;
    savedIndexRef.current = -1;
    savedEntryPinnedRef.current = false;
    tick();
  }, [tick]);

  const getLatestState = useCallback(() => ({
    entries: entriesRef.current,
    currentIndex: indexRef.current,
    savedIndex: savedIndexRef.current,
  }), []);

  return {
    entries,
    currentIndex,
    savedIndex,
    savedEntryPinned,
    canUndo,
    canRedo,
    initEntries,
    recordAction,
    undo,
    redo,
    goToEntry,
    goToSaved,
    markSaved,
    clear,
    getLatestState,
  };
}
