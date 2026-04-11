// src/app/architecture_designer/components/MarkdownEditor.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
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
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";

interface MarkdownEditorProps {
  content: string;                 // raw markdown string
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  readOnly?: boolean;
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

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      Image,
      WikiLink.configure({
        onNavigate: onNavigateLink,
        onCreateDocument,
        existingDocPaths,
        allDocPaths,
      }),
    ],
    content: markdownToHtml(content),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (!isRawMode) {
        const md = htmlToMarkdown(ed.getHTML());
        onChange?.(md);
      }
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

  // Update wiki-link extension options when doc paths change
  useEffect(() => {
    if (editor) {
      editor.extensionManager.extensions.forEach(ext => {
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
      // Switching from raw → WYSIWYG
      editor.commands.setContent(markdownToHtml(rawContent));
      onChange?.(rawContent);
    } else {
      // Switching from WYSIWYG → raw
      const md = htmlToMarkdown(editor.getHTML());
      setRawContent(md);
    }
    setIsRawMode(!isRawMode);
  }, [editor, isRawMode, rawContent, onChange]);

  const handleRawChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawContent(e.target.value);
    onChange?.(e.target.value);
  }, [onChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Editor mode toggle */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 bg-slate-50 text-xs">
        <button
          onClick={handleToggleRawMode}
          className={`px-2 py-1 rounded ${!isRawMode ? "bg-white shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          WYSIWYG
        </button>
        <button
          onClick={handleToggleRawMode}
          className={`px-2 py-1 rounded ${isRawMode ? "bg-white shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"}`}
        >
          Raw
        </button>
      </div>

      {/* Editor content */}
      <div className="flex-1 overflow-auto">
        {isRawMode ? (
          <textarea
            value={rawContent}
            onChange={handleRawChange}
            readOnly={readOnly}
            className="w-full h-full p-4 font-mono text-sm bg-slate-900 text-slate-100 resize-none outline-none"
            spellCheck={false}
          />
        ) : (
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none p-4 h-full [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-full"
          />
        )}
      </div>
    </div>
  );
}
