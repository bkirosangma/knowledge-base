import { createContext, useContext, ReactNode } from "react";
import { useClaudeSession } from "./hooks/useClaudeSession";
import { useDrawerState } from "./hooks/useDrawerState";

type ChatContextValue = ReturnType<typeof useClaudeSession> & ReturnType<typeof useDrawerState>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const session = useClaudeSession();
  const drawer = useDrawerState();
  return (
    <ChatContext.Provider value={{ ...session, ...drawer }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
