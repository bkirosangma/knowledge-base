import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    termOpen: vi.fn(() => Promise.resolve()),
    termWrite: vi.fn(() => Promise.resolve()),
    subscribeTermEvent: vi.fn(() => Promise.resolve(() => {})),
  },
}));

import { tauriBridge } from "../../../infrastructure/tauriBridge";
import { useTerminalSession } from "./useTerminalSession";

const open = vi.mocked(tauriBridge.termOpen);
const sub = vi.mocked(tauriBridge.subscribeTermEvent);

function fakeTerm() {
  return {
    rows: 24,
    cols: 80,
    write: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as import("@xterm/xterm").Terminal;
}

describe("useTerminalSession", () => {
  beforeEach(() => {
    open.mockClear();
    sub.mockClear();
    sub.mockResolvedValue(() => {});
  });

  it("TERM-14.1-01: skips open when vaultPath null", () => {
    renderHook(() =>
      useTerminalSession({ vaultPath: null, term: fakeTerm() }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-02: skips open when term null", () => {
    renderHook(() => useTerminalSession({ vaultPath: "/v", term: null }));
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-03: calls termOpen with rows/cols once both ready", async () => {
    renderHook(() =>
      useTerminalSession({ vaultPath: "/v", term: fakeTerm() }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/v", 24, 80);
  });

  it("TERM-14.1-04: re-opens on vaultPath change", async () => {
    const term = fakeTerm();
    const { rerender } = renderHook(
      ({ vaultPath }) => useTerminalSession({ vaultPath, term }),
      { initialProps: { vaultPath: "/a" } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/a", 24, 80);
    rerender({ vaultPath: "/b" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/b", 24, 80);
  });
});
