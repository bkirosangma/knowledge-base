"use client";

import { useEffect } from "react";

/**
 * Selector for "tabbable" elements inside the trapped subtree. Mirrors
 * the WAI-ARIA Authoring Practices list, then post-filters out
 * `disabled` and `tabindex="-1"` (which `[tabindex]:not([tabindex="-1"])`
 * already handles, but disabled buttons match the bare `button` selector
 * and need explicit removal).
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
  );
}

interface UseFocusTrapOptions {
  /** If provided, Escape inside the trapped subtree calls this. */
  onEscape?: () => void;
  /**
   * Override the initial focus target. Defaults to the first focusable
   * descendant. Pass a ref to a specific element (a search input, a
   * primary action button) when the natural first-element default isn't
   * the right entry point.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

/**
 * KB-031 — generic focus trap for modal-shaped UI.
 *
 * Behaviour when `isOpen` flips true → false → true:
 *
 *  - **On open:** captures `document.activeElement` (the trigger), then
 *    moves focus to the first focusable descendant of `ref`
 *    (or `initialFocusRef` if supplied) on the next microtask so the
 *    modal's tree has rendered.
 *  - **While open:** intercepts Tab / Shift+Tab document-wide and wraps
 *    the focus order around the focusable elements inside `ref`. Tab
 *    from the last element jumps to the first; Shift+Tab from the first
 *    jumps to the last. Tab from outside the trap snaps focus back in.
 *  - **On Escape:** calls `onEscape` if supplied (the host owns the
 *    close decision; the hook never closes by itself).
 *  - **On close (or unmount):** restores focus to the captured
 *    trigger element via `prevFocus.focus()`.
 *
 * Does not render anything. Drop into the open/close effect chain of any
 * modal-shaped component.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  options?: UseFocusTrapOptions,
) {
  const onEscape = options?.onEscape;
  const initialFocusRef = options?.initialFocusRef;

  useEffect(() => {
    if (!isOpen) return;
    const root = ref.current;
    if (!root) return;

    const prevFocus = document.activeElement as HTMLElement | null;

    // Defer the initial focus by a microtask so the modal's children
    // (including any autoFocus inputs) have actually mounted.
    const t = setTimeout(() => {
      const target = initialFocusRef?.current ?? getFocusableElements(root)[0] ?? root;
      target.focus();
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const insideTrap = active != null && root.contains(active);

      if (!insideTrap) {
        // Focus has escaped the trap (clicked outside, programmatic
        // focus, etc.). Pull it back in.
        e.preventDefault();
        first.focus();
        return;
      }

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKeyDown);
      // Restore focus to the trigger. `?.focus()` is null-safe and
      // a `preventScroll: true` hint stops the page from jumping when
      // the trigger is offscreen at the time of close.
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, [isOpen, ref, onEscape, initialFocusRef]);
}
