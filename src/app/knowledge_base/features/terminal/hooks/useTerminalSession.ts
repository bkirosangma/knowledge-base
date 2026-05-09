import { useEffect } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { tauriBridge } from "../../../infrastructure/tauriBridge";

interface Options {
  vaultPath: string | null;
  /** xterm Terminal instance to write incoming bytes into. */
  term: Terminal | null;
  /** Fit addon — used to recompute rows/cols against the visible container
   *  immediately before term_open so the spawned PTY has a sane width. */
  fitAddon: FitAddon | null;
  /** Whether the drawer is currently visible. term_open is deferred until
   *  the container has real dimensions (drawer is display:none until first
   *  open, so fit() returns ~0 cols/rows otherwise — claude/zsh would spawn
   *  with a tiny COLUMNS env var and bake narrow line-wraps into the
   *  scrollback that no later resize can repair). */
  isOpen: boolean;
}

/** Owns the PTY lifecycle. Two effects:
 *
 *  1. Listener subscription: fires when `term` is ready, lives for the
 *     lifetime of the surface. Bytes from term_event continue flowing into
 *     xterm's internal scrollback even when the drawer is hidden, so the
 *     user sees an up-to-date view on re-show.
 *
 *  2. term_open: deferred until `term + vaultPath + isOpen` are all ready.
 *     Calls fitAddon.fit() against the (now visible) container first so the
 *     PTY spawns with the correct rows/cols. Same-vault re-fires are
 *     idempotent on the backend; vault-changes trigger an in-place restart.
 *
 *  Cleanup unsubscribes the listener / disposes the dataDisposable but does
 *  NOT term_close — the PTY persists across drawer toggles per spec § 4.7.
 */
export function useTerminalSession({ vaultPath, term, fitAddon, isOpen }: Options) {
  // Effect 1: listener stays subscribed for the lifetime of `term`.
  useEffect(() => {
    if (!term) return;

    let unsub: (() => void) | null = null;
    void tauriBridge
      .subscribeTermEvent((e) => {
        if (e.kind === "data") {
          term.write(new Uint8Array(e.bytes));
        } else if (e.kind === "exit") {
          term.write("\r\n[claude exited]\r\n");
        }
      })
      .then((u) => {
        unsub = u;
      });

    const dataDisposable = term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      void tauriBridge.termWrite(bytes);
    });

    return () => {
      dataDisposable.dispose();
      if (unsub) unsub();
    };
  }, [term]);

  // Effect 2: term_open deferred until the drawer is visible.
  useEffect(() => {
    if (!term || !vaultPath || !isOpen) return;
    // Force a fit recalc now that the container has real dimensions.
    // fit() can throw if the container has 0 dims; swallow gracefully.
    try {
      fitAddon?.fit();
    } catch {
      // Container detached or measurement failed; backend will use whatever
      // term.rows/cols currently report.
    }
    void tauriBridge.termOpen(vaultPath, term.rows, term.cols);
  }, [term, vaultPath, isOpen, fitAddon]);
}
