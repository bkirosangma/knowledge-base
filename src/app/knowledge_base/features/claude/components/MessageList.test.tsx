import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "./MessageList";
import type { ChatTurn } from "../types";

describe("MessageList", () => {
  it("renders empty state with no turns", () => {
    render(<MessageList turns={[]} />);
    expect(screen.getByText(/start a conversation/i)).toBeInTheDocument();
  });

  it("renders a user + assistant turn pair", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "user", text: "hi", toolUses: [], isStreaming: false },
      { turn: 1, role: "assistant", text: "hello", toolUses: [], isStreaming: false },
    ];
    render(<MessageList turns={turns} />);
    expect(screen.getByText("hi")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders streaming indicator inside live assistant turn", () => {
    const turns: ChatTurn[] = [
      { turn: 1, role: "assistant", text: "Hel", toolUses: [], isStreaming: true },
    ];
    render(<MessageList turns={turns} />);
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
    render(<MessageList turns={turns} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
  });
});
