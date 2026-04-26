"use client";

import { useEffect, useState } from "react";

/**
 * Mobile breakpoint — below this width the app collapses into the mobile
 * shell (single-pane reader + bottom-tab nav). Phase 3 PR 3 (SHELL-1.14,
 * 2026-04-26).
 *
 * Exported so callers can reference the same number for ad-hoc media
 * queries, but the hook is the canonical source — components should
 * branch on `useViewport().isMobile` rather than re-implement the test.
 */
export const MOBILE_BREAKPOINT_PX = 900;

const MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX}px)`;

export interface ViewportState {
  /** True when the viewport is at-or-below the mobile breakpoint. */
  isMobile: boolean;
}

/**
 * SSR-safe viewport detector.  Returns `{ isMobile: false }` on the
 * server / first client render so hydration matches the desktop tree;
 * the effect re-reads `matchMedia` after mount and the listener tracks
 * future flips (rotation, devtools, drag-resize).
 *
 * Cleanup removes the listener on unmount so unmounted callers don't
 * leak handlers across the watcher.
 */
export function useViewport(): ViewportState {
  // SSR / first paint default — desktop. The MEMORY note "SSR hydration
  // mismatch and stale recents are important issues" calls this out: we
  // accept a one-frame flash for narrow viewports rather than guessing
  // window width during render and breaking server-rendered output.
  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(MEDIA_QUERY);
    setIsMobile(mql.matches);

    // `addEventListener("change")` is the modern API; older Safari only
    // exposes `addListener`. Try modern first, fall back to deprecated.
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", handler);
      return () => mql.removeEventListener("change", handler);
    }
    // Fallback for older browsers (Safari ≤13).
    const legacyMql = mql as unknown as {
      addListener: (l: (e: MediaQueryListEvent) => void) => void;
      removeListener: (l: (e: MediaQueryListEvent) => void) => void;
    };
    legacyMql.addListener(handler);
    return () => legacyMql.removeListener(handler);
  }, []);

  return { isMobile };
}
