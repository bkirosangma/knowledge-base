import { MessageCircle } from "lucide-react";
import { useChat } from "../../features/claude/ChatContext";
import { useSurface } from "../../features/claude/SurfaceContext";

export function DrawerToggleButton() {
  const { toggle, isOpen, isStreaming } = useChat();
  const { surface } = useSurface();
  const shouldPulse = surface === "chat" && isStreaming && !isOpen;
  const pulse = shouldPulse ? "animate-pulse" : "";

  // Three visual states:
  //   active (drawer open) → filled accent (button looks "pressed")
  //   default              → bordered surface-2 with accent text
  //   hover (default)      → bg-accent/10 + accent border
  const stateClass = isOpen
    ? "bg-accent text-white border-accent hover:bg-accent-2"
    : "bg-surface-2 text-accent border-line hover:bg-accent/10 hover:border-accent";

  return (
    <button
      type="button"
      aria-label={isOpen ? "Close Claude" : "Open Claude"}
      onClick={toggle}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium cursor-pointer transition-colors ${stateClass}`}
    >
      <MessageCircle className={`size-4 ${pulse}`} />
      <span>Open Claude</span>
    </button>
  );
}
