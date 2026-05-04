import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SelectedNoteDetails } from "./SelectedNoteDetails";
import type { Technique } from "../../../domain/tabEngine";

describe("SelectedNoteDetails", () => {
  it("renders nothing when details is null", () => {
    const { container } = render(
      <SelectedNoteDetails details={null} cursorBeat={0} cursorString={1} onApply={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the section header when details is provided", () => {
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques: new Set(), bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={0} cursorString={1} onApply={() => {}}
      />,
    );
    expect(screen.getByText(/selected note/i)).toBeInTheDocument();
  });

  it("renders bend preset buttons (½, full, 1½)", () => {
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques: new Set(), bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={0} cursorString={1} onApply={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "½" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /full/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1½" })).toBeInTheDocument();
  });

  it("clicking a bend preset dispatches add-technique bend", () => {
    const onApply = vi.fn();
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques: new Set(), bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={4} cursorString={6} onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /full/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ type: "add-technique", technique: "bend" }));
  });

  it("renders 4 additional technique toggles (ghost, tap, tremolo, harmonic)", () => {
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques: new Set(), bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={0} cursorString={1} onApply={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /ghost/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tap/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tremolo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /natural harmonic/i })).toBeInTheDocument();
  });

  it("active technique button has aria-pressed=true", () => {
    const techniques: Set<Technique> = new Set(["ghost"]);
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques, bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={0} cursorString={1} onApply={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /ghost/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking an active technique dispatches remove-technique", () => {
    const onApply = vi.fn();
    const techniques: Set<Technique> = new Set(["ghost"]);
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques, bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={4} cursorString={6} onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ghost/i }));
    expect(onApply).toHaveBeenCalledWith({ type: "remove-technique", beat: 4, string: 6, technique: "ghost" });
  });

  it("clicking an inactive technique dispatches add-technique", () => {
    const onApply = vi.fn();
    render(
      <SelectedNoteDetails
        details={{ fret: 5, techniques: new Set(), bendAmount: null, slideDirection: null, slideTargetFret: null }}
        cursorBeat={4} cursorString={6} onApply={onApply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /tap/i }));
    expect(onApply).toHaveBeenCalledWith({ type: "add-technique", beat: 4, string: 6, technique: "tap" });
  });
});
