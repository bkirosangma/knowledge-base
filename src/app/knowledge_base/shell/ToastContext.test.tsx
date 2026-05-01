import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ToastProvider, useToast } from "./ToastContext";

function ShowToastButton({ msg }: { msg: string }) {
  const { showToast } = useToast();
  return <button onClick={() => showToast(msg)}>show</button>;
}

describe("ToastContext", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("SHELL-1.8-01: renders the toast message when showToast is called", () => {
    render(
      <ToastProvider>
        <ShowToastButton msg="File reloaded from disk" />
      </ToastProvider>
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByTestId("toast-stack")).toHaveTextContent("File reloaded from disk");
  });

  it("SHELL-1.8-02: auto-dismisses after the default 3000ms", () => {
    render(
      <ToastProvider>
        <ShowToastButton msg="hello" />
      </ToastProvider>
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByTestId("toast-stack")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByTestId("toast-stack")).toBeNull();
  });

  it("SHELL-1.8-03: KB-014 — successive toasts stack instead of replacing", () => {
    // Pre-KB-014 behaviour was "second replaces first". Post-KB-014 the
    // stack holds up to 3 simultaneous toasts so users don't lose the
    // first message when a second arrives close behind.
    function TwoButtons() {
      const { showToast } = useToast();
      return (
        <>
          <button onClick={() => showToast("Toast: first")}>first</button>
          <button onClick={() => showToast("Toast: second")}>second</button>
        </>
      );
    }
    render(<ToastProvider><TwoButtons /></ToastProvider>);
    act(() => screen.getByRole("button", { name: "first" }).click());
    act(() => screen.getByRole("button", { name: "second" }).click());
    const items = screen.getAllByTestId("toast-item");
    expect(items.map((el) => el.textContent)).toEqual(["Toast: first", "Toast: second"]);
  });

  it("SHELL-1.8-04: throws when useToast is called outside the provider", () => {
    function Bad() { useToast(); return null; }
    expect(() => render(<Bad />)).toThrow("useToast must be used within ToastProvider");
  });
});

// ─── KB-014: stack semantics ────────────────────────────────────────────

function StackHarness({ onReady }: { onReady: (api: ReturnType<typeof useToast>) => void }) {
  const api = useToast();
  // Side-effect during render is intentional — tests want a synchronous
  // handle to `showToast` outside the component tree.
  onReady(api);
  return null;
}

describe("ToastContext — KB-014 stack", () => {
  let api: ReturnType<typeof useToast> | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    api = null;
  });
  afterEach(() => vi.useRealTimers());

  function renderProvider() {
    return render(
      <ToastProvider>
        <StackHarness onReady={(a) => { api = a; }} />
      </ToastProvider>,
    );
  }

  it("KB-014-01: 4 toasts → only 3 visible, oldest evicted (FIFO)", () => {
    renderProvider();
    act(() => {
      api!.showToast("first");
      api!.showToast("second");
      api!.showToast("third");
      api!.showToast("fourth");
    });
    const items = screen.getAllByTestId("toast-item");
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.textContent)).toEqual(["second", "third", "fourth"]);
    expect(screen.queryByText("first")).toBeNull();
  });

  it("KB-014-02: each toast disappears on its own timer", () => {
    renderProvider();
    act(() => { api!.showToast("a", 1000); });
    act(() => {
      vi.advanceTimersByTime(500);
      api!.showToast("b", 1000);
    });
    expect(screen.getAllByTestId("toast-item").map((el) => el.textContent)).toEqual(["a", "b"]);

    // At t=1000 (a's deadline): a dismisses, b survives.
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.getAllByTestId("toast-item").map((el) => el.textContent)).toEqual(["b"]);

    // At t=1500: b dismisses.
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByTestId("toast-item")).toBeNull();
  });

  it("KB-014-03: render order is bottom-up — oldest first in DOM, newest last", () => {
    renderProvider();
    act(() => {
      api!.showToast("oldest");
      api!.showToast("middle");
      api!.showToast("newest");
    });
    const items = screen.getAllByTestId("toast-item");
    expect(items.map((el) => el.textContent)).toEqual(["oldest", "middle", "newest"]);
  });

  it("KB-014-04: unmount clears pending timers without throwing", () => {
    const { unmount } = renderProvider();
    act(() => {
      api!.showToast("a");
      api!.showToast("b");
    });
    unmount();
    // Advancing the clock post-unmount must not throw or warn — if a
    // timer were left pending it would call setState on an unmounted
    // component.
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(true).toBe(true);
  });
});
