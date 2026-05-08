import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./ChatContext", () => ({
  useChat: vi.fn(),
}));

vi.mock("./hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));

import { useChat } from "./ChatContext";
import { useClaudeStatus } from "./hooks/useClaudeStatus";
import { ClaudeChatDrawer } from "./ClaudeChatDrawer";

describe("ClaudeChatDrawer", () => {
  beforeEach(() => {
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "found", version: "2.1.129", auth: "oauth" },
      refresh: vi.fn(),
    });
  });

  it("renders nothing when closed", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: false, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    const { container } = render(<ClaudeChatDrawer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders message list + composer when open", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const close = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close,
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalled();
  });

  it("renders error banner when errorMessage present", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: "boom", open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders SetupScreen when binary is missing", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "missing", auth: "unknown" },
      refresh: vi.fn(),
    });
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/install claude/i)).toBeInTheDocument();
    // Composer textarea should NOT render in setup mode
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders api-key banner when auth is api_key", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as any);
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "found", version: "2.1.129", auth: "api_key" },
      refresh: vi.fn(),
    });
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/billed per token/i)).toBeInTheDocument();
  });
});
