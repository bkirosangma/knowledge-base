"use client";

import { useCallback } from "react";
import type React from "react";
import { flattenTree } from "../utils/fileTree";
import type { TreeNode } from "../utils/fileTree";
import {
  fnv1a,
  readHistoryFile,
  writeHistoryFile,
} from "../utils/historyPersistence";
import type { HistoryFile } from "../utils/historyPersistence";
import { readTextFile } from "./fileExplorerHelpers";
import { clearDraft } from "../utils/persistence";

export interface UseBackgroundScannerOptions {
  tree: TreeNode[];
  openFilePath: string | null;
  dirHandleRef: React.RefObject<FileSystemDirectoryHandle | null>;
  dirtyFiles: Set<string>;
  /**
   * Override for testability — when provided, called instead of reading via
   * the real FileSystemFileHandle. In production this is left undefined and
   * the handle from flattenTree is used directly.
   */
  readFile?: (path: string) => Promise<string>;
  /**
   * Override for testability — when provided, called instead of
   * readHistoryFile(rootHandle, path).
   */
  readHistory?: (path: string) => Promise<HistoryFile<unknown> | null>;
  /**
   * Override for testability — when provided, called instead of
   * writeHistoryFile(rootHandle, path, data).
   */
  writeHistory?: (path: string, data: HistoryFile<unknown>) => Promise<void>;
}

export interface UseBackgroundScannerResult {
  /**
   * Scan all non-open files in the vault tree. For each file that has a
   * `.history.json` sidecar and whose disk content no longer matches the
   * stored checksum, update the sidecar with a "Reloaded from disk" entry
   * (preserving any unsaved draft first when the file is dirty).
   *
   * Returns the number of sidecar files that were updated.
   */
  scan: () => Promise<number>;
}

export function useBackgroundScanner({
  tree,
  openFilePath,
  dirHandleRef,
  dirtyFiles,
  readFile: readFileOverride,
  readHistory: readHistoryOverride,
  writeHistory: writeHistoryOverride,
}: UseBackgroundScannerOptions): UseBackgroundScannerResult {
  const scan = useCallback(async (): Promise<number> => {
    const rootHandle = dirHandleRef.current;
    const flatMap = flattenTree(tree);
    let updatedCount = 0;

    for (const [filePath, { handle }] of flatMap) {
      // Skip folders (they have no handle) — unless a readFile override is
      // provided (tests), in which case we still need to check file nodes that
      // were created without real FS handles.
      if (!handle && !readFileOverride) continue;
      // Skip the currently open file (handled by its own watcher)
      if (filePath === openFilePath) continue;
      // Only scan .md and .json files
      if (!filePath.endsWith(".md") && !filePath.endsWith(".json")) continue;

      // Read sidecar — skip if none
      let sidecar: HistoryFile<unknown> | null;
      if (readHistoryOverride) {
        sidecar = await readHistoryOverride(filePath);
      } else if (rootHandle) {
        sidecar = await readHistoryFile<unknown>(rootHandle, filePath);
      } else {
        sidecar = null;
      }
      if (!sidecar) continue;

      // Read current file content
      let text: string;
      if (readFileOverride) {
        text = await readFileOverride(filePath);
      } else if (handle) {
        text = await readTextFile(handle);
      } else {
        continue; // no way to read without handle or override
      }

      // Normalize JSON content to match the checksum format used by
      // useHistoryFileSync (JSON.stringify re-serialization strips trailing
      // newlines that editors like VS Code add, preventing false positives).
      const contentForChecksum = filePath.endsWith(".json")
        ? JSON.stringify(JSON.parse(text), null, 2)
        : text;
      const checksum = fnv1a(contentForChecksum);
      // No change — nothing to do
      if (checksum === sidecar.checksum) continue;

      // Guard against malformed sidecars to avoid crashing the scan loop
      if (
        !sidecar.entries.length ||
        sidecar.currentIndex < 0 ||
        sidecar.currentIndex >= sidecar.entries.length
      ) continue;

      // File has changed — build updated entries
      const isDirty = dirtyFiles.has(filePath);
      const now = Date.now();
      const maxId = sidecar.entries.reduce(
        (m, e) => Math.max(m, e.id),
        -1
      );

      // Diagram files store DiagramSnapshot objects; document files store plain
      // text strings. Parse .json content so undo/restore gets the right type.
      const diskSnapshot: unknown = filePath.endsWith(".json") ? JSON.parse(text) : text;

      // Keep entries up to and including the current pointer
      let newEntries = [...sidecar.entries.slice(0, sidecar.currentIndex + 1)];
      let nextId = maxId + 1;

      if (isDirty) {
        // Preserve the in-editor draft before overwriting with disk content
        const draftSnapshot = sidecar.entries[sidecar.currentIndex].snapshot;
        newEntries.push({
          id: nextId,
          description: "Unsaved changes (auto-preserved)",
          timestamp: now,
          snapshot: draftSnapshot,
        });
        nextId++;
      }

      newEntries.push({
        id: nextId,
        description: "Reloaded from disk",
        timestamp: now,
        snapshot: diskSnapshot,
      });

      const newCurrentIndex = newEntries.length - 1;
      const updated: HistoryFile<unknown> = {
        checksum,
        currentIndex: newCurrentIndex,
        savedIndex: newCurrentIndex,
        entries: newEntries,
      };

      if (writeHistoryOverride) {
        await writeHistoryOverride(filePath, updated);
      } else if (rootHandle) {
        await writeHistoryFile(rootHandle, filePath, updated);
      }

      // Clear any localStorage draft so the next file open loads disk content,
      // not the stale draft. clearDraft is a no-op if no draft exists.
      clearDraft(filePath);
      updatedCount++;
    }

    return updatedCount;
  }, [
    tree,
    openFilePath,
    dirHandleRef,
    dirtyFiles,
    readFileOverride,
    readHistoryOverride,
    writeHistoryOverride,
  ]);

  return { scan };
}
