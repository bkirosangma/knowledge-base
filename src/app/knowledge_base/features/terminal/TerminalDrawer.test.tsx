import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../claude/ChatContext", () => ({
  useChat: vi.fn(),
}));

vi.mock("./TerminalSurface", () => ({
  TerminalSurface: ({ vaultPath }: { vaultPath: string | null }) => (
    <div data-testid="terminal-surface" data-vault-path={vaultPath ?? ""} />
  ),
}));

vi.mock("../claude/components/DrawerResizeHandle", () => ({
  DrawerResizeHandle: () => <div data-testid="drawer-resize-handle" />,
}));

import { useChat } from "../claude/ChatContext";
import { TerminalDrawer } from "./TerminalDrawer";

function makeChatState(overrides: Partial<ReturnType<typeof useChat>> = {}) {
  return {
    isOpen: true,
    height: 320,
    close: vi.fn(),
    setHeight: vi.fn(),
    turns: [],
    isStreaming: false,
    send: vi.fn(),
    interrupt: vi.fn(),
    reset: vi.fn(),
    open: vi.fn(),
    toggle: vi.fn(),
    errorMessage: null,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    ...overrides,
  } as unknown as ReturnType<typeof useChat>;
}

describe("TerminalDrawer", () => {
  beforeEach(() => {
    vi.mocked(useChat).mockReturnValue(makeChatState());
  });

  it("TERM-14.2-01: stays mounted but hidden when isOpen=false (xterm scrollback persists)", async () => {
    vi.mocked(useChat).mockReturnValue(makeChatState({ isOpen: false }));
    const { container } = render(<TerminalDrawer vaultPath={null} />);
    // The drawer DOM persists (xterm + listener stay alive) but is hidden
    // via display:none + aria-hidden. Use direct query because display:none
    // removes the element from the accessibility tree (which is the point —
    // the user can't see or focus it).
    const drawer = container.querySelector('[aria-label="Claude terminal drawer"]');
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute("aria-hidden", "true");
    expect(drawer as HTMLElement).toHaveStyle({ display: "none" });
    // TerminalSurface stays mounted so the xterm.js instance + scrollback
    // survive drawer toggles. findByTestId awaits the next/dynamic load.
    expect(await screen.findByTestId("terminal-surface")).toBeInTheDocument();
  });

  it("TERM-14.2-05: drops aria-hidden + flex display when isOpen=true", async () => {
    vi.mocked(useChat).mockReturnValue(makeChatState({ isOpen: true }));
    render(<TerminalDrawer vaultPath={null} />);
    const region = await screen.findByRole("region", { name: "Claude terminal drawer" });
    expect(region).toHaveAttribute("aria-hidden", "false");
    expect(region).toHaveStyle({ display: "flex" });
  });

  it("TERM-14.2-02: renders region 'Claude terminal drawer' when isOpen=true", () => {
    render(<TerminalDrawer vaultPath="/vault/path" />);
    expect(screen.getByRole("region", { name: "Claude terminal drawer" })).toBeInTheDocument();
  });

  it("TERM-14.2-03: Escape key calls close()", async () => {
    const close = vi.fn();
    vi.mocked(useChat).mockReturnValue(makeChatState({ close }));
    render(<TerminalDrawer vaultPath={null} />);
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("TERM-14.2-04: renders TerminalSurface with vaultPath prop", () => {
    render(<TerminalDrawer vaultPath="/my/vault" />);
    const surface = screen.getByTestId("terminal-surface");
    expect(surface).toBeInTheDocument();
    expect(surface).toHaveAttribute("data-vault-path", "/my/vault");
  });
});
