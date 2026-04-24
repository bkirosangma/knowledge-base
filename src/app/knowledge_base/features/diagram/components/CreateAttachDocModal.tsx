"use client";

import { useState } from "react";

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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-attach-title"
        className="relative bg-white rounded-xl shadow-2xl w-[400px] p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="create-attach-title" className="text-sm font-semibold text-slate-800">
          Create &amp; Attach Document
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600" htmlFor="new-doc-filename">
            Filename
          </label>
          <input
            id="new-doc-filename"
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            autoFocus
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Edit now"
            checked={editNow}
            onChange={(e) => setEditNow(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600"
          />
          <span className="text-sm text-slate-600">Edit now</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
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
