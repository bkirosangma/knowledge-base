"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { useFileWatcher } from "../../../shared/context/FileWatcherContext";
import { useToast } from "../../../shell/ToastContext";
import type { HistoryCore } from "../../../shared/hooks/useHistoryCore";
import type { DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";

export interface UseDiagramFileWatcherOptions {
  activeFile: string | null;
  dirty: boolean;
  diskChecksumRef: React.RefObject<string>;
  getJsonFromDisk: () => Promise<{ json: string; checksum: string; snapshot: DiagramSnapshot } | null>;
  applySnapshot: (snapshot: DiagramSnapshot) => void;
  history: Pick<HistoryCore<DiagramSnapshot>, "recordAction" | "markSaved">;
  updateDiskChecksum: (checksum: string) => void;
}

export interface UseDiagramFileWatcherResult {
  conflictSnapshot: DiagramSnapshot | null;
  handleReloadFromDisk: () => void;
  handleKeepEdits: () => void;
  __test__: { checkForChanges: () => Promise<void> };
}

export function useDiagramFileWatcher({
  activeFile,
  dirty,
  diskChecksumRef,
  getJsonFromDisk,
  applySnapshot,
  history,
  updateDiskChecksum,
}: UseDiagramFileWatcherOptions): UseDiagramFileWatcherResult {
  const { subscribe, unsubscribe } = useFileWatcher();
  const { showToast } = useToast();
  const [conflictSnapshot, setConflictSnapshot] = useState<DiagramSnapshot | null>(null);
  const dismissedChecksumRef = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const checkForChanges = useCallback(async () => {
    if (!activeFile) return;
    const result = await getJsonFromDisk();
    if (!result) return;
    const { checksum, snapshot } = result;
    if (checksum === diskChecksumRef.current) return;
    if (checksum === dismissedChecksumRef.current) return;

    if (!dirtyRef.current) {
      history.recordAction("Reloaded from disk", snapshot);
      history.markSaved();
      applySnapshot(snapshot);
      updateDiskChecksum(checksum);
      showToast("File reloaded from disk");
    } else {
      setConflictSnapshot(snapshot);
    }
  }, [activeFile, getJsonFromDisk, diskChecksumRef, history, applySnapshot, updateDiskChecksum, showToast]);

  useEffect(() => {
    subscribe("content:diagram", checkForChanges);
    return () => unsubscribe("content:diagram");
  }, [subscribe, unsubscribe, checkForChanges]);

  useEffect(() => {
    dismissedChecksumRef.current = null;
  }, [activeFile]);

  const handleReloadFromDisk = useCallback(() => {
    if (!conflictSnapshot) return;
    const checksum = fnv1a(JSON.stringify(conflictSnapshot));
    history.recordAction("Reloaded from disk", conflictSnapshot);
    history.markSaved();
    applySnapshot(conflictSnapshot);
    updateDiskChecksum(checksum);
    dismissedChecksumRef.current = null;
    setConflictSnapshot(null);
    showToast("File reloaded from disk");
  }, [conflictSnapshot, history, applySnapshot, updateDiskChecksum, showToast]);

  const handleKeepEdits = useCallback(() => {
    if (!conflictSnapshot) return;
    dismissedChecksumRef.current = fnv1a(JSON.stringify(conflictSnapshot));
    setConflictSnapshot(null);
  }, [conflictSnapshot]);

  return { conflictSnapshot, handleReloadFromDisk, handleKeepEdits, __test__: { checkForChanges } };
}
