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
        <div>
          {props.wavState.phase === "idle" ? (
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => props.exportWav()}
              className="w-full rounded border border-line bg-surface px-2 py-1 text-xs hover:bg-line/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export WAV
            </button>
          ) : (
            <WavProgressRow wavState={props.wavState} />
          )}
        </div>
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

function formatSeconds(ms: number): string {
  return `${Math.round(ms / 1000)}s`;
}

function WavProgressRow({ wavState }: { wavState: WavState }): React.ReactElement {
  if (wavState.phase === "saving") {
    return <span aria-live="polite" className="text-xs text-mute">Saving…</span>;
  }
  const cur = wavState.progress?.currentTime ?? 0;
  const end = wavState.progress?.endTime ?? 0;
  const pct = end > 0 ? Math.round((cur / end) * 100) : 0;
  return (
    <span className="flex items-center gap-2 text-xs">
      <span aria-live="polite" className="text-mute">
        Rendering audio… {formatSeconds(cur)} / {formatSeconds(end)}
      </span>
      <progress max={100} value={pct} aria-label="Export progress" />
      <button
        type="button"
        onClick={wavState.cancel}
        className="rounded border border-line bg-surface px-2 py-0.5 hover:bg-line/20"
      >
        Cancel
      </button>
    </span>
  );
}
