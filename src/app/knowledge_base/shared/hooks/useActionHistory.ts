import { useState, useRef, useCallback } from "react";
import type { LayerDef, Connection, SerializedNodeData, LineCurveAlgorithm, FlowDef } from "../utils/types";

/* ── FNV-1a hash (fast, non-cryptographic) ── */

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/* ── Types ── */

export interface DiagramSnapshot {
  title: string;
  layerDefs: LayerDef[];
  nodes: SerializedNodeData[];
  connections: Connection[];
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>;
  lineCurve: LineCurveAlgorithm;
  flows: FlowDef[];
}

export interface HistoryEntry {
  id: number;
  description: string;
  timestamp: number;
  snapshot: DiagramSnapshot;
}

interface HistoryFile {
  checksum: string;
  currentIndex: number;
  savedIndex: number;
  entries: HistoryEntry[];
}

const MAX_HISTORY = 100;

/* ── File System helpers ── */

function historyFileName(diagramPath: string): string {
  const parts = diagramPath.split("/");
  const name = parts.pop()!;
  const dir = parts.join("/");
  const histName = `.${name.replace(/\.json$/, "")}.history.json`;
  return dir ? `${dir}/${histName}` : histName;
}

async function resolveParentHandle(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop(); // remove filename
  let current = rootHandle;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

async function readHistoryFile(
  rootHandle: FileSystemDirectoryHandle,
  diagramPath: string,
): Promise<HistoryFile | null> {
  try {
    const histPath = historyFileName(diagramPath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as HistoryFile;
  } catch {
    return null;
  }
}

async function writeHistoryFile(
  rootHandle: FileSystemDirectoryHandle,
  diagramPath: string,
  data: HistoryFile,
): Promise<void> {
  try {
    const histPath = historyFileName(diagramPath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  } catch {
    // Silently ignore write failures
  }
}

/* ── Hook ──
 *
 * Refs are the source of truth for entries/index.
 * useState is only used to trigger re-renders.
 * This avoids nested-setState race conditions and ensures
 * undo/redo/goToEntry can synchronously return snapshots.
 */

export function useActionHistory() {
  // Refs = source of truth
  const entriesRef = useRef<HistoryEntry[]>([]);
  const indexRef = useRef(-1);
  const savedIndexRef = useRef(0);
  const nextIdRef = useRef(0);
  const checksumRef = useRef("");
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State = render triggers only (always mirrored from refs)
  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender((n) => n + 1), []);

  // Derived (read from refs so they're always current)
  const entries = entriesRef.current;
  const currentIndex = indexRef.current;
  const savedIndex = savedIndexRef.current;
  const minUndoIndex = (savedIndexRef.current === 0 && entriesRef.current.length > 1) ? 1 : 0;
  const canUndo = indexRef.current > minUndoIndex;
  const canRedo = indexRef.current < entriesRef.current.length - 1;

  /** Schedule a debounced write of the history file to disk */
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const handle = dirHandleRef.current;
      const file = activeFileRef.current;
      if (!handle || !file) return;
      writeHistoryFile(handle, file, {
        checksum: checksumRef.current,
        currentIndex: indexRef.current,
        savedIndex: savedIndexRef.current,
        entries: entriesRef.current,
      });
    }, 1000);
  }, []);

  /**
   * Record a new action.
   * Truncates all future entries (forked branch) and caps at MAX_HISTORY.
   */
  const recordAction = useCallback((description: string, snapshot: DiagramSnapshot) => {
    // Truncate: discard everything after currentIndex
    const base = entriesRef.current.slice(0, indexRef.current + 1);
    const entry: HistoryEntry = {
      id: nextIdRef.current++,
      description,
      timestamp: Date.now(),
      snapshot,
    };
    const next = [...base, entry];
    // Cap at MAX_HISTORY, keeping the most recent entries
    const pruned = Math.max(0, next.length - MAX_HISTORY);
    if (pruned > 0) {
      const savedIdx = savedIndexRef.current;
      if (savedIdx >= 0 && savedIdx < pruned) {
        // Pin the saved entry at index 0 — it survives pruning
        const savedEntry = next[savedIdx];
        const capped = [savedEntry, ...next.slice(pruned)];
        entriesRef.current = capped;
        indexRef.current = capped.length - 1;
        savedIndexRef.current = 0;
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
    tick();
    scheduleSave();
  }, [tick, scheduleSave]);

  /** Undo — returns snapshot to restore, or null if can't undo */
  const undo = useCallback((): DiagramSnapshot | null => {
    // If saved entry is pinned at index 0, undo stops at index 1
    const minIndex = (savedIndexRef.current === 0 && entriesRef.current.length > 1) ? 1 : 0;
    if (indexRef.current <= minIndex) return null;
    indexRef.current -= 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    tick();
    scheduleSave();
    return snapshot;
  }, [tick, scheduleSave]);

  /** Redo — returns snapshot to restore, or null if can't redo */
  const redo = useCallback((): DiagramSnapshot | null => {
    if (indexRef.current >= entriesRef.current.length - 1) return null;
    indexRef.current += 1;
    const snapshot = entriesRef.current[indexRef.current]?.snapshot ?? null;
    tick();
    scheduleSave();
    return snapshot;
  }, [tick, scheduleSave]);

  /** Jump to any entry — returns its snapshot */
  const goToEntry = useCallback((index: number): DiagramSnapshot | null => {
    if (index < 0 || index >= entriesRef.current.length) return null;
    indexRef.current = index;
    const snapshot = entriesRef.current[index]?.snapshot ?? null;
    tick();
    scheduleSave();
    return snapshot;
  }, [tick, scheduleSave]);

  /**
   * Initialize history for a file. Loads from disk, validates checksum.
   * If checksum mismatches (external edit), resets with initial snapshot.
   */
  const initHistory = useCallback(async (
    diagramJson: string,
    initialSnapshot: DiagramSnapshot,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ) => {
    dirHandleRef.current = dirHandle;
    activeFileRef.current = filePath;
    const checksum = fnv1a(diagramJson);
    checksumRef.current = checksum;

    if (!dirHandle || !filePath) {
      const entry: HistoryEntry = {
        id: nextIdRef.current++,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      entriesRef.current = [entry];
      indexRef.current = 0;
      savedIndexRef.current = 0;
      tick();
      return;
    }

    // Try loading existing history
    const histFile = await readHistoryFile(dirHandle, filePath);
    if (histFile && histFile.checksum === checksum && histFile.entries.length > 0) {
      // Checksum matches — restore history
      nextIdRef.current = Math.max(0, ...histFile.entries.map((e) => e.id)) + 1;
      entriesRef.current = histFile.entries;
      indexRef.current = Math.min(histFile.currentIndex, histFile.entries.length - 1);
      savedIndexRef.current = Math.min(histFile.savedIndex ?? 0, histFile.entries.length - 1);
    } else {
      // Checksum mismatch or no history — fresh start
      const entry: HistoryEntry = {
        id: nextIdRef.current++,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      entriesRef.current = [entry];
      indexRef.current = 0;
      savedIndexRef.current = 0;
      scheduleSave();
    }
    tick();
  }, [tick, scheduleSave]);

  /** Called after a successful file save — update the checksum and mark saved position. */
  const onSave = useCallback((diagramJson: string) => {
    checksumRef.current = fnv1a(diagramJson);
    savedIndexRef.current = indexRef.current;
    tick();
    scheduleSave();
  }, [tick, scheduleSave]);

  /** Clear history (e.g., when closing folder) */
  const clearHistory = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    entriesRef.current = [];
    indexRef.current = -1;
    savedIndexRef.current = -1;
    dirHandleRef.current = null;
    activeFileRef.current = null;
    checksumRef.current = "";
    tick();
  }, [tick]);

  /** Jump to the last saved position — returns its snapshot, or null if saved state was pruned */
  const goToSaved = useCallback((): DiagramSnapshot | null => {
    if (savedIndexRef.current < 0 || savedIndexRef.current >= entriesRef.current.length) return null;
    indexRef.current = savedIndexRef.current;
    const snapshot = entriesRef.current[savedIndexRef.current]?.snapshot ?? null;
    tick();
    scheduleSave();
    return snapshot;
  }, [tick, scheduleSave]);

  return {
    entries,
    currentIndex,
    savedIndex,
    canUndo,
    canRedo,
    recordAction,
    undo,
    redo,
    goToEntry,
    goToSaved,
    initHistory,
    onSave,
    clearHistory,
  };
}
