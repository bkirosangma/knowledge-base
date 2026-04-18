"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Per-file Read Mode state. Persists to localStorage under the key
 * `diagram-read-only:<activeFile>` so each diagram remembers its own
 * mode independently.
 *
 * Returns `readOnly: false` whenever `activeFile` is null (empty state).
 */
export function useReadOnlyState(activeFile: string | null): {
  readOnly: boolean;
  toggleReadOnly: () => void;
} {
  const storageKey = activeFile ? `diagram-read-only:${activeFile}` : null;
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") { setReadOnly(false); return; }
    setReadOnly(localStorage.getItem(storageKey) === "true");
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
