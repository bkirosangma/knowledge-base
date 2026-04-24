// src/app/knowledge_base/hooks/useDocuments.ts
"use client";

import { useState, useCallback } from "react";
import type { DocumentMeta } from "../types";
import { createDocumentRepository } from "../../../infrastructure/documentRepo";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);

  /** Collect all .md file paths from the tree */
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

  const existingDocPaths = useCallback((tree: TreeNode[]): Set<string> => {
    return new Set(collectDocPaths(tree));
  }, [collectDocPaths]);

  /** Create a new document */
  const createDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path: string,
    initialContent = "",
  ) => {
    const repo = createDocumentRepository(rootHandle);
    await repo.write(path, initialContent);
    return path;
  }, []);

  /** Attach a document to an entity */
  const attachDocument = useCallback((
    docPath: string,
    entityType: DocumentMeta["attachedTo"] extends (infer T)[] | undefined ? T extends { type: infer U } ? U : never : never,
    entityId: string,
  ) => {
    setDocuments(prev => {
      const existing = prev.find(d => d.filename === docPath);
      if (existing) {
        const already = existing.attachedTo?.some(
          a => a.type === entityType && a.id === entityId
        );
        if (already) return prev;
        return prev.map(d =>
          d.filename === docPath
            ? { ...d, attachedTo: [...(d.attachedTo ?? []), { type: entityType, id: entityId }] }
            : d
        );
      }
      // Create new DocumentMeta entry
      const title = docPath.split("/").pop()?.replace(".md", "") ?? docPath;
      const newDoc: DocumentMeta = {
        id: `doc-${Date.now()}`,
        filename: docPath,
        title,
        attachedTo: [{ type: entityType, id: entityId }],
      };
      return [...prev, newDoc];
    });
  }, []);

  /** Detach a document from an entity */
  const detachDocument = useCallback((
    docPath: string,
    entityType: string,
    entityId: string,
  ) => {
    setDocuments(prev =>
      prev.map(d => {
        if (d.filename !== docPath) return d;
        return {
          ...d,
          attachedTo: d.attachedTo?.filter(
            a => !(a.type === entityType && a.id === entityId)
          ),
        };
      }).filter(d => (d.attachedTo?.length ?? 0) > 0)
    );
  }, []);

  /** Remove a document entry entirely */
  const removeDocument = useCallback((docPath: string) => {
    setDocuments(prev => prev.filter(d => d.filename !== docPath));
  }, []);

  /** Get documents attached to an entity */
  const getDocumentsForEntity = useCallback((
    entityType: string,
    entityId: string,
  ): DocumentMeta[] => {
    return documents.filter(d =>
      d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
    );
  }, [documents]);

  /** Check if an entity has attached documents */
  const hasDocuments = useCallback((
    entityType: string,
    entityId: string,
  ): boolean => {
    return documents.some(d =>
      d.attachedTo?.some(a => a.type === entityType && a.id === entityId)
    );
  }, [documents]);

  return {
    documents,
    setDocuments,
    createDocument,
    attachDocument,
    detachDocument,
    removeDocument,
    getDocumentsForEntity,
    hasDocuments,
    collectDocPaths,
    existingDocPaths,
  };
}
