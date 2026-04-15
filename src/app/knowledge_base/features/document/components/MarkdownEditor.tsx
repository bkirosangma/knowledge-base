// src/app/knowledge_base/components/MarkdownEditor.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Link } from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { WikiLink } from "../extensions/wikiLink";
import { MarkdownReveal, RawBlock } from "../extensions/markdownReveal";
import { CodeBlockWithCopy } from "../extensions/codeBlockCopy";
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";
import {
  Bold, Italic, Strikethrough, Code, Quote, List, ListOrdered,
  CheckSquare, Heading1, Heading2, Heading3, Minus, Link as LinkIcon,
  Table as TableIcon, Undo2, Redo2, FileCode,
} from "lucide-react";

interface MarkdownEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  readOnly?: boolean;
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

/* ── Interactive table size picker (Excel-style grid) ── */
function TablePicker({ onSelect }: { onSelect: (rows: number, cols: number) => void }) {
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

  return (
    <div ref={ref} className="relative">
      <TBtn onClick={() => setOpen(!open)} active={open} title="Insert table">
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
  readOnly = false,
}: MarkdownEditorProps) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawContent, setRawContent] = useState(content);
  const [, forceUpdate] = useState(0);
  const rawSwapRef = useRef(false);

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
      }),
      CodeBlockWithCopy,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: "whenNotEditable" }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Image,
      WikiLink.configure({
        onNavigate: onNavigateLink,
        onCreateDocument,
        existingDocPaths,
        allDocPaths,
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
  });

  // Sync content from parent when it changes externally
  useEffect(() => {
    if (editor && !editor.isFocused) {
      const currentMd = htmlToMarkdown(editor.getHTML());
      if (currentMd.trim() !== content.trim()) {
        editor.commands.setContent(markdownToHtml(content));
        setRawContent(content);
      }
    }
  }, [content, editor]);

  // Sync editable state when readOnly prop changes (Tiptap's `editable` option
  // is only read at init — later changes require setEditable). When locking,
  // dispatch a no-op transaction so the markdownReveal plugin re-runs with the
  // new isEditable value and restores any currently-visible rawBlock.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
    if (readOnly) {
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, readOnly]);

  // Read mode always shows rich text; raw mode is only honored when editable.
  const showRaw = isRawMode && !readOnly;

  // Update wiki-link extension options when doc paths change
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach((ext) => {
        if (ext.name === "wikiLink") {
          ext.options.existingDocPaths = existingDocPaths;
          ext.options.allDocPaths = allDocPaths;
        }
      });
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, existingDocPaths, allDocPaths]);

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

  const addLink = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL:");
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const addTable = useCallback((rows: number, cols: number) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  const sz = 15;

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
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
              <Heading1 size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
              <Heading2 size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
              <Heading3 size={sz} />
            </TBtn>

            <Sep />
            {/* Inline formatting */}
            <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
              <Bold size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
              <Italic size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Strikethrough">
              <Strikethrough size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")} title="Inline code">
              <Code size={sz} />
            </TBtn>

            <Sep />
            {/* Block formatting */}
            <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
              <List size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
              <ListOrdered size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")} title="Task list">
              <CheckSquare size={sz} />
            </TBtn>
            <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Blockquote">
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
            <TBtn onClick={addLink} active={editor.isActive("link")} title="Insert link">
              <LinkIcon size={sz} />
            </TBtn>
            <TablePicker onSelect={addTable} />
          </>
        )}
      </div>
      )}

      {/* ── Editor content ── */}
      <div className="flex-1 overflow-auto">
        {showRaw ? (
          <textarea
            value={rawContent}
            onChange={handleRawChange}
            className="w-full h-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none outline-none"
            spellCheck={false}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="markdown-editor h-full overflow-auto"
          />
        )}
      </div>
    </div>
  );
}
