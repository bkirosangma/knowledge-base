import { useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

const DEBOUNCE_MS = 120;

export function useTerminalResize(
  container: HTMLDivElement | null,
  term: Terminal | null,
  fitAddon: FitAddon | null,
) {
  useEffect(() => {
    if (!container || !term || !fitAddon) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          fitAddon.fit();
          void tauriBridge.termResize(term.rows, term.cols);
        } catch {
          // Container detached during the timeout; ignore.
        }
      }, DEBOUNCE_MS);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [container, term, fitAddon]);
}
