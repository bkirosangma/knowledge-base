import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AttachmentIndicator, type AttachmentCounts } from "./AttachmentIndicator";

// Covers DIAG-3.18-01/02/03 plus 4-way glyph extensions (MVP-2b).

const noAttachments: AttachmentCounts = { docs: 0, diagrams: 0, svgs: 0, tabs: 0 };

describe("AttachmentIndicator", () => {
  it("DIAG-3.18-02: renders nothing when all counts are zero", () => {
    const { container } = render(
      <AttachmentIndicator
        counts={noAttachments}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("DIAG-3.18-01: renders one glyph per non-empty type bucket", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 2, diagrams: 0, svgs: 0, tabs: 0 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(screen.getByTestId("attachment-indicator-glyph-docs")).toBeInTheDocument();
    expect(screen.queryByTestId("attachment-indicator-glyph-diagrams")).toBeNull();
    expect(screen.queryByTestId("attachment-indicator-glyph-svgs")).toBeNull();
    expect(screen.queryByTestId("attachment-indicator-glyph-tabs")).toBeNull();
  });

  it("renders all four glyphs when every bucket has content", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 1, diagrams: 1, svgs: 1, tabs: 1 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    expect(screen.getByTestId("attachment-indicator-glyph-docs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-diagrams")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-svgs")).toBeInTheDocument();
    expect(screen.getByTestId("attachment-indicator-glyph-tabs")).toBeInTheDocument();
  });

  it("DIAG-3.18-03: calls onClick once when clicked, stopping propagation", () => {
    const onClick = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <AttachmentIndicator
          counts={{ docs: 1, diagrams: 0, svgs: 0, tabs: 0 }}
          color="#3b82f6"
          position={{ x: 10, y: 20 }}
          onClick={onClick}
          testId="ind-1"
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId("attachment-indicator-ind-1"));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("includes an aria-label listing populated types", () => {
    render(
      <AttachmentIndicator
        counts={{ docs: 1, diagrams: 1, svgs: 0, tabs: 0 }}
        color="#3b82f6"
        position={{ x: 10, y: 20 }}
        onClick={() => {}}
        testId="ind-1"
      />,
    );
    const button = screen.getByTestId("attachment-indicator-ind-1");
    expect(button.getAttribute("aria-label")).toMatch(/docs/i);
    expect(button.getAttribute("aria-label")).toMatch(/diagrams/i);
  });
});
