"use client";

import { useState } from "react";
import { FileText, LayoutGrid, Network } from "lucide-react";
import { useFooterContext } from "./FooterContext";
import { useToolbarContext, GRAPH_SENTINEL } from "./ToolbarContext";
import type { PaneEntry } from "./PaneManager";
import ConfirmPopover from "../shared/components/explorer/ConfirmPopover";

interface FooterProps {
  focusedEntry: PaneEntry | null;
  isSplit: boolean;
}

export default function Footer({ focusedEntry, isSplit }: FooterProps) {
  const { leftInfo, rightInfo } = useFooterContext();
  const { focusedPane } = useToolbarContext();
  const [resetConfirmPos, setResetConfirmPos] = useState<{ x: number; y: number } | null>(null);

  const info = focusedPane === "right" ? rightInfo : leftInfo;
  const isGraph = focusedEntry?.fileType === "graph" || focusedEntry?.filePath === GRAPH_SENTINEL;
  const filename = isGraph
    ? "Vault graph"
    : focusedEntry?.filePath.split("/").pop() ?? null;
  const FileIcon = isGraph
    ? Network
    : focusedEntry?.fileType === "document"
    ? FileText
    : LayoutGrid;
  const sideLabel = isSplit ? (focusedPane === "right" ? "Right" : "Left") : null;

  return (
    <div data-print-hide="true" className="flex-shrink-0 bg-surface/80 backdrop-blur-sm border-t border-line px-4 py-1 z-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {filename && (
            <div className="flex items-center gap-1.5 text-[11px] text-mute font-mono min-w-0">
              {sideLabel && (
                <span className="text-mute flex-shrink-0">[{sideLabel}]</span>
              )}
              <FileIcon size={12} className="text-mute flex-shrink-0" />
              <span className="truncate">{filename}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {info?.kind === "diagram" && (
            <>
              <span className="text-[11px] text-mute font-mono">
                {info.world.w}&times;{info.world.h}px
              </span>
              <span className="text-[11px] text-mute font-mono">
                {info.patches} patch{info.patches !== 1 ? "es" : ""}
              </span>
              <span className="text-[11px] text-mute font-mono">
                {Math.round(info.zoom * 100)}%
              </span>
            </>
          )}
          <button
            onClick={(e) => setResetConfirmPos({ x: e.clientX, y: e.clientY })}
            className="text-[11px] text-red-400 hover:text-red-600 font-mono cursor-pointer transition-colors"
            aria-label="Reset app — clears local storage and reloads"
          >
            Reset App
          </button>
        </div>
      </div>
      {resetConfirmPos && (
        <ConfirmPopover
          message="Clear all local state? This removes drafts, recent vaults, and view preferences. Files on disk are not affected."
          confirmLabel="Reset"
          confirmColor="red"
          position={resetConfirmPos}
          onConfirm={() => {
            localStorage.clear();
            window.location.reload();
          }}
          onCancel={() => setResetConfirmPos(null)}
        />
      )}
    </div>
  );
}
