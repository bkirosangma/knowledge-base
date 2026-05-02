"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSystemError, classifyError } from "../../../domain/errors";
import { useRepositories } from "../../../shell/RepositoryContext";

export interface UseTabContent {
  content: string | null;
  loadError: FileSystemError | null;
  refresh: () => Promise<void>;
}

/**
 * Reads the `.alphatex` file via `useRepositories().tab` and exposes the
 * raw text + any load error. TAB-008 will extend this with dirty / draft
 * state when the editor lands; for the viewer-only slice, read-only is
 * sufficient.
 */
export function useTabContent(path: string | null): UseTabContent {
  const { tab } = useRepositories();
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<FileSystemError | null>(null);

  const load = useCallback(async (p: string | null) => {
    if (!p || !tab) {
      setContent(null);
      setLoadError(null);
      return;
    }
    try {
      const text = await tab.read(p);
      setContent(text);
      setLoadError(null);
    } catch (e) {
      setContent(null);
      setLoadError(e instanceof FileSystemError ? e : classifyError(e));
    }
  }, [tab]);

  useEffect(() => { void load(path); }, [load, path]);

  const refresh = useCallback(() => load(path), [load, path]);

  return { content, loadError, refresh };
}
