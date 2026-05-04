// src/app/knowledge_base/hooks/useDocuments.ts
"use client";

import { useState, useCallback, useMemo } from "react";
import type { DocumentMeta } from "../types";
import {
  addRow,
  removeRow,
  removeMatchingRows,
  migrateRows,
  type AttachmentLink,
} from "../../../domain/attachmentLinks";
import { createDocumentRepository } from "../../../infrastructure/documentRepo";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";

export function useDocuments() {
  const [rows, setRows] = useState<AttachmentLink[]>([]);

  // ─── Tree helpers — unchanged behaviour ──────────────────────────
  const collectDocPaths = useCallback((tree: TreeNode[]): string[] => {
    const paths: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const node of nodes) {
        if (node.type === "file" && node.fileType === "document") {
          paths.push(node.path);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(tree);
    return paths;
  }, []);

  const existingDocPaths = useCallback(
    (tree: TreeNode[]): Set<string> => new Set(collectDocPaths(tree)),
    [collectDocPaths],
  );

  // ─── Mutators (in-memory only this task — persistence in T9) ─────
  const attachDocument = useCallback(
    (
      docPath: string,
      entityType: AttachmentLink["entityType"],
      entityId: string,
    ) => {
      setRows((prev) => addRow(prev, { docPath, entityType, entityId }));
    },
    [],
  );

  const detachDocument = useCallback(
    (docPath: string, entityType: string, entityId: string) => {
      setRows((prev) =>
        removeRow(prev, {
          docPath,
          entityType: entityType as AttachmentLink["entityType"],
          entityId,
        }),
      );
    },
    [],
  );

  const removeDocument = useCallback((docPath: string) => {
    setRows((prev) => removeMatchingRows(prev, (r) => r.docPath === docPath).rows);
  }, []);

  /**
   * Bulk rewrite `tab-section` / `tab-track` attachment ids when sections are
   * renamed. Idempotent. No-op when migrations is empty.
   */
  const migrateAttachments = useCallback(
    (filePath: string, migrations: { from: string; to: string }[]) => {
      if (migrations.length === 0) return;
      const map = new Map<string, string>();
      for (const m of migrations) {
        map.set(`${filePath}#${m.from}`, `${filePath}#${m.to}`);
      }
      setRows((prev) => migrateRows(prev, map));
    },
    [],
  );

  // ─── Memoised DocumentMeta projection (back-compat) ──────────────
  const documents = useMemo<DocumentMeta[]>(() => {
    const byDoc = new Map<string, DocumentMeta>();
    for (const r of rows) {
      let entry = byDoc.get(r.docPath);
      if (!entry) {
        const title = r.docPath.split("/").pop()?.replace(/\.md$/, "") ?? r.docPath;
        entry = {
          id: `doc-${r.docPath}`,
          filename: r.docPath,
          title,
          attachedTo: [],
        };
        byDoc.set(r.docPath, entry);
      }
      entry.attachedTo!.push({ type: r.entityType, id: r.entityId });
    }
    return Array.from(byDoc.values());
  }, [rows]);

  // ─── Selectors ───────────────────────────────────────────────────
  const getDocumentsForEntity = useCallback(
    (entityType: string, entityId: string): DocumentMeta[] =>
      documents.filter((d) =>
        d.attachedTo?.some((a) => a.type === entityType && a.id === entityId),
      ),
    [documents],
  );

  const hasDocuments = useCallback(
    (entityType: string, entityId: string): boolean =>
      rows.some((r) => r.entityType === entityType && r.entityId === entityId),
    [rows],
  );

  // ─── Disk creation (unchanged) ───────────────────────────────────
  const createDocument = useCallback(
    async (
      rootHandle: FileSystemDirectoryHandle,
      path: string,
      initialContent = "",
    ) => {
      const repo = createDocumentRepository(rootHandle);
      await repo.write(path, initialContent);
      return path;
    },
    [],
  );

  return {
    rows,
    setRows,
    documents,
    setDocuments: (next: DocumentMeta[]) => {
      // Back-compat shim — used by old onLoadDocuments call sites until T12.
      const flat: AttachmentLink[] = next.flatMap((d) =>
        (d.attachedTo ?? []).map((a) => ({
          docPath: d.filename,
          entityType: a.type as AttachmentLink["entityType"],
          entityId: a.id,
        })),
      );
      setRows(flat);
    },
    createDocument,
    attachDocument,
    detachDocument,
    removeDocument,
    migrateAttachments,
    getDocumentsForEntity,
    hasDocuments,
    collectDocPaths,
    existingDocPaths,
  };
}
