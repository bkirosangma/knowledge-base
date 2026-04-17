"use client";

import React, { useState } from "react";

interface PaneTitleProps {
  /** Current title to display. */
  title: string;
  /**
   * Optional commit handler. If provided, called with the trimmed new title
   * on blur / Enter when the value has actually changed. If omitted, edits
   * are accepted locally but do not persist; the component re-renders the
   * externally-provided `title` on next prop change.
   */
  onTitleChange?: (newTitle: string) => void;
}

export default function PaneTitle({ title, onTitleChange }: PaneTitleProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  return (
    <div className="flex-shrink-0 px-4 pt-3 pb-1 bg-white">
      {isEditingTitle ? (
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
          onClick={() => {
            setTitleDraft(title);
            setIsEditingTitle(true);
          }}
          className="text-lg font-semibold text-slate-900 cursor-text hover:bg-slate-50 rounded px-1 -mx-1"
        >
          {title}
        </h1>
      )}
    </div>
  );
}
