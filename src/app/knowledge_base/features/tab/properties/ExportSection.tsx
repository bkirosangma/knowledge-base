import React from "react";
import type { WavState } from "../hooks/useTabExport";

export interface ExportSectionProps {
  exportMidi: () => Promise<void> | void;
  exportWav: () => Promise<void> | void;
  exportPdf: () => void;
  wavState: WavState;
  exportingMidi: boolean;
  paneReadOnly: boolean;
}

export function ExportSection(props: ExportSectionProps): React.ReactElement | null {
  if (props.paneReadOnly) return null;

  const wavBusy = props.wavState.phase !== "idle";
  const anyBusy = props.exportingMidi || wavBusy;

  return (
    <section aria-label="Export">
      <h3 className="mb-1 text-xs font-medium uppercase text-mute">Export</h3>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => props.exportMidi()}
          className="rounded border border-line bg-surface px-2 py-1 text-xs hover:bg-line/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export MIDI
        </button>
        {/* T11 will replace this row when wavState is non-idle */}
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => props.exportWav()}
          className="rounded border border-line bg-surface px-2 py-1 text-xs hover:bg-line/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Export WAV
        </button>
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => props.exportPdf()}
          className="rounded border border-line bg-surface px-2 py-1 text-xs hover:bg-line/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Print or Save as PDF
        </button>
      </div>
    </section>
  );
}
