"use client";

import React, {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { getMarkRange } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Link2Off } from "lucide-react";

interface LinkEditorPopoverProps {
  editor: Editor;
  /** Known wiki-link targets (documents + diagrams) for path autocomplete. */
  allDocPaths?: string[];
}

type Target =
  | {
      kind: "link";
      from: number;
      to: number;
      href: string;
      text: string;
    }
  | {
      kind: "wiki";
      from: number;
      to: number;
      path: string;
      section: string | null;
      display: string;
    };

/**
 * Floating editor for the link under the cursor.
 *
 * Surfaces two shapes:
 *   - a `link` mark under the caret (regular markdown links) — edit URL + text
 *   - a `wikiLink` node selection (atomic `[[path#section]]`) — edit path + text
 *
 * Changes commit on Enter or blur; Escape reverts the draft. The popover
 * anchors below the target range and flips above when it would clip; it
 * clamps horizontally to stay on-screen. The wiki-link path input offers
 * autocomplete backed by `allDocPaths` via a native `<datalist>`.
 *
 * Parent (`MarkdownEditor`) already force-re-renders on every selection/
 * transaction update, so we can read `editor.state` directly each render.
 */
export function LinkEditorPopover({
  editor,
  allDocPaths,
}: LinkEditorPopoverProps) {
  const linkMarkType = editor.schema.marks.link;
  const wikiLinkType = editor.schema.nodes.wikiLink;
  const datalistId = useId();

  const target = useMemo<Target | null>(() => {
    if (!editor.isEditable) return null;

    if (linkMarkType && editor.isActive("link")) {
      const $from = editor.state.selection.$from;
      const r = getMarkRange($from, linkMarkType);
      if (r) {
        const href = String(editor.getAttributes("link").href ?? "");
        const text = editor.state.doc.textBetween(r.from, r.to, "");
        return { kind: "link", from: r.from, to: r.to, href, text };
      }
    }

    const sel = editor.state.selection;
    if (
      wikiLinkType &&
      sel instanceof NodeSelection &&
      sel.node.type === wikiLinkType
    ) {
      const attrs = sel.node.attrs;
      const path = String(attrs.path ?? "");
      const section = (attrs.section as string | null) ?? null;
      const display =
        String(attrs.display ?? "") ||
        (section ? `${path}#${section}` : path);
      return {
        kind: "wiki",
        from: sel.from,
        to: sel.to,
        path,
        section,
        display,
      };
    }

    return null;
    // editor.state.selection + editor.state.doc both change on every tr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.state.selection, editor.state.doc, editor.isEditable]);

  // Drafts. For both kinds: draftUrl holds the "target" (href or path#section),
  // draftText holds the displayed text.
  const [draftUrl, setDraftUrl] = useState("");
  const [draftText, setDraftText] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Resync drafts when the target identity changes, or when underlying values
  // change externally while the matching input isn't focused.
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!target) {
      lastKeyRef.current = null;
      return;
    }
    const key = `${target.kind}:${target.from}`;
    const changedTarget = lastKeyRef.current !== key;
    const liveUrl =
      target.kind === "link"
        ? target.href
        : target.section
          ? `${target.path}#${target.section}`
          : target.path;
    const liveText = target.kind === "link" ? target.text : target.display;
    if (changedTarget) {
      setDraftUrl(liveUrl);
      setDraftText(liveText);
    } else {
      if (document.activeElement !== urlRef.current) setDraftUrl(liveUrl);
      if (document.activeElement !== textRef.current) setDraftText(liveText);
    }
    if (changedTarget && target.kind === "link" && !target.href) {
      requestAnimationFrame(() => urlRef.current?.focus());
    }
    lastKeyRef.current = key;
  }, [target]);

  // Smart positioning: below by default, above if no room; clamp horizontally.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!target) {
      setPos(null);
      return;
    }
    const view = editor.view;
    let startCoords;
    try {
      startCoords = view.coordsAtPos(target.from);
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
    if (top + height > vh - margin) top = startCoords.top - height - gap;
    if (top < margin) top = margin;

    let left = startCoords.left;
    if (left + width > vw - margin) left = vw - width - margin;
    if (left < margin) left = margin;

    setPos({ top, left });
  }, [target, editor]);

  if (!target) return null;

  // ── Commits ─────────────────────────────────────────────────────────────
  const commitLinkUrl = (raw: string) => {
    if (target.kind !== "link") return;
    const trimmed = raw.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!trimmed) chain.unsetLink().run();
    else if (trimmed !== target.href) chain.setLink({ href: trimmed }).run();
  };

  const commitLinkText = (next: string) => {
    if (target.kind !== "link") return;
    if (next === target.text) return;
    if (!next) {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: target.from, to: target.to })
        .unsetMark("link")
        .deleteSelection()
        .run();
      return;
    }
    // insertContentAt is the explicit "replace this range with this content"
    // form; the prior setTextSelection → insertContent chain would sometimes
    // leave stray text because `insertContent` doesn't reliably replace a
    // non-cursor selection created in the same chain.
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: target.from, to: target.to },
        {
          type: "text",
          text: next,
          marks: [{ type: "link", attrs: { href: target.href } }],
        },
      )
      .run();
  };

  // Mutate the wiki-link's attrs in place via setNodeMarkup — no selection
  // changes, so the caret / focus ring doesn't jump around on every commit.
  const patchWikiAttrs = (patch: Record<string, unknown>) => {
    if (target.kind !== "wiki") return;
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(target.from);
        if (!node || node.type.name !== "wikiLink") return false;
        tr.setNodeMarkup(target.from, null, { ...node.attrs, ...patch });
        return true;
      })
      .run();
  };

  const commitWikiPath = (raw: string) => {
    if (target.kind !== "wiki") return;
    const trimmed = raw.trim();
    if (!trimmed) {
      editor
        .chain()
        .focus()
        .setNodeSelection(target.from)
        .deleteSelection()
        .run();
      return;
    }
    const hashIdx = trimmed.indexOf("#");
    const path = hashIdx === -1 ? trimmed : trimmed.slice(0, hashIdx);
    const section = hashIdx === -1 ? null : trimmed.slice(hashIdx + 1) || null;
    if (path === target.path && section === target.section) return;
    // Preserve display text when it was custom (not the default derived from
    // the old path); otherwise refresh it to match the new path.
    const oldDefault = target.section
      ? `${target.path}#${target.section}`
      : target.path;
    const keepDisplay =
      target.display && target.display !== oldDefault
        ? target.display
        : section
          ? `${path}#${section}`
          : path;
    patchWikiAttrs({ path, section, display: keepDisplay });
  };

  const commitWikiDisplay = (raw: string) => {
    if (target.kind !== "wiki") return;
    const fallback = target.section
      ? `${target.path}#${target.section}`
      : target.path;
    const normalized = raw.trim() || fallback;
    if (normalized === target.display) return;
    patchWikiAttrs({ display: normalized });
  };

  const onUnlink = () => {
    if (target.kind === "link") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        .chain()
        .focus()
        .setNodeSelection(target.from)
        .deleteSelection()
        .run();
    }
  };

  // ── Key handlers ────────────────────────────────────────────────────────
  const onUrlKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (target.kind === "link") commitLinkUrl(draftUrl);
      else commitWikiPath(draftUrl);
      editor.commands.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      const liveUrl =
        target.kind === "link"
          ? target.href
          : target.section
            ? `${target.path}#${target.section}`
            : target.path;
      setDraftUrl(liveUrl);
      editor.commands.focus();
    }
  };
  const onTextKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (target.kind === "link") commitLinkText(draftText);
      else commitWikiDisplay(draftText);
      editor.commands.focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDraftText(target.kind === "link" ? target.text : target.display);
      editor.commands.focus();
    }
  };

  const isWiki = target.kind === "wiki";
  const urlLabel = isWiki ? "Path" : "URL";
  const urlPlaceholder = isWiki ? "path/to/note#section" : "https://...";
  const unlinkLabel = isWiki ? "Remove" : "Unlink";

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
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-500 w-10 shrink-0">{urlLabel}</label>
        <input
          ref={urlRef}
          type={isWiki ? "text" : "url"}
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          onBlur={(e) => {
            if (popRef.current?.contains(e.relatedTarget as Node)) return;
            if (target.kind === "link") commitLinkUrl(draftUrl);
            else commitWikiPath(draftUrl);
          }}
          onKeyDown={onUrlKey}
          placeholder={urlPlaceholder}
          list={isWiki && allDocPaths && allDocPaths.length > 0 ? datalistId : undefined}
          className="flex-1 min-w-0 w-64 px-2 py-1 border border-slate-300 rounded text-xs outline-none focus:border-blue-400"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <label className="text-xs text-slate-500 w-10 shrink-0">Text</label>
        <input
          ref={textRef}
          type="text"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={(e) => {
            if (popRef.current?.contains(e.relatedTarget as Node)) return;
            if (target.kind === "link") commitLinkText(draftText);
            else commitWikiDisplay(draftText);
          }}
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
          title={isWiki ? "Remove wiki-link" : "Remove link"}
        >
          <Link2Off size={12} />
          {unlinkLabel}
        </button>
      </div>
      {isWiki && allDocPaths && allDocPaths.length > 0 && (
        <datalist id={datalistId}>
          {allDocPaths.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      )}
    </div>,
    document.body,
  );
}
