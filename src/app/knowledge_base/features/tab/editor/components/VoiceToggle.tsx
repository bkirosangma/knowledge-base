"use client";
import type { ReactElement } from "react";

export interface VoiceToggleProps {
  voiceIndex: 0 | 1;
  onChange: (v: 0 | 1) => void;
}

export function VoiceToggle({
  voiceIndex,
  onChange,
}: VoiceToggleProps): ReactElement {
  return (
    <div
      className="inline-flex rounded border border-line p-0.5"
      role="group"
      aria-label="Voice"
    >
      {[0, 1].map((v) => {
        const active = voiceIndex === v;
        return (
          <button
            key={v}
            type="button"
            aria-label={`Voice ${v + 1}`}
            aria-pressed={active}
            onClick={() => onChange(v as 0 | 1)}
            className={`px-2 py-0.5 text-xs font-medium rounded cursor-pointer focus-visible:ring-2 focus-visible:ring-accent ${
              active ? "bg-accent/20 text-accent" : "text-mute hover:text-fg"
            }`}
          >
            V{v + 1}
          </button>
        );
      })}
    </div>
  );
}
