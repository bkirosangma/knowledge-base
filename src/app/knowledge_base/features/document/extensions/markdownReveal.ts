// Typora-style live markdown editing.
// When the cursor enters a block, non-link syntax is revealed as raw markdown
// text while link marks and [[wiki-link]] atoms stay rendered inline. When the
// cursor leaves, the raw text is re-parsed and the block goes back to rich.

import { Extension, Node as TiptapNode } from "@tiptap/react";
import { getSplittedAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";
import type {
  Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import {
  rawBlockToRichNodes,
  findMergeTarget,
} from "./markdownRevealConversion";
import {
  SYNTAX_PATTERNS,
  buildSyntaxDecorations,
} from "./markdownRevealDecorations";
import {
  findRawBlock,
  findConvertibleBlockAtCursor,
  maybeSyncRawBlockType,
  maybeForceExitRawList,
  restoreRawToRich,
  convertRichToRaw,
} from "./markdownRevealTransactions";

// Re-export for backward compatibility — rawSyntaxEngine + tests import
// rawBlockToRichNodes / SYNTAX_PATTERNS from this module.
export { rawBlockToRichNodes, SYNTAX_PATTERNS };

const pluginKey = new PluginKey("markdownReveal");
const syntaxKey = new PluginKey<DecorationSet>("markdownRevealSyntax");

// CONVERTIBLE + DEEP_WRAPPERS live in ./markdownRevealTransactions now.


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

          const raw = findRawBlock(doc);
          const cur = findConvertibleBlockAtCursor($head);

          // Cursor inside the existing rawBlock AND reveal is still allowed →
          // keep it raw. Position-range check (vs. strict equality) covers
          // nested rawBlocks where the convertible-block lookup above doesn't
          // surface raw.pos directly.
          const cursorInRaw =
            raw &&
            $head.pos > raw.pos &&
            $head.pos < raw.pos + raw.node.nodeSize;
          if (cursorInRaw && canReveal && raw) {
            // Only the docChanged path runs rawBlock-text maintenance: attr
            // sync (heading/quote/paragraph) and list-prefix force-exit.
            if (transactions.some((t) => t.docChanged)) {
              const syncTr = maybeSyncRawBlockType(raw, newState);
              if (syncTr) return syncTr;
              const listTr = maybeForceExitRawList(raw, newState, schema, $head);
              if (listTr) return listTr;
            }
            return null;
          }

          // Convert only when allowed AND cursor is on a convertible block
          const wantConvert = canReveal && cur !== null;

          // Nothing to restore AND not converting → bail
          if (!raw && !wantConvert) return null;

          const tr = newState.tr;

          // ── Step 1: Restore rawBlock → rich content ──
          if (raw) restoreRawToRich(tr, raw, schema);

          // ── Step 2: Convert cursor block → rawBlock ──
          if (cur && wantConvert) {
            convertRichToRaw(tr, cur.node, cur.pos, newState, schema);
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
