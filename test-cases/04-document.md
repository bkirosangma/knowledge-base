# Test Cases — Document Editor

> Mirrors §4 of [Features.md](../Features.md). See [README.md](README.md) for ID scheme and coverage markers.

---

## 4.1 Editor Orchestration

- **DOC-4.1-01** ❌ **DocumentView mounts for `.md` file** — open a doc → `MarkdownPane` renders with its content.
- **DOC-4.1-02** ❌ **Focused state tracked** — click editor → `focused` flag true; blur → false.
- **DOC-4.1-03** ❌ **MarkdownPane header shows breadcrumb** — path segments rendered.
- **DOC-4.1-04** ❌ **Backlinks dropdown opens** — click backlinks button → list of sources expands.
- **DOC-4.1-05** ❌ **Read-only toggle in PaneHeader** — lock icon toggles `readOnly` prop into editor.
- **DOC-4.1-06** ❌ **200 ms debounce on serialize** — rapid typing (< 200 ms gap) → only one serialize call after pause.
- **DOC-4.1-07** ❌ **Flush on blur** — typing then clicking outside → serialize flushed immediately, no data loss.
- **DOC-4.1-08** ❌ **Flush on unmount** — switch to another doc mid-type → prior doc's content flushed before unmount.

## 4.2 Tiptap Extensions (StarterKit + ecosystem)

- **DOC-4.2-01** ❌ **H1–H6 render** — markdown `# …` through `###### …` → headings with correct levels.
- **DOC-4.2-02** ❌ **Paragraphs render** — default block is paragraph.
- **DOC-4.2-03** ❌ **Bullet list** — `- item` → `<ul>` with `<li>`.
- **DOC-4.2-04** ❌ **Ordered list** — `1. item` → `<ol>`.
- **DOC-4.2-05** ❌ **Task list** — `- [ ] item` / `- [x] item` → `<ul data-task-list>` with `input type=checkbox`.
- **DOC-4.2-06** ❌ **Checkbox toggle updates markdown** — click task → markdown switches `[ ]` ↔ `[x]`.
- **DOC-4.2-07** ❌ **Blockquote** — `> quote` → `<blockquote>`.
- **DOC-4.2-08** ❌ **Bold mark** — `**bold**` → `<strong>`.
- **DOC-4.2-09** ❌ **Italic mark** — `*italic*` → `<em>`.
- **DOC-4.2-10** ❌ **Strikethrough** — `~~strike~~` → `<s>`.
- **DOC-4.2-11** ❌ **Inline code** — `` `code` `` → `<code>`.
- **DOC-4.2-12** ❌ **Horizontal rule** — `---` → `<hr>`.
- **DOC-4.2-13** ❌ **Hard break** — trailing double-space + newline preserved.
- **DOC-4.2-14** ❌ **Table renders** — GFM pipe table → `<table><thead><tbody>`.
- **DOC-4.2-15** ❌ **Image extension** — Markdown image syntax → `<img>` with `src`/`alt`.
- **DOC-4.2-16** ❌ **Link extension** — `[text](url)` → `<a href="url">text</a>`.
- **DOC-4.2-17** ❌ **Placeholder renders on empty** — empty doc → placeholder text visible until first keystroke.
- **DOC-4.2-18** ❌ **Code block with lowlight** — fenced code `\`\`\`ts` → code block with syntax highlighting classes for TypeScript.

## 4.3 Custom Extensions

### 4.3.a WikiLink (`wikiLink.ts`)
- **DOC-4.3-01** ❌ **`[[foo]]` renders as blue pill** — target exists → `bg-blue-100` pill, "Open" title.
- **DOC-4.3-02** ❌ **`[[nonexistent]]` renders as red pill** — no target → `bg-red-100`, "click to create" title.
- **DOC-4.3-03** ❌ **Doc icon on `.md` target** — FileText icon rendered.
- **DOC-4.3-04** ❌ **Diagram icon on `.json` target** — Workflow icon rendered.
- **DOC-4.3-05** ❌ **`[[foo#section]]` stores section attr** — node `section === "section"`.
- **DOC-4.3-06** ❌ **`[[foo|Bar]]` stores display attr** — node `display === "Bar"`; rendered label is "Bar".
- **DOC-4.3-07** ❌ **Suggestion menu opens on `[[`** — type `[[` → dropdown appears with candidate paths.
- **DOC-4.3-08** ❌ **Suggestion filters by typed query** — type `[[au` → only paths matching "au" shown.
- **DOC-4.3-09** ❌ **Arrow keys navigate suggestion.**
- **DOC-4.3-10** ❌ **Enter commits suggestion** — inserts `[[<path>]]` atomic node.
- **DOC-4.3-11** ❌ **Escape closes suggestion without insert.**
- **DOC-4.3-12** ❌ **Inline edit on selection — single key appends** — click wiki-link to select, type `s` → display text ends with `s`.
- **DOC-4.3-13** ❌ **Backspace trims display text.**
- **DOC-4.3-14** ❌ **Escape reverts display text to prior value.**
- **DOC-4.3-15** ❌ **Click in read-mode navigates** — editor `readOnly` → click → file opened in other pane.
- **DOC-4.3-16** ❌ **Click unresolved in read-mode creates** — red pill click → creates the target file.
- **DOC-4.3-17** ❌ **Path resolution: current-dir `.md`** — `[[sibling]]` inside `foo/bar.md` → resolves to `foo/sibling.md`.
- **DOC-4.3-18** ❌ **Path resolution: current-dir `.json` fallback** — no `.md` but sibling `.json` exists → resolves there.
- **DOC-4.3-19** ❌ **Path resolution: as-written** — `[[foo.md]]` with extension → used verbatim.
- **DOC-4.3-20** ❌ **Path resolution: root `.md` fallback** — `[[readme]]` finds `/readme.md` when no sibling.
- **DOC-4.3-21** ❌ **Path resolution: root `.json` fallback** — same but for diagrams.

### 4.3.b CodeBlockWithCopy (`codeBlockCopy.tsx`)
- **DOC-4.3-22** ✅ **Copy button rendered inside the code-block wrapper** — `md-codeblock-copy` element is present in the rendered NodeView; CSS drives the hover-reveal.
- **DOC-4.3-23** ✅ **Click copies code to clipboard** — `navigator.clipboard.writeText` is called with the `node.textContent` on click.
- **DOC-4.3-24** ✅ **Fallback to execCommand when clipboard throws** — on `writeText` rejection, the view creates a temporary `<textarea>`, selects it, and calls `document.execCommand('copy')`.
- **DOC-4.3-25** ✅ **Copy button shows confirmation state** — immediately after click the button label+title flips to `"Copied"` and reverts to `"Copy code"` after ~1500 ms.

### 4.3.c TableNoNest (`tableNoNest.ts`)
- **DOC-4.3-26** ✅ **`insertTable` blocked inside table** — the TableNoNest extension checks `editor.isActive("table")` and returns `false` before delegating to the parent command; no second table is inserted.
- **DOC-4.3-27** ✅ **`insertTable` allowed outside table** — when the cursor is in a paragraph/heading/etc., the command delegates to the parent Table's `insertTable` and inserts normally. Moving the cursor back out re-enables the command.

### 4.3.d MarkdownReveal (`markdownReveal.ts`)
- **DOC-4.3-28** ❌ **Decoration wraps `**bold**`** — type `**x**` in a rawBlock → `<strong>` decoration on `x`.
- **DOC-4.3-29** ❌ **Decoration wraps `*italic*`** — → `<em>`.
- **DOC-4.3-30** ❌ **Decoration wraps `~~strike~~`** — → `<s>`.
- **DOC-4.3-31** ❌ **Decoration wraps `` `code` ``** — → `<code>`.
- **DOC-4.3-32** ❌ **Triple-asterisk renders bold+italic.**
- **DOC-4.3-33** ❌ **Italic lookahead/lookbehind excludes bold** — inside `**…**`, single `*` not matched as italic.
- **DOC-4.3-34** ❌ **Cursor enters paragraph → rawBlock conversion.**
- **DOC-4.3-35** ❌ **Cursor exits rawBlock → re-parses via markdown-it.**
- **DOC-4.3-36** ❌ **LRU cache hit skips parse** — same markdown twice → second pass uses cache.
- **DOC-4.3-37** ❌ **LRU cap = 64** — 65 distinct entries → least-recently-used evicted.
- **DOC-4.3-38** ❌ **Enter in rawBlock splits with smart list-item handling** — in a `- item` rawBlock, Enter → new `- ` list item.
- **DOC-4.3-39** ❌ **Backspace at rawBlock start merges with previous block's rightmost textblock.**
- **DOC-4.3-40** ❌ **rawSwap meta flag suppresses serialize** — swap rawBlock ↔ rich → no `onUpdate` serialise fired.

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

- **DOC-4.5-01** ❌ **Toolbar hidden in read-only.**
- **DOC-4.5-02** ❌ **Toolbar hidden in raw mode.**
- **DOC-4.5-03** ❌ **WYSIWYG ↔ Raw toggle** — click → editor swaps to textarea with code styling.
- **DOC-4.5-04** ❌ **Undo disabled when stack empty** — fresh doc → disabled; after edit → enabled.
- **DOC-4.5-05** ❌ **Redo disabled when no undone history.**
- **DOC-4.5-06** ❌ **H1 button active state** — cursor in H1 → button highlighted; H2 → not.
- **DOC-4.5-07** ❌ **H1 button toggles heading** — click in paragraph → becomes H1; click again → back to paragraph.
- **DOC-4.5-08** ❌ **Bold / italic / strike / inline-code buttons toggle respective marks.**
- **DOC-4.5-09** ❌ **Bold in rawBlock toggles `**…**` syntax (`toggleRawSyntax`)** — inserts or removes delimiters.
- **DOC-4.5-10** ❌ **`toggleRawSyntax` detects `*` vs `**`** — counts consecutive asterisks and maps to correct mark.
- **DOC-4.5-11** ❌ **Heading in rawBlock toggles `# ` prefix (`toggleRawBlockType`).**
- **DOC-4.5-12** ❌ **List / blockquote / code block buttons toggle block type.**
- **DOC-4.5-13** ❌ **Force-exit rawBlock before structural commands** — toggle list when in rawBlock → rawBlock converts to rich first.
- **DOC-4.5-14** ❌ **`getActiveRawFormats` — bold detected in rawBlock** — cursor inside `**x**` → bold reported active.
- **DOC-4.5-15** ❌ **`getRawHeadingLevel` — detects `#{N}` prefix.**
- **DOC-4.5-16** ❌ **`isRawBlockquote` — detects `> ` prefix.**
- **DOC-4.5-17** ❌ **Horizontal rule button inserts `<hr>`.**
- **DOC-4.5-18** ❌ **Link button with text selected wraps selection.**
- **DOC-4.5-19** ❌ **Link button with empty selection inserts empty link** — opens link popover for editing.
- **DOC-4.5-20** ❌ **Table picker shows 8×8 grid.**
- **DOC-4.5-21** ❌ **Hovering cell shows "N × M table".**
- **DOC-4.5-22** ❌ **Click inserts table of chosen dims.**
- **DOC-4.5-23** ❌ **Table picker disabled when cursor already in table.**

## 4.6 Table Floating Toolbar

- **DOC-4.6-01** 🚫 **Appears when cursor enters table.** — real hover geometry, JSDOM can't simulate.
- **DOC-4.6-02** 🚫 **Appears on hover over table** — even if cursor elsewhere. — real hover, JSDOM.
- **DOC-4.6-03** 🚫 **200 ms hide delay on mouse-leave.** — timer + mouse-leave geometry, JSDOM.
- **DOC-4.6-04** 🚫 **Positioned above the table.** — real layout position, JSDOM returns zeros.
- **DOC-4.6-05** 🚫 **Hides when table scrolls out of viewport.** — scroll events + geometry, JSDOM.
- **DOC-4.6-06** ✅ **Add row above / below** — new row inserted at correct index.
- **DOC-4.6-07** ✅ **Delete row.**
- **DOC-4.6-08** ✅ **Add column left / right.**
- **DOC-4.6-09** ✅ **Delete column.**
- **DOC-4.6-10** ✅ **Toggle header row.**
- **DOC-4.6-11** 🟡 **Toggle header column.** — button present (covered by labels test); dedicated mutation test not yet written.
- **DOC-4.6-12** ✅ **Delete table.**
- **DOC-4.6-13** 🚫 **Hover-only mode — buttons disabled until cursor enters.** — real hover, JSDOM.
- **DOC-4.6-14** 🚫 **Clicking button snaps cursor into last-hovered cell first** — e.g., "Delete row" targets that cell's row. — hover tracking, JSDOM.

## 4.7 Link Editor Popover

- **DOC-4.7-01** ✅ **Opens for link mark** — click `<a>` → popover with URL + text fields.
- **DOC-4.7-02** ✅ **Opens for wiki-link node** — click pill → popover with path + section + display fields.
- **DOC-4.7-03** 🚫 **Default positioning below target.** — real viewport geometry, JSDOM returns zeros.
- **DOC-4.7-04** 🚫 **Flips above when no room below.** — real viewport geometry, JSDOM.
- **DOC-4.7-05** 🚫 **Clamps horizontally inside viewport.** — real viewport geometry, JSDOM.
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
- **DOC-4.8-06** ✅ **Normalises `..`** — `('../x', 'a/b')` → `a/x.md`. `..` beyond the root is kept as a literal segment (no implicit clamp to root).
- **DOC-4.8-07** ✅ **Normalises `.`** — `('./x', 'a/b')` → `a/b/x.md`.
- **DOC-4.8-08** ✅ **Appends `.md` if no extension.**
- **DOC-4.8-09** ✅ **Preserves `.json` extension.**
- **DOC-4.8-10** ✅ **`updateWikiLinkPaths` bulk rename** — `foo.md` → `bar.md`: `[[foo]]` → `[[bar]]`; `[[foo#s]]` → `[[bar#s]]`; `[[foo|Label]]` → `[[bar | Label]]`; `[[foo#s|Label]]` → `[[bar#s | Label]]`. _Note: formatter emits ` | ` (space-padded) around the display-text separator._
- **DOC-4.8-11** ✅ **`updateWikiLinkPaths` strips `.md` for matching** — handles either form in source and in `oldPath`/`newPath` arguments.
- **DOC-4.8-12** ✅ **Does not change unrelated links** — `[[fooey]]` and other non-matching paths are untouched; leading `/` is preserved across vault-absolute renames.

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
- **DOC-4.10-02** ✅ **`loadIndex` missing file** — `NotFoundError` on either the directory or file level returns an `emptyIndex()` (fresh, timestamped) — no throw.
- **DOC-4.10-03** ✅ **`loadIndex` malformed JSON** — `JSON.parse` errors OR validation-rejected shapes return the empty index.
- **DOC-4.10-04** ✅ **`saveIndex`** — writes `.archdesigner/_links.json` with a pretty-printed `{ ...index, updatedAt }`. Never mutates the input argument (clones with fresh timestamp).
- **DOC-4.10-05** ✅ **`updateDocumentLinks` outbound** — parses wiki-links from the markdown content, splits into `outboundLinks` (no section) and `sectionLinks` (with section). Link `type` is `"diagram"` when the resolved path ends in `.json`, else `"document"`.
- **DOC-4.10-06** ✅ **`updateDocumentLinks` rebuilds backlinks** — every outbound and section link produces a reverse edge in `index.backlinks[targetPath].linkedFrom`.
- **DOC-4.10-07** 🟡 **`updateDocumentLinks` emits graphify cross-refs** — `updateDocumentLinks` calls `emitCrossReferences` after saving; observable through the mock's `.archdesigner/cross-references.json` write. Asserted indirectly via the `updateDocumentLinks` test writing `_links.json`; direct cross-ref assertion deferred to Bucket 19 integration tests.
- **DOC-4.10-08** ✅ **`removeDocumentFromIndex`** — deletes `documents[docPath]` then rebuilds backlinks so orphaned entries disappear.
- **DOC-4.10-09** ✅ **`renameDocumentInIndex`** — moves `documents[old]` → `documents[new]`, rewrites every outbound/section `targetPath === old` to `new`, then rebuilds backlinks.
- **DOC-4.10-10** ✅ **`getBacklinksFor`** — returns `linkIndex.backlinks[docPath]?.linkedFrom ?? []`; empty array for unknown paths.
- **DOC-4.10-11** ✅ **`fullRebuild`** — reads every path from the provided `allDocPaths`, builds a fresh index from parsed content, and writes `_links.json`. Unreadable files are skipped silently.
- **DOC-4.10-12** ✅ **Idempotent `fullRebuild`** — running it twice over the same inputs produces identical `documents` and `backlinks` content (only `updatedAt` changes).

## 4.11 Document Persistence

- **DOC-4.11-01** ✅ **Per-pane content + dirty state** — `useDocumentContent` is instantiated per pane; each instance has its own `content`/`dirty` state. Verified by loading and editing independently in a single hook instance (pane-level isolation is a composition guarantee, covered by the integration test in Bucket 18).
- **DOC-4.11-02** ✅ **Auto-save on file switch** — when `filePath` prop changes and the previous file was dirty, the hook writes the previous content via `writeTextFile(dirHandleRef, prevPath, contentRef.current)` before loading the new file.
- **DOC-4.11-03** ✅ **`save()` writes via File System Access API** — verified by asserting the mock file's contents after `save()`; routed through `writeTextFile`.
- **DOC-4.11-04** ✅ **Dirty flag cleared after save** — `save()` sets `dirty = false` on success.
- **DOC-4.11-05** ✅ **Dirty flag set on edit** — `updateContent(md)` sets content and flips `dirty = true`.
- **DOC-4.11-06** ✅ **Bridge exposes `save`, `dirty`, `filePath`, `content`** — `bridge.content` / `bridge.dirty` use ref-backed getters (reflect latest state without re-render); `bridge.save()` mirrors the hook's `save()`.
- **DOC-4.11-07** 🟡 **`createDocument` writes new file with initial content** — trivially routes `writeTextFile(rootHandle, path, initialContent)`; asserted indirectly via the write helper's tests. Full path exercised in file-ops bucket.
- **DOC-4.11-08** ✅ **`attachDocument` records link to entity** — creates a new `DocumentMeta` (or appends to existing) with `{type, id}`; idempotent on duplicate pairs.
- **DOC-4.11-09** ✅ **`detachDocument` removes link** — removes one `{type, id}` attachment; purges the `DocumentMeta` entirely when no attachments remain; no-op on unknown document.
- **DOC-4.11-10** ✅ **`getDocumentsForEntity` filters by entity** — returns all `DocumentMeta` whose `attachedTo` includes the `(type, id)` pair.
- **DOC-4.11-11** ✅ **`hasDocuments` true when any attached** — boolean form of 4.11-10.
- **DOC-4.11-12** ✅ **`collectDocPaths` extracts all `.md` paths from tree** — depth-first walk; includes only `type === "file" && fileType === "document"`.
- **DOC-4.11-13** ✅ **`existingDocPaths` Set for O(1) membership** — returns a `new Set(collectDocPaths(tree))`.

## 4.12 Read-Only Mode (Document)

- **DOC-4.12-01** ❌ **`readOnly` prop hides toolbar.**
- **DOC-4.12-02** ❌ **`readOnly` disables table floating toolbar.**
- **DOC-4.12-03** ❌ **`readOnly` disables link editor popover.**
- **DOC-4.12-04** ❌ **Editor becomes `contenteditable=false`.**
- **DOC-4.12-05** ❌ **Wiki-link click navigates instead of selecting** — per §4.3-15.
- **DOC-4.12-06** ❌ **`setEditable` called on prop change (microtask deferred)** — confirms the known Tiptap gotcha from MEMORY.
