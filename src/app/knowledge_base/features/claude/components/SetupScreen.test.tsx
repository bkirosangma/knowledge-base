import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));

import { useClaudeStatus } from "../hooks/useClaudeStatus";
import { SetupScreen } from "./SetupScreen";

describe("SetupScreen", () => {
  it("shows install heading", () => {
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "missing", auth: "unknown" },
      refresh: vi.fn(),
    });
    render(<SetupScreen />);
    expect(screen.getByText(/install claude/i)).toBeInTheDocument();
    expect(screen.getByText(/curl.*install\.sh/i)).toBeInTheDocument();
  });

  it("shows Refresh button", () => {
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "missing", auth: "unknown" },
      refresh: vi.fn(),
    });
    render(<SetupScreen />);
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
  });

  it("calls refresh on click", async () => {
    const refresh = vi.fn();
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "missing", auth: "unknown" },
      refresh,
    });
    render(<SetupScreen />);
    await userEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(refresh).toHaveBeenCalled();
  });
});
