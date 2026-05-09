import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./hooks/useSkillBootstrap", () => ({
  useSkillBootstrap: vi.fn().mockReturnValue({ justInstalled: false, done: true, error: null }),
}));

vi.mock("../../infrastructure/settingsStore", () => ({
  getClaudeSurface: vi.fn().mockResolvedValue("terminal"),
}));

vi.mock("./ClaudeChatDrawer", () => ({
  ClaudeChatDrawer: () => <div data-testid="claude-chat-drawer" />,
}));

vi.mock("../terminal/TerminalDrawer", () => ({
  TerminalDrawer: () => <div data-testid="terminal-drawer" />,
}));

vi.mock("../terminal/registerSurfaceCommand", () => ({
  RegisterSurfaceCommand: () => null,
}));

vi.mock("./components/SkillInstallToast", () => ({
  SkillInstallToast: ({ show }: { show: boolean }) =>
    show ? <div data-testid="skill-install-toast" /> : null,
}));

import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { getClaudeSurface } from "../../infrastructure/settingsStore";
import { ClaudeDrawer } from "./ClaudeDrawer";

describe("ClaudeDrawer", () => {
  beforeEach(() => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: false,
      done: true,
      error: null,
    });
  });

  it("TERM-14.4-01: default surface 'terminal' renders TerminalDrawer", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("terminal");
    const { findByTestId } = render(<ClaudeDrawer vaultPath={null} />);
    // TerminalDrawer stub is rendered immediately (initial state = 'terminal')
    expect(screen.getByTestId("terminal-drawer")).toBeInTheDocument();
    // Await async state update from getClaudeSurface (still 'terminal')
    await findByTestId("terminal-drawer");
    expect(screen.queryByTestId("claude-chat-drawer")).toBeNull();
  });

  it("TERM-14.4-02: surface 'chat' renders ClaudeChatDrawer", async () => {
    vi.mocked(getClaudeSurface).mockResolvedValue("chat");
    const { findByTestId } = render(<ClaudeDrawer vaultPath={null} />);
    // Wait for useEffect to resolve getClaudeSurface → 'chat'
    await findByTestId("claude-chat-drawer");
    expect(screen.queryByTestId("terminal-drawer")).toBeNull();
  });

  it("TERM-14.4-03: skillBootstrap.justInstalled fires SkillInstallToast", () => {
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: true,
      done: true,
      error: null,
    });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.getByTestId("skill-install-toast")).toBeInTheDocument();
  });

  it("TERM-14.4-04: SkillInstallToast not shown when justInstalled=false", () => {
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: false,
      done: true,
      error: null,
    });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.queryByTestId("skill-install-toast")).toBeNull();
  });
});
