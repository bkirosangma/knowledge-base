"use client";

import { useEffect, useRef } from "react";

/**
 * Touch interaction hook for the diagram canvas in read-only mobile mode.
 *
 * Phase 3 PR 3 (DIAG-3.24, 2026-04-26).
 *
 * Behaviour:
 *   - Single-finger touchmove: NO action. The browser is free to scroll
 *     the document; we don't preventDefault for one-finger gestures.
 *   - Two-finger touchmove: pan (translate by the average movement of
 *     the two touch points) + pinch-zoom (scale by the change in
 *     two-finger distance). Both apply to the same target zoom/scroll.
 *   - Single tap (touchstart → touchend within 8 px and 200 ms):
 *     forward as a synthetic click on the touched element so the
 *     existing node `onClick` selection handlers fire.
 *   - Long-press (touchstart held 500 ms without movement >8 px on a
 *     node): emits `onLongPress(nodeId)` so the host can open backlinks.
 *
 * Listeners are attached to `canvasRef.current` with `passive: false`
 * so we can `preventDefault` on two-finger gestures (browser would
 * otherwise hijack pinch as page-zoom).  All listeners are removed on
 * unmount and when `enabled` flips to false.
 *
 * Read-only guard: when `enabled` is false the hook is a no-op — every
 * effect early-returns. This keeps edit-mode untouched and makes the
 * mobile-only path explicit at the call site.
 */

const TAP_DURATION_MS = 200;
const TAP_DISTANCE_PX = 8;
const LONG_PRESS_MS = 500;

export interface UseTouchCanvasArgs {
  /** Scrolling viewport element (canvasRef in DiagramView). */
  canvasRef: React.RefObject<HTMLDivElement | null>;
  /** Current zoom scalar (1 = 100%). */
  zoomRef: React.MutableRefObject<number>;
  /**
   * Programmatic zoom setter from `useZoom`. Pass through new zoom
   * targets so the canvas's existing scale-translate machinery handles
   * cursor anchoring.
   */
  setZoomTo: (targetZoom: number) => void;
  /**
   * When true, mount touch listeners. Pass `readOnly && isMobile` from
   * the host. Anything else → hook is a no-op.
   */
  enabled: boolean;
  /**
   * Fires when a long-press lands on an element with
   * `data-testid="node-{id}"`. Host typically opens backlinks for the id.
   */
  onLongPress?: (nodeId: string) => void;
}

/**
 * Walk up from the touched element looking for `data-testid="node-{id}"`.
 * Returns the bare id, or null when no node ancestor exists.
 *
 * Exported for unit tests.
 */
export function findNodeIdFromTarget(target: EventTarget | null): string | null {
  let el = target as HTMLElement | null;
  while (el) {
    const tid = el.getAttribute?.("data-testid");
    if (tid && tid.startsWith("node-")) {
      return tid.slice("node-".length);
    }
    el = el.parentElement;
  }
  return null;
}

function distance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: Touch, b: Touch): { x: number; y: number } {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export function useTouchCanvas({
  canvasRef,
  zoomRef,
  setZoomTo,
  enabled,
  onLongPress,
}: UseTouchCanvasArgs) {
  // Stable ref to the long-press handler so we don't re-mount the
  // listeners every render the host swaps callback identity.
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  useEffect(() => {
    if (!enabled) return;
    const el = canvasRef.current;
    if (!el) return;

    // ─── Single-tap / long-press tracking ─────────────────────────────
    let tapStart: { x: number; y: number; t: number; target: EventTarget | null } | null = null;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressFired = false;

    // ─── Two-finger pan + pinch tracking ──────────────────────────────
    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let lastMid: { x: number; y: number } | null = null;

    const clearLongPress = () => {
      if (longPressTimer !== null) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Two-finger gesture starts — disarm tap, prep pinch state.
        clearLongPress();
        tapStart = null;
        longPressFired = false;
        pinchActive = true;
        pinchStartDist = distance(e.touches[0], e.touches[1]);
        pinchStartZoom = zoomRef.current;
        lastMid = midpoint(e.touches[0], e.touches[1]);
        e.preventDefault();
        return;
      }

      if (e.touches.length === 1) {
        const t = e.touches[0];
        tapStart = {
          x: t.clientX,
          y: t.clientY,
          t: performance.now(),
          target: e.target,
        };
        longPressFired = false;
        // Long-press timer — captures the start target so the handler
        // fires against the originally-touched node even if a finger
        // tremor moves the touchend slightly off.
        clearLongPress();
        longPressTimer = setTimeout(() => {
          // Only fire if the user hasn't moved past the tap threshold.
          if (!tapStart) return;
          const nodeId = findNodeIdFromTarget(tapStart.target);
          if (nodeId && onLongPressRef.current) {
            longPressFired = true;
            onLongPressRef.current(nodeId);
          }
        }, LONG_PRESS_MS);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchActive) {
        // Two-finger gesture — pan + pinch.
        const dist = distance(e.touches[0], e.touches[1]);
        const mid = midpoint(e.touches[0], e.touches[1]);

        // Pan: scroll by the change in midpoint.
        if (lastMid) {
          const dx = mid.x - lastMid.x;
          const dy = mid.y - lastMid.y;
          el.scrollLeft -= dx;
          el.scrollTop -= dy;
        }
        lastMid = mid;

        // Pinch: scale zoom by the ratio of distances.  Clamping is
        // delegated to setZoomTo (useZoom enforces MIN/MAX).
        if (pinchStartDist > 0) {
          const scale = dist / pinchStartDist;
          setZoomTo(pinchStartZoom * scale);
        }

        e.preventDefault();
        return;
      }

      if (e.touches.length === 1 && tapStart) {
        // Single-finger move — if past tap threshold, cancel tap +
        // long-press but do NOT preventDefault (let the browser scroll
        // documents naturally; the canvas is read-only so panning isn't
        // supported with one finger by design).
        const t = e.touches[0];
        const dx = t.clientX - tapStart.x;
        const dy = t.clientY - tapStart.y;
        if (Math.sqrt(dx * dx + dy * dy) > TAP_DISTANCE_PX) {
          tapStart = null;
          clearLongPress();
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchActive && e.touches.length < 2) {
        pinchActive = false;
        pinchStartDist = 0;
        lastMid = null;
        // Don't synthesise a tap when ending a pinch.
        tapStart = null;
        return;
      }

      if (tapStart && !longPressFired) {
        const elapsed = performance.now() - tapStart.t;
        // No clientX/Y on touchend's `touches` (they're already gone),
        // use changedTouches.
        const ct = e.changedTouches[0];
        const dx = ct ? ct.clientX - tapStart.x : 0;
        const dy = ct ? ct.clientY - tapStart.y : 0;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (elapsed <= TAP_DURATION_MS && dist <= TAP_DISTANCE_PX) {
          // Synthesise a click on the original target so existing
          // mouse-based selection / link-following logic fires.
          const target = tapStart.target as HTMLElement | null;
          if (target && typeof target.dispatchEvent === "function") {
            // Note: omit `view` from MouseEventInit — jsdom rejects
            // anything that isn't an exact Window IDL match, and
            // browsers only need it for legacy behaviour.
            const synthetic = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              clientX: ct ? ct.clientX : tapStart.x,
              clientY: ct ? ct.clientY : tapStart.y,
            });
            target.dispatchEvent(synthetic);
          }
        }
      }

      clearLongPress();
      tapStart = null;
    };

    const onTouchCancel = () => {
      clearLongPress();
      tapStart = null;
      pinchActive = false;
      pinchStartDist = 0;
      lastMid = null;
    };

    // `passive: false` on touchstart + touchmove so two-finger
    // preventDefault stops the browser from hijacking pinch as page-zoom.
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("touchend",   onTouchEnd);
    el.addEventListener("touchcancel", onTouchCancel);

    return () => {
      clearLongPress();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("touchend",   onTouchEnd);
      el.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, canvasRef, zoomRef, setZoomTo]);
}
