# Inline Markdown Syntax Reveal — Design

## Context

The document editor currently uses a `MarkdownReveal` extension that, when the cursor enters a paragraph, heading, or blockquote, swaps the entire block out for a `rawBlock` node. The swapped block renders as a monospace text area showing raw markdown (`**bold**`, `# Heading`). This feels like a mode-switch inside the block and loses the rich visual rendering.

The user wants the block to **keep its rich visual rendering** when active (bold still renders bold, heading still shows at heading size) while making the **markdown syntax characters visible and editable** inline. Typora's "source/preview hybrid" feel.

## Goals

- Clicking into a block reveals markdown syntax characters around the block's marks and before its prefix, without changing the block's visual rendering.
- Moving out of the block hides the syntax characters again.
- The syntax characters feel "editable" — pressing Backspace/Delete adjacent to them removes the corresponding mark or unwraps the block type.
- Read-only mode suppresses the reveal entirely.
- Raw mode is unaffected (that's a separate display mode).

## Non-goals

- Full character-by-character editing of the syntax chars (they are widget decorations, not real document text). Removal happens by mark/node manipulation, not by deleting individual `*` chars.
- Syntax reveal for links `[text](url)`, images `![alt](url)`, or wiki-links `[[path]]`. These need their own UX because of the URL and alt-text components. Deferred.
- Lists, horizontal rules, tables, code blocks. Lists don't need reveal (bullets are already visible markdown). Code blocks are atomic.
- Persisting the reveal state across sessions — it's purely driven by cursor position.

## Architecture

### New extension: `SyntaxReveal`

File: `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts`

A Tiptap `Extension.create` that registers:

1. **A ProseMirror plugin** with a `DecorationSet` state field. On every transaction:
   - Find the top-level block containing `selection.$head`.
   - Walk that block's content, emitting widget decorations at:
     - The start and end of each inline mark range (bold → `**`, italic → `_`, strike → `~~`, inline code → `` ` ``).
     - The very start of the block if it's a heading (`#` ×N with trailing space) or blockquote (`>` with trailing space).
   - Store the resulting `DecorationSet` in the plugin state.

2. **A `decorations` prop** returning the stored `DecorationSet` for rendering.

3. **A keymap handler** (via `addKeyboardShortcuts` or a separate PM plugin) that handles `Backspace` and `Delete`:
   - If cursor is at a position adjacent to a syntax widget, compute which mark/node the widget belongs to and dispatch the appropriate command (`toggleMark`, `setNode('paragraph')`, `lift`).
   - Otherwise fall through to default handling.

### Widget design

Each decoration is a `Decoration.widget(pos, toDOM, spec)` where `toDOM` returns a `<span class="md-syntax">` with the syntax text inside. Widgets are `side: -1` for opening syntax and `side: 1` for closing, so they sit correctly relative to text positions. They use `ignoreSelection: true` so selection doesn't get trapped inside.

### Active-only rendering

The plugin recomputes decorations whenever the selection's containing block changes. Decorations are ONLY generated for the block under the cursor. All other blocks render clean (no syntax visible).

### Interaction with read-only mode

The plugin checks `editor.isEditable` at the start of its computation. When false, it returns an empty `DecorationSet`. This keeps read mode clean.

### Interaction with raw-markdown mode

The `SyntaxReveal` plugin only runs when the WYSIWYG editor is mounted (which is how Tiptap extensions work). Raw mode renders a `<textarea>` with no Tiptap involvement, so no change there.

## Removal of current behavior

The existing `MarkdownReveal` extension and `RawBlock` node are removed entirely:

- `markdownReveal.ts` is **deleted**.
- `MarkdownEditor.tsx` no longer imports `MarkdownReveal` or `RawBlock`.
- The custom `onTransaction`/`onUpdate` logic that tracks `rawSwap` transaction metadata is removed, since no block-swap transactions are generated anymore.

## Files touched

| File | Change |
|---|---|
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | **Delete** |
| `src/app/knowledge_base/features/document/extensions/syntaxReveal.ts` | **Create** |
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | Swap extensions, drop `rawSwap` handling |
| `src/app/globals.css` | Add `.md-syntax { color: #94a3b8; }` plus related selectors |

## Styling

A single span class `.md-syntax`:
- Color: muted slate (`#94a3b8` / `text-slate-400`)
- Font: inherits from parent (so syntax chars sit in the same typeface as the rendered text)
- No background, no border, no box
- `user-select: none` so they can't be part of a drag-selection — treat them as pure UI chrome, not content

## Keymap details

The keymap is the complex part. Pseudocode for `Backspace`:

```
onBackspace:
  pos = selection.head
  if selection is not collapsed: fall through
  // Check for a mark just before the cursor
  if text to the left has a mark that ends exactly at pos:
    remove that mark across its range
    return true
  // Check for a block prefix widget (heading or blockquote)
  if pos is at the start of a heading block:
    change block type to paragraph
    return true
  if pos is at the start of a blockquote's first child:
    lift out of blockquote
    return true
  // Otherwise fall through
  return false
```

`Delete` is symmetric: look to the right.

For opening syntax widgets (e.g., `**` on the left of bold text), the "adjacent" Backspace position is inside the mark range just after the opening widget. We detect that by checking if the position-1 character has the mark.

For closing syntax widgets (e.g., `**` on the right of bold text), the Delete position is inside the mark range just before the closing widget. Similar detection.

## Verification

Perform these with the preview MCP tools on a real `.md` document:

1. **Activation:** Click into a paragraph with bold. Widget `**` appears on both sides of the bolded word. Move cursor to another paragraph — widgets disappear.
2. **Rich rendering preserved:** The bolded word still renders bold. Heading still renders at heading size. Blockquote still has its left bar.
3. **Heading prefix:** Click into an H2 → `## ` appears at start. Click into H3 → `### ` appears.
4. **Blockquote prefix:** Click into a blockquote → `> ` appears at start of the first line.
5. **Remove via Backspace:** With cursor at the inside of an opening `**` widget, press Backspace. Bold is toggled off; widgets disappear; text no longer renders bold.
6. **Remove heading via Backspace:** Cursor at position 0 of H2 → Backspace → becomes a paragraph; `## ` widget gone.
7. **Read-only mode:** Toggle lock. No syntax reveal anywhere, even on the active block.
8. **Raw mode:** Switch to raw. Textarea shows real markdown (no change).
9. **Nested marks:** Bold+italic word shows all four delimiters (`**_word_**`). Backspace at the appropriate position toggles the outer or inner mark correctly.
10. **No regressions:** Typing into a revealed block still produces rich text output in the markdown serializer. Save/reload preserves the content correctly.

## Risks

- **Nested/overlapping marks:** ProseMirror allows a single character to carry multiple marks. The decoration walk must correctly emit opening widgets in mark-nesting order and closing widgets in reverse order.
- **Input rules conflict:** Tiptap's input rules (e.g., typing `**text**` auto-bolds) could fight with live reveal. Input rules run on input; the reveal plugin runs on selection change. They should not conflict, but verification #10 covers this.
- **Cursor positioning around widgets:** `side: -1` vs `side: 1` matters for whether the cursor sits before or after a widget. Getting this wrong produces weird caret behavior (cursor "sticks" to a widget).
- **Serialization round-trip:** The existing `htmlToMarkdown` / `markdownToHtml` converters are untouched — widgets aren't in the document, so round-trip is unaffected. Confirmed by design; still verify in step #10.

## Out of scope for this spec

- Link/image/wiki-link reveal — tracked as followup.
- Performance tuning for very large documents — premature.
- Customizable syntax colors / theme integration — default muted slate is fine.
