// Typora-style live markdown editing.
// When the cursor enters a block, it converts to raw markdown text that's
// directly editable. When the cursor leaves, it parses back to rich content.

import { Extension, Node as TiptapNode } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { DOMSerializer, DOMParser as PMDOMParser } from "@tiptap/pm/model";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { htmlToMarkdown, markdownToHtml } from "./markdownSerializer";

const pluginKey = new PluginKey("markdownReveal");

// Block types that can be converted to raw editing mode
const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);

/* ── Helpers ── */

function blockToMarkdown(node: ProseMirrorNode): string {
  const ser = DOMSerializer.fromSchema(node.type.schema);
  const dom = ser.serializeNode(node);
  const div = document.createElement("div");
  div.appendChild(dom);
  return htmlToMarkdown(div.innerHTML).trim();
}

function markdownToNodes(md: string, schema: Schema): ProseMirrorNode[] {
  const html = markdownToHtml(md);
  const div = document.createElement("div");
  div.innerHTML = html;
  const doc = PMDOMParser.fromSchema(schema).parse(div);
  const nodes: ProseMirrorNode[] = [];
  doc.forEach((child) => nodes.push(child));
  return nodes;
}

/* ── Raw editing block node ── */

export const RawBlock = TiptapNode.create({
  name: "rawBlock",
  group: "block",
  content: "text*",
  code: true,
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      originalType: { default: "paragraph" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-raw-block]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { ...HTMLAttributes, "data-raw-block": "", class: "md-raw-block" },
      0,
    ];
  },
  extendNodeSchema() {
    return { marks: "" };
  },
});

/* ── The main extension ── */

export const MarkdownReveal = Extension.create({
  name: "markdownReveal",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: pluginKey,

        appendTransaction(transactions, oldState, newState) {
          // Never re-process our own swap transactions
          if (transactions.some((t) => t.getMeta("rawSwap"))) return null;

          const { selection, doc, schema } = newState;
          const $head = selection.$head;

          // ── Locate existing rawBlock (at most one) ──
          let raw: { pos: number; node: ProseMirrorNode } | null = null;
          doc.forEach((node, pos) => {
            if (node.type.name === "rawBlock") raw = { pos, node };
          });
          raw = raw as { pos: number; node: ProseMirrorNode } | null;

          // ── Locate top-level block under cursor ──
          let curPos = -1;
          let curNode: ProseMirrorNode | null = null;
          if ($head.depth >= 1) {
            curPos = $head.before(1);
            curNode = $head.node(1);
          }

          // Cursor is already in the rawBlock → nothing to do
          if (raw && curPos === raw.pos) return null;

          // Nothing to restore AND nothing convertible → bail
          const wantConvert = curNode && CONVERTIBLE.has(curNode.type.name);
          if (!raw && !wantConvert) return null;

          const tr = newState.tr;

          // ── Step 1: Restore rawBlock → rich content ──
          if (raw) {
            const md = raw.node.textContent;
            if (md.trim()) {
              const rich = markdownToNodes(md, schema);
              if (rich.length) {
                tr.replaceWith(raw.pos, raw.pos + raw.node.nodeSize, rich);
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
            const md = blockToMarkdown(curNode);
            const rawNode = schema.nodes.rawBlock.create(
              { originalType: curNode.type.name },
              md ? schema.text(md) : undefined,
            );

            // Map positions through step-1 changes
            const mPos = tr.mapping.map(curPos);
            const mEnd = tr.mapping.map(curPos + curNode.nodeSize);
            tr.replaceWith(mPos, mEnd, rawNode);

            // Place cursor at the end of the raw text
            try {
              const textEnd = mPos + 1 + (md ? md.length : 0);
              tr.setSelection(TextSelection.create(tr.doc, textEnd));
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
