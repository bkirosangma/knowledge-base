"use client";

import React from "react";
import MarkdownPane from "./components/MarkdownPane";
import DocumentProperties from "./properties/DocumentProperties";
import type { useDocuments } from "./hooks/useDocuments";
import type { useLinkIndex } from "./hooks/useLinkIndex";
import type { TreeNode } from "../../shared/hooks/useFileExplorer";

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

  // Get outbound links for the current document
  const outboundLinks = React.useMemo(() => {
    if (!docManager.activeDocPath) return null;
    const docEntry = linkManager.linkIndex.documents[docManager.activeDocPath];
    if (!docEntry) return null;
    const links: { target: string; section?: string }[] = [];
    for (const link of docEntry.outboundLinks) {
      links.push({ target: link.targetPath });
    }
    for (const sl of docEntry.sectionLinks) {
      links.push({ target: sl.targetPath, section: sl.section });
    }
    return links;
  }, [docManager.activeDocPath, linkManager.linkIndex]);

  return (
    <div className="flex-1 flex min-h-0 h-full">
      <div className="flex-1 min-h-0">
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
      <DocumentProperties
        filePath={docManager.activeDocPath}
        content={docManager.activeDocContent}
        outbound={outboundLinks}
        backlinks={backlinks}
        onNavigateLink={(path) => onNavigateLink?.(path)}
      />
    </div>
  );
}
