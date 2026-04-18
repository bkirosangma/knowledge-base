/**
 * Helpers that back the `MarkdownReveal` Extension's ProseMirror
 * `appendTransaction`. Each handler is a pure function of state slices
 * (doc / selection / schema) so the main plugin body reads as a
 * top-to-bottom orchestration without a 240-line `if`/`else` chain.
 *
 * Two helper families live here:
 *
 * 1. **Locators** — `findRawBlock`, `findConvertibleBlockAtCursor`.
 *    Pure reads of the doc + selection, no transaction side effects.
 *
 * 2. **Transaction mutators** — `maybeSyncRawBlockType`,
 *    `maybeForceExitRawList`, `restoreRawToRich`, `convertRichToRaw`.
 *    Each either returns a new `Transaction` (the caller should dispatch
 *    it and bail) or mutates the caller's `tr` in place (the caller
 *    finalises and dispatches). Naming convention: `maybeX` returns
 *    `Transaction | null`; bare `X` mutates `tr` and returns void.
 */

import { TextSelection, type Transaction } from "@tiptap/pm/state";
import type {
  Node as ProseMirrorNode,
  ResolvedPos,
  Schema,
} from "@tiptap/pm/model";
import {
  richBlockToRawFragment,
  rawBlockToRichNodes,
} from "./markdownRevealConversion";

/** Block types that can be converted to raw editing mode. */
export const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);

/**
 * Top-level wrappers we descend into to find a deeper convertible block.
 * Lists themselves can't become a rawBlock (schema is `listItem+`), and
 * tables can't either (schema is `tableRow+`), so when the cursor is in one
 * of these wrappers we walk down to the paragraph inside the specific list
 * item or cell the cursor sits in — siblings stay rich.
 */
export const DEEP_WRAPPERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "table",
]);

/* ── Locators ─────────────────────────────────────────────────────────── */

/**
 * Walk the document to find the (single) existing rawBlock. `descendants`
 * lets us find a rawBlock at any depth, not just the top level — required
 * now that lists can host one.
 */
export function findRawBlock(
  doc: ProseMirrorNode,
): { pos: number; node: ProseMirrorNode } | null {
  let raw: { pos: number; node: ProseMirrorNode } | null = null;
  doc.descendants((node, pos) => {
    if (raw) return false;
    if (node.type.name === "rawBlock") {
      raw = { pos, node };
      return false;
    }
    return true;
  });
  return raw;
}

/**
 * Locate the convertible block under the cursor.
 *
 * Top-level paragraph/heading/blockquote → convert at depth 1, which keeps
 * blockquotes whole (with the `> ` prefix shown). Top-level list or table
 * → descend until we find the paragraph inside *this* list item or cell so
 * siblings stay rich.
 *
 * Includes a table-cell fallback: prosemirror-tables sometimes places the
 * cursor at the cell boundary rather than inside the cell's paragraph, so
 * the depth-bounded loop would miss it — walk the cell's first child in
 * that case.
 */
export function findConvertibleBlockAtCursor(
  $head: ResolvedPos,
): { pos: number; node: ProseMirrorNode } | null {
  if ($head.depth < 1) return null;

  const top = $head.node(1);
  if (CONVERTIBLE.has(top.type.name)) {
    return { pos: $head.before(1), node: top };
  }
  if (!DEEP_WRAPPERS.has(top.type.name)) return null;

  for (let d = 2; d <= $head.depth; d++) {
    const inner = $head.node(d);
    if (CONVERTIBLE.has(inner.type.name)) {
      return { pos: $head.before(d), node: inner };
    }
  }

  // Fallback for table cells: prosemirror-tables sometimes places the
  // cursor at the cell boundary rather than inside the cell's paragraph
  // (empty cell, keyboard navigation, cell selection normalization). In
  // that case `$head.depth` stops at the cell (depth 3 in
  // `doc → table → row → cell`), so the depth-bounded loop above never
  // reaches the paragraph at depth 4. Walk the cell's first child directly.
  for (let d = 2; d <= $head.depth; d++) {
    const ancestor = $head.node(d);
    if (
      ancestor.type.name === "tableCell" ||
      ancestor.type.name === "tableHeader"
    ) {
      const firstChild = ancestor.firstChild;
      if (firstChild && CONVERTIBLE.has(firstChild.type.name)) {
        // Cell content starts at $head.start(d); since the first child
        // sits right there, that's also its `before` pos.
        return { pos: $head.start(d), node: firstChild };
      }
      break;
    }
  }
  return null;
}

/* ── Transaction mutators (cursor-in-raw) ─────────────────────────────── */

/**
 * Keep the rawBlock's rendered tag (`<h1>`, `<blockquote>`, `<p>`) in sync
 * with the current text prefix. Runs only when the doc changed. Returns a
 * standalone transaction the caller should dispatch, or null if the attrs
 * already match.
 */
export function maybeSyncRawBlockType(
  raw: { pos: number; node: ProseMirrorNode },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newState: any,
): Transaction | null {
  const text = raw.node.textContent;
  const hMatch = text.match(/^(#{1,6}) /);
  const isQuote = text.startsWith("> ");

  let expectedType = "paragraph";
  let expectedLevel: number | null = null;
  if (hMatch) {
    expectedType = "heading";
    expectedLevel = hMatch[1].length;
  } else if (isQuote) {
    expectedType = "blockquote";
  }

  const { originalType, originalLevel } = raw.node.attrs as {
    originalType: string;
    originalLevel: number | null;
  };
  if (originalType === expectedType && originalLevel === expectedLevel) {
    return null;
  }

  const tr = newState.tr as Transaction;
  tr.setNodeMarkup(raw.pos, undefined, {
    originalType: expectedType,
    originalLevel: expectedLevel,
  });
  tr.setMeta("rawSwap", true);
  tr.setMeta("addToHistory", false);
  return tr;
}

/**
 * If the rawBlock text now starts with a list prefix (`- `, `* `, `+ `,
 * `1. `) AND the rawBlock is NOT already inside a listItem/taskItem,
 * force-exit: rebuild the block as rich content so markdown-it creates a
 * proper list structure on the next pass, with the cursor landing inside
 * the new list's paragraph. Returns a standalone transaction the caller
 * should dispatch, or null if there's no list prefix to act on.
 */
export function maybeForceExitRawList(
  raw: { pos: number; node: ProseMirrorNode },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newState: any,
  schema: Schema,
  $head: ResolvedPos,
): Transaction | null {
  const text = raw.node.textContent;
  const listMatch = text.match(/^(?:[-*+]|\d+\.) /);
  if (!listMatch) return null;

  const $rawPos = newState.doc.resolve(raw.pos);
  const parentName = $rawPos.parent.type.name;
  if (parentName === "listItem" || parentName === "taskItem") return null;

  const rich = rawBlockToRichNodes(raw.node, schema);
  const tr = newState.tr as Transaction;
  if (rich.length) {
    tr.replaceWith(raw.pos, raw.pos + raw.node.nodeSize, rich);
  } else {
    tr.replaceWith(
      raw.pos,
      raw.pos + raw.node.nodeSize,
      schema.nodes.paragraph.create(),
    );
  }
  // Place the cursor inside the paragraph within the new list.
  // Structure: list(+1) > listItem(+1) > paragraph(+1) > text
  const prefixLen = listMatch[0].length;
  const cursorInText = $head.pos - (raw.pos + 1);
  const targetOffset = Math.max(0, cursorInText - prefixLen);
  const paraContentLen = Math.max(0, text.length - prefixLen);
  const newPos =
    raw.pos + 3 + Math.min(targetOffset, paraContentLen);
  tr.setSelection(TextSelection.create(tr.doc, newPos));
  // No rawSwap — second pass converts the paragraph inside the new list
  // to a rawBlock, keeping the cursor in-place.
  tr.setMeta("addToHistory", false);
  return tr;
}

/* ── Transaction mutators (cursor moved outside raw) ──────────────────── */

/**
 * Replace the rawBlock with rich content in place on the given transaction.
 * Empty rawBlocks become an empty paragraph; otherwise the block is re-parsed
 * via `rawBlockToRichNodes` (with its LRU cache).
 */
export function restoreRawToRich(
  tr: Transaction,
  raw: { pos: number; node: ProseMirrorNode },
  schema: Schema,
): void {
  const hasContent = raw.node.content.size > 0;
  if (hasContent) {
    const rich = rawBlockToRichNodes(raw.node, schema);
    if (rich.length) {
      tr.replaceWith(raw.pos, raw.pos + raw.node.nodeSize, rich);
    } else {
      tr.replaceWith(
        raw.pos,
        raw.pos + raw.node.nodeSize,
        schema.nodes.paragraph.create(),
      );
    }
  } else {
    // empty → restore as empty paragraph
    tr.replaceWith(
      raw.pos,
      raw.pos + raw.node.nodeSize,
      schema.nodes.paragraph.create(),
    );
  }
}

/**
 * Replace the rich block under the cursor with a rawBlock on the given
 * transaction. Maps positions through any prior step-1 changes. Preserves
 * the caret's visual column by shifting it by the length of the block-level
 * prefix (`# `, `## `, `> `) that `richBlockToRawFragment` prepends.
 */
export function convertRichToRaw(
  tr: Transaction,
  curNode: ProseMirrorNode,
  curPos: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newState: any,
  schema: Schema,
): void {
  const fragment = richBlockToRawFragment(curNode, schema);
  const rawNode = schema.nodes.rawBlock.create(
    {
      originalType: curNode.type.name,
      originalLevel: curNode.attrs?.level ?? null,
    },
    fragment,
  );

  // Map positions through step-1 changes
  const mPos = tr.mapping.map(curPos);
  const mEnd = tr.mapping.map(curPos + curNode.nodeSize);
  tr.replaceWith(mPos, mEnd, rawNode);

  // Preserve the position the user's click/arrow key landed on inside this
  // block. ProseMirror already placed the caret at the correct column; we
  // shift it by the length of the block-level prefix (`# `, `## `, `> `)
  // that we prepended to the raw content so the caret ends up at the
  // equivalent character in the raw form, not at the start of the prefix.
  let prefixLen = 0;
  if (curNode.type.name === "heading") {
    const lvl = Math.min(
      Math.max(Number(curNode.attrs?.level) || 1, 1),
      6,
    );
    prefixLen = lvl + 1; // "###" + " "
  } else if (curNode.type.name === "blockquote") {
    prefixLen = 2; // "> "
  }
  const intendedOffset = Math.max(
    0,
    newState.selection.$head.pos - curPos - 1,
  );
  const rawContentStart = mPos + 1;
  const rawContentEnd = rawContentStart + rawNode.content.size;
  const targetPos = Math.min(
    rawContentStart + intendedOffset + prefixLen,
    rawContentEnd,
  );
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos));
  } catch {
    // position out of bounds — leave selection as-is
  }
}
