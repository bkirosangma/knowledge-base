"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useChat } from "../claude/ChatContext";
import { DrawerResizeHandle } from "../claude/components/DrawerResizeHandle";

// xterm.js references `self` (browser global) — must be excluded from SSR.
const TerminalSurface = dynamic(
  () => import("./TerminalSurface").then((m) => m.TerminalSurface),
  { ssr: false },
);

interface Props {
  vaultPath: string | null;
}

export function TerminalDrawer({ vaultPath }: Props) {
  const { isOpen, height, close, setHeight } = useChat();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Stop browser fullscreen exit (matches MVP-2 fix 527e919).
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  // Render the drawer DOM whether or not isOpen — toggle visibility via
  // `display: none` so the xterm.js instance and its scrollback survive
  // drawer hide/show. Per spec § 4.9 this was originally deferred ("blank
  // xterm on remount") but is unusable in practice — the user reasonably
  // expects the terminal to keep its state across toggles, same as a real
  // terminal app would.
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col bg-surface border-t border-line shadow-lg"
      style={{ height, display: isOpen ? "flex" : "none" }}
      role="region"
      aria-label="Claude terminal drawer"
      aria-hidden={!isOpen}
    >
      <DrawerResizeHandle initialHeight={height} onResize={setHeight} />
      <div className="flex-1 min-h-0">
        <TerminalSurface vaultPath={vaultPath} />
      </div>
    </div>
  );
}
