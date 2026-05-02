"use client";

import { useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

interface CreateAttachDocModalProps {
  defaultFilename: string;
  onConfirm: (filename: string, editNow: boolean) => void;
  onCancel: () => void;
}

export default function CreateAttachDocModal({
  defaultFilename,
  onConfirm,
  onCancel,
}: CreateAttachDocModalProps) {
  const [filename, setFilename] = useState(defaultFilename);
  const [editNow, setEditNow] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // KB-031: focus trap. Captures the trigger on mount, focuses the
  // first input, traps Tab inside the dialog, restores focus on close.
  // Escape closes the modal via the host's `onCancel`.
  useFocusTrap(dialogRef, true, { onEscape: onCancel });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-attach-title"
        className="relative bg-surface rounded-xl shadow-2xl w-[400px] p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="create-attach-title" className="text-sm font-semibold text-ink">
          Create &amp; Attach Document
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-ink-2" htmlFor="new-doc-filename">
            Filename
          </label>
          <input
            id="new-doc-filename"
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-line rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Edit now"
            checked={editNow}
            onChange={(e) => setEditNow(e.target.checked)}
            className="rounded border-line text-indigo-600"
          />
          <span className="text-sm text-ink-2">Edit now</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-ink-2 bg-surface border border-line rounded-lg hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            aria-label="Create & Attach"
            onClick={() => onConfirm(filename.trim(), editNow)}
            disabled={!filename.trim()}
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            Create &amp; Attach
          </button>
        </div>
      </div>
    </div>
  );
}
