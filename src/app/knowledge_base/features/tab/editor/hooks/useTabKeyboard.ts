import { useEffect, useRef } from "react";
import type { TabEditOp, NoteDuration, Technique } from "../../../../domain/tabEngine";
import type { CursorLocation } from "./useTabCursor";

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
        d.apply({
          type: "add-technique",
          beat: d.cursor.beat,
          string: d.cursor.string,
          technique: BARE_TECHNIQUE_KEYS[lower],
        });
        consume(event);
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
