# Raw Markdown Reveal Inside Table Cells — Design

## Context

`MarkdownReveal` (`src/app/knowledge_base/features/document/extensions/markdownReveal.ts`) swaps the paragraph/heading/blockquote under the cursor for a `rawBlock` node so the user sees live markdown syntax. It already handles two contexts:

- Top-level convertible blocks (paragraphs, headings, blockquotes at the document root).
- Convertible blocks inside list items (`bulletList`, `orderedList`, `taskList`) — `appendTransaction` descends from the list's top-level node down to the paragraph inside the specific list item the cursor sits in. This required loosening `listItem` / `taskItem` content from `paragraph block*` to `(paragraph | rawBlock) block*` (see `RawAwareListItem` / `RawAwareTaskItem` in `MarkdownEditor.tsx`).

Tables are the third natural nesting context — Tiptap's `TableCell` and `TableHeader` are both `content: "block+"`, so clicking into a cell should reveal its paragraph as raw markdown the same way a list item does. Today that doesn't happen: `$head.node(1)` is the `table` node, the walker doesn't recognise it, `curPos` stays `-1`, and no conversion occurs.

A second problem surfaces as soon as reveal in cells starts working: `tableToMarkdown` in `markdownSerializer.ts` serializes each cell via `cell.textContent`. That strips every mark. Today this is largely hidden because cells rarely carry marks, but once users can type `**bold**` in a cell and watch it render as **bold** after moving away, the next save would emit just `bold` and the formatting would be silently lost. Fixing the reveal without fixing the serializer produces a feature that looks like it works until the first save.

## Goals

- Clicking (or navigating via arrow / Tab) into a paragraph inside a `tableCell` or `tableHeader` converts that paragraph to a `rawBlock` showing raw markdown syntax; moving the cursor out restores it to rich rendering.
- Inline markdown in cells (`**bold**`, `*italic*`, `~~strike~~`, `` `code` ``, `[text](url)`, `[[wiki-link]]`) round-trips correctly through save and reload.
- Enter, Backspace, Tab, and Shift-Tab inside a raw cell behave intuitively and do not escape the table.
- Literal `|` typed in cell content does not break table structure on save.

## Non-goals

- Block-level markdown constructs inside cells (headings, blockquotes, lists, code blocks, horizontal rules). Markdown tables cannot represent these; the serializer can't round-trip them. The `CONVERTIBLE` set is unchanged (paragraph / heading / blockquote), but inside a table we will only ever encounter paragraphs because users cannot produce the others there via the toolbar or input rules.
- Loosening `tableCell` / `tableHeader` schemas. They already allow `block+`, so `rawBlock` is a valid child with no schema extension.
- Changes to `rawBlock`'s `isolating: true` or `defining: true` flags. They stay — `isolating` in particular is what keeps content from bleeding across cell boundaries during Backspace.
- Syntax-decoration changes. `buildSyntaxDecorations` already walks every `rawBlock` in the doc via `doc.descendants`, so cell rawBlocks get bold/italic/strike/code decorations for free.

## Approach

Three focused changes, each in an existing file. No new files.

### 1. Extend the descent walker (`markdownReveal.ts`)

Rename `LIST_TYPES` → `DEEP_WRAPPERS` and add `"table"` to it:

```ts
const DEEP_WRAPPERS = new Set([
  "bulletList",
  "orderedList",
  "taskList",
  "table",
]);
```

The existing inner loop is already generic — it walks from depth 2 through `$head.depth` looking for the first `CONVERTIBLE` block:

```ts
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
```

For a cursor in `doc(0) → table(1) → tableRow(2) → tableCell(3) → paragraph(4)`, this finds the paragraph at depth 4. No other change to `appendTransaction` is needed:

- `cursorInRaw` uses position-range arithmetic, not depth, so it keeps a rawBlock raw regardless of nesting.
- `rawBlockToRichNodes` parses the rawBlock's markdown via `markdownToHtml` and returns nodes that fit the parent; a single-paragraph result inserts cleanly into a `block+` cell.
- `richBlockToRawFragment` doesn't care about ancestry.
- Position-mapping after restore works at any depth because it uses `tr.mapping.map`.

### 2. Serialize cell content via `nodeToMarkdown` (`markdownSerializer.ts`)

Replace the flat `textContent` approach with a `cellToMarkdown` helper:

```ts
function cellToMarkdown(cell: HTMLElement): string {
  const parts: string[] = [];
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = (child.textContent ?? "").trim();
      if (t) parts.push(t);
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    if (el.hasAttribute("data-raw-block")) {
      // The raw view's content is already raw markdown (syntax chars + link
      // marks + wikiLink spans). Walk children via nodeToMarkdown so link
      // marks emit [text](url) and wikiLinks emit [[...]], then trim to
      // drop the trailing \n\n that the data-raw-block branch appends.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "p") {
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    // Fallback (shouldn't occur inside a cell today): emit whatever
    // nodeToMarkdown produces, trimmed.
    const rendered = nodeToMarkdown(el).trim();
    if (rendered) parts.push(rendered);
  }
  // GFM treats <br> as a soft break within a cell; markdownToHtml accepts it
  // on parse, so multi-block cells round-trip as a single cell with <br>
  // separators.
  const joined = parts.join("<br>");
  // Escape bare pipes so user-typed | doesn't break table structure.
  return joined.replace(/\|/g, "\\|");
}
```

And wire it into `tableToMarkdown`:

```ts
function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(cellToMarkdown).join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}
```

Notes:

- Pipe escaping is conservative — it escapes every `|`, including ones inside `[text|with|pipes](url)` link syntax. Markdown-it accepts `\|` in table cells as a literal pipe, and on parse it converts `\|` → `|`. Round-trip is lossless.
- Escaping is applied to the joined output so it also catches pipes that appear inside link text.
- The `data-raw-block` branch's inner text already contains syntax chars that we want preserved verbatim (a rawBlock showing `**bold**` should serialize as `**bold**`), but link marks inside it need the `[text](url)` treatment — that's why we walk its children via `nodeToMarkdown` rather than using `textContent`.

### 3. Enter, Backspace, Tab polish (`markdownReveal.ts`)

The existing keyboard handlers already do the right thing in cells in most cases. Verify and add only the smallest necessary fallback.

**Enter** — existing `Enter` handler on `RawBlock`:

1. Walks up ancestry to find `rawBlockNode` (found, in the cell) and `listItemNode` (not found).
2. Falls through to Case 2: `tr.split(cursorPos, 1, [{ type: paragraph }])`.

Case 2 splits the rawBlock at depth 1, producing `[rawBlock, paragraph]` siblings inside the cell (valid because cells allow `block+`). The paragraph gets the cursor; `MarkdownReveal.appendTransaction` converts it to a rawBlock on the next tick. Result: two rawBlocks stacked in the cell, which the serializer joins with `<br>` — the same UX as Enter inside a list item, only inside a cell.

If live testing reveals `tr.split` is rejected (`rawBlock`'s `isolating: true` may refuse the split; needs empirical verification), add Case 3: hand-build the transaction by cutting `rawBlockNode.content` at `cursorOffset`, creating a new rawBlock for the before-half and a paragraph for the after-half, and using `tr.replaceWith(rawBlockPos, rawBlockPos + rawBlockNode.nodeSize, [beforeRawBlock, afterParagraph])`. This mirrors Case 1's structure without the list-item-specific wrapper rebuild.

**Backspace** — existing `Backspace` handler bails at `$head.depth !== 1`. Inside a cell, depth is ≥ 4 (`doc → table → row → cell → rawBlock`), so the guard fires and the event falls through to ProseMirror's default chain. Default handling inside a cell:

- If there's a previous sibling block in the cell, `joinBackward` merges the rawBlock into it. The `isolating: true` flag actually blocks this merge, which means the user has to delete the rawBlock's content first — acceptable, same as the existing top-level behaviour when prev is a non-textblock.
- If there's no previous sibling (rawBlock is the first block in the cell), PM's default does nothing; the Table extension's `deleteTableWhenAllCellsSelected` only runs on full-cell selections. That's the right behaviour — Backspace shouldn't delete the cell or escape the table from a half-empty rawBlock.

No Backspace changes needed.

**Tab / Shift-Tab** — handled entirely by `@tiptap/extension-table` (`goToNextCell(1)` / `goToNextCell(-1)`). The selection update from the cell move triggers `MarkdownReveal.appendTransaction`, which restores the source cell's rawBlock to rich content and converts the destination cell's paragraph to a rawBlock. No handler changes needed.

### 4. Hard-break preservation in `richBlockToRawFragment` (`markdownReveal.ts`)

Once `cellToMarkdown` joins multi-block cells with `<br>`, reloading the markdown produces cells whose paragraph contains a `hardBreak` node (Tiptap's `HardBreak` extension parses `<br>` into `hardBreak`). On the *next* focus of that cell, `richBlockToRawFragment` walks the paragraph's inline descendants to build the rawBlock content — but today it silently drops `hardBreak`:

```ts
const visit = (n: ProseMirrorNode) => {
  n.forEach((child) => {
    if (child.isText && child.text != null) { /* text branch */ }
    else if (wikiLinkType && child.type === wikiLinkType) { /* wikiLink branch */ }
    else if (!child.isLeaf) { visit(child); }
    // hardBreak is a leaf, not text, not wikiLink → falls off the end, lost.
  });
};
```

Add a branch for `hardBreak`:

```ts
} else if (child.type.name === "hardBreak") {
  // Emit as markdown's hard-break syntax: two trailing spaces + newline.
  // markdownToHtml on restore re-parses this to a <br>, which Tiptap's
  // HardBreak extension maps back to a hardBreak node. Round-trip preserved.
  children.push(schema.text("  \n"));
}
```

This also benefits the pre-existing top-level / list-item reveal paths: any document where a user hit Shift+Enter in a paragraph (producing a hardBreak) will now preserve the break when the paragraph is revealed. Before this change, entering such a paragraph silently collapsed the break.

Correspondingly, `rawBlockToRichNodes` already works: the concatenated markdown string containing `  \n` feeds into `markdownToHtml` → `<br>` → parsed back to `hardBreak`. No change needed there.

## Data Flow

```
Click / Tab into cell
  → selection update
  → MarkdownReveal.appendTransaction
  → DEEP_WRAPPERS walker descends table → row → cell → paragraph
  → paragraph replaced by rawBlock (richBlockToRawFragment)
  → syntax-decoration plugin adds <strong>/<em>/<s>/<code> decorations on next docChanged

Click / Tab out of cell
  → selection update
  → MarkdownReveal.appendTransaction
  → rawBlockToRichNodes(rawBlock) → paragraph with inline marks
  → inserted into cell via tr.replaceWith

Save (debounced onUpdate)
  → htmlToMarkdown(editor.getHTML())
  → nodeToMarkdown walks doc
  → <table> branch → tableToMarkdown
  → cellToMarkdown(cell) per cell, preserving marks, escaping pipes, joining multi-block with <br>
```

## Error Handling

- **`tr.split` rejection inside a cell**: try/catch in the existing Enter handler already returns `false` on failure, which hands the event back to ProseMirror. If this becomes the observed path in testing, add the hand-built Case 3 described above.
- **`rawBlockToRichNodes` produces a non-paragraph node** (e.g., user types `# Hello` in a cell): `markdownToHtml` parses that as a heading, `PMDOMParser` returns a heading node, and inserting a heading into a `tableCell` is schema-valid (`block+`). But a heading inside a cell can't serialize back through markdown. Mitigation: the `CONVERTIBLE` set and the block-prefix logic in `richBlockToRawFragment` mean we never originate a heading/blockquote prefix from a cell paragraph — so a user would have to actively type `# ` at the start of a cell's raw view to hit this. Accept the limitation: the heading renders rich after blur, then serialization emits it inline (via `cellToMarkdown`'s fallback branch running `nodeToMarkdown` on the `<h1>` element, which produces `# Hello\n\n`; the trailing newlines get trimmed, and the `#` remains as literal text in the output cell). Round-trips once more as a paragraph.
- **Atomic cell content** (wiki-link as the only content, empty rawBlock): `rawBlockToRichNodes` returns `[]` for empty content and the restore path falls back to an empty paragraph. `cellToMarkdown`'s filter drops empty parts. A cell containing only a wiki-link emits `[[path]]` with no surrounding text.

## Testing

Manual test cases. This repo does not have a unit-test harness for Tiptap extensions; verify in the running app after each change.

1. **Basic reveal**: create a table with `hello **world**` in one cell; click into the cell → the paragraph becomes a rawBlock showing `hello **world**`; syntax decorations render `world` bold. Click out → reverts to rich.
2. **Round-trip via save**: type `*italic*` in a cell, click away, observe rich italic, trigger save (blur), reload from markdown → italic preserved as a mark.
3. **Enter inside raw cell**: press Enter in the middle of a raw cell → splits into two rawBlocks in the cell. Click out → both restore to rich (one paragraph with a hardBreak in the middle, after the multi-block cell is flattened via `<br>` and reloaded). Save → cell markdown contains `\|`-escaped content with `<br>`.
4. **Hard-break round-trip**: a cell ending up as `foo<br>bar` on save, reloaded, re-focused → the raw view shows `foo  \nbar` (two spaces + newline) and the break survives a round trip.
5. **Backspace in cell**: Backspace at offset 0 of the first rawBlock in a cell → no escape from the table; cell stays intact. Backspace at offset 0 of a second rawBlock in a cell → no cross-cell merge (isolating).
6. **Tab navigation**: Tab from one cell to the next → source cell restores to rich, destination cell's paragraph becomes a rawBlock. Shift-Tab reverses the direction.
7. **Pipe in cell**: type `a | b` in a raw cell → saves as `| a \| b |`; reload → cell shows `a | b` again.
8. **Wiki-link in cell**: type `[[page]]` → saved as `| [[page]] |`; reload → wiki-link node in cell (blue / red depending on existence).
9. **Header row**: all of the above but on the first row (tableHeader instead of tableCell) — behaviour is identical because both nodes share `content: "block+"` and both serialize via `cellToMarkdown`.
10. **Read-only mode**: with `readOnly: true`, clicking into a cell does not reveal the raw view (the `canReveal` gate already handles this).
11. **Non-regression**: top-level paragraphs, headings, blockquotes, and list-item paragraphs still reveal correctly; nothing about the Case 2 Enter or Case 1 list-item Enter changes.

## Open Questions

- `tr.split` behaviour inside an `isolating: true` rawBlock inside a `block+` parent is worth verifying early. If it fails, we're an hour away from Case 3; if it works, there's no code change in the Enter handler at all.
- `cellToMarkdown`'s pipe-escape regex is coarse — it escapes inside URLs too. In practice URLs rarely contain `|`; if they do, markdown-it accepts `\|` in a `]` segment so the link round-trips. Worth re-examining if a specific failure mode appears.
