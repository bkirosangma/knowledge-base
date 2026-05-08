interface MessageBubbleProps {
  role: "user" | "assistant";
  text: string;
  children?: React.ReactNode; // used for tool-use blocks + streaming cursor
}

export function MessageBubble({ role, text, children }: MessageBubbleProps) {
  const label = role === "user" ? "You" : "Claude";
  const wrapperClass = role === "user"
    ? "rounded-md bg-surface-2 border border-line p-2"
    : "p-2";
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-mute">{label}</span>
      <div className={wrapperClass}>
        <div className="whitespace-pre-wrap text-sm text-ink">{text}</div>
        {children}
      </div>
    </div>
  );
}
