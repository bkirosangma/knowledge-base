// src/app/knowledge_base/hooks/useDocuments.ts
"use client";

import { useState, useCallback } from "react";
import type { DocumentMeta } from "../../../shared/utils/types";
import { readTextFile, writeTextFile } from "../../../shared/hooks/useFileExplorer";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [activeDocPath, setActiveDocPath] = useState<string | null>(null);
  const [activeDocContent, setActiveDocContent] = useState("");
  const [docDirty, setDocDirty] = useState(false);

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

  /** Open a document by reading it from disk */
  const openDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path: string,
  ) => {
    try {
      const parts = path.split("/");
      let dirHandle = rootHandle;
      for (const part of parts.slice(0, -1)) {
        dirHandle = await dirHandle.getDirectoryHandle(part);
      }
      const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1]);
      const content = await readTextFile(fileHandle);
      setActiveDocPath(path);
      setActiveDocContent(content);
      setDocDirty(false);
      return content;
    } catch {
      setActiveDocPath(path);
      setActiveDocContent("");
      setDocDirty(false);
      return "";
    }
  }, []);

  /** Save the active document to disk */
  const saveDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path?: string,
    content?: string,
  ) => {
    const savePath = path ?? activeDocPath;
    const saveContent = content ?? activeDocContent;
    if (!savePath) return;
    await writeTextFile(rootHandle, savePath, saveContent);
    setDocDirty(false);
  }, [activeDocPath, activeDocContent]);

  /** Create a new document */
  const createDocument = useCallback(async (
    rootHandle: FileSystemDirectoryHandle,
    path: string,
    initialContent = "",
  ) => {
    await writeTextFile(rootHandle, path, initialContent);
    setActiveDocPath(path);
    setActiveDocContent(initialContent);
    setDocDirty(false);
    return path;
  }, []);

  /** Update content in memory (mark dirty) */
  const updateContent = useCallback((markdown: string) => {
    setActiveDocContent(markdown);
    setDocDirty(true);
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
      }).filter(d => (d.attachedTo?.length ?? 0) > 0 || d.filename === activeDocPath)
    );
  }, [activeDocPath]);

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
    activeDocPath,
    activeDocContent,
    docDirty,
    openDocument,
    saveDocument,
    createDocument,
    updateContent,
    setActiveDocPath,
    attachDocument,
    detachDocument,
    getDocumentsForEntity,
    hasDocuments,
    collectDocPaths,
    existingDocPaths,
  };
}
