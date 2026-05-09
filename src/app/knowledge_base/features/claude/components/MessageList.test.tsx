import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatTurn } from "../types";

describe("MessageList", () => {
  it("renders empty state with no turns", () => {
    render(<MessageList turns={[]} isStreaming={false} />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it("renders a user + assistant turn pair", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
      { turn: 1, role: "assistant", text: "hello", toolUses: [], isStreaming: false },
    ];
    render(<MessageList turns={turns} isStreaming={false} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders streaming indicator inside live assistant turn", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "assistant", text: "Hel", toolUses: [], isStreaming: true },
    ];
    render(<MessageList turns={turns} isStreaming />);
    expect(screen.getByLabelText("streaming")).toBeInTheDocument();
  });

  it("renders tool-use blocks inside assistant turn", () => {
    const turns: ChatTurn[] = [
      {
        turn: 1, role: "assistant", text: "", toolUses: [
          { tool: "Read", input: { path: "a.md" } },
        ], isStreaming: true,
      },
    ];
    render(<MessageList turns={turns} isStreaming />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("CHAT-12.2-07: shows thinking indicator while streaming with no turns", () => {
    render(<MessageList turns={[]} isStreaming />);
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
  });

  it("CHAT-12.2-08: hides thinking indicator when not streaming (empty turns)", () => {
    render(<MessageList turns={[]} isStreaming={false} />);
    expect(screen.queryByTestId("thinking-indicator")).toBeNull();
  });

  it("CHAT-12.2-09: hides thinking indicator once assistant turn has content", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
      { turn: 1, role: "assistant", text: "hello", toolUses: [], isStreaming: true },
    ];
    render(<MessageList turns={turns} isStreaming />);
    expect(screen.queryByTestId("thinking-indicator")).toBeNull();
  });

  it("CHAT-12.2-10: shows thinking indicator when latest turn is user (no assistant reply yet)", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
    ];
    render(<MessageList turns={turns} isStreaming />);
    expect(screen.getByTestId("thinking-indicator")).toBeInTheDocument();
  });
});
