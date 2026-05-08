import { useCallback, useMemo, useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";
import { filterSlashCommands } from "../slash/slashCommands";
import { SlashPalette } from "../slash/SlashPalette";

interface ComposerProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  isStreaming: boolean;
}

export function Composer({ onSend, onInterrupt, isStreaming }: ComposerProps) {
  const [value, setValue] = useState("");
  const [highlight, setHighlight] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const slashMatches = useMemo(() => filterSlashCommands(value), [value]);
  const paletteOpen = slashMatches.length > 0;

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
    setHighlight(0);
  }, [value, onSend]);

  const insertTemplate = useCallback((template: string) => {
    setValue(template);
    setHighlight(0);
    queueMicrotask(() => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(template.length, template.length);
    });
  }, []);

  const onKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertTemplate(slashMatches[highlight].template);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Dismiss by appending a space; pattern stops matching.
        setValue((v) => v + " ");
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }, [paletteOpen, slashMatches, highlight, insertTemplate, submit]);

  return (
    <div className="relative">
      {paletteOpen && (
        <SlashPalette
          commands={slashMatches}
          highlight={highlight}
          onSelect={(c) => insertTemplate(c.template)}
          onHighlightChange={setHighlight}
        />
      )}
      <div className="flex items-end gap-2 border-t border-line bg-surface-2 p-2">
        <textarea
          ref={taRef}
          aria-label="Message Claude"
          aria-expanded={paletteOpen}
          className="flex-1 resize-none rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none placeholder:text-mute min-h-9 max-h-32 focus:border-accent"
          placeholder="Message Claude…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          rows={1}
        />
        {isStreaming ? (
          <button
            type="button"
            aria-label="Stop"
            className="cursor-pointer rounded-md bg-red-500/80 p-2 text-white hover:bg-red-500"
            onClick={onInterrupt}
          >
            <Square className="size-4" fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="Send"
            className="cursor-pointer rounded-md bg-accent p-2 text-white hover:bg-accent/80 disabled:opacity-40"
            onClick={submit}
            disabled={!value.trim()}
          >
            <Send className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
