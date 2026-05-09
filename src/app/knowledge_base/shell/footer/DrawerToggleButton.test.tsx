import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../features/claude/ChatContext", () => ({
  useChat: vi.fn(),
}));

vi.mock("../../features/claude/SurfaceContext", () => ({
  useSurface: vi.fn(),
}));

import { useChat } from "../../features/claude/ChatContext";
import { useSurface } from "../../features/claude/SurfaceContext";
import { DrawerToggleButton } from "./DrawerToggleButton";

describe("DrawerToggleButton", () => {
  it("toggles drawer when clicked", async () => {
    const toggle = vi.fn();
    vi.mocked(useChat).mockReturnValue({ toggle, isOpen: false, isStreaming: false } as unknown as ReturnType<typeof useChat>);
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface: vi.fn() });
    render(<DrawerToggleButton />);
    await userEvent.click(screen.getByRole("button", { name: /open claude/i }));
    expect(toggle).toHaveBeenCalled();
  });

  it("pulses while streaming, closed, and surface is chat", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: false, isStreaming: true } as unknown as ReturnType<typeof useChat>);
    vi.mocked(useSurface).mockReturnValue({ surface: "chat", setSurface: vi.fn() });
    const { container } = render(<DrawerToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("animate-pulse");
  });

  it("does not pulse when drawer open even if streaming", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: true, isStreaming: true } as unknown as ReturnType<typeof useChat>);
    vi.mocked(useSurface).mockReturnValue({ surface: "chat", setSurface: vi.fn() });
    const { container } = render(<DrawerToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).not.toHaveClass("animate-pulse");
  });

  it("does not pulse on terminal surface even while streaming and closed", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: false, isStreaming: true } as unknown as ReturnType<typeof useChat>);
    vi.mocked(useSurface).mockReturnValue({ surface: "terminal", setSurface: vi.fn() });
    const { container } = render(<DrawerToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).not.toHaveClass("animate-pulse");
  });
});
