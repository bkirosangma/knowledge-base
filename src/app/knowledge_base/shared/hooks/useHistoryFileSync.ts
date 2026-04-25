// src/app/knowledge_base/shared/hooks/useHistoryFileSync.ts
import { useRef, useCallback } from "react";
import type React from "react";
import { useHistoryCore } from "./useHistoryCore";
import type { HistoryCore } from "./useHistoryCore";
import { fnv1a, readHistoryFile, writeHistoryFile } from "../utils/historyPersistence";
import type { HistoryEntry } from "../utils/historyPersistence";

export type { HistoryEntry };
export type { HistoryCore };

export interface HistoryFileSync<T> extends HistoryCore<T> {
  initHistory(
    fileContent: string,
    initialSnapshot: T,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ): Promise<void>;
  onFileSave(fileContent: string): void;
  clearHistory(): void;
  readonly diskChecksumRef: React.RefObject<string>;
}

export function useHistoryFileSync<T>(): HistoryFileSync<T> {
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const activeFileRef = useRef<string | null>(null);
  const checksumRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coreRef = useRef<HistoryCore<T> | null>(null);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const handle = dirHandleRef.current;
      const file = activeFileRef.current;
      const c = coreRef.current;
      if (!handle || !file || !c) return;
      const { entries, currentIndex, savedIndex } = c.getLatestState();
      writeHistoryFile(handle, file, {
        checksum: checksumRef.current,
        currentIndex,
        savedIndex,
        entries,
      });
    }, 1000);
  }, []);

  const core = useHistoryCore<T>({ onStateChange: scheduleSave });
  coreRef.current = core;

  const initHistory = useCallback(async (
    fileContent: string,
    initialSnapshot: T,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ) => {
    dirHandleRef.current = dirHandle;
    activeFileRef.current = filePath;
    const checksum = fnv1a(fileContent);
    checksumRef.current = checksum;

    if (!dirHandle || !filePath) {
      const entry: HistoryEntry<T> = {
        id: 0,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      core.initEntries([entry], 0, 0);
      return;
    }

    const histFile = await readHistoryFile<T>(dirHandle, filePath);
    if (histFile && histFile.checksum === checksum && histFile.entries.length > 0) {
      core.initEntries(
        histFile.entries,
        Math.min(histFile.currentIndex, histFile.entries.length - 1),
        Math.min(histFile.savedIndex ?? 0, histFile.entries.length - 1),
      );
    } else {
      const entry: HistoryEntry<T> = {
        id: 0,
        description: "File loaded",
        timestamp: Date.now(),
        snapshot: initialSnapshot,
      };
      core.initEntries([entry], 0, 0);
      scheduleSave();
    }
  }, [core.initEntries, scheduleSave]);

  const onFileSave = useCallback((fileContent: string) => {
    checksumRef.current = fnv1a(fileContent);
    core.markSaved();
  }, [core.markSaved]);

  const clearHistory = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    dirHandleRef.current = null;
    activeFileRef.current = null;
    checksumRef.current = "";
    core.clear();
  }, [core.clear]);

  return {
    ...core,
    initHistory,
    onFileSave,
    clearHistory,
    diskChecksumRef: checksumRef,
  };
}
