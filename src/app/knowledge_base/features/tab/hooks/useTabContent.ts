"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSystemError, classifyError } from "../../../domain/errors";
import { serializeScoreToAlphatex } from "../../../infrastructure/alphaTexExporter";
import { useRepositories } from "../../../shell/RepositoryContext";
import { fnv1a } from "../../../shared/utils/historyPersistence";

/** Debounce window in milliseconds — mirrors useDocumentContent. */
const DRAFT_DEBOUNCE_MS = 500;

export interface UseTabContent {
  // Read-only flow (unchanged):
  content: string | null;
  loadError: FileSystemError | null;
  refresh: () => Promise<void>;

  // Editor flow (read-only callers can ignore):
  /** The most-recently committed Score; null until setScore() is called. */
  score: unknown | null;
  /** Call after each successful applyEdit. Marks dirty=true and schedules a debounced flush. */
  setScore: (score: unknown) => void;
  /** true between setScore() and a successful flush(). */
  dirty: boolean;
  /** Serialize + write immediately; also called internally by the debounce timer. */
  flush: () => Promise<void>;
  /** Surfaces tabRepo.write failures; dirty stays true on failure so callers can retry. */
  saveError: FileSystemError | null;

  // Disk-state tracking for TAB-11.2-08 (`useTabFileWatcher`):
  /** Last-known disk checksum, kept fresh on load + flush. Mirrors `useDocumentContent`. */
  diskChecksumRef: React.RefObject<string>;
  /** Update after a successful watcher reload to suppress duplicate prompts. */
  updateDiskChecksum: (checksum: string) => void;
}

/**
 * Reads the `.alphatex` file via `useRepositories().tab` and exposes the
 * raw text + any load error.
 *
 * Extended in TAB-008 with dirty/score/flush for the editor flow.
 * Read-only callers (viewer) can ignore the new fields — they default to
 * null/false/no-op on mount.
 *
 * NOTE (follow-up): The sidecar write-side (calling tabRefs.write after
 * apply succeeds for set-section / add-bar / remove-bar) is editor-chunk
 * wiring deferred to TabEditor.tsx — not part of T18.
 */
export function useTabContent(path: string | null): UseTabContent {
  const { tab } = useRepositories();

  // --- Read-only state ---
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<FileSystemError | null>(null);

  // Disk-state tracking for the watcher hook (TAB-11.2-08).
  // Kept as a ref (not state) because subscribers read it across renders
  // without needing to re-render on change.
  const diskChecksumRef = useRef<string>("");
  const updateDiskChecksum = useCallback((checksum: string) => {
    diskChecksumRef.current = checksum;
  }, []);

  const load = useCallback(async (p: string | null) => {
    if (!p || !tab) {
      setContent(null);
      setLoadError(null);
      diskChecksumRef.current = "";
      return;
    }
    try {
      const text = await tab.read(p);
      setContent(text);
      setLoadError(null);
      diskChecksumRef.current = fnv1a(text);
    } catch (e) {
      setContent(null);
      setLoadError(e instanceof FileSystemError ? e : classifyError(e));
    }
  }, [tab]);

  useEffect(() => { void load(path); }, [load, path]);

  const refresh = useCallback(() => load(path), [load, path]);

  // --- Editor flow state ---
  const [score, setScoreState] = useState<unknown | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<FileSystemError | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestScoreRef = useRef<unknown | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    const s = latestScoreRef.current;
    if (!s || !path || !tab) return;
    try {
      // serializeScoreToAlphatex does a lazy dynamic import — no alphatab
      // on the main bundle for read-only flows.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = await serializeScoreToAlphatex(s as any);
      await tab.write(path, text);
      // Refresh the disk-checksum ref so the watcher's checkForChanges
      // recognises the next vault_change for this path as our own write
      // and bails before flagging a conflict.
      diskChecksumRef.current = fnv1a(text);
      setDirty(false);
      setSaveError(null);
    } catch (err) {
      setSaveError(classifyError(err));
      // Keep dirty=true so the editor can retry or warn the user.
    }
  }, [path, tab]);

  const setScore = useCallback((newScore: unknown) => {
    latestScoreRef.current = newScore;
    setScoreState(newScore);
    setDirty(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DRAFT_DEBOUNCE_MS);
  }, [flush]);

  // #17 fix (TAB-008b): reset dirty / saveError / cancel pending debounce when
  // the file path changes. The pending flush still writes to the previous path
  // because `flush` captures `path` in its closure — that's the desired behavior
  // (don't lose the user's prior-file edits). What we reset is the *UI* state
  // that incorrectly indicates the new file is dirty.
  useEffect(() => {
    setDirty(false);
    setSaveError(null);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [path]);

  // Cancel any pending debounce on unmount.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return {
    content,
    loadError,
    refresh,
    score,
    setScore,
    dirty,
    flush,
    saveError,
    diskChecksumRef,
    updateDiskChecksum,
  };
}
