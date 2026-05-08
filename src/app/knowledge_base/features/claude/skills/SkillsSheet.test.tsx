import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SkillsSheet } from "./SkillsSheet";
import { SLASH_COMMANDS } from "../slash/slashCommands";

describe("SkillsSheet", () => {
  it("SKILLS-13.3-01: renders nothing when closed", () => {
    render(<SkillsSheet open={false} onClose={vi.fn()} onRun={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("SKILLS-13.3-02: renders one card per slash command when open", () => {
    render(<SkillsSheet open onClose={vi.fn()} onRun={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Skills" })).toBeInTheDocument();
    for (const c of SLASH_COMMANDS) {
      expect(screen.getByTestId(`skill-card-${c.id}`)).toBeInTheDocument();
    }
  });

  it("SKILLS-13.3-03: Close button calls onClose", () => {
    const onClose = vi.fn();
    render(<SkillsSheet open onClose={onClose} onRun={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close skills sheet" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("SKILLS-13.3-04: Escape calls onClose", () => {
    const onClose = vi.fn();
    render(<SkillsSheet open onClose={onClose} onRun={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("SKILLS-13.3-05: backdrop mouseDown calls onClose", () => {
    const onClose = vi.fn();
    render(<SkillsSheet open onClose={onClose} onRun={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("SKILLS-13.3-06: clicking inside cards does NOT close the sheet", () => {
    const onClose = vi.fn();
    render(<SkillsSheet open onClose={onClose} onRun={vi.fn()} />);
    // Cards live in the inner div whose onMouseDown stops propagation.
    fireEvent.mouseDown(screen.getByTestId("skill-card-validate"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
