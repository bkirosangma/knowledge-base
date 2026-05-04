import { renderHook, act } from "@testing-library/react";
import { useTabEditMode } from "./useTabEditMode";
import { describe, it, expect, beforeEach } from "vitest";

describe("useTabEditMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("forces effectiveReadOnly true when paneReadOnly=true regardless of per-file state", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", true));
    expect(result.current.effectiveReadOnly).toBe(true);
    act(() => result.current.toggleReadOnly());
    expect(result.current.effectiveReadOnly).toBe(true); // stays gated by pane
  });

  it("uses per-file readOnly when paneReadOnly=false", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", false));
    expect(result.current.effectiveReadOnly).toBe(true); // default
    act(() => result.current.toggleReadOnly());
    expect(result.current.effectiveReadOnly).toBe(false);
  });

  it("toggle writes to localStorage with prefix tab-read-only", () => {
    const { result } = renderHook(() => useTabEditMode("song.alphatex", false));
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("tab-read-only:song.alphatex")).toBe("false");
  });

  it("returns true effective when filePath is null (no active file)", () => {
    const { result } = renderHook(() => useTabEditMode(null, false));
    expect(result.current.effectiveReadOnly).toBe(true); // useReadOnlyState defaults true on null
  });
});
