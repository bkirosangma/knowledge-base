// src/app/knowledge_base/components/MarkdownEditor.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableNoNest } from "../extensions/tableNoNest";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { ListItem } from "@tiptap/extension-list-item";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { TextSelection } from "@tiptap/pm/state";
import { getMarkRange } from "@tiptap/core";
import { WikiLink } from "../extensions/wikiLink";
import { MarkdownReveal, RawBlock } from "../extensions/markdownReveal";
import {
  toggleRawSyntax,
  getActiveRawFormats,
  getRawHeadingLevel,
  isRawBlockquote,
  toggleRawBlockType,
  forceExitRawBlock,
} from "../extensions/rawSyntaxEngine";
import { CodeBlockWithCopy } from "../extensions/codeBlockCopy";
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";
import { LinkEditorPopover } from "./LinkEditorPopover";
import { TableFloatingToolbar } from "./TableFloatingToolbar";
import {
  Bold, Italic, Strikethrough, Code, Quote, List, ListOrdered,
  CheckSquare, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Minus, Link as LinkIcon,
  Table as TableIcon, Undo2, Redo2, FileCode,
} from "lucide-react";

interface MarkdownEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  /** Directory of the current document (from vault root), e.g. "docs/architecture".
   *  Used to resolve wiki-link paths relative to the current file, Obsidian-style. */
  currentDocDir?: string;
  readOnly?: boolean;
  /** Optional sidebar rendered beside editor content (below the toolbar). */
  rightSidebar?: React.ReactNode;
}

/* ── Toolbar button ── */
function TBtn({
  onClick, active, disabled, title, children,
}: {
  onClick: () => void; active?: boolean; disabled?: boolean; title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      } ${disabled ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5" />;
}


// markdownReveal needs to swap a list item's paragraph for a rawBlock when the
// cursor lands on it. The stock ListItem/TaskItem schemas lock the first child
// to `paragraph`, so the swap would throw "invalid content for listItem".
// Loosening the leading slot to `(paragraph | rawBlock)` is the minimum change
// — `block*` for the rest matches the stock extensions exactly.
const RawAwareListItem = ListItem.extend({
  content: "(paragraph | rawBlock) block*",
});
const RawAwareTaskItem = TaskItem.extend({
  content: "(paragraph | rawBlock) block*",
});

/* ── Interactive table size picker (Excel-style grid) ── */
function TablePicker({
  onSelect,
  disabled,
}: {
  onSelect: (rows: number, cols: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const maxRows = 8;
  const maxCols = 8;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  // Auto-close the popover if the picker becomes disabled while open (e.g.,
  // user clicked into a table while the popover was showing).
  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  return (
    <div ref={ref} className="relative">
      <TBtn
        onClick={() => { if (!disabled) setOpen(!open); }}
        active={open && !disabled}
        disabled={disabled}
        title={disabled ? "Insert table (not allowed inside a table)" : "Insert table"}
      >
        <TableIcon size={15} />
      </TBtn>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-2 z-50">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `repeat(${maxCols}, 1fr)` }}
            onMouseLeave={() => setHover(null)}
          >
            {Array.from({ length: maxRows * maxCols }, (_, i) => {
              const r = Math.floor(i / maxCols);
              const c = i % maxCols;
              const selected = hover && r <= hover.r && c <= hover.c;
              return (
                <div
                  key={i}
                  className={`w-5 h-5 border rounded-sm cursor-pointer transition-colors ${
                    selected
                      ? "bg-blue-100 border-blue-400"
                      : "bg-white border-slate-200 hover:border-slate-300"
                  }`}
                  onMouseEnter={() => setHover({ r, c })}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(r + 1, c + 1);
                    setOpen(false);
                    setHover(null);
                  }}
                />
              );
            })}
          </div>
          <div className="text-center text-xs text-slate-500 mt-1.5 font-medium">
            {hover ? `${hover.r + 1} × ${hover.c + 1} table` : "Select size"}
          </div>
        </div>
      )}
    </div>
  );
}

export default function MarkdownEditor({
  content,
  onChange,
  onNavigateLink,
  onCreateDocument,
  existingDocPaths,
  allDocPaths,
  currentDocDir = "",
  readOnly = false,
  rightSidebar,
}: MarkdownEditorProps) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawContent, setRawContent] = useState(content);
  const [, forceUpdate] = useState(0);
  const rawSwapRef = useRef(false);
  // Ref to the scrollable wrapper around <EditorContent>. Passed to the
  // floating table toolbar so it can position itself in the same scroll
  // context as the table it anchors to.
  const editorContainerRef = useRef<HTMLDivElement>(null);
  // Debounce handle for the heavy htmlToMarkdown + onChange round-trip that
  // fires on every keystroke. See docs/perf-analysis-2026-04-15.md #1.
  const pendingChangeRef = useRef<number | null>(null);
  // Stable ref for onChange so the debounced flusher doesn't have to be
  // re-attached on every parent re-render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        // Disable StarterKit's bundled Link so our Link.configure({...}) below
        // wins. Without this, both register and Tiptap warns about duplicates,
        // and our openOnClick setting is silently ignored.
        link: false,
        // Replaced by RawAwareListItem so markdownReveal can swap a list
        // item's paragraph for a rawBlock without violating the schema.
        listItem: false,
      }),
      RawAwareListItem,
      CodeBlockWithCopy,
      TableNoNest.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      RawAwareTaskItem.configure({ nested: true }),
      // Tiptap's `openOnClick: "whenNotEditable"` is broken in v3.22.3 — it
      // collapses to `true` and the clickHandler then fires only when the view
      // IS editable (opposite of documented). `false` prevents the plugin from
      // opening in edit mode; in read mode the view is contenteditable=false so
      // the browser follows the <a href> natively. Net effect: clickable only
      // in read mode, which is what we want.
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Image,
      WikiLink.configure({
        onNavigate: onNavigateLink,
        onCreateDocument,
        existingDocPaths,
        allDocPaths,
        currentDocDir,
      }),
      RawBlock,
      MarkdownReveal,
    ],
    content: markdownToHtml(content),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (rawSwapRef.current) {
        rawSwapRef.current = false;
        return;
      }
      if (!isRawMode) {
        // Debounce the serialize-plus-notify trip. `htmlToMarkdown` re-parses
        // the full doc into a DOM on every call and is the single heaviest
        // cost per keystroke. Flushed on blur and on unmount below so the
        // in-memory content never stays stale longer than one idle window.
        if (pendingChangeRef.current != null) {
          clearTimeout(pendingChangeRef.current);
        }
        pendingChangeRef.current = window.setTimeout(() => {
          pendingChangeRef.current = null;
          const md = htmlToMarkdown(ed.getHTML());
          onChangeRef.current?.(md);
        }, 200);
      }
    },
    // `onTransaction` fires for every transaction including selection-only
    // ones, so we don't need a separate `onSelectionUpdate` — this halves the
    // number of React re-renders per cursor move.
    onTransaction: ({ transaction }) => {
      if (transaction.getMeta("rawSwap")) {
        rawSwapRef.current = true;
      }
      forceUpdate((n) => n + 1);
    },
  });

  // Flush any pending debounced onChange when the editor blurs (user clicks
  // away, hits Cmd+S, switches tabs) or the component unmounts. Keeps
  // `docManager.activeDocContent` from lagging behind the editor state long
  // enough for a save to pick up stale content.
  useEffect(() => {
    if (!editor) return;
    const flush = () => {
      if (pendingChangeRef.current == null) return;
      clearTimeout(pendingChangeRef.current);
      pendingChangeRef.current = null;
      const md = htmlToMarkdown(editor.getHTML());
      onChangeRef.current?.(md);
    };
    editor.on("blur", flush);
    return () => {
      editor.off("blur", flush);
      flush();
    };
  }, [editor]);

  // Sync content from parent when it changes externally.
  //
  // Deferred to a microtask: setContent re-creates every node view in the doc,
  // and Tiptap's ReactRenderer (the wrapper around our wikiLink React node
  // view) calls `flushSync` during mount. Running that inside a useEffect's
  // commit phase trips React's "flushSync was called from inside a lifecycle
  // method" warning. The microtask runs right after commit finishes, which is
  // exactly what the warning suggests.
  useEffect(() => {
    if (!editor) return;
    queueMicrotask(() => {
      if (editor.isDestroyed || editor.isFocused) return;
      const currentMd = htmlToMarkdown(editor.getHTML());
      if (currentMd.trim() !== content.trim()) {
        editor.commands.setContent(markdownToHtml(content));
        setRawContent(content);
      }
    });
  }, [content, editor]);

  // Sync editable state when readOnly prop changes (Tiptap's `editable` option
  // is only read at init — later changes require setEditable). When locking,
  // dispatch a no-op transaction so the markdownReveal plugin re-runs with the
  // new isEditable value and restores any currently-visible rawBlock.
  //
  // Microtask-deferred for the same flushSync reason as the content-sync
  // effect above — setEditable rebuilds node views.
  useEffect(() => {
    if (!editor) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      editor.setEditable(!readOnly);
      if (readOnly) {
        editor.view.dispatch(editor.state.tr);
      }
    });
  }, [editor, readOnly]);

  // Read mode always shows rich text; raw mode is only honored when editable.
  const showRaw = isRawMode && !readOnly;

  // Update wiki-link extension options when doc paths or the current file
  // change. Dispatching a no-op transaction re-invokes nodeView `update()`
  // handlers so existence (blue/red) and relative-path resolution refresh.
  //
  // Microtask-deferred for the same flushSync reason as the effects above —
  // the dispatch can re-mount wikiLink React node views.
  useEffect(() => {
    if (!editor) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      editor.extensionManager.extensions.forEach((ext) => {
        if (ext.name === "wikiLink") {
          ext.options.existingDocPaths = existingDocPaths;
          ext.options.allDocPaths = allDocPaths;
          ext.options.currentDocDir = currentDocDir;
        }
      });
      editor.view.dispatch(editor.state.tr);
    });
  }, [editor, existingDocPaths, allDocPaths, currentDocDir]);

  const handleToggleRawMode = useCallback(() => {
    if (!editor) return;
    if (isRawMode) {
      editor.commands.setContent(markdownToHtml(rawContent));
      onChange?.(rawContent);
    } else {
      const md = htmlToMarkdown(editor.getHTML());
      setRawContent(md);
    }
    setIsRawMode(!isRawMode);
  }, [editor, isRawMode, rawContent, onChange]);

  const handleRawChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setRawContent(e.target.value);
      onChange?.(e.target.value);
    },
    [onChange],
  );

  const toggleLink = useCallback(() => {
    if (!editor) return;

    if (editor.isActive("link")) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    const { empty } = editor.state.selection;
    if (empty) {
      const pos = editor.state.selection.from;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: "link",
          marks: [{ type: "link", attrs: { href: "" } }],
        })
        .setTextSelection({ from: pos, to: pos + 4 })
        .run();
    } else {
      editor.chain().focus().setLink({ href: "" }).run();
    }
  }, [editor]);

  const addTable = useCallback((rows: number, cols: number) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  /** Expand the selection to the full link mark range (for toolbar formatting).
   *  In rawBlocks the link mark may cover syntax chars (**, ~~, etc.) so we
   *  strip those from the edges — toggleRawSyntax detects them outside the
   *  selection for proper wrap/unwrap toggling. */
  const selectFullLink = useCallback(() => {
    if (!editor || !editor.isActive("link")) return;
    const linkMark = editor.schema.marks.link;
    const $from = editor.state.selection.$from;
    const range = getMarkRange($from, linkMark);
    if (!range) return;

    let from = range.from;
    let to = range.to;

    const $head = editor.state.selection.$head;
    for (let d = $head.depth; d >= 0; d--) {
      if ($head.node(d).type.name === "rawBlock") {
        const text = editor.state.doc.textBetween(from, to);
        const lead = text.match(/^[*~`]+/);
        const trail = text.match(/[*~`]+$/);
        if (lead) from += lead[0].length;
        if (trail) to -= trail[0].length;
        if (from >= to) return;
        break;
      }
    }

    editor.chain().setTextSelection({ from, to }).run();
  }, [editor]);

  const sz = 15;

  // Compute raw-block active state once per render (toolbar re-renders on
  // every transaction via forceUpdate). `null` means not in a rawBlock.
  const rawFmt = editor ? getActiveRawFormats(editor) : null;
  const rawH = editor ? getRawHeadingLevel(editor) : null;
  const rawBQ = editor ? isRawBlockquote(editor) : null;
  const isAct = (mark: string) =>
    rawFmt ? rawFmt.has(mark) : !!editor?.isActive(mark);
  const isH = (lvl: number) =>
    rawH !== null ? rawH === lvl : !!editor?.isActive("heading", { level: lvl });
  const isBQ =
    rawBQ !== null ? rawBQ : !!editor?.isActive("blockquote");

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar (hidden in read-only mode) ── */}
      {!readOnly && (
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-200 bg-slate-50 flex-wrap">
        {/* Mode toggle */}
        <div className="flex items-center gap-1 mr-1 text-xs">
          <button
            onClick={handleToggleRawMode}
            className={`px-2 py-1 rounded ${!isRawMode ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
          >
            WYSIWYG
          </button>
          <button
            onClick={handleToggleRawMode}
            className={`px-2 py-1 rounded ${isRawMode ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
          >
            Raw
          </button>
        </div>

        {!isRawMode && editor && (
          <>
            <Sep />
            {/* Undo / Redo */}
            <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
              <Undo2 size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
              <Redo2 size={sz} />
            </TBtn>

            <Sep />
            {/* Headings */}
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 1)) editor.chain().focus().toggleHeading({ level: 1 }).run(); }} active={isH(1)} title="Heading 1">
              <Heading1 size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 2)) editor.chain().focus().toggleHeading({ level: 2 }).run(); }} active={isH(2)} title="Heading 2">
              <Heading2 size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 3)) editor.chain().focus().toggleHeading({ level: 3 }).run(); }} active={isH(3)} title="Heading 3">
              <Heading3 size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 4)) editor.chain().focus().toggleHeading({ level: 4 }).run(); }} active={isH(4)} title="Heading 4">
              <Heading4 size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 5)) editor.chain().focus().toggleHeading({ level: 5 }).run(); }} active={isH(5)} title="Heading 5">
              <Heading5 size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "heading", 6)) editor.chain().focus().toggleHeading({ level: 6 }).run(); }} active={isH(6)} title="Heading 6">
              <Heading6 size={sz} />
            </TBtn>

            <Sep />
            {/* Inline formatting */}
            <TBtn onClick={() => { selectFullLink(); if (!toggleRawSyntax(editor, "**")) editor.chain().focus().toggleBold().run(); }} active={isAct("bold")} title="Bold">
              <Bold size={sz} />
            </TBtn>
            <TBtn onClick={() => { selectFullLink(); if (!toggleRawSyntax(editor, "*")) editor.chain().focus().toggleItalic().run(); }} active={isAct("italic")} title="Italic">
              <Italic size={sz} />
            </TBtn>
            <TBtn onClick={() => { selectFullLink(); if (!toggleRawSyntax(editor, "~~")) editor.chain().focus().toggleStrike().run(); }} active={isAct("strike")} title="Strikethrough">
              <Strikethrough size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawSyntax(editor, "`")) editor.chain().focus().toggleCode().run(); }} active={isAct("code")} title="Inline code">
              <Code size={sz} />
            </TBtn>

            <Sep />
            {/* Block formatting */}
            <TBtn onClick={() => { forceExitRawBlock(editor); editor.chain().focus().toggleBulletList().run(); }} active={editor.isActive("bulletList")} title="Bullet list">
              <List size={sz} />
            </TBtn>
            <TBtn onClick={() => { forceExitRawBlock(editor); editor.chain().focus().toggleOrderedList().run(); }} active={editor.isActive("orderedList")} title="Numbered list">
              <ListOrdered size={sz} />
            </TBtn>
            <TBtn onClick={() => { forceExitRawBlock(editor); editor.chain().focus().toggleTaskList().run(); }} active={editor.isActive("taskList")} title="Task list">
              <CheckSquare size={sz} />
            </TBtn>
            <TBtn onClick={() => { if (!toggleRawBlockType(editor, "blockquote")) editor.chain().focus().toggleBlockquote().run(); }} active={isBQ} title="Blockquote">
              <Quote size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")} title="Code block">
              <FileCode size={sz} />
            </TBtn>

            <Sep />
            {/* Insert */}
            <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
              <Minus size={sz} />
            </TBtn>
            <TBtn onClick={toggleLink} active={editor.isActive("link")} title="Link">
              <LinkIcon size={sz} />
            </TBtn>
            <TablePicker onSelect={addTable} disabled={editor.isActive("table")} />
          </>
        )}
      </div>
      )}

      {/* ── Editor content + optional right sidebar ── */}
      <div className="flex-1 flex min-h-0">
        <div ref={editorContainerRef} className="flex-1 min-w-0 overflow-auto relative">
          {showRaw ? (
            <textarea
              value={rawContent}
              onChange={handleRawChange}
              className="w-full h-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none outline-none"
              spellCheck={false}
            />
          ) : (
            <>
              <EditorContent
                editor={editor}
                className="markdown-editor h-full overflow-auto"
              />
              <TableFloatingToolbar editor={editor} containerRef={editorContainerRef} />
            </>
          )}
        </div>
        {rightSidebar}
      </div>

      {/* Floating editor for the link under the cursor. Self-hides when the
          selection isn't inside a link mark or when the editor is read-only. */}
      {editor && !showRaw && (
        <LinkEditorPopover editor={editor} allDocPaths={allDocPaths} />
      )}
    </div>
  );
}
