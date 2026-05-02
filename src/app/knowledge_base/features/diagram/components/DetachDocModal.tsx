"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

interface DetachDocModalProps {
  docPath: string;
  attachments: Array<{ entityType: string; entityId: string }>;
  wikiBacklinks: string[];
  onConfirm: (alsoDelete: boolean) => void;
  onCancel: () => void;
}

export default function DetachDocModal({
  docPath,
  attachments,
  wikiBacklinks,
  onConfirm,
  onCancel,
}: DetachDocModalProps) {
  const [alsoDelete, setAlsoDelete] = useState(false);
  const filename = docPath.split("/").pop() ?? docPath;
  const hasRefs = attachments.length > 0 || wikiBacklinks.length > 0;
  const dialogRef = useRef<HTMLDivElement>(null);
  // KB-031: focus trap — Tab cycles inside the dialog; Escape calls
  // `onCancel`; focus returns to the trigger on close.
  useFocusTrap(dialogRef, true, { onEscape: onCancel });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onCancel} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detach-doc-title"
        className="relative bg-surface rounded-xl shadow-2xl w-[440px] p-6 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="detach-doc-title" className="text-sm font-semibold text-ink">
          Detach &ldquo;{filename}&rdquo;?
        </h3>

        {hasRefs && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-mute uppercase tracking-wide">
              Also referenced by
            </p>
            <ul className="flex flex-col gap-1">
              {attachments.map(a => (
                <li key={`${a.entityType}-${a.entityId}`} className="text-xs text-ink-2">
                  · {a.entityType} · {a.entityId} <span className="text-mute">(attached)</span>
                </li>
              ))}
              {wikiBacklinks.map(path => (
                <li key={path} className="text-xs text-ink-2">
                  · {path.split("/").pop()} <span className="text-mute">(wiki-link)</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            aria-label="Also delete this document"
            checked={alsoDelete}
            onChange={e => setAlsoDelete(e.target.checked)}
            className="rounded border-line text-red-600"
          />
          <span className="text-sm text-ink-2">Also delete this document</span>
        </label>

        {alsoDelete && wikiBacklinks.length > 0 && (
          <div
            role="alert"
            className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
          >
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Wiki-links to this document in{" "}
              <strong>{wikiBacklinks.length}</strong>{" "}
              {wikiBacklinks.length === 1 ? "document" : "documents"} will also be
              removed:{" "}
              {wikiBacklinks.map(p => p.split("/").pop()).join(", ")}
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-ink-2 bg-surface border border-line rounded-lg hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            aria-label="Detach"
            onClick={() => onConfirm(alsoDelete)}
            className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Detach
          </button>
        </div>
      </div>
    </div>
  );
}
