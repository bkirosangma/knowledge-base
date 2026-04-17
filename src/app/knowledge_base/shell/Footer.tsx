"use client";

import { FileText, LayoutGrid } from "lucide-react";
import { useFooterContext } from "./FooterContext";
import { useToolbarContext } from "./ToolbarContext";
import type { PaneEntry } from "./PaneManager";

interface FooterProps {
  focusedEntry: PaneEntry | null;
  isSplit: boolean;
}

export default function Footer({ focusedEntry, isSplit }: FooterProps) {
  const { leftInfo, rightInfo } = useFooterContext();
  const { focusedPane } = useToolbarContext();

  const info = focusedPane === "right" ? rightInfo : leftInfo;
  const filename = focusedEntry?.filePath.split("/").pop() ?? null;
  const FileIcon = focusedEntry?.fileType === "document" ? FileText : LayoutGrid;
  const sideLabel = isSplit ? (focusedPane === "right" ? "Right" : "Left") : null;

  return (
    <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-t border-slate-200 px-4 py-1 z-20">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {filename && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono min-w-0">
              {sideLabel && (
                <span className="text-slate-400 flex-shrink-0">[{sideLabel}]</span>
              )}
              <FileIcon size={12} className="text-slate-400 flex-shrink-0" />
              <span className="truncate">{filename}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {info?.kind === "diagram" && (
            <>
              <span className="text-[11px] text-slate-400 font-mono">
                {info.world.w}&times;{info.world.h}px
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {info.patches} patch{info.patches !== 1 ? "es" : ""}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {Math.round(info.zoom * 100)}%
              </span>
            </>
          )}
          <button
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="text-[11px] text-red-400 hover:text-red-600 font-mono cursor-pointer transition-colors"
          >
            Reset App
          </button>
        </div>
      </div>
    </div>
  );
}
