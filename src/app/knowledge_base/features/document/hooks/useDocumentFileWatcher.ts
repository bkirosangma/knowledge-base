"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { useFileWatcher } from "../../../shared/context/FileWatcherContext";
import { useToast } from "../../../shell/ToastContext";
import type { HistoryCore } from "../../../shared/hooks/useHistoryCore";

export interface UseDocumentFileWatcherOptions {
  filePath: string | null;
  dirty: boolean;
  diskChecksumRef: React.RefObject<string>;
  getContentFromDisk: () => Promise<{ text: string; checksum: string } | null>;
  resetToContent: (text: string) => void;
  history: Pick<HistoryCore<string>, "recordAction" | "markSaved">;
  updateDiskChecksum: (checksum: string) => void;
}

export interface UseDocumentFileWatcherResult {
  conflictContent: string | null;
  handleReloadFromDisk: () => void;
  handleKeepEdits: () => void;
  /** Exposed for tests only. */
  __test__: { checkForChanges: () => Promise<void> };
}

export function useDocumentFileWatcher({
  filePath,
  dirty,
  diskChecksumRef,
  getContentFromDisk,
  resetToContent,
  history,
  updateDiskChecksum,
}: UseDocumentFileWatcherOptions): UseDocumentFileWatcherResult {
  const { subscribe, unsubscribe } = useFileWatcher();
  const { showToast } = useToast();
  const [conflictContent, setConflictContent] = useState<string | null>(null);
  const dismissedChecksumRef = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  // Sync every render so the async subscriber always reads the latest dirty flag.
  dirtyRef.current = dirty;

  const checkForChanges = useCallback(async () => {
    if (!filePath) return;
    const result = await getContentFromDisk();
    if (!result) return;
    const { text, checksum } = result;
    if (checksum === diskChecksumRef.current) return;
    if (checksum === dismissedChecksumRef.current) return;

    if (!dirtyRef.current) {
      history.recordAction("Reloaded from disk", text);
      history.markSaved();
      resetToContent(text);
      updateDiskChecksum(checksum);
      showToast("File reloaded from disk");
    } else {
      setConflictContent(text);
    }
  }, [filePath, getContentFromDisk, diskChecksumRef, history, resetToContent, updateDiskChecksum, showToast]);

  useEffect(() => {
    subscribe("content:doc", checkForChanges);
    return () => unsubscribe("content:doc");
  }, [subscribe, unsubscribe, checkForChanges]);

  useEffect(() => {
    dismissedChecksumRef.current = null;
  }, [filePath]);

  const handleReloadFromDisk = useCallback(() => {
    if (!conflictContent) return;
    const checksum = fnv1a(conflictContent);
    history.recordAction("Reloaded from disk", conflictContent);
    history.markSaved();
    resetToContent(conflictContent);
    updateDiskChecksum(checksum);
    dismissedChecksumRef.current = null;
    setConflictContent(null);
    showToast("File reloaded from disk");
  }, [conflictContent, history, resetToContent, updateDiskChecksum, showToast]);

  const handleKeepEdits = useCallback(() => {
    if (!conflictContent) return;
    dismissedChecksumRef.current = fnv1a(conflictContent);
    setConflictContent(null);
  }, [conflictContent]);

  return {
    conflictContent,
    handleReloadFromDisk,
    handleKeepEdits,
    __test__: { checkForChanges },
  };
}
