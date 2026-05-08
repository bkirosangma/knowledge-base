import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PartialMessageStream } from "./PartialMessageStream";

describe("PartialMessageStream", () => {
  it("renders blinking cursor when streaming", () => {
    render(<PartialMessageStream isStreaming />);
    const cursor = screen.getByLabelText("streaming");
    expect(cursor).toHaveClass("animate-pulse");
  });

  it("renders nothing when not streaming", () => {
    const { container } = render(<PartialMessageStream isStreaming={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
