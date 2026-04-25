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
    expect(screen.getByRole("status")).toHaveTextContent("File reloaded from disk");
  });

  it("SHELL-1.8-02: auto-dismisses after the default 3000ms", () => {
    render(
      <ToastProvider>
        <ShowToastButton msg="hello" />
      </ToastProvider>
    );
    act(() => screen.getByRole("button").click());
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("SHELL-1.8-03: replaces a previous toast with a new one", () => {
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
    expect(screen.getByRole("status")).toHaveTextContent("Toast: second");
    expect(screen.queryByText("Toast: first")).toBeNull();
  });

  it("SHELL-1.8-04: throws when useToast is called outside the provider", () => {
    function Bad() { useToast(); return null; }
    expect(() => render(<Bad />)).toThrow("useToast must be used within ToastProvider");
  });
});
