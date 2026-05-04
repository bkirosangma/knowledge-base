import { useCallback, useState } from "react";
import { useShellErrors } from "../../../shell/ShellErrorContext";
import { deriveExportBaseName } from "./deriveExportBaseName";
import type { TabSession } from "../../../domain/tabEngine";

export interface UseTabExportArgs {
  session: Pick<TabSession, "exportMidi" | "exportAudio" | "exportPdf"> | null;
  filePath: string | null;
  paneReadOnly: boolean;
}

export type WavPhase = "idle" | "rendering" | "saving";

export interface WavState {
  phase: WavPhase;
  progress: { currentTime: number; endTime: number } | null;
  cancel: () => void;
}

const noop = () => {};
const idleWavState: WavState = { phase: "idle", progress: null, cancel: noop };

function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

interface FsaSaveOptions {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}
interface FsaWritable {
  write(data: Uint8Array): Promise<void>;
  close(): Promise<void>;
}
interface FsaFileHandle {
  createWritable(): Promise<FsaWritable>;
}

export function useTabExport(args: UseTabExportArgs) {
  const { reportError } = useShellErrors();
  const [exportingMidi, setExportingMidi] = useState(false);
  const [wavState] = useState<WavState>(idleWavState); // T8 will make this stateful

  const exportMidi = useCallback(async () => {
    if (!args.session || args.paneReadOnly) return;
    setExportingMidi(true);
    try {
      const bytes = args.session.exportMidi();
      const base = deriveExportBaseName(args.filePath);
      const showSaveFilePicker = (window as unknown as {
        showSaveFilePicker: (opts: FsaSaveOptions) => Promise<FsaFileHandle>;
      }).showSaveFilePicker;
      const handle = await showSaveFilePicker({
        suggestedName: `${base}.mid`,
        types: [{ description: "MIDI", accept: { "audio/midi": [".mid", ".midi"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (e) {
      if (isAbortError(e)) return;
      reportError(e, "Export MIDI");
    } finally {
      setExportingMidi(false);
    }
  }, [args.session, args.paneReadOnly, args.filePath, reportError]);

  // T8 + T9 will replace these stubs.
  const exportWav = useCallback(async () => { /* T8 */ }, []);
  const exportPdf = useCallback(() => { /* T9 */ }, []);

  return { exportMidi, exportWav, exportPdf, wavState, exportingMidi };
}
