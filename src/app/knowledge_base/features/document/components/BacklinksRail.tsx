"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useRepositories } from "../../../shell/RepositoryContext";
import { resolveWikiLinkPath } from "../utils/wikiLinkParser";
import { readOrNull } from "../../../domain/repositoryHelpers";

/**
 * Inline Backlinks rail (DOC-4.18). Renders inside MarkdownPane below the
 * editor content (scrolls with the document). For each `[[currentFile]]`
 * occurrence in a source doc, shows the source filename + a 2-line context
 * snippet of the surrounding text.
 *
 * The rail is always live (not gated to read or edit mode) — backlinks are
 * content-equivalent and meaningful in both. It hides itself when there
 * are zero backlinks.
 */

export interface BacklinksRailProps {
  /** Path of the document we're viewing — the target of the backlinks. */
  filePath: string;
  /** Backlink entries (sourcePath + optional section) from the link index. */
  backlinks: { sourcePath: string; section?: string }[];
  /** Open the source document on click. */
  onNavigate?: (sourcePath: string) => void;
}

interface BacklinkContext {
  sourcePath: string;
  /** Plain-text snippet centered around the wiki-link occurrence. */
  snippet: string;
  /** Whether we successfully resolved a real `[[currentFile]]` match in
   *  the source. False means the source couldn't be read or parsed and we
   *  fall back to "(referenced here)" placeholder text. */
  resolved: boolean;
}

const SNIPPET_PAD = 80;

function getDocDir(docPath: string): string {
  return docPath.includes("/")
    ? docPath.substring(0, docPath.lastIndexOf("/"))
    : "";
}

/**
 * Extract a 2-line context snippet from `sourceContent` around the first
 * `[[…]]` link that resolves to `targetPath`. Returns `null` when no such
 * occurrence is found (e.g. index is stale or path resolution differs).
 */
function extractSnippet(
  sourceContent: string,
  sourcePath: string,
  targetPath: string,
): string | null {
  const sourceDir = getDocDir(sourcePath);
  const re = /\[\[([^\]]+?)\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sourceContent)) !== null) {
    const inner = match[1];
    const [pathAndSection] = inner.split("|").map((s) => s.trim());
    const [linkPath] = pathAndSection.split("#").map((s) => s.trim());
    if (!linkPath) continue;
    const resolved = resolveWikiLinkPath(linkPath, sourceDir);
    if (resolved !== targetPath) continue;

    // Build a window of ~80 chars before / after the link. We slice on the
    // raw markdown then strip basic markup so the rendered snippet looks
    // like prose.
    const start = Math.max(0, match.index - SNIPPET_PAD);
    const end = Math.min(sourceContent.length, match.index + match[0].length + SNIPPET_PAD);
    let window = sourceContent.slice(start, end);
    // Replace the matched wiki-link with its display text so the snippet
    // reads naturally without raw `[[…]]` syntax.
    const displayText = inner.includes("|")
      ? inner.split("|")[1].trim()
      : linkPath;
    window = window
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p, alias) => alias || p)
      .replace(/^#+\s+/gm, "")
      .replace(/[*_~`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (start > 0) window = `…${window}`;
    if (end < sourceContent.length) window = `${window}…`;
    // Fallback if cleanup ate everything.
    return window || `…${displayText}…`;
  }
  return null;
}

export default function BacklinksRail({
  filePath,
  backlinks,
  onNavigate,
}: BacklinksRailProps) {
  const { document: documentRepo } = useRepositories();
  const [contexts, setContexts] = useState<BacklinkContext[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!documentRepo || backlinks.length === 0) {
      setContexts([]);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      // Deduplicate by sourcePath — multiple section anchors from the same
      // source still resolve to one rail entry; sectionLinks already share
      // the same surrounding paragraph in practice.
      const seen = new Set<string>();
      const unique: string[] = [];
      for (const bl of backlinks) {
        if (seen.has(bl.sourcePath)) continue;
        seen.add(bl.sourcePath);
        unique.push(bl.sourcePath);
      }
      const results: BacklinkContext[] = [];
      for (const sourcePath of unique) {
        const content = await readOrNull(() => documentRepo.read(sourcePath));
        if (cancelled) return;
        if (content == null) {
          results.push({ sourcePath, snippet: "(source unavailable)", resolved: false });
          continue;
        }
        const snippet = extractSnippet(content, sourcePath, filePath);
        if (snippet) {
          results.push({ sourcePath, snippet, resolved: true });
        } else {
          results.push({ sourcePath, snippet: "(referenced here)", resolved: false });
        }
      }
      if (!cancelled) setContexts(results);
    })().catch(() => {
      // Errors fall back to an empty list — backlinks rail is best-effort UI,
      // not a critical surface, and the shell error banner is already wired
      // for the document repo's classified throws.
    });
    return () => {
      cancelled = true;
    };
  }, [documentRepo, filePath, backlinks]);

  if (backlinks.length === 0) return null;

  return (
    <section
      data-testid="backlinks-rail"
      className="mt-12 px-10 pb-10 max-w-[80ch] mx-auto"
      aria-label="Backlinks"
    >
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        Backlinks · {contexts.length || backlinks.length} reference{(contexts.length || backlinks.length) === 1 ? "" : "s"}
      </h2>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {(contexts.length > 0 ? contexts : backlinks.map((b) => ({
          sourcePath: b.sourcePath,
          snippet: "Loading…",
          resolved: false,
        }))).map((entry, i) => (
          <li key={`${entry.sourcePath}-${i}`} className="py-3">
            <button
              type="button"
              onClick={() => onNavigate?.(entry.sourcePath)}
              className="group w-full text-left"
              data-testid="backlinks-rail-entry"
            >
              <div className="flex items-center gap-1.5 text-sm font-medium text-blue-700 group-hover:underline">
                <ArrowLeft size={12} className="flex-shrink-0 text-slate-400" />
                <span className="truncate">{entry.sourcePath}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                {entry.snippet}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
