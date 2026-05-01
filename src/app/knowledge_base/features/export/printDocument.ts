// Document → printable PDF (KB-011 / EXPORT-9.3).
//
// Sets `body[data-printing="document"]`, fires the browser's print
// flow, and clears the attribute on `afterprint`. The print stylesheet
// (`app/globals.print.css`) keys on the attribute so split-pane / graph
// / search panes are never accidentally hidden in non-print contexts.

const PRINTING_ATTR = "data-printing";
const PRINTING_VALUE = "document";

/** Trigger a browser print of the focused document. Returns a cleanup
 *  function so callers (or tests) can force-clear the printing flag if
 *  the `afterprint` event doesn't fire — some headless environments
 *  swallow it. */
export function printDocument(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const body = document.body;
  body.setAttribute(PRINTING_ATTR, PRINTING_VALUE);

  const cleanup = () => {
    if (body.getAttribute(PRINTING_ATTR) === PRINTING_VALUE) {
      body.removeAttribute(PRINTING_ATTR);
    }
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup, { once: true });

  // window.print is synchronous in most browsers but defensive anyway —
  // any throw still leaves the flag set; the returned cleanup gives the
  // caller (or test) a way to bail out.
  try {
    window.print();
  } catch {
    cleanup();
  }
  return cleanup;
}
