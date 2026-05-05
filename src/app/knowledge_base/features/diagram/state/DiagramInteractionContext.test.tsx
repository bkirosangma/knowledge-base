import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DiagramInteractionProvider, useLockedFlow } from "./DiagramInteractionContext";

describe("useLockedFlow", () => {
  it("starts null and toggles on demand", () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DiagramInteractionProvider>{children}</DiagramInteractionProvider>
    );
    const { result } = renderHook(() => useLockedFlow(), { wrapper });
    expect(result.current.lockedFlowId).toBeNull();
    act(() => result.current.setLockedFlowId("flow-x"));
    expect(result.current.lockedFlowId).toBe("flow-x");
    act(() => result.current.setLockedFlowId(null));
    expect(result.current.lockedFlowId).toBeNull();
  });
});
