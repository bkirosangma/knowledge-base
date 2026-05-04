import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExportSection } from "./ExportSection";

const idleWav = { phase: "idle" as const, progress: null, cancel: () => {} };

function defaultProps() {
  return {
    exportMidi: vi.fn(),
    exportWav: vi.fn(),
    exportPdf: vi.fn(),
    wavState: idleWav,
    exportingMidi: false,
    paneReadOnly: false,
  };
}

describe("ExportSection", () => {
  it("renders three buttons when not paneReadOnly", () => {
    render(<ExportSection {...defaultProps()} />);
    expect(screen.getByRole("button", { name: /export midi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export wav/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /(print|pdf)/i })).toBeInTheDocument();
  });

  it("returns null when paneReadOnly = true", () => {
    const { container } = render(<ExportSection {...defaultProps()} paneReadOnly={true} />);
    expect(container.firstChild).toBeNull();
  });

  it("clicking Export MIDI calls exportMidi", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /export midi/i }));
    expect(props.exportMidi).toHaveBeenCalledOnce();
  });

  it("clicking Export WAV calls exportWav", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /export wav/i }));
    expect(props.exportWav).toHaveBeenCalledOnce();
  });

  it("clicking Print/PDF calls exportPdf", () => {
    const props = defaultProps();
    render(<ExportSection {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /(print|pdf)/i }));
    expect(props.exportPdf).toHaveBeenCalledOnce();
  });

  it("disables all export buttons while a MIDI export is in flight", () => {
    render(<ExportSection {...defaultProps()} exportingMidi={true} />);
    expect(screen.getByRole("button", { name: /export midi/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /export wav/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /(print|pdf)/i })).toBeDisabled();
  });
});
