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
import { VaultImage } from "../extensions/vaultImage";
import { getMarkRange } from "@tiptap/core";
import { WikiLink, type WikiLinkHoverPayload } from "../extensions/wikiLink";
import type { TreeNode } from "../../../shared/hooks/useFileExplorer";
import { MarkdownReveal, RawBlock } from "../extensions/markdownReveal";
import { CodeBlockWithCopy } from "../extensions/codeBlockCopy";
import { htmlToMarkdown, markdownToHtml } from "../extensions/markdownSerializer";
import { LinkEditorPopover } from "./LinkEditorPopover";
import { TableFloatingToolbar } from "./TableFloatingToolbar";
import MarkdownToolbar from "./MarkdownToolbar";
import WikiLinkHoverCard from "./WikiLinkHoverCard";
import { createImagePasteExtension } from "../extensions/imagePasteHandler";
import type { AttachmentRepository } from "../../../domain/repositories";

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
  /** Optional content rendered *inside* the editor scroll container, after
   *  the EditorContent. Used by the inline Backlinks rail (DOC-4.18) so
   *  it scrolls with the document instead of being a fixed footer. */
  belowContent?: React.ReactNode;
  /** Lookup function returning the live backlink count for a target path.
   *  Used by the wiki-link hover card (DOC-4.17) so it can show "N
   *  backlinks" without re-running the index. */
  getBacklinkCount?: (resolvedPath: string) => number;
  /** Repository for writing pasted/dropped images to `.attachments/`. When
   *  null the paste handler is a no-op (no vault open). */
  attachmentRepo?: AttachmentRepository | null;
  /** Called when a pasted/dropped image write fails. Parent should surface
   *  the error via `ShellErrorContext`. */
  onImageError?: (err: unknown) => void;
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
  belowContent,
  getBacklinkCount,
  attachmentRepo = null,
  onImageError,
}: MarkdownEditorProps) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [rawContent, setRawContent] = useState(content);
  const [, forceUpdate] = useState(0);
  // Upload chips for in-flight image writes (files > 100 KB).
  const [uploadingChips, setUploadingChips] = useState<Map<string, string>>(new Map());
  const attachmentRepoRef = useRef(attachmentRepo);
  const onImageErrorRef = useRef(onImageError);
  useEffect(() => { attachmentRepoRef.current = attachmentRepo; }, [attachmentRepo]);
  useEffect(() => { onImageErrorRef.current = onImageError; }, [onImageError]);
  // Created once — reads repo/callbacks via stable refs so the editor never
  // needs to be re-initialized when the vault opens or closes.
  const imagePasteExtensionRef = useRef(
    createImagePasteExtension({
      get repo() { return attachmentRepoRef.current; },
      onError: (err) => onImageErrorRef.current?.(err),
      onUploadStart: (id, filename) =>
        setUploadingChips((m) => new Map(m).set(id, filename)),
      onUploadEnd: (id) =>
        setUploadingChips((m) => { const n = new Map(m); n.delete(id); return n; }),
    }),
  );
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

  // ── Wiki-link hover preview (DOC-4.17) ────────────────────────────────
  // Single global card managed here, shown 200ms after a wiki-link's
  // mouseenter and dismissed when the mouse leaves both the link and the
  // card. Broken links never open the card (resolvedPath is null).
  const [hoverCard, setHoverCard] = useState<{ rect: DOMRect; resolvedPath: string } | null>(null);
  // Mirror of `hoverCard` for the Tiptap `onUpdate` closure, which is
  // captured at editor-init time and never re-runs. Reading from state
  // there would race; reading from a ref is current.
  const hoverCardRef = useRef<typeof hoverCard>(null);
  useEffect(() => { hoverCardRef.current = hoverCard; }, [hoverCard]);
  // setTimeout handle for the 200ms delay; cleared on rapid mouseleave / re-enter.
  const hoverTimerRef = useRef<number | null>(null);
  // Tracks whether the cursor is currently over the link OR the card. Either
  // one being true keeps the card alive; both being false (after a 60ms
  // overshoot tolerance) dismisses.
  const onLinkRef = useRef(false);
  const onCardRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);
  const getBacklinkCountRef = useRef(getBacklinkCount);
  useEffect(() => { getBacklinkCountRef.current = getBacklinkCount; }, [getBacklinkCount]);

  const cancelHoverOpen = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  const cancelDismiss = useCallback(() => {
    if (dismissTimerRef.current != null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);
  const scheduleDismiss = useCallback(() => {
    cancelDismiss();
    dismissTimerRef.current = window.setTimeout(() => {
      dismissTimerRef.current = null;
      if (!onLinkRef.current && !onCardRef.current) {
        setHoverCard(null);
      }
    }, 60);
  }, [cancelDismiss]);

  const handleWikiHover = useCallback((payload: WikiLinkHoverPayload) => {
    onLinkRef.current = true;
    cancelDismiss();
    // Broken link → never open. Same path as currently shown → no-op.
    if (!payload.resolvedPath) {
      cancelHoverOpen();
      return;
    }
    cancelHoverOpen();
    const resolvedPath = payload.resolvedPath;
    const rect = payload.rect;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      setHoverCard({ rect, resolvedPath });
    }, 200);
  }, [cancelDismiss, cancelHoverOpen]);

  const handleWikiHoverEnd = useCallback(() => {
    onLinkRef.current = false;
    cancelHoverOpen();
    scheduleDismiss();
  }, [cancelHoverOpen, scheduleDismiss]);

  const handleCardEnter = useCallback(() => {
    onCardRef.current = true;
    cancelDismiss();
  }, [cancelDismiss]);
  const handleCardLeave = useCallback(() => {
    onCardRef.current = false;
    scheduleDismiss();
  }, [scheduleDismiss]);

  // Stable refs for the hover callbacks — extension options are mutated
  // imperatively elsewhere (existingDocPaths etc.) and we follow the same
  // shape here so the closure read by the nodeView is always current.
  const handleWikiHoverRef = useRef(handleWikiHover);
  const handleWikiHoverEndRef = useRef(handleWikiHoverEnd);
  useEffect(() => { handleWikiHoverRef.current = handleWikiHover; }, [handleWikiHover]);
  useEffect(() => { handleWikiHoverEndRef.current = handleWikiHoverEnd; }, [handleWikiHoverEnd]);

  // Cleanup pending timers on unmount.
  useEffect(() => () => {
    cancelHoverOpen();
    cancelDismiss();
  }, [cancelHoverOpen, cancelDismiss]);

  // Dismiss the hover card whenever the document content changes externally
  // (file switch, undo/redo, conflict reload). The DOMRect captured at
  // hover time becomes stale once the doc swaps; clearing it here keeps
  // the card from pointing at a now-removed link.
  useEffect(() => {
    onLinkRef.current = false;
    onCardRef.current = false;
    cancelHoverOpen();
    cancelDismiss();
    setHoverCard(null);
  }, [content, cancelHoverOpen, cancelDismiss]);

  // Close the hover card on scroll — re-anchoring is more complex than this
  // PR needs, and the card going stale on scroll is the user-expected
  // dismissal pattern for transient hovers.
  useEffect(() => {
    if (!hoverCard) return;
    const close = () => {
      onLinkRef.current = false;
      onCardRef.current = false;
      cancelHoverOpen();
      cancelDismiss();
      setHoverCard(null);
    };
    const container = editorContainerRef.current;
    container?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("scroll", close, { passive: true, capture: true });
    return () => {
      container?.removeEventListener("scroll", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [hoverCard, cancelHoverOpen, cancelDismiss, editorContainerRef]);

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
      VaultImage.configure({
        repoRef: attachmentRepoRef,
        onError: (err) => onImageErrorRef.current?.(err),
      }),
      WikiLink.configure({
        onNavigate: onNavigateLink,
        onCreateDocument,
        existingDocPaths,
        allDocPaths,
        tree,
        currentDocDir,
        onHover: (p) => handleWikiHoverRef.current(p),
        onHoverEnd: () => handleWikiHoverEndRef.current(),
      }),
      RawBlock,
      MarkdownReveal,
      imagePasteExtensionRef.current,
    ],
    content: markdownToHtml(content),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (rawSwapRef.current) {
        rawSwapRef.current = false;
        return;
      }
      // Dismiss the hover card on any in-document edit. The captured
      // DOMRect goes stale the moment the user types — the linked node may
      // shift, split, or be deleted entirely — so we close eagerly here.
      // The `content`-prop effect below only catches *external* swaps
      // (file switch, undo/redo, conflict reload); local typing doesn't
      // round-trip through `content` synchronously.
      if (hoverCardRef.current) {
        onLinkRef.current = false;
        onCardRef.current = false;
        cancelHoverOpen();
        cancelDismiss();
        setHoverCard(null);
      }
      // Recompute reading meta on every doc transaction. ProseMirror has
      // already committed to the DOM by the time onUpdate fires, so the
      // rendered headings/word count are accurate without a microtask hop.
      // Gated to read mode — the TOC and reading-time pill only render in
      // read mode, and walking every heading + stamping IDs on each
      // keystroke is pure waste while the user is typing.
      if (readOnly && onReadingMetaChangeRef.current) {
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
  // Gated to read mode for the same reason as the onUpdate path: only the
  // read-mode chrome consumes meta, so skip the DOM walk in edit mode.
  useEffect(() => {
    if (!editor || !readOnly || !onReadingMetaChangeRef.current) return;
    queueMicrotask(() => {
      if (editor.isDestroyed) return;
      const dom = editor.view.dom as HTMLElement;
      onReadingMetaChangeRef.current?.(extractReadingMeta(dom));
    });
  }, [editor, content, readOnly]);

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
              {/* Single scroll context: the outer `editorContainerRef` div
                  owns the scrollbar (used by ReadingProgress + the TOC
                  scrollspy + the inline Backlinks rail). The inner
                  `markdown-editor` div is `h-full` so empty space below
                  short content still hits ProseMirror; the rail is
                  appended after EditorContent so it scrolls with the
                  document. */}
              <div
                className={`markdown-editor h-full${readOnly ? " editorial" : ""}`}
              >
                <EditorContent editor={editor} className="h-full" />
                {belowContent}
              </div>
              {uploadingChips.size > 0 && (
                <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10 pointer-events-none">
                  {Array.from(uploadingChips.values()).map((name) => (
                    <div
                      key={name}
                      className="text-[11px] font-mono px-2 py-1 rounded bg-surface/90 border border-line text-mute shadow"
                    >
                      Uploading {name}…
                    </div>
                  ))}
                </div>
              )}
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

      {/* Wiki-link hover preview card (DOC-4.17). Single global instance,
          shown 200ms after a link's mouseenter and dismissed when the
          mouse leaves both the link and the card. */}
      {hoverCard && (
        <WikiLinkHoverCard
          anchor={hoverCard.rect}
          resolvedPath={hoverCard.resolvedPath}
          backlinkCount={getBacklinkCountRef.current?.(hoverCard.resolvedPath) ?? 0}
          onMouseEnter={handleCardEnter}
          onMouseLeave={handleCardLeave}
        />
      )}
    </div>
  );
}
