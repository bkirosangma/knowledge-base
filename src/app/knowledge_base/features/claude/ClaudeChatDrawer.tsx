import { useEffect } from "react";
import { useChat } from "./ChatContext";
import { useClaudeStatus } from "./hooks/useClaudeStatus";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { DrawerResizeHandle } from "./components/DrawerResizeHandle";
import { SetupScreen } from "./components/SetupScreen";

export function ClaudeChatDrawer() {
  const { isOpen, height, turns, isStreaming, errorMessage, send, interrupt, close, setHeight } = useChat();
  const { status } = useClaudeStatus();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const showSetup = status.binary === "missing";
  const showApiKeyBanner = status.binary === "found" && status.auth === "api_key";

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-bg-accent/95 backdrop-blur-sm shadow-lg"
      style={{ height }}
      role="region"
      aria-label="Claude chat"
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      {showApiKeyBanner && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-400">
          Billed per token (api-key auth detected). Subscription users: unset ANTHROPIC_API_KEY.
        </div>
      )}
      {errorMessage && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-400">
          {errorMessage}
        </div>
      )}
      {showSetup ? (
        <div className="flex-1"><SetupScreen /></div>
      ) : (
        <>
          <div className="flex-1 overflow-hidden">
            <MessageList turns={turns} />
          </div>
          <Composer onSend={send} onInterrupt={interrupt} isStreaming={isStreaming} />
        </>
      )}
    </div>
  );
}
