"use client";

import { AlertTriangle } from "lucide-react";

interface Props {
  docPath: string;
  deletedIds: string[];
  affectedRefs: Array<{ sourcePath: string; anchor: string }>;
  onRemoveAnchors: () => void;
  onLeaveBroken: () => void;
}

export function BrokenAnchorBanner({ docPath, deletedIds, affectedRefs, onRemoveAnchors, onLeaveBroken }: Props) {
  return (
    <div data-testid="broken-anchor-banner" className="flex items-center gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs">
      <AlertTriangle size={14} />
      <div className="flex-1">
        <strong>{deletedIds.length}</strong> heading{deletedIds.length === 1 ? "" : "s"} removed from <code>{docPath}</code>;
        <span className="ml-1">{affectedRefs.length} wiki-link{affectedRefs.length === 1 ? "" : "s"} now broken.</span>
      </div>
      <button onClick={onRemoveAnchors} className="px-2 py-0.5 bg-amber-200 rounded hover:bg-amber-300">Remove anchors</button>
      <button onClick={onLeaveBroken} className="px-2 py-0.5 hover:underline">Leave broken</button>
    </div>
  );
}
