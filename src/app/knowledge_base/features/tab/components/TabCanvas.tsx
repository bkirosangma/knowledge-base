"use client";

import { forwardRef } from "react";

/**
 * Host element for `AlphaTabEngine.mount(...)`. The engine writes its
 * own DOM into the inner `<div>`; we just hand it a sized container.
 *
 * `data-testid` exposes the host so `TabView` integration tests can
 * confirm the canvas is mounted without coupling to alphaTab internals.
 */
export const TabCanvas = forwardRef<HTMLDivElement>(function TabCanvas(_, ref) {
  return (
    <div
      ref={ref}
      data-testid="tab-view-canvas"
      className="flex-1 overflow-auto bg-surface"
    />
  );
});
