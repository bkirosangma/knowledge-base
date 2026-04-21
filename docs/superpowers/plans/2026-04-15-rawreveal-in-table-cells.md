# Raw Markdown Reveal Inside Table Cells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the cursor enters a paragraph inside a `tableCell` or `tableHeader`, reveal the raw markdown the same way the existing feature works for top-level blocks and list items; keep inline formatting (marks, links, wiki-links, hard breaks) lossless across the save → markdown → reload cycle.

**Architecture:** Three small, local edits — one to extend `MarkdownReveal`'s descent walker to recognise tables, one to replace `tableToMarkdown`'s `textContent` flattening with a mark-preserving `cellToMarkdown` helper, and one to teach `richBlockToRawFragment` about `hardBreak` nodes. No new files, no schema changes (both `tableCell` and `tableHeader` are already `content: "block+"`).

**Tech Stack:** Tiptap v3 (React), `@tiptap/extension-table` / `extension-table-cell` / `extension-table-header`, ProseMirror state/view/model primitives, markdown-it.

**Spec:** `docs/superpowers/specs/2026-04-15-rawreveal-in-table-cells-design.md`

**Note on testing:** This project has no unit/integration test framework. Verification uses the `mcp__Claude_Preview__preview_*` tools against the Next.js dev server, the same way every recent editor change in this repo has been verified. A real `.md` document must be opened in the preview browser (via the File System Access API picker) before running the browser-driven verification steps.

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` | 1) Rename `LIST_TYPES` → `DEEP_WRAPPERS` and add `"table"` (line 27). 2) Update the `} else if (LIST_TYPES.has(top.type.name))` branch in `appendTransaction` (line 629) to match the new name. 3) Add a `hardBreak` branch inside the `visit()` closure in `richBlockToRawFragment` (around line 94). |
| `src/app/knowledge_base/features/document/extensions/markdownSerializer.ts` | Add a `cellToMarkdown(cell)` helper before `tableToMarkdown` (around line 107) and update `tableToMarkdown` (line 108) to call it per cell instead of using `cell.textContent`. |

No other files are touched. No schema-extending wrappers (`RawAwareTableCell` etc.) — the stock Tiptap cell/header schemas already accept `block+`.

---

## Task 1: Extend the descent walker into tables

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`

This task alone makes clicking into a cell reveal its paragraph as a rawBlock. Save fidelity is addressed in Task 2; hard-break preservation in Task 3. After Task 1, saving a cell that has `**bold**` typed into it will still emit `bold` without asterisks — that regression is expected until Task 2 lands, and both tasks ship in the same branch.

- [ ] **Step 1: Read the current wrapper constant and its docstring to confirm context**

Run the Read tool on `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` with `offset=20`, `limit=15` to confirm lines 21–34 are:

```ts
// Block types that can be converted to raw editing mode
const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);
// Top-level wrappers we descend into to find a deeper convertible block.
// Lists themselves can't become a rawBlock (their schema is `listItem+`), so
// when the cursor is in a list we walk down to the paragraph inside the
// specific list item the cursor sits in — siblings stay rich.
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
```

- [ ] **Step 2: Rename `LIST_TYPES` → `DEEP_WRAPPERS`, add `"table"`, update the comment**

Use the Edit tool. The replacement updates both the comment (now covering tables) and the set itself:

```ts
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
```

Edit:
- `old_string`:
```
// Block types that can be converted to raw editing mode
const CONVERTIBLE = new Set(["paragraph", "heading", "blockquote"]);
// Top-level wrappers we descend into to find a deeper convertible block.
// Lists themselves can't become a rawBlock (their schema is `listItem+`), so
// when the cursor is in a list we walk down to the paragraph inside the
// specific list item the cursor sits in — siblings stay rich.
const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);
```
- `new_string`:
```
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
```

- [ ] **Step 3: Update the reference inside `appendTransaction`**

Still in `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`, line 629. The current code reads:

```ts
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
```

Edit:
- `old_string`: `            } else if (LIST_TYPES.has(top.type.name)) {`
- `new_string`: `            } else if (DEEP_WRAPPERS.has(top.type.name)) {`

No other lines need touching — the inner `for` loop already walks from depth 2 through `$head.depth` and works for any descent depth, including `doc(0) → table(1) → row(2) → cell(3) → paragraph(4)`.

- [ ] **Step 4: Verify the file still typechecks**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Exits 0, no new errors. If there are pre-existing errors unrelated to `markdownReveal.ts`, they are acceptable (this repo doesn't gate on a clean tsc run).

- [ ] **Step 5: Rebuild the graphify code index so future sessions see the rename**

Run:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
Expected: Exits 0. The repo's `CLAUDE.md` asks for this after meaningful code changes.

- [ ] **Step 6: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/extensions/markdownReveal.ts graphify-out
git commit -m "$(cat <<'EOF'
feat(document): reveal raw markdown inside table cells

Rename LIST_TYPES → DEEP_WRAPPERS, add "table", and update the one
appendTransaction branch that referenced it. The inner walker loop
already descends through arbitrary depth, so cursor in
doc → table → row → cell → paragraph now lands on the paragraph and
converts it to a rawBlock the same way list-item paragraphs do.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Preserve inline formatting when serializing table cells

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/markdownSerializer.ts`

Today `tableToMarkdown` at line 108 does `c.textContent` per cell, which strips every mark. After Task 1 a user can type `**bold**` in a cell and see it render rich after blur — but on save `textContent` emits `bold`. This task replaces `textContent` with a `cellToMarkdown(cell)` helper that walks children via `nodeToMarkdown`, handles `[data-raw-block]`, joins multi-block cells with `<br>`, and escapes bare pipes.

- [ ] **Step 1: Confirm the serializer's current shape**

Run the Read tool on `src/app/knowledge_base/features/document/extensions/markdownSerializer.ts` with `offset=100`, `limit=25` to confirm lines 100–124 match:

```ts
    case "div": return children;
    default: return children;
  }
}

function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(c => c.textContent?.trim() ?? "").join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}
```

- [ ] **Step 2: Insert the `cellToMarkdown` helper and rewrite `tableToMarkdown` to use it**

Use the Edit tool on `src/app/knowledge_base/features/document/extensions/markdownSerializer.ts`.

- `old_string`:
```ts
function tableToMarkdown(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll("tr"));
  if (rows.length === 0) return "";
  const lines: string[] = [];
  rows.forEach((row, i) => {
    const cells = Array.from(row.querySelectorAll("th, td"));
    const line = "| " + cells.map(c => c.textContent?.trim() ?? "").join(" | ") + " |";
    lines.push(line);
    if (i === 0) {
      lines.push("| " + cells.map(() => "---").join(" | ") + " |");
    }
  });
  return lines.join("\n");
}
```
- `new_string`:
```ts
// Serialize one table cell to its markdown form. Unlike the rest of
// `nodeToMarkdown`, we can't emit block-level output here: a markdown table
// cell lives on a single line between `|` delimiters. So we unwrap
// paragraph / rawBlock children to their inline markdown, join multiple
// children with `<br>` (GFM accepts it as a soft break inside cells), and
// escape any literal `|` the user typed so it doesn't split the row.
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
      // Raw-view content is already markdown syntax (asterisks, backticks,
      // etc.) plus link marks and wikiLink spans. Walking children via
      // nodeToMarkdown keeps link `[text](url)` and wiki `[[path]]` intact;
      // the final trim drops the trailing `\n\n` that the data-raw-block
      // branch in nodeToMarkdown appends for block context.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    const tag = el.tagName.toLowerCase();
    if (tag === "p") {
      // Walk inline children so marks survive (<strong>x</strong> → **x**).
      // Trim to drop the trailing `\n\n` from the "p" case in nodeToMarkdown.
      const inner = Array.from(el.childNodes).map(nodeToMarkdown).join("").trim();
      if (inner) parts.push(inner);
      continue;
    }
    // Fallback for anything else a user might manage to drop into a cell
    // (headings, blockquotes, etc.). Inline the result; the trailing
    // newlines get trimmed and the block prefix (`# `, `> `) survives as
    // literal text. Markdown tables can't represent block-level cell
    // content, so this is a best-effort round-trip.
    const rendered = nodeToMarkdown(el).trim();
    if (rendered) parts.push(rendered);
  }
  // GFM + markdown-it (with html:true) accept inline `<br>` inside a cell
  // and round-trip it to a hard break in the re-parsed HTML.
  const joined = parts.join("<br>");
  // Escape every bare `|` (including inside link text) so user content
  // doesn't break row parsing. markdown-it converts `\|` back to `|`.
  return joined.replace(/\|/g, "\\|");
}

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

- [ ] **Step 3: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Exits 0. `cellToMarkdown` uses only browser DOM APIs and the existing `nodeToMarkdown`, no new imports needed.

- [ ] **Step 4: Rebuild the graphify code index**

Run:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
Expected: Exits 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/extensions/markdownSerializer.ts graphify-out
git commit -m "$(cat <<'EOF'
feat(document): preserve inline formatting when saving table cells

Replace `tableToMarkdown`'s per-cell `textContent` flatten with a new
`cellToMarkdown` helper that walks children via `nodeToMarkdown`, so
marks (bold, italic, strike, code, link, wiki-link) round-trip
through save. Multi-block cells join with `<br>` (GFM-compatible), and
bare `|` characters are escaped as `\|` so user-typed pipes don't
split rows.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Preserve hard breaks when revealing a paragraph

**Files:**
- Modify: `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`

Once Task 2 emits `<br>` for multi-block cells, reloading that markdown puts a `hardBreak` node inside the cell's paragraph (Tiptap's `HardBreak` extension from StarterKit parses `<br>` into a `hardBreak` node). On the next focus of that cell, `richBlockToRawFragment` walks the paragraph's inline descendants to build the rawBlock content — but today the walker has no branch for `hardBreak`. It's a leaf (not text, not wikiLink), so the `!child.isLeaf` recursion skips it and the break is silently dropped.

Emitting `"  \n"` (two trailing spaces + newline, CommonMark's hard-break form) keeps it lossless: `markdownToHtml` on restore turns that back into `<br>`, which Tiptap re-parses to a `hardBreak` node. This also fixes a pre-existing top-level bug — any paragraph where the user hit Shift+Enter previously lost the break on reveal.

- [ ] **Step 1: Read the `visit` closure to confirm the insertion point**

Run the Read tool on `src/app/knowledge_base/features/document/extensions/markdownReveal.ts` with `offset=68`, `limit=35` to confirm lines 70–100 include:

```ts
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
```

- [ ] **Step 2: Insert a `hardBreak` branch before the `!child.isLeaf` fallback**

Use the Edit tool on `src/app/knowledge_base/features/document/extensions/markdownReveal.ts`.

- `old_string`:
```ts
      } else if (wikiLinkType && child.type === wikiLinkType) {
        // Preserve wikiLink atoms; their markdown form is [[path]] which would
        // be re-parsed on restore — keeping them as nodes avoids the parse
        // trip for a lossless round-trip.
        children.push(child);
      } else if (!child.isLeaf) {
        // Blockquote contains a paragraph; recurse into its inlines.
        visit(child);
      }
```
- `new_string`:
```ts
      } else if (wikiLinkType && child.type === wikiLinkType) {
        // Preserve wikiLink atoms; their markdown form is [[path]] which would
        // be re-parsed on restore — keeping them as nodes avoids the parse
        // trip for a lossless round-trip.
        children.push(child);
      } else if (child.type.name === "hardBreak") {
        // Emit as markdown's hard-break syntax (two trailing spaces + \n).
        // markdownToHtml on restore re-parses this to <br>, which Tiptap's
        // HardBreak extension maps back to a hardBreak node — round-trip
        // preserved. Matters most for table cells (cellToMarkdown joins
        // multi-block cells with <br>, which reload as hardBreak inside a
        // single paragraph), but also fixes the pre-existing case where a
        // Shift-Enter hard break in a top-level paragraph was silently
        // dropped on reveal.
        children.push(schema.text("  \n"));
      } else if (!child.isLeaf) {
        // Blockquote contains a paragraph; recurse into its inlines.
        visit(child);
      }
```

- [ ] **Step 3: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Exits 0.

- [ ] **Step 4: Rebuild the graphify code index**

Run:
```bash
cd "/Users/kiro/My Projects/knowledge-base" && python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```
Expected: Exits 0.

- [ ] **Step 5: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/extensions/markdownReveal.ts graphify-out
git commit -m "$(cat <<'EOF'
feat(document): preserve hardBreak when revealing a paragraph

Add a branch to richBlockToRawFragment's inline walker so a hardBreak
node becomes '  \n' (CommonMark hard-break syntax) in the raw view
instead of being silently dropped. markdownToHtml on restore re-parses
that back to <br>, which Tiptap's HardBreak extension re-creates as a
hardBreak node — round-trip is lossless.

Needed for multi-block table cells (cellToMarkdown joins with <br>,
which reload as hardBreaks), and incidentally fixes the pre-existing
case where Shift-Enter hard breaks in top-level paragraphs were lost
the first time the cursor entered them.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify in the preview browser

**Files:** No file changes — this task exercises the three previous tasks in the running app.

This repo has no unit-test harness for Tiptap extensions, so the standard verification path is the `mcp__Claude_Preview__preview_*` tools driving a real dev server. The preview_start target is defined in `.claude/launch.json`; if the launch file doesn't exist, the preview_start tool will error with instructions on the required format.

Before step 1, the user must have a `.md` document open in the preview browser — this repo uses the File System Access API picker, which only a human can invoke. If preview_snapshot shows the empty-vault state (file picker UI), pause and ask the user to pick a vault before continuing.

- [ ] **Step 1: Ensure the dev server is running**

Run: `mcp__Claude_Preview__preview_list`

If no server for this project appears, start it with:
```
mcp__Claude_Preview__preview_start(name="knowledge-base-dev")
```
If `.claude/launch.json` is missing, create it first with:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "knowledge-base-dev",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```
then re-run preview_start.

Expected: preview_list reports a running server with a serverId; note it for subsequent steps as `$SID`.

- [ ] **Step 2: Snapshot the page and confirm a document is open**

Run: `mcp__Claude_Preview__preview_snapshot(serverId=$SID)`

Expected: The snapshot includes a `.markdown-editor` region with a ProseMirror root. If the page instead shows a "Select a vault folder" prompt, stop and ask the user to pick a vault through the picker; preview tools can't drive that flow.

- [ ] **Step 3: Create a test document and insert a table**

Use preview_eval to create a new document in the vault with prepared content. Exact expression:

```js
(() => {
  const root = document.querySelector('.markdown-editor .ProseMirror');
  if (!root) return { error: 'no editor' };
  // Focus the editor so keyboard events land inside it
  root.focus();
  return { ok: true, text: root.innerText.slice(0, 200) };
})()
```

Run: `mcp__Claude_Preview__preview_eval(serverId=$SID, expression=<above>)`

Expected: `{ ok: true, text: "..." }`.

Then use the toolbar's table picker to insert a 2×2 table. Easier path: directly insert via the editor API. Run:

```js
(() => {
  const view = window.__editorForTests?.view;
  // The editor isn't exposed globally; instead dispatch via a fake user action.
  // Click the table button in the toolbar (TableIcon, title="Insert table").
  const btn = document.querySelector('button[title="Insert table"]');
  if (!btn) return { error: 'no table button' };
  btn.click();
  return { ok: true };
})()
```

Click a 2×2 cell in the picker:

```js
(() => {
  const cells = document.querySelectorAll('.relative .grid .w-5.h-5');
  if (cells.length < 9) return { error: 'picker not open' };
  // Cells are laid out row-major with maxCols=8; 2×2 is index (1*8+1)=9.
  cells[9].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return { ok: true };
})()
```

Expected: a 2-row × 2-col table appears in the editor.

- [ ] **Step 4: Type `hello **world**` in the first body cell**

Run preview_eval to set cell text directly via a transaction. Since we can't reach the editor via a global, use the Chrome-style keyboard sequence through preview_click + the DOM's selection API:

```js
(() => {
  const cells = document.querySelectorAll('.markdown-editor td');
  if (!cells.length) return { error: 'no body cells' };
  const target = cells[0];
  // Place caret inside the cell's first paragraph
  const p = target.querySelector('p');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  // Trigger a selection-change so markdownReveal's appendTransaction runs
  target.dispatchEvent(new Event('mousedown', { bubbles: true }));
  target.dispatchEvent(new Event('mouseup', { bubbles: true }));
  target.dispatchEvent(new Event('click', { bubbles: true }));
  return { ok: true, html: target.innerHTML };
})()
```

Expected: The cell's first `<p>` has the cursor inside it.

Now type the content. Use preview_eval with `execCommand('insertText', ...)`:

```js
(() => {
  document.execCommand('insertText', false, 'hello **world**');
  return { ok: true, html: document.querySelectorAll('.markdown-editor td')[0].innerHTML };
})()
```

Expected: The cell now shows `hello **world**` in rawBlock form (the `html` field should contain a `data-raw-block` attribute).

- [ ] **Step 5: Verify syntax decorations rendered `world` as bold inside the cell**

Run: `mcp__Claude_Preview__preview_inspect(serverId=$SID, selector=".markdown-editor td [data-raw-block] strong")`

Expected: An element exists and its `textContent` is `world`. If inspect returns nothing, the walker isn't descending into tables — go back and re-check Task 1's edits.

- [ ] **Step 6: Move cursor out of the cell and check rich render**

Click in the toolbar area to blur the table:

```js
(() => {
  const btn = document.querySelector('button[title="Bold"]');
  if (!btn) return { error: 'no bold button' };
  // Dispatch a mousedown that the toolbar preventDefault's on; that's enough
  // to take selection out of the table cell.
  btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  return { ok: true };
})()
```

Then click somewhere outside the table:

```js
(() => {
  const outside = document.querySelector('.markdown-editor p:not(td p)') || document.body;
  outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  outside.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  // Also programmatically place the caret outside
  const range = document.createRange();
  range.setStart(outside, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return { ok: true, cellHtml: document.querySelectorAll('.markdown-editor td')[0].innerHTML };
})()
```

Expected: `cellHtml` now contains `<p>hello <strong>world</strong></p>` — no more `data-raw-block`. If it still shows rawBlock, the `MarkdownReveal.appendTransaction` restore path didn't run; add a `console.log` in `appendTransaction` and re-check.

- [ ] **Step 7: Inspect the emitted markdown for round-trip correctness**

Run:
```js
(() => {
  const ed = window.__editorForTests;
  // There isn't a global editor ref in this repo; read via the hidden raw-mode
  // textarea instead. Toggle raw mode: click the "Raw" toolbar button.
  const rawBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Raw');
  if (!rawBtn) return { error: 'no raw toggle' };
  rawBtn.click();
  const ta = document.querySelector('textarea');
  const md = ta?.value ?? '';
  // Toggle back to WYSIWYG
  const wyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'WYSIWYG');
  wyBtn?.click();
  return { md };
})()
```

Expected: The returned `md` string contains a table row with `| hello **world** |` (or `| **world**`-style depending on cell order). The asterisks around `world` are the proof Task 2 landed — before Task 2 the cell emitted `| hello world |`.

- [ ] **Step 8: Verify pipe escaping**

Click back into the first cell, type `a | b`, blur, re-open raw mode:

```js
(() => {
  // Place caret at end of first cell
  const p = document.querySelectorAll('.markdown-editor td p')[0] || document.querySelectorAll('.markdown-editor td [data-raw-block]')[0];
  const range = document.createRange();
  range.selectNodeContents(p);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  // Now type after the existing content
  document.execCommand('insertText', false, ' a | b');
  return { ok: true };
})()
```

Then repeat the raw-toggle step from Step 7 and read `md`.

Expected: The cell row contains `\|` (backslash-pipe) not a bare `|`, i.e. something like `| hello **world** a \| b |`.

- [ ] **Step 9: Exercise Enter inside a raw cell**

Click into the second cell of the first body row; the cell's paragraph should become a rawBlock. Type `foo`, press Enter, type `bar`:

```js
(() => {
  const cells = document.querySelectorAll('.markdown-editor td');
  const target = cells[1];
  const p = target.querySelector('p') || target.querySelector('[data-raw-block]');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  document.execCommand('insertText', false, 'foo');
  // Enter
  p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  // Need to re-query because the DOM may have been replaced
  const cells2 = document.querySelectorAll('.markdown-editor td');
  const inner = cells2[1].innerHTML;
  document.execCommand('insertText', false, 'bar');
  return { innerAfterEnter: inner, finalInner: cells2[1].innerHTML };
})()
```

Expected: `innerAfterEnter` contains two block children (either two `[data-raw-block]` elements or one + a `<p>`), and `finalInner` has `foo` and `bar` on separate lines.

If the Enter handler silently failed (try/catch around `tr.split`), the inner will still show a single block with `foobar`. In that case, implement the fallback Case 3 described in the spec (`docs/superpowers/specs/2026-04-15-rawreveal-in-table-cells-design.md` §3) — add a new task before proceeding. The fallback shape:

```ts
// Case 3 (fallback for table cells if tr.split is rejected): hand-build
// the split. Placed after the list-item case 1 check and before case 2.
if (!listItemNode && rawBlockNode) {
  const $inRaw = state.doc.resolve(rawBlockPos + 1);
  const parent = $inRaw.parent; // the rawBlock
  // Only when the rawBlock's parent is a tableCell/tableHeader — otherwise
  // let Case 2's generic tr.split handle it.
  const grandparent = state.doc.resolve(rawBlockPos).parent.type.name;
  if (grandparent === "tableCell" || grandparent === "tableHeader") {
    const rawContentStart = rawBlockPos + 1;
    const cursorOffset = Math.max(
      0,
      Math.min($head.pos - rawContentStart, rawBlockNode.content.size),
    );
    const beforeContent = rawBlockNode.content.cut(0, cursorOffset);
    const afterContent = rawBlockNode.content.cut(cursorOffset);
    const beforeRawBlock = schema.nodes.rawBlock.create(rawBlockNode.attrs, beforeContent);
    const afterParagraph = schema.nodes.paragraph.create(null, afterContent);
    const tr = state.tr;
    try {
      tr.replaceWith(rawBlockPos, rawBlockPos + rawBlockNode.nodeSize, [beforeRawBlock, afterParagraph]);
    } catch {
      return false;
    }
    const afterStart = rawBlockPos + beforeRawBlock.nodeSize + 1;
    try {
      tr.setSelection(TextSelection.create(tr.doc, afterStart));
    } catch { /* fall back to PM's mapped selection */ }
    view.dispatch(tr.scrollIntoView());
    return true;
  }
}
```

Only add Case 3 if Step 9 demonstrates Case 2 doesn't work inside a cell. Most likely it does work and this step is pure verification.

- [ ] **Step 10: Blur and verify hardBreak preservation**

Repeat the blur pattern from Step 6, then check the cell's final HTML:

```js
(() => {
  const cells = document.querySelectorAll('.markdown-editor td');
  return { innerHTML: cells[1].innerHTML };
})()
```

Expected: Single `<p>` containing `foo`, a `<br>`, and `bar` — e.g. `<p>foo<br>bar</p>`. If it's two separate `<p>` elements, the serializer's `<br>` join is still producing multiple blocks (investigate whether markdown-it's table parse is splitting).

Re-click the cell and check the raw view shows `foo  \nbar` (which renders as two visual lines with no visible whitespace glyph):

```js
(() => {
  const cells = document.querySelectorAll('.markdown-editor td');
  const target = cells[1];
  const p = target.querySelector('p');
  if (!p) return { error: 'no p' };
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return { inner: target.innerHTML };
})()
```

Expected: `inner` contains a `[data-raw-block]` whose text nodes carry `foo  \nbar`. If the hardBreak is missing, Task 3's edit didn't take; re-check.

- [ ] **Step 11: Check read-only mode is untouched**

Run:
```js
(() => {
  // DocumentView exposes a lock toggle. Find it by title.
  const lockBtn = Array.from(document.querySelectorAll('button'))
    .find(b => /lock|read.?only/i.test(b.title || b.textContent || ''));
  return { hasLockBtn: !!lockBtn, title: lockBtn?.title };
})()
```

If the lock button exists, click it and then click into a cell. Run:
```js
(() => {
  const cell = document.querySelectorAll('.markdown-editor td')[0];
  const p = cell.querySelector('p');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return { innerHTML: cell.innerHTML };
})()
```
Expected: `innerHTML` does NOT contain `data-raw-block` — reveal is gated behind `canReveal` (editor.isEditable) and must stay off in read-only mode.

If the lock button is not present on the current page (some views embed the editor without the readOnly toggle), this step is not applicable. Note that in the PR description and move on — do NOT silently skip it without noting the reason.

- [ ] **Step 12: Final screenshot proof**

Run: `mcp__Claude_Preview__preview_screenshot(serverId=$SID)`

Save the image and reference it in the PR description.

- [ ] **Step 13: Commit any follow-up touch-ups from the verification**

If Step 9 required adding Case 3, commit that edit separately:
```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/extensions/markdownReveal.ts
git commit -m "$(cat <<'EOF'
fix(document): hand-build Enter split inside table-cell rawBlock

tr.split at depth 1 with typesAfter=paragraph is rejected when the
rawBlock sits inside a tableCell (isolating: true + block+ parent),
so add Case 3 that replaces the rawBlock with a [before-rawBlock,
after-paragraph] pair via tr.replaceWith — same shape as Case 1 for
list items, without the wrapper rebuild.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

If Step 9 showed Case 2 works, no commit here.

---

## Appendix: Rollback

If any task needs to be rolled back, revert the single commit:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git log --oneline -5
git revert <sha>
```

Each task is scoped to a single file (or two, counting graphify-out) and one commit, so revert is clean. Tasks 1 and 3 both touch `markdownReveal.ts` but in different regions — the revert of either won't conflict with the other. Task 2 is in a different file.
