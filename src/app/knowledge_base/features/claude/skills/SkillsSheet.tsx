import { useEffect } from "react";
import { SLASH_COMMANDS, type SlashCommand } from "../slash/slashCommands";
import { SkillCard } from "./SkillCard";

interface Props {
  open: boolean;
  onClose: () => void;
  onRun: (command: SlashCommand, formattedText: string) => void;
}

export function SkillsSheet({ open, onClose, onRun }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Skills"
      className="absolute inset-0 z-40 flex flex-col bg-surface/95 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <span className="text-sm font-medium text-ink">Skills</span>
        <button
          type="button"
          aria-label="Close skills sheet"
          className="cursor-pointer rounded px-2 py-1 text-xs text-mute hover:bg-surface-2"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div
        className="flex-1 overflow-auto p-3"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SLASH_COMMANDS.map((c) => (
            <SkillCard key={c.id} command={c} onRun={(text) => onRun(c, text)} />
          ))}
        </div>
      </div>
    </div>
  );
}
