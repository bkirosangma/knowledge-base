import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./hooks/useSkillBootstrap", () => ({
  useSkillBootstrap: vi.fn().mockReturnValue({ justInstalled: false, done: true, error: null }),
}));

vi.mock("./SurfaceContext", () => ({
  useSurface: vi.fn().mockReturnValue({ surface: "terminal", setSurface: vi.fn() }),
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
  SkillInstallToast: ({ show, tone }: { show: boolean; tone?: string }) =>
    show ? (
      <div
        data-testid={`skill-install-toast-${tone ?? "success"}`}
        role={tone === "error" ? "alert" : "status"}
      />
    ) : null,
}));

import { useSkillBootstrap } from "./hooks/useSkillBootstrap";
import { useSurface } from "./SurfaceContext";
import { ClaudeDrawer } from "./ClaudeDrawer";

describe("ClaudeDrawer", () => {
  beforeEach(() => {
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface: vi.fn() });
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: false,
      done: true,
      error: null,
    });
  });

  it("TERM-14.4-01: default surface 'terminal' renders TerminalDrawer", () => {
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface: vi.fn() });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.getByTestId("terminal-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("claude-chat-drawer")).toBeNull();
  });

  it("TERM-14.4-02: surface 'chat' renders ClaudeChatDrawer", () => {
    vi.mocked(useSurface).mockReturnValue({ surface: "chat", setSurface: vi.fn() });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.getByTestId("claude-chat-drawer")).toBeInTheDocument();
    expect(screen.queryByTestId("terminal-drawer")).toBeNull();
  });

  it("TERM-14.4-03: skillBootstrap.justInstalled fires SkillInstallToast", () => {
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: true,
      done: true,
      error: null,
    });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.getByTestId("skill-install-toast-success")).toBeInTheDocument();
  });

  it("TERM-14.4-04: SkillInstallToast not shown when justInstalled=false", () => {
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: false,
      done: true,
      error: null,
    });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.queryByTestId("skill-install-toast-success")).toBeNull();
  });

  it("SKILLS-13.1-10: renders error toast when skillBootstrap.error is set", () => {
    vi.mocked(useSkillBootstrap).mockReturnValue({
      justInstalled: false,
      done: true,
      error: "permission denied",
    });
    render(<ClaudeDrawer vaultPath={null} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("skill-install-toast-error")).toBeInTheDocument();
  });
});
