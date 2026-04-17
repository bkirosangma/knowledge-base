"use client";

import { useFooterContext } from "./FooterContext";
import { useToolbarContext } from "./ToolbarContext";

export default function Footer() {
  const { leftInfo, rightInfo } = useFooterContext();
  const { focusedPane } = useToolbarContext();

  const info = focusedPane === "right" ? rightInfo : leftInfo;

  return (
    <div className="flex-shrink-0 bg-white/80 backdrop-blur-sm border-t border-slate-200 px-4 py-1 z-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
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
        </div>
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
  );
}
