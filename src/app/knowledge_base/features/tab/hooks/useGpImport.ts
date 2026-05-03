"use client";

import { useCallback } from "react";
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";
import { useRepositories } from "../../../shell/RepositoryContext";
import { useShellErrors } from "../../../shell/ShellErrorContext";

const GP_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gp7"];
const ACCEPT_ATTR = GP_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface UseGpImportOptions {
  /** Called with the new vault-relative path after a successful import.
   *  Caller is responsible for opening the file in a pane. */
  onImported: (path: string) => void;
}

export interface UseGpImport {
  /** Open a file picker, then convert + write + notify on the chosen file. */
  pickFile: () => void;
  /** Internal entry point — exposed for unit tests + the file-picker callback. */
  importBytes: (file: File) => Promise<void>;
}

/**
 * Drives the Guitar Pro import flow: file picker → bytes → alphaTex →
 * vault write → caller-supplied onImported. Errors at any stage route
 * through `ShellErrorContext` (same path docs/diagrams use); user cancel
 * returns silently.
 */
export function useGpImport(opts: UseGpImportOptions): UseGpImport {
  const { tab } = useRepositories();
  const { reportError } = useShellErrors();

  const importBytes = useCallback(async (file: File): Promise<void> => {
    try {
      if (!tab) throw new Error("No vault is open. Open a folder first.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const alphaTex = await gpToAlphatex(bytes);
      const targetPath = deriveAlphatexPath(file.name);
      await tab.write(targetPath, alphaTex);
      opts.onImported(targetPath);
    } catch (e) {
      reportError(e, `Importing ${file.name}`);
    }
  }, [tab, reportError, opts]);

  const pickFile = useCallback(() => {
    if (typeof document === "undefined") return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT_ATTR;
    input.style.display = "none";
    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };
    input.addEventListener("cancel", cleanup, { once: true });
    input.addEventListener("change", () => {
      cleanup();
      const file = input.files?.[0];
      if (!file) return;
      void importBytes(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  }, [importBytes]);

  return { pickFile, importBytes };
}

/**
 * `song.gp7` → `song.alphatex`. Multi-dot names (e.g. `my.song.gp`) keep
 * everything before the FINAL `.gpN` segment.
 */
function deriveAlphatexPath(filename: string): string {
  const lower = filename.toLowerCase();
  for (const ext of GP_EXTENSIONS) {
    if (lower.endsWith(`.${ext}`)) {
      return filename.slice(0, filename.length - ext.length - 1) + ".alphatex";
    }
  }
  // Defensive: filename had an unexpected extension (the picker's accept
  // attribute should have prevented this). Fall through to a generic
  // ".alphatex" tail without losing the original basename.
  return filename + ".alphatex";
}
