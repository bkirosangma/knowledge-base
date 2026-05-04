import { useEffect, useRef } from "react";
import type { TabEditOp, NoteDuration, Technique } from "../../../../domain/tabEngine";
import type { CursorLocation } from "./useTabCursor";
import { findNote } from "../scoreNavigation";

const DIGIT_TIMEOUT_MS = 500;

const DURATION_KEYS: Record<string, NoteDuration> = {
  q: 1,
  w: 2,
  e: 4,
  r: 8,
  t: 16,
  y: 32,
};

const BARE_TECHNIQUE_KEYS: Record<string, Technique> = {
  h: "hammer-on",
  p: "pull-off",
  b: "bend",
  s: "slide",
  l: "tie",
  "~": "vibrato",
};

const SHIFT_TECHNIQUE_KEYS: Record<string, Technique> = {
  m: "palm-mute",
  l: "let-ring",
};

const BEND_TYPE_BEND = 1;       // alphaTab BendType.Bend
const SLIDE_TYPE_SHIFT = 1;     // alphaTab SlideOutType.Shift (up)
const SLIDE_TYPE_OUTDOWN = 4;   // alphaTab SlideOutType.OutDown (down)

interface NoteShape {
  bendType?: number;
  bendPoints?: { value: number }[] | null;
  slideOutType?: number;
}

function readBendValue(note: NoteShape | null): 50 | 100 | null {
  if (!note || note.bendType !== BEND_TYPE_BEND || !note.bendPoints) return null;
  const last = note.bendPoints[note.bendPoints.length - 1];
  if (!last) return null;
  if (last.value === 50) return 50;
  if (last.value === 100) return 100;
  return null;
}

function readSlideDirection(note: NoteShape | null): "up" | "down" | null {
  if (!note || !note.slideOutType) return null;
  if (note.slideOutType === SLIDE_TYPE_SHIFT) return "up";
  if (note.slideOutType === SLIDE_TYPE_OUTDOWN) return "down";
  return null;
}

export interface UseTabKeyboardDeps {
  cursor: CursorLocation | null;
  setCursor: (loc: CursorLocation) => void;
  clearCursor: () => void;
  moveBeat: (delta: 1 | -1) => void;
  moveString: (delta: 1 | -1) => void;
  moveBar: (delta: 1 | -1) => void;
  apply: (op: TabEditOp) => void;
  undo: () => void;
  redo: () => void;
  activeDurationRef: React.MutableRefObject<NoteDuration>;
  enabled: boolean;
  nextTrack: () => void;
  prevTrack: () => void;
  /** Current alphaTab Score, used by stateless B/S cycle to read note state. */
  score: unknown | null;
}

export function useTabKeyboard(deps: UseTabKeyboardDeps): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const accumRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!deps.enabled) return;

    function flushAccum(): void {
      const d = depsRef.current;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (accumRef.current === "" || !d.cursor) {
        accumRef.current = "";
        return;
      }
      const fret = parseInt(accumRef.current, 10);
      accumRef.current = "";
      if (Number.isNaN(fret)) return;
      d.apply({ type: "set-fret", beat: d.cursor.beat, string: d.cursor.string, fret });
    }

    function consume(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();
    }

    function onKey(event: KeyboardEvent): void {
      // C4: don't hijack key events when an input/select/textarea/contenteditable has focus.
      const t = event.target;
      if (t instanceof HTMLElement && t.matches('input, select, textarea, [contenteditable=""], [contenteditable="true"]')) {
        return;
      }

      const d = depsRef.current;
      if (!d.cursor) return;

      const k = event.key;
      const lower = k.length === 1 ? k.toLowerCase() : k;
      const meta = event.metaKey || event.ctrlKey;

      // Digit accumulator
      if (k.length === 1 && /^[0-9]$/.test(k)) {
        accumRef.current += k;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(flushAccum, DIGIT_TIMEOUT_MS);
        consume(event);
        return;
      }

      // Non-digit: flush any pending digits first
      if (accumRef.current.length > 0) flushAccum();

      // Modifier shortcuts (undo/redo) — check before bare-letter mappings
      if (meta && lower === "z" && event.shiftKey) {
        d.redo();
        consume(event);
        return;
      }
      if (meta && lower === "y") {
        d.redo();
        consume(event);
        return;
      }
      if (meta && lower === "z") {
        d.undo();
        consume(event);
        return;
      }

      // Cursor navigation
      if (k === "ArrowLeft") {
        d.moveBeat(-1);
        consume(event);
        return;
      }
      if (k === "ArrowRight") {
        d.moveBeat(1);
        consume(event);
        return;
      }
      if (k === "ArrowUp") {
        d.moveString(-1);
        consume(event);
        return;
      }
      if (k === "ArrowDown") {
        d.moveString(1);
        consume(event);
        return;
      }
      if (k === "Tab" && event.shiftKey) {
        d.moveBar(-1);
        consume(event);
        return;
      }
      if (k === "Tab") {
        d.moveBar(1);
        consume(event);
        return;
      }
      if (k === "Escape") {
        d.clearCursor();
        consume(event);
        return;
      }
      if (k === "[") {
        d.prevTrack();
        consume(event);
        return;
      }
      if (k === "]") {
        d.nextTrack();
        consume(event);
        return;
      }

      // Shift+letter techniques (palm-mute, let-ring) — must come before bare letters
      if (event.shiftKey && SHIFT_TECHNIQUE_KEYS[lower]) {
        d.apply({
          type: "add-technique",
          beat: d.cursor.beat,
          string: d.cursor.string,
          technique: SHIFT_TECHNIQUE_KEYS[lower],
        });
        consume(event);
        return;
      }

      // Bare letter durations
      if (DURATION_KEYS[lower] !== undefined && !event.shiftKey && !meta) {
        d.apply({ type: "set-duration", beat: d.cursor.beat, duration: DURATION_KEYS[lower] });
        consume(event);
        return;
      }

      // Bare letter / `~` techniques
      if (BARE_TECHNIQUE_KEYS[lower] !== undefined && !event.shiftKey && !meta) {
        event.preventDefault();
        const technique = BARE_TECHNIQUE_KEYS[lower];
        const baseOp = { beat: d.cursor.beat, string: d.cursor.string };

        if (technique === "bend") {
          const note = d.score
            ? findNote(d.score, d.cursor.beat, d.cursor.string, String(d.cursor.trackIndex), d.cursor.voiceIndex) as NoteShape | null
            : null;
          const value = readBendValue(note);
          if (value === null) {
            d.apply({ type: "add-technique", ...baseOp, technique: "bend", amount: 50 });
          } else if (value === 50) {
            d.apply({ type: "add-technique", ...baseOp, technique: "bend", amount: 100 });
          } else {
            d.apply({ type: "remove-technique", ...baseOp, technique: "bend" });
          }
          return;
        }

        if (technique === "slide") {
          const note = d.score
            ? findNote(d.score, d.cursor.beat, d.cursor.string, String(d.cursor.trackIndex), d.cursor.voiceIndex) as NoteShape | null
            : null;
          const dir = readSlideDirection(note);
          if (dir === null) {
            d.apply({ type: "add-technique", ...baseOp, technique: "slide", direction: "up" });
          } else if (dir === "up") {
            d.apply({ type: "add-technique", ...baseOp, technique: "slide", direction: "down" });
          } else {
            d.apply({ type: "remove-technique", ...baseOp, technique: "slide" });
          }
          return;
        }

        // All other bare techniques (H, P, L, ~) keep simple dispatch.
        d.apply({ type: "add-technique", ...baseOp, technique });
        event.stopPropagation();
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [deps.enabled]);
}
