import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";

describe("MessageBubble", () => {
  it("renders user role label and text", () => {
    render(<MessageBubble role="user" text="hello" />);
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders assistant role label", () => {
    render(<MessageBubble role="assistant" text="hi" />);
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("preserves newlines in text", () => {
    render(<MessageBubble role="assistant" text={"line1\nline2"} />);
    const body = screen.getByText(/line1/);
    expect(body).toHaveClass("whitespace-pre-wrap");
  });
});
