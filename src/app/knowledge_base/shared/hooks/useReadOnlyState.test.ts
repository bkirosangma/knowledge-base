import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReadOnlyState } from "./useReadOnlyState";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe("useReadOnlyState", () => {
  it("defaults to false (edit mode) when no localStorage entry exists", () => {
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(false);
  });

  it("returns false when localStorage explicitly stores false", () => {
    localStorage.setItem("diagram-read-only:my-file.json", "false");
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(false);
  });

  it("returns true when localStorage stores true", () => {
    localStorage.setItem("diagram-read-only:my-file.json", "true");
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    expect(result.current.readOnly).toBe(true);
  });

  it("persists toggle under the diagram-read-only prefix by default", () => {
    const { result } = renderHook(() => useReadOnlyState("my-file.json"));
    // default is false (edit mode); toggle once → read-only
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("diagram-read-only:my-file.json")).toBe("true");
    expect(result.current.readOnly).toBe(true);
  });

  it("uses a custom prefix when provided", () => {
    const { result } = renderHook(() =>
      useReadOnlyState("notes.md", "document-read-only")
    );
    // default is false; toggle once → read-only stored under the custom prefix
    act(() => result.current.toggleReadOnly());
    expect(localStorage.getItem("document-read-only:notes.md")).toBe("true");
    expect(localStorage.getItem("diagram-read-only:notes.md")).toBeNull();
  });

  it("returns true when activeFile is null", () => {
    const { result } = renderHook(() => useReadOnlyState(null));
    expect(result.current.readOnly).toBe(true);
  });

  it("reloads preference when activeFile changes", () => {
    localStorage.setItem("diagram-read-only:b.json", "false");
    const { result, rerender } = renderHook(
      ({ file }: { file: string | null }) => useReadOnlyState(file),
      { initialProps: { file: "a.json" as string | null } }
    );
    expect(result.current.readOnly).toBe(false); // a.json has no entry → false (edit mode default)
    rerender({ file: "b.json" });
    expect(result.current.readOnly).toBe(false); // b.json is explicitly false
  });
});
