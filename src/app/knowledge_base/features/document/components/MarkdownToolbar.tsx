"use client";

import React from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Code, Quote, List, ListOrdered,
  CheckSquare, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6,
  Minus, Link as LinkIcon, Undo2, Redo2, FileCode,
} from "lucide-react";
import { TBtn, Sep } from "./ToolbarButton";
import TablePicker from "./TablePicker";
import {
  toggleRawSyntax,
  getActiveRawFormats,
  getRawHeadingLevel,
  isRawBlockquote,
  toggleRawBlockType,
  forceExitRawBlock,
} from "../extensions/rawSyntaxEngine";

export interface MarkdownToolbarProps {
  editor: Editor | null;
  isRawMode: boolean;
  onToggleRawMode: () => void;
  selectFullLink: () => void;
  toggleLink: () => void;
  addTable: (rows: number, cols: number) => void;
}

/**
 * Editor toolbar: WYSIWYG/Raw mode tabs, undo/redo, heading levels, inline
 * marks (bold/italic/strike/code), block types (lists / blockquote / code
 * block), insertables (HR / link / table). Hidden in read-only mode.
 *
 * rawBlock-aware: when the cursor sits inside a rawBlock, mark toggles
 * switch to character-level markdown-syntax manipulation rather than Tiptap
 * mark commands (which rawBlock rejects).
 */
export default function MarkdownToolbar({
  editor,
  isRawMode,
  onToggleRawMode,
  selectFullLink,
  toggleLink,
  addTable,
}: MarkdownToolbarProps) {
  const sz = 15;

  // Compute raw-block active state once per render. `null` means not in a rawBlock.
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
    <div className="flex items-center gap-0.5 px-2 py-1 border-b border-slate-200 bg-slate-50 flex-wrap">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 mr-1 text-xs">
        <button
          onClick={onToggleRawMode}
          className={`px-2 py-1 rounded ${!isRawMode ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
        >
          WYSIWYG
        </button>
        <button
          onClick={onToggleRawMode}
          className={`px-2 py-1 rounded ${isRawMode ? "bg-white shadow-sm font-medium text-slate-800" : "text-slate-400 hover:text-slate-600"}`}
        >
          Raw
        </button>
      </div>

      {!isRawMode && editor && (
        <>
          <Sep />
          {/* Undo / Redo — commands may be absent when undoRedo: false in StarterKit */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <TBtn onClick={() => (editor.chain().focus() as any).undo?.()?.run()} disabled={!(editor.can() as any).undo?.()} title="Undo">
            <Undo2 size={sz} />
          </TBtn>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <TBtn onClick={() => (editor.chain().focus() as any).redo?.()?.run()} disabled={!(editor.can() as any).redo?.()} title="Redo">
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
  );
}
