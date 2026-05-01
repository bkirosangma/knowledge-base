/**
 * Rich ↔ raw block conversion helpers that back the `MarkdownReveal`
 * Extension. Extracted from `markdownReveal.ts` so the pure conversion
 * logic is unit-testable without a live Tiptap editor and so the main
 * Extension file can focus on schema + plugin wiring.
 */

import { DOMParser as PMDOMParser, Fragment } from "@tiptap/pm/model";
import type {
  Mark,
  Node as ProseMirrorNode,
  Schema,
} from "@tiptap/pm/model";
import { markdownToHtml } from "./markdownSerializer";

/* ── Helpers ── */

// Wrap a plain-text run in the markdown syntax chars for each non-link mark
// present on it. Innermost applied first so `**_x_**` nests correctly.
export function marksToRawMarkdown(text: string, marks: readonly Mark[]): string {
  if (!text) return text;
  const names = new Set(marks.map((m) => m.type.name));
  let out = text;
  if (names.has("code")) out = "`" + out + "`";
  if (names.has("italic")) out = "*" + out + "*";
  if (names.has("bold")) out = "**" + out + "**";
  if (names.has("strike")) out = "~~" + out + "~~";
  return out;
}

// Mark nesting order (outermost → innermost) and their syntax characters.
// Consistent ordering ensures `closeMarksTo` correctly computes the common
// prefix between adjacent text runs, so we only open/close at boundaries.
const MARK_ORDER: string[] = ["strike", "bold", "italic", "code"];
const MARK_SYNTAX: Record<string, string> = {
  bold: "**", italic: "*", strike: "~~", code: "`",
};

// Convert a rich block (paragraph/heading/blockquote) into a Fragment suitable
// for a rawBlock: text with non-link marks flattened to syntax chars, link
// marks preserved verbatim, and wikiLink atoms passed through.
//
// Unlike the old per-run wrapping (`marksToRawMarkdown` on each text node),
// this tracks which marks are currently "open" and only emits syntax chars at
// mark boundaries. That prevents the asterisk explosion when consecutive runs
// share marks (e.g. `<strong>A <em>B</em> C</strong>` → `**A *B* C**` instead
// of `**A *****B****** C**`).
export function richBlockToRawFragment(
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

  // ── Mark-boundary tracking state ──
  let openMarks: string[] = [];  // currently open marks, outer → inner
  let pendingText = "";          // text buffer including syntax chars

  const flushText = () => {
    if (pendingText) {
      children.push(schema.text(pendingText));
      pendingText = "";
    }
  };

  // Transition from `openMarks` to `targetMarks`: close marks no longer
  // present (innermost first), then open newly needed marks.
  // Returns the common-prefix length so callers can tell which marks opened.
  const transitionMarks = (targetMarks: string[]): number => {
    let commonLen = 0;
    while (
      commonLen < openMarks.length &&
      commonLen < targetMarks.length &&
      openMarks[commonLen] === targetMarks[commonLen]
    ) {
      commonLen++;
    }
    // When closing marks, pull trailing spaces outside the closing
    // delimiters.  CommonMark requires a closing `**` / `~~` to be
    // "right-flanking" — i.e. not preceded by whitespace.  Without this
    // fixup `**word **` would fail to parse as bold.
    let trailingWS = "";
    if (openMarks.length > commonLen) {
      const wsMatch = pendingText.match(/( +)$/);
      if (wsMatch) {
        trailingWS = wsMatch[0];
        pendingText = pendingText.slice(0, -trailingWS.length);
      }
    }
    // Close from innermost to the divergence point.
    for (let i = openMarks.length - 1; i >= commonLen; i--) {
      pendingText += MARK_SYNTAX[openMarks[i]];
    }
    // Re-insert trailing whitespace after the closing delimiters.
    pendingText += trailingWS;
    // Open from the divergence point to innermost.
    for (let i = commonLen; i < targetMarks.length; i++) {
      pendingText += MARK_SYNTAX[targetMarks[i]];
    }
    openMarks = [...targetMarks];
    return commonLen;
  };

  const closeAllMarks = () => {
    // Same trailing-whitespace fix as transitionMarks.
    let trailingWS = "";
    if (openMarks.length > 0) {
      const wsMatch = pendingText.match(/( +)$/);
      if (wsMatch) {
        trailingWS = wsMatch[0];
        pendingText = pendingText.slice(0, -trailingWS.length);
      }
    }
    for (let i = openMarks.length - 1; i >= 0; i--) {
      pendingText += MARK_SYNTAX[openMarks[i]];
    }
    pendingText += trailingWS;
    openMarks = [];
  };

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
          // Links are preserved as link-marked text nodes in the rawBlock.
          // Close all marks around them so the syntax doesn't leak into
          // the link display, then flush and push the link node directly.
          closeAllMarks();
          flushText();
          // Preserve formatting marks (bold/italic/strike/code) as syntax
          // chars inside the link text so the round-trip is lossless.
          const nonLinkMarks = child.marks.filter(
            (m) => m.type !== linkMarkType,
          );
          const styledText = nonLinkMarks.length
            ? marksToRawMarkdown(child.text, nonLinkMarks)
            : child.text;
          children.push(schema.text(styledText, [linkMark]));
        } else {
          // Determine which formatting marks apply to this run.
          // Keep already-open marks in their current nesting position and
          // add newly appearing marks as innermost. This avoids closing
          // and reopening a shared mark (like bold) when a sibling mark
          // (like strike) appears or disappears in an inner run.
          const markNames = new Set(child.marks.map((m) => m.type.name));
          const kept = openMarks.filter((m) => markNames.has(m));
          const added = MARK_ORDER.filter(
            (m) => markNames.has(m) && !openMarks.includes(m),
          );
          const target = [...kept, ...added];
          const cLen = transitionMarks(target);
          // When new marks were opened and the text starts with spaces,
          // pull those spaces before the opening delimiters so they stay
          // left-flanking per CommonMark rules (`** word**` won't parse).
          let txt = child.text!;
          if (target.length > cLen && txt[0] === " ") {
            const ws = txt.match(/^( +)/)![0];
            const openSyn = target
              .slice(cLen)
              .map((m) => MARK_SYNTAX[m])
              .join("");
            if (pendingText.endsWith(openSyn)) {
              pendingText =
                pendingText.slice(0, -openSyn.length) + ws + openSyn;
              txt = txt.slice(ws.length);
            }
          }
          pendingText += txt;
        }
      } else if (wikiLinkType && child.type === wikiLinkType) {
        // Preserve wikiLink atoms; their markdown form is [[path]] which would
        // be re-parsed on restore — keeping them as nodes avoids the parse
        // trip for a lossless round-trip.
        closeAllMarks();
        flushText();
        children.push(child);
      } else if (child.type.name === "hardBreak") {
        // Emit as markdown's hard-break syntax (two trailing spaces + \n).
        closeAllMarks();
        flushText();
        children.push(schema.text("  \n"));
      } else if (!child.isLeaf) {
        // Blockquote contains a paragraph; recurse into its inlines.
        visit(child);
      }
    });
  };
  visit(node);

  closeAllMarks();
  flushText();

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
export function rawBlockToRichNodes(
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

  // Escape bare `>` not followed by a space — CommonMark treats `>text` as a
  // blockquote, but the editor only recognises `> text` (with space) as one.
  const parseMd =
    md.startsWith(">") && !md.startsWith("> ") ? "\\" + md : md;

  const html = markdownToHtml(parseMd);
  // KB-024: DOMParser instead of innerHTML. The parse semantics are
  // identical (HTML5 fragment parsing in both cases) but DOMParser
  // never invokes the HTML scripting algorithm — no scripts, no event
  // handlers, no foot-guns. PMDOMParser handles a body element the
  // same way it handles a div wrapper.
  const dom = new DOMParser().parseFromString(html, "text/html");
  const parsed = PMDOMParser.fromSchema(schema).parse(dom.body);
  const nodes: ProseMirrorNode[] = [];
  parsed.forEach((child) => nodes.push(child));
  cacheSet(schema, md, nodes);
  return nodes;
}

// Walk `node` (starting at doc position `nodeStart`) to find the rightmost
// (visually last) textblock descendant. Returns `{ node, start, end }` with
// doc positions, or null if no valid target exists (atomic, leaf, empty,
// isolating, or every candidate is `excludeName`). Used by the rawBlock
// Backspace handler to locate the textblock its content should be spliced
// into — for a textblock prev that's the prev itself; for a wrapper prev
// (list, blockquote, nested lists) it walks down to the deepest rightmost
// textblock.
export function findMergeTarget(
  node: ProseMirrorNode,
  nodeStart: number,
  excludeName: string,
): { node: ProseMirrorNode; start: number; end: number } | null {
  if (node.isTextblock) {
    if (node.type.name === excludeName) return null;
    return { node, start: nodeStart, end: nodeStart + node.nodeSize };
  }
  if (node.isAtom || node.childCount === 0) return null;
  // Don't cross an isolating boundary: tables are self-contained, and
  // merging a rawBlock's inline content into the last cell's paragraph
  // would be surprising (the whole block appears to vanish into a cell).
  // Bail here so the Backspace handler falls through to PM's default
  // chain, which leaves the rawBlock and the table as-is and just moves
  // the cursor between them.
  if (node.type.spec.isolating) return null;

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
