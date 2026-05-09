import { useEffect, useRef } from "react";
import type { ChatTurn } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ToolUseBlock } from "./ToolUseBlock";
import { PartialMessageStream } from "./PartialMessageStream";

interface MessageListProps {
  turns: ChatTurn[];
  isStreaming: boolean;
}

export function MessageList({ turns, isStreaming }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);
  // Jump instantly on the first render after mount (drawer open with prior
  // turns) so users don't see a smooth-scroll animation. Subsequent turn
  // updates use smooth scroll for nicer streaming UX.
  const firstScroll = useRef(true);
  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: firstScroll.current ? "auto" : "smooth",
      block: "end",
    });
    firstScroll.current = false;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center px-4 gap-2">
        {isStreaming ? (
          <div
            className="flex items-center gap-2 text-xs text-mute"
            data-testid="thinking-indicator"
          >
            <span className="animate-pulse">●●●</span>
            <span>Claude is thinking…</span>
          </div>
        ) : (
          <span className="text-sm text-mute">
            Start a conversation with Claude. Vault context is delivered via the working directory.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto flex-1 min-h-0 p-3">
      {turns.map((t, i) => (
        <MessageBubble key={`${t.turn}-${t.role}-${i}`} role={t.role} text={t.text}>
          {t.toolUses.map((u, j) => (
            <ToolUseBlock key={j} tool={u.tool} input={u.input} output={u.output} />
          ))}
          {t.role === "assistant" && t.isStreaming && <PartialMessageStream isStreaming />}
        </MessageBubble>
      ))}
      {isStreaming && latestTurnIsEmpty(turns) && (
        <div
          className="flex items-center gap-2 px-3 py-2 text-xs text-mute"
          data-testid="thinking-indicator"
        >
          <span className="animate-pulse">●●●</span>
          <span>Claude is thinking…</span>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function latestTurnIsEmpty(turns: ChatTurn[]): boolean {
  const last = turns.at(-1);
  if (!last || last.role !== "assistant") return true; // user just sent
  return last.text.trim().length === 0 && last.toolUses.length === 0;
}
