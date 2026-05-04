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

describe("ExportSection — WAV progress", () => {
  it("renders progress row when wavState.phase === 'rendering'", () => {
    const cancel = vi.fn();
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "rendering", progress: { currentTime: 12000, endTime: 95000 }, cancel }}
      exportingMidi={false} paneReadOnly={false}
    />);
    // Progress text: "12s / 95s" (formatted from ms)
    expect(screen.getByText(/12s\s*\/\s*95s/i)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("renders 'Saving…' (no Cancel) when wavState.phase === 'saving'", () => {
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "saving", progress: null, cancel: () => {} }}
      exportingMidi={false} paneReadOnly={false}
    />);
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });

  it("hides the WAV button while progress row is active", () => {
    render(<ExportSection
      exportMidi={vi.fn()} exportWav={vi.fn()} exportPdf={vi.fn()}
      wavState={{ phase: "rendering", progress: { currentTime: 0, endTime: 1000 }, cancel: () => {} }}
      exportingMidi={false} paneReadOnly={false}
    />);
    expect(screen.queryByRole("button", { name: /export wav/i })).toBeNull();
  });
});
