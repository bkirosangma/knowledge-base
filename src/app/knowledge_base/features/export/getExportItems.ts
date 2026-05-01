// Pane-kind → export-menu item gating (KB-011 / EXPORT-9.4-02).
// Pure helper so the menu's empty/non-empty state and item set are
// unit-testable without rendering the React tree.

import type { PaneType } from "../../shell/ToolbarContext";

export type ExportItemId = "svg" | "png" | "print";

export function getExportItems(paneType: PaneType | null | undefined): ExportItemId[] {
  switch (paneType) {
    case "diagram":
      return ["svg", "png"];
    case "svgEditor":
      // SVG editor exports the source it just edited; PNG rasterises
      // the same source via the canvas pipeline.
      return ["svg", "png"];
    case "document":
      return ["print"];
    case "graph":
    case "graphify":
    case "search":
    default:
      return [];
  }
}
