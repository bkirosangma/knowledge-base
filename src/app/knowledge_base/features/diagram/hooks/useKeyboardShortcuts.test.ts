import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Selection, NodeData } from "../types";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function dispatchKey(key: string, opts: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, ...opts }));
}

function makeConfig(overrides: Partial<Parameters<typeof useKeyboardShortcuts>[0]> = {}) {
  const selectionRef = { current: null as Selection };
  const nodesRef = { current: [] as NodeData[] };
  const pendingSelectionRef = { current: null as null | { type: 'node' | 'layer' | 'line'; id: string; x: number; y: number } };
  return {
    cancelSelectionRect: vi.fn(),
    setSelection: vi.fn(),
    setContextMenu: vi.fn(),
    deleteSelection: vi.fn(() => null),
    setPendingDeletion: vi.fn(),
    handleCreateFlow: vi.fn(),
    handleUndo: vi.fn(),
    handleRedo: vi.fn(),
    selectionRef,
    pendingSelectionRef,
    nodesRef,
    readOnly: false,
    onToggleReadOnly: vi.fn(),
    lockedFlowId: null as string | null,
    setLockedFlowId: vi.fn(),
    ...overrides,
  };
}

describe("useKeyboardShortcuts — Cmd/Ctrl+L", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("locks the selected flow when not currently locked", () => {
    const cfg = makeConfig();
    cfg.selectionRef.current = { type: "flow", id: "f1" };
    renderHook(() => useKeyboardShortcuts(cfg));

    dispatchKey("l", { metaKey: true });

    expect(cfg.setLockedFlowId).toHaveBeenCalledWith("f1");
  });

  it("unlocks when already locked, regardless of selection type", () => {
    const cfg = makeConfig({ lockedFlowId: "f1" });
    cfg.selectionRef.current = { type: "node", id: "n1" };
    renderHook(() => useKeyboardShortcuts(cfg));

    dispatchKey("L", { ctrlKey: true });

    expect(cfg.setLockedFlowId).toHaveBeenCalledWith(null);
  });

  it("does nothing when no flow is selected and not locked", () => {
    const cfg = makeConfig();
    cfg.selectionRef.current = { type: "node", id: "n1" };
    renderHook(() => useKeyboardShortcuts(cfg));

    dispatchKey("l", { metaKey: true });

    expect(cfg.setLockedFlowId).not.toHaveBeenCalled();
  });
});
