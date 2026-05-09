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

  it("TERM-14.2-01: renders nothing when isOpen=false", () => {
    vi.mocked(useChat).mockReturnValue(makeChatState({ isOpen: false }));
    const { container } = render(<TerminalDrawer vaultPath={null} />);
    expect(container).toBeEmptyDOMElement();
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
