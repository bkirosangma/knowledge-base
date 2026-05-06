"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "tab-session-tempo";

/**
 * Per-file session tempo preference, persisted in localStorage but never
 * written to the alphatex file. The toolbar's BPM input drives the synth's
 * `playbackSpeed` for practice (slow-down / speed-up) without rewriting
 * the score's authoritative tempo.
 *
 * Storage shape: `tab-session-tempo:<filePath>` → integer BPM string.
 *
 * Derived value: `sessionBpm = storedValue ?? scoreBpm`. Until the user
 * explicitly sets a session tempo for this file, the toolbar tracks the
 * score's authoritative tempo (matching how the toolbar behaved before
 * persistence was added). Once stored, it sticks across reloads and
 * across properties-panel edits to the score's tempo.
 */
function readStoredTempo(filePath: string | null): number | null {
  if (!filePath || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${filePath}`);
    if (raw === null) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function useSessionTempoBpm(
  filePath: string | null,
  scoreBpm: number,
): { sessionBpm: number; setSessionBpm: (bpm: number) => void } {
  const [stored, setStored] = useState<number | null>(() => readStoredTempo(filePath));

  // Re-read storage whenever the file changes — each file has its own
  // session preference.
  useEffect(() => {
    setStored(readStoredTempo(filePath));
  }, [filePath]);

  const setSessionBpm = useCallback(
    (bpm: number) => {
      setStored(bpm);
      if (!filePath || typeof window === "undefined") return;
      try {
        localStorage.setItem(`${STORAGE_PREFIX}:${filePath}`, String(bpm));
      } catch {
        /* ignore quota / private-mode errors — the hook degrades to
         * in-memory state for this session. */
      }
    },
    [filePath],
  );

  return { sessionBpm: stored ?? scoreBpm, setSessionBpm };
}
