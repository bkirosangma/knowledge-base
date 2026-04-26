"use client";

import React, { useState } from "react";
import { ChevronRight, Lock, LockOpen, Save, RotateCcw } from "lucide-react";

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
  /**
   * Title shown inline in the breadcrumb row. SHELL-1.12 (2026-04-26): the
   * separate `PaneTitle` row was folded into this header so the per-pane
   * chrome stack drops from 5 strips to 4.
   */
  title?: string;
  /**
   * Optional commit handler. If provided, the title becomes click-to-edit and
   * this fires with the trimmed value on blur / Enter when it has changed. If
   * omitted, the title renders as a static `<h1>` (e.g. document panes derive
   * the title from the H1 in body content; edits happen there, not here).
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
  /**
   * Hide the title input + dirty dot + Save/Discard. The Read/Edit pill,
   * reading-time pill, and breadcrumb still render. Used by Focus Mode (⌘.)
   * to dissolve title chrome while keeping the breadcrumb row's height stable.
   */
  hideTitleControls?: boolean;
  /** Extra actions rendered to the right of the Read Mode button. */
  children?: React.ReactNode;
}

export default function PaneHeader({
  filePath,
  readOnly,
  onToggleReadOnly,
  readingTimeMinutes,
  title,
  onTitleChange,
  isDirty = false,
  hasActiveFile = false,
  onSave,
  onDiscard,
  hideTitleControls = false,
  children,
}: PaneHeaderProps) {
  const pathParts = filePath.split("/");
  const editable = typeof onTitleChange === "function";
  const showActions = Boolean(onSave || onDiscard);
  const showTitleSection = !hideTitleControls && title != null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title ?? "");

  return (
    <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white">
      <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
        {pathParts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <ChevronRight size={10} />}
            <span className={i === pathParts.length - 1 ? "text-slate-700 font-medium" : ""}>
              {part}
            </span>
          </React.Fragment>
        ))}
      </div>

      {showTitleSection && (
        <>
          <span className="text-slate-300 select-none" aria-hidden="true">·</span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
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
                    setTitleDraft(title ?? "");
                    setIsEditingTitle(false);
                  }
                }}
                className="text-sm font-semibold text-slate-900 outline-none border-b border-blue-500 bg-transparent min-w-0 flex-1 px-1 -mx-1"
                data-testid="pane-title-input"
              />
            ) : (
              <h1
                onClick={editable ? () => {
                  setTitleDraft(title ?? "");
                  setIsEditingTitle(true);
                } : undefined}
                className={`text-sm font-semibold text-slate-900 truncate min-w-0 ${
                  editable ? "cursor-text hover:bg-slate-50 rounded px-1 -mx-1" : ""
                }`}
                data-testid="pane-title"
              >
                {title}
              </h1>
            )}
            {isDirty && showActions && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0"
                title="Unsaved changes"
                data-testid="pane-title-dirty-dot"
              />
            )}
          </div>

          {onDiscard && (
            <button
              onClick={onDiscard}
              disabled={!hasActiveFile || !isDirty}
              className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                hasActiveFile && isDirty ? "text-slate-500 hover:bg-slate-100 hover:text-slate-700" : "text-slate-300 cursor-not-allowed"
              }`}
              title="Discard changes"
            >
              <RotateCcw size={13} />
            </button>
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={!hasActiveFile || !isDirty}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors flex-shrink-0 ${
                hasActiveFile && isDirty ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-slate-100 text-slate-300 cursor-not-allowed"
              }`}
              title="Save (⌘S)"
            >
              <Save size={12} />
              Save
            </button>
          )}
        </>
      )}

      {!showTitleSection && <div className="flex-1" />}

      <button
        onClick={onToggleReadOnly}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border flex-shrink-0 ${
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
          className="text-xs text-slate-500 flex-shrink-0"
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
