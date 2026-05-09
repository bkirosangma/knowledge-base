import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("../../../infrastructure/settingsStore", () => ({
  getClaudeDrawerHeight: vi.fn(async () => 320),
  setClaudeDrawerHeight: vi.fn(async () => undefined),
}));

import { getClaudeDrawerHeight, setClaudeDrawerHeight } from "../../../infrastructure/settingsStore";
import { useDrawerState } from "./useDrawerState";

describe("useDrawerState", () => {
  it("starts closed (open state not persisted per spec § 7.4)", () => {
    const { result } = renderHook(() => useDrawerState());
    expect(result.current.isOpen).toBe(false);
  });

  it("toggles open/close", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { result.current.toggle(); });
    expect(result.current.isOpen).toBe(true);
    await act(async () => { result.current.close(); });
    expect(result.current.isOpen).toBe(false);
  });

  it("loads height from settings on mount", async () => {
    vi.mocked(getClaudeDrawerHeight).mockResolvedValueOnce(420);
    const { result } = renderHook(() => useDrawerState());
    await waitFor(() => expect(result.current.height).toBe(420));
  });

  it("persists height on setHeight", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { await result.current.setHeight(500); });
    expect(setClaudeDrawerHeight).toHaveBeenCalledWith(500);
    expect(result.current.height).toBe(500);
  });

  it("clamps height to [120, window.innerHeight - 80]", async () => {
    const { result } = renderHook(() => useDrawerState());
    await act(async () => { await result.current.setHeight(50); });
    expect(result.current.height).toBe(120);
  });
});
