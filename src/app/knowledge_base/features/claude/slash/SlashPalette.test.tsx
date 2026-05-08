import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SlashPalette } from "./SlashPalette";
import { SLASH_COMMANDS } from "./slashCommands";

describe("SlashPalette", () => {
  it("SLASH-13.2-07: renders one option per command", () => {
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={0} onSelect={vi.fn()} onHighlightChange={vi.fn()} />);
    expect(screen.getAllByRole("option")).toHaveLength(SLASH_COMMANDS.length);
  });

  it("SLASH-13.2-08: applies highlight to the right option", () => {
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={2} onSelect={vi.fn()} onHighlightChange={vi.fn()} />);
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });

  it("SLASH-13.2-09: mouseDown triggers onSelect (not click)", () => {
    const onSelect = vi.fn();
    render(<SlashPalette commands={SLASH_COMMANDS} highlight={0} onSelect={onSelect} onHighlightChange={vi.fn()} />);
    fireEvent.mouseDown(screen.getByTestId("slash-option-document"));
    expect(onSelect).toHaveBeenCalledWith(SLASH_COMMANDS.find((c) => c.id === "document"));
  });
});
