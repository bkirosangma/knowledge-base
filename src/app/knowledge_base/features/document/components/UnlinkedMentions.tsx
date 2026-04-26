"use client";

/**
 * UnlinkedMentions — sidebar section in `DocumentProperties` that lists
 * tokens in the current document body matching another vault file's
 * basename but not yet wrapped in `[[...]]`.
 *
 * "Convert all" performs a markdown-level mask-and-replace via
 * `convertMention` (see `unlinkedMentions.ts`); the result is fed to
 * `onConvert(newContent)` which is wired upstream to `updateContent`
 * + `history.onContentChange` so the dirty / save / undo plumbing all
 * fire normally.
 *
 * Phase 3 PR 2 (2026-04-26).
 */

import React, { useMemo } from "react";
import { Wand2 } from "lucide-react";
import {
  detectUnlinkedMentions,
  convertMention,
} from "../utils/unlinkedMentions";

interface UnlinkedMentionsProps {
  content: string;
  /** All vault file paths (.md / .json). */
  allFilePaths: string[];
  /** Currently open document's path — excluded from candidates. */
  currentPath: string | null;
  /** Apply the new content to the editor. Caller wires history + dirty. */
  onConvert?: (newContent: string) => void;
  /** Read-only mode hides the action button. */
  readOnly?: boolean;
}

export default function UnlinkedMentions({
  content,
  allFilePaths,
  currentPath,
  onConvert,
  readOnly,
}: UnlinkedMentionsProps) {
  const mentions = useMemo(
    () => detectUnlinkedMentions({ content, allFilePaths, currentPath }),
    [content, allFilePaths, currentPath],
  );

  const handleConvert = (token: string, targetBasename: string) => {
    if (!onConvert) return;
    const next = convertMention(content, token, targetBasename);
    if (next !== content) onConvert(next);
  };

  return (
    <div className="px-4 py-3 border-b border-slate-100" data-testid="unlinked-mentions">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        Unlinked mentions ({mentions.length})
      </div>
      {mentions.length === 0 ? (
        <div className="text-xs text-slate-400">No unlinked mentions</div>
      ) : (
        <ul className="space-y-1 m-0 p-0 list-none">
          {mentions.map((m) => (
            <li
              key={m.token}
              data-testid="unlinked-mention-row"
              data-token={m.token}
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className="font-mono text-ink-2 truncate"
                  title={`Token: ${m.token}`}
                >
                  {m.token}
                </span>
                <span className="text-mute flex-shrink-0">
                  ×{m.count}
                </span>
                <span className="text-mute truncate flex-1" title={m.targetPath}>
                  → {m.targetBasename}
                </span>
                {!readOnly && onConvert && (
                  <button
                    type="button"
                    onClick={() => handleConvert(m.token, m.targetBasename)}
                    className="flex-shrink-0 p-1 rounded text-mute hover:text-ink-2 hover:bg-surface-2 transition-colors"
                    title={`Convert all "${m.token}" → [[${m.targetBasename}]]`}
                    aria-label={`Convert all occurrences of ${m.token} to a wiki link`}
                    data-testid="unlinked-mention-convert"
                  >
                    <Wand2 size={12} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
