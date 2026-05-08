import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../features/claude/ChatContext", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "../../features/claude/ChatContext";
import { ChatToggleButton } from "./ChatToggleButton";

describe("ChatToggleButton", () => {
  it("toggles drawer when clicked", async () => {
    const toggle = vi.fn();
    vi.mocked(useChat).mockReturnValue({ toggle, isOpen: false, isStreaming: false } as any);
    render(<ChatToggleButton />);
    await userEvent.click(screen.getByRole("button", { name: /chat/i }));
    expect(toggle).toHaveBeenCalled();
  });

  it("pulses while streaming and closed", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: false, isStreaming: true } as any);
    const { container } = render(<ChatToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).toHaveClass("animate-pulse");
  });

  it("does not pulse when drawer open even if streaming", () => {
    vi.mocked(useChat).mockReturnValue({ toggle: vi.fn(), isOpen: true, isStreaming: true } as any);
    const { container } = render(<ChatToggleButton />);
    const icon = container.querySelector("svg");
    expect(icon).not.toHaveClass("animate-pulse");
  });
});
