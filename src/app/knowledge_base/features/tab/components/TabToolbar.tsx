"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";
import { Pause, Play, Repeat, Square } from "lucide-react";
import type { TabPlayerStatus } from "../hooks/useTabEngine";

export interface TabToolbarProps {
  playerStatus: TabPlayerStatus;
  isAudioReady: boolean;
  audioBlocked: boolean;
  onToggle: () => void;
  onStop: () => void;
  /** Whether looping is currently enabled. Controlled — the toggle button's
   *  visual state mirrors this, and switching tab files (which resets the
   *  session's isLooping to false) clears it along with the file. */
  looping: boolean;
  onSetLooping: (enabled: boolean) => void;
  /** Score tempo in BPM (from alphaTab metadata; first masterBar's tempo automation). */
  tempoBpm: number;
  /** Commit a new tempo to the score. When omitted (read mode or no editor),
   *  the BPM displays as static text rather than an editable input. */
  onSetTempoBpm?: (bpm: number) => void;
}

const TEMPO_MIN = 20;
const TEMPO_MAX = 400;
const TEMPO_COMMIT_DEBOUNCE_MS = 250;

const ICON_BTN =
  "inline-flex items-center justify-center rounded p-1.5 hover:bg-line/20 disabled:opacity-50 disabled:hover:bg-transparent";

/**
 * Transport controls for the guitar-tab pane: play/pause icon button, stop
 * icon button, edit-in-place BPM input with a slider that floats on focus,
 * and a loop toggle button (green when active). Scrubbing is intentionally
 * absent — alphatab renders its own playhead on the canvas.
 */
export function TabToolbar(props: TabToolbarProps): ReactElement {
  const {
    playerStatus, isAudioReady, audioBlocked,
    onToggle, onStop, looping, onSetLooping,
    tempoBpm, onSetTempoBpm,
  } = props;
  const isPlaying = playerStatus === "playing";

  // ── Tempo edit-in-place + floating slider state ─────────────────────────
  const [tempoDraft, setTempoDraft] = useState<string>(String(tempoBpm));
  useEffect(() => { setTempoDraft(String(tempoBpm)); }, [tempoBpm]);

  const [tempoFocused, setTempoFocused] = useState(false);
  const tempoInputRef = useRef<HTMLInputElement | null>(null);
  const tempoSliderRef = useRef<HTMLInputElement | null>(null);

  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingCommit = () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
  };
  useEffect(() => () => cancelPendingCommit(), []);

  const commitTempoNow = (raw: string): boolean => {
    cancelPendingCommit();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      setTempoDraft(String(tempoBpm));
      return false;
    }
    // Clamp out-of-range values to the bounds instead of rejecting. Typing
    // "5" lands at TEMPO_MIN, typing "9999" lands at TEMPO_MAX.
    const clamped = Math.min(Math.max(parsed, TEMPO_MIN), TEMPO_MAX);
    if (clamped !== parsed) setTempoDraft(String(clamped));
    if (clamped === tempoBpm) return false;
    onSetTempoBpm?.(clamped);
    return true;
  };

  const handleTempoChange = (raw: string) => {
    setTempoDraft(raw);
    cancelPendingCommit();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(Math.max(parsed, TEMPO_MIN), TEMPO_MAX);
    if (clamped === tempoBpm) return;
    commitTimerRef.current = setTimeout(() => {
      commitTimerRef.current = null;
      onSetTempoBpm?.(clamped);
    }, TEMPO_COMMIT_DEBOUNCE_MS);
  };

  // The slider commits live too; re-use the same debounced path.
  const handleSliderChange = (raw: string) => {
    setTempoDraft(raw);
    cancelPendingCommit();
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    onSetTempoBpm?.(Math.min(Math.max(parsed, TEMPO_MIN), TEMPO_MAX));
  };

  // Keep the popover open when focus moves between the input and the slider.
  // Hide only after focus has fully left the tempo group.
  const handleTempoBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as HTMLElement | null;
    if (next && (next === tempoInputRef.current || next === tempoSliderRef.current)) {
      return;
    }
    commitTempoNow(tempoDraft);
    setTempoFocused(false);
  };

  return (
    <div
      data-testid="tab-toolbar"
      className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2 text-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!isAudioReady}
        aria-label={isPlaying ? "Pause" : "Play"}
        className={ICON_BTN}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <button
        type="button"
        onClick={onStop}
        disabled={!isAudioReady}
        aria-label="Stop"
        className={ICON_BTN}
      >
        <Square size={16} />
      </button>

      {/* Tempo: edit-in-place input that visually matches the read-mode
          static label, plus a horizontal slider that floats below when the
          input has focus. */}
      <div className="relative flex items-center gap-1 ml-2">
        <span className="text-mute">Tempo</span>
        {onSetTempoBpm ? (
          <>
            <input
              ref={tempoInputRef}
              type="number"
              aria-label="Tempo (BPM)"
              min={TEMPO_MIN}
              max={TEMPO_MAX}
              step={1}
              value={tempoDraft}
              onChange={(e) => handleTempoChange(e.target.value)}
              onFocus={() => setTempoFocused(true)}
              onBlur={handleTempoBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitTempoNow(tempoDraft);
                  e.currentTarget.blur();
                } else if (e.key === "Escape") {
                  cancelPendingCommit();
                  setTempoDraft(String(tempoBpm));
                  e.currentTarget.blur();
                }
              }}
              className="w-10 border-0 bg-transparent p-0 text-right font-mono text-fg outline-none focus:outline-none focus-visible:outline-none focus-visible:[box-shadow:none] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {tempoFocused && (
              <div className="absolute left-0 top-full z-30 mt-1 flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 shadow-md">
                <span className="text-[10px] tabular-nums text-mute">{TEMPO_MIN}</span>
                <input
                  ref={tempoSliderRef}
                  type="range"
                  aria-label="Tempo slider"
                  min={TEMPO_MIN}
                  max={TEMPO_MAX}
                  step={1}
                  value={tempoDraft}
                  onChange={(e) => handleSliderChange(e.target.value)}
                  onFocus={() => setTempoFocused(true)}
                  onBlur={handleTempoBlur}
                  className="w-48"
                />
                <span className="text-[10px] tabular-nums text-mute">{TEMPO_MAX}</span>
              </div>
            )}
          </>
        ) : (
          <span aria-label="Tempo (BPM)" className="w-10 text-right font-mono text-fg">{tempoBpm}</span>
        )}
        <span className="text-mute">BPM</span>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={looping}
        aria-label="Loop"
        onClick={() => onSetLooping(!looping)}
        className={
          "ml-2 inline-flex items-center gap-1 rounded border px-2 py-1 transition-colors " +
          (looping
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20"
            : "border-line text-mute hover:bg-line/20")
        }
      >
        <Repeat size={14} />
        <span className="text-xs">Loop</span>
      </button>

      {audioBlocked && (
        <span role="status" className="ml-auto text-xs text-mute">
          Tap play to enable audio.
        </span>
      )}
    </div>
  );
}
