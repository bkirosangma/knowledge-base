"use client";
import type { ReactElement } from "react";
import type { Technique } from "../../../../domain/tabEngine";

interface TechniqueButtonsProps {
  active: Set<Technique>;
  onToggle: (technique: Technique) => void;
}

const KEYBOARD_TECHNIQUES: { value: Technique; label: string; shortcut: string }[] = [
  { value: "hammer-on", label: "H",   shortcut: "H" },
  { value: "pull-off",  label: "P",   shortcut: "P" },
  { value: "bend",      label: "B",   shortcut: "B" },
  { value: "slide",     label: "S",   shortcut: "S" },
  { value: "tie",       label: "L",   shortcut: "L" },
  { value: "vibrato",   label: "~",   shortcut: "~" },
  { value: "palm-mute", label: "P-M", shortcut: "Shift+M" },
  { value: "let-ring",  label: "L-R", shortcut: "Shift+L" },
];

export function TechniqueButtons({ active, onToggle }: TechniqueButtonsProps): ReactElement {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Technique">
      {KEYBOARD_TECHNIQUES.map(({ value, label, shortcut }) => {
        const isActive = active.has(value);
        return (
          <button
            key={value}
            type="button"
            aria-label={`${value} (${shortcut})`}
            aria-pressed={isActive}
            title={`${value} — ${shortcut}`}
            onClick={() => onToggle(value)}
            className={
              `rounded border px-2 py-0.5 text-xs font-mono hover:bg-line/20 ` +
              (isActive
                ? "border-amber-400 bg-amber-100 ring-1 ring-amber-400"
                : "border-line")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
