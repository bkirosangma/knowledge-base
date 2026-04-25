"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [conflictState, setConflictState] = useState<{ snapshot: DiagramSnapshot; checksum: string } | null>(null);
  const conflictSnapshot = conflictState?.snapshot ?? null;
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
      setConflictState({ snapshot, checksum });
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
    if (!conflictState) return;
    const { snapshot, checksum } = conflictState;
    history.recordAction("Reloaded from disk", snapshot);
    history.markSaved();
    applySnapshot(snapshot);
    updateDiskChecksum(checksum);
    dismissedChecksumRef.current = null;
    setConflictState(null);
    showToast("File reloaded from disk");
  }, [conflictState, history, applySnapshot, updateDiskChecksum, showToast]);

  const handleKeepEdits = useCallback(() => {
    if (!conflictState) return;
    dismissedChecksumRef.current = conflictState.checksum;
    setConflictState(null);
  }, [conflictState]);

  return { conflictSnapshot, handleReloadFromDisk, handleKeepEdits, __test__: { checkForChanges } };
}
