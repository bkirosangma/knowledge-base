"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiagramBridge, ConfirmAction } from "../types";

interface UseDiagramBridgeInput {
  isDirty: boolean;
  title: string;
  setTitle: (v: string) => void;
  scheduleRecord: (description: string) => void;

  handleSave: () => void;
  handleDiscard: (e: React.MouseEvent) => void;

  handleLoadFile: (fileName: string) => Promise<void>;
  handleCreateFile: (parentPath?: string) => Promise<string | null>;
  handleCreateFolder: (parentPath?: string) => Promise<string | null>;
  handleDeleteFile: (path: string, event: React.MouseEvent) => void;
  handleDeleteFolder: (path: string, event: React.MouseEvent) => void;
  handleRenameFile: (oldPath: string, newName: string) => Promise<void>;
  handleRenameFolder: (oldPath: string, newName: string) => Promise<void>;
  handleDuplicateFile: (path: string) => Promise<void>;
  handleMoveItem: (sourcePath: string, targetFolderPath: string) => Promise<void>;
  handleConfirmAction: () => Promise<void>;

  confirmAction: ConfirmAction | null;
  setConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>;

  onDiagramBridge: (bridge: DiagramBridge) => void;
}

/**
 * Owns the title-input mirror state, the title-width state, and the
 * `onDiagramBridge` effect that re-publishes the full bridge object
 * whenever any input changes. The dependency list mirrors DiagramView's
 * pre-KB-020 effect exactly so the shell's bridge doesn't observe extra
 * spurious updates.
 */
export function useDiagramBridge(input: UseDiagramBridgeInput) {
  const {
    isDirty,
    title,
    setTitle,
    scheduleRecord,
    handleSave,
    handleDiscard,
    handleLoadFile,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFile,
    handleDeleteFolder,
    handleRenameFile,
    handleRenameFolder,
    handleDuplicateFile,
    handleMoveItem,
    handleConfirmAction,
    confirmAction,
    setConfirmAction,
    onDiagramBridge,
  } = input;

  const [titleInputValue, setTitleInputValue] = useState(title);
  const [titleWidth, setTitleWidth] = useState<number | string>("auto");

  // Sync titleInputValue when the underlying title changes (file load, undo).
  useEffect(() => {
    setTitleInputValue(title);
  }, [title]);

  const onTitleCommit = useCallback(
    (v: string) => {
      setTitle(v);
      scheduleRecord("Edit title");
    },
    [setTitle, scheduleRecord],
  );

  useEffect(() => {
    const bridge: DiagramBridge = {
      isDirty,
      title,
      titleInputValue,
      setTitleInputValue,
      titleWidth,
      setTitleWidth,
      onTitleCommit,
      onSave: handleSave,
      onDiscard: handleDiscard,
      handleLoadFile,
      handleCreateFile,
      handleCreateFolder,
      handleDeleteFile,
      handleDeleteFolder,
      handleRenameFile,
      handleRenameFolder,
      handleDuplicateFile,
      handleMoveItem,
      handleConfirmAction,
      confirmAction,
      setConfirmAction,
    };
    onDiagramBridge(bridge);
  }, [
    isDirty,
    title,
    titleInputValue,
    titleWidth,
    handleSave,
    handleDiscard,
    handleLoadFile,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFile,
    handleDeleteFolder,
    handleRenameFile,
    handleRenameFolder,
    handleDuplicateFile,
    handleMoveItem,
    handleConfirmAction,
    confirmAction,
    setConfirmAction,
    onDiagramBridge,
    onTitleCommit,
  ]);

  return { titleInputValue, setTitleInputValue, titleWidth, setTitleWidth, onTitleCommit };
}
