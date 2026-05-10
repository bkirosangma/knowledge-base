"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { useChat } from "../claude/ChatContext";
import { useTerminalSession } from "./hooks/useTerminalSession";
import { useTerminalResize } from "./hooks/useTerminalResize";
import { buildTerminalTheme } from "./theme";

interface Props {
  vaultPath: string | null;
}

export function TerminalSurface({ vaultPath }: Props) {
  const { isOpen } = useChat();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [term, setTerm] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const initOnce = useRef(false);

  const termRef = useRef<Terminal | null>(null);

  // Init effect: defer xterm Terminal creation until the drawer first
  // becomes visible. Avoids fitting against a 0×0 container at boot (the
  // previous behaviour fitted eagerly even when invisible) AND eliminates
  // a WebKit race where `@xterm/addon-fit` reads
  // `this._renderer.value.dimensions` before the renderer's lazy
  // MutableDisposable resolves. Chromium tolerated the timing; WebKit
  // crashed the page intermittently under full-suite load.
  //
  // No cleanup here — disposal is an unmount-only operation handled by a
  // separate effect below. If `t.dispose()` were the cleanup of THIS
  // effect, every isOpen-toggle would dispose+recreate the terminal,
  // breaking MVP-3.5's buffer-persistence-across-drawer-hides guarantee.
  useEffect(() => {
    if (!container || initOnce.current || !isOpen) return;
    initOnce.current = true;
    const t = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13,
      theme: buildTerminalTheme(),
      scrollback: 5000,
      allowTransparency: false,
    });
    const fa = new FitAddon();
    const wla = new WebLinksAddon();
    t.loadAddon(fa);
    t.loadAddon(wla);
    t.open(container);
    fa.fit();
    termRef.current = t;
    setTerm(t);
    setFitAddon(fa);
  }, [container, isOpen]);

  // Unmount-only disposal. Reads from `termRef`, which is set by the init
  // effect once xterm exists; `?.dispose()` is a no-op when the drawer
  // was never opened during this component's lifetime.
  useEffect(() => {
    return () => {
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, []);

  useTerminalSession({ vaultPath, term, fitAddon, isOpen });
  useTerminalResize(container, term, fitAddon);

  return (
    <div
      ref={setContainer}
      className="size-full bg-surface"
      role="region"
      aria-label="Claude terminal"
      data-testid="terminal-surface"
    />
  );
}
