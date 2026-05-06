"use client";

import { useEffect, useState, type ReactElement } from "react";
import type { TabPlayerStatus } from "../hooks/useTabEngine";

export interface TabToolbarProps {
  playerStatus: TabPlayerStatus;
  isAudioReady: boolean;
  audioBlocked: boolean;
  onToggle: () => void;
  onStop: () => void;
  onSetLooping: (enabled: boolean) => void;
  /** Score tempo in BPM (from alphaTab metadata; first masterBar's tempo automation). */
  tempoBpm: number;
  /** Commit a new tempo to the score. When omitted (read mode or no editor),
   *  the BPM displays as static text rather than an editable input. */
  onSetTempoBpm?: (bpm: number) => void;
}

const TEMPO_MIN = 20;
const TEMPO_MAX = 400;

/**
 * Transport controls for the guitar-tab pane: play/pause toggle, stop,
 * tempo dropdown, loop checkbox, audio-blocked hint. Scrubbing is
 * intentionally absent — alphatab renders its own playhead on the
 * canvas; a slider over the score adds geometric complexity without
 * matching reward in this slice.
 */
export function TabToolbar(props: TabToolbarProps): ReactElement {
  const {
    playerStatus, isAudioReady, audioBlocked,
    onToggle, onStop, onSetLooping,
    tempoBpm, onSetTempoBpm,
  } = props;
  const isPlaying = playerStatus === "playing";

  // Local input state so the user can type freely (e.g. clear and retype "120");
  // we only commit to the score on blur/Enter when the value parses to a number
  // inside [TEMPO_MIN, TEMPO_MAX].
  const [tempoDraft, setTempoDraft] = useState<string>(String(tempoBpm));
  useEffect(() => { setTempoDraft(String(tempoBpm)); }, [tempoBpm]);

  const commitTempo = () => {
    const parsed = Number.parseInt(tempoDraft, 10);
    if (!Number.isFinite(parsed) || parsed < TEMPO_MIN || parsed > TEMPO_MAX) {
      // Reject invalid input by snapping back to the score's current value.
      setTempoDraft(String(tempoBpm));
      return;
    }
    if (parsed === tempoBpm) return;
    onSetTempoBpm?.(parsed);
  };

  return (
    <div
      data-testid="tab-toolbar"
      className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 text-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!isAudioReady}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="rounded border border-line px-3 py-1 hover:bg-line/20 disabled:opacity-50"
      >
        {isPlaying ? "Pause" : "Play"}
      </button>

      <button
        type="button"
        onClick={onStop}
        disabled={!isAudioReady}
        aria-label="Stop"
        className="rounded border border-line px-3 py-1 hover:bg-line/20 disabled:opacity-50"
      >
        Stop
      </button>

      <label className="flex items-center gap-1">
        <span className="text-mute">Tempo</span>
        {onSetTempoBpm ? (
          <input
            type="number"
            aria-label="Tempo (BPM)"
            min={TEMPO_MIN}
            max={TEMPO_MAX}
            step={1}
            value={tempoDraft}
            onChange={(e) => setTempoDraft(e.target.value)}
            onBlur={commitTempo}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                setTempoDraft(String(tempoBpm));
                e.currentTarget.blur();
              }
            }}
            className="w-16 rounded border border-line bg-surface px-1 py-0.5 text-right"
          />
        ) : (
          <span aria-label="Tempo (BPM)" className="font-mono">{tempoBpm}</span>
        )}
        <span className="text-mute">BPM</span>
      </label>

      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          aria-label="Loop"
          onChange={(e) => onSetLooping(e.target.checked)}
        />
        <span className="text-mute">Loop</span>
      </label>

      {audioBlocked && (
        <span role="status" className="ml-auto text-xs text-mute">
          Tap play to enable audio.
        </span>
      )}
    </div>
  );
}
