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
  /** Estimated reading time in minutes. When provided AND `readOnly` is
   *  true, a small pill renders next to the Read button. Hidden in edit
   *  mode so the chrome stays calm while the user is writing. */
  readingTimeMinutes?: number;
  /** Extra actions rendered to the right of the Read Mode button. */
  children?: React.ReactNode;
}

export default function PaneHeader({
  filePath,
  readOnly,
  onToggleReadOnly,
  readingTimeMinutes,
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
            ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm"
            : "bg-slate-100 text-slate-600 hover:text-slate-700 border-slate-200"
        }`}
        title={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
        aria-pressed={readOnly}
        aria-label={readOnly ? "Exit Read Mode" : "Enter Read Mode"}
      >
        {readOnly ? <Lock size={13} /> : <LockOpen size={13} />}
        <span>{readOnly ? "Read" : "Edit"}</span>
      </button>

      {readOnly && readingTimeMinutes != null && readingTimeMinutes > 0 && (
        <span
          data-testid="reading-time-pill"
          className="text-xs text-slate-500"
          title="Estimated reading time"
          aria-label={`Estimated reading time: ${readingTimeMinutes} minutes`}
        >
          {readingTimeMinutes} min read
        </span>
      )}

      {children}
    </div>
  );
}
