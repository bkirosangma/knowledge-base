import { useCallback, type MutableRefObject } from "react";
import type { NodeData, LayerDef, Connection, LineCurveAlgorithm, FlowDef, DocumentMeta } from "../utils/types";
import { loadDefaults, loadDiagramFromData, serializeNodes } from "../utils/persistence";
import type { DiagramSnapshot } from "./useActionHistory";
import type { useFileExplorer } from "./useFileExplorer";

const SKIP_DISCARD_CONFIRM_KEY = "architecture-designer-skip-discard-confirm";

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
  opts?: { setSnapshot?: boolean; snapshotSource?: ReturnType<typeof loadDiagramFromData> },
) => void;

export function useFileActions(
  fileExplorer: FileExplorer,
  history: History,
  applyDiagramToState: ApplyDiagramToState,
  isRestoringRef: MutableRefObject<boolean>,
  isDirty: boolean,
  setLoadSnapshot: (title: string, layers: LayerDef[], nodes: NodeData[], connections: Connection[], layerManualSizes: Record<string, { left?: number; width?: number; top?: number; height?: number }>, lineCurve: LineCurveAlgorithm, flows: FlowDef[]) => void,
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
) {
  const handleLoadFile = useCallback(async (fileName: string) => {
    const result = await fileExplorer.selectFile(fileName);
    if (!result) return;
    const { data, diskJson, hasDraft } = result;
    const diagram = loadDiagramFromData(data);
    const snapshotSource = hasDraft ? loadDiagramFromData(JSON.parse(diskJson)) : undefined;
    applyDiagramToState(diagram, { setSnapshot: true, snapshotSource });
    // Restore document attachments from the loaded diagram
    onLoadDocuments?.(data.documents ?? []);
    isRestoringRef.current = true;
    const diskData = JSON.parse(diskJson);
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
  }, [fileExplorer.selectFile, fileExplorer.dirHandleRef, applyDiagramToState, history.initHistory]);

  const handleSave = useCallback(async () => {
    if (!fileExplorer.activeFile || !isDirty) return;
    const success = await (fileExplorer.saveFile as Function)(
      fileExplorer.activeFile, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, serializeNodes, flows, documents,
    );
    if (success) {
      setLoadSnapshot(title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows);
      const savedData = { title, layers: layerDefs, nodes: serializeNodes(nodes), connections, layerManualSizes, lineCurve, flows };
      history.onSave(JSON.stringify(savedData));
    }
  }, [fileExplorer.activeFile, fileExplorer.saveFile, isDirty, title, layerDefs, nodes, connections, layerManualSizes, lineCurve, flows, documents, setLoadSnapshot, history.onSave]);

  const handleCreateFile = useCallback(async (parentPath: string = ""): Promise<string | null> => {
    const result = await fileExplorer.createFile(parentPath);
    if (!result) return null;
    const diagram = loadDiagramFromData(result.data);
    applyDiagramToState(diagram, { setSnapshot: true });
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
    applyDiagramToState(loadDiagramFromData(result.data), { setSnapshot: true });
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
      applyDiagramToState(diagram, { setSnapshot: true });
      fileExplorer.discardFile(fileExplorer.activeFile);
      requestAnimationFrame(() => { isRestoringRef.current = false; });
      return;
    }
    const data = await fileExplorer.discardFile(fileExplorer.activeFile);
    if (!data) return;
    applyDiagramToState(loadDiagramFromData(data), { setSnapshot: true });
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
