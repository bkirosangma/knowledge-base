"use client";

import React from "react";
import { ChevronRight, Lock, LockOpen } from "lucide-react";

interface PaneHeaderProps {
  /** Full file path; rendered as a "/"-separated breadcrumb. */
  filePath: string;
  /** Whether the pane is currently in Read Mode. */
  readOnly: boolean;
  /** Toggle Read Mode on/off. */
  onToggleReadOnly: () => void;
  /** Extra actions rendered to the right of the Read Mode button. */
  children?: React.ReactNode;
}

export default function PaneHeader({
  filePath,
  readOnly,
  onToggleReadOnly,
  children,
}: PaneHeaderProps) {
  const pathParts = filePath.split("/");

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1 text-xs text-slate-400">
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={10} />}
            <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className="flex-1" />

      <button
        onClick={onToggleReadOnly}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
          readOnly
            ? "bg-white shadow-sm text-blue-600 border-slate-200"
            : "bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-100"
        }`}
        title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
        aria-pressed={readOnly}
        aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
      >
        {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
        <span>Read Mode</span>
      </button>

      {children}
    </div>
  );
}
