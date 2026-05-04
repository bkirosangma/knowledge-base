"use client";

import type { ReactElement } from "react";
import type { TabEditOp, Technique } from "../../../domain/tabEngine";
import type { SelectedNoteDetails as Details } from "../editor/hooks/useSelectedNoteDetails";

const ADDITIONAL_TECHNIQUES: { value: Technique; label: string }[] = [
  { value: "ghost",    label: "Ghost note" },
  { value: "tap",      label: "Tap" },
  { value: "tremolo",  label: "Tremolo picking" },
  { value: "harmonic", label: "Natural harmonic" },
];

const BEND_PRESETS: { label: string; value: number }[] = [
  { label: "½", value: 50 },
  { label: "full", value: 100 },
  { label: "1½", value: 150 },
];

const SLIDE_DIRECTIONS: { value: "up" | "down" | "target"; label: string }[] = [
  { value: "up",     label: "Slide up" },
  { value: "down",   label: "Slide down" },
  { value: "target", label: "Slide to target fret" },
];

export interface SelectedNoteDetailsProps {
  details: Details | null;
  cursorBeat: number;
  cursorString: number;
  onApply: (op: TabEditOp) => void;
}

export function SelectedNoteDetails(props: SelectedNoteDetailsProps): ReactElement | null {
  const { details, cursorBeat, cursorString, onApply } = props;

  if (!details) return null;

  // Non-null narrowed reference for use inside closures below.
  const d = details;
  const hasBend = d.techniques.has("bend");
  const hasSlide = d.techniques.has("slide");

  function handleBendPreset(value: number): void {
    // TODO: A dedicated op type for custom bend amounts doesn't exist in TabEditOp yet.
    // For now, re-apply the bend technique, which sets the default ½-step in the engine.
    void value; // consumed for future use when the op type extends to carry bend amount
    onApply({ type: "add-technique", beat: cursorBeat, string: cursorString, technique: "bend" });
  }

  function handleSlideDirection(direction: "up" | "down" | "target"): void {
    // TODO: Direction-specific slide ops are not in TabEditOp yet — "up" is the engine default.
    void direction; // consumed for future use
    onApply({ type: "add-technique", beat: cursorBeat, string: cursorString, technique: "slide" });
  }

  function handleTechniqueToggle(technique: Technique): void {
    const active = d.techniques.has(technique);
    if (active) {
      onApply({ type: "remove-technique", beat: cursorBeat, string: cursorString, technique });
    } else {
      onApply({ type: "add-technique", beat: cursorBeat, string: cursorString, technique });
    }
  }

  return (
    <section>
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Selected note</h3>

      {/* Bend presets */}
      <div className="mb-2">
        <p className="mb-1 text-xs text-mute">Bend</p>
        <div className="flex gap-1">
          {BEND_PRESETS.map(({ label, value }) => (
            <button
              key={label}
              type="button"
              onClick={() => handleBendPreset(value)}
              aria-pressed={hasBend && d.bendAmount === value}
              className={`rounded border px-2 py-0.5 text-xs ${
                hasBend && d.bendAmount === value
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-line/50 text-mute hover:bg-line/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Slide direction */}
      <div className="mb-2">
        <p className="mb-1 text-xs text-mute">Slide</p>
        <div className="flex flex-col gap-0.5">
          {SLIDE_DIRECTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSlideDirection(value)}
              aria-pressed={hasSlide && d.slideDirection === value}
              className={`rounded border px-2 py-0.5 text-left text-xs ${
                hasSlide && d.slideDirection === value
                  ? "border-accent bg-accent/20 text-accent"
                  : "border-line/50 text-mute hover:bg-line/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Additional technique toggles */}
      <div>
        <p className="mb-1 text-xs text-mute">Techniques</p>
        <div className="flex flex-wrap gap-1">
          {ADDITIONAL_TECHNIQUES.map(({ value, label }) => {
            const active = d.techniques.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => handleTechniqueToggle(value)}
                aria-pressed={active}
                className={`rounded border px-2 py-0.5 text-xs ${
                  active
                    ? "border-accent bg-accent/20 text-accent"
                    : "border-line/50 text-mute hover:bg-line/20"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
