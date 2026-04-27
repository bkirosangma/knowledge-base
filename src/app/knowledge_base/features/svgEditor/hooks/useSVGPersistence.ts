"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  resolveParentHandle,
  readTextFile,
  writeTextFile,
} from "../../../shared/hooks/fileExplorerHelpers";
import type { SVGCanvasHandle } from "../components/SVGCanvas";

async function readSVGFile(
  root: FileSystemDirectoryHandle,
  filePath: string,
): Promise<string> {
  const parts = filePath.split("/");
  const name = parts.pop()!;
  const parentPath = parts.join("/");
  const parent = await resolveParentHandle(root, parentPath);
  const fh = await parent.getFileHandle(name);
  return readTextFile(fh);
}

export function useSVGPersistence(
  activeFile: string | null,
  dirHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>,
  canvasRef: React.RefObject<SVGCanvasHandle | null>,
) {
  const [isDirty, setIsDirty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!activeFile || !dirHandleRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const content = await readSVGFile(dirHandleRef.current!, activeFile);
        if (cancelled) return;
        canvasRef.current?.setSvgString(content);
        setIsDirty(false);
      } catch {
        // file unreadable — leave canvas as-is
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFile]);

  const onChanged = useCallback(() => {
    setIsDirty(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!activeFile || !canvasRef.current || !dirHandleRef.current) return;
      const svg = canvasRef.current.getSvgString();
      await writeTextFile(dirHandleRef.current, activeFile, svg).catch(() => {});
    }, 1500);
  }, [activeFile, canvasRef, dirHandleRef]);

  const handleSave = useCallback(async () => {
    if (!activeFile || !canvasRef.current || !dirHandleRef.current) return;
    const svg = canvasRef.current.getSvgString();
    try {
      await writeTextFile(dirHandleRef.current, activeFile, svg);
      setIsDirty(false);
    } catch {
      // write failed — leave isDirty=true so user knows the save didn't stick
    }
  }, [activeFile, canvasRef, dirHandleRef]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleDiscard = useCallback(async () => {
    if (!activeFile || !dirHandleRef.current) return;
    try {
      const content = await readSVGFile(dirHandleRef.current, activeFile);
      canvasRef.current?.setSvgString(content);
      setIsDirty(false);
    } catch {
      // ignore
    }
  }, [activeFile, canvasRef, dirHandleRef]);

  return { isDirty, onChanged, handleSave, handleDiscard };
}
