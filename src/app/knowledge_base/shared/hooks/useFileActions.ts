import { useCallback, useRef, type MutableRefObject } from "react";
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef, DocumentMeta } from "../utils/types";
import { loadDefaults, loadDiagramFromData, serializeNodes } from "../utils/persistence";
import type { DiagramSnapshot } from "./useDiagramHistory";
import type { useFileExplorer } from "./useFileExplorer";
import { SKIP_DISCARD_CONFIRM_KEY } from "../constants";

interface ConfirmAction {
  type: "delete-file" | "delete-folder" | "discard";
  path?: string;
  x: number;
  y: number;
}

type FileExplorer = ReturnType<typeof useFileExplorer>;

interface History {
  initHistory: (diskJson: string, snapshot: DiagramSnapshot, dirHandle: FileSystemDirectoryHandle | null, fileName: string) => Promise<void>;
  onSave: (json: string) => void;
  goToSaved: () => DiagramSnapshot | null;
}

type ApplyDiagramToState = (
  data: ReturnType<typeof loadDiagramFromData>,
  opts?: { setSnapshot?: boolean; snapshotSource?: ReturnType<typeof loadDiagramFromData>; documents?: DocumentMeta[] },
) => void;

export function useFileActions(
  fileExplorer: FileExplorer,
  history: History,
  applyDiagramToState: ApplyDiagramToState,
  isRestoringRef: MutableRefObject<boolean>,
  isDirty: boolean,
  setLoadSnapshot: (title: string, layers: LayerDef[], nodes: NodeData[], connections: Connection[], layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>, lineCurve: LineCurveAlgorithm, flows: FlowDef[], docs: DocumentMeta[]) => void,
  confirmAction: ConfirmAction | null,
  setConfirmAction: React.Dispatch<React.SetStateAction<ConfirmAction | null>>,
  canvasRef: MutableRefObject<HTMLDivElement | null>,
  // Current diagram state (needed for save)
  title: string,
  layerDefs: LayerDef[],
  nodes: NodeData[],
  connections: Connection[],
  layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>,
  lineCurve: LineCurveAlgorithm,
  flows: FlowDef[],
  documents?: DocumentMeta[],
  onLoadDocuments?: (docs: DocumentMeta[]) => void,
  onAfterSave?: () => Promise<void>,
  onAfterDiscard?: () => void,
) {
  // Keep the "current diagram state" accessible to handleLoadFile /
  // handleSave without listing every state value in their useCallback
  // deps. Without this, `handleLoadFile` recreates on every node-drag,
  // title-edit, etc., causing the `DiagramBridge` effect in DiagramView
  // (which has `handleLoadFile` in its deps) to re-publish a fresh bridge
  // object — that flows to `KnowledgeBaseInner` as `setDiagramBridge`
  // state churn, which combined with Header's inline-arrow props caused
  // a Max Update Depth loop. Keeping the refs in lock-step with props
  // preserves "latest known state" reads inside the callbacks while
  // shrinking the dep list back to stable callables.
  const currentStateRef = useRef({
    isDirty, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows, documents, onLoadDocuments,
  });
  currentStateRef.current = {
    isDirty, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows, documents, onLoadDocuments,
  };

  const callbacksRef = useRef({ onAfterSave, onAfterDiscard });
  callbacksRef.current = { onAfterSave, onAfterDiscard };

  const handleLoadFile = useCallback(async (fileName: string) => {
    // SHELL-1.2-22: flush the outgoing file's dirty state to disk before
    // swapping in the new one so the user doesn't lose unsaved edits on
    // pane click. Matches the save path in `handleSave` below; skipped
    // when there's nothing to flush (no active file, not dirty, or we're
    // re-selecting the same file).
    const outgoing = fileExplorer.activeFile;
    const s = currentStateRef.current;
    if (s.isDirty && outgoing && outgoing !== fileName) {
      await (fileExplorer.saveFile as (...args: Parameters<typeof fileExplorer.saveFile>) => Promise<boolean>)(
        outgoing, s.title, s.layerDefs, s.nodes, s.connections, s.layerManualSizes, s.lineCurve, serializeNodes, s.flows, s.documents,
      );
    }

    const result = await fileExplorer.selectFile(fileName);
    if (!result) return;
    const { data, diskJson, hasDraft } = result;
    const diskData = JSON.parse(diskJson);
    const diagram = loadDiagramFromData(data);
    const snapshotSource = hasDraft ? loadDiagramFromData(diskData) : undefined;
    // Baseline = disk version (saved state). Draft docs stay in data.documents.
    const baselineDocs: DocumentMeta[] = (hasDraft ? diskData.documents : data.documents) ?? [];
    applyDiagramToState(diagram, { setSnapshot: true, snapshotSource, documents: baselineDocs });
    // Restore document attachments from the loaded (possibly draft) diagram
    currentStateRef.current.onLoadDocuments?.(data.documents ?? []);
    isRestoringRef.current = true;
    await history.initHistory(diskJson, {
      title: diskData.title ?? "Untitled",
      layerDefs: diskData.layers,
      nodes: diskData.nodes,
      connections: diskData.connections,
      layerManualSizes: diskData.layerManualSizes ?? {},
      lineCurve: diskData.lineCurve ?? "orthogonal",
      flows: diskData.flows ?? [],
    }, fileExplorer.dirHandleRef.current, fileName);
    requestAnimationFrame(() => { isRestoringRef.current = false; });
  }, [fileExplorer.selectFile, fileExplorer.saveFile, fileExplorer.activeFile, fileExplorer.dirHandleRef, applyDiagramToState, history.initHistory, isRestoringRef]);

  const handleSave = useCallback(async () => {
    const s = currentStateRef.current;
    if (!fileExplorer.activeFile || !s.isDirty) return;
    const success = await (fileExplorer.saveFile as (...args: Parameters<typeof fileExplorer.saveFile>) => Promise<boolean>)(
      fileExplorer.activeFile, s.title, s.layerDefs, s.nodes, s.connections, s.layerManualSizes, s.lineCurve, serializeNodes, s.flows, s.documents,
    );
    if (success) {
      setLoadSnapshot(s.title, s.layerDefs, s.nodes, s.connections, s.layerManualSizes, s.lineCurve, s.flows, s.documents ?? []);
      const onDiskData = {
        title: s.title,
        layers: s.layerDefs,
        nodes: serializeNodes(s.nodes),
        connections: s.connections,
        layerManualSizes: s.layerManualSizes,
        lineCurve: s.lineCurve,
        flows: s.flows,
        ...(s.documents && s.documents.length > 0 ? { documents: s.documents } : {}),
      };
      history.onSave(JSON.stringify(onDiskData, null, 2));
      await callbacksRef.current.onAfterSave?.();
    }
  }, [fileExplorer.activeFile, fileExplorer.saveFile, setLoadSnapshot, history.onSave]);

  const handleCreateFile = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    const result = await fileExplorer.createFile(parentPath);
    if (!result) return null;
    const diagram = loadDiagramFromData(result.data);
    applyDiagramToState(diagram, { setSnapshot: true, documents: [] });
    currentStateRef.current.onLoadDocuments?.([]);
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        const el = canvasRef.current;
        el.scrollTo({
          left: (el.scrollWidth - el.clientWidth) / 2,
          top: (el.scrollHeight - el.clientHeight) / 2,
          behavior: "instant",
        });
      }
    });
    return result.path;
  }, [fileExplorer.createFile, applyDiagramToState]);

  const handleCreateFolder = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    return fileExplorer.createFolder(parentPath);
  }, [fileExplorer.createFolder]);

  const handleDeleteFile = useCallback((path: string, event: React.MouseEvent) => {
    setConfirmAction({ type: "delete-file", path, x: event.clientX, y: event.clientY });
  }, []);

  const executeDeleteFile = useCallback(async (path: string) => {
    const wasActive = fileExplorer.activeFile === path;
    await fileExplorer.deleteFile(path);
    if (wasActive) {
      const defs = loadDefaults();
      applyDiagramToState(defs);
    }
  }, [fileExplorer.activeFile, fileExplorer.deleteFile, applyDiagramToState]);

  const handleDeleteFolder = useCallback((path: string, event: React.MouseEvent) => {
    setConfirmAction({ type: "delete-folder", path, x: event.clientX, y: event.clientY });
  }, []);

  const handleRenameFile = useCallback(async (oldPath: string, newName: string) => {
    await fileExplorer.renameFile(oldPath, newName);
  }, [fileExplorer.renameFile]);

  const handleRenameFolder = useCallback(async (oldPath: string, newName: string) => {
    await fileExplorer.renameFolder(oldPath, newName);
  }, [fileExplorer.renameFolder]);

  const handleDuplicateFile = useCallback(async (path: string) => {
    const result = await fileExplorer.duplicateFile(path);
    if (!result) return;
    const docs = result.data.documents ?? [];
    applyDiagramToState(loadDiagramFromData(result.data), { setSnapshot: true, documents: docs });
    currentStateRef.current.onLoadDocuments?.(docs);
  }, [fileExplorer.duplicateFile, applyDiagramToState]);

  const handleMoveItem = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    await fileExplorer.moveItem(sourcePath, targetFolderPath);
  }, [fileExplorer.moveItem]);

  const executeDiscard = useCallback(async () => {
    if (!fileExplorer.activeFile) return;
    const savedSnapshot = history.goToSaved();
    if (savedSnapshot) {
      isRestoringRef.current = true;
      const diagram = loadDiagramFromData({
        title: savedSnapshot.title,
        layers: savedSnapshot.layerDefs,
        nodes: savedSnapshot.nodes,
        connections: savedSnapshot.connections,
        layerManualSizes: savedSnapshot.layerManualSizes,
        lineCurve: savedSnapshot.lineCurve,
        flows: savedSnapshot.flows,
      });
      const savedDocs = savedSnapshot.documents ?? [];
      applyDiagramToState(diagram, { setSnapshot: true, documents: savedDocs });
      currentStateRef.current.onLoadDocuments?.(savedDocs);
      fileExplorer.discardFile(fileExplorer.activeFile);
      callbacksRef.current.onAfterDiscard?.();
      requestAnimationFrame(() => { isRestoringRef.current = false; });
      return;
    }
    const data = await fileExplorer.discardFile(fileExplorer.activeFile);
    if (!data) return;
    const diskDocs = data.documents ?? [];
    currentStateRef.current.onLoadDocuments?.(diskDocs);
    applyDiagramToState(loadDiagramFromData(data), { setSnapshot: true, documents: diskDocs });
    callbacksRef.current.onAfterDiscard?.();
  }, [fileExplorer.activeFile, fileExplorer.discardFile, applyDiagramToState, history.goToSaved]);

  const handleDiscard = useCallback((event: React.MouseEvent) => {
    if (!fileExplorer.activeFile || !isDirty) return;
    if (typeof window !== "undefined" && localStorage.getItem(SKIP_DISCARD_CONFIRM_KEY) === "true") {
      executeDiscard();
      return;
    }
    setConfirmAction({ type: "discard", x: event.clientX, y: event.clientY });
  }, [fileExplorer.activeFile, isDirty, executeDiscard]);

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return;
    if (confirmAction.type === "delete-file" && confirmAction.path) {
      await executeDeleteFile(confirmAction.path);
    } else if (confirmAction.type === "delete-folder" && confirmAction.path) {
      await fileExplorer.deleteFolder(confirmAction.path);
    } else if (confirmAction.type === "discard") {
      await executeDiscard();
    }
    setConfirmAction(null);
  }, [confirmAction, executeDeleteFile, fileExplorer.deleteFolder, executeDiscard]);

  return {
    handleLoadFile, handleSave, handleCreateFile, handleCreateFolder,
    handleDeleteFile, handleDeleteFolder, handleRenameFile, handleRenameFolder,
    handleDuplicateFile, handleMoveItem, handleDiscard, handleConfirmAction,
  };
}
