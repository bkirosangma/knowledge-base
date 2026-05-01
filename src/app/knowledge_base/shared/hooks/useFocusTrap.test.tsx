import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, render, cleanup, act } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "./useFocusTrap";

// KB-031 unit tests for the focus-trap hook. Renders a small modal-shaped
// fixture, drives Tab / Shift+Tab / Escape via document.dispatchEvent so
// JSDOM's keyboard handling stays predictable.

afterEach(cleanup);

function Fixture({ open, onEscape }: { open: boolean; onEscape?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onEscape ? { onEscape } : undefined);
  return (
    <div>
      <button data-testid="trigger">Trigger</button>
      {open && (
        <div ref={ref} data-testid="dialog">
          <button data-testid="first">First</button>
          <input data-testid="middle" />
          <button data-testid="last">Last</button>
        </div>
      )}
    </div>
  );
}

describe("useFocusTrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("focuses the first focusable inside the trap on open", () => {
    const { getByTestId } = render(<Fixture open />);
    act(() => { vi.runAllTimers(); });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Tab from the last focusable wraps to the first", () => {
    const { getByTestId } = render(<Fixture open />);
    act(() => { vi.runAllTimers(); });
    (getByTestId("last") as HTMLElement).focus();
    expect(document.activeElement).toBe(getByTestId("last"));

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Shift+Tab from the first focusable wraps to the last", () => {
    const { getByTestId } = render(<Fixture open />);
    act(() => { vi.runAllTimers(); });
    (getByTestId("first") as HTMLElement).focus();

    const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("focus that escapes the trap is pulled back in on Tab", () => {
    const { getByTestId } = render(<Fixture open />);
    act(() => { vi.runAllTimers(); });
    // Move focus outside the trap.
    (getByTestId("trigger") as HTMLElement).focus();
    expect(document.activeElement).toBe(getByTestId("trigger"));

    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("Escape calls onEscape when provided", () => {
    const onEscape = vi.fn();
    render(<Fixture open onEscape={onEscape} />);
    act(() => { vi.runAllTimers(); });

    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { document.dispatchEvent(ev); });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it("restores focus to the prior element on close", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("data-testid", "external-trigger");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(<Fixture open />);
    act(() => { vi.runAllTimers(); });
    // First focusable inside the trap is now active.
    expect((document.activeElement as HTMLElement)?.dataset.testid).toBe("first");

    // Close: hook teardown should restore focus to the trigger.
    rerender(<Fixture open={false} />);
    expect(document.activeElement).toBe(trigger);

    document.body.removeChild(trigger);
  });

  it("hook is a no-op when isOpen is false", () => {
    const onEscape = vi.fn();
    const { result } = renderHook(() => {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, false, { onEscape });
      return ref;
    });
    expect(result.current).toBeDefined();

    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(onEscape).not.toHaveBeenCalled();
  });
});
