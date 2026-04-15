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

/* ── Helpers ── */

// Wrap a plain-text run in the markdown syntax chars for each non-link mark
// present on it. Innermost applied first so `**_x_**` nests correctly.
function marksToRawMarkdown(text: string, marks: readonly Mark[]): string {
  if (!text) return text;
  const names = new Set(marks.map((m) => m.type.name));
  let out = text;
  if (names.has("code")) out = "`" + out + "`";
  if (names.has("italic")) out = "*" + out + "*";
  if (names.has("bold")) out = "**" + out + "**";
  if (names.has("strike")) out = "~~" + out + "~~";
  return out;
}

// Convert a rich block (paragraph/heading/blockquote) into a Fragment suitable
// for a rawBlock: text with non-link marks flattened to syntax chars, link
// marks preserved verbatim, and wikiLink atoms passed through.
function richBlockToRawFragment(
  node: ProseMirrorNode,
  schema: Schema,
): Fragment {
  const linkMarkType = schema.marks.link;
  const wikiLinkType = schema.nodes.wikiLink;
  const children: ProseMirrorNode[] = [];

  // Heading / blockquote prefix — blockquotes are actually a wrapper with a
  // paragraph inside; the walker below handles that shape.
  let prefix = "";
  if (node.type.name === "heading") {
    const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
    prefix = "#".repeat(level) + " ";
  } else if (node.type.name === "blockquote") {
    prefix = "> ";
  }
  if (prefix) children.push(schema.text(prefix));

  // Walk inline descendants of the block. For blockquote this descends into
  // the inner paragraph's inlines, which is what we want (we only handle the
  // single-paragraph blockquote shape here; that matches markdownToHtml's
  // round-trip).
  const visit = (n: ProseMirrorNode) => {
    n.forEach((child) => {
      if (child.isText && child.text != null) {
        const linkMark = linkMarkType
          ? child.marks.find((m) => m.type === linkMarkType)
          : undefined;
        if (linkMark) {
          // Preserve the link mark on this run verbatim.
          children.push(schema.text(child.text, [linkMark]));
        } else {
          // Flatten non-link marks to raw syntax chars. We deliberately do
          // NOT carry the original marks across — the syntax-highlight
          // decoration plugin re-derives `<strong>/<em>/<s>/<code>` from the
          // syntax chars on every doc change, so keeping the marks would
          // double-render (e.g. `<code><code>...</code></code>`) and would
          // also keep the styling alive after the user deletes a syntax
          // char, since marks aren't tied to the regex match.
          const raw = marksToRawMarkdown(child.text, child.marks);
          if (raw) children.push(schema.text(raw));
        }
      } else if (wikiLinkType && child.type === wikiLinkType) {
        // Preserve wikiLink atoms; their markdown form is [[path]] which would
        // be re-parsed on restore — keeping them as nodes avoids the parse
        // trip for a lossless round-trip.
        children.push(child);
      } else if (!child.isLeaf) {
        // Blockquote contains a paragraph; recurse into its inlines.
        visit(child);
      }
    });
  };
  visit(node);

  return Fragment.fromArray(children);
}

// Small LRU cache for rawBlock → rich conversions. Every boundary-cross in a
// document re-parses markdown via markdown-it and PMDOMParser, which is the
// second-heaviest per-keystroke path (after htmlToMarkdown). Keying by the
// normalized markdown string lets repeated traversals of the same block
// short-circuit. See docs/perf-analysis-2026-04-15.md #3.
//
// Nested inside a per-Schema WeakMap so a new editor (different extensions,
// different schema identity) gets a fresh cache — nodes produced against
// schema A would fail to insert into schema B, so sharing would corrupt.
const rawToRichCache = new WeakMap<Schema, Map<string, ProseMirrorNode[]>>();
const RAW_TO_RICH_CACHE_MAX = 64;

function cacheFor(schema: Schema): Map<string, ProseMirrorNode[]> {
  let m = rawToRichCache.get(schema);
  if (!m) {
    m = new Map();
    rawToRichCache.set(schema, m);
  }
  return m;
}
function cacheSet(schema: Schema, key: string, value: ProseMirrorNode[]) {
  const m = cacheFor(schema);
  if (m.has(key)) m.delete(key);
  m.set(key, value);
  if (m.size > RAW_TO_RICH_CACHE_MAX) {
    const oldest = m.keys().next().value;
    if (oldest !== undefined) m.delete(oldest);
  }
}
function cacheGet(schema: Schema, key: string): ProseMirrorNode[] | undefined {
  const m = cacheFor(schema);
  const value = m.get(key);
  if (value !== undefined) {
    // Move to end (LRU).
    m.delete(key);
    m.set(key, value);
  }
  return value;
}

// Convert a rawBlock back into one or more rich block nodes. Flattens the
// mixed content (raw text + link-marked text + wikiLink atoms) into a single
// markdown string — links become `[text](url)`, wikiLinks become `[[path]]`,
// and the rest of the text is already raw markdown (including any heading/
// blockquote prefix the user sees while editing). Then markdownToHtml does a
// single, correct block-level parse so mixed headings/quotes/paragraphs don't
// end up nested inside one another.
function rawBlockToRichNodes(
  rawNode: ProseMirrorNode,
  schema: Schema,
): ProseMirrorNode[] {
  let md = "";
  rawNode.forEach((child) => {
    if (child.isText && child.text != null) {
      const linkMark = child.marks.find((m) => m.type.name === "link");
      if (linkMark) {
        const href = String(linkMark.attrs?.href ?? "");
        md += `[${child.text}](${href})`;
      } else {
        md += child.text;
      }
    } else if (child.type.name === "wikiLink") {
      const path = String(child.attrs?.path ?? "");
      const section = child.attrs?.section as string | null;
      const target = section ? `${path}#${section}` : path;
      const display = (child.attrs?.display as string | null) ?? target;
      // Preserve a custom label through the round-trip via the `[[path|display]]`
      // alias form; otherwise emit the compact form for lossless save output.
      md += display && display !== target ? `[[${target}|${display}]]` : `[[${target}]]`;
    }
  });

  if (!md.trim()) return [];

  const cached = cacheGet(schema, md);
  if (cached) return cached;

  const html = markdownToHtml(md);
  const div = document.createElement("div");
  div.innerHTML = html;
  const parsed = PMDOMParser.fromSchema(schema).parse(div);
  const nodes: ProseMirrorNode[] = [];
  parsed.forEach((child) => nodes.push(child));
  cacheSet(schema, md, nodes);
  return nodes;
}

// Walk `node` (starting at doc position `nodeStart`) to find the rightmost
// (visually last) textblock descendant. Returns `{ node, start, end }` with
// doc positions, or null if no valid target exists (atomic, leaf, empty, or
// every candidate is `excludeName`). Used by the rawBlock Backspace handler
// to locate the textblock its content should be spliced into — for a
// textblock prev that's the prev itself; for a wrapper prev (list,
// blockquote, nested lists) it walks down to the deepest rightmost
// textblock.
function findMergeTarget(
  node: ProseMirrorNode,
  nodeStart: number,
  excludeName: string,
): { node: ProseMirrorNode; start: number; end: number } | null {
  if (node.isTextblock) {
    if (node.type.name === excludeName) return null;
    return { node, start: nodeStart, end: nodeStart + node.nodeSize };
  }
  if (node.isAtom || node.childCount === 0) return null;

  // Right-to-left walk. The running `childEnd` pointer starts just before
  // the wrapper's closing token and moves left by each child's nodeSize.
  // The first (rightmost) child that yields a valid target wins.
  let childEnd = nodeStart + node.nodeSize - 1;
  for (let i = node.childCount - 1; i >= 0; i--) {
    const child = node.child(i);
    const childStart = childEnd - child.nodeSize;
    const result = findMergeTarget(child, childStart, excludeName);
    if (result) return result;
    childEnd = childStart;
  }
  return null;
}

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
const SYNTAX_PATTERNS: Array<{ re: RegExp; tags: string[] }> = [
  { re: /\*\*\*([^*\n]+?)\*\*\*/g, tags: ["strong", "em"] },
  { re: /\*\*([^*\n]+?)\*\*/g, tags: ["strong"] },
  // Italic single `*`: lookbehind/ahead avoid catching the inner `*` of `**`.
  { re: /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g, tags: ["em"] },
  { re: /~~([^~\n]+?)~~/g, tags: ["s"] },
  { re: /`([^`\n]+?)`/g, tags: ["code"] },
];

function pushSyntaxDecorations(
  text: string,
  basePos: number,
  out: Decoration[],
) {
  // `consumed` ranges are relative to `text` (not absolute doc pos). We only
  // skip ranges fully inside an earlier match — partial overlap (e.g. the
  // outer `**` of `**bold *italic***`) still gets its own decoration so the
  // user sees stacked styles where the syntax overlaps.
  const consumed: Array<[number, number]> = [];
  const isInside = (s: number, e: number) =>
    consumed.some(([cs, ce]) => s >= cs && e <= ce);

  for (const { re, tags } of SYNTAX_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (isInside(start, end)) continue;
      consumed.push([start, end]);
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
          // list → descend until we find the paragraph inside *this* list
          // item so siblings stay rich.
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
          if (cursorInRaw && canReveal) return null;

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
