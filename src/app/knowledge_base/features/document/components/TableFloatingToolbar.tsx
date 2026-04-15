// src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Rows2,
  Columns2,
  Columns3,
  Heading,
  Trash2,
} from "lucide-react";

interface Props {
  editor: Editor | null;
  /** Scrollable ancestor of the editor (`.markdown-editor`'s wrapper). The
   *  toolbar is absolutely positioned relative to this element and rides
   *  its scroll. `useRef<HTMLDivElement>(null)` in the consumer produces
   *  the matching type. */
  containerRef: React.RefObject<HTMLDivElement>;
}

const SIZE = 14;
const GAP_ABOVE_TABLE = 4;
const TOOLBAR_HEIGHT = 32;

/** Walk the current selection up to the nearest tableCell/tableHeader and
 *  return its DOM element. Used to find the <table> that wraps the cursor. */
function findActiveCellDom(editor: Editor): HTMLElement | null {
  const { $head } = editor.state.selection;
  for (let d = $head.depth; d > 0; d--) {
    const name = $head.node(d).type.name;
    if (name === "tableCell" || name === "tableHeader") {
      const pos = $head.before(d);
      const dom = editor.view.nodeDOM(pos);
      return dom instanceof HTMLElement ? dom : null;
    }
  }
  return null;
}

/** Small inline button (icon + title). Mirrors the TBtn in MarkdownEditor.tsx;
 *  re-declared here so the toolbar file stays self-contained. */
function TBtn({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? "opacity-30 cursor-not-allowed text-slate-400"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
      }`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5" />;
}

export function TableFloatingToolbar({ editor, containerRef }: Props) {
  const [cursorTable, setCursorTable] = useState<HTMLTableElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // ── Cursor tracking: on every transaction, find the containing <table>. ──
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (editor.isDestroyed) return;
      const cell = findActiveCellDom(editor);
      const table = cell ? (cell.closest("table") as HTMLTableElement | null) : null;
      setCursorTable(table);
    };
    update();
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
    };
  }, [editor]);

  const anchor = cursorTable;

  // ── Position: recompute on anchor change, scroll, resize, size change. ──
  useEffect(() => {
    const container = containerRef.current;
    if (!anchor || !container) {
      setPos(null);
      return;
    }
    const updatePos = () => {
      if (!anchor.isConnected) {
        setPos(null);
        return;
      }
      const t = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      setPos({
        top:
          t.top - c.top + container.scrollTop - TOOLBAR_HEIGHT - GAP_ABOVE_TABLE,
        left: t.left - c.left + container.scrollLeft,
      });
    };
    updatePos();
    const ro = new ResizeObserver(updatePos);
    ro.observe(anchor);
    ro.observe(container);
    container.addEventListener("scroll", updatePos);
    window.addEventListener("resize", updatePos);
    return () => {
      ro.disconnect();
      container.removeEventListener("scroll", updatePos);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchor, containerRef]);

  if (!editor || !anchor || !pos || !editor.isEditable) return null;

  // Dispatch via chain().focus() so the cursor lands back inside the
  // now-modified table after each op (esp. important if the user used the
  // keyboard to trigger the button without clicking into a cell first).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (cmd: string) => {
    (editor.chain().focus() as any)[cmd]().run();
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canRun = (cmd: string) => {
    return (editor.can() as any)[cmd]();
  };

  return (
    <div
      className="kb-table-toolbar"
      style={{ position: "absolute", top: pos.top, left: pos.left }}
      // Prevent clicks from stealing selection away from the editor.
      onMouseDown={(e) => e.preventDefault()}
    >
      <TBtn
        onClick={() => run("addRowBefore")}
        disabled={!canRun("addRowBefore")}
        title="Add row above"
      >
        <ArrowUp size={SIZE} />
      </TBtn>
      <TBtn
        onClick={() => run("addRowAfter")}
        disabled={!canRun("addRowAfter")}
        title="Add row below"
      >
        <ArrowDown size={SIZE} />
      </TBtn>
      <TBtn
        onClick={() => run("deleteRow")}
        disabled={!canRun("deleteRow")}
        title="Delete row"
      >
        <Rows2 size={SIZE} />
      </TBtn>
      <Sep />
      <TBtn
        onClick={() => run("addColumnBefore")}
        disabled={!canRun("addColumnBefore")}
        title="Add column left"
      >
        <ArrowLeft size={SIZE} />
      </TBtn>
      <TBtn
        onClick={() => run("addColumnAfter")}
        disabled={!canRun("addColumnAfter")}
        title="Add column right"
      >
        <ArrowRight size={SIZE} />
      </TBtn>
      <TBtn
        onClick={() => run("deleteColumn")}
        disabled={!canRun("deleteColumn")}
        title="Delete column"
      >
        <Columns2 size={SIZE} />
      </TBtn>
      <Sep />
      <TBtn
        onClick={() => run("toggleHeaderRow")}
        disabled={!canRun("toggleHeaderRow")}
        title="Toggle header row"
      >
        <Heading size={SIZE} />
      </TBtn>
      <TBtn
        onClick={() => run("toggleHeaderColumn")}
        disabled={!canRun("toggleHeaderColumn")}
        title="Toggle header column"
      >
        <Columns3 size={SIZE} />
      </TBtn>
      <Sep />
      <TBtn
        onClick={() => run("deleteTable")}
        disabled={!canRun("deleteTable")}
        title="Delete table"
      >
        <Trash2 size={SIZE} />
      </TBtn>
    </div>
  );
}
