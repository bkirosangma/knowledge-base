// Covers CHAT-12.6-01 through 12.6-06 — ClaudeStatusLine display states.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../features/claude/hooks/useClaudeStatus", () => ({
  useClaudeStatus: vi.fn(),
}));
vi.mock("../../features/claude/hooks/useClaudeUsage", () => ({
  useClaudeUsage: vi.fn(),
}));

import { useClaudeStatus } from "../../features/claude/hooks/useClaudeStatus";
import { useClaudeUsage } from "../../features/claude/hooks/useClaudeUsage";
import { ClaudeStatusLine } from "./ClaudeStatusLine";

const mockedStatus = vi.mocked(useClaudeStatus);
const mockedUsage = vi.mocked(useClaudeUsage);

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
});
