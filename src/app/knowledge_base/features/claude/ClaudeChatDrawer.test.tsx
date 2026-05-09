import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./ChatContext", () => ({
  useChat: vi.fn(),
}));

vi.mock("./hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));

vi.mock("../../infrastructure/settingsStore", () => ({
  getClaudePermissionMode: vi.fn().mockResolvedValue("acceptEdits"),
  setClaudePermissionMode: vi.fn().mockResolvedValue(undefined),
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
    } as unknown as ReturnType<typeof useChat>);
    const { container } = render(<ClaudeChatDrawer />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders message list + composer when open", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as unknown as ReturnType<typeof useChat>);
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
    } as unknown as ReturnType<typeof useChat>);
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
    } as unknown as ReturnType<typeof useChat>);
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it("renders SetupScreen when binary is missing", () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as unknown as ReturnType<typeof useChat>);
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
    } as unknown as ReturnType<typeof useChat>);
    vi.mocked(useClaudeStatus).mockReturnValue({
      status: { binary: "found", version: "2.1.129", auth: "api_key" },
      refresh: vi.fn(),
    });
    render(<ClaudeChatDrawer />);
    expect(screen.getByText(/billed per token/i)).toBeInTheDocument();
  });

  it("CHAT-12.9-01: Skills header button opens the SkillsSheet", async () => {
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send: vi.fn(), interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as unknown as ReturnType<typeof useChat>);
    render(<ClaudeChatDrawer />);
    // Sheet should be closed initially
    expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open Skills sheet" }));
    expect(screen.getByRole("dialog", { name: "Skills" })).toBeInTheDocument();
  });

  it("CHAT-12.9-02: Skills card Run calls send with formatted text and closes sheet", async () => {
    const send = vi.fn();
    vi.mocked(useChat).mockReturnValue({
      isOpen: true, height: 320, turns: [], isStreaming: false,
      send, interrupt: vi.fn(), reset: vi.fn(), close: vi.fn(),
      setHeight: vi.fn(), errorMessage: null, open: vi.fn(), toggle: vi.fn(),
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    } as unknown as ReturnType<typeof useChat>);
    render(<ClaudeChatDrawer />);

    // Open the sheet
    await userEvent.click(screen.getByRole("button", { name: "Open Skills sheet" }));
    expect(screen.getByRole("dialog", { name: "Skills" })).toBeInTheDocument();

    // Submit the validate card (no-arg form — submits immediately)
    fireEvent.submit(screen.getByTestId("skill-card-validate"));

    // Sheet should be dismissed
    expect(screen.queryByRole("dialog", { name: "Skills" })).toBeNull();

    // send should have been called with the /kb validate command text
    expect(send).toHaveBeenCalledWith("/kb validate");
  });
});
