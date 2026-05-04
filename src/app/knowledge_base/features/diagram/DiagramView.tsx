"use client";

/**
 * DiagramView — diagram pane for a knowledge-base vault.
 *
 * After KB-020 this file is layout + slot wiring only. State, derived
 * geometry, drag handlers, persistence, history, attachments, and the
 * shell-bridge are composed inside `useDiagramController`, which itself
 * delegates to focused hooks under `./hooks/useDiagram*` and the split
 * interaction context under `./state/DiagramInteractionContext.tsx`.
 *
 * The 6-field document store (`title, layers, nodes, connections,
 * lineCurve, flows`) lives in `./hooks/useDiagramDocument.ts` and is
 * mutated through a small `dispatch` surface (slice setters + a single
 * `loadDoc` action used by file-load / undo-redo / file-watcher reload).
 *
 * Adding a new piece of interaction state means touching ONE file —
 * `DiagramInteractionContext.tsx`. Adding a new derived geometry means
 * touching `useDiagramGeometry.ts`. Adding a new drag means touching
 * one of the `use*Drag` hooks. DiagramView itself stays a layout shell.
 */

import React from "react";
import ConflictBanner from "../../shared/components/ConflictBanner";
import DiagramToolbar from "./components/DiagramToolbar";
import DiagramCanvas from "./components/DiagramCanvas";
import DiagramQuickInspectorSlot from "./components/DiagramQuickInspectorSlot";
import DiagramOverlays from "./components/DiagramOverlays";
import { DiagramInteractionProvider } from "./state/DiagramInteractionContext";
import { useDiagramController } from "./hooks/useDiagramController";
import type { useFileExplorer } from "../../shared/hooks/useFileExplorer";
import type { DocumentMeta } from "../document/types";
import type { AttachmentLink } from "../../domain/attachmentLinks";
// Re-export bridge types so callers importing them from DiagramView keep working.
// Definitions moved to `./types.ts` in KB-020 so the bridge hook can share them.
export type { HeaderBridge, ExplorerBridge, DiagramBridge } from "./types";

export interface DiagramViewProps {
  focused: boolean;
  /** Which pane this diagram is rendered in — used to push footer info to the right slot. */
  side: "left" | "right";
  activeFile: string | null;
  fileExplorer: ReturnType<typeof useFileExplorer>;
  onOpenDocument: (path: string) => void;
  documents: DocumentMeta[];
  onAttachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onDetachDocument: (docPath: string, entityType: string, entityId: string) => void;
  onCreateDocument: (rootHandle: FileSystemDirectoryHandle, path: string) => Promise<void>;
  onMigrateLegacyDocuments?: (filePath: string, docs: DocumentMeta[]) => Promise<void>;
  backlinks?: { sourcePath: string; section?: string }[];
  onDiagramBridge: (bridge: import("./types").DiagramBridge) => void;
  readDocument: (path: string) => Promise<string | null>;
  getDocumentReferences: (
    docPath: string,
    exclude?: { entityType: string; entityId: string },
  ) => { attachments: Array<{ entityType: string; entityId: string }>; wikiBacklinks: string[] };
  deleteDocumentWithCleanup: (path: string) => Promise<void>;
  onCreateAndAttach: (flowId: string, filename: string, editNow: boolean) => Promise<void>;
  onAfterDiagramSaved?: (diagramPath: string) => void;
  /** Single-fire intent from vault-search to centre + select a node on mount. */
  searchTarget?: { nodeId: string };
  rows: AttachmentLink[];
  setRows: (next: AttachmentLink[] | ((prev: AttachmentLink[]) => AttachmentLink[])) => void;
}

export default function DiagramView(props: DiagramViewProps) {
  return (
    <DiagramInteractionProvider>
      <DiagramViewInner {...props} />
    </DiagramInteractionProvider>
  );
}

function DiagramViewInner(props: DiagramViewProps) {
  const c = useDiagramController(props);
  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">
      <DiagramToolbar {...c.toolbar} />
      {c.conflictSnapshot && (
        <ConflictBanner onReload={c.handleReloadFromDisk} onKeep={c.handleKeepEdits} />
      )}
      <div className="flex-1 flex min-h-0 relative">
        <DiagramCanvas {...c.canvas} />
        <DiagramQuickInspectorSlot {...c.quickInspector} />
        <DiagramOverlays {...c.overlays} />
      </div>
    </div>
  );
}
