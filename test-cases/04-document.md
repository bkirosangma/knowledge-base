# Test Cases — Document Editor

> Mirrors §4 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 4.1 Editor Orchestration

- **DOC-4.1-01** ✅ **DocumentView mounts for `.md` file** — `e2e/goldenPath.spec.ts` opens a seeded vault, clicks a `.md` file, and asserts the ProseMirror surface renders the seeded content. Also covered by `e2e/documentGoldenPath.spec.ts` (DOC-4.1-01). Uses the in-browser File System Access mock.
- **DOC-4.1-02** ❌ **Focused state tracked.** Same.
- **DOC-4.1-03** 🟡 **MarkdownPane header shows breadcrumb** — `PaneHeader` breadcrumb rendering is covered by SHELL-1.6-01; mount wiring is integration.
- **DOC-4.1-04** ❌ **Backlinks dropdown opens.** Integration.
- **DOC-4.1-05** 🟡 **Read-only toggle in PaneHeader** — toggle is covered by SHELL-1.6-02; Tiptap `setEditable` propagation is integration.
- **DOC-4.1-06** ✅ **200 ms debounce on serialize.** (Covered by DOC-4.5-24 in `MarkdownEditor.test.tsx`.)
- **DOC-4.1-07** ✅ **Flush on blur.** (Covered by DOC-4.1-07 describe in `MarkdownEditor.test.tsx`.)
- **DOC-4.1-08** ✅ **Flush on unmount.** (Covered by DOC-4.5-25 in `MarkdownEditor.test.tsx`.)

## 4.2 Tiptap Extensions (StarterKit + ecosystem)

- **DOC-4.2-01** 🟡 **H1–H6 render** — markdown↔HTML conversion for all 6 heading levels covered by DOC-4.4-01..22 in `markdownSerializer.test.ts`; live Tiptap DOM rendering is integration-level
- **DOC-4.2-02** 🟡 **Paragraphs render** — covered by markdown round-trip tests; live mount is integration.
- **DOC-4.2-03** 🟡 **Bullet list** — covered by markdown round-trip; live render is integration.
- **DOC-4.2-04** 🟡 **Ordered list** — covered by markdown round-trip; live render is integration.
- **DOC-4.2-05** 🟡 **Task list** — markdown round-trip covered; checkbox DOM needs live mount.
- **DOC-4.2-06** ❌ **Checkbox toggle updates markdown.** Click handling on a live Tiptap task-item; integration.
- **DOC-4.2-07** 🟡 **Blockquote** — markdown round-trip covered; live render is integration.
- **DOC-4.2-08** 🟡 **Bold mark** — markdown round-trip covered.
- **DOC-4.2-09** 🟡 **Italic mark** — same.
- **DOC-4.2-10** 🟡 **Strikethrough** — same.
- **DOC-4.2-11** 🟡 **Inline code** — same.
- **DOC-4.2-12** 🟡 **Horizontal rule** — same.
- **DOC-4.2-13** 🟡 **Hard break** — same.
- **DOC-4.2-14** 🟡 **Table renders** — markdown round-trip covered.
- **DOC-4.2-15** 🟡 **Image extension** — markdown round-trip covered.
- **DOC-4.2-16** 🟡 **Link extension** — markdown round-trip covered.
- **DOC-4.2-17** ✅ **Placeholder renders on empty.** (Covered by DOC-4.2-17 describe in `MarkdownEditor.test.tsx` — checks `data-placeholder` attribute.)
- **DOC-4.2-18** ❌ **Code block with lowlight** — highlighting classes emitted only at render time. Integration.

## 4.3 Custom Extensions

### 4.3.a WikiLink (`wikiLink.ts`)
- **DOC-4.3-01** ✅ **`[[foo]]` renders as blue pill.** — `e2e/documentGoldenPath.spec.ts` (DOC-4.3-01): seeds index.md + target.md, opens index.md, and asserts the NodeView-rendered `.wiki-link.bg-blue-100` pill is visible and `[[target]]` plain text is absent.
- **DOC-4.3-02** 🧪 **`[[nonexistent]]` renders as unresolved pill** — no `bg-blue-100` class applied to unknown targets. _(e2e: `documentReadOnly.spec.ts`)_
- **DOC-4.3-03** 🧪 **Doc icon on `.md` target.** Resolved `.md` link shows `bg-blue-100` and SVG icon. _(e2e: `documentReadOnly.spec.ts`)_
- **DOC-4.3-04** ❌ **Diagram icon on `.json` target.** Same.
- **DOC-4.3-05** 🟡 **`[[foo#section]]` stores section attr** — `parseWikiLinks` correctly extracts `section` (DOC-4.8-02); NodeView render is integration.
- **DOC-4.3-06** 🟡 **`[[foo\|Bar]]` stores display attr** — parsing covered by DOC-4.8-02; render is integration.
- **DOC-4.3-07** ❌ **Suggestion menu opens on `[[`.** Tiptap Suggestion plugin — needs live editor.
- **DOC-4.3-08** ❌ **Suggestion filters by typed query.** Same.
- **DOC-4.3-09** ❌ **Arrow keys navigate suggestion.** Same.
- **DOC-4.3-10** ❌ **Enter commits suggestion.** Same.
- **DOC-4.3-11** ❌ **Escape closes suggestion without insert.** Same.
- **DOC-4.3-12** ❌ **Inline edit on selection — single key appends.** Live editor.
- **DOC-4.3-13** ❌ **Backspace trims display text.** Same.
- **DOC-4.3-14** ❌ **Escape reverts display text to prior value.** Same.
- **DOC-4.3-15** ❌ **Click in read-mode navigates.** Click handling on live NodeView.
- **DOC-4.3-16** ❌ **Click unresolved in read-mode creates.** Same.
- **DOC-4.3-17** ✅ **Path resolution: current-dir `.md`** — DOC-4.8-04 in `wikiLinkParser.test.ts`.
- **DOC-4.3-18** 🟡 **Path resolution: current-dir `.json` fallback** — `.json` extension preserved (DOC-4.8-09); the "prefer .md, fallback to .json" order lives in the click-time resolver.
- **DOC-4.3-19** ✅ **Path resolution: as-written** — DOC-4.8-08 ("preserves .md extension, no double-append").
- **DOC-4.3-20** 🟡 **Path resolution: root `.md` fallback** — vault-root resolution covered by DOC-4.8-05; multi-candidate fallback is integration.
- **DOC-4.3-21** 🟡 **Path resolution: root `.json` fallback** — same scope as 4.3-20.

### 4.3.b CodeBlockWithCopy (`codeBlockCopy.tsx`)
- **DOC-4.3-22** ✅ **Copy button rendered inside the code-block wrapper** — `md-codeblock-copy` element is present in the rendered NodeView; CSS drives the hover-reveal.
- **DOC-4.3-23** ✅ **Click copies code to clipboard** — `navigator.clipboard.writeText` is called with the `node.textContent` on click.
- **DOC-4.3-24** ✅ **Fallback to execCommand when clipboard throws** — on `writeText` rejection, the view creates a temporary `<textarea>`, selects it, and calls `document.execCommand('copy')`.
- **DOC-4.3-25** ✅ **Copy button shows confirmation state** — immediately after click the button label+title flips to `"Copied"` and reverts to `"Copy code"` after ~1500 ms.

### 4.3.c TableNoNest (`tableNoNest.ts`)
- **DOC-4.3-26** ✅ **`insertTable` blocked inside table** — the TableNoNest extension checks `editor.isActive("table")` and returns `false` before delegating to the parent command; no second table is inserted.
- **DOC-4.3-27** ✅ **`insertTable` allowed outside table** — when the cursor is in a paragraph/heading/etc., the command delegates to the parent Table's `insertTable` and inserts normally. Moving the cursor back out re-enables the command.

### 4.3.d MarkdownReveal (`markdownReveal.ts`)
- **DOC-4.3-28** ✅ **Decoration wraps `**bold**`** — strong-pattern regex covered in `markdownReveal.test.ts`.
- **DOC-4.3-29** ✅ **Decoration wraps `*italic*`** — em-pattern regex covered.
- **DOC-4.3-30** ✅ **Decoration wraps `~~strike~~`** — s-pattern regex covered.
- **DOC-4.3-31** ✅ **Decoration wraps `` `code` ``** — code-pattern regex covered.
- **DOC-4.3-32** ✅ **Triple-asterisk renders bold+italic** — `***…***` pattern asserts both tags.
- **DOC-4.3-33** ✅ **Italic lookahead/lookbehind excludes bold** — `markdownReveal.test.ts` confirms italic regex can't span `**…**`.
- **DOC-4.3-34** ❌ **Cursor enters paragraph → rawBlock conversion.** Live editor state machine — integration.
- **DOC-4.3-35** ❌ **Cursor exits rawBlock → re-parses via markdown-it.** Same.
- **DOC-4.3-36** 🚫 **LRU cache hit skips parse.** Cache is module-private inside `markdownReveal`; integration-only.
- **DOC-4.3-37** 🚫 **LRU cap = 64.** Same.
- **DOC-4.3-38** ❌ **Enter in rawBlock splits with smart list-item handling.** Keyboard handler on live editor.
- **DOC-4.3-39** ❌ **Backspace at rawBlock start merges with previous block's rightmost textblock.** Same.
- **DOC-4.3-40** ❌ **rawSwap meta flag suppresses serialize.** Transaction-level meta inside live dispatcher — integration.

## 4.4 Markdown I/O

### 4.4.a `htmlToMarkdown`
- **DOC-4.4-01** ✅ **Heading round-trip** — H1 → `# …`; H6 → `###### …`.
- **DOC-4.4-02** ✅ **Bold / italic / strike / code** — `<strong>`/`<b>`, `<em>`/`<i>`, `<s>`/`<del>`, `<code>` all produce the expected markdown delimiter.
- **DOC-4.4-03** ✅ **Bullet list** — `<ul><li>a</li><li>b</li></ul>` → `- a\n- b`.
- **DOC-4.4-04** ✅ **Ordered list** — `<ol>` preserves `1. 2. 3.` numbering.
- **DOC-4.4-05** ✅ **Task list** — `<li><input type="checkbox" [checked]>…</li>` produces `- [ ]` / `- [x]`.
- **DOC-4.4-06** ✅ **Blockquote** — multi-line blockquote → every non-empty line prefixed `> ` (separated via `<br>` or newline text).
- **DOC-4.4-07** ✅ **Code block fence with language** — `pre > code.language-ts` → ` ```ts\n…\n``` `. Language omitted when no class present.
- **DOC-4.4-08** ✅ **Pipe tables** — `<table>` → `| h1 | h2 |\n| --- | --- |\n| a | b |` including auto header separator row.
- **DOC-4.4-09** ✅ **Pipe `|` in cell escaped** — cell text `a|b` → `a\|b`.
- **DOC-4.4-10** ✅ **Link mark** — `<a href="x">t</a>` → `[t](x)`.
- **DOC-4.4-11** ✅ **Wiki-link compact** — span text matches `path[#section]` → `[[path]]` without `|display`.
- **DOC-4.4-12** ✅ **Wiki-link with section** — `[[path#sec]]`.
- **DOC-4.4-13** ✅ **Wiki-link with display** — `[[path|Label]]` (no space padding on the emit side; padding is only added by `updateWikiLinkPaths`).
- **DOC-4.4-14** ✅ **Wiki-link with section + display** — `[[path#sec|Label]]`.
- **DOC-4.4-15** ✅ **Raw-block markers emitted verbatim** — `data-raw-block` attr → output preserves inner markdown; outer tag's block prefix (`# `, `> `) is NOT re-applied.
- **DOC-4.4-16** ✅ **Horizontal rule** — `<hr>` → `---` on own line.

### 4.4.b `markdownToHtml`
- **DOC-4.4-17** ✅ **Wiki-link preprocessed** — `[[path#sec]]` → `<span data-wiki-link="path" data-wiki-section="sec" class="wiki-link">…</span>` before markdown-it runs. Display defaults to `path` when no `|display` given.
- **DOC-4.4-18** ✅ **Blank line inside table collapsed** — any `|\n\n|` pattern collapsed repeatedly so markdown-it recognises the table.
- **DOC-4.4-19** ✅ **Task markers → checkboxes** — `- [x]` / `- [ ]` at line start → `<input type="checkbox" [checked] disabled>` preserved inside the list item.
- **DOC-4.4-20** ✅ **`linkify: true`** — bare `https://…` URLs auto-linked by markdown-it.
- **DOC-4.4-21** ✅ **HTML passthrough (`html: true`)** — inline HTML (`<em>`, etc.) preserved verbatim.
- **DOC-4.4-22** ✅ **Round-trip stability** — structural round-trips hold for bold, heading+paragraph+list, tables, wiki-links with section, and pipe-in-cell (markdown-it converts `\|` back to `|`).

## 4.5 Formatting Toolbar

- **DOC-4.5-01** ✅ **Toolbar hidden in read-only** — `MarkdownEditor.test.tsx` asserts Bold / H1 / Undo not rendered + the editor is `contenteditable=false` when `readOnly=true`.
- **DOC-4.5-02** ✅ **Toolbar hidden in raw mode** — `MarkdownEditor.test.tsx` clicks "Raw" and asserts toolbar buttons disappear alongside the ProseMirror surface.
- **DOC-4.5-03** ✅ **WYSIWYG ↔ Raw toggle** — `MarkdownEditor.test.tsx` verifies both directions (Raw → textarea, WYSIWYG → ProseMirror). Also covered end-to-end with content round-trip by `e2e/documentGoldenPath.spec.ts` (DOC-4.5-03).
- **DOC-4.5-04** 🟡 **Undo disabled when stack empty** — Tiptap's History extension records initial content as a transaction so Undo is typically enabled right after mount. The disabled wiring (`disabled={!editor.can.undo}`) is a thin wrapper over Tiptap's API; testing stay-disabled reliably would require disabling History.
- **DOC-4.5-05** ✅ **Redo disabled when no undone history** — `MarkdownEditor.test.tsx` asserts Redo is disabled on a fresh mount.
- **DOC-4.5-06** ✅ **H1 button active state** — `MarkdownEditor.test.tsx` mounts `# Already a heading`, focuses the editor, and asserts the H1 TBtn has `bg-blue-100` (active class) while H2 does not.
- **DOC-4.5-07** ✅ **H1 button toggles heading** — `MarkdownEditor.test.tsx` clicks Heading 2 on a plain paragraph and asserts `<h2>` appears in the ProseMirror output (H1 path covered by the active-state test since toggle-to-rich uses the same code path).
- **DOC-4.5-08** 🟡 **Bold / italic / strike / inline-code buttons toggle respective marks** — toolbar render + enabled state covered in `MarkdownEditor.test.tsx`; the actual mark application on a selection isn't directly testable in JSDOM because native Selection doesn't propagate to ProseMirror. Playwright
- **DOC-4.5-09** 🚫 **Bold in rawBlock toggles `**…**` syntax (`toggleRawSyntax`).** `toggleRawSyntax` is module-private in `MarkdownEditor.tsx` — would need extraction to unit-test.
- **DOC-4.5-10** 🚫 **`toggleRawSyntax` detects `*` vs `**`.** Same — module-private.
- **DOC-4.5-11** 🚫 **Heading in rawBlock toggles `# ` prefix (`toggleRawBlockType`).** Module-private helper.
- **DOC-4.5-12** ✅ **List / blockquote / code block buttons toggle block type** — `MarkdownEditor.test.tsx` covers bullet list, numbered list, blockquote, and code block — each button click produces the corresponding block structure (`<ul><li>`, `<ol><li>`, `<blockquote>`, `<pre><code>`).
- **DOC-4.5-13** ❌ **Force-exit rawBlock before structural commands.** Live editor.
- **DOC-4.5-14** ✅ **`getActiveRawFormats` — bold detected in rawBlock** — the pure string-parsing core was extracted to `rawBlockHelpers.computeActiveRawFormatsAt(text, cursor)` and is exhaustively tested in `rawBlockHelpers.test.ts` (bold / italic / strike / code / triple-asterisk / nested / plain / outside). The editor-coupled wrapper in `MarkdownEditor.tsx` delegates to this helper.
- **DOC-4.5-15** ✅ **`getRawHeadingLevel` — detects `#{N}` prefix** — extracted as `rawBlockHelpers.parseHeadingPrefix(text)`; tests cover levels 1–6, 7+ rejection, missing-space rejection, empty input, and tab separator.
- **DOC-4.5-16** ✅ **`isRawBlockquote` — detects `> ` prefix** — extracted as `rawBlockHelpers.hasBlockquotePrefix(text)`; tests cover `> ` / `>` without space / internal `> ` / empty input.
- **DOC-4.5-17** ✅ **Horizontal rule button inserts `<hr>`** — `MarkdownEditor.test.tsx` asserts `<hr>` appears in the ProseMirror output after clicking the Horizontal rule button.
- **DOC-4.5-18** ❌ **Link button with text selected wraps selection.** Live editor.
- **DOC-4.5-19** 🟡 **Link button with empty selection inserts empty link** — popover flow is covered by DOC-4.7 (`LinkEditorPopover.test.tsx`); the button → popover wiring is integration.
- **DOC-4.5-20** ✅ **Table picker shows 8×8 grid.** — opening the `TablePicker` renders 64 cells. _(TablePicker.test.tsx)_
- **DOC-4.5-21** ✅ **Hovering cell shows "N × M table".** — `mouseEnter` on a cell sets the label; `mouseLeave` resets to "Select size". _(TablePicker.test.tsx)_
- **DOC-4.5-22** ✅ **Click inserts table of chosen dims.** — `mouseDown` on a cell calls `onSelect(rows, cols)` and closes popover. _(TablePicker.test.tsx)_
- **DOC-4.5-23** ✅ **Table picker disabled when cursor already in table.** — `disabled` prop prevents opening; setting `disabled=true` while open auto-closes. _(TablePicker.test.tsx)_
- **DOC-4.5-24** ✅ **Typing in WYSIWYG mode fires a debounced `onChange`.** — `MarkdownEditor.test.tsx` drives a toolbar transaction and asserts `onChange` is called with a string after 300ms.
- **DOC-4.5-25** ✅ **Unmounting the editor flushes a pending `onChange` synchronously.** — `MarkdownEditor.test.tsx` triggers a transaction then unmounts before debounce fires; asserts flush happened.
- **DOC-4.5-26** ✅ **External content prop change does NOT echo back to `onChange`.** — The content-sync `useEffect` in `MarkdownEditor.tsx` passes `{ emitUpdate: false }` to `editor.commands.setContent`, so Tiptap's `preventUpdate` transaction meta is set and `onUpdate` doesn't fire. Prevents the infinite save loop where parent saves → sets content prop → editor fires onChange → parent saves again.

## 4.6 Table Floating Toolbar

- **DOC-4.6-01** ❌ **Appears when cursor enters table.** — real hover geometry, JSDOM can't simulate.
- **DOC-4.6-02** ❌ **Appears on hover over table** — even if cursor elsewhere. — real hover, JSDOM.
- **DOC-4.6-03** ❌ **200 ms hide delay on mouse-leave.** — timer + mouse-leave geometry, JSDOM.
- **DOC-4.6-04** ❌ **Positioned above the table.** — real layout position, JSDOM returns zeros.
- **DOC-4.6-05** ❌ **Hides when table scrolls out of viewport.** — scroll events + geometry, JSDOM.
- **DOC-4.6-06** ✅ **Add row above / below** — new row inserted at correct index.
- **DOC-4.6-07** ✅ **Delete row.**
- **DOC-4.6-08** ✅ **Add column left / right.**
- **DOC-4.6-09** ✅ **Delete column.**
- **DOC-4.6-10** ✅ **Toggle header row.**
- **DOC-4.6-11** 🟡 **Toggle header column.** — button present (covered by labels test); dedicated mutation test not yet written.
- **DOC-4.6-12** ✅ **Delete table.**
- **DOC-4.6-13** ❌ **Hover-only mode — buttons disabled until cursor enters.** — real hover, JSDOM.
- **DOC-4.6-14** ❌ **Clicking button snaps cursor into last-hovered cell first** — e.g., "Delete row" targets that cell's row. — hover tracking, JSDOM.

## 4.7 Link Editor Popover

- **DOC-4.7-01** ✅ **Opens for link mark** — click `<a>` → popover with URL + text fields.
- **DOC-4.7-02** ✅ **Opens for wiki-link node** — click pill → popover with path + section + display fields.
- **DOC-4.7-03** ❌ **Default positioning below target.** — real viewport geometry, JSDOM returns zeros.
- **DOC-4.7-04** ❌ **Flips above when no room below.** — real viewport geometry, JSDOM.
- **DOC-4.7-05** ❌ **Clamps horizontally inside viewport.** — real viewport geometry, JSDOM.
- **DOC-4.7-06** ✅ **Datalist autocomplete (wiki mode)** — path input suggestions from `allDocPaths`.
- **DOC-4.7-07** ✅ **Enter commits** — updates mark/node.
- **DOC-4.7-08** 🟡 **Blur commits.** — implicit in Enter/Escape tests; dedicated blur-commit test not written.
- **DOC-4.7-09** ✅ **Escape reverts** — no change to doc.
- **DOC-4.7-10** ✅ **Display-text preserved when non-default** — rename path; custom display stays.
- **DOC-4.7-11** ✅ **Display-text updated when it matched the old default** — rename path → display auto-matches new basename.
- **DOC-4.7-12** ✅ **Unlink removes mark/node** — for mark: selection becomes plain text; for node: removes atom.
- **DOC-4.7-13** 🟡 **Unlink on empty link deletes link text.** — not yet covered.
- **DOC-4.7-14** 🟡 **External edits resync** — if target mark changes elsewhere, draft updates (only when input not focused). — not yet covered.

## 4.8 Wiki-Link Utilities

- **DOC-4.8-01** ✅ **`parseWikiLinks` finds `[[a]]`, `[[a#s]]`, `[[a|b]]`, `[[a#s|b]]`.**
- **DOC-4.8-02** ✅ **Each match carries `raw` (full match), `path`, optional `section`, optional `displayText`** — positions are _not_ part of the return shape.
- **DOC-4.8-03** ✅ **Does NOT skip `[[…]]` inside code fences (current behaviour)** — parser is a pure regex walk; if fence-awareness is wanted, open a separate feature request.
- **DOC-4.8-04** ✅ **`resolveWikiLinkPath` — relative** — `('foo', 'a/b')` → `a/b/foo.md` (joined to the full `currentDocDir`, not just its first segment).
- **DOC-4.8-05** ✅ **`resolveWikiLinkPath` — absolute** — `('/foo', 'a/b')` → `foo.md` (strip leading `/`).
- **DOC-4.8-06** ✅ **Normalises `..`** — `('../x', 'a/b')` → `a/x.md`.
- **DOC-4.8-07** ✅ **Normalises `.`** — `('./x', 'a/b')` → `a/b/x.md`.
- **DOC-4.8-08** ✅ **Appends `.md` if no extension.**
- **DOC-4.8-09** ✅ **Preserves `.json` extension.**
- **DOC-4.8-10** ✅ **`updateWikiLinkPaths` bulk rename** — `foo.md` → `bar.md`: `[[foo]]` → `[[bar]]`; `[[foo#s]]` → `[[bar#s]]`; `[[foo|Label]]` → `[[bar | Label]]`; `[[foo#s|Label]]` → `[[bar#s | Label]]`. _Note: formatter emits ` | ` (space-padded) around the display-text separator._
- **DOC-4.8-11** ✅ **`updateWikiLinkPaths` strips `.md` for matching** — handles either form in source and in `oldPath`/`newPath` arguments.
- **DOC-4.8-12** ✅ **Does not change unrelated links** — `[[fooey]]` and other non-matching paths are untouched; leading `/` is preserved across vault-absolute renames.
- **DOC-4.8-13** ✅ **Clamps `..` beyond root to the vault root** — `('../../foo', 'a')` → `foo.md` (extra `..` segments past the vault root are discarded, not emitted as literal `..` path segments; Phase 5a, 2026-04-19).

## 4.9 Document Properties Sidebar

- **DOC-4.9-01** ✅ **Word count accurate** — doc with 100 words → `100` reported.
- **DOC-4.9-02** 🚫 **Character count accurate.** — `stats.chars` computed but not rendered in the UI.
- **DOC-4.9-03** ✅ **Reading time = ceil(words / 200) min.**
- **DOC-4.9-04** ✅ **Outbound links listed** — each wiki-link and URL link rendered.
- **DOC-4.9-05** ✅ **Outbound link shows section when present** — `[[a#s]]` → renders `a · s` (or equivalent).
- **DOC-4.9-06** ✅ **Backlinks listed** — each `linkedFrom` source rendered.
- **DOC-4.9-07** ✅ **Click outbound navigates** — opens target.
- **DOC-4.9-08** ✅ **Click backlink navigates** — opens source.
- **DOC-4.9-09** 🚫 **Collapse state persisted to localStorage.** — collapse state owned/persisted by parent component.
- **DOC-4.9-10** ✅ **Collapsed width = 36 px.**

## 4.10 Link Index (`_links.json`)

- **DOC-4.10-01** ✅ **`loadIndex`** — reads `.archdesigner/_links.json`, parses JSON, validates shape (`documents` and `backlinks` keys present), and returns the typed `LinkIndex`.
- **DOC-4.10-02** ✅ **`loadIndex` missing file** — `NotFoundError` on either the directory or file level returns an `emptyIndex` (fresh, timestamped) — no throw.
- **DOC-4.10-03** ✅ **`loadIndex` malformed JSON** — `JSON.parse` errors OR validation-rejected shapes return the empty index.
- **DOC-4.10-04** ✅ **`saveIndex`** — writes `.archdesigner/_links.json` with a pretty-printed `{ ...index, updatedAt }`. Never mutates the input argument (clones with fresh timestamp).
- **DOC-4.10-05** ✅ **`updateDocumentLinks` outbound** — parses wiki-links from the markdown content, splits into `outboundLinks` (no section) and `sectionLinks` (with section). Link `type` is `"diagram"` when the resolved path ends in `.json`, else `"document"`.
- **DOC-4.10-06** ✅ **`updateDocumentLinks` rebuilds backlinks** — every outbound and section link produces a reverse edge in `index.backlinks[targetPath].linkedFrom`.
- **DOC-4.10-07** 🟡 **`updateDocumentLinks` emits graphify cross-refs** — `updateDocumentLinks` calls `emitCrossReferences` after saving; observable through the mock's `.archdesigner/cross-references.json` write. Asserted indirectly via the `updateDocumentLinks` test writing `_links.json`; direct cross-ref assertion integration tests.
- **DOC-4.10-08** ✅ **`removeDocumentFromIndex`** — deletes `documents[docPath]` then rebuilds backlinks so orphaned entries disappear.
- **DOC-4.10-09** ✅ **`renameDocumentInIndex`** — moves `documents[old]` → `documents[new]`, rewrites every outbound/section `targetPath === old` to `new`, then rebuilds backlinks.
- **DOC-4.10-10** ✅ **`getBacklinksFor`** — returns `linkIndex.backlinks[docPath]?.linkedFrom ?? []`; empty array for unknown paths.
- **DOC-4.10-11** ✅ **`fullRebuild`** — reads every path from the provided `allDocPaths`, builds a fresh index from parsed content, and writes `_links.json`. Unreadable files are skipped silently.
- **DOC-4.10-12** ✅ **Idempotent `fullRebuild`** — running it twice over the same inputs produces identical `documents` and `backlinks` content (only `updatedAt` changes).

## 4.11 Document Persistence

- **DOC-4.11-01** ✅ **Per-pane content + dirty state** — `useDocumentContent` is instantiated per pane; each instance has its own `content`/`dirty` state. Verified by loading and editing independently in a single hook instance (pane-level isolation is a composition guarantee, covered by the integration test).
- **DOC-4.11-02** ✅ **Auto-save on file switch** — when `filePath` prop changes and the previous file was dirty, the hook writes the previous content via `writeTextFile(dirHandleRef, prevPath, contentRef.current)` before loading the new file. Also covered end-to-end by `e2e/documentGoldenPath.spec.ts` (DOC-4.11-02).
- **DOC-4.11-03** ✅ **`save` writes via File System Access API** — verified by asserting the mock file's contents after `save`; routed through `writeTextFile`. Also covered end-to-end (Cmd+S path) by `e2e/documentGoldenPath.spec.ts` (DOC-4.11-03).
- **DOC-4.11-04** ✅ **Dirty flag cleared after save** — `save` sets `dirty = false` on success.
- **DOC-4.11-05** ✅ **Dirty flag set on edit** — `updateContent(md)` sets content and flips `dirty = true`. Also covered end-to-end by `e2e/documentGoldenPath.spec.ts` (DOC-4.11-03).
- **DOC-4.11-06** ✅ **Bridge exposes `save`, `dirty`, `filePath`, `content`** — `bridge.content` / `bridge.dirty` use ref-backed getters (reflect latest state without re-render); `bridge.save` mirrors the hook's `save`.
- **DOC-4.11-07** 🟡 **`createDocument` writes new file with initial content** — trivially routes `writeTextFile(rootHandle, path, initialContent)`; asserted indirectly via the write helper's tests. Full path exercised in integration tests.
- **DOC-4.11-08** ✅ **`attachDocument` records link to entity** — creates a new `DocumentMeta` (or appends to existing) with `{type, id}`; idempotent on duplicate pairs.
- **DOC-4.11-09** ✅ **`detachDocument` removes link** — removes one `{type, id}` attachment; purges the `DocumentMeta` entirely when no attachments remain; no-op on unknown document.
- **DOC-4.11-10** ✅ **`getDocumentsForEntity` filters by entity** — returns all `DocumentMeta` whose `attachedTo` includes the `(type, id)` pair.
- **DOC-4.11-11** ✅ **`hasDocuments` true when any attached** — boolean form of 4.11-10.
- **DOC-4.11-12** ✅ **`collectDocPaths` extracts all `.md` paths from tree** — depth-first walk; includes only `type === "file" && fileType === "document"`.
- **DOC-4.11-13** ✅ **`existingDocPaths` Set for O(1) membership** — returns a `new Set(collectDocPaths(tree))`.
- **DOC-4.11-14** ✅ **Load failure does NOT empty the editor (Phase 5c regression)** — when `repo.read` throws, `useDocumentContent` keeps the previous document's content in `contentRef`, records a classified `loadError`, and ignores subsequent `updateContent` / `save` calls. Prevents the pre-fix vector where a permission-revoked read reset the editor to empty and the user could type + save over the real file.
- **DOC-4.11-15** ✅ **`save` is blocked while `loadError` is set (Phase 5c regression)** — even if the caller invokes save directly, the repo write is skipped so stale content is never written to the failing path.
- **DOC-4.11-16** ✅ **Save-previous-on-switch failure is reported (Phase 5c regression)** — dirty content on the outgoing pane now surfaces via `reportError(e, 'Auto-saving <prev>')` when the write fails, instead of silently dropping the user's edits.
- **DOC-4.11-17** ✅ **`discard` re-reads the file from disk** — new since 2026-04-19. `useDocumentContent.discard` calls `repo.read(filePath)`, replaces `content` state with the on-disk text, and resets `dirty` to `false`. Wired through `DocumentPaneBridge.discard` so `PaneTitle`'s Discard button has a symmetric partner to Save.
- **DOC-4.11-18** ✅ **`discard` is blocked while `loadError` is set** — mirrors DOC-4.11-15. If the last read failed, `discard` refuses to run so it doesn't re-enter the failing read path and stomp the in-memory last-good copy. Read failures still surface via `reportError`.
- **DOC-4.11-19** ✅ **`discard` failure is reported** — when the re-read throws, the error goes through `reportError(e, 'Discarding changes to <path>')` so the shell banner renders it; in-memory state is left untouched.
- **DOC-4.11-20** ✅ **`updateContent` is a no-op when content is identical** — if `markdown === contentRef.current`, neither `setContent` nor `setDirty(true)` fires; dirty flag stays false after save when Tiptap fires spurious `onUpdate` events (structural normalizations, trailing-node plugin) without a real content change.
- **DOC-4.11-21** ✅ **`resetToContent` applies snapshot without disk I/O** — sets `content` to the given string and clears `dirty` to false; no `repo.write` or `repo.read` call made.
- **DOC-4.11-22** ❌ **`DocumentView` discard is history-first** — `executeDiscard` calls `history.goToSaved()`; if it returns a snapshot, that snapshot is applied via `resetToContent` (no disk read); disk `discard` is called only when history has no saved state.
- **DOC-4.11-23** ❌ **`DocumentView` discard shows confirmation popover when dirty** — `handleDiscard` sets `discardConfirmPos` when `dirty` is true and `SKIP_DISCARD_CONFIRM_KEY` is not set in localStorage; actual discard deferred until `ConfirmPopover.onConfirm`.
- **DOC-4.11-24** ❌ **`DocumentView` discard skips popover when skip flag is set** — when `localStorage.getItem(SKIP_DISCARD_CONFIRM_KEY) === "true"`, `executeDiscard` runs directly without showing the confirmation popover.
- **DOC-4.11-25** ❌ **`DocumentView` bridge `save` goes through full save path** — the `DocumentPaneBridge` published to the parent exposes `handleSave` (not the bare `save`), so Cmd+S via the parent calls `history.onFileSave` in addition to disk write; `savedIndex` is correctly advanced.

## 4.12 Read-Only Mode (Document)

- **DOC-4.12-01** 🧪 **`readOnly` prop hides toolbar** — lock button click hides Bold/Italic etc.; exit restores them. _(e2e: `documentReadOnly.spec.ts`)_
- **DOC-4.12-02** ✅ **`readOnly` disables table floating toolbar.** (Covered by DOC-4.12-02 describe in `TableFloatingToolbar.test.tsx`.)
- **DOC-4.12-03** ✅ **`readOnly` disables link editor popover.** (Covered by DOC-4.12-03 describe in `LinkEditorPopover.test.tsx`.)
- **DOC-4.12-04** ✅ **Editor becomes `contenteditable=false`** — `MarkdownEditor.test.tsx` asserts the ProseMirror surface's `contenteditable` attribute is `"false"` when mounted with `readOnly=true`.
- **DOC-4.12-05** ❌ **Wiki-link click navigates instead of selecting** — see 4.3-15; same NodeView click integration.
- **DOC-4.12-06** 🟡 **`setEditable` called on prop change (microtask deferred)** — known MEMORY gotcha about Tiptap `editable` being init-only; the `useEffect` wrapper fix is in `MarkdownEditor.tsx` and exercised at integration.

## 4.13 Pane Header Title (first-heading derivation)

> Added 2026-04-19 with the shell header strip-down. `PaneTitle` for document panes displays the document's first heading (debounced) instead of the file name. Derivation is pure (`utils/getFirstHeading.ts`) so it's unit-testable; the debounce + prop wiring lives in `DocumentView.tsx`.

- **DOC-4.13-01** ✅ **Empty content → empty title** — `getFirstHeading("")` returns `""`.
- **DOC-4.13-02** ✅ **Plain ATX H1 is surfaced** — `getFirstHeading("# Hello World\n\nbody")` returns `"Hello World"`.
- **DOC-4.13-03** ✅ **Inline non-word characters preserved** — `"# Foo: bar × baz"` returns `"Foo: bar × baz"` — colons, multiplication signs, etc. stay intact.
- **DOC-4.13-04** ✅ **Trailing closing-hashes stripped** — `"# Title ##"` returns `"Title"`. Matches the CommonMark optional closing sequence.
- **DOC-4.13-05** ✅ **H1 preferred even if paragraphs precede it** — `"Intro.\n\n# Real Title\n\nmore"` returns `"Real Title"`.
- **DOC-4.13-06** ✅ **Fallback to first non-empty line when no H1 exists** — `"First line\n\nSecond"` returns `"First line"`.
- **DOC-4.13-07** ✅ **List markers stripped on fallback** — `"- first bullet\n- second"` returns `"first bullet"` (same for `*` / `+`).
- **DOC-4.13-08** ✅ **Blockquote markers stripped on fallback** — `"> quoted line"` returns `"quoted line"`.
- **DOC-4.13-09** ✅ **Lower heading levels normalised on fallback** — `"## Subheading only\n\nbody"` returns `"Subheading only"` (H1 regex misses it, fallback strips `^##{1,6} `).
- **DOC-4.13-10** ✅ **YAML frontmatter skipped** — `"---\ntitle: ignored\n---\n\n# Real"` returns `"Real"`; the title is read from the body, not the metadata.
- **DOC-4.13-11** ✅ **Frontmatter + body-without-H1** — `"---\nkey: value\n---\n\nJust a paragraph."` returns `"Just a paragraph."`.
- **DOC-4.13-12** ✅ **Whitespace-only document → empty** — `" \n\n \n"` returns `""`.
- **DOC-4.13-13** ✅ **`#hashtag` (no space) is not treated as an H1** — `"#hashtag in body"` returns `"#hashtag in body"` verbatim; the fallback marker strip only removes `#` followed by a space.
- **DOC-4.13-14** 🚫 **Code-fenced H1s are not excluded** — documented limitation. `getFirstHeading("\`\`\`\n# not a real heading\n\`\`\`\n\n# Real One")` returns `"not a real heading"` because the parser doesn't track fences. Callers are expected to keep their H1 outside code blocks; covered here so future work doesn't change it by accident.
- **DOC-4.13-15** 🟡 **Debounce settles title after ~250 ms** — `DocumentView` schedules `setDerivedTitle(getFirstHeading(content))` inside a `setTimeout(250 ms)` and clears the pending timer on every keystroke, so the pane header stops churning while the user is typing and catches up once they pause. Code reviewed; dedicated timer-based test integration.
- **DOC-4.13-16** 🟡 **File-name fallback when body yields empty** — when `getFirstHeading` returns `""` (brand-new doc, whitespace-only body), `DocumentView` falls back to the `.md` basename so the pane title is never empty in the UI. Code reviewed; integration test
