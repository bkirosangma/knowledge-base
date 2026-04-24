"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileText, X, ExternalLink, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { markdownToHtml } from "../../document/extensions/markdownSerializer";

interface DocPreviewModalProps {
  docPath: string;
  entityName?: string;
  onClose: () => void;
  onOpenInPane: (path: string) => void;
  readDocument: (path: string) => Promise<string | null>;
}

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "em", "strong", "del", "s", "b", "i",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
  ],
  ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "align"],
  ALLOW_DATA_ATTR: false,
};

export default function DocPreviewModal({
  docPath,
  entityName,
  onClose,
  onOpenInPane,
  readDocument,
}: DocPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    readDocument(docPath)
      .then(raw => {
        if (cancelled) return;
        if (raw === null) { setError(true); return; }
        setHtml(DOMPurify.sanitize(markdownToHtml(raw), SANITIZE_CONFIG) as string);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [docPath, readDocument]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const filename = docPath.split("/").pop() ?? docPath;

  const modal = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div
        data-testid="doc-preview-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-preview-title"
        className="relative bg-white rounded-xl shadow-2xl w-[680px] max-h-[78vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-indigo-500" />
            <span id="doc-preview-title" className="text-sm font-semibold text-slate-800">{filename}</span>
            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 uppercase tracking-wide">
              Read only
            </span>
          </div>
          <div className="flex items-center gap-2">
            {entityName && (
              <span className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5">
                {entityName}
              </span>
            )}
            <button
              onClick={() => { onOpenInPane(docPath); onClose(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors"
            >
              <ExternalLink size={12} />
              Open in pane
            </button>
            <button
              aria-label="Close preview"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {html === null && !error && (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 role="status" aria-label="Loading document" size={20} className="animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-slate-500">
              Could not load document.
            </div>
          )}
          {html !== null && !error && (
            <div
              className="markdown-editor"
              dangerouslySetInnerHTML={{ __html: `<div class="ProseMirror">${html}</div>` }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
