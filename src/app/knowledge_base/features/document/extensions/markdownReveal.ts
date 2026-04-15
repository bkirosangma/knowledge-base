// Typora-style live markdown editing.
// When the cursor enters a block, non-link syntax is revealed as raw markdown
// text while link marks and [[wiki-link]] atoms stay rendered inline. When the
// cursor leaves, the raw text is re-parsed and the block goes back to rich.

import { Extension, Node as TiptapNode } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DOMParser as PMDOMParser, Fragment } from "@tiptap/pm/model";
import type {
  Mark,
  Node as ProseMirrorNode,
  Schema,
} from "@tiptap/pm/model";
import { markdownToHtml } from "./markdownSerializer";

const pluginKey = new PluginKey("markdownReveal");

// Block types that can be converted to raw editing mode
const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);
// Top-level wrappers we descend into to find a deeper convertible block.
// Lists themselves can't become a rawBlock (their schema is `listItem+`), so
// when the cursor is in a list we walk down to the paragraph inside the
// specific list item the cursor sits in — siblings stay rich.
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

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
          // Flatten non-link marks to raw syntax chars.
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

/* ── Raw editing block node ── */

export const RawBlock = TiptapNode.create({
  name: "rawBlock",
  group: "block",
  // Mixed content: text (raw markdown syntax), link-marked text, wikiLink atoms.
  content: "(text | wikiLink)*",
  defining: true,
  isolating: true,
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
  // Only the link mark is allowed inside a rawBlock; bold/italic/etc. are
  // represented as literal syntax characters in the text.
  extendNodeSchema() {
    return { marks: "link" };
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
            } else if (LIST_TYPES.has(top.type.name)) {
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
    ];
  },
});
