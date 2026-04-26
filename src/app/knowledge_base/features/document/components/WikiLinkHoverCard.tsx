"use client";

// TODO(a11y): keyboard activation (Enter on focused wiki-link) deferred — currently mouse-hover only.

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRepositories } from "../../../shell/RepositoryContext";
import { getFirstHeading } from "../utils/getFirstHeading";
import { readOrNull } from "../../../domain/repositoryHelpers";

/**
 * Floating card that previews the target of a `[[wiki-link]]` on hover.
 *
 * Spec — DOC-4.17:
 *   - Anchored below the link, positioned via `getBoundingClientRect()`.
 *   - Width 280–320px, white bg, rounded-lg, shadow-lg, border slate-200.
 *   - Body: target's first heading (or filename), ~200-char excerpt, footer
 *     line with backlink count + size in KB.
 *   - Visibility is driven by the parent (MarkdownEditor) — broken links and
 *     timing are decided there; this component only renders when given an
 *     anchor + a resolved target path.
 */

export interface WikiLinkHoverCardProps {
  /** DOM rect of the link the card is anchored to. */
  anchor: DOMRect;
  /** Vault-relative resolved path of the target document (always exists). */
  resolvedPath: string;
  /** Backlink count for the target. */
  backlinkCount: number;
  /** Called when the mouse leaves both the link and the card (with overshoot
   *  tolerance handled by the parent). The parent owns the dismiss logic. */
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const CARD_WIDTH = 300;
const CARD_OFFSET = 8;

interface PreviewData {
  heading: string;
  excerpt: string;
  sizeBytes: number;
}

function buildPreview(content: string, resolvedPath: string): PreviewData {
  const heading = getFirstHeading(content) || resolvedPath.split("/").pop()?.replace(/\.md$/, "") || resolvedPath;

  // Strip YAML frontmatter, then extract first ~200 chars of plain text.
  let body = content;
  const lines = body.split("\n");
  if (lines[0]?.trim() === "---") {
    let end = 1;
    while (end < lines.length && lines[end].trim() !== "---") end++;
    body = lines.slice(end + 1).join("\n");
  }
  // Drop the first H1 if it matches the heading we already show.
  body = body.replace(/^#\s+.+\n+/, "");
  // Strip basic markdown syntax for a cleaner excerpt.
  const plain = body
    .replace(/^#+\s+/gm, "") // headings
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, alias) => alias || p) // wiki-links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // markdown links
    .replace(/[*_~`]/g, "") // emphasis / code marks
    .replace(/^>\s+/gm, "") // blockquotes
    .replace(/^[-*+]\s+/gm, "") // list markers
    .replace(/\s+/g, " ")
    .trim();

  const excerpt = plain.length > 200 ? `${plain.slice(0, 200).trim()}…` : plain;
  // Approximate size — full markdown content length in bytes (UTF-8 close enough
  // for an indicator).
  const sizeBytes = new Blob([content]).size;
  return { heading, excerpt, sizeBytes };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function WikiLinkHoverCard({
  anchor,
  resolvedPath,
  backlinkCount,
  onMouseEnter,
  onMouseLeave,
}: WikiLinkHoverCardProps) {
  const { document: documentRepo } = useRepositories();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setPreview(null);
    if (!documentRepo) return;
    (async () => {
      const content = await readOrNull(() => documentRepo.read(resolvedPath));
      if (cancelledRef.current) return;
      if (content == null) {
        setPreview(null);
        return;
      }
      setPreview(buildPreview(content, resolvedPath));
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [documentRepo, resolvedPath]);

  // Position below the link; clamp horizontally so the card stays inside the
  // viewport. Vertical clamping flips above the link if there's not enough
  // room below.
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - CARD_WIDTH - 8));
  const spaceBelow = window.innerHeight - anchor.bottom;
  const above = spaceBelow < 180;
  const top = above ? Math.max(8, anchor.top - CARD_OFFSET - 160) : anchor.bottom + CARD_OFFSET;

  const fileName = resolvedPath.split("/").pop() ?? resolvedPath;
  const headingText = preview?.heading ?? fileName.replace(/\.md$/, "");
  const sizeText = preview ? formatSize(preview.sizeBytes) : null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      id="wiki-link-hover-card"
      data-testid="wiki-link-hover-card"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-slate-200 p-3 pointer-events-auto"
      style={{ top, left, width: CARD_WIDTH }}
      role="tooltip"
    >
      <div className="text-xs font-semibold text-slate-800 truncate" title={resolvedPath}>
        {headingText}
      </div>
      <div className="mt-1 text-[11px] leading-snug text-slate-600 line-clamp-4 min-h-[2.5em]">
        {preview ? (
          preview.excerpt || <span className="italic text-slate-400">(empty document)</span>
        ) : (
          <span className="italic text-slate-400">Loading preview…</span>
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between">
        <span>
          {backlinkCount} backlink{backlinkCount === 1 ? "" : "s"}
        </span>
        {sizeText && <span>{sizeText}</span>}
      </div>
    </div>,
    document.body,
  );
}
