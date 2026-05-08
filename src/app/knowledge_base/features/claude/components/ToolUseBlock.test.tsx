import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolUseBlock } from "./ToolUseBlock";

describe("ToolUseBlock", () => {
  it("renders tool name and is collapsed by default", () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} />);
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByText(/x\.md/)).toBeNull();
  });

  it("expands on click", async () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText(/x\.md/)).toBeInTheDocument();
  });

  it("renders output when provided + expanded", async () => {
    render(<ToolUseBlock tool="Read" input={{ path: "x.md" }} output={"file contents"} />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByText("file contents")).toBeInTheDocument();
  });
});
