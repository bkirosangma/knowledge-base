// Covers DOC-4.13-15, 4.13-16, 4.13-17 (KB-043 prefix-skip optimization).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const heading = vi.fn((content: string): string => {
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : "";
});

vi.mock("../utils/getFirstHeading", () => ({
  getFirstHeading: (content: string) => heading(content),
}));

import {
  TITLE_DEBOUNCE_MS,
  useDerivedDocumentTitle,
} from "./useDerivedDocumentTitle";

beforeEach(() => {
  heading.mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDerivedDocumentTitle", () => {
  it("seeds with the heading parsed from the initial content", () => {
    const { result } = renderHook(() =>
      useDerivedDocumentTitle("# First\nbody", "fallback"),
    );
    expect(result.current).toBe("First");
  });

  it("falls back to the supplied fallback when content has no heading", () => {
    const { result } = renderHook(() =>
      useDerivedDocumentTitle("", "untitled"),
    );
    expect(result.current).toBe("untitled");
  });

  it("re-derives the title after the debounce when content changes", () => {
    const { result, rerender } = renderHook(
      ({ content }) => useDerivedDocumentTitle(content, "fallback"),
      { initialProps: { content: "# First\nbody" } },
    );
    rerender({ content: "# Second\nbody" });
    expect(result.current).toBe("First"); // before debounce
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    expect(result.current).toBe("Second");
  });

  it("DOC-4.13-17 (KB-043): skips getFirstHeading when only the tail of content changes", () => {
    // Make the initial content longer than the 200-char prefix window so
    // appending more text leaves the first-200 prefix untouched.
    const initial = "# Title\n" + "x".repeat(300);
    const { rerender } = renderHook(
      ({ content }) => useDerivedDocumentTitle(content, "fallback"),
      { initialProps: { content: initial } },
    );
    // Mount + initial debounce flush sets the cached prefix.
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    heading.mockClear();
    // Append far past the 200-char prefix window.
    rerender({ content: initial + "\n" + "y".repeat(500) });
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    expect(heading).not.toHaveBeenCalled();
  });

  it("DOC-4.13-17 (KB-043): re-runs getFirstHeading when the first 200 chars change", () => {
    const initial = "# Title\nbody";
    const { rerender } = renderHook(
      ({ content }) => useDerivedDocumentTitle(content, "fallback"),
      { initialProps: { content: initial } },
    );
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    heading.mockClear();
    rerender({ content: "# Renamed\nbody" });
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    expect(heading).toHaveBeenCalledTimes(1);
  });

  it("re-derives when fallback changes even if the prefix stays the same (file switch)", () => {
    const sharedPrefix = "no heading here\nbody";
    const { result, rerender } = renderHook(
      ({ content, fallback }) => useDerivedDocumentTitle(content, fallback),
      { initialProps: { content: sharedPrefix, fallback: "old.md" } },
    );
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    expect(result.current).toBe("old.md");
    rerender({ content: sharedPrefix, fallback: "new.md" });
    act(() => {
      vi.advanceTimersByTime(TITLE_DEBOUNCE_MS);
    });
    expect(result.current).toBe("new.md");
  });
});
