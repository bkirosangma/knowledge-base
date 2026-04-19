"use client";

import React, { useState } from "react";
import { Save, RotateCcw } from "lucide-react";

interface PaneTitleProps {
  /** Current title to display. */
  title: string;
  /**
   * Optional commit handler. If provided, the title becomes click-to-edit and
   * this fires with the trimmed value on blur / Enter when it has changed.
   * If omitted, the title is read-only (e.g. document pane uses the H1 from
   * content; edits happen in the body, not here).
   */
  onTitleChange?: (newTitle: string) => void;
  /** Whether the underlying file has unsaved changes — shows a dot + enables Save/Discard. */
  isDirty?: boolean;
  /** Whether a file is open at all — disables Save/Discard when false. */
  hasActiveFile?: boolean;
  /** Save handler. If omitted, the Save button is not rendered. */
  onSave?: () => void;
  /** Discard handler. If omitted, the Discard button is not rendered. */
  onDiscard?: (e: React.MouseEvent) => void;
}

export default function PaneTitle({
  title,
  onTitleChange,
  isDirty = false,
  hasActiveFile = false,
  onSave,
  onDiscard,
}: PaneTitleProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const editable = typeof onTitleChange === "function";
  const showActions = Boolean(onSave || onDiscard);

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-4 pt-3 pb-1 bg-white">
      <div className="flex-1 min-w-0">
        {editable && isEditingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setIsEditingTitle(false);
              if (titleDraft.trim() && titleDraft !== title) {
                onTitleChange?.(titleDraft.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setTitleDraft(title);
                setIsEditingTitle(false);
              }
            }}
            className="text-lg font-semibold text-slate-900 outline-none border-b-2 border-blue-500 w-full bg-transparent"
          />
        ) : (
          <h1
            onClick={editable ? () => {
              setTitleDraft(title);
              setIsEditingTitle(true);
            } : undefined}
            className={`text-lg font-semibold text-slate-900 truncate ${
              editable ? "cursor-text hover:bg-slate-50 rounded px-1 -mx-1" : ""
            }`}
          >
            {title}
          </h1>
        )}
      </div>

      {isDirty && showActions && (
        <span className="w-2 h-2 rounded-full bg-orange-400 flex-shrink-0" title="Unsaved changes" />
      )}

      {onDiscard && (
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
      )}
      {onSave && (
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
      )}
    </div>
  );
}
