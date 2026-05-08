import { useEffect } from "react";
import { useChat } from "./ChatContext";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { DrawerResizeHandle } from "./components/DrawerResizeHandle";

export function ClaudeChatDrawer() {
  const { isOpen, height, turns, isStreaming, errorMessage, send, interrupt, close, setHeight } = useChat();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-bg-accent/95 backdrop-blur-sm shadow-lg"
      style={{ height }}
      role="region"
      aria-label="Claude chat"
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      {errorMessage && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-400">
          {errorMessage}
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <MessageList turns={turns} />
      </div>
      <Composer onSend={send} onInterrupt={interrupt} isStreaming={isStreaming} />
    </div>
  );
}
