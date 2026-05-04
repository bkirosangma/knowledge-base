"use client";
import type { ReactElement } from "react";
import type { NoteDuration } from "../../../../domain/tabEngine";

interface DurationButtonsProps {
  active: NoteDuration;
  onSelect: (duration: NoteDuration) => void;
}

const DURATIONS: { value: NoteDuration; label: string; shortcut: string }[] = [
  { value: 1,  label: "whole",         shortcut: "Q" },
  { value: 2,  label: "half",          shortcut: "W" },
  { value: 4,  label: "quarter",       shortcut: "E" },
  { value: 8,  label: "eighth",        shortcut: "R" },
  { value: 16, label: "sixteenth",     shortcut: "T" },
  { value: 32, label: "thirty-second", shortcut: "Y" },
];

export function DurationButtons({ active, onSelect }: DurationButtonsProps): ReactElement {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Note duration">
      {DURATIONS.map(({ value, label, shortcut }) => {
        const isActive = active === value;
        return (
          <button
            key={value}
            type="button"
            aria-label={`${label} note (${shortcut})`}
            aria-pressed={isActive}
            title={`${label} note — ${shortcut}`}
            onClick={() => onSelect(value)}
            className={
              `rounded border px-2 py-0.5 text-xs font-mono hover:bg-line/20 ` +
              (isActive
                ? "border-cyan-400 bg-cyan-100 ring-1 ring-cyan-400"
                : "border-line")
            }
          >
            {shortcut}
          </button>
        );
      })}
    </div>
  );
}
