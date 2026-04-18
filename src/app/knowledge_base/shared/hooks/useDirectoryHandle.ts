"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveDirHandle, loadDirHandle, clearDirHandle } from "../utils/idbHandles";
import { setDirectoryScope, clearDirectoryScope } from "../utils/directoryScope";

const DIR_NAME_KEY = "knowledge-base-directory-name";

function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export interface AcquiredHandle {
  handle: FileSystemDirectoryHandle;
  scopeId: string;
}

/**
 * Directory-handle lifecycle: picker acquisition, IndexedDB persistence of
 * the handle + scope id, directory-name display state, and the `<input
 * webkitdirectory>` fallback ref for browsers without File System Access.
 *
 * The hook returns low-level primitives; `useFileExplorer` composes them
 * with `scanTree` and the draft / active-file state it owns.
 */
export function useDirectoryHandle(): {
  directoryName: string | null;
  setDirectoryName: (name: string | null) => void;
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  supported: boolean;
  /** Show the native picker; persist handle + scope; return them, or null on cancel. */
  acquirePickerHandle: () => Promise<AcquiredHandle | null>;
  /** Look up a previously-persisted handle, re-request permission, and return it. */
  restoreSavedHandle: () => Promise<AcquiredHandle | null>;
  /** Clear the persisted handle + scope + directory-name localStorage entry. */
  clearSavedHandle: () => Promise<void>;
} {
  const [directoryName, setDirectoryNameState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(DIR_NAME_KEY);
  });
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setDirectoryName = useCallback((name: string | null) => {
    setDirectoryNameState(name);
    if (name) localStorage.setItem(DIR_NAME_KEY, name);
    else localStorage.removeItem(DIR_NAME_KEY);
  }, []);

  const acquirePickerHandle = useCallback(async (): Promise<AcquiredHandle | null> => {
    if (!isSupported()) return null;
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      const scopeId = crypto.randomUUID().slice(0, 8);
      setDirectoryScope(scopeId);
      dirHandleRef.current = handle;
      setDirectoryName(handle.name);
      await saveDirHandle(handle, scopeId);
      return { handle, scopeId };
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      return null;
    }
  }, [setDirectoryName]);

  const restoreSavedHandle = useCallback(async (): Promise<AcquiredHandle | null> => {
    if (!isSupported()) return null;
    const stored = await loadDirHandle();
    if (!stored) return null;
    const { handle, scopeId } = stored;
    try {
      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return null;

      dirHandleRef.current = handle;
      setDirectoryScope(scopeId);
      setDirectoryName(handle.name);
      return { handle, scopeId };
    } catch {
      return null;
    }
  }, [setDirectoryName]);

  const clearSavedHandle = useCallback(async () => {
    await clearDirHandle();
    clearDirectoryScope();
    dirHandleRef.current = null;
    setDirectoryName(null);
  }, [setDirectoryName]);

  // Re-sync state if localStorage is cleared externally (e.g. user dev-tools).
  // Runs once on mount; all subsequent changes go through setDirectoryName.
  useEffect(() => {
    const stored = localStorage.getItem(DIR_NAME_KEY);
    if (stored !== directoryName) setDirectoryNameState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    directoryName,
    setDirectoryName,
    dirHandleRef,
    inputRef,
    supported: isSupported(),
    acquirePickerHandle,
    restoreSavedHandle,
    clearSavedHandle,
  };
}
