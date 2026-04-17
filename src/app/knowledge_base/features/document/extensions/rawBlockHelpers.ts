/**
 * Pure string-parsing helpers that back the editor-coupled `rawBlock` logic
 * in `MarkdownEditor.tsx`. Extracting them lets us unit-test the regex / set
 * construction without a live Tiptap editor; the editor-bound wrappers
 * (`getRawHeadingLevel`, `isRawBlockquote`, `getActiveRawFormats`) thread
 * through here after locating the enclosing rawBlock node.
 */
import { SYNTAX_PATTERNS } from "./markdownReveal";

/** Markdown tag → format name used by the toolbar's active-state logic. */
export const TAG_TO_FORMAT: Readonly<Record<string, string>> = {
  strong: "bold",
  em: "italic",
  s: "strike",
  code: "code",
};

/**
 * Given the full text of a rawBlock, return the heading level (1–6) when the
 * text starts with `#{1,6}\s`, otherwise `null`.
 *
 * Examples:
 *   parseHeadingPrefix("# Hello")      → 1
 *   parseHeadingPrefix("### Deep")     → 3
 *   parseHeadingPrefix("####### Too")  → null  (7 # is not valid)
 *   parseHeadingPrefix("no prefix")    → null
 */
export function parseHeadingPrefix(text: string): number | null {
  const match = text.match(/^(#{1,6})\s/);
  return match ? match[1].length : null;
}

/**
 * `true` when the text starts with a literal `> ` blockquote prefix.
 * Matches the raw-markdown convention (not stripped whitespace).
 */
export function hasBlockquotePrefix(text: string): boolean {
  return text.startsWith("> ");
}

/**
 * Given a single text-node's content and a cursor offset within it, return
 * the set of format names (bold / italic / strike / code) whose SYNTAX
 * match range covers that cursor offset.
 *
 * Mirrors the skip-overlap dedup logic in markdownReveal's
 * `pushSyntaxDecorations` so genuinely nested decorations (e.g. `<em>`
 * inside `<strong>`) both count, while the bold pattern is prevented from
 * double-firing inside triple-asterisk matches.
 */
export function computeActiveRawFormatsAt(
  childText: string,
  cursorOffset: number,
): Set<string> {
  const active = new Set<string>();
  const consumed: Array<[number, number, string[]]> = [];
  const shouldSkip = (s: number, e: number, t: string[]) =>
    consumed.some(
      ([cs, ce, ct]) =>
        s >= cs && e <= ce && t.every((v) => ct.includes(v)),
    );

  for (const { re, tags } of SYNTAX_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(childText)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (shouldSkip(start, end, tags)) continue;
      consumed.push([start, end, tags]);
      if (cursorOffset >= start && cursorOffset <= end) {
        for (const tag of tags) {
          const fmt = TAG_TO_FORMAT[tag];
          if (fmt) active.add(fmt);
        }
      }
    }
  }

  return active;
}
