/**
 * Live markdown-syntax decoration builders that back the Typora-style
 * "reveal syntax while editing" behaviour of the `MarkdownReveal` Extension.
 *
 * `SYNTAX_PATTERNS` is the regex set shared with the toolbar's raw-syntax
 * engine so both active-state detection and visual decorations agree on
 * what counts as bold / italic / strike / inline-code.
 *
 * `code: true` on the rawBlock node blocks input rules from converting
 * `**x**` into a bold mark, so the user sees the asterisks while typing.
 * But until the cursor leaves the block we'd otherwise show plain text and
 * only reveal the styling on exit. To get an "as-soon-as-syntax-completes"
 * feel, we scan the rawBlock's text on every doc change and add inline
 * decorations that wrap matched ranges in `<strong>/<em>/<s>/<code>`.
 * Decorations are pure visual — they don't mutate the doc, don't trigger
 * transactions, and use the editor's existing mark CSS for free.
 */

import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

// Triple-asterisk first so `***x***` gets BOTH bold and italic; the longer
// match takes precedence and the bold/italic single passes skip overlaps.
//
// Bold uses `(?:[^*\n]|\*(?!\*))+?` instead of `[^*\n]+?` so that single
// `*` chars (italic markers) inside bold are allowed. The negative lookahead
// `\*(?!\*)` ensures the match still stops at `**` (the closing delimiter).
export const SYNTAX_PATTERNS: Array<{ re: RegExp; tags: string[] }> = [
  { re: /\*\*\*((?:[^*\n]|\*(?!\*))+?)\*\*\*/g, tags: ["strong", "em"] },
  { re: /\*\*((?:[^*\n]|\*(?!\*))+?)\*\*/g, tags: ["strong"] },
  // Italic single `*`: lookbehind/ahead avoid catching the inner `*` of `**`.
  { re: /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, tags: ["em"] },
  { re: /~~((?:[^~\n]|~(?!~))+?)~~/g, tags: ["s"] },
  { re: /`([^`\n]+?)`/g, tags: ["code"] },
];

function pushSyntaxDecorations(
  text: string,
  basePos: number,
  out: Decoration[],
) {
  // `consumed` tracks [start, end, tags] for each match. A new match is
  // skipped only if it's fully inside an earlier match AND all of its tags
  // are already provided by that earlier match. This allows genuinely nested
  // decorations (e.g. `<em>` inside `<strong>`) while still preventing the
  // bold pattern from re-matching inside a triple-asterisk match (whose tags
  // already include "strong").
  const consumed: Array<[number, number, string[]]> = [];
  const shouldSkip = (s: number, e: number, tags: string[]) =>
    consumed.some(
      ([cs, ce, ct]) =>
        s >= cs && e <= ce && tags.every((t) => ct.includes(t)),
    );

  for (const { re, tags } of SYNTAX_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (shouldSkip(start, end, tags)) continue;
      consumed.push([start, end, tags]);
      for (const tag of tags) {
        out.push(
          Decoration.inline(basePos + start, basePos + end, { nodeName: tag }),
        );
      }
    }
  }
}

export function buildSyntaxDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "rawBlock") return true;
    // Walk direct children of the rawBlock and run syntax matchers per text
    // node. `relPos` tracks position relative to the rawBlock's content; the
    // absolute doc position is `pos + 1 + relPos` (the +1 enters the
    // rawBlock).
    let relPos = 0;
    node.forEach((child) => {
      if (child.isText && child.text != null) {
        pushSyntaxDecorations(child.text, pos + 1 + relPos, decorations);
      }
      relPos += child.nodeSize;
    });
    return false;
  });
  return DecorationSet.create(doc, decorations);
}
