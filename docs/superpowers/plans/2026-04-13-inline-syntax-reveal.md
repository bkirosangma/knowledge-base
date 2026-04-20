# Inline Markdown Syntax Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current block-swap `MarkdownReveal` extension with a `SyntaxReveal` extension that renders markdown syntax characters as widget decorations on the active block — preserving rich rendering while making the syntax visible and Backspace/Delete-removable.

**Architecture:** A new ProseMirror plugin computes a `DecorationSet` of widget spans around mark ranges (bold `**`, italic `_`, strike `~~`, code `` ` ``) and before block prefixes (heading `#…`, blockquote `> `) but only for the block containing the selection. A keymap intercepts Backspace/Delete adjacent to these widgets to toggle the corresponding mark or change the block type. When `editor.isEditable` is false the plugin short-circuits to empty decorations. The old `MarkdownReveal` extension and `RawBlock` node are removed, and every reference in `MarkdownEditor.tsx` is cleaned up.

**Tech Stack:** Tiptap v3 (React), ProseMirror state/view/model primitives, Tailwind CSS 4, React 19.

**Spec:** `docs/superpowers/specs/2026-04-13-inline-syntax-reveal-design.md`

**Note on testing:** This project has no unit/integration test framework. Verification uses the `mcp__Claude_Preview__preview_*` tools against a running dev server, just as every recent change in this repo has been verified. A real `.md` document must be opened in the preview browser (via the File System Access API picker) before running the browser-driven verification steps.

---

## File Structure

### New Files

| File | Responsibility |
|------|----------------|
| `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts` | Tiptap extension exporting `SyntaxReveal`. Holds the ProseMirror plugin (decoration computation), the keymap for Backspace/Delete, and helper functions for walking marks and block prefixes. |

### Deleted Files

| File | Reason |
|------|--------|
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | Replaced entirely. The block-swap rawBlock approach cannot preserve rich rendering. |

### Modified Files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | Drop `MarkdownReveal`/`RawBlock` imports and uses; drop `rawSwapRef` and `rawSwap`-meta handling in `onUpdate`/`onTransaction`; add `SyntaxReveal` to extensions list. |
| `src/app/globals.css` | Add `.md-syntax` rule (muted slate color, no box, `user-select: none`). |

---

## Task 1: Add `.md-syntax` styling

**Files:**
- Modify: `src/app/globals.css`

Adding the CSS first lets later verification steps see the widgets immediately. A trivial first commit also gives a stable rollback point before the extension swap.

- [ ] **Step 1: Append the rule at the end of `globals.css`**

Open `src/app/globals.css` and append at the end of the file:

```css

/* Inline markdown syntax reveal (see syntaxReveal.ts extension). */
.markdown-editor .ProseMirror .md-syntax {
  color: #94a3b8;
  font-weight: 400;
  font-style: normal;
  user-select: none;
  pointer-events: none;
}
```

- [ ] **Step 2: Do not commit yet.**

The project's committing policy is explicit user approval only. Changes remain staged by the Edit tool; no `git add` or `git commit` unless the user asks.

---

## Task 2: Create the `SyntaxReveal` extension (inline marks only)

**Files:**
- Create: `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts`

This task delivers the decoration pipeline for inline marks (bold, italic, strike, inline code). Heading and blockquote prefixes land in Task 3. Backspace/Delete keymap lands in Task 4. After this task, syntax is *visible* but not *removable* via keyboard.

- [ ] **Step 1: Create the file with the full extension source**

Create `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts` with exactly this content:

```ts
// src/app/knowledge_base/features/document/extensions/syntaxReveal.ts
// A Tiptap/ProseMirror extension that renders markdown syntax characters
// around the marks of the block containing the cursor, using widget
// decorations so the block's rich rendering is preserved.

import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Mark } from "@tiptap/pm/model";

const pluginKey = new PluginKey<DecorationSet>("syntaxReveal");

// Map a Tiptap mark name to the markdown syntax that surrounds it.
// Returning `null` means "no reveal for this mark".
function syntaxForMark(mark: Mark): string | null {
  switch (mark.type.name) {
    case "bold":
      return "**";
    case "italic":
      return "_";
    case "strike":
      return "~~";
    case "code":
      return "`";
    default:
      return null;
  }
}

function makeWidget(text: string, side: -1 | 1): (view: unknown, getPos: () => number | undefined) => HTMLElement {
  return () => {
    const span = document.createElement("span");
    span.className = "md-syntax";
    span.textContent = text;
    span.setAttribute("data-md-syntax", text);
    span.setAttribute("data-md-side", side === -1 ? "open" : "close");
    return span;
  };
}

// Walk inline content of a block, emitting opening/closing syntax widgets
// at the boundaries of mark ranges. Returns an array of Decoration objects.
function decorateInlineMarks(
  block: ProseMirrorNode,
  blockStart: number,
): Decoration[] {
  const decos: Decoration[] = [];
  // Track currently-open marks (by type name) with their opening absolute position.
  const openByType = new Map<string, { mark: Mark; from: number }>();

  // Absolute position where the block's *content* begins.
  const contentStart = blockStart + 1;

  let offset = 0;
  block.forEach((child) => {
    const childStart = contentStart + offset;
    const childEnd = childStart + child.nodeSize;

    if (child.isText) {
      const childMarks = child.marks;
      const childMarkNames = new Set(childMarks.map((m) => m.type.name));

      // Close any marks that ended at the boundary before this text node.
      for (const [name, info] of openByType) {
        if (!childMarkNames.has(name)) {
          const syntax = syntaxForMark(info.mark);
          if (syntax) {
            decos.push(
              Decoration.widget(childStart, makeWidget(syntax, 1), {
                side: 1,
                ignoreSelection: true,
                key: `close:${name}:${childStart}`,
              }),
            );
          }
          openByType.delete(name);
        }
      }

      // Open marks that start at this text node.
      for (const mark of childMarks) {
        const name = mark.type.name;
        if (!openByType.has(name)) {
          const syntax = syntaxForMark(mark);
          if (syntax) {
            decos.push(
              Decoration.widget(childStart, makeWidget(syntax, -1), {
                side: -1,
                ignoreSelection: true,
                key: `open:${name}:${childStart}`,
              }),
            );
          }
          openByType.set(name, { mark, from: childStart });
        }
      }
    } else {
      // Non-text inline (e.g. a hard break, image, wikilink) — close any open
      // marks since ProseMirror marks don't span across non-text in practice.
      for (const [name, info] of openByType) {
        const syntax = syntaxForMark(info.mark);
        if (syntax) {
          decos.push(
            Decoration.widget(childStart, makeWidget(syntax, 1), {
              side: 1,
              ignoreSelection: true,
              key: `close:${name}:${childStart}`,
            }),
          );
        }
      }
      openByType.clear();
    }

    offset += child.nodeSize;
  });

  // Close any still-open marks at the end of the block.
  const blockEnd = contentStart + block.content.size;
  for (const [name, info] of openByType) {
    const syntax = syntaxForMark(info.mark);
    if (syntax) {
      decos.push(
        Decoration.widget(blockEnd, makeWidget(syntax, 1), {
          side: 1,
          ignoreSelection: true,
          key: `close:${name}:${blockEnd}`,
        }),
      );
    }
  }

  return decos;
}

// Entry point: compute all decorations for the given editor state.
// Only the block containing the selection head contributes decorations.
function computeDecorations(
  state: { doc: ProseMirrorNode; selection: { $head: { depth: number; before: (d: number) => number; node: (d: number) => ProseMirrorNode } } },
  isEditable: boolean,
): DecorationSet {
  if (!isEditable) return DecorationSet.empty;

  const $head = state.selection.$head;
  if ($head.depth < 1) return DecorationSet.empty;

  const blockStart = $head.before(1);
  const block = $head.node(1);

  if (!block.isBlock || block.isLeaf) return DecorationSet.empty;

  const inline = decorateInlineMarks(block, blockStart);

  return DecorationSet.create(state.doc, inline);
}

export const SyntaxReveal = Extension.create({
  name: "syntaxReveal",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init(_config, instance) {
            return computeDecorations(instance, editor.isEditable);
          },
          apply(tr, old, _oldState, newState) {
            // Recompute when the doc changes or the selection block may have changed.
            if (tr.docChanged || tr.selectionSet) {
              return computeDecorations(newState, editor.isEditable);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state) ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
```

- [ ] **Step 2: Do not commit yet.**

---

## Task 3: Extend the extension with block-prefix widgets (headings, blockquotes)

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts`

Add heading (`#…` before the heading's content) and blockquote (`> ` before each line inside the blockquote's child paragraphs) prefixes to the decoration set. This is additive — inline marks continue to work.

- [ ] **Step 1: Add a helper that emits block-prefix widgets**

Immediately before the `function computeDecorations(...)` declaration in `syntaxReveal.ts`, paste this helper:

```ts
// Emit a single block-prefix widget (e.g. "## ", "> ") at the start of the
// block's content. Returns at most one decoration.
function decorateBlockPrefix(
  block: ProseMirrorNode,
  blockStart: number,
): Decoration[] {
  const contentStart = blockStart + 1;

  if (block.type.name === "heading") {
    const level = typeof block.attrs.level === "number" ? block.attrs.level : 1;
    const syntax = "#".repeat(level) + " ";
    return [
      Decoration.widget(contentStart, makeWidget(syntax, -1), {
        side: -1,
        ignoreSelection: true,
        key: `prefix:heading:${level}:${contentStart}`,
      }),
    ];
  }

  if (block.type.name === "blockquote") {
    // Blockquotes wrap one or more child blocks (usually paragraphs).
    // Emit a "> " widget at the content-start of each direct child block.
    const decos: Decoration[] = [];
    let offset = 0;
    block.forEach((child) => {
      const childContentStart = contentStart + offset + 1;
      decos.push(
        Decoration.widget(childContentStart, makeWidget("> ", -1), {
          side: -1,
          ignoreSelection: true,
          key: `prefix:bq:${childContentStart}`,
        }),
      );
      offset += child.nodeSize;
    });
    return decos;
  }

  return [];
}
```

- [ ] **Step 2: Call the helper from `computeDecorations`**

In `syntaxReveal.ts`, find the block:

```ts
  if (!block.isBlock || block.isLeaf) return DecorationSet.empty;

  const inline = decorateInlineMarks(block, blockStart);

  return DecorationSet.create(state.doc, inline);
```

Replace it with:

```ts
  if (!block.isBlock || block.isLeaf) return DecorationSet.empty;

  const prefix = decorateBlockPrefix(block, blockStart);
  const inline = decorateInlineMarks(block, blockStart);

  return DecorationSet.create(state.doc, [...prefix, ...inline]);
```

- [ ] **Step 3: Do not commit yet.**

---

## Task 4: Add Backspace/Delete keymap that removes marks and block types

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts`

This is the "feel editable" half. Backspace next to an opening widget removes the corresponding mark; Delete next to a closing widget does the same. At the very start of a heading or blockquote, Backspace unwraps.

- [ ] **Step 1: Import the keymap plugin factory and commands**

At the top of `syntaxReveal.ts`, change the imports from:

```ts
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Mark } from "@tiptap/pm/model";
```

to:

```ts
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Mark } from "@tiptap/pm/model";
import { keymap } from "@tiptap/pm/keymap";
import { lift } from "@tiptap/pm/commands";
```

- [ ] **Step 2: Add the keymap helpers after `decorateBlockPrefix`**

In `syntaxReveal.ts`, after the closing brace of the `decorateBlockPrefix` function and before `computeDecorations`, insert:

```ts
// Inline-mark names whose syntax we reveal. Kept in a single source of truth
// so the keymap and the decoration walk stay aligned.
const REVEALED_MARK_NAMES = ["bold", "italic", "strike", "code"] as const;

// Find a mark on the character immediately before `pos` (Backspace target).
function markBefore(
  doc: ProseMirrorNode,
  pos: number,
): { mark: Mark; from: number; to: number } | null {
  if (pos <= 0) return null;
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const textOffset = $pos.parentOffset - 1;
  if (textOffset < 0) return null;
  // Walk parent children to find the character at textOffset.
  let remaining = textOffset;
  let found: Mark | null = null;
  parent.forEach((child) => {
    if (found !== null) return;
    if (child.nodeSize > remaining) {
      if (child.isText) {
        const relevant = child.marks.find((m) =>
          (REVEALED_MARK_NAMES as readonly string[]).includes(m.type.name),
        );
        found = relevant ?? null;
      }
    } else {
      remaining -= child.nodeSize;
    }
  });
  if (!found) return null;
  // Expand to the full contiguous run of this mark around pos.
  const parentStart = $pos.start();
  let from = pos;
  let to = pos;
  const foundMark: Mark = found;
  const hasMark = (at: number): boolean => {
    if (at <= parentStart || at > parentStart + parent.content.size) return false;
    const res = doc.resolve(at);
    const before = res.nodeBefore;
    if (!before || !before.isText) return false;
    return before.marks.some((m) => m.eq(foundMark));
  };
  while (hasMark(from)) from--;
  while (hasMark(to + 1)) to++;
  return { mark: foundMark, from, to };
}

// Symmetric helper for Delete: the character immediately after `pos`.
function markAfter(
  doc: ProseMirrorNode,
  pos: number,
): { mark: Mark; from: number; to: number } | null {
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;
  if (!parent.isTextblock) return null;
  const textOffset = $pos.parentOffset;
  if (textOffset >= parent.content.size) return null;
  let remaining = textOffset;
  let found: Mark | null = null;
  parent.forEach((child) => {
    if (found !== null) return;
    if (child.nodeSize > remaining) {
      if (child.isText) {
        const relevant = child.marks.find((m) =>
          (REVEALED_MARK_NAMES as readonly string[]).includes(m.type.name),
        );
        found = relevant ?? null;
      }
    } else {
      remaining -= child.nodeSize;
    }
  });
  if (!found) return null;
  const foundMark: Mark = found;
  const hasMark = (at: number): boolean => {
    const res = doc.resolve(at);
    const after = res.nodeAfter;
    if (!after || !after.isText) return false;
    return after.marks.some((m) => m.eq(foundMark));
  };
  let from = pos;
  let to = pos;
  while (hasMark(from - 1)) from--;
  while (hasMark(to)) to++;
  return { mark: foundMark, from, to };
}

function handleBackspace(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean {
  const { selection, doc, schema } = state;
  if (!selection.empty) return false;

  const pos = selection.$head.pos;
  const $head = selection.$head;

  // Case 1: cursor at start of a heading → turn into paragraph.
  if ($head.depth >= 1 && $head.parentOffset === 0) {
    const parent = $head.parent;
    if (parent.type.name === "heading") {
      if (dispatch) {
        const paragraphType = schema.nodes.paragraph;
        const tr = state.tr.setBlockType($head.before(1), $head.after(1), paragraphType);
        dispatch(tr);
      }
      return true;
    }
    // Case 2: cursor at start of a paragraph that is a direct child of a blockquote → lift out.
    if (parent.type.name === "paragraph" && $head.depth >= 2) {
      const grand = $head.node($head.depth - 1);
      if (grand.type.name === "blockquote") {
        return lift(state, dispatch);
      }
    }
  }

  // Case 3: cursor is adjacent to the right edge of a revealed mark → toggle that mark.
  const mb = markBefore(doc, pos);
  if (mb) {
    if (dispatch) {
      const tr = state.tr.removeMark(mb.from, mb.to, mb.mark);
      dispatch(tr);
    }
    return true;
  }

  return false;
}

function handleDelete(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const { selection, doc } = state;
  if (!selection.empty) return false;

  const pos = selection.$head.pos;
  const ma = markAfter(doc, pos);
  if (ma) {
    if (dispatch) {
      const tr = state.tr.removeMark(ma.from, ma.to, ma.mark);
      dispatch(tr);
    }
    return true;
  }
  return false;
}
```

- [ ] **Step 3: Add the missing `EditorState` / `Transaction` type imports**

Still in `syntaxReveal.ts`, update the top import block from:

```ts
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Mark } from "@tiptap/pm/model";
import { keymap } from "@tiptap/pm/keymap";
import { lift } from "@tiptap/pm/commands";
```

to:

```ts
import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode, Mark } from "@tiptap/pm/model";
import { keymap } from "@tiptap/pm/keymap";
import { lift } from "@tiptap/pm/commands";
```

(We don't actually need `TextSelection` after all; that's why it was removed.)

- [ ] **Step 4: Register the keymap plugin alongside the decoration plugin**

In `syntaxReveal.ts`, find:

```ts
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: pluginKey,
```

Replace it with:

```ts
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      keymap({
        Backspace: (state, dispatch, view) => {
          if (!editor.isEditable) return false;
          return handleBackspace(state, dispatch, view);
        },
        Delete: (state, dispatch) => {
          if (!editor.isEditable) return false;
          return handleDelete(state, dispatch);
        },
      }),
      new Plugin({
        key: pluginKey,
```

- [ ] **Step 5: Do not commit yet.**

---

## Task 5: Wire the new extension into the editor and remove the old one

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`
- Delete: `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`

- [ ] **Step 1: Replace the `MarkdownReveal`/`RawBlock` import**

In `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`, find:

```ts
import { MarkdownReveal, RawBlock } from "../extensions/markdownReveal";
```

Replace with:

```ts
import { SyntaxReveal } from "../extensions/syntaxReveal";
```

- [ ] **Step 2: Replace the extensions list entries**

In the same file, find:

```ts
      RawBlock,
      MarkdownReveal,
    ],
```

Replace with:

```ts
      SyntaxReveal,
    ],
```

- [ ] **Step 3: Remove the `rawSwap` transaction-meta handling**

Still in `MarkdownEditor.tsx`, find:

```ts
    onUpdate: ({ editor: ed }) => {
      if (rawSwapRef.current) {
        rawSwapRef.current = false;
        return;
      }
      if (!isRawMode) {
        const md = htmlToMarkdown(ed.getHTML());
        onChange?.(md);
      }
    },
    onSelectionUpdate: () => forceUpdate((n) => n + 1),
    onTransaction: ({ transaction }) => {
      if (transaction.getMeta("rawSwap")) {
        rawSwapRef.current = true;
      }
      forceUpdate((n) => n + 1);
    },
```

Replace with:

```ts
    onUpdate: ({ editor: ed }) => {
      if (!isRawMode) {
        const md = htmlToMarkdown(ed.getHTML());
        onChange?.(md);
      }
    },
    onSelectionUpdate: () => forceUpdate((n) => n + 1),
    onTransaction: () => {
      forceUpdate((n) => n + 1);
    },
```

- [ ] **Step 4: Drop the now-unused `rawSwapRef` declaration**

Still in `MarkdownEditor.tsx`, find:

```ts
  const rawSwapRef = useRef(false);
```

Delete that entire line. Then, if the file no longer uses `useRef` anywhere else, also update the React import. Check with Grep before removing — the file may still reference `useRef` for `timer` in other places.

To check, run:

```bash
grep -n useRef "/Users/kiro/My Projects/knowledge-base/src/app/knowledge_base/features/document/components/MarkdownEditor.tsx"
```

If only the removed line remains, update the import at the top of the file from (roughly):

```ts
import React, { useCallback, useEffect, useRef, useState } from "react";
```

to:

```ts
import React, { useCallback, useEffect, useState } from "react";
```

If other `useRef` usages remain, leave the import alone.

- [ ] **Step 5: Delete the old extension file**

```bash
rm "/Users/kiro/My Projects/knowledge-base/src/app/knowledge_base/features/document/extensions/markdownReveal.ts"
```

- [ ] **Step 6: Also update the re-export from `syntaxReveal.ts` so it doesn't import `markdownReveal.ts`**

No action needed — `syntaxReveal.ts` was written from scratch and does not import from `markdownReveal.ts`. This step is just a final audit.

- [ ] **Step 7: Do not commit yet.**

---

## Task 6: Lint everything touched

**Files:**
- No changes; this is a verification task.

- [ ] **Step 1: Run eslint on the touched files**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && npx eslint \
  src/app/knowledge_base/features/document/extensions/syntaxReveal.ts \
  src/app/knowledge_base/features/document/components/MarkdownEditor.tsx \
  src/app/globals.css
```

Expected: no errors originating from the changed code. The pre-existing `react-hooks/set-state-in-effect` error at `MarkdownEditor.tsx:188-191` (inside the `content`-sync effect we did not touch) is acceptable; do NOT fix it unless you also separately verify it's yours.

- [ ] **Step 2: If errors from your changes appear, fix them and re-run Step 1**

- [ ] **Step 3: Do not commit yet.**

---

## Task 7: Browser verification

**Files:**
- No file changes. Uses the `mcp__Claude_Preview__preview_*` tools and requires a `.md` document opened in the preview browser (File System Access API picker — the user opens a folder, then opens a `.md` file).

Because this adds a new ProseMirror plugin, the Tiptap editor re-initializes on the next mount — HMR will NOT pick up the extension list change. A full reload is required, which invalidates the FSA folder handle. Ask the user to re-open the folder after the reload.

- [ ] **Step 1: Ensure the dev server is running**

Use `mcp__Claude_Preview__preview_list` to find the dev server. If none is present, start it with `mcp__Claude_Preview__preview_start` (name: `"dev"`).

- [ ] **Step 2: Reload the page and have the user reopen the folder**

Use `mcp__Claude_Preview__preview_eval` to dispatch:

```js
window.location.reload()
```

Then ask the user to click "Open Folder" in the preview window and open a `.md` file with bold, italic, heading, and blockquote content. Tell them which document you need — e.g. `docs/architecture/bunny-net-video-migration.md` (known to contain a bold paragraph, headings, and code blocks) if they have that file available.

- [ ] **Step 3: Verify inline marks (bold)**

Scroll to a paragraph with bold text. Use `mcp__Claude_Preview__preview_click` to click into the paragraph, then `mcp__Claude_Preview__preview_eval`:

```js
(() => {
  const pm = document.querySelector('.ProseMirror');
  const syntax = [...pm.querySelectorAll('.md-syntax')].map(s => ({
    text: s.textContent,
    side: s.getAttribute('data-md-side'),
  }));
  return { revealedCount: syntax.length, samples: syntax.slice(0, 6) };
})()
```

Expected: at least one pair of `{ text: "**", side: "open" }` and `{ text: "**", side: "close" }` somewhere in the results. The box should NOT be visible (no monospace rawBlock).

- [ ] **Step 4: Verify rich rendering is still intact**

While the same paragraph is active, use `mcp__Claude_Preview__preview_inspect`:

```
selector: ".ProseMirror strong"
styles: ["font-weight"]
```

Expected: `font-weight` is `700` (or `bold`). The bold text is still visibly bold — the reveal does not flatten formatting.

- [ ] **Step 5: Verify heading prefix**

Click into an H2 heading. Use `mcp__Claude_Preview__preview_eval`:

```js
(() => {
  const syntax = [...document.querySelectorAll('.ProseMirror .md-syntax')]
    .map(s => s.textContent);
  return syntax;
})()
```

Expected: contains `"## "` (for H2) or `"# "`/`"### "` matching the heading level.

- [ ] **Step 6: Verify blockquote prefix**

Click into a blockquote. Repeat the eval from Step 5.

Expected: contains `"> "`.

- [ ] **Step 7: Verify moving out hides the reveal**

Click into a plain paragraph with no marks. Repeat the eval.

Expected: `[]` (empty — no syntax widgets).

- [ ] **Step 8: Verify Backspace removes a mark**

Click into the end of a bolded word. Use `mcp__Claude_Preview__preview_eval` to place the cursor at the boundary and press Backspace via a synthesized keydown. Actually — cleaner to drive it via a real key event. Use:

```js
(() => {
  const pm = document.querySelector('.ProseMirror');
  pm.focus();
  const ev = new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true });
  pm.dispatchEvent(ev);
  return {
    hasStrong: !!pm.querySelector('strong'),
    text: pm.textContent.slice(0, 80),
  };
})()
```

The check is fragile because ProseMirror may not accept synthesized key events from `dispatchEvent`. If the result doesn't reflect the intended toggle, do the manual check instead: ask the user to click into a bolded word, press Backspace once, and confirm via `preview_snapshot` that the bold has toggled off. Either outcome (successful automated test, or confirmed manual) is a pass.

- [ ] **Step 9: Verify read-only hides the reveal**

Click the "Read Mode" button (`button[aria-label="Enter Read Mode"]`) via `mcp__Claude_Preview__preview_click`. Then click into any block and eval:

```js
document.querySelectorAll('.ProseMirror .md-syntax').length
```

Expected: `0`. Turn Read Mode off again to continue testing.

- [ ] **Step 10: Verify raw mode is unchanged**

Click the "Raw" toggle in the toolbar (`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Raw').click()`). Confirm the monospace textarea appears with literal markdown. Switch back to WYSIWYG.

- [ ] **Step 11: Verify content round-trip**

With a syntax-revealed block active, use `mcp__Claude_Preview__preview_eval`:

```js
(() => {
  const pm = document.querySelector('.ProseMirror');
  // Widget spans should NOT appear in the serialized HTML output we'd save.
  const html = pm.innerHTML;
  return {
    hasMdSyntaxClassInHtml: html.includes('md-syntax'),
    htmlSnippet: html.slice(0, 500),
  };
})()
```

Note: `hasMdSyntaxClassInHtml` will be `true` because widgets are real DOM. That's fine — what matters is that **the serializer** doesn't see them. The markdown serializer (`htmlToMarkdown`) operates on `editor.getHTML()`, which **excludes decorations** by design. Confirm by eval:

```js
(() => {
  // Reach the Tiptap editor instance via React fiber... easier: toggle Raw mode.
  // Instead: grab the textarea after switching to Raw mode to see the markdown.
  const rawBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Raw');
  rawBtn?.click();
  const ta = document.querySelector('textarea.font-mono');
  const out = { rawStart: ta?.value?.slice(0, 200) };
  // Switch back to WYSIWYG.
  const wys = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'WYSIWYG');
  wys?.click();
  return out;
})()
```

Expected: `rawStart` contains normal markdown (`**bold**`, `## Heading`, etc.) with no extra or missing syntax characters.

- [ ] **Step 12: Screenshot for user proof**

Use `mcp__Claude_Preview__preview_screenshot` with a bold paragraph active, the `**` widgets visible in slate color, and the rich rendering intact.

- [ ] **Step 13: Report completion and do not commit**

Hand back to the user. They'll decide whether to commit.

---

## Task 8: Commit (only on explicit user request)

**Files:**
- No code change.

- [ ] **Step 1: Wait for the user to say "commit" (or equivalent)**

- [ ] **Step 2: Stage exactly the files that changed**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add \
  src/app/globals.css \
  src/app/knowledge_base/features/document/components/MarkdownEditor.tsx \
  src/app/knowledge_base/features/document/extensions/syntaxReveal.ts
git add -u src/app/knowledge_base/features/document/extensions/markdownReveal.ts
```

(The `-u` form stages the deletion of `markdownReveal.ts`.)

- [ ] **Step 3: Create the commit**

```bash
git commit -m "$(cat <<'EOF'
feat(document): inline syntax reveal, replacing block-swap reveal

The old MarkdownReveal extension swapped the active paragraph for a
raw-text rawBlock node, which broke the rich rendering. This replaces
it with a SyntaxReveal extension that uses ProseMirror widget
decorations to render markdown syntax characters (`**`, `_`, `~~`,
backticks, `#…`, `> `) around the marks and prefixes of the active
block while preserving the rich rendering in place.

A keymap intercepts Backspace/Delete adjacent to the revealed syntax
and toggles the corresponding mark or unwraps the block (heading →
paragraph; blockquote child → lifted paragraph). The plugin
short-circuits to an empty DecorationSet when the editor isn't
editable, so Read Mode shows no syntax chrome.

The MarkdownReveal extension, the RawBlock node, the rawSwap
transaction-meta handling in MarkdownEditor, and the rawSwapRef state
are all deleted.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Confirm**

```bash
git log --oneline -3
```

Expected: the new commit at HEAD with the message above.

---

## Self-review notes

**Spec coverage audit:**
- Goal: block preserves rich rendering → decoration-only approach, Task 2/3 cover marks + prefixes.
- Goal: syntax characters feel editable via Backspace/Delete → Task 4 keymap.
- Goal: read-only suppresses reveal → handled in both `computeDecorations` (for decorations) and the keymap handlers (early return on `!editor.isEditable`). Verified in Task 7 Step 9.
- Goal: raw mode unaffected → no change to the raw rendering path. Verified in Step 10.
- Non-goal: direct char deletion → explicit: widgets are `ignoreSelection: true` and not selectable.
- Non-goal: link/image/wiki-link reveal → `syntaxForMark` returns `null` for anything besides the four inline marks. Correctly out of scope.
- Removal of old extension → Task 5 deletes the file and all references.

**Type consistency audit:**
- `REVEALED_MARK_NAMES` in Task 4 covers exactly the four marks that `syntaxForMark` in Task 2 handles. Keeping them together would be cleaner but the helpers live in the same file, so proximity substitutes.
- Function signatures (`decorateInlineMarks`, `decorateBlockPrefix`, `computeDecorations`, `handleBackspace`, `handleDelete`, `markBefore`, `markAfter`) are all self-contained within the file.
- No cross-task naming drift — every name introduced in a task is used exactly as defined.

**Placeholder audit:**
- No "TBD", "TODO", or "add error handling".
- Every code step shows complete code.
- No "similar to Task N" — each task's code is self-contained.

**Known sharp edges documented in Task 7:**
- Synthetic `KeyboardEvent.dispatchEvent` on `.ProseMirror` may not drive ProseMirror's keymap in every browser. Step 8 includes the manual-verification fallback.
- Pre-existing eslint error at `MarkdownEditor.tsx:188-191` is explicitly flagged as out-of-scope in Task 6.
