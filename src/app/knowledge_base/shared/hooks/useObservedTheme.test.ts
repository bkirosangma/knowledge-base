import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useObservedTheme } from "./useObservedTheme";

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  host.setAttribute("data-theme", "light");
  document.body.appendChild(host);
});

afterEach(() => {
  host.remove();
});

describe("useObservedTheme", () => {
  it("reads the initial theme from the data-theme attribute on mount", () => {
    host.setAttribute("data-theme", "dark");
    const { result } = renderHook(() => useObservedTheme());
    expect(result.current).toBe("dark");
  });

  it("updates when the data-theme attribute changes", async () => {
    const { result } = renderHook(() => useObservedTheme());
    expect(result.current).toBe("light");

    await act(async () => {
      host.setAttribute("data-theme", "dark");
      // MutationObserver flushes via the microtask queue.
      await Promise.resolve();
    });
    expect(result.current).toBe("dark");

    await act(async () => {
      host.setAttribute("data-theme", "light");
      await Promise.resolve();
    });
    expect(result.current).toBe("light");
  });

  it("falls back to light when no data-theme element exists", () => {
    host.remove();
    const { result } = renderHook(() => useObservedTheme());
    expect(result.current).toBe("light");
  });

  it("treats any value other than 'dark' as light", () => {
    host.setAttribute("data-theme", "system");
    const { result } = renderHook(() => useObservedTheme());
    expect(result.current).toBe("light");
  });
});
