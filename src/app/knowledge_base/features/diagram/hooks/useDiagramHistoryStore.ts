"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDiagramHistory, type DiagramSnapshot } from "../../../shared/hooks/useDiagramHistory";
import { loadDiagramFromData, serializeNodes } from "../../../shared/utils/persistence";
import { replaceSubset } from "../../../domain/attachmentLinks";
import { collectDiagramEntityIds } from "../utils/diagramEntityIds";
import type { AttachmentLink } from "../../../domain/attachmentLinks";
import type { CanvasPatch } from "../components/Canvas";
import type { DocumentMeta } from "../../document/types";
import type { DiagramDoc, DiagramDocDispatch, LayerManualSize } from "./useDiagramDocument";
import type { Selection } from "../types";

const DEFAULT_PATCHES: CanvasPatch[] = [{ id: "main", col: 0, row: 0, widthUnits: 1, heightUnits: 1 }];

/**
 * Entity types whose lifecycle is bound to a single diagram. Tab-scoped
 * types (`tab`, `tab-section`, `tab-track`) are intentionally excluded so
 * diagram-undo never clobbers workspace rows.
 */
const DIAGRAM_ENTITY_TYPES = new Set<string>(["root", "node", "connection", "flow", "type"]);

interface ApplyOpts {
  setSnapshot?: boolean;
  snapshotSource?: ReturnType<typeof loadDiagramFromData>;
  documents?: DocumentMeta[];
}

interface UseDiagramHistoryStoreInput {
  doc: DiagramDoc;
  dispatch: DiagramDocDispatch;
  layerManualSizes: Record<string, LayerManualSize>;
  setLayerManualSizes: (sizes: Record<string, LayerManualSize>) => void;
  setMeasuredSizes: (sizes: Record<string, { w: number; h: number }>) => void;
  setPatches: (patches: CanvasPatch[]) => void;
  setSelection: (s: Selection | null) => void;
  documents: DocumentMeta[];
  onLoadDocuments: (docs: DocumentMeta[]) => void;
  rows: AttachmentLink[];
  setRows: (next: AttachmentLink[] | ((prev: AttachmentLink[]) => AttachmentLink[])) => void;
  setLoadSnapshot: (
    title: string,
    layers: DiagramDoc["layers"],
    nodes: DiagramDoc["nodes"],
    connections: DiagramDoc["connections"],
    layerManualSizes: Record<string, LayerManualSize>,
    lineCurve: DiagramDoc["lineCurve"],
    flows: DiagramDoc["flows"],
    documents: DocumentMeta[],
  ) => void;
}

/**
 * Bundles every history-related orchestration into one hook.
 *
 * Responsibilities:
 *  - Owns the `useDiagramHistory()` instance.
 *  - Provides `scheduleRecord(desc)` — queues a single history entry to
 *    be flushed on the *next* render after state has settled. Identical
 *    semantics to the inline implementation pre-KB-020.
 *  - `applyDiagramToState` — resets the document, selection, measured
 *    sizes, and patches when a diagram is loaded or restored.
 *  - `applySnapshot` / `applySnapshotFromDisk` — wrap apply with
 *    isRestoringRef toggling so the post-render effect doesn't record
 *    the restore itself.
 *  - `handleUndo` / `handleRedo` / `handleGoToEntry` — bind to history
 *    actions and route through applySnapshot.
 *
 * The post-render flush effect intentionally has no dependency array;
 * the inline version pre-KB-020 was the same — it runs on every render
 * and only does work if pendingRecord.current is non-null.
 */
export function useDiagramHistoryStore(input: UseDiagramHistoryStoreInput) {
  const {
    doc,
    dispatch,
    layerManualSizes,
    setLayerManualSizes,
    setMeasuredSizes,
    setPatches,
    setSelection,
    documents,
    onLoadDocuments,
    rows,
    setRows,
    setLoadSnapshot,
  } = input;

  const history = useDiagramHistory();
  const pendingRecord = useRef<string | null>(null);
  const isRestoringRef = useRef(false);

  const scheduleRecord = useCallback((description: string) => {
    if (isRestoringRef.current) return;
    pendingRecord.current = description;
  }, []);

  // Fire pending record after render so all state is settled. Matches
  // the dependency-less effect from the original DiagramView.
  useEffect(() => {
    if (pendingRecord.current && !isRestoringRef.current) {
      const desc = pendingRecord.current;
      pendingRecord.current = null;
      // Capture only the rows whose entityId belongs to this diagram.
      // Tab-scoped rows (tab, tab-section, tab-track) are excluded via
      // DIAGRAM_ENTITY_TYPES so diagram-undo never clobbers workspace rows.
      const diagramIds = collectDiagramEntityIds(doc as unknown as Parameters<typeof collectDiagramEntityIds>[0]);
      const attachmentSubset = rows.filter(
        (r) => DIAGRAM_ENTITY_TYPES.has(r.entityType) && diagramIds.has(r.entityId),
      );
      history.recordAction(desc, {
        title: doc.title,
        layerDefs: doc.layers,
        nodes: serializeNodes(doc.nodes),
        connections: doc.connections,
        layerManualSizes,
        lineCurve: doc.lineCurve,
        flows: doc.flows,
        attachmentSubset,
      });
    }
  });

  const applyDiagramToState = useCallback(
    (data: ReturnType<typeof loadDiagramFromData>, opts?: ApplyOpts) => {
      dispatch.loadDoc(data);
      setLayerManualSizes(data.layerManualSizes);
      setSelection(null);
      setMeasuredSizes({});
      setPatches(DEFAULT_PATCHES);
      if (opts?.setSnapshot) {
        const src = opts.snapshotSource ?? data;
        setLoadSnapshot(
          src.title,
          src.layers,
          src.nodes,
          src.connections,
          src.layerManualSizes,
          src.lineCurve,
          src.flows,
          opts.documents ?? [],
        );
      }
    },
    [dispatch, setLayerManualSizes, setMeasuredSizes, setPatches, setSelection, setLoadSnapshot],
  );

  const applySnapshot = useCallback(
    (snapshot: DiagramSnapshot | null) => {
      if (!snapshot) return;
      isRestoringRef.current = true;
      const diagram = loadDiagramFromData({
        title: snapshot.title,
        layers: snapshot.layerDefs,
        nodes: snapshot.nodes,
        connections: snapshot.connections,
        layerManualSizes: snapshot.layerManualSizes,
        lineCurve: snapshot.lineCurve,
        flows: snapshot.flows,
      });
      applyDiagramToState(diagram);
      if (snapshot.attachmentSubset !== undefined) {
        // Restore only this diagram's attachment subset. Build the id set
        // from the snapshot's structural data (not live React state which
        // may have changed by the time this callback runs).
        const diagramIds = collectDiagramEntityIds(snapshot as unknown as Parameters<typeof collectDiagramEntityIds>[0]);
        setRows((prev) => replaceSubset(prev, DIAGRAM_ENTITY_TYPES, diagramIds, snapshot.attachmentSubset!));
      } else if (snapshot.documents !== undefined) {
        // Backward-compat: old snapshots may only have the legacy `documents` field.
        onLoadDocuments(snapshot.documents);
      }
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    },
    [applyDiagramToState, onLoadDocuments, setRows],
  );

  const applySnapshotFromDisk = useCallback(
    (snapshot: DiagramSnapshot) => {
      isRestoringRef.current = true;
      const diagram = loadDiagramFromData({
        title: snapshot.title,
        layers: snapshot.layerDefs,
        nodes: snapshot.nodes,
        connections: snapshot.connections,
        layerManualSizes: snapshot.layerManualSizes,
        lineCurve: snapshot.lineCurve,
        flows: snapshot.flows,
      });
      applyDiagramToState(diagram, { setSnapshot: true });
      if (snapshot.attachmentSubset !== undefined) {
        const diagramIds = collectDiagramEntityIds(snapshot as unknown as Parameters<typeof collectDiagramEntityIds>[0]);
        setRows((prev) => replaceSubset(prev, DIAGRAM_ENTITY_TYPES, diagramIds, snapshot.attachmentSubset!));
      } else if (snapshot.documents !== undefined) {
        onLoadDocuments(snapshot.documents);
      }
      requestAnimationFrame(() => {
        isRestoringRef.current = false;
      });
    },
    [applyDiagramToState, onLoadDocuments, setRows],
  );

  const handleUndo = useCallback(() => {
    applySnapshot(history.undo());
  }, [history, applySnapshot]);

  const handleRedo = useCallback(() => {
    applySnapshot(history.redo());
  }, [history, applySnapshot]);

  const handleGoToEntry = useCallback(
    (index: number) => {
      applySnapshot(history.goToEntry(index));
    },
    [history, applySnapshot],
  );

  return {
    history,
    scheduleRecord,
    isRestoringRef,
    applyDiagramToState,
    applySnapshot,
    applySnapshotFromDisk,
    handleUndo,
    handleRedo,
    handleGoToEntry,
  };
}
