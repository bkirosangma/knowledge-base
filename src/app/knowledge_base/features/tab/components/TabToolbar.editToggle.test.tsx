import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabToolbar } from "./TabToolbar";

function makeBaseProps(overrides: Partial<React.ComponentProps<typeof TabToolbar>> = {}) {
  return {
    playerStatus: "paused" as const,
    isAudioReady: true,
    audioBlocked: false,
    onToggle: vi.fn(),
    onStop: vi.fn(),
    onSetTempoFactor: vi.fn(),
    onSetLoop: vi.fn(),
    ...overrides,
  };
}

describe("TabToolbar Edit/Read toggle", () => {
  it("TAB-012-01: renders Edit toggle when paneReadOnly=false (desktop)", () => {
    render(<TabToolbar {...makeBaseProps({ paneReadOnly: false, perFileReadOnly: true, onToggleReadOnly: vi.fn() })} />);
    expect(screen.getByRole("button", { name: /edit|read/i })).toBeInTheDocument();
  });

  it("TAB-012-02: does not render Edit toggle when paneReadOnly=true (mobile)", () => {
    render(<TabToolbar {...makeBaseProps({ paneReadOnly: true, perFileReadOnly: true, onToggleReadOnly: vi.fn() })} />);
    expect(screen.queryByRole("button", { name: /^(edit|read) tab/i })).toBeNull();
  });

  it("TAB-012-03: clicking the toggle calls onToggleReadOnly", () => {
    const onToggleReadOnly = vi.fn();
    render(<TabToolbar {...makeBaseProps({ paneReadOnly: false, perFileReadOnly: true, onToggleReadOnly })} />);
    fireEvent.click(screen.getByRole("button", { name: /edit tab/i }));
    expect(onToggleReadOnly).toHaveBeenCalledOnce();
  });

  it("TAB-012-04: label shows Edit when perFileReadOnly=true and Read when perFileReadOnly=false", () => {
    const { rerender } = render(
      <TabToolbar {...makeBaseProps({ paneReadOnly: false, perFileReadOnly: true, onToggleReadOnly: vi.fn() })} />,
    );
    expect(screen.getByRole("button", { name: /edit tab/i })).toHaveTextContent("Edit");
    rerender(
      <TabToolbar {...makeBaseProps({ paneReadOnly: false, perFileReadOnly: false, onToggleReadOnly: vi.fn() })} />,
    );
    expect(screen.getByRole("button", { name: /read tab/i })).toHaveTextContent("Read");
  });

  it("TAB-012-05: toggle is hidden when onToggleReadOnly is not provided", () => {
    render(<TabToolbar {...makeBaseProps({ paneReadOnly: false })} />);
    expect(screen.queryByRole("button", { name: /^(edit|read) tab/i })).toBeNull();
  });
});
