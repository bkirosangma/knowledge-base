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
import { getMarkRange } from "@tiptap/core";
import { WikiLink } from "../extensions/wikiLink";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import { MarkdownReveal, RawBlock } from "../extensions/markdownReveal";
import { CodeBlockWithCopy } from "../extensions/codeBlockCopy";
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";
import { LinkEditorPopover } from "./LinkEditorPopover";
import { TableFloatingToolbar } from "./TableFloatingToolbar";
import MarkdownToolbar from "./MarkdownToolbar";

/** Aggregate editorial metadata derived from the rendered Tiptap DOM —
 *  pushed up to MarkdownPane so the read-mode chrome (TOC, progress bar,
 *  reading-time pill) can react to content changes without owning a second
 *  parser. Recomputed inside MarkdownEditor on `onUpdate` and on initial
 *  content sync. */
export interface ReadingMeta {
  /** Word count of the rendered text — drives the reading-time pill. */
  wordCount: number;
  /** H1/H2/H3 entries in document order. */
  headings: Array<{ id: string; level: 1 | 2 | 3; text: string }>;
}

interface MarkdownEditorProps {
  content: string;
  onChange?: (markdown: string) => void;
  onNavigateLink?: (path: string, section?: string) => void;
  onCreateDocument?: (path: string) => void;
  existingDocPaths?: Set<string>;
  allDocPaths?: string[];
  /** Full file tree — passed to the wiki-link folder picker. */
  tree?: TreeNode[];
  /** Directory of the current document (from vault root), e.g. "docs/architecture".
   *  Used to resolve wiki-link paths relative to the current file, Obsidian-style. */
  currentDocDir?: string;
  readOnly?: boolean;
  /** Optional sidebar rendered beside editor content (below the toolbar). */
  rightSidebar?: React.ReactNode;
  /** Called when the user's cursor moves to a different block; receives the
   *  current markdown content. Used by the shared action history to save a
   *  checkpoint without debounce lag. */
  onBlockChange?: (content: string) => void;
  /** Increment to force-apply `content` to the editor even when focused.
   *  Used by undo/redo to bypass the isFocused guard in the content-sync effect. */
  historyToken?: number;
  /** When true, hide the formatting toolbar even in edit mode. Used by Focus
   *  Mode (⌘.) so only the document content remains visible. */
  hideToolbar?: boolean;
  /** Called whenever the rendered text changes — surfaces word count + the
   *  ordered list of H1/H2/H3 IDs/text so `MarkdownPane` can render the TOC
   *  rail and reading-time pill without re-parsing markdown. */
  onReadingMetaChange?: (meta: ReadingMeta) => void;
  /** Imperative ref to the scrollable editor container. The reading
   *  progress bar reads its scrollTop / scrollHeight; the TOC scrolls it
   *  to a heading on click. */
  editorContainerRef?: React.RefObject<HTMLDivElement | null>;
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

/** Slugify a heading's text for use as an `id` anchor. Matches the
 *  conventional GitHub-style slug closely enough for in-document links —
 *  lowercase, spaces → hyphens, drop punctuation. Two collisions in one
 *  doc get a `-2`, `-3`, ... suffix; the caller (`extractReadingMeta`)
 *  supplies the seen-slug counter. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Reading-time + TOC source-of-truth. Reads directly from the rendered DOM
 *  rather than re-parsing markdown so the headings always match what the
 *  user sees and the IDs stick on the live nodes for click-to-scroll. */
function extractReadingMeta(root: HTMLElement): ReadingMeta {
  const text = root.textContent ?? "";
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const headingNodes = root.querySelectorAll("h1, h2, h3");
  const headings: ReadingMeta["headings"] = [];
  const seen = new Map<string, number>();
  headingNodes.forEach((node) => {
    const el = node as HTMLElement;
    const heading = el.textContent?.trim() ?? "";
    if (!heading) return;
    const tag = el.tagName.toLowerCase();
    const level = (tag === "h1" ? 1 : tag === "h2" ? 2 : 3) as 1 | 2 | 3;
    let id = slugify(heading);
    if (!id) id = `heading-${headings.length + 1}`;
    const collisions = seen.get(id) ?? 0;
    if (collisions > 0) id = `${id}-${collisions + 1}`;
    seen.set(id, collisions + 1);
    // Stamp the ID onto the live node so ReadingTOC can scroll-to-element
    // by id without re-querying.
    if (el.id !== id) el.id = id;
    headings.push({ id, level, text: heading });
  });

  return { wordCount, headings };
}


export default function MarkdownEditor({
  content,
  onChange,
  onNavigateLink,
  onCreateDocument,
  existingDocPaths,
  allDocPaths,
  tree,
  currentDocDir = "",
  readOnly = false,
  rightSidebar,
  onBlockChange,
  historyToken,
  hideToolbar = false,
  onReadingMetaChange,
  editorContainerRef: editorContainerRefProp,
}: MarkdownEditorProps) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawContent, setRawContent] = useState(content);
  const [, forceUpdate] = useState(0);
  const rawSwapRef = useRef(false);
  // Ref to the scrollable wrapper around <EditorContent>. Passed to the
  // floating table toolbar so it can position itself in the same scroll
  // context as the table it anchors to. May also be supplied externally
  // (read-mode chrome — progress bar, TOC scrollspy — needs to read the
  // same scroll container).
  const localEditorContainerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = editorContainerRefProp ?? localEditorContainerRef;
  // Stable ref for the reading-meta callback so the onUpdate closure doesn't
  // need to be re-bound when MarkdownPane re-renders.
  const onReadingMetaChangeRef = useRef(onReadingMetaChange);
  useEffect(() => {
    onReadingMetaChangeRef.current = onReadingMetaChange;
  }, [onReadingMetaChange]);
  // Debounce handle for the heavy htmlToMarkdown + onChange round-trip that
  // fires on every keystroke. See docs/perf-analysis-2026-04-15.md #1.
  const pendingChangeRef = useRef<number | null>(null);
  // Stable ref for onChange so the debounced flusher doesn't have to be
  // re-attached on every parent re-render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const onBlockChangeRef = useRef(onBlockChange);
  useEffect(() => {
    onBlockChangeRef.current = onBlockChange;
  }, [onBlockChange]);
  const prevBlockStartRef = useRef(-1);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
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
        tree,
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
      // Recompute reading meta on every doc transaction. ProseMirror has
      // already committed to the DOM by the time onUpdate fires, so the
      // rendered headings/word count are accurate without a microtask hop.
      if (onReadingMetaChangeRef.current) {
        const dom = ed.view.dom as HTMLElement;
        onReadingMetaChangeRef.current(extractReadingMeta(dom));
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
    // ones. We use it here only for rawSwap bookkeeping and forceUpdate; the
    // block-boundary detection is handled separately in onSelectionUpdate.
    onTransaction: ({ transaction }) => {
      if (transaction.getMeta("rawSwap")) {
        rawSwapRef.current = true;
      }
      forceUpdate((n) => n + 1);
    },
    onSelectionUpdate: ({ editor: ed }) => {
      if (!onBlockChangeRef.current) return;
      const { $anchor } = ed.state.selection;
      const blockStart = $anchor.start($anchor.depth);
      if (blockStart !== prevBlockStartRef.current) {
        prevBlockStartRef.current = blockStart;
        const md = htmlToMarkdown(ed.getHTML());
        onBlockChangeRef.current(md);
      }
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
        // `emitUpdate: false`: prevent the save loop where parent-driven
        // content changes (e.g. an external save landing) echo back
        // through onUpdate → debounced onChange → parent saves again.
        // See DOC-4.5-26 for the regression test.
        editor.commands.setContent(markdownToHtml(content), { emitUpdate: false });
        setRawContent(content);
      }
    });
  }, [content, editor]);


  // When historyToken changes, force-apply content to the editor even if focused.
  // The normal content-sync effect skips updates while the editor is focused to
  // prevent echo loops during typing; undo/redo must bypass that guard.
  useEffect(() => {
    if (!editor || historyToken === undefined) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      const currentMd = htmlToMarkdown(editor.getHTML());
      if (currentMd.trim() !== content.trim()) {
        editor.commands.setContent(markdownToHtml(content), { emitUpdate: false });
        setRawContent(content);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyToken]);
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

  // Emit reading meta whenever the editor mounts or external content changes
  // land — covers initial render and file switches (where onUpdate doesn't
  // fire because Tiptap's setContent is invoked with `emitUpdate: false`).
  useEffect(() => {
    if (!editor || !onReadingMetaChangeRef.current) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      const dom = editor.view.dom as HTMLElement;
      onReadingMetaChangeRef.current?.(extractReadingMeta(dom));
    });
  }, [editor, content]);

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
          ext.options.tree = tree;
          ext.options.currentDocDir = currentDocDir;
        }
      });
      editor.view.dispatch(editor.state.tr);
    });
  }, [editor, existingDocPaths, allDocPaths, tree, currentDocDir]);

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

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar (hidden in read-only mode and in Focus Mode) ── */}
      {!readOnly && !hideToolbar && (
        <MarkdownToolbar
          editor={editor}
          isRawMode={isRawMode}
          onToggleRawMode={handleToggleRawMode}
          selectFullLink={selectFullLink}
          toggleLink={toggleLink}
          addTable={addTable}
        />
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
              {/* Wrap EditorContent in a div that owns the dynamic class
                  list.  Tiptap's EditorContent caches its className at
                  mount in v3, so toggling `editorial` directly on it
                  doesn't repaint when readOnly flips.  A wrapper div is
                  cheap, ProseMirror still sits one level inside, and the
                  selector `.markdown-editor.editorial .ProseMirror` still
                  matches on toggle. */}
              <div
                className={`markdown-editor h-full overflow-auto${readOnly ? " editorial" : ""}`}
              >
                <EditorContent editor={editor} className="h-full" />
              </div>
              <TableFloatingToolbar editor={editor} containerRef={editorContainerRef} />
            </>
          )}
        </div>
        {rightSidebar}
      </div>

      {/* Floating editor for the link under the cursor. Self-hides when the
          selection isn't inside a link mark or when the editor is read-only. */}
      {editor && !showRaw && (
        <LinkEditorPopover editor={editor} allDocPaths={allDocPaths} tree={tree} currentDocDir={currentDocDir} />
      )}
    </div>
  );
}
