import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import DiagramToolbarOverflow from "./DiagramToolbarOverflow";

function makeProps() {
  return {
    isLive: false,
    onToggleLive: vi.fn(),
    showLabels: true,
    onToggleLabels: vi.fn(),
    showMinimap: false,
    onToggleMinimap: vi.fn(),
  };
}

describe("DiagramToolbarOverflow", () => {
  it("DIAG-3.X-overflow: trigger renders, menu hidden by default", () => {
    render(<DiagramToolbarOverflow {...makeProps()} />);
    expect(screen.getByTestId("diagram-toolbar-overflow-trigger")).toBeInTheDocument();
    expect(screen.queryByTestId("diagram-toolbar-overflow-menu")).toBeNull();
  });

  it("opens the menu on trigger click", () => {
    render(<DiagramToolbarOverflow {...makeProps()} />);
    fireEvent.click(screen.getByTestId("diagram-toolbar-overflow-trigger"));
    expect(screen.getByTestId("diagram-toolbar-overflow-menu")).toBeInTheDocument();
    expect(screen.getByTestId("overflow-item-live")).toBeInTheDocument();
    expect(screen.getByTestId("overflow-item-labels")).toBeInTheDocument();
    expect(screen.getByTestId("overflow-item-minimap")).toBeInTheDocument();
  });

  it("clicking an item fires its toggle and closes the menu", () => {
    const props = makeProps();
    render(<DiagramToolbarOverflow {...props} />);
    fireEvent.click(screen.getByTestId("diagram-toolbar-overflow-trigger"));
    fireEvent.click(screen.getByTestId("overflow-item-live"));
    expect(props.onToggleLive).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("diagram-toolbar-overflow-menu")).toBeNull();
  });

  it("aria-checked reflects the active state", () => {
    render(<DiagramToolbarOverflow {...makeProps()} />);
    fireEvent.click(screen.getByTestId("diagram-toolbar-overflow-trigger"));
    expect(screen.getByTestId("overflow-item-live")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("overflow-item-labels")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("overflow-item-minimap")).toHaveAttribute("aria-checked", "false");
  });

  it("Escape closes the menu", () => {
    render(<DiagramToolbarOverflow {...makeProps()} />);
    fireEvent.click(screen.getByTestId("diagram-toolbar-overflow-trigger"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("diagram-toolbar-overflow-menu")).toBeNull();
  });
});
