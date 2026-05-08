import { useState } from "react";
import type { SlashCommand } from "../slash/slashCommands";

interface Props {
  command: SlashCommand;
  /** Called with the fully-formatted slash command text. */
  onRun: (formattedText: string) => void;
}

export function SkillCard({ command, onRun }: Props) {
  const [arg, setArg] = useState("");

  // Subcommands that accept no argument run directly.
  const noArg = command.id === "validate";

  // Subcommands that need a vault file — Task 7 replaces this stub.
  const needsFilePicker = command.id === "edit" || command.id === "transform";

  return (
    <form
      data-testid={`skill-card-${command.id}`}
      className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (noArg) return onRun(command.template.trimEnd());
        if (!arg.trim()) return;
        onRun(`${command.template}${arg.trim()}`);
      }}
    >
      <span className="font-mono text-xs text-ink">{command.label}</span>
      <span className="text-xs text-mute">{command.description}</span>
      {!noArg && !needsFilePicker && (
        <input
          type="text"
          aria-label={`${command.label} argument`}
          className="rounded border border-line bg-surface px-2 py-1 text-sm text-ink"
          placeholder={
            command.id === "guitar-tabs" ? "song or riff name" : "topic"
          }
          value={arg}
          onChange={(e) => setArg(e.target.value)}
        />
      )}
      {needsFilePicker && (
        <span data-testid="placeholder-file-picker" className="text-xs italic text-mute">
          (file picker — wired in Task 7)
        </span>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          className="cursor-pointer rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent/80 disabled:opacity-40"
          disabled={!noArg && !needsFilePicker && !arg.trim()}
        >
          Run
        </button>
      </div>
    </form>
  );
}
