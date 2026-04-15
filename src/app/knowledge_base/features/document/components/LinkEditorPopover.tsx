"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { getMarkRange } from "@tiptap/core";
import { Link2Off } from "lucide-react";

interface LinkEditorPopoverProps {
  editor: Editor;
}

/**
 * Floating editor for the link under the cursor.
 *
 * Visible when the editor is editable AND the current selection is inside a
 * link mark. Shows URL + Text inputs and an Unlink button. Changes commit on
 * Enter or blur; Escape reverts the draft. The popover anchors below the link
 * range (falling back to above when it would clip the viewport) and is clamped
 * horizontally so it never goes off-screen.
 *
 * Parent (`MarkdownEditor`) already force-re-renders on every selection/
 * transaction update, so we can read `editor.state` directly and recompute.
 */
export function LinkEditorPopover({ editor }: LinkEditorPopoverProps) {
  const linkMarkType = editor.schema.marks.link;
  const show = editor.isEditable && editor.isActive("link") && !!linkMarkType;

  // Derive live link info from the current selection. Recomputed every render
  // (parent force-updates on selection/transaction), so the draft resync logic
  // below sees fresh values.
  const liveLink = useMemo(() => {
    if (!show) return null;
    const $from = editor.state.selection.$from;
    const r = getMarkRange($from, linkMarkType!);
    if (!r) return null;
    const href = String(editor.getAttributes("link").href ?? "");
    const text = editor.state.doc.textBetween(r.from, r.to, "");
    return { from: r.from, to: r.to, href, text };
    // editor.state.selection + editor.state.doc both change on every tr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, editor.state.selection, editor.state.doc]);

  const [draftUrl, setDraftUrl] = useState("");
  const [draftText, setDraftText] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Reset drafts whenever we move to a different link (identified by its start
  // position), or when the live href/text changes underneath us and that input
  // isn't currently focused (so we don't stomp on the user's typing).
  const lastFromRef = useRef<number | null>(null);
  useEffect(() => {
    if (!liveLink) {
      lastFromRef.current = null;
      return;
    }
    const movedToNewLink = lastFromRef.current !== liveLink.from;
    if (movedToNewLink) {
      setDraftUrl(liveLink.href);
      setDraftText(liveLink.text);
      lastFromRef.current = liveLink.from;
      return;
    }
    // Same link — sync from live only if the input isn't being edited.
    if (document.activeElement !== urlRef.current) {
      setDraftUrl(liveLink.href);
    }
    if (document.activeElement !== textRef.current) {
      setDraftText(liveLink.text);
    }
  }, [liveLink]);

  // Smart positioning: below by default, above if no room; clamp horizontally.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!liveLink) {
      setPos(null);
      return;
    }
    const view = editor.view;
    let startCoords;
    try {
      startCoords = view.coordsAtPos(liveLink.from);
    } catch {
      return;
    }
    const el = popRef.current;
    const width = el?.offsetWidth ?? 320;
    const height = el?.offsetHeight ?? 120;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const margin = 8;
    const gap = 6;

    let top = startCoords.bottom + gap;
    if (top + height > vh - margin) {
      top = startCoords.top - height - gap;
    }
    if (top < margin) top = margin;

    let left = startCoords.left;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;

    setPos({ top, left });
  }, [liveLink, editor]);

  if (!show || !liveLink) return null;

  const commitUrl = (raw: string) => {
    const trimmed = raw.trim();
    // Capture the current link range before the transaction; setLink + extend
    // keep us anchored on the same mark.
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!trimmed) {
      chain.unsetLink().run();
    } else if (trimmed !== liveLink.href) {
      chain.setLink({ href: trimmed }).run();
    }
  };

  const commitText = (raw: string) => {
    const next = raw;
    if (next === liveLink.text) return;
    if (!next) {
      // Empty text — unlink and remove the range so we don't leave a zero-
      // width link behind. User can re-type from the cursor position.
      editor
        .chain()
        .focus()
        .setTextSelection({ from: liveLink.from, to: liveLink.to })
        .unsetMark("link")
        .deleteSelection()
        .run();
      return;
    }
    editor
      .chain()
      .focus()
      .setTextSelection({ from: liveLink.from, to: liveLink.to })
      .insertContent({
        type: "text",
        text: next,
        marks: [{ type: "link", attrs: { href: liveLink.href } }],
      })
      .run();
  };

  const onUrlKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitUrl(draftUrl);
      editor.commands.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraftUrl(liveLink.href);
      editor.commands.focus();
    }
  };
  const onTextKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitText(draftText);
      editor.commands.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraftText(liveLink.text);
      editor.commands.focus();
    }
  };

  const onUnlink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  return createPortal(
    <div
      ref={popRef}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      className="bg-white rounded-lg shadow-lg border border-slate-200 p-2 z-50 text-sm"
      // Keep the ProseMirror view from treating this as an outside click and
      // clobbering the selection behind the popover.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 w-10 shrink-0">URL</label>
        <input
          ref={urlRef}
          type="url"
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onBlur={() => commitUrl(draftUrl)}
          onKeyDown={onUrlKey}
          placeholder="https://..."
          className="flex-1 min-w-0 w-64 px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:border-blue-400"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <label className="text-xs text-slate-500 w-10 shrink-0">Text</label>
        <input
          ref={textRef}
          type="text"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={() => commitText(draftText)}
          onKeyDown={onTextKey}
          className="flex-1 min-w-0 w-64 px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:border-blue-400"
        />
      </div>
      <div className="flex justify-end mt-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onUnlink}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-2 py-0.5 rounded hover:bg-slate-50"
          title="Remove link"
        >
          <Link2Off size={12} />
          Unlink
        </button>
      </div>
    </div>,
    document.body,
  );
}
