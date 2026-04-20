// src/app/knowledge_base/shared/hooks/useDocumentHistory.ts
import { useRef, useCallback } from "react";
import { useHistoryFileSync } from "./useHistoryFileSync";
import type { HistoryFileSync } from "./useHistoryFileSync";

const DEBOUNCE_MS = 5_000;

export interface DocumentHistory extends Omit<HistoryFileSync<string>, 'initHistory' | 'onFileSave'> {
  initHistory(
    fileContent: string,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ): Promise<void>;
  onContentChange(content: string): void;
  onBlockChange(content: string): void;
  onFileSave(content: string): void;
}

export function useDocumentHistory(): DocumentHistory {
  const sync = useHistoryFileSync<string>();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const initHistory = useCallback(async (
    fileContent: string,
    dirHandle: FileSystemDirectoryHandle | null,
    filePath: string | null,
  ) => {
    await sync.initHistory(fileContent, fileContent, dirHandle, filePath);
  }, [sync]);

  const onContentChange = useCallback((content: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      sync.recordAction("Draft", content);
    }, DEBOUNCE_MS);
  }, [sync]);

  const onBlockChange = useCallback((content: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sync.recordAction("Block changed", content);
  }, [sync]);

  const onFileSave = useCallback((content: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    sync.recordAction("Saved", content);
    sync.onFileSave(content);
  }, [sync]);

  return {
    ...sync,
    initHistory,
    onContentChange,
    onBlockChange,
    onFileSave,
  };
}
