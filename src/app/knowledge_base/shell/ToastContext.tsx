"use client";

// Toast stack (KB-014).
//
// Up to MAX_TOASTS visible at once. A 4th `showToast` evicts the
// oldest (FIFO). Each toast owns its own dismiss timer keyed by id, so
// dismissals fire on schedule even when multiple toasts share the
// stack at staggered times.
//
// Render order: bottom-up — newest at the bottom edge of the viewport,
// older toasts stacking upwards. A small staggered translate-y entry
// transition gives the stack a subtle motion cue.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const MAX_TOASTS = 3;
const DEFAULT_DURATION_MS = 3000;

interface Toast {
  id: number;
  message: string;
  /** ms-from-creation when this toast should auto-dismiss. */
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Per-toast dismiss timers keyed by id — independent of state, so
  // FIFO eviction can clear the evicted toast's pending timer without
  // re-scheduling the survivors.
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, duration = DEFAULT_DURATION_MS) => {
    const id = ++idRef.current;
    const toast: Toast = { id, message, duration };

    setToasts((prev) => {
      // FIFO eviction: drop the oldest if we'd otherwise exceed the cap.
      // Clearing the evicted toast's timer here keeps `timersRef` in
      // sync with the rendered stack and prevents a late dismiss firing
      // for a toast that's already gone.
      let next = prev;
      while (next.length >= MAX_TOASTS) {
        const evicted = next[0];
        const t = timersRef.current.get(evicted.id);
        if (t) {
          clearTimeout(t);
          timersRef.current.delete(evicted.id);
        }
        next = next.slice(1);
      }
      return [...next, toast];
    });

    const timer = setTimeout(() => dismiss(id), duration);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  useEffect(() => {
    // Snapshot the timer Map so the cleanup operates on a stable
    // reference. The Map identity is constant for the provider's
    // lifetime, but the lint rule doesn't know that and warns when a
    // cleanup reads `ref.current` directly.
    const timers = timersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="false"
          data-testid="toast-stack"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex flex-col gap-2 items-center"
        >
          {/* Render oldest-at-top, newest-at-bottom. The stack lives at
           *  the bottom edge of the viewport, so iterating in insertion
           *  order naturally gives older items higher up. */}
          {toasts.map((t, i) => (
            <div
              key={t.id}
              data-testid="toast-item"
              data-toast-id={t.id}
              style={{
                // Subtle stagger — newest fully prominent, older toasts
                // dim slightly so the user's eye lands on the latest.
                opacity: 1 - (toasts.length - 1 - i) * 0.15,
                transform: `translateY(${(toasts.length - 1 - i) * 2}px)`,
                transitionProperty: "opacity, transform",
                transitionDuration: "150ms",
              }}
              className="bg-slate-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg"
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
