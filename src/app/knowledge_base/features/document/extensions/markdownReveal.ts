// Typora-style live markdown editing.
// When the cursor enters a block, non-link syntax is revealed as raw markdown
// text while link marks and [[wiki-link]] atoms stay rendered inline. When the
// cursor leaves, the raw text is re-parsed and the block goes back to rich.

import { Extension, Node as TiptapNode } from "@tiptap/react";
import { getSplittedAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { DOMParser as PMDOMParser, Fragment } from "@tiptap/pm/model";
import type {
  Mark,
  Node as ProseMirrorNode,
  Schema,
} from "@tiptap/pm/model";
import { markdownToHtml } from "./markdownSerializer";
import {
  richBlockToRawFragment,
  rawBlockToRichNodes,
  findMergeTarget,
} from "./markdownRevealConversion";

// Re-export for backward compatibility — rawSyntaxEngine + tests import
// rawBlockToRichNodes from this module.
export { rawBlockToRichNodes };

const pluginKey = new PluginKey("markdownReveal");
const syntaxKey = new PluginKey<DecorationSet>("markdownRevealSyntax");

// Block types that can be converted to raw editing mode
const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);
// Top-level wrappers we descend into to find a deeper convertible block.
// Lists themselves can't become a rawBlock (schema is `listItem+`), and
// tables can't either (schema is `tableRow+`), so when the cursor is in one
// of these wrappers we walk down to the paragraph inside the specific list
// item or cell the cursor sits in — siblings stay rich.
const DEEP_WRAPPERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "table",
]);

/* ── Live syntax highlighting decorations ── */
//
// `code: true` blocks input rules from converting `**x**` into a bold mark, so
// the user sees the asterisks while typing. But until the cursor leaves the
// block we'd otherwise show plain text and only reveal the styling on exit.
// To get an "as-soon-as-syntax-completes" feel like Typora, we scan the
// rawBlock's text on every doc change and add inline decorations that wrap
// matched ranges in `<strong>/<em>/<s>/<code>`. Decorations are pure visual —
// they don't mutate the doc, don't trigger transactions, and use the editor's
// existing mark CSS for free.

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

function buildSyntaxDecorations(doc: ProseMirrorNode): DecorationSet {
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

/* ── Raw editing block node ── */

export const RawBlock = TiptapNode.create({
  name: "rawBlock",
  // Higher than the default 100 so our Enter handler runs BEFORE TipTap's
  // core Keymap extension. Without this, Keymap's `newlineInCode()` (fired
  // by our `code: true` flag) consumes Enter and inserts `\n`, never
  // reaching the split-into-new-block logic below.
  priority: 1000,
  group: "block",
  // Mixed content: text (raw markdown syntax), link-marked text, wikiLink atoms.
  content: "(text | wikiLink)*",
  defining: true,
  isolating: true,
  // `code: true` opts the rawBlock out of TipTap's input rules — without it,
  // typing `**bold**` inside the rawBlock would fire the bold input rule,
  // strip the asterisks, and apply a bold mark instead. On exit the rawBlock
  // serializes to plain text, so the bold would silently vanish. Same logic
  // for `*italic*`, `~~strike~~`, `` `code` ``, headings, lists, etc. As a
  // bonus this also flips paste handling to plain-text and switches the
  // node's whitespace mode to `pre`, both of which match raw editing intent.
  code: true,
  addAttributes() {
    return {
      originalType: { default: "paragraph" },
      originalLevel: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "[data-raw-block]", priority: 1000 }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const { originalType, originalLevel } = node.attrs as {
      originalType: string;
      originalLevel: number | null;
    };
    let tag = "p";
    if (originalType === "heading") {
      const lvl = Math.min(Math.max(Number(originalLevel) || 1, 1), 6);
      tag = `h${lvl}`;
    } else if (originalType === "blockquote") {
      tag = "blockquote";
    }
    return [
      tag,
      { ...HTMLAttributes, "data-raw-block": "", class: "md-raw-block" },
      0,
    ];
  },
  // Only the link mark is allowed inside a rawBlock. Visual styling for
  // bold/italic/strike/code comes from the syntax-highlight decoration
  // plugin (via `<strong>/<em>/<s>/<code>` wrappers), which re-derives the
  // styling from the syntax chars on every doc change — that keeps it in
  // sync as the user types/deletes. Allowing the marks here would (a)
  // double-render with the decorations, and (b) leak styling past the
  // syntax (e.g. deleting a `*` would keep the bold mark in place).
  extendNodeSchema() {
    return { marks: "link" };
  },
  addKeyboardShortcuts() {
    return {
      // `code: true` makes ProseMirror's default Enter handler insert a
      // literal `\n` (the codeBlock convention) instead of starting a new
      // block. That's wrong for raw markdown editing — pressing Enter
      // should split into two blocks the way a normal paragraph does.
      //
      // We also can't defer to TipTap's `splitListItem` when the cursor is
      // inside a rawBlock inside a list item: `canSplit` short-circuits on
      // `$pos.parent.type.spec.isolating`, and our rawBlock sets
      // `isolating: true` (intentional — it stops backspace/delete from
      // pulling adjacent blocks into the raw editing view). So the split
      // is built by hand here.
      //
      // Two cases:
      //  • rawBlock inside a listItem/taskItem → replace the current list
      //    item with two siblings. Before-half keeps the rawBlock with the
      //    pre-cursor content; after-half is a fresh paragraph holding the
      //    post-cursor inline content. The markdownReveal appendTransaction
      //    then restores the before-half to rich (cursor left it) and
      //    converts the after-half to a rawBlock (cursor landed in it), so
      //    the end state is two list items with live reveal on the new one.
      //  • Otherwise → split at the cursor with `typesAfter: paragraph`
      //    so the after-half lands as a plain paragraph; markdownReveal
      //    then restores the before-half to rich and re-converts the
      //    after-half on the next cursor-position pass.
      Enter: () => {
        const { state, view } = this.editor;
        const { schema, selection } = state;
        const { $head } = selection;

        // Walk up the ancestry once to find both the rawBlock and (if any)
        // the enclosing list item. Tracking the depth lets us compute
        // positions later without re-resolving.
        let rawBlockNode: ProseMirrorNode | null = null;
        let rawBlockPos = -1;
        let listItemNode: ProseMirrorNode | null = null;
        let listItemPos = -1;
        for (let d = $head.depth; d >= 0; d--) {
          const node = $head.node(d);
          const name = node.type.name;
          if (name === "rawBlock" && !rawBlockNode) {
            rawBlockNode = node;
            rawBlockPos = $head.before(d);
          } else if (
            rawBlockNode &&
            !listItemNode &&
            (name === "listItem" || name === "taskItem")
          ) {
            listItemNode = node;
            listItemPos = $head.before(d);
          }
        }
        if (!rawBlockNode) return false;

        // ── Case 1: rawBlock inside a list item — hand-built split ──
        if (listItemNode) {
          const rawContentStart = rawBlockPos + 1;
          const cursorOffset = Math.max(
            0,
            Math.min($head.pos - rawContentStart, rawBlockNode.content.size),
          );
          const beforeContent = rawBlockNode.content.cut(0, cursorOffset);
          const afterContent = rawBlockNode.content.cut(cursorOffset);

          const beforeRawBlock = schema.nodes.rawBlock.create(
            rawBlockNode.attrs,
            beforeContent,
          );
          // Post-cursor lands in a paragraph so appendTransaction's
          // conversion path treats it as a brand-new rawBlock (with
          // originalType=paragraph). Keeping text + wikiLink atoms as-is
          // is valid in a paragraph — wikiLink is group=inline and link
          // marks carry over untouched.
          const afterParagraph = schema.nodes.paragraph.create(
            null,
            afterContent,
          );

          // Strip attrs with keepOnSplit=false from the after-half so a
          // checked taskItem splits into an unchecked one (matches Tiptap's
          // built-in splitListItem behavior).
          const afterListItemAttrs = getSplittedAttributes(
            this.editor.extensionManager.attributes,
            listItemNode.type.name,
            listItemNode.attrs,
          );

          const beforeListItem = listItemNode.type.create(
            listItemNode.attrs,
            beforeRawBlock,
          );
          const afterListItem = listItemNode.type.create(
            afterListItemAttrs,
            afterParagraph,
          );

          const tr = state.tr;
          try {
            tr.replaceWith(
              listItemPos,
              listItemPos + listItemNode.nodeSize,
              [beforeListItem, afterListItem],
            );
          } catch {
            return false;
          }

          // Cursor position math: walk past the before-list-item, then
          // through the after-list-item's opening token and its paragraph's
          // opening token to land at offset 0 of the paragraph's content.
          const afterParagraphStart =
            listItemPos + beforeListItem.nodeSize + 2;
          try {
            tr.setSelection(TextSelection.create(tr.doc, afterParagraphStart));
          } catch {
            // shouldn't happen given the shape we just built, but stay safe
          }
          view.dispatch(tr.scrollIntoView());
          return true;
        }

        // ── Case 2: top-level rawBlock — split as paragraph ──
        const cursorPos = $head.pos;
        const tr = state.tr;
        try {
          tr.split(cursorPos, 1, [{ type: schema.nodes.paragraph }]);
        } catch {
          return false;
        }
        // Land the cursor at the start of the after-half. Split inserts
        // a closing token + an opening token at cursorPos, so the new
        // block's first text position is cursorPos + 2.
        try {
          tr.setSelection(TextSelection.create(tr.doc, cursorPos + 2));
        } catch {
          // out of bounds — let PM keep its default mapped selection
        }
        view.dispatch(tr);
        return true;
      },

      // Backspace at offset 0 of a top-level rawBlock. Three outcomes:
      //  • prev is atomic (hr, image, ...) → delete the prev node; rawBlock
      //    stays so a subsequent Backspace can try again against whatever is
      //    now above.
      //  • prev is a textblock, list, or blockquote → merge the rawBlock's
      //    raw inline content into the deepest/rightmost textblock within
      //    prev. Syntax characters are preserved verbatim (a rawBlock
      //    showing `# Hello` merges as literal `# Hello` text).
      //  • every other case → fall through (return false) so PM's default
      //    Backspace chain runs.
      //
      // Needed because `isolating: true` on the rawBlock blocks PM's default
      // `joinBackward` / `selectNodeBackward` across the boundary, AND
      // PM's `deleteBarrier` (used when prev is a wrapper like a list)
      // otherwise tries to pull the rawBlock INTO the wrapper's last child
      // instead of merging its inline content there.
      Backspace: () => {
        const { state, view } = this.editor;
        const { selection } = state;
        const { $head, empty } = selection;

        if (!empty) return false;
        if ($head.parent.type.name !== "rawBlock") return false;
        if ($head.parentOffset !== 0) return false;

        // Only top-level rawBlocks — a rawBlock inside a listItem/taskItem
        // sits at depth >= 2 (doc → list → listItem → rawBlock), and we want
        // Tiptap's list keymap to handle those.
        if ($head.depth !== 1) return false;

        const rawBlockNode = $head.parent;
        const rawBlockPos = $head.before();
        const $rawStart = state.doc.resolve(rawBlockPos);
        const prevNode = $rawStart.nodeBefore;
        if (!prevNode) return false;

        // Atomic prev (hr, image, embed, ...): delete the atom. The rawBlock
        // stays intact and the cursor (mapped through the delete) remains at
        // offset 0, ready for a second Backspace to merge with the next
        // block above. Merging markdown syntax into an atom makes no sense.
        if (prevNode.isAtom) {
          const tr = state.tr.delete(
            rawBlockPos - prevNode.nodeSize,
            rawBlockPos,
          );
          view.dispatch(tr.scrollIntoView());
          return true;
        }

        // Find the target textblock to merge into. For a textblock prev
        // (paragraph, heading) that's prev itself. For a wrapper prev (list,
        // blockquote, nested lists) we descend to the deepest rightmost
        // textblock inside. `codeBlock` is excluded so that markdown syntax
        // doesn't become code content.
        const prevStart = rawBlockPos - prevNode.nodeSize;
        const target = findMergeTarget(prevNode, prevStart, "codeBlock");
        if (!target) return false;

        // Delete the rawBlock, then insert its raw inline content at the
        // end of the target textblock. `rawBlockNode.content` holds the
        // literal markdown text (plus link marks and wikiLink atoms) shown
        // while the rawBlock was revealed — inserting it verbatim preserves
        // syntax characters and any link/wikiLink formatting.
        const insertPos = target.end - 1;
        const tr = state.tr;
        tr.delete(rawBlockPos, rawBlockPos + rawBlockNode.nodeSize);
        if (rawBlockNode.content.size > 0) {
          tr.insert(insertPos, rawBlockNode.content);
        }
        try {
          tr.setSelection(TextSelection.create(tr.doc, insertPos));
        } catch {
          // Computed pos out of bounds — leave PM's mapped selection alone.
        }

        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});

/* ── The main extension ── */

export const MarkdownReveal = Extension.create({
  name: "markdownReveal",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,

        appendTransaction(transactions, oldState, newState) {
          // Never re-process our own swap transactions
          if (transactions.some((t) => t.getMeta("rawSwap"))) return null;

          const { selection, doc, schema } = newState;
          const $head = selection.$head;

          // Raw-reveal is disabled when the editor isn't editable.
          // Existing rawBlocks are still restored to rich content below.
          const canReveal = editor.isEditable;

          // ── Locate existing rawBlock (at most one, possibly inside a listItem) ──
          // descendants() lets us find a rawBlock at any depth, not just the
          // top level — required now that lists can host one.
          let raw: { pos: number; node: ProseMirrorNode } | null = null;
          doc.descendants((node, pos) => {
            if (raw) return false;
            if (node.type.name === "rawBlock") {
              raw = { pos, node };
              return false;
            }
            return true;
          });
          raw = raw as { pos: number; node: ProseMirrorNode } | null;

          // ── Locate the convertible block under the cursor ──
          // Top-level paragraph/heading/blockquote → convert at depth 1, which
          // keeps blockquotes whole (with the `> ` prefix shown). Top-level
          // list or table → descend until we find the paragraph inside *this*
          // list item or cell so siblings stay rich.
          let curPos = -1;
          let curNode: ProseMirrorNode | null = null;
          if ($head.depth >= 1) {
            const top = $head.node(1);
            if (CONVERTIBLE.has(top.type.name)) {
              curPos = $head.before(1);
              curNode = top;
            } else if (DEEP_WRAPPERS.has(top.type.name)) {
              for (let d = 2; d <= $head.depth; d++) {
                const inner = $head.node(d);
                if (CONVERTIBLE.has(inner.type.name)) {
                  curPos = $head.before(d);
                  curNode = inner;
                  break;
                }
              }
              // Fallback for table cells: prosemirror-tables sometimes places
              // the cursor at the cell boundary rather than inside the cell's
              // paragraph (empty cell, keyboard navigation, cell selection
              // normalization). In that case `$head.depth` stops at the cell
              // (depth 3 in `doc → table → row → cell`), so the depth-bounded
              // loop above never reaches the paragraph at depth 4. Walk the
              // cell's first child directly.
              if (!curNode) {
                for (let d = 2; d <= $head.depth; d++) {
                  const ancestor = $head.node(d);
                  if (
                    ancestor.type.name === "tableCell" ||
                    ancestor.type.name === "tableHeader"
                  ) {
                    const firstChild = ancestor.firstChild;
                    if (firstChild && CONVERTIBLE.has(firstChild.type.name)) {
                      // Cell content starts at $head.start(d); since the first
                      // child sits right there, that's also its `before` pos.
                      curPos = $head.start(d);
                      curNode = firstChild;
                    }
                    break;
                  }
                }
              }
            }
          }

          // Cursor inside the existing rawBlock AND reveal is still allowed →
          // keep it raw. Position-range check (vs. the old strict equality)
          // covers nested rawBlocks where the convertible-paragraph lookup
          // above doesn't surface raw.pos directly.
          const cursorInRaw =
            raw &&
            $head.pos > raw.pos &&
            $head.pos < raw.pos + raw.node.nodeSize;
          if (cursorInRaw && canReveal) {
            // Keep the rawBlock's rendered tag (<h1>, <blockquote>, <p>) in
            // sync with the text prefix as the user types.  Without this the
            // visual change only appears after a full exit/re-enter cycle.
            if (transactions.some((t) => t.docChanged) && raw) {
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
              if (
                originalType !== expectedType ||
                originalLevel !== expectedLevel
              ) {
                const tr = newState.tr;
                tr.setNodeMarkup(raw.pos, undefined, {
                  originalType: expectedType,
                  originalLevel: expectedLevel,
                });
                tr.setMeta("rawSwap", true);
                tr.setMeta("addToHistory", false);
                return tr;
              }

              // List prefix (`- `, `* `, `+ `, `1. `, etc.) — force-exit so
              // markdown-it creates the proper list structure immediately.
              const listMatch = text.match(/^(?:[-*+]|\d+\.) /);
              if (listMatch) {
                const $rawPos = newState.doc.resolve(raw.pos);
                const parentName = $rawPos.parent.type.name;
                if (parentName !== "listItem" && parentName !== "taskItem") {
                  const rich = rawBlockToRichNodes(raw.node, schema);
                  const tr = newState.tr;
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
                  // No rawSwap — second pass converts the paragraph inside the
                  // new list to a rawBlock, keeping the cursor in-place.
                  tr.setMeta("addToHistory", false);
                  return tr;
                }
              }
            }
            return null;
          }

          // Convert only when allowed AND cursor is on a convertible block
          const wantConvert =
            canReveal && curNode && CONVERTIBLE.has(curNode.type.name);

          // Nothing to restore AND not converting → bail
          if (!raw && !wantConvert) return null;

          const tr = newState.tr;

          // ── Step 1: Restore rawBlock → rich content ──
          if (raw) {
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

          // ── Step 2: Convert cursor block → rawBlock ──
          if (curNode && wantConvert) {
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

            // Preserve the position the user's click/arrow key landed on
            // inside this block. ProseMirror already placed the caret at the
            // correct column for us; we just need to shift it by the length of
            // the block-level prefix (`# `, `## `, `> `) that we prepended to
            // the raw content so the caret ends up at the equivalent character
            // in the raw form, not at the start of the inserted prefix.
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

          if (!tr.docChanged) return null;

          tr.setMeta("rawSwap", true);
          tr.setMeta("addToHistory", false);
          return tr;
        },
      }),

      // Live syntax-highlighting decorations for rawBlock content. Re-runs
      // only on actual doc changes; selection-only transactions reuse the
      // previous DecorationSet, which keeps cursor moves cheap.
      new Plugin<DecorationSet>({
        key: syntaxKey,
        state: {
          init: (_, state) => buildSyntaxDecorations(state.doc),
          apply: (tr, old) =>
            tr.docChanged ? buildSyntaxDecorations(tr.doc) : old,
        },
        props: {
          decorations(state) {
            return syntaxKey.getState(state) ?? null;
          },
        },
      }),
    ];
  },
});
