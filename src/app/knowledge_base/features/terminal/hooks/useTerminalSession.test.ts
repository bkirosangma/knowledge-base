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

function fakeFitAddon() {
  return {
    fit: vi.fn(),
  } as unknown as import("@xterm/addon-fit").FitAddon;
}

describe("useTerminalSession", () => {
  beforeEach(() => {
    open.mockClear();
    sub.mockClear();
    sub.mockResolvedValue(() => {});
  });

  it("TERM-14.1-01: skips open when vaultPath null", () => {
    renderHook(() =>
      useTerminalSession({
        vaultPath: null,
        term: fakeTerm(),
        fitAddon: fakeFitAddon(),
        isOpen: true,
      }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-02: skips open when term null", () => {
    renderHook(() =>
      useTerminalSession({
        vaultPath: "/v",
        term: null,
        fitAddon: fakeFitAddon(),
        isOpen: true,
      }),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("TERM-14.1-03: calls termOpen with rows/cols once both ready", async () => {
    renderHook(() =>
      useTerminalSession({
        vaultPath: "/v",
        term: fakeTerm(),
        fitAddon: fakeFitAddon(),
        isOpen: true,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/v", 24, 80);
  });

  it("TERM-14.1-04: re-opens on vaultPath change", async () => {
    const term = fakeTerm();
    const fitAddon = fakeFitAddon();
    const { rerender } = renderHook(
      ({ vaultPath }) =>
        useTerminalSession({ vaultPath, term, fitAddon, isOpen: true }),
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

  it("TERM-14.1-06: defers termOpen until isOpen flips true", async () => {
    const term = fakeTerm();
    const fitAddon = fakeFitAddon();
    const { rerender } = renderHook(
      ({ isOpen }) =>
        useTerminalSession({ vaultPath: "/v", term, fitAddon, isOpen }),
      { initialProps: { isOpen: false } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).not.toHaveBeenCalled();
    rerender({ isOpen: true });
    await act(async () => {
      await Promise.resolve();
    });
    expect(open).toHaveBeenCalledWith("/v", 24, 80);
  });

  it("TERM-14.1-07: calls fitAddon.fit() before termOpen so cols/rows reflect visible container", async () => {
    const term = fakeTerm();
    const fitAddon = fakeFitAddon();
    renderHook(() =>
      useTerminalSession({
        vaultPath: "/v",
        term,
        fitAddon,
        isOpen: true,
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(fitAddon.fit).toHaveBeenCalledBefore(open);
    expect(open).toHaveBeenCalled();
  });

  it("TERM-14.1-08: subscribes term_event listener as soon as term is ready (before isOpen)", async () => {
    const term = fakeTerm();
    const fitAddon = fakeFitAddon();
    renderHook(() =>
      useTerminalSession({
        vaultPath: "/v",
        term,
        fitAddon,
        isOpen: false, // drawer hidden
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    // Listener subscribed even though drawer is closed — bytes accumulate
    // in xterm's scrollback during closed phases.
    expect(sub).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
