import { useEffect, useRef } from "react";
import type { Terminal } from "@xterm/xterm";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

interface Options {
  vaultPath: string | null;
  /** xterm Terminal instance to write incoming bytes into. */
  term: Terminal | null;
}

/** Owns the PTY lifecycle: open on mount + vaultPath change, cleanup
 *  unsubscribes the term_event listener but does NOT term_close — the PTY
 *  persists across drawer hides per spec § 4.7. */
export function useTerminalSession({ vaultPath, term }: Options) {
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!term || !vaultPath) return;

    const { rows, cols } = term;

    let unsub: (() => void) | null = null;
    void tauriBridge
      .subscribeTermEvent((e) => {
        if (e.kind === "data") {
          const bytes = new Uint8Array(e.bytes);
          term.write(bytes);
        } else if (e.kind === "exit") {
          term.write("\r\n[claude exited]\r\n");
        }
      })
      .then((u) => {
        unsub = u;
        unsubRef.current = u;
      });

    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      void tauriBridge.termWrite(bytes);
    });

    void tauriBridge.termOpen(vaultPath, rows, cols);

    return () => {
      dataDisposable.dispose();
      if (unsub) unsub();
    };
  }, [term, vaultPath]);
}
