"use client";

import { useEffect, useState } from "react";

/**
 * Mobile breakpoint — below this width the app collapses into the mobile
 * shell (single-pane reader + bottom-tab nav).
 *
 * Exported so callers can reference the same number for ad-hoc media
 * queries, but the hook is the canonical source — components should
 * branch on `useViewport().isMobile` rather than re-implement the test.
 */
export const MOBILE_BREAKPOINT_PX = 900;

/**
 * Compact-chrome breakpoint (KB-013) — below this width the diagram
 * toolbar collapses Live / Labels / Minimap into an overflow menu so the
 * primary controls (zoom, auto-arrange) stay visible without wrapping.
 * Mobile (`<= MOBILE_BREAKPOINT_PX`) implies compact.
 */
export const COMPACT_BREAKPOINT_PX = 1100;

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;
const COMPACT_QUERY = `(max-width: ${COMPACT_BREAKPOINT_PX}px)`;

export interface ViewportState {
  /** True when the viewport is at-or-below the mobile breakpoint. */
  isMobile: boolean;
  /** True when the viewport is at-or-below the compact-chrome
   *  breakpoint. Strictly broader than `isMobile`. */
  isCompact: boolean;
}

/**
 * SSR-safe viewport detector.  Returns `{ isMobile: false, isCompact:
 * false }` on the server / first client render so hydration matches the
 * desktop tree; the effects re-read `matchMedia` after mount and the
 * listeners track future flips (rotation, devtools, drag-resize).
 *
 * Cleanup removes the listeners on unmount so unmounted callers don't
 * leak handlers across the watcher.
 */
export function useViewport(): ViewportState {
  // SSR / first paint default — desktop. The MEMORY note "SSR hydration
  // mismatch and stale recents are important issues" calls this out: we
  // accept a one-frame flash for narrow viewports rather than guessing
  // window width during render and breaking server-rendered output.
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const cleanups: Array<() => void> = [];

    const watch = (
      query: string,
      setter: (v: boolean) => void,
    ): void => {
      const mql = window.matchMedia(query);
      setter(mql.matches);
      const handler = (e: MediaQueryListEvent) => setter(e.matches);
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", handler);
        cleanups.push(() => mql.removeEventListener("change", handler));
        return;
      }
      // Fallback for older browsers (Safari ≤13).
      const legacy = mql as unknown as {
        addListener: (l: (e: MediaQueryListEvent) => void) => void;
        removeListener: (l: (e: MediaQueryListEvent) => void) => void;
      };
      legacy.addListener(handler);
      cleanups.push(() => legacy.removeListener(handler));
    };

    watch(MOBILE_QUERY, setIsMobile);
    watch(COMPACT_QUERY, setIsCompact);

    return () => {
      for (const c of cleanups) c();
    };
  }, []);

  return { isMobile, isCompact };
}
