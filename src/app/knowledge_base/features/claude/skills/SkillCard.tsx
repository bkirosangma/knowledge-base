import { useState } from "react";
import type { SlashCommand } from "../slash/slashCommands";
import { VaultFilePickerModal } from "./VaultFilePickerModal";

interface Props {
  command: SlashCommand;
  /** Called with the fully-formatted slash command text. */
  onRun: (formattedText: string) => void;
}

export function SkillCard({ command, onRun }: Props) {
  const [arg, setArg] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const noArg = command.id === "validate";
  const needsFilePicker = command.id === "edit" || command.id === "transform";
  const extensions = command.id === "edit" ? [".json"] : [];

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
        <div className="flex flex-col gap-1">
          <button
            type="button"
            data-testid={`skill-card-${command.id}-picker-trigger`}
            className="rounded border border-line bg-surface px-2 py-1 text-xs text-left text-ink-2 hover:bg-surface-2"
            onClick={() => setPickerOpen(true)}
          >
            {arg ? <span className="font-mono">{arg}</span> : "Pick a file…"}
          </button>
          <VaultFilePickerModal
            open={pickerOpen}
            extensions={extensions}
            title={command.id === "edit" ? "Pick a diagram (.json) to edit" : "Pick a file to transform"}
            onPick={(path) => {
              setPickerOpen(false);
              if (path) setArg(path);
            }}
          />
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          className="cursor-pointer rounded bg-accent px-3 py-1 text-xs text-white hover:bg-accent/80 disabled:opacity-40"
          disabled={!noArg && !arg.trim()}
        >
          Run
        </button>
      </div>
    </form>
  );
}
