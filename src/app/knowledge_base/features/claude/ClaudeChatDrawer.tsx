import { useCallback, useEffect, useState } from "react";
import { useChat } from "./ChatContext";
import { useClaudeStatus } from "./hooks/useClaudeStatus";
import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { DrawerResizeHandle } from "./components/DrawerResizeHandle";
import { SetupScreen } from "./components/SetupScreen";
import { SkillInstallToast } from "./components/SkillInstallToast";
import {
  getClaudePermissionMode,
  setClaudePermissionMode,
  type ClaudePermissionMode,
} from "../../infrastructure/settingsStore";

export function ClaudeChatDrawer() {
  const { isOpen, height, turns, isStreaming, errorMessage, send, interrupt, close, setHeight } = useChat();
  const { status } = useClaudeStatus();
  const skillBootstrap = useSkillBootstrap("knowledge-base");
  const [permissionMode, setPermissionMode] = useState<ClaudePermissionMode>("acceptEdits");

  useEffect(() => {
    void getClaudePermissionMode().then(setPermissionMode);
  }, [isOpen]);

  const togglePermissionMode = useCallback(async () => {
    const next: ClaudePermissionMode = permissionMode === "acceptEdits" ? "default" : "acceptEdits";
    setPermissionMode(next);
    await setClaudePermissionMode(next);
  }, [permissionMode]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // preventDefault stops the OS/WebView default (exit fullscreen on macOS).
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  if (!isOpen) return null;

  const showSetup = status.binary === "missing";
  const showApiKeyBanner = status.binary === "found" && status.auth === "api_key";

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-surface border-t border-line shadow-lg"
      style={{ height }}
      role="region"
      aria-label="Claude chat"
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      {skillBootstrap.justInstalled && <SkillInstallToast show />}
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-xs">
        <span className="text-mute">Claude</span>
        <button
          type="button"
          onClick={() => void togglePermissionMode()}
          className="cursor-pointer rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-ink-2 hover:bg-surface transition-colors"
          aria-label="Toggle Claude permission mode"
          title="Click to toggle between acceptEdits and default"
        >
          permission: {permissionMode}
        </button>
      </div>
      {showApiKeyBanner && (
        <div className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-400">
          Billed per token (api-key auth detected). Subscription users: unset ANTHROPIC_API_KEY.
        </div>
      )}
      {errorMessage && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-3 py-1 text-xs text-red-700 dark:text-red-400">
          {errorMessage}
        </div>
      )}
      {showSetup ? (
        <div className="flex-1 min-h-0"><SetupScreen /></div>
      ) : (
        <>
          <MessageList turns={turns} />
          <Composer onSend={send} onInterrupt={interrupt} isStreaming={isStreaming} />
        </>
      )}
    </div>
  );
}
