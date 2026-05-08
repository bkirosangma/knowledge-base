import { useEffect, useRef } from "react";
import type { ChatTurn } from "../types";
import { MessageBubble } from "./MessageBubble";
import { ToolUseBlock } from "./ToolUseBlock";
import { PartialMessageStream } from "./PartialMessageStream";

interface MessageListProps {
  turns: ChatTurn[];
}

export function MessageList({ turns }: MessageListProps) {
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
      <div className="flex flex-1 min-h-0 items-center justify-center px-4 text-sm text-mute">
        Start a conversation with Claude. Vault context is delivered via the working directory.
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
      <div ref={endRef} />
    </div>
  );
}
