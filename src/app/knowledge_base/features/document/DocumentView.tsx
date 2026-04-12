"use client";

import React from "react";
import MarkdownPane from "../../components/MarkdownPane";
import type { useDocuments } from "../../hooks/useDocuments";
import type { useLinkIndex } from "../../hooks/useLinkIndex";
import type { TreeNode } from "../../hooks/useFileExplorer";

export interface DocumentViewProps {
  focused: boolean;
  docManager: ReturnType<typeof useDocuments>;
  linkManager: ReturnType<typeof useLinkIndex>;
  tree: TreeNode[];
  onNavigateLink: (path: string) => void;
  onCreateDocument: (path: string) => void;
  onClose?: () => void;
}

export default function DocumentView({
  focused,
  docManager,
  linkManager,
  tree,
  onNavigateLink,
  onCreateDocument,
  onClose,
}: DocumentViewProps) {
  // Collect all .md paths for link autocomplete
  const allDocPaths = React.useMemo(() => {
    const paths: string[] = [];
    const walk = (items: TreeNode[]) => {
      for (const item of items) {
        if (item.type === "file" && item.name.endsWith(".md")) paths.push(item.path);
        if (item.children) walk(item.children);
      }
    };
    walk(tree);
    return paths;
  }, [tree]);

  const existingDocPaths = React.useMemo(() => new Set(allDocPaths), [allDocPaths]);

  // Get backlinks for the current document
  const backlinks = React.useMemo(() => {
    if (!docManager.activeDocPath) return [];
    return linkManager.getBacklinksFor(docManager.activeDocPath);
  }, [docManager.activeDocPath, linkManager]);

  return (
    <div className="h-full">
      <MarkdownPane
        filePath={docManager.activeDocPath}
        content={docManager.activeDocContent}
        title={docManager.activeDocPath?.split("/").pop()?.replace(".md", "") ?? ""}
        onChange={docManager.updateContent}
        onNavigateLink={onNavigateLink}
        onCreateDocument={onCreateDocument}
        existingDocPaths={existingDocPaths}
        allDocPaths={allDocPaths}
        backlinks={backlinks}
        onNavigateBacklink={onNavigateLink}
        onClose={onClose}
      />
    </div>
  );
}
