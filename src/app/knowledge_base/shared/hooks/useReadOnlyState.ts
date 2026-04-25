"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-file Read Mode state. Persists to localStorage under
 * `<prefix>:<activeFile>` so each file remembers its mode independently.
 *
 * Defaults to `false` (edit mode) when no localStorage entry exists.
 * Returns `readOnly: true` whenever `activeFile` is null.
 */
export function useReadOnlyState(
  activeFile: string | null,
  prefix = "diagram-read-only",
): {
  readOnly: boolean;
  toggleReadOnly: () => void;
} {
  const storageKey = activeFile ? `${prefix}:${activeFile}` : null;
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") {
      setReadOnly(true);
      return;
    }
    const stored = localStorage.getItem(storageKey);
    setReadOnly(stored === "true");
  }, [storageKey]);

  const toggleReadOnly = useCallback(() => {
    setReadOnly((v) => {
      const next = !v;
      if (storageKey) {
        try { localStorage.setItem(storageKey, String(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [storageKey]);

  return { readOnly, toggleReadOnly };
}
