import { useEffect } from "react";
import type { SlashCommand } from "./slashCommands";

interface Props {
  commands: ReadonlyArray<SlashCommand>;
  highlight: number;
  onSelect: (command: SlashCommand) => void;
  onHighlightChange: (next: number) => void;
}

export function SlashPalette({ commands, highlight, onSelect, onHighlightChange }: Props) {
  // Auto-correct highlight if commands list shrinks beneath it.
  useEffect(() => {
    if (commands.length === 0) return;
    if (highlight >= commands.length) onHighlightChange(commands.length - 1);
  }, [commands.length, highlight, onHighlightChange]);

  if (commands.length === 0) return null;
  return (
    <ul
      role="listbox"
      aria-label="Slash commands"
      className="absolute bottom-full left-0 right-0 mb-1 max-h-56 overflow-auto rounded-md border border-line bg-surface shadow-lg"
    >
      {commands.map((c, i) => (
        <li
          key={c.id}
          role="option"
          aria-selected={i === highlight}
          data-testid={`slash-option-${c.id}`}
          className={
            "flex cursor-pointer flex-col gap-0.5 px-3 py-1.5 text-sm " +
            (i === highlight ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2")
          }
          onMouseEnter={() => onHighlightChange(i)}
          onMouseDown={(e) => {
            // mouseDown (not click) so the textarea doesn't lose focus first.
            e.preventDefault();
            onSelect(c);
          }}
        >
          <span className="font-mono">{c.label}</span>
          <span className="text-xs text-mute">{c.description}</span>
        </li>
      ))}
    </ul>
  );
}
