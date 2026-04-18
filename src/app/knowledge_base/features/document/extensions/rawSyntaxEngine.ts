/**
 * Editor-coupled raw-syntax helpers that sit between Tiptap commands and the
 * rawBlock node introduced by `markdownReveal`. These functions live here
 * rather than inside the editor component so they can be imported by any
 * toolbar or keybinding that needs to operate on rawBlock text directly.
 *
 * See `rawBlockHelpers.ts` for the pure string-level helpers that back a
 * few of these (parseHeadingPrefix, computeActiveRawFormatsAt, …).
 */

import type { useEditor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { SYNTAX_PATTERNS, rawBlockToRichNodes } from "./markdownReveal";
import {
  parseHeadingPrefix,
  hasBlockquotePrefix,
  computeActiveRawFormatsAt,
} from "./rawBlockHelpers";

/** Count consecutive occurrences of `ch` immediately before/after `pos`. */
function countConsecutiveChar(
  doc: { textBetween(from: number, to: number): string },
  pos: number,
  ch: string,
  direction: "before" | "after",
  limit: number,
): number {
  let count = 0;
  let p = direction === "before" ? pos - 1 : pos;
  const step = direction === "before" ? -1 : 1;
  const inBounds =
    direction === "before" ? (v: number) => v >= limit : (v: number) => v < limit;
  while (inBounds(p)) {
    try {
      if (doc.textBetween(p, p + 1) !== ch) break;
    } catch {
      break;
    }
    count++;
    p += step;
  }
  return count;
}

const SYNTAX_TO_TAG: Record<string, string> = {
  "**": "strong", "*": "em", "~~": "s", "`": "code",
};

/**
 * Find the innermost SYNTAX_PATTERNS match that encloses the selection range
 * and has *exactly* the target tag (not a superset like bold+italic from
 * `***`).  Returns absolute doc positions or null.
 */
function findEnclosingSyntaxRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: { doc: { resolve(pos: number): any } },
  from: number,
  to: number,
  rawDepth: number,
  syntax: string,
): { matchStart: number; matchEnd: number } | null {
  const tag = SYNTAX_TO_TAG[syntax];
  if (!tag) return null;

  const $from = state.doc.resolve(from);
  const rawNode = $from.node(rawDepth);
  const contentStart = $from.start(rawDepth);
  const relFrom = from - contentStart;
  const relTo = to - contentStart;

  // Dedup consumed ranges the same way pushSyntaxDecorations does.
  const consumed: Array<[number, number, string[]]> = [];
  const shouldSkip = (s: number, e: number, t: string[]) =>
    consumed.some(
      ([cs, ce, ct]) => s >= cs && e <= ce && t.every((v) => ct.includes(v)),
    );

  let offset = 0;
  let found: { matchStart: number; matchEnd: number } | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawNode.forEach((child: any) => {
    if (found) { offset += child.nodeSize; return; }
    if (child.isText && child.text != null) {
      const nodeStart = offset;
      for (const { re, tags } of SYNTAX_PATTERNS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(child.text)) !== null) {
          const s = nodeStart + m.index;
          const e = s + m[0].length;
          if (shouldSkip(s, e, tags)) continue;
          consumed.push([s, e, tags]);
          if (
            tags.length === 1 &&
            tags[0] === tag &&
            s < relFrom &&
            e > relTo
          ) {
            found = {
              matchStart: contentStart + s,
              matchEnd: contentStart + e,
            };
          }
        }
      }
    }
    offset += child.nodeSize;
  });

  return found;
}

/**
 * When the cursor is inside a rawBlock (live-reveal mode), Tiptap mark
 * commands like toggleBold() are rejected because rawBlock restricts marks
 * to "link" only.  Instead we insert / remove the markdown syntax characters
 * as plain text so the user sees `**word**`, `*word*`, etc.
 *
 * Uses character-counting to correctly disambiguate `*` (italic) from `**`
 * (bold) so stacking bold+italic produces `***word***` instead of clobbering.
 *
 * Returns `true` if the operation was handled (cursor was in a rawBlock),
 * `false` otherwise so the caller can fall back to the standard mark command.
 */
export function toggleRawSyntax(
  editor: ReturnType<typeof useEditor>,
  syntax: string,
): boolean {
  if (!editor) return false;
  const { state, view } = editor;
  const { selection } = state;
  const { from, to, empty } = selection;

  // Find the rawBlock ancestor (if any).
  const $from = state.doc.resolve(from);
  let rawDepth = -1;
  for (let d = $from.depth; d >= 0; d--) {
    if ($from.node(d).type.name === "rawBlock") {
      rawDepth = d;
      break;
    }
  }
  if (rawDepth < 0) return false;

  const syntaxLen = syntax.length;
  const ch = syntax[0]; // all our syntaxes use a repeated char: *, **, ~~, `
  const tr = state.tr;

  if (empty) {
    // No selection — insert paired markers and place cursor between them.
    tr.insertText(syntax + syntax, from);
    tr.setSelection(TextSelection.create(tr.doc, from + syntaxLen));
  } else {
    const selectedText = state.doc.textBetween(from, to);
    const contentStart = $from.start(rawDepth);
    const contentEnd = $from.end(rawDepth);

    const countBefore = countConsecutiveChar(state.doc, from, ch, "before", contentStart);
    const countAfter = countConsecutiveChar(state.doc, to, ch, "after", contentEnd);
    const effectiveCount = Math.min(countBefore, countAfter);

    // Determine whether this specific syntax layer is already present.
    // `*` (italic) is present when the asterisk count is odd (1 or 3).
    // `**` (bold) is present when the asterisk count is ≥ 2.
    // `~~` / `` ` `` use a simple threshold check.
    let shouldUnwrap: boolean;
    if (syntax === "*") {
      shouldUnwrap = effectiveCount % 2 === 1;
    } else {
      shouldUnwrap = effectiveCount >= syntaxLen;
    }

    if (shouldUnwrap) {
      // Unwrap — remove exactly `syntaxLen` chars from each side.
      const unwrapStart = from - syntaxLen;
      const unwrapEnd = to + syntaxLen;
      tr.insertText(selectedText, unwrapStart, unwrapEnd);
      tr.setSelection(
        TextSelection.create(tr.doc, unwrapStart, unwrapStart + selectedText.length),
      );
    } else {
      // The format might still be active from an *outer* scope (e.g. CDN
      // inherits bold from the surrounding `**Bunny ~~CDN~~ (Pull Zones)**`).
      // When that's the case, split the outer markers around the selection
      // instead of wrapping (which would just create a no-op double bold).
      const enclosing = findEnclosingSyntaxRange(state, from, to, rawDepth, syntax);
      if (enclosing) {
        // ── Split the outer syntax around the selection ──
        const { matchStart, matchEnd } = enclosing;
        const innerStart = matchStart + syntaxLen;
        const innerEnd = matchEnd - syntaxLen;
        const inner = state.doc.textBetween(innerStart, innerEnd);
        const selLocalFrom = from - innerStart;
        const selLocalTo = to - innerStart;

        const before = inner.slice(0, selLocalFrom);
        const after = inner.slice(selLocalTo);

        // Separate text content from adjacent syntax markers (~~, **, etc.)
        // so the re-wrapped bold closes/opens outside those markers.
        const trailSyn = before.match(/([*~`]+)$/);
        const leadSyn = after.match(/^([*~`]+)/);
        const beforeText = trailSyn ? before.slice(0, -trailSyn[0].length) : before;
        const beforeMarkers = trailSyn ? trailSyn[0] : "";
        const afterMarkers = leadSyn ? leadSyn[0] : "";
        const afterText = leadSyn ? after.slice(leadSyn[0].length) : after;

        // Re-wrap the before / after text, moving whitespace outside the
        // delimiters so they satisfy CommonMark flanking rules.
        const wrapSide = (text: string, side: "before" | "after"): string => {
          if (!text) return "";
          if (side === "before") {
            const trimmed = text.replace(/ +$/, "");
            const ws = text.slice(trimmed.length);
            return trimmed ? syntax + trimmed + syntax + ws : ws;
          }
          const trimmed = text.replace(/^ +/, "");
          const ws = text.slice(0, text.length - trimmed.length);
          return trimmed ? ws + syntax + trimmed + syntax : ws;
        };

        const newContent =
          wrapSide(beforeText, "before") +
          beforeMarkers +
          selectedText +
          afterMarkers +
          wrapSide(afterText, "after");

        tr.insertText(newContent, matchStart, matchEnd);
        const newSelStart =
          matchStart +
          wrapSide(beforeText, "before").length +
          beforeMarkers.length;
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            newSelStart,
            newSelStart + selectedText.length,
          ),
        );
      } else {
        // Wrap — insert syntax characters around the selection.
        const wrapped = syntax + selectedText + syntax;
        tr.insertText(wrapped, from, to);
        tr.setSelection(
          TextSelection.create(tr.doc, from + syntaxLen, from + syntaxLen + selectedText.length),
        );
      }
    }
  }

  view.dispatch(tr);
  return true;
}

/**
 * When the cursor is inside a rawBlock, Tiptap's `editor.isActive("bold")`
 * always returns false (rawBlock only allows "link" marks). This function
 * runs the same SYNTAX_PATTERNS used for live decorations and returns the
 * set of format names whose regex match covers the cursor position.
 *
 * Returns `null` when the cursor is NOT inside a rawBlock (caller should
 * fall back to `editor.isActive`).
 */
export function getActiveRawFormats(
  editor: ReturnType<typeof useEditor>,
): Set<string> | null {
  if (!editor) return null;
  const { state } = editor;
  const $head = state.selection.$head;

  let rawDepth = -1;
  for (let d = $head.depth; d >= 0; d--) {
    if ($head.node(d).type.name === "rawBlock") {
      rawDepth = d;
      break;
    }
  }
  if (rawDepth < 0) return null;

  const rawNode = $head.node(rawDepth);
  const contentStart = $head.start(rawDepth);
  const cursorPos = $head.pos;
  const active = new Set<string>();

  // Walk text children until we find the one containing the cursor; delegate
  // the regex + dedup to the pure `computeActiveRawFormatsAt` helper.
  let offset = 0;
  rawNode.forEach((child) => {
    if (child.isText && child.text != null) {
      const nodeStart = contentStart + offset;
      const nodeEnd = nodeStart + child.text.length;
      if (cursorPos >= nodeStart && cursorPos <= nodeEnd) {
        for (const fmt of computeActiveRawFormatsAt(child.text, cursorPos - nodeStart)) {
          active.add(fmt);
        }
      }
    }
    offset += child.nodeSize;
  });

  return active;
}

/**
 * Returns the heading level (1-6) when the cursor is inside a rawBlock whose
 * text starts with a `# ` prefix, or `null` otherwise.
 */
export function getRawHeadingLevel(
  editor: ReturnType<typeof useEditor>,
): number | null {
  if (!editor) return null;
  const { state } = editor;
  const $head = state.selection.$head;

  for (let d = $head.depth; d >= 0; d--) {
    if ($head.node(d).type.name === "rawBlock") {
      return parseHeadingPrefix($head.node(d).textContent);
    }
  }
  return null;
}

/**
 * Returns `true` when the cursor is inside a rawBlock whose text starts with
 * `> ` (blockquote), `false` for a non-blockquote rawBlock, or `null` when
 * the cursor is NOT inside a rawBlock.
 */
export function isRawBlockquote(
  editor: ReturnType<typeof useEditor>,
): boolean | null {
  if (!editor) return null;
  const { state } = editor;
  const $head = state.selection.$head;

  for (let d = $head.depth; d >= 0; d--) {
    if ($head.node(d).type.name === "rawBlock") {
      return hasBlockquotePrefix($head.node(d).textContent);
    }
  }
  return null;
}

/**
 * Toggle a block-level type (heading or blockquote) inside a rawBlock by
 * adding/removing/replacing the markdown prefix AND updating the rawBlock's
 * `originalType`/`originalLevel` attrs so the visual tag updates instantly.
 * Returns `true` if handled, `false` if not in a rawBlock.
 */
export function toggleRawBlockType(
  editor: ReturnType<typeof useEditor>,
  type: "heading" | "blockquote",
  level?: number,
): boolean {
  if (!editor) return false;
  const { state, view } = editor;
  const $head = state.selection.$head;

  let rawDepth = -1;
  for (let d = $head.depth; d >= 0; d--) {
    if ($head.node(d).type.name === "rawBlock") {
      rawDepth = d;
      break;
    }
  }
  if (rawDepth < 0) return false;

  const rawBlockPos = $head.before(rawDepth);
  const contentStart = $head.start(rawDepth);
  const text = $head.node(rawDepth).textContent;
  const tr = state.tr;

  // Detect current block-level prefix
  const hMatch = text.match(/^(#{1,6}) /);
  const isQuote = text.startsWith("> ");
  const currentPrefix = hMatch ? hMatch[0] : isQuote ? "> " : "";

  // Compute desired prefix + attrs
  let newPrefix = "";
  let newAttrs: Record<string, unknown> = {
    originalType: "paragraph",
    originalLevel: null,
  };

  if (type === "heading" && level) {
    const curLevel = hMatch ? hMatch[1].length : 0;
    if (curLevel !== level) {
      newPrefix = "#".repeat(level) + " ";
      newAttrs = { originalType: "heading", originalLevel: level };
    }
  } else if (type === "blockquote") {
    if (!isQuote) {
      newPrefix = "> ";
      newAttrs = { originalType: "blockquote", originalLevel: null };
    }
  }

  if (currentPrefix === newPrefix) return true; // already in desired state

  // Replace prefix and update attrs for instant visual change
  if (currentPrefix) {
    tr.insertText(newPrefix, contentStart, contentStart + currentPrefix.length);
  } else {
    tr.insertText(newPrefix, contentStart, contentStart);
  }
  tr.setNodeMarkup(rawBlockPos, undefined, newAttrs);
  view.dispatch(tr);
  return true;
}

/**
 * Convert the rawBlock under the cursor back to rich content. Used before
 * structural block commands (list toggles) that can't be expressed as a
 * simple prefix change. Returns `true` if a rawBlock was exited.
 */
export function forceExitRawBlock(
  editor: ReturnType<typeof useEditor>,
): boolean {
  if (!editor) return false;
  const { state, view } = editor;
  const $head = state.selection.$head;

  let rawDepth = -1;
  for (let d = $head.depth; d >= 0; d--) {
    if ($head.node(d).type.name === "rawBlock") {
      rawDepth = d;
      break;
    }
  }
  if (rawDepth < 0) return false;

  const rawBlockPos = $head.before(rawDepth);
  const rawNode = $head.node(rawDepth);
  const tr = state.tr;

  const rich = rawBlockToRichNodes(rawNode, state.schema);
  if (rich.length) {
    tr.replaceWith(rawBlockPos, rawBlockPos + rawNode.nodeSize, rich);
  } else {
    tr.replaceWith(
      rawBlockPos,
      rawBlockPos + rawNode.nodeSize,
      state.schema.nodes.paragraph.create(),
    );
  }

  try {
    tr.setSelection(TextSelection.create(tr.doc, rawBlockPos + 1));
  } catch { /* leave mapped selection */ }

  tr.setMeta("rawSwap", true);
  tr.setMeta("addToHistory", false);
  view.dispatch(tr);
  return true;
}
