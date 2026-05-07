"use client";

import type { ReactElement } from "react";
import { SourcesSection } from "../../../shared/components/SourcesSection";
import { useSvgMeta } from "../hooks/useSvgMeta";

export interface SvgPropertiesProps {
  filePath: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  readOnly?: boolean;
}

/**
 * Side panel for an open SVG. Currently hosts a single Sources section
 * driven by `useSvgMeta(filePath)`. Mirrors `TabProperties` collapse
 * behaviour and width tokens for visual consistency.
 */
export function SvgProperties({
  filePath,
  collapsed,
  onToggleCollapse,
  readOnly = false,
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
            <h3 className="mb-2 text-xs font-medium text-mute">Sources</h3>
            <SourcesSection sources={sources} onChange={setSources} readOnly={readOnly} />
          </section>
        </div>
      )}
    </aside>
  );
}
