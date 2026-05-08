// Covers CHAT-12.6-01 through 12.6-06 — ClaudeStatusLine display states.
// Covers CHAT-14-01, CHAT-14-02 — crashed-state banner + Retry.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../features/claude/ChatContext", () => ({
  useChat: vi.fn(),
}));
vi.mock("../../features/claude/hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));
vi.mock("../../features/claude/hooks/useClaudeUsage", () => ({
  useClaudeUsage: vi.fn(),
}));

import { useChat } from "../../features/claude/ChatContext";
import { useClaudeStatus } from "../../features/claude/hooks/useClaudeStatus";
import { useClaudeUsage } from "../../features/claude/hooks/useClaudeUsage";
import { ClaudeStatusLine } from "./ClaudeStatusLine";

const mockedChat = vi.mocked(useChat);
const mockedStatus = vi.mocked(useClaudeStatus);
const mockedUsage = vi.mocked(useClaudeUsage);

beforeEach(() => {
  mockedChat.mockReturnValue({ errorMessage: null, reset: vi.fn() } as unknown as ReturnType<typeof useChat>);
});

describe("ClaudeStatusLine", () => {
  it("CHAT-12.6-01: renders nothing while status is unknown", () => {
    mockedStatus.mockReturnValue({ status: { binary: "unknown", auth: "unknown" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    const { container } = render(<ClaudeStatusLine vaultName="kb" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("CHAT-12.6-02: renders idle state when binary found and no turns yet", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: idle/)).toBeInTheDocument();
    expect(screen.getByText(/vault: kb/)).toBeInTheDocument();
  });

  it("CHAT-12.6-03: renders not-installed state", () => {
    mockedStatus.mockReturnValue({ status: { binary: "missing", auth: "unknown" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: not installed/)).toBeInTheDocument();
  });

  it("CHAT-12.6-04: renders api-key warning", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "api_key" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/api-key billing/i)).toBeInTheDocument();
  });

  it("CHAT-12.6-05: renders active session with model + tokens + cost", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: "sonnet-4-6", inputTokens: 12400, outputTokens: 3200, costUsd: 0.04 });
    render(<ClaudeStatusLine vaultName="knowledge-base" />);
    expect(screen.getByText(/sonnet-4-6/)).toBeInTheDocument();
    expect(screen.getByText(/12\.4k in/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2k out/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.04/)).toBeInTheDocument();
    expect(screen.getByText(/vault: knowledge-base/)).toBeInTheDocument();
  });

  it("CHAT-12.6-06: suppresses vault segment when vaultName is empty", () => {
    mockedStatus.mockReturnValue({ status: { binary: "found", version: "2.1.129", auth: "oauth" }, refresh: vi.fn() });
    mockedUsage.mockReturnValue({ model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    render(<ClaudeStatusLine vaultName="" />);
    expect(screen.getByText(/claude: idle/)).toBeInTheDocument();
    expect(screen.queryByText(/vault:/)).toBeNull();
  });

  it("CHAT-14-01: renders crashed state with Retry button that calls reset", async () => {
    const reset = vi.fn();
    mockedChat.mockReturnValue({
      errorMessage: "Claude crashed: subprocess exited",
      reset,
    } as unknown as ReturnType<typeof useChat>);
    mockedStatus.mockReturnValue({
      status: { binary: "found", version: "2.1.129", auth: "oauth" },
      refresh: vi.fn(),
    });
    mockedUsage.mockReturnValue({
      model: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
    });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: failing to start/)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry/i });
    await userEvent.click(retry);
    expect(reset).toHaveBeenCalled();
  });

  it("CHAT-14-02: crashed banner takes priority over missing-binary state", () => {
    mockedChat.mockReturnValue({
      errorMessage: "Claude crashed: subprocess exited",
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useChat>);
    mockedStatus.mockReturnValue({
      status: { binary: "missing", auth: "unknown" },
      refresh: vi.fn(),
    });
    mockedUsage.mockReturnValue({
      model: null, inputTokens: 0, outputTokens: 0, costUsd: 0,
    });
    render(<ClaudeStatusLine vaultName="kb" />);
    expect(screen.getByText(/claude: failing to start/)).toBeInTheDocument();
    expect(screen.queryByText(/not installed/)).toBeNull();
  });
});
