import { useCallback, useRef, useState, KeyboardEvent } from "react";
import { Send, Square } from "lucide-react";

interface ComposerProps {
  onSend: (text: string) => void;
  onInterrupt: () => void;
  isStreaming: boolean;
}

export function Composer({ onSend, onInterrupt, isStreaming }: ComposerProps) {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }, [value, onSend]);

  const onKey = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }, [submit]);

  return (
    <div className="flex items-end gap-2 border-t border-white/10 bg-bg-accent p-2">
      <textarea
        ref={taRef}
        aria-label="Message Claude"
        className="flex-1 resize-none rounded-md bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-mute min-h-9 max-h-32"
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
  );
}
