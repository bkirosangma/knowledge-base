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
  const [wavState, setWavState] = useState<WavState>(idleWavState);

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

  const exportWav = useCallback(async () => {
    if (!args.session || args.paneReadOnly) return;
    const controller = new AbortController();
    setWavState({ phase: "rendering", progress: null, cancel: () => controller.abort() });
    try {
      const bytes = await args.session.exportAudio({
        signal: controller.signal,
        onProgress: (p) => setWavState((s) => ({ ...s, progress: p })),
      });
      setWavState({ phase: "saving", progress: null, cancel: noop });
      const base = deriveExportBaseName(args.filePath);
      const showSaveFilePicker = (window as unknown as {
        showSaveFilePicker: (opts: FsaSaveOptions) => Promise<FsaFileHandle>;
      }).showSaveFilePicker;
      const handle = await showSaveFilePicker({
        suggestedName: `${base}.wav`,
        types: [{ description: "WAV audio", accept: { "audio/wav": [".wav"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch (e) {
      if (isAbortError(e)) return;
      reportError(e, "Export WAV");
    } finally {
      setWavState(idleWavState);
    }
  }, [args.session, args.paneReadOnly, args.filePath, reportError]);

  const exportPdf = useCallback(() => {
    if (!args.session || args.paneReadOnly) return;
    try {
      args.session.exportPdf();
    } catch (e) {
      reportError(e, "Export PDF");
    }
  }, [args.session, args.paneReadOnly, reportError]);

  return { exportMidi, exportWav, exportPdf, wavState, exportingMidi };
}
