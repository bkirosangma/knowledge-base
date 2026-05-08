import { MessageCircle } from "lucide-react";
import { useChat } from "../../features/claude/ChatContext";

export function ChatToggleButton() {
  const { toggle, isOpen, isStreaming } = useChat();
  const pulse = isStreaming && !isOpen ? "animate-pulse" : "";
  return (
    <button
      type="button"
      aria-label="Toggle chat"
      onClick={toggle}
      className="cursor-pointer rounded-md p-1 text-mute hover:bg-white/10 hover:text-white"
    >
      <MessageCircle className={`size-4 ${pulse}`} />
    </button>
  );
}
