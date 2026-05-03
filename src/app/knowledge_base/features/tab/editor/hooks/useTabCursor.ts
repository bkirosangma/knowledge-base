import { useState, useCallback } from "react";
import type { TabMetadata } from "../../../../domain/tabEngine";

export interface CursorLocation {
  trackIndex: number;
  beat: number;
  string: number;
}

export interface UseTabCursorResult {
  cursor: CursorLocation | null;
  setCursor: (loc: CursorLocation) => void;
  clear: () => void;
  moveBeat: (delta: 1 | -1) => void;
  moveString: (delta: 1 | -1) => void;
  moveBar: (delta: 1 | -1) => void;
}

export function useTabCursor(
  metadata: TabMetadata | null,
  barStartBeats?: number[],
): UseTabCursorResult {
  const [cursor, setCursorState] = useState<CursorLocation | null>(null);

  const setCursor = useCallback((loc: CursorLocation) => setCursorState(loc), []);
  const clear = useCallback(() => setCursorState(null), []);

  const moveBeat = useCallback(
    (delta: 1 | -1) => {
      setCursorState((c) => {
        if (!c || !metadata) return c;
        const max = Math.max(0, metadata.totalBeats - 1);
        return { ...c, beat: clamp(c.beat + delta, 0, max) };
      });
    },
    [metadata],
  );

  const moveString = useCallback(
    (delta: 1 | -1) => {
      setCursorState((c) => {
        if (!c || !metadata) return c;
        const numStrings = metadata.tuning?.length ?? 6;
        return { ...c, string: clamp(c.string + delta, 1, numStrings) };
      });
    },
    [metadata],
  );

  const moveBar = useCallback(
    (delta: 1 | -1) => {
      setCursorState((c) => {
        if (!c || !barStartBeats || barStartBeats.length === 0) return c;
        const currentBarIdx = findCurrentBarIndex(c.beat, barStartBeats);
        const targetBarIdx = clamp(
          currentBarIdx + delta,
          0,
          barStartBeats.length - 1,
        );
        return { ...c, beat: barStartBeats[targetBarIdx] };
      });
    },
    [barStartBeats],
  );

  return { cursor, setCursor, clear, moveBeat, moveString, moveBar };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function findCurrentBarIndex(beat: number, barStartBeats: number[]): number {
  let i = barStartBeats.length - 1;
  while (i > 0 && barStartBeats[i] > beat) i--;
  return i;
}
