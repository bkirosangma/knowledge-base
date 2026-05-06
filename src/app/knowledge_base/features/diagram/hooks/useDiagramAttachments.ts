"use client";

import { useCallback, useRef } from "react";
import type { DocumentMeta } from "../../document/types";
import type { PreviewItemType } from "../components/AttachmentPreviewModal";

interface UseDiagramAttachmentsInput {
  documents: DocumentMeta[];
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
  // MVP-2b: `type` widens this signature so the type-aware modal can
  // forward its active tab. The body still ignores it for non-doc
  // (those tabs disable Confirm) — future MVP will branch on type.
  onCreateAndAttach: (flowId: string, filename: string, editNow: boolean, type: PreviewItemType) => Promise<void>;
  deleteDocumentWithCleanup: (path: string) => Promise<void>;
  scheduleRecord: (description: string) => void;
}

/**
 * Wraps the doc-attachment callbacks with `scheduleRecord`, and owns
 * the deferred-delete queue. The queue exists because detaching a doc
 * from a flow is recorded as in-memory state until the diagram is
 * saved; only then do we actually delete the orphaned file. If the
 * user undoes the detach (or re-attaches) before save, the delete
 * is dropped.
 */
export function useDiagramAttachments(input: UseDiagramAttachmentsInput) {
  const {
    documents,
    onAttachDocument,
    onDetachDocument,
    onCreateAndAttach,
    deleteDocumentWithCleanup,
    scheduleRecord,
  } = input;

  const handleAttachDocument = useCallback(
    (docPath: string, entityType: string, entityId: string) => {
      onAttachDocument(docPath, entityType, entityId);
      scheduleRecord(`Attach document to ${entityType}`);
    },
    [onAttachDocument, scheduleRecord],
  );

  const handleDetachDocument = useCallback(
    (docPath: string, entityType: string, entityId: string) => {
      onDetachDocument(docPath, entityType, entityId);
      scheduleRecord(`Detach document from ${entityType}`);
    },
    [onDetachDocument, scheduleRecord],
  );

  const handleCreateAndAttach = useCallback(
    async (flowId: string, filename: string, editNow: boolean, type: PreviewItemType) => {
      // MVP-2b: ignored for non-doc; future MVP will branch on type.
      await onCreateAndAttach(flowId, filename, editNow, type);
      scheduleRecord("Create and attach document to flow");
    },
    [onCreateAndAttach, scheduleRecord],
  );

  // ─── Deferred-delete queue ───────────────────────────────────────
  const pendingDeletesRef = useRef<string[]>([]);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;

  const handleDeleteDocumentWithCleanup = useCallback(async (path: string) => {
    if (!pendingDeletesRef.current.includes(path)) {
      pendingDeletesRef.current = [...pendingDeletesRef.current, path];
    }
  }, []);

  const flushPendingDeletes = useCallback(async () => {
    const paths = pendingDeletesRef.current.slice();
    pendingDeletesRef.current = [];
    for (const path of paths) {
      const doc = documentsRef.current.find((d) => d.filename === path);
      if (doc && (doc.attachedTo?.length ?? 0) > 0) continue;
      await deleteDocumentWithCleanup(path);
    }
  }, [deleteDocumentWithCleanup]);

  const clearPendingDeletes = useCallback(() => {
    pendingDeletesRef.current = [];
  }, []);

  return {
    handleAttachDocument,
    handleDetachDocument,
    handleCreateAndAttach,
    handleDeleteDocumentWithCleanup,
    flushPendingDeletes,
    clearPendingDeletes,
  };
}
