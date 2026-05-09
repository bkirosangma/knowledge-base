"use client";

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

import { useTerminalSession } from "./hooks/useTerminalSession";
import { useTerminalResize } from "./hooks/useTerminalResize";
import { buildTerminalTheme } from "./theme";

interface Props {
  vaultPath: string | null;
}

export function TerminalSurface({ vaultPath }: Props) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [term, setTerm] = useState<Terminal | null>(null);
  const [fitAddon, setFitAddon] = useState<FitAddon | null>(null);
  const initOnce = useRef(false);

  useEffect(() => {
    if (!container || initOnce.current) return;
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
    setTerm(t);
    setFitAddon(fa);

    return () => {
      t.dispose();
    };
  }, [container]);

  useTerminalSession({ vaultPath, term });
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
