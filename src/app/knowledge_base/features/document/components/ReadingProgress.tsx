"use client";

import React, { useEffect, useState } from "react";

interface ReadingProgressProps {
  /** Same scroll container the editor renders inside.  We compute the
   *  fraction-scrolled from this element so the progress bar follows the
   *  document content — not the outer pane (which doesn't scroll in this
   *  app shell). */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Reset signal — typically the active file path. When it changes the
   *  bar drops to 0% so a freshly-opened doc never starts the user halfway
   *  through someone else's reading position. */
  resetKey?: string | null;
}

/** 2px amber bar tucked just below the PaneHeader.  Reads scrollTop /
 *  (scrollHeight − clientHeight) on the editor scroll container, attached
 *  via passive scroll listener so it doesn't fight ProseMirror for the
 *  main thread.  Mounted only in read mode by the parent. */
export default function ReadingProgress({
  scrollContainerRef,
  resetKey,
}: ReadingProgressProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 0) {
        setProgress(0);
        return;
      }
      const ratio = Math.min(1, Math.max(0, el.scrollTop / max));
      setProgress(ratio);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Re-measure when the container resizes (window resize, sidebar
    // toggles, focus mode entering/exiting).  A ResizeObserver is cheaper
    // than polling and never misses content-driven layout shifts.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [scrollContainerRef, resetKey]);

  return (
    <div
      data-testid="reading-progress"
      className="flex-shrink-0 h-0.5 bg-slate-100 relative overflow-hidden"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div
        className="h-full bg-amber-600 transition-[width] duration-150"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
