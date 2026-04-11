import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Save, RotateCcw, Activity, Tag, Map, LayoutGrid } from "lucide-react";
import type { ViewMode } from "../utils/types";

type ArrangeAlgorithm = "hierarchical-tb" | "hierarchical-lr" | "force";

function AutoArrangeDropdown({ onSelect }: { onSelect: (algo: ArrangeAlgorithm) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const items: { key: ArrangeAlgorithm; label: string }[] = [
    { key: "hierarchical-tb", label: "Hierarchical (Top → Bottom)" },
    { key: "hierarchical-lr", label: "Hierarchical (Left → Right)" },
    { key: "force", label: "Force-Directed" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        title="Auto Arrange"
        onClick={() => setOpen(!open)}
      >
        <LayoutGrid size={16} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50 min-w-[210px]">
          {items.map((item) => (
            <button
              key={item.key}
              className="block w-full text-left px-3 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => { onSelect(item.key); setOpen(false); }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const toggleClass = (active: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
    active ? "bg-white shadow-sm text-blue-600 border border-slate-200" : "text-slate-500 hover:text-slate-700 border border-transparent"
  }`;

interface HeaderProps {
  title: string;
  titleInputValue: string;
  setTitleInputValue: (v: string) => void;
  titleWidth: number | string;
  setTitleWidth: (w: number | string) => void;
  onTitleCommit: (value: string) => void;
  isDirty: boolean;
  hasActiveFile: boolean;
  isLive: boolean;
  showLabels: boolean;
  showMinimap: boolean;
  zoom: number;
  onToggleLive: () => void;
  onToggleLabels: () => void;
  onToggleMinimap: () => void;
  onZoomChange: (zoom: number) => void;
  onDiscard: (e: React.MouseEvent) => void;
  onSave: () => void;
  onAutoArrange?: (algorithm: "hierarchical-tb" | "hierarchical-lr" | "force") => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}

export default function Header({
  title,
  titleInputValue,
  setTitleInputValue,
  titleWidth,
  setTitleWidth,
  onTitleCommit,
  isDirty,
  hasActiveFile,
  isLive,
  showLabels,
  showMinimap,
  zoom,
  onToggleLive,
  onToggleLabels,
  onToggleMinimap,
  onZoomChange,
  onDiscard,
  onSave,
  onAutoArrange,
  viewMode,
  onViewModeChange,
}: HeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleMeasureRef = useRef<HTMLSpanElement>(null);
  const titleBeforeEdit = useRef(title);

  useEffect(() => {
    if (titleMeasureRef.current) {
      setTitleWidth(Math.min(400, titleMeasureRef.current.scrollWidth + 4));
    }
  }, [titleInputValue, setTitleWidth]);

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 z-20">
      <Link href="/" className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors" title="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
      </Link>

      <div className="h-5 w-px bg-slate-200" />

      <div className="relative flex items-center max-w-[400px]">
        <span
          ref={titleMeasureRef}
          className="invisible absolute whitespace-pre text-sm font-semibold px-0.5"
          aria-hidden="true"
        >
          {titleInputValue || " "}
        </span>
        <input
          ref={titleInputRef}
          value={titleInputValue}
          onChange={(e) => setTitleInputValue(e.target.value)}
          onFocus={(e) => { titleBeforeEdit.current = title; e.target.select(); }}
          onBlur={() => {
            const v = titleInputValue.trim();
            if (v && v !== title) onTitleCommit(v);
            else setTitleInputValue(title);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") { setTitleInputValue(titleBeforeEdit.current); e.currentTarget.blur(); }
          }}
          maxLength={80}
          className="text-sm font-semibold text-slate-800 bg-transparent border-none outline-none px-0.5 rounded hover:bg-slate-50 focus:bg-slate-50 focus:ring-1 focus:ring-blue-200 transition-colors cursor-pointer focus:cursor-text truncate"
          style={{ width: titleWidth }}
          title="Click to edit title"
        />
      </div>

      {isDirty && (
        <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Unsaved changes" />
      )}

      <div className="flex-1" />

      {onViewModeChange && (
        <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-100 gap-0.5">
          {([
            { mode: "diagram" as ViewMode, label: "Diagram" },
            { mode: "split" as ViewMode, label: "Split" },
            { mode: "document" as ViewMode, label: "Document" },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => onViewModeChange(mode)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                viewMode === mode
                  ? "bg-white shadow-sm text-blue-600 border border-slate-200"
                  : "text-slate-500 hover:text-slate-700 border border-transparent"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {viewMode !== "document" && (
        <>
          <div className="flex items-center gap-0.5 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
            <button onClick={onToggleLive} className={toggleClass(isLive)} title="Toggle live data flow animation">
              <Activity size={13} />
              <span className="hidden xl:inline">Live</span>
            </button>
            <button onClick={onToggleLabels} className={toggleClass(showLabels)} title="Toggle data line labels">
              <Tag size={13} />
              <span className="hidden xl:inline">Labels</span>
            </button>
          </div>
          <button
            onClick={onToggleMinimap}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
              showMinimap ? "bg-white shadow-sm text-blue-600 border-slate-200" : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
            }`}
            title="Toggle minimap"
          >
            <Map size={13} />
            <span className="hidden xl:inline">Minimap</span>
          </button>

          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-0.5 border border-slate-100">
            <button onClick={() => onZoomChange(Math.max(0.1, zoom - 0.25))} className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white transition-all" title="Zoom out">&minus;</button>
            <button
              onClick={() => onZoomChange(1)}
              className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${
                Math.abs(zoom - 1) < 0.01 ? "text-blue-600 bg-white shadow-sm border border-slate-200" : "text-slate-600 hover:text-blue-600 hover:bg-white border border-transparent"
              }`}
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button onClick={() => onZoomChange(Math.min(3, zoom + 0.25))} className="px-1.5 py-1 rounded-md text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-white transition-all" title="Zoom in">+</button>
          </div>

          {onAutoArrange && (
            <>
              <div className="h-5 w-px bg-slate-200" />
              <AutoArrangeDropdown onSelect={onAutoArrange} />
            </>
          )}
        </>
      )}

      <div className="h-5 w-px bg-slate-200" />

      <button
        onClick={onDiscard}
        disabled={!hasActiveFile || !isDirty}
        className={`p-1.5 rounded-md transition-colors ${
          hasActiveFile && isDirty ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "text-slate-300 cursor-not-allowed"
        }`}
        title="Discard changes"
      >
        <RotateCcw size={16} />
      </button>
      <button
        onClick={onSave}
        disabled={!hasActiveFile || !isDirty}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
          hasActiveFile && isDirty ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"
        }`}
        title="Save (⌘S)"
      >
        <Save size={14} />
        Save
      </button>
    </div>
  );
}
