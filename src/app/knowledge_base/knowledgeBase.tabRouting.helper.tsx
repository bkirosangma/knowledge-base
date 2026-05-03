import type { ReactElement } from "react";
import type { PaneEntry } from "./shell/PaneManager";
import type { DocumentMeta } from "./features/document/types";
import { TabView } from "./features/tab/TabView";

/**
 * Wireup context for the tab pane. All fields optional so that unit tests
 * which call renderTabPaneEntry(entry) without a context still render a
 * bare TabView with no attachment chrome.
 */
export interface TabPaneContext {
  documents?: DocumentMeta[];
  backlinks?: { sourcePath: string; section?: string }[];
  readOnly?: boolean;
  onPreviewDocument?: (path: string) => void;
  onAttachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  onDetachDocument?: (docPath: string, entityType: "tab" | "tab-section", entityId: string) => void;
  onCreateDocument?: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<unknown>;
  getDocumentsForEntity?: (entityType: string, entityId: string) => DocumentMeta[];
  allDocPaths?: string[];
  rootHandle?: FileSystemDirectoryHandle | null;
  onMigrateAttachments?: (filePath: string, migrations: { from: string; to: string }[]) => void;
}

/**
 * Pure renderer for the `"tab"` PaneType. Lives outside the main
 * `<KnowledgeBase>` so unit tests can assert routing without the full
 * shell mount. The renderPane callback in `knowledgeBase.tsx` delegates
 * to this for `entry.fileType === "tab"`.
 */
export function renderTabPaneEntry(
  entry: PaneEntry,
  context?: TabPaneContext,
): ReactElement | null {
  if (entry.fileType === "tab") {
    return <TabView filePath={entry.filePath} {...(context ?? {})} />;
  }
  return null;
}

/**
 * Pure shape-builder for the tab pane context spread into
 * `renderTabPaneEntry`. Extracted so the shell-level wiring rule
 * "`readOnly` mirrors `isMobile`" (KB-040 / TAB-012) can be unit-tested
 * without spinning up `KnowledgeBaseInner`. The callback fields are
 * passed through verbatim — this helper only owns the
 * `isMobile → readOnly` translation plus a stable object shape.
 */
export interface BuildTabPaneContextArgs {
  documents: TabPaneContext["documents"];
  backlinks: TabPaneContext["backlinks"];
  isMobile: boolean;
  onPreviewDocument: TabPaneContext["onPreviewDocument"];
  onAttachDocument: TabPaneContext["onAttachDocument"];
  onDetachDocument: TabPaneContext["onDetachDocument"];
  onCreateDocument: TabPaneContext["onCreateDocument"];
  getDocumentsForEntity: TabPaneContext["getDocumentsForEntity"];
  allDocPaths: TabPaneContext["allDocPaths"];
  rootHandle: TabPaneContext["rootHandle"];
  onMigrateAttachments: TabPaneContext["onMigrateAttachments"];
}

export function buildTabPaneContext(args: BuildTabPaneContextArgs): TabPaneContext {
  return {
    documents: args.documents,
    backlinks: args.backlinks,
    // KB-040: mobile boots the tab pane read-only. TabProperties /
    // TabReferencesList already gate Attach + detach affordances on this
    // flag (TAB-007a).
    readOnly: args.isMobile,
    onPreviewDocument: args.onPreviewDocument,
    onAttachDocument: args.onAttachDocument,
    onDetachDocument: args.onDetachDocument,
    onCreateDocument: args.onCreateDocument,
    getDocumentsForEntity: args.getDocumentsForEntity,
    allDocPaths: args.allDocPaths,
    rootHandle: args.rootHandle,
    onMigrateAttachments: args.onMigrateAttachments,
  };
}
