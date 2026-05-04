import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TabEditorToolbar } from "./TabEditorToolbar";
import type { Technique } from "../../../domain/tabEngine";

const baseProps = () => ({
  activeDuration: 4 as const,
  onSetDuration: vi.fn(),
  activeTechniques: new Set<Technique>(),
  onToggleTechnique: vi.fn(),
  canUndo: false,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
  voiceIndex: 0 as const,
  onVoiceChange: vi.fn(),
});

describe("TabEditorToolbar", () => {
  it("renders 6 duration buttons", () => {
    render(<TabEditorToolbar {...baseProps()} />);
    const dur = screen.getAllByRole("button", { name: /(whole|half|quarter|eighth|sixteenth|thirty-second) note/i });
    expect(dur.length).toBe(6);
  });

  it("renders 8 technique buttons", () => {
    render(<TabEditorToolbar {...baseProps()} />);
    const techs = screen.getAllByRole("button", { name: /(hammer-on|pull-off|bend|slide|tie|vibrato|palm-mute|let-ring)/i });
    expect(techs.length).toBe(8);
  });

  it("renders undo + redo buttons", () => {
    render(<TabEditorToolbar {...baseProps()} />);
    expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /redo/i })).toBeInTheDocument();
  });

  it("active duration button has aria-pressed=true", () => {
    render(<TabEditorToolbar {...baseProps()} activeDuration={8} />);
    const eighth = screen.getByRole("button", { name: /eighth note/i });
    expect(eighth).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a duration button calls onSetDuration with the correct value", () => {
    const props = baseProps();
    render(<TabEditorToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /half note/i }));
    expect(props.onSetDuration).toHaveBeenCalledWith(2);
  });

  it("active technique button has aria-pressed=true", () => {
    render(<TabEditorToolbar {...baseProps()} activeTechniques={new Set(["bend"] as Technique[])} />);
    const bend = screen.getByRole("button", { name: /bend/i });
    expect(bend).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking a technique button calls onToggleTechnique with the correct value", () => {
    const props = baseProps();
    render(<TabEditorToolbar {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /hammer-on/i }));
    expect(props.onToggleTechnique).toHaveBeenCalledWith("hammer-on");
  });

  it("undo button is disabled when canUndo=false", () => {
    render(<TabEditorToolbar {...baseProps()} canUndo={false} />);
    expect(screen.getByRole("button", { name: /undo/i })).toBeDisabled();
  });

  it("redo button is disabled when canRedo=false", () => {
    render(<TabEditorToolbar {...baseProps()} canRedo={false} />);
    expect(screen.getByRole("button", { name: /redo/i })).toBeDisabled();
  });

  it("clicking undo calls onUndo when canUndo=true", () => {
    const props = baseProps();
    render(<TabEditorToolbar {...props} canUndo={true} />);
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(props.onUndo).toHaveBeenCalledOnce();
  });

  it("clicking redo calls onRedo when canRedo=true", () => {
    const props = baseProps();
    render(<TabEditorToolbar {...props} canRedo={true} />);
    fireEvent.click(screen.getByRole("button", { name: /redo/i }));
    expect(props.onRedo).toHaveBeenCalledOnce();
  });

  it("renders VoiceToggle and forwards onChange (TAB-009 T15)", () => {
    const onVoiceChange = vi.fn();
    const { getByRole } = render(
      <TabEditorToolbar {...baseProps()} voiceIndex={0} onVoiceChange={onVoiceChange} />
    );
    fireEvent.click(getByRole("button", { name: /Voice 2/ }));
    expect(onVoiceChange).toHaveBeenCalledWith(1);
  });

  it("VoiceToggle reflects voiceIndex prop", () => {
    const { getByRole, rerender } = render(
      <TabEditorToolbar {...baseProps()} voiceIndex={0} onVoiceChange={() => {}} />
    );
    expect(getByRole("button", { name: /Voice 1/ })).toHaveAttribute("aria-pressed", "true");
    rerender(<TabEditorToolbar {...baseProps()} voiceIndex={1} onVoiceChange={() => {}} />);
    expect(getByRole("button", { name: /Voice 2/ })).toHaveAttribute("aria-pressed", "true");
  });
});
