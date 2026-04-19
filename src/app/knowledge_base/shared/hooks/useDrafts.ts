"use client";

import { useCallback, useMemo, useState } from "react";
import { listDrafts, clearDraft } from "../utils/persistence";

/**
 * Draft lifecycle: tracks which files have pending unsaved edits in
 * localStorage and exposes operations to refresh / remove / flag them.
 *
 * Drafts themselves are stored by `saveDraft` / `loadDraft` in `persistence.ts`;
 * this hook owns the **dirty-set** — the collection of paths that have a
 * saved-but-not-yet-flushed draft. The set drives the "modified" marker the
 * explorer shows next to dirty files.
 */
export function useDrafts(): {
  dirtyFiles: Set<string>;
  /** Re-read the full set from localStorage (after bulk ops that may touch many drafts). */
  refreshDrafts: () => void;
  /** Clear the draft for a single path and drop it from the dirty set. */
  removeDraft: (filePath: string) => void;
  /** Add/remove a path from the dirty set without touching localStorage. */
  markDirty: (filePath: string, dirty: boolean) => void;
} {
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(() => listDrafts());

  const refreshDrafts = useCallback(() => {
    setDirtyFiles(listDrafts());
  }, []);

  const removeDraft = useCallback((filePath: string) => {
    clearDraft(filePath);
    setDirtyFiles((prev) => {
      if (!prev.has(filePath)) return prev;
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  }, []);

  const markDirty = useCallback((filePath: string, dirty: boolean) => {
    setDirtyFiles((prev) => {
      const has = prev.has(filePath);
      if (dirty && !has) {
        const next = new Set(prev);
        next.add(filePath);
        return next;
      }
      if (!dirty && has) {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      }
      return prev;
    });
  }, []);

  // Stabilise the returned object across renders. Consumers (e.g.
  // `useFileExplorer`) list this object in their `useCallback` dep arrays;
  // handing back a fresh literal every render cascades new identities
  // through `renameFile` / `renameFolder` / `moveItem` / `deleteFolder` /
  // `discardFile`, which — via the `useFileActions` handlers that sit in
  // `DiagramView`'s bridge effect deps — drove a Max Update Depth loop.
  return useMemo(
    () => ({ dirtyFiles, refreshDrafts, removeDraft, markDirty }),
    [dirtyFiles, refreshDrafts, removeDraft, markDirty],
  );
}
