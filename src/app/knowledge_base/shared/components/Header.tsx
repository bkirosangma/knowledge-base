import React, { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Save, RotateCcw, Columns2 } from "lucide-react";

interface HeaderProps {
  title: string;
  titleInputValue: string;
  setTitleInputValue: (v: string) => void;
  titleWidth: number | string;
  setTitleWidth: (w: number | string) => void;
  onTitleCommit: (value: string) => void;
  isDirty: boolean;
  hasActiveFile: boolean;
  onDiscard: (e: React.MouseEvent) => void;
  onSave: () => void;
  /** Which pane type is active — controls which toolbar controls are visible */
  activePaneType?: "design" | "document" | "mixed";
  /** Whether split mode is on */
  isSplit?: boolean;
  /** Toggle split mode */
  onToggleSplit?: () => void;
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
  onDiscard,
  onSave,
  isSplit = false,
  onToggleSplit,
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

      {onToggleSplit && (
        <button
          onClick={onToggleSplit}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
            isSplit ? "bg-white shadow-sm text-blue-600 border-slate-200" : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
          }`}
          title={isSplit ? "Exit split view" : "Split view"}
        >
          <Columns2 size={13} />
          <span className="hidden xl:inline">Split</span>
        </button>
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
