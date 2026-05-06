"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, Loader2, X } from "lucide-react";
import DOMPurify from "dompurify";
import { markdownToHtml } from "../../document/extensions/markdownSerializer";
import { useFocusTrap } from "../../../shared/hooks/useFocusTrap";

// ─── Public type contract ────────────────────────────────────────────
//
// MVP-2b widens this modal from "document only" to a 4-way type-aware
// preview surface. The runtime data layer still emits document items
// only — the diagram/svg/tab branches exist so the UI contract is ready
// for the data layer to widen in subsequent MVPs.

export type PreviewItemType = "document" | "diagram" | "svg" | "tab";

export interface PreviewItem {
  type: PreviewItemType;
  filename: string;
  /** Optional override for the header label and rail label. Falls back to filename. */
  title?: string;
  /** Optional badge shown next to the header title (e.g. owning entity name). */
  entityName?: string;
}

interface AttachmentPreviewModalProps {
  open: boolean;
  items: PreviewItem[];
  /** Filename to start on. Defaults to items[0]. Ignored if not in items. */
  initialFilename?: string;
  onClose: () => void;
  /**
   * Forwarded when "Open in pane" is clicked OR a wiki-link inside the
   * document body is clicked. The modal closes itself before forwarding
   * (so the host doesn't need to clear preview state and route in two
   * places).
   *
   * Anchor is the `data-wiki-section` value or `null` when absent.
   */
  onOpenInPane: (filename: string, anchor: string | null) => void;
  readDocument: (path: string) => Promise<string | null>;
  /**
   * Optional. When supplied, wiki-link clicks inside a document body
   * resolve `linkPath` against the previewed file's directory. The
   * resolver mirrors the editor's wikiLinkParser; defaulting to
   * identity keeps the modal renderable in tests that don't care.
   */
  resolveWikiLinkPath?: (linkPath: string, currentDocDir: string) => string;
}

// ─── DOMPurify config — wiki-link identity must survive sanitize ─────
//
// Ported verbatim from the former DocPreviewModal. Default DOMPurify
// strips `data-*` attributes, which would erase `data-wiki-link` /
// `data-wiki-section` and silently break both the wiki-link visual pill
// and the click-to-open delegation in DocumentBody. Keep this config
// in lock-step with `markdownSerializer.markdownToHtml`'s emitted shape.
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
  ALLOWED_ATTR: [
    "href", "src", "alt", "title", "class", "align",
    "data-wiki-link", "data-wiki-section",
  ],
  ALLOW_DATA_ATTR: false,
};

const TYPE_GROUP_ORDER: PreviewItemType[] = [
  "document",
  "diagram",
  "svg",
  "tab",
];

const MIN_WIDTH = 480;
const DEFAULT_WIDTH = 680;

export function AttachmentPreviewModal({
  open,
  items,
  initialFilename,
  onClose,
  onOpenInPane,
  readDocument,
  resolveWikiLinkPath,
}: AttachmentPreviewModalProps) {
  // Active item lives in component state. Initialised from
  // `initialFilename` if it matches an item, otherwise the first item.
  const [active, setActive] = useState<PreviewItem | null>(() =>
    items.length === 0
      ? null
      : items.find((it) => it.filename === initialFilename) ?? items[0],
  );
  // Resync when items or initialFilename change OR the active item is
  // no longer in the list (e.g. detached while the modal was open).
  useEffect(() => {
    if (items.length === 0) {
      setActive(null);
      return;
    }
    if (!active || !items.some((it) => it.filename === active.filename)) {
      setActive(
        items.find((it) => it.filename === initialFilename) ?? items[0],
      );
    }
  }, [items, initialFilename, active]);

  // Resizable shell (KB-031 parity with the legacy DocPreviewModal).
  const [modalWidth, setModalWidth] = useState(DEFAULT_WIDTH);
  const modalWidthRef = useRef(DEFAULT_WIDTH);
  useEffect(() => {
    modalWidthRef.current = modalWidth;
  }, [modalWidth]);

  const handleEdgeDrag = useCallback(
    (e: React.MouseEvent, edge: "left" | "right") => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = modalWidthRef.current;

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        const next =
          edge === "right" ? startWidth + delta * 2 : startWidth - delta * 2;
        setModalWidth(
          Math.max(
            MIN_WIDTH,
            Math.min(Math.floor(window.innerWidth * 0.9), next),
          ),
        );
      };
      const onMouseUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [],
  );

  // Focus trap + Escape close (preserved from DocPreviewModal/KB-031).
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open, { onEscape: onClose });

  if (!open || items.length === 0 || !active) return null;

  const headerLabel = active.title ?? active.filename;
  const showRail = items.length > 1;

  const modal = (
    <div
      data-testid="attachment-modal"
      className="fixed inset-0 z-[9999]"
      role="presentation"
    >
      {/* Backdrop — clicking it closes the modal. createPortal renders
          the whole tree at document.body so ancestor `filter` /
          `transform` (e.g. the canvas's `blur-sm` while previewing)
          cannot scope us. */}
      <div
        data-testid="attachment-modal-backdrop"
        className="absolute inset-0 bg-slate-900/40"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attachment-preview-title"
        style={{
          width: modalWidth,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
        className="absolute bg-surface rounded-xl shadow-2xl max-h-[78vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Edge resize handles. Both edges are draggable (mirroring
            DocPreviewModal); width clamps to [MIN_WIDTH, 90vw]. */}
        <div
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize z-10 hover:bg-blue-400/20 rounded-l-xl select-none"
          onMouseDown={(e) => handleEdgeDrag(e, "left")}
        />
        <div
          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize z-10 hover:bg-blue-400/20 rounded-r-xl select-none"
          onMouseDown={(e) => handleEdgeDrag(e, "right")}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface-2 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText size={16} className="text-indigo-500 flex-shrink-0" />
            <span
              id="attachment-preview-title"
              className="text-sm font-semibold text-ink truncate"
            >
              {headerLabel}
            </span>
            <span className="text-[10px] uppercase text-mute px-1.5 py-0.5 bg-surface-2 rounded border border-line">
              read only
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            {active.entityName && (
              <span
                title={active.entityName}
                className="text-[11px] font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2.5 py-0.5 max-w-[180px] truncate"
              >
                {active.entityName}
              </span>
            )}
            <button
              type="button"
              data-testid="attachment-modal-open-in-pane"
              onClick={() => {
                onOpenInPane(active.filename, null);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-md transition-colors whitespace-nowrap flex-shrink-0"
            >
              <ExternalLink size={12} />
              Open in pane
            </button>
            <button
              type="button"
              data-testid="attachment-modal-close"
              aria-label="Close preview"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-mute hover:bg-surface-2 hover:text-ink-2 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body — optional left rail (multi-item case) + dispatcher */}
        <div className="flex flex-1 min-h-0">
          {showRail && (
            <aside
              data-testid="attachment-rail"
              className="w-56 border-r border-line overflow-y-auto bg-surface-2 flex-shrink-0"
            >
              {TYPE_GROUP_ORDER.map((type) => {
                const group = items.filter((i) => i.type === type);
                if (group.length === 0) return null;
                return (
                  <div
                    key={type}
                    data-testid={`attachment-rail-group-${type}`}
                    className="py-1"
                  >
                    <h4 className="px-3 py-1 text-[10px] uppercase text-mute tracking-wide font-semibold">
                      {`${type}s`}
                    </h4>
                    {group.map((it) => {
                      const isActive = active.filename === it.filename;
                      return (
                        <button
                          key={it.filename}
                          type="button"
                          data-testid={`attachment-rail-item-${it.filename}`}
                          onClick={() => setActive(it)}
                          className={
                            "w-full text-left px-3 py-1 text-xs truncate " +
                            (isActive
                              ? "bg-accent-soft text-accent"
                              : "text-ink-2 hover:bg-surface")
                          }
                          title={it.title ?? it.filename}
                        >
                          {it.title ?? it.filename}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </aside>
          )}
          <div className="flex-1 overflow-y-auto min-w-0">
            <BodyDispatcher
              item={active}
              readDocument={readDocument}
              resolveWikiLinkPath={resolveWikiLinkPath}
              onOpenInPane={(filename, anchor) => {
                onOpenInPane(filename, anchor);
                onClose();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ─── Body dispatcher ─────────────────────────────────────────────────
//
// MVP-2b only renders real content for `type === 'document'`. The other
// three branches show a placeholder explaining the user should "Open in
// pane" to view the asset. The placeholder branches are tested with
// synthetic PreviewItems; in production, the data flow only ever emits
// document items today.

interface BodyDispatcherProps {
  item: PreviewItem;
  readDocument: AttachmentPreviewModalProps["readDocument"];
  resolveWikiLinkPath: AttachmentPreviewModalProps["resolveWikiLinkPath"];
  onOpenInPane: AttachmentPreviewModalProps["onOpenInPane"];
}

function BodyDispatcher({
  item,
  readDocument,
  resolveWikiLinkPath,
  onOpenInPane,
}: BodyDispatcherProps) {
  switch (item.type) {
    case "document":
      return (
        <DocumentBody
          filename={item.filename}
          readDocument={readDocument}
          resolveWikiLinkPath={resolveWikiLinkPath}
          onOpenInPane={onOpenInPane}
        />
      );
    case "diagram":
    case "svg":
    case "tab":
      return (
        <div
          data-testid={`attachment-body-placeholder-${item.type}`}
          className="flex items-center justify-center py-16 px-6 text-sm text-mute italic text-center"
        >
          Preview not yet implemented for {item.type} attachments — use
          &nbsp;<span className="not-italic font-medium">Open in pane</span>
          &nbsp;to view.
        </div>
      );
  }
}

// ─── Document body ───────────────────────────────────────────────────
//
// Reads the markdown via readDocument, runs it through
// markdownToHtml + DOMPurify (with the data-attribute allowlist that
// keeps wiki-link identity intact), and renders into the
// `.markdown-editor .ProseMirror` wrapper so prose.css's wiki-link pill
// rule (which is scoped under `.markdown-editor`) applies. Wiki-link
// clicks are delegated from the wrapper.

interface DocumentBodyProps {
  filename: string;
  readDocument: AttachmentPreviewModalProps["readDocument"];
  resolveWikiLinkPath: AttachmentPreviewModalProps["resolveWikiLinkPath"];
  onOpenInPane: AttachmentPreviewModalProps["onOpenInPane"];
}

function DocumentBody({
  filename,
  readDocument,
  resolveWikiLinkPath,
  onOpenInPane,
}: DocumentBodyProps) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(false);
    readDocument(filename)
      .then((raw) => {
        if (cancelled) return;
        if (raw === null) {
          setError(true);
          return;
        }
        setHtml(
          DOMPurify.sanitize(markdownToHtml(raw), SANITIZE_CONFIG) as string,
        );
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filename, readDocument]);

  // Wiki-link delegation. Body HTML is `dangerouslySetInnerHTML`'d so
  // there is no React tree on the spans — `closest("[data-wiki-link]")`
  // walks from the click target to the wiki-link span (handles clicks on
  // inner text/icon nodes too). Resolves against the previewed doc's
  // directory using the host-supplied resolver so the modal stays
  // dependency-light.
  const currentDocDir = useMemo(
    () => filename.split("/").slice(0, -1).join("/"),
    [filename],
  );
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
      const anchor = target.getAttribute("data-wiki-section") || null;
      const resolved = resolveWikiLinkPath
        ? resolveWikiLinkPath(linkPath, currentDocDir)
        : linkPath;
      onOpenInPane(resolved, anchor);
    },
    [currentDocDir, resolveWikiLinkPath, onOpenInPane],
  );

  if (html === null && !error) {
    return (
      <div className="flex items-center justify-center py-16 text-mute">
        <Loader2
          role="status"
          aria-label="Loading document"
          size={20}
          className="animate-spin"
        />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-mute">
        Could not load document.
      </div>
    );
  }
  return (
    <div
      data-testid="attachment-body-document"
      className="markdown-editor"
      onClick={handleBodyClick}
      dangerouslySetInnerHTML={{
        __html: `<div class="ProseMirror">${html}</div>`,
      }}
    />
  );
}
