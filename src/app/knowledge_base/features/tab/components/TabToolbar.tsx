"use client";

import type { ReactElement } from "react";
import type { BeatRange } from "../../../domain/tabEngine";
import type { TabPlayerStatus } from "../hooks/useTabEngine";

export interface TabToolbarProps {
  playerStatus: TabPlayerStatus;
  isAudioReady: boolean;
  audioBlocked: boolean;
  onToggle: () => void;
  onStop: () => void;
  onSetTempoFactor: (factor: number) => void;
  onSetLoop: (range: BeatRange | null) => void;
}

const TEMPO_OPTIONS: { label: string; value: number }[] = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
];

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
    onToggle, onStop, onSetTempoFactor, onSetLoop,
  } = props;
  const isPlaying = playerStatus === "playing";

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
        <select
          aria-label="Tempo"
          defaultValue="1"
          onChange={(e) => onSetTempoFactor(Number(e.target.value))}
          className="rounded border border-line bg-surface px-1 py-0.5"
        >
          {TEMPO_OPTIONS.map((opt) => (
            <option key={opt.value} value={String(opt.value)}>{opt.label}</option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          aria-label="Loop"
          onChange={(e) => onSetLoop(e.target.checked ? { start: 0, end: Number.MAX_SAFE_INTEGER } : null)}
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
