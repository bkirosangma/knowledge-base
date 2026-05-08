"use client";

import { useCallback } from "react";
import { flattenTree } from "../utils/fileTree";
import type { TreeNode } from "../utils/fileTree";
import {
  fnv1a,
  readHistoryFile,
  writeHistoryFile,
} from "../utils/historyPersistence";
import type { HistoryFile } from "../utils/historyPersistence";
import { tauriBridge } from "../../infrastructure/tauriBridge";
import { clearDraft } from "../utils/persistence";

export interface UseBackgroundScannerOptions {
  tree: TreeNode[];
  openFilePath: string | null;
  dirtyFiles: Set<string>;
  /** Test override for reading file content. In production this routes through `tauriBridge.readText(filePath)`. */
  readFile?: (path: string) => Promise<string>;
  readHistory?: (path: string) => Promise<HistoryFile<unknown> | null>;
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
  dirtyFiles,
  readFile: readFileOverride,
  readHistory: readHistoryOverride,
  writeHistory: writeHistoryOverride,
}: UseBackgroundScannerOptions): UseBackgroundScannerResult {
  const scan = useCallback(async (): Promise<number> => {
    const flatMap = flattenTree(tree);
    let updatedCount = 0;

    for (const [filePath] of flatMap) {
      // Skip the currently open file (handled by its own watcher)
      if (filePath === openFilePath) continue;
      // Only scan .md and .json files
      if (!filePath.endsWith(".md") && !filePath.endsWith(".json")) continue;

      // Read sidecar — skip if none
      const sidecar = readHistoryOverride
        ? await readHistoryOverride(filePath)
        : await readHistoryFile<unknown>(filePath);
      if (!sidecar) continue;

      // Read current file content
      let text: string;
      try {
        text = readFileOverride
          ? await readFileOverride(filePath)
          : await tauriBridge.readText(filePath);
      } catch {
        continue;
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
      const newEntries = [...sidecar.entries.slice(0, sidecar.currentIndex + 1)];
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
      } else {
        await writeHistoryFile(filePath, updated);
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
    dirtyFiles,
    readFileOverride,
    readHistoryOverride,
    writeHistoryOverride,
  ]);

  return { scan };
}
