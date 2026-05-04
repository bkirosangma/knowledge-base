import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabEditorCanvasOverlay } from "./TabEditorCanvasOverlay";
import type { TabMetadata } from "../../../domain/tabEngine";

const meta: TabMetadata = {
  title: "Test",
  tempo: 120,
  timeSignature: { numerator: 4, denominator: 4 },
  tracks: [{ id: "0", name: "Guitar", instrument: "guitar", tuning: ["E2", "A2", "D3", "G3", "B3", "E4"], capo: 0 }],
  sections: [],
  totalBeats: 4,
  durationSeconds: 0,
};

describe("TabEditorCanvasOverlay", () => {
  it("renders a button grid of totalBeats × tuning.length cells", () => {
    render(
      <TabEditorCanvasOverlay metadata={meta} cursor={null} setCursor={() => {}} />,
    );
    // 4 beats × 6 strings = 24 cursor-target buttons
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(24);
  });

  it("each cell has a unique data-testid encoding beat and string", () => {
    render(
      <TabEditorCanvasOverlay metadata={meta} cursor={null} setCursor={() => {}} />,
    );
    expect(screen.getByTestId("tab-editor-cursor-target-0-1")).toBeInTheDocument();
    expect(screen.getByTestId("tab-editor-cursor-target-3-6")).toBeInTheDocument();
  });

  it("clicking a cell calls setCursor with the right location", () => {
    const setCursor = vi.fn();
    render(
      <TabEditorCanvasOverlay metadata={meta} cursor={null} setCursor={setCursor} />,
    );
    fireEvent.click(screen.getByTestId("tab-editor-cursor-target-2-4"));
    expect(setCursor).toHaveBeenCalledWith({ trackIndex: 0, voiceIndex: 0, beat: 2, string: 4 });
  });

  it("renders the cursor highlight at the active cell's coordinates", () => {
    render(
      <TabEditorCanvasOverlay
        metadata={meta}
        cursor={{ trackIndex: 0, voiceIndex: 0, beat: 2, string: 4 }}
        setCursor={() => {}}
        cellWidth={32}
        cellHeight={18}
      />,
    );
    const highlight = screen.getByTestId("tab-editor-cursor-highlight");
    expect(highlight.style.left).toBe("64px"); // 2 * 32
    expect(highlight.style.top).toBe("54px"); // (4-1) * 18
  });

  it("does not render the highlight when cursor is null", () => {
    render(
      <TabEditorCanvasOverlay metadata={meta} cursor={null} setCursor={() => {}} />,
    );
    expect(screen.queryByTestId("tab-editor-cursor-highlight")).toBeNull();
  });

  it("does not render the highlight when cursor.trackIndex differs from prop trackIndex", () => {
    render(
      <TabEditorCanvasOverlay
        metadata={meta}
        cursor={{ trackIndex: 1, voiceIndex: 0, beat: 0, string: 1 }}
        setCursor={() => {}}
        trackIndex={0}
      />,
    );
    expect(screen.queryByTestId("tab-editor-cursor-highlight")).toBeNull();
  });

  it("renders empty (no buttons, no highlight) when metadata is null", () => {
    render(
      <TabEditorCanvasOverlay metadata={null} cursor={null} setCursor={() => {}} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByTestId("tab-editor-cursor-highlight")).toBeNull();
  });

  it("uses custom cellWidth / cellHeight props for positioning", () => {
    render(
      <TabEditorCanvasOverlay
        metadata={meta}
        cursor={{ trackIndex: 0, voiceIndex: 0, beat: 1, string: 2 }}
        setCursor={() => {}}
        cellWidth={50}
        cellHeight={20}
      />,
    );
    const highlight = screen.getByTestId("tab-editor-cursor-highlight");
    expect(highlight.style.left).toBe("50px"); // 1 * 50
    expect(highlight.style.top).toBe("20px"); // (2-1) * 20
  });
});
