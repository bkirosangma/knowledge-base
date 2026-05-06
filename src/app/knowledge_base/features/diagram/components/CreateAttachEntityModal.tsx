"use client";

import { useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";
import type { PreviewItemType } from "./AttachmentPreviewModal";

// MVP-2b: Type-aware Create-&-Attach picker. Ports the prior
// `CreateAttachDocModal` (filename + "Edit now" + focus trap +
// backdrop dismiss) and prepends a 4-tab type strip:
//   Document | Diagram | SVG | Tab
// Only the Document tab is wired through to persistence today; the
// other three render but disable Confirm with a deferred-persistence
// notice. The 4-way visibility is the MVP-2b UI contract — do not
// hide non-doc tabs while the data layer catches up.

interface CreateAttachEntityModalProps {
  open: boolean;
  defaultFilename: string;
  onConfirm: (filename: string, editNow: boolean, type: PreviewItemType) => void;
  onCancel: () => void;
}

const TYPES: PreviewItemType[] = ["document", "diagram", "svg", "tab"];

const TYPE_LABEL: Record<PreviewItemType, string> = {
  document: "Document",
  diagram: "Diagram",
  svg: "SVG",
  tab: "Tab",
};

export function CreateAttachEntityModal({
  open,
  defaultFilename,
  onConfirm,
  onCancel,
}: CreateAttachEntityModalProps) {
  const [activeType, setActiveType] = useState<PreviewItemType>("document");
  const [filename, setFilename] = useState(defaultFilename);
  const [editNow, setEditNow] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // KB-031 parity: trap focus while open, restore on close, Escape
  // routes through `onCancel` (matches the prior CreateAttachDocModal).
  useFocusTrap(dialogRef, open, { onEscape: onCancel });

  if (!open) return null;

  const isDocumentTab = activeType === "document";
  const confirmDisabled = !isDocumentTab || filename.trim().length === 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        data-testid="create-attach-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onCancel}
      />
      <div
        ref={dialogRef}
        data-testid="create-attach-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-attach-title"
        className="relative bg-surface border border-line rounded-xl shadow-2xl w-[440px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-2">
          <h3 id="create-attach-title" className="text-sm font-semibold text-ink">
            Create &amp; Attach
          </h3>
        </div>

        <div
          role="tablist"
          aria-label="Attachment type"
          className="flex gap-2 px-5 text-xs border-b border-line"
        >
          {TYPES.map((t) => {
            const selected = t === activeType;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={selected}
                data-testid={`create-attach-type-${t}`}
                onClick={() => setActiveType(t)}
                className={
                  "px-2 py-1.5 -mb-px border-b-2 transition-colors " +
                  (selected
                    ? "border-accent text-accent font-semibold"
                    : "border-transparent text-mute hover:text-ink-2")
                }
              >
                {TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-ink-2" htmlFor="new-entity-filename">
              Filename
            </label>
            <input
              id="new-entity-filename"
              data-testid="create-attach-filename"
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              disabled={!isDocumentTab}
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-line rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
              autoFocus
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              data-testid="create-attach-edit-now"
              aria-label="Edit now"
              checked={editNow}
              onChange={(e) => setEditNow(e.target.checked)}
              disabled={!isDocumentTab}
              className="rounded border-line text-indigo-600"
            />
            <span className="text-sm text-ink-2">Edit now</span>
          </label>

          {!isDocumentTab && (
            <p className="text-[11px] text-mute italic">
              {TYPE_LABEL[activeType]} attachment persistence ships in a future MVP.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              data-testid="create-attach-cancel"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-medium text-ink-2 bg-surface border border-line rounded-lg hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="create-attach-confirm"
              aria-label="Create & Attach"
              onClick={() => onConfirm(filename.trim(), editNow, activeType)}
              disabled={confirmDisabled}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Create &amp; Attach
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
