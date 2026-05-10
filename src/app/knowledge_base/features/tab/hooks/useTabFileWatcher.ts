"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fnv1a } from "../../../shared/utils/historyPersistence";
import { useFileWatcher } from "../../../shared/context/FileWatcherContext";
import { useToast } from "../../../shell/ToastContext";

export interface UseTabFileWatcherOptions {
  filePath: string | null;
  dirty: boolean;
  diskChecksumRef: React.RefObject<string>;
  /**
   * Read the current on-disk text + its checksum. Caller wraps
   * `tabRepo.read` + `fnv1a`. Returns null if the file no longer
   * exists or the read fails.
   */
  getContentFromDisk: () => Promise<{ text: string; checksum: string } | null>;
  /**
   * Apply the disk text back into the tab pane. Caller wires this to
   * `useTabContent.refresh()` (which re-reads the file and resets the
   * engine via the content prop) plus its own internal checksum bump
   * via `updateDiskChecksum`.
   */
  resetToContent: (text: string, checksum: string) => void;
}

export interface UseTabFileWatcherResult {
  /** Disk text waiting for user resolution while the editor is dirty. */
  conflictContent: string | null;
  /** Apply the disk text and dismiss the banner. */
  handleReloadFromDisk: () => void;
  /** Dismiss the banner and suppress re-prompting for the same disk checksum. */
  handleKeepEdits: () => void;
  /** Exposed for tests only. */
  __test__: { checkForChanges: () => Promise<void> };
}

/**
 * TAB-11.2-08 conflict detector for the guitar-tab pane. Mirrors
 * `useDocumentFileWatcher` byte-for-byte where possible:
 *   - When `vault_change` fires, re-read disk, hash it, compare against
 *     the last-known disk checksum (kept fresh by `useTabContent` on
 *     load + flush success).
 *   - If the file is clean, apply silently and toast.
 *   - If the file is dirty, surface a `ConflictBanner` via the
 *     `conflictContent` state and suspend re-prompting on the same
 *     checksum until the user clicks Keep / Reload.
 *
 * Tab panes don't have a per-file undo history (the alphaTab editor
 * resets on engine remount), so the doc/diagram `history.recordAction`
 * + `markSaved` calls have no analogue here. The behavioral contract
 * — silent reload when clean, banner when dirty — is identical.
 */
export function useTabFileWatcher({
  filePath,
  dirty,
  diskChecksumRef,
  getContentFromDisk,
  resetToContent,
}: UseTabFileWatcherOptions): UseTabFileWatcherResult {
  const { subscribe, unsubscribe } = useFileWatcher();
  const { showToast } = useToast();
  const [conflictContent, setConflictContent] = useState<string | null>(null);
  const dismissedChecksumRef = useRef<string | null>(null);
  const dirtyRef = useRef(dirty);
  // Sync every render so the async subscriber always reads the latest dirty flag.
  dirtyRef.current = dirty;
  // Tracks the latest filePath across renders so async callbacks can detect navigation.
  const currentFileRef = useRef(filePath);
  currentFileRef.current = filePath;

  const checkForChanges = useCallback(async () => {
    if (!filePath) return;
    const pathAtStart = filePath;
    const result = await getContentFromDisk();
    if (!result) return;
    // Bail if the user navigated to a different file while we were awaiting disk I/O.
    if (currentFileRef.current !== pathAtStart) return;
    const { text, checksum } = result;
    if (checksum === diskChecksumRef.current) return;
    if (checksum === dismissedChecksumRef.current) return;

    if (!dirtyRef.current) {
      resetToContent(text, checksum);
      showToast("Tab reloaded from disk");
    } else {
      setConflictContent(text);
    }
  }, [filePath, getContentFromDisk, diskChecksumRef, resetToContent, showToast]);

  useEffect(() => {
    subscribe("content:tab", checkForChanges);
    return () => unsubscribe("content:tab");
  }, [subscribe, unsubscribe, checkForChanges]);

  useEffect(() => {
    dismissedChecksumRef.current = null;
  }, [filePath]);

  const handleReloadFromDisk = useCallback(() => {
    if (!conflictContent) return;
    const checksum = fnv1a(conflictContent);
    resetToContent(conflictContent, checksum);
    dismissedChecksumRef.current = null;
    setConflictContent(null);
    showToast("Tab reloaded from disk");
  }, [conflictContent, resetToContent, showToast]);

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
