"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { FileText, X, ExternalLink, Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { markdownToHtml } from "../../document/extensions/markdownSerializer";
import { resolveWikiLinkPath } from "../../document/utils/wikiLinkParser";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

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
  // `markdownToHtml` emits wiki-links as `<span data-wiki-link=...
  // data-wiki-section=... class="wiki-link">`. Allowlist the two data
  // attributes so the link identity survives sanitization; the static
  // pill styling keys off `.wiki-link` (see prose.css).
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class", "align",
    "data-wiki-link", "data-wiki-section",
  ],
  ALLOW_DATA_ATTR: false,
};

const MIN_WIDTH = 480;

export default function DocPreviewModal({
  docPath,
  entityName,
  onClose,
  onOpenInPane,
  readDocument,
}: DocPreviewModalProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [modalWidth, setModalWidth] = useState(680);
  const modalWidthRef = useRef(680);
  const filenameRef = useRef<HTMLSpanElement>(null);
  const entityRef = useRef<HTMLSpanElement>(null);
  const [filenameTruncated, setFilenameTruncated] = useState(false);
  const [entityTruncated, setEntityTruncated] = useState(false);

  useEffect(() => { modalWidthRef.current = modalWidth; }, [modalWidth]);

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

  // KB-031: focus trap — captures the trigger, focuses the first
  // interactive element (the close button), traps Tab within the
  // dialog, restores focus on close. Escape calls `onClose`.
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true, { onEscape: onClose });

  useEffect(() => {
    const el = filenameRef.current;
    if (el) {
      const t = el.scrollWidth > el.offsetWidth;
      setFilenameTruncated(prev => prev === t ? prev : t);
    }
  }, []);

  useEffect(() => {
    const el = entityRef.current;
    if (el) {
      const t = el.scrollWidth > el.offsetWidth;
      setEntityTruncated(prev => prev === t ? prev : t);
    }
  }, []);

  const handleEdgeDrag = useCallback((e: React.MouseEvent, edge: 'left' | 'right') => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = modalWidthRef.current;

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const next = edge === 'right' ? startWidth + delta * 2 : startWidth - delta * 2;
      setModalWidth(Math.max(MIN_WIDTH, Math.min(Math.floor(window.innerWidth * 0.9), next)));
    };

    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const filename = docPath.split("/").pop() ?? docPath;
  const currentDocDir = useMemo(
    () => docPath.split("/").slice(0, -1).join("/"),
    [docPath],
  );

  // Wiki-link click handler. Body markdown is `dangerouslySetInnerHTML`d
  // (no React tree on the spans), so we delegate from the wrapper. Each
  // `<span data-wiki-link="…">` rendered by `markdownToHtml` carries the
  // raw link path; resolve it the same way the editor does, then open
  // the resolved file in the pane and close the modal. `closest` handles
  // clicks that land on inner text/icon nodes.
  const handleBodyClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-wiki-link]",
      );
      if (!target) return;
      const linkPath = target.getAttribute("data-wiki-link");
      if (!linkPath) return;
      e.preventDefault();
      e.stopPropagation();
      const resolved = resolveWikiLinkPath(linkPath, currentDocDir);
      onOpenInPane(resolved);
      onClose();
    },
    [currentDocDir, onOpenInPane, onClose],
  );

  const modal = (
    <div className="fixed inset-0 z-[9999]">
      <div
        data-testid="doc-preview-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-preview-title"
        style={{ width: modalWidth, left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        className="absolute bg-surface rounded-xl shadow-2xl max-h-[78vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Left resize handle */}
        <div
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-10 hover:bg-blue-400/20 rounded-l-xl select-none"
          onMouseDown={e => handleEdgeDrag(e, 'left')}
        />
        {/* Right resize handle */}
        <div
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize z-10 hover:bg-blue-400/20 rounded-r-xl select-none"
          onMouseDown={e => handleEdgeDrag(e, 'right')}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-indigo-500 flex-shrink-0" />
            <span
              ref={filenameRef}
              id="doc-preview-title"
              className="text-sm font-semibold text-ink truncate"
              title={filenameTruncated ? filename : undefined}
            >
              {filename}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {entityName && (
              <span
                ref={entityRef}
                title={entityTruncated ? entityName : undefined}
                className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5 max-w-[180px] truncate"
              >
                {entityName}
              </span>
            )}
            <button
              onClick={() => { onOpenInPane(docPath); onClose(); }}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors whitespace-nowrap flex-shrink-0"
            >
              <ExternalLink size={12} />
              Open in pane
            </button>
            <button
              aria-label="Close preview"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:bg-surface-2 hover:text-ink-2 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {html === null && !error && (
            <div className="flex items-center justify-center py-16 text-mute">
              <Loader2 role="status" aria-label="Loading document" size={20} className="animate-spin" />
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center py-16 text-sm text-mute">
              Could not load document.
            </div>
          )}
          {html !== null && !error && (
            <div
              className="markdown-editor"
              onClick={handleBodyClick}
              dangerouslySetInnerHTML={{ __html: `<div class="ProseMirror">${html}</div>` }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
