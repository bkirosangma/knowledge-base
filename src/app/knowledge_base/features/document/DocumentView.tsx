"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import MarkdownPane from "./components/MarkdownPane";
import DocumentProperties from "./properties/DocumentProperties";
import { useDocumentContent } from "./hooks/useDocumentContent";
import type { DocumentPaneBridge } from "./hooks/useDocumentContent";
import type { useLinkIndex } from "./hooks/useLinkIndex";
import type { TreeNode } from "../../shared/hooks/useFileExplorer";

export type { DocumentPaneBridge };

export interface DocumentViewProps {
  focused: boolean;
  filePath: string | null;
  dirHandleRef: React.RefObject<FileSystemDirectoryHandle | null>;
  onDocBridge?: (bridge: DocumentPaneBridge | null) => void;
  linkManager: ReturnType<typeof useLinkIndex>;
  tree: TreeNode[];
  onNavigateLink: (path: string) => void;
  onCreateDocument: (path: string) => void;
}

export default function DocumentView({
  focused,
  filePath,
  dirHandleRef,
  onDocBridge,
  linkManager,
  tree,
  onNavigateLink,
  onCreateDocument,
}: DocumentViewProps) {
  const { content, dirty, updateContent, bridge } = useDocumentContent(filePath);

  const [propertiesCollapsed, setPropertiesCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("properties-collapsed") === "true";
  });
  const toggleProperties = useCallback(() => {
    setPropertiesCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("properties-collapsed", String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Expose bridge to parent
  const onDocBridgeRef = useRef(onDocBridge);
  onDocBridgeRef.current = onDocBridge;
  useEffect(() => {
    onDocBridgeRef.current?.(bridge);
    return () => onDocBridgeRef.current?.(null);
  }, [bridge]);

  // Collect all wiki-linkable paths for link autocomplete
  const allDocPaths = React.useMemo(() => {
    const paths: string[] = [];
    const walk = (items: TreeNode[]) => {
      for (const item of items) {
        if (
          item.type === "file" &&
          (item.name.endsWith(".md") || item.name.endsWith(".json"))
        ) {
          paths.push(item.path);
        }
        if (item.children) walk(item.children);
      }
    };
    walk(tree);
    return paths;
  }, [tree]);

  const existingDocPaths = React.useMemo(() => new Set(allDocPaths), [allDocPaths]);

  // Get backlinks for the current document
  const backlinks = React.useMemo(() => {
    if (!filePath) return [];
    return linkManager.getBacklinksFor(filePath);
  }, [filePath, linkManager]);

  // Get outbound links for the current document
  const outboundLinks = React.useMemo(() => {
    if (!filePath) return null;
    const docEntry = linkManager.linkIndex.documents[filePath];
    if (!docEntry) return null;
    const links: { target: string; section?: string }[] = [];
    for (const link of docEntry.outboundLinks) {
      links.push({ target: link.targetPath });
    }
    for (const sl of docEntry.sectionLinks) {
      links.push({ target: sl.targetPath, section: sl.section });
    }
    return links;
  }, [filePath, linkManager.linkIndex]);

  return (
    <div className="flex-1 flex min-h-0 h-full">
      <div className="flex-1 min-h-0">
        <MarkdownPane
          filePath={filePath}
          content={content}
          title={filePath?.split("/").pop()?.replace(".md", "") ?? ""}
          onChange={updateContent}
          onNavigateLink={onNavigateLink}
          onCreateDocument={onCreateDocument}
          existingDocPaths={existingDocPaths}
          allDocPaths={allDocPaths}
          backlinks={backlinks}
          onNavigateBacklink={onNavigateLink}
          rightSidebar={
            <DocumentProperties
              filePath={filePath}
              content={content}
              outbound={outboundLinks}
              backlinks={backlinks}
              onNavigateLink={(path) => onNavigateLink?.(path)}
              collapsed={propertiesCollapsed}
              onToggleCollapse={toggleProperties}
            />
          }
        />
      </div>
    </div>
  );
}
