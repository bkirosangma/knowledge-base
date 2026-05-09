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
          // term_resize is a silent no-op on the Rust side when no PTY is
          // open yet (ResizeObserver fires before term_open lands), but the
          // promise can still reject for unrelated reasons (lock contention,
          // post-close races) — swallow rather than crash the page.
          tauriBridge.termResize(term.rows, term.cols).catch(() => {});
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
