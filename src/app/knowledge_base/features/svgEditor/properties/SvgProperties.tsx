"use client";

import type { ReactElement } from "react";
import { FileLevelReferencesGroup } from "../../../shared/components/FileLevelReferencesGroup";
import { SourcesSection } from "../../../shared/components/SourcesSection";
import { useSvgMeta } from "../hooks/useSvgMeta";

export interface SvgPropertiesProps {
  filePath: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
  /** Doc paths attached to this SVG (filtered upstream from attachmentLinks.json). */
  attachedDocPaths?: string[];
  /** Wiki-link backlinks pointing to this SVG (filtered upstream from linkIndex). */
  backlinks?: { sourcePath: string; section?: string }[];
  /** All known docs in the vault. Used by the references group for title lookup. */
  documents?: { filename: string; title?: string }[];
  /** Open the doc picker for this SVG. Undefined → no Attach button. */
  onOpenDocPicker?: () => void;
  /** Detach a doc from this SVG. Undefined → rows render read-only paperclip. */
  onDetachDocument?: (docPath: string) => void;
  /** Open a doc in the opposite pane on row click. */
  onPreviewDocument?: (docPath: string) => void;
}

/**
 * Side panel for an open SVG. Hosts a References section (attached docs +
 * wiki-link backlinks) and a Sources section driven by `useSvgMeta(filePath)`.
 * Mirrors `TabProperties` collapse behaviour and width tokens for visual
 * consistency.
 */
export function SvgProperties({
  filePath,
  collapsed,
  onToggleCollapse,
  readOnly = false,
  attachedDocPaths,
  backlinks,
  documents,
  onOpenDocPicker,
  onDetachDocument,
  onPreviewDocument,
}: SvgPropertiesProps): ReactElement {
  const { sources, setSources } = useSvgMeta(filePath);
  const widthClass = collapsed ? "w-9" : "w-72";
  return (
    <aside
      data-testid="svg-properties"
      data-collapsed={collapsed ? "true" : "false"}
      className={`flex h-full flex-col border-l border-line bg-surface text-sm transition-[width] duration-200 ${widthClass}`}
    >
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        {!collapsed && <span className="text-xs font-medium text-mute">Properties</span>}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand properties" : "Collapse properties"}
          className="rounded px-1 hover:bg-line/20"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      {!collapsed && filePath !== null && (
        <div className="flex-1 overflow-auto px-3 py-2 space-y-4">
          <section>
            <h3 className="mb-2 text-xs font-medium text-mute">References</h3>
            <FileLevelReferencesGroup
              filePath={filePath}
              attachmentPaths={attachedDocPaths ?? []}
              backlinks={backlinks ?? []}
              documents={documents ?? []}
              readOnly={readOnly}
              onPreview={onPreviewDocument}
              onDetach={onDetachDocument}
              onAttach={onOpenDocPicker}
            />
          </section>
          <section>
            <h3 className="mb-2 text-xs font-medium text-mute">Sources</h3>
            <SourcesSection sources={sources} onChange={setSources} readOnly={readOnly} />
          </section>
        </div>
      )}
    </aside>
  );
}
