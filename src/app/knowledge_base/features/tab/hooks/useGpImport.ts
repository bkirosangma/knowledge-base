"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { TabRepository } from "../../../domain/repositories";
import { gpToAlphatex } from "../../../infrastructure/gpToAlphatex";
import { useShellErrors } from "../../../shell/ShellErrorContext";

const GP_EXTENSIONS = ["gp", "gp3", "gp4", "gp5", "gp7"];
const ACCEPT_ATTR = GP_EXTENSIONS.map((e) => `.${e}`).join(",");

export interface UseGpImportOptions {
  /** Tab repository to write the converted .alphatex into. May be null
   *  before a vault is opened. */
  tab: TabRepository | null;
  /** Called with the new vault-relative path after a successful import. */
  onImported: (path: string) => void;
}

export interface UseGpImport {
  pickFile: () => void;
  importBytes: (file: File) => Promise<void>;
}

/**
 * Drives the Guitar Pro import flow: file picker → bytes → alphaTex →
 * vault write → caller-supplied onImported. Errors at any stage route
 * through `ShellErrorContext`; user cancel returns silently.
 *
 * Identity discipline:
 * - `onImported` is stashed in a ref so caller-supplied arrow functions
 *   don't churn `importBytes`'s memo deps.
 * - The returned `{ pickFile, importBytes }` is wrapped in `useMemo` so
 *   the hook is safe to depend on directly in caller `useMemo`/effect
 *   dep arrays (the palette command registration does this).
 *
 * Note on positioning: this hook is consumed in `knowledgeBase.tsx`'s
 * `KnowledgeBaseInner`, which sits ABOVE `RepositoryProvider` in the
 * React tree. We can't call `useRepositories()` here — the caller passes
 * the `TabRepository` in.
 */
export function useGpImport(opts: UseGpImportOptions): UseGpImport {
  const { tab } = opts;
  const onImportedRef = useRef(opts.onImported);
  useEffect(() => {
    onImportedRef.current = opts.onImported;
  }, [opts.onImported]);

  const { reportError } = useShellErrors();

  const importBytes = useCallback(async (file: File): Promise<void> => {
    try {
      if (!tab) throw new Error("No vault is open. Open a folder first.");
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const alphaTex = await gpToAlphatex(bytes);
      const targetPath = deriveAlphatexPath(file.name);
      await tab.write(targetPath, alphaTex);
      onImportedRef.current(targetPath);
    } catch (e) {
      reportError(e, `Importing ${file.name}`);
    }
  }, [tab, reportError]);

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

  return useMemo<UseGpImport>(
    () => ({ pickFile, importBytes }),
    [pickFile, importBytes],
  );
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
