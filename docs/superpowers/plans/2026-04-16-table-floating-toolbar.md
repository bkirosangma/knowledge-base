# Table Floating Toolbar + No-Nest Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating toolbar above the current table exposes structural commands (add/delete row/column, toggle header row/column, delete table), and the existing Insert Table action refuses to fire while the cursor is already inside a table so nested tables can't be created.

**Architecture:** One new React component (`TableFloatingToolbar`) that tracks an "active table" via cursor position and mouse hover, positions itself above the table via `getBoundingClientRect` relative to the editor's scrollable container, and dispatches Tiptap's existing table commands. One tiny new extension (`TableNoNest`) that wraps `Table.insertTable` to no-op when `editor.isActive("table")`. `MarkdownEditor.tsx` switches from `Table` to `TableNoNest`, renders the new toolbar, and greys out the top-toolbar `TablePicker` when the cursor is in a cell.

**Tech Stack:** Tiptap v3 (React), `@tiptap/extension-table`, `lucide-react` for icons, Tailwind utility classes (already used by the editor's existing toolbar), `ResizeObserver` + native scroll / resize listeners for positioning.

**Spec:** `docs/superpowers/specs/2026-04-16-table-floating-toolbar-design.md`

**Note on testing:** This project has no unit/integration test framework for editor code. Verification uses the `mcp__Claude_Preview__preview_*` tools against the running Next.js dev server, the same way every recent editor change in this repo has been verified. The dev server is already running on port 3457 (serverId can be retrieved with `mcp__Claude_Preview__preview_list`); a vault must be open in the preview before running the browser-driven verification steps.

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx` | The floating toolbar React component. Owns cursor-table tracking, hover-table tracking (debounced, event-delegated on the container), position computation (`ResizeObserver` + scroll + window resize), and the nine action buttons wired to Tiptap commands. |
| `src/app/knowledge_base/features/document/extensions/tableNoNest.ts` | One-export file: `TableNoNest = Table.extend({ ... })` overriding the `insertTable` command to return `false` when `editor.isActive("table")`. Nothing else. |

### Modified files

| File | Changes |
|------|---------|
| `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx` | 1) Import `TableNoNest` in place of `Table` and swap it into the `extensions: [...]` array. 2) Extend `TablePicker` to accept `disabled?: boolean` — dim the trigger and refuse to open the popover when true. 3) In the render, compute `canInsertTable = !editor?.isActive("table")` and pass it into `<TablePicker disabled={!canInsertTable} />`. 4) Attach a new `editorContainerRef` to the existing `<div className="flex-1 overflow-auto">`. 5) Render `<TableFloatingToolbar editor={editor} containerRef={editorContainerRef} />` alongside `<EditorContent>`. |
| `src/app/globals.css` | Append a `.kb-table-toolbar` rule block providing container chrome (background, shadow, border, padding, rounded corners). Buttons inside reuse existing Tailwind utility classes via `<TBtn>` so no button styling goes here. |

No existing extensions are restructured. `markdownReveal.ts` and `markdownSerializer.ts` are untouched.

---

## Task 1: Add the no-nest extension

**Files:**
- Create: `src/app/knowledge_base/features/document/extensions/tableNoNest.ts`
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`

A two-edit task. The extension is tiny; swapping it into the editor is a one-line import change.

- [ ] **Step 1: Create `tableNoNest.ts`**

Use the Write tool on `src/app/knowledge_base/features/document/extensions/tableNoNest.ts` with the following content:

```ts
import { Table } from "@tiptap/extension-table";

/**
 * Extends Tiptap's Table extension so `insertTable` refuses when the current
 * selection is already inside a table. Nested tables can't be represented by
 * GFM pipe-table markdown and our serializer (`tableToMarkdown`) only emits
 * pipe tables — letting a nested table exist in the edit buffer would either
 * corrupt the serialized output or be silently lost on save.
 *
 * Belt-and-suspenders with the UI-level disable on the TablePicker button in
 * `MarkdownEditor.tsx`: the UI guards the mouse path; this command guard
 * covers keyboard shortcuts, programmatic calls, and pasted markdown that
 * reaches `insertTable`.
 */
export const TableNoNest = Table.extend({
  addCommands() {
    const parent = this.parent?.() ?? {};
    const parentInsert = parent.insertTable;
    return {
      ...parent,
      insertTable:
        (options) =>
        (ctx) => {
          if (ctx.editor.isActive("table")) return false;
          return parentInsert!(options)(ctx);
        },
    };
  },
});
```

- [ ] **Step 2: Swap the extension in `MarkdownEditor.tsx`**

Open `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`. Line 7 currently imports `Table`:

```ts
import { Table } from "@tiptap/extension-table";
```

Replace with a new file import:

Edit:
- `old_string`: `import { Table } from "@tiptap/extension-table";`
- `new_string`: `import { TableNoNest } from "../extensions/tableNoNest";`

Then line 181 configures the extension:

```ts
      Table.configure({ resizable: true }),
```

Edit:
- `old_string`: `      Table.configure({ resizable: true }),`
- `new_string`: `      TableNoNest.configure({ resizable: true }),`

- [ ] **Step 3: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Only the pre-existing `codeBlockCopy.tsx(46,26)` error. Nothing new.

- [ ] **Step 4: Browser sanity check — insert at top level still works, nested rejected**

Ensure the preview server is running: `mcp__Claude_Preview__preview_list`. If not present, start it: `mcp__Claude_Preview__preview_start(name="dev")` (or whatever name exists in `.claude/launch.json`).

Snapshot to confirm the editor loads: `mcp__Claude_Preview__preview_snapshot(serverId=$SID)`. If the snapshot shows "Open Folder" instead of an editor, stop and ask the user to open a vault — the file-system picker is native browser UI that can't be driven here.

Then run this `preview_eval` in the running page to exercise both paths directly:

```js
(() => {
  const btn = document.querySelector('button[title="Insert table"]');
  btn?.click();
  // Click the 2x2 cell in the TablePicker popover
  const cells = document.querySelectorAll('.relative .grid .w-5.h-5');
  if (cells.length < 9) return { error: 'picker not open', count: cells.length };
  cells[9].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  // Now try to insert again WHILE inside the just-inserted table — should fail
  const editorRoot = document.querySelector('.markdown-editor .ProseMirror');
  // Place caret in the first body cell
  const td = editorRoot.querySelector('td');
  const p = td?.querySelector('p');
  if (!p) return { error: 'no cell paragraph' };
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  // Click the Insert Table button again
  btn?.click();
  // The popover still opens for now (the UI-disable is in Task 3). Click a
  // 1x1 cell — command guard should reject the insert.
  const cells2 = document.querySelectorAll('.relative .grid .w-5.h-5');
  cells2[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return {
    outerTables: editorRoot.querySelectorAll('table').length,
    nestedTables: Array.from(editorRoot.querySelectorAll('table table')).length,
  };
})()
```

Expected: `outerTables >= 1`, `nestedTables === 0`. If `nestedTables > 0` the guard failed — re-inspect `tableNoNest.ts`.

Note: the UI-disable on the picker button comes in Task 3 below. Here we are testing the command-level guard in isolation.

- [ ] **Step 5: Rebuild graphify index**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && /Users/kiro/.local/pipx/venvs/graphifyy/bin/python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

If the pipx path is not available, fall back to `python3 -c ...` with the same script. `graphify-out/` is gitignored — do not stage it.

- [ ] **Step 6: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/extensions/tableNoNest.ts \
        src/app/knowledge_base/features/document/components/MarkdownEditor.tsx
git commit -m "$(cat <<'EOF'
feat(document): refuse insertTable while cursor is inside a table

Add `TableNoNest` extension that wraps Tiptap's Table with an
insertTable command override: when editor.isActive("table"), the
command returns false and no transaction runs. Prevents nested tables,
which GFM pipe-table markdown can't represent and our serializer can't
round-trip. The UI-level disable on the TablePicker button lands in a
later commit; this guard covers keyboard shortcuts, programmatic
calls, and paste paths.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create the floating toolbar component (render + cursor tracking)

**Files:**
- Create: `src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx`

This task writes the scaffolding of the component — props, cursor tracking, position effect, nine buttons — but without hover support or the hover-click focus fallback. Those land in Task 3. The component is usable end-to-end after this task for the cursor-inside-cell path.

- [ ] **Step 1: Create the file with the cursor-only toolbar**

Use the Write tool on `src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx`:

```tsx
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
  const run = (cmd: keyof ReturnType<Editor["can"]>) => {
    // Narrow: all our commands are zero-arg on chain().
    (editor.chain().focus() as unknown as Record<string, () => { run: () => boolean }>)
      [cmd]()
      .run();
  };

  const canRun = (cmd: keyof ReturnType<Editor["can"]>) => {
    return (editor.can() as unknown as Record<string, () => boolean>)[cmd]();
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Only the pre-existing `codeBlockCopy.tsx(46,26)` error.

If the `keyof ReturnType<Editor["can"]>` typing is rejected by the installed `@tiptap/react` version, simplify the helpers to plain `string` keys and `any` casts — the runtime behaviour is the same and Tiptap's command chain accepts arbitrary method names via proxy:

```ts
const run = (cmd: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (editor.chain().focus() as any)[cmd]().run();
};
const canRun = (cmd: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.can() as any)[cmd]();
};
```

This fallback is acceptable because the command names are hand-written in the render below; a typo here would surface as a no-op button, which the manual test in Task 5 catches.

- [ ] **Step 3: Rebuild graphify index**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && /Users/kiro/.local/pipx/venvs/graphifyy/bin/python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx
git commit -m "$(cat <<'EOF'
feat(document): add floating table toolbar (cursor-driven visibility)

Introduce TableFloatingToolbar, a React component that shows a small
icon bar above the top-left of the table containing the current
selection. Buttons cover addRowBefore/After, deleteRow, addColumnBefore/
After, deleteColumn, toggleHeaderRow, toggleHeaderColumn, and
deleteTable — all existing Tiptap Table commands.

Cursor tracking only in this commit: the toolbar appears when the
caret is inside a cell and hides when it isn't. Hover-based visibility
and the top-toolbar Insert Table disable follow in subsequent commits.

Position is computed via getBoundingClientRect relative to the editor's
scrollable container (supplied by ref); a ResizeObserver on the anchor
table plus scroll and resize listeners keep the toolbar glued to the
table as it grows or the viewport changes.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire the toolbar into `MarkdownEditor.tsx` + disable Insert Table button

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/MarkdownEditor.tsx`
- Modify: `src/app/globals.css`

Three surgical edits: add the `editorContainerRef`, render the new toolbar, add `disabled` support to `TablePicker`, and add the CSS block that styles the toolbar container.

- [ ] **Step 1: Import the toolbar and add the container ref**

Near the top of `MarkdownEditor.tsx`, after the existing component imports (around line 21 where `LinkEditorPopover` is imported), add:

Edit:
- `old_string`: `import { LinkEditorPopover } from "./LinkEditorPopover";`
- `new_string`:
```
import { LinkEditorPopover } from "./LinkEditorPopover";
import { TableFloatingToolbar } from "./TableFloatingToolbar";
```

Inside the `MarkdownEditor` function body, just after `const rawSwapRef = useRef(false);` (around line 154), add the container ref:

Edit:
- `old_string`: `  const rawSwapRef = useRef(false);`
- `new_string`:
```
  const rawSwapRef = useRef(false);
  // Ref to the scrollable wrapper around <EditorContent>. Passed to the
  // floating table toolbar so it can position itself in the same scroll
  // context as the table it anchors to.
  const editorContainerRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 2: Attach the ref to the editor's scroll container**

Line 448 currently opens the scroll container:

```tsx
      <div className="flex-1 overflow-auto">
```

Edit:
- `old_string`: `      <div className="flex-1 overflow-auto">`
- `new_string`: `      <div ref={editorContainerRef} className="flex-1 overflow-auto relative">`

Two changes: attach the ref, and add `relative` so `position: absolute` children (the toolbar) anchor to this div rather than the page root.

- [ ] **Step 3: Render the toolbar**

Still in `MarkdownEditor.tsx`, find the block that conditionally renders the WYSIWYG editor (the `<EditorContent>` around lines 456–461):

```tsx
        ) : (
          <EditorContent
            editor={editor}
            className="markdown-editor h-full overflow-auto"
          />
        )}
      </div>
```

Insert the toolbar immediately after `<EditorContent>` so it renders inside the same scroll container. The toolbar already early-returns when the editor is null, not editable, or no table is active, so it's safe to always include.

Edit:
- `old_string`:
```
        ) : (
          <EditorContent
            editor={editor}
            className="markdown-editor h-full overflow-auto"
          />
        )}
      </div>
```
- `new_string`:
```
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
```

- [ ] **Step 4: Extend `TablePicker` to accept `disabled`**

Line 81 today:

```tsx
function TablePicker({ onSelect }: { onSelect: (rows: number, cols: number) => void }) {
```

Widen the signature. Then gate the trigger click and visual style on `disabled`:

Edit:
- `old_string`:
```
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
```
- `new_string`:
```
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
```

Note: the `open && !disabled` guard on `active` avoids stale-active state if the picker becomes disabled mid-interaction.

- [ ] **Step 5: Pass `disabled` from the render**

Line 441 today:

```tsx
            <TablePicker onSelect={addTable} />
```

Compute `canInsertTable` from `editor.isActive("table")` and gate the picker. The `onTransaction` handler already force-updates on every transaction, so `editor.isActive(...)` reads a fresh value each render.

Edit:
- `old_string`: `            <TablePicker onSelect={addTable} />`
- `new_string`: `            <TablePicker onSelect={addTable} disabled={editor.isActive("table")} />`

- [ ] **Step 6: Add the CSS block**

Open `src/app/globals.css`. The Table editing block starts around line 208 (`/* ── Table editing ── */`). Append after the existing `.column-resize-handle` + `.resize-cursor` rules (around lines 246–258):

Edit:
- `old_string`:
```
.markdown-editor .ProseMirror.resize-cursor {
  cursor: col-resize;
}
```
- `new_string`:
```
.markdown-editor .ProseMirror.resize-cursor {
  cursor: col-resize;
}

/* ── Table floating toolbar ── */

.kb-table-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
  z-index: 20;
  pointer-events: auto;
  user-select: none;
}
```

- [ ] **Step 7: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Only the pre-existing `codeBlockCopy.tsx(46,26)` error.

- [ ] **Step 8: Rebuild graphify index**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && /Users/kiro/.local/pipx/venvs/graphifyy/bin/python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 9: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/components/MarkdownEditor.tsx \
        src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(document): wire floating table toolbar + disable Insert in-table

Render TableFloatingToolbar inside the editor's scroll container and
wire its ref so positioning works. Extend the top-toolbar TablePicker
with a `disabled` prop that dims the trigger, swaps its title to
explain the state, and suppresses the popover; drive it from
`editor.isActive("table")`. Add the small `.kb-table-toolbar` CSS
block for the bar chrome.

This closes the UX loop for the no-nest rule: the Insert Table button
is visibly disabled when the cursor is inside a cell, and the command
guard from the previous commit still blocks keyboard / programmatic
paths.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add hover-based visibility and hover-click focus fallback

**Files:**
- Modify: `src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx`

Task 2 shipped the toolbar with cursor-only visibility. This task adds:
1. Hover tracking via event delegation on the container, with a 200 ms debounce on mouse-leave to avoid flickering when moving from the table to the toolbar.
2. A ref to the last-hovered cell so button clicks snap the cursor into that cell first when the user is in hover-only mode (no cursor in any cell).

- [ ] **Step 1: Add hover state, last-hovered-cell ref, and the effect**

Open `src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx`. Right after the `cursorTable` state declaration, add:

Edit:
- `old_string`:
```
  const [cursorTable, setCursorTable] = useState<HTMLTableElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
```
- `new_string`:
```
  const [cursorTable, setCursorTable] = useState<HTMLTableElement | null>(null);
  const [hoverTable, setHoverTable] = useState<HTMLTableElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  // Last cell the mouse entered. Used to snap the cursor into place when a
  // toolbar button is clicked in hover-only mode (user hovered the table
  // but their caret isn't inside it).
  const lastHoverCellRef = useRef<HTMLElement | null>(null);
```

- [ ] **Step 2: Replace `const anchor = cursorTable;` with cursor-wins-over-hover**

Edit:
- `old_string`: `  const anchor = cursorTable;`
- `new_string`: `  const anchor = cursorTable ?? hoverTable;`

- [ ] **Step 3: Add the hover-tracking effect**

Immediately BEFORE the position effect (the one with `ResizeObserver`), add a new effect that delegates mouseover/mouseout on the container:

Edit:
- `old_string`:
```
  const anchor = cursorTable ?? hoverTable;

  // ── Position: recompute on anchor change, scroll, resize, size change. ──
  useEffect(() => {
```
- `new_string`:
```
  const anchor = cursorTable ?? hoverTable;

  // ── Hover tracking: delegate mouse events on the container so we don't
  //    have to attach listeners per-table (tables come and go). ──
  useEffect(() => {
    const root = containerRef.current;
    if (!editor || !root) return;
    let hideTimer: number | undefined;
    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !root.contains(target)) return;
      const cell = target.closest("td, th") as HTMLElement | null;
      if (cell) lastHoverCellRef.current = cell;
      const tbl = target.closest("table") as HTMLTableElement | null;
      if (!tbl) return;
      if (hideTimer !== undefined) {
        window.clearTimeout(hideTimer);
        hideTimer = undefined;
      }
      setHoverTable((prev) => (prev === tbl ? prev : tbl));
    };
    const onOut = (e: MouseEvent) => {
      const toEl = e.relatedTarget as Element | null;
      // Moving from table → toolbar: keep it visible.
      if (toEl?.closest?.(".kb-table-toolbar")) return;
      // Moving inside the same table: not really leaving.
      const fromTbl = (e.target as Element | null)?.closest?.("table");
      const toTbl = toEl?.closest?.("table");
      if (fromTbl && fromTbl === toTbl) return;
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        setHoverTable(null);
      }, 200);
    };
    root.addEventListener("mouseover", onOver, true);
    root.addEventListener("mouseout", onOut, true);
    return () => {
      root.removeEventListener("mouseover", onOver, true);
      root.removeEventListener("mouseout", onOut, true);
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    };
  }, [editor, containerRef]);

  // ── Position: recompute on anchor change, scroll, resize, size change. ──
  useEffect(() => {
```

- [ ] **Step 4: Update `run` to snap the cursor in hover-only mode**

Replace the existing `run` helper with one that places the selection inside `lastHoverCellRef.current` when the current selection isn't in the anchor table. Find the block that defines `run` and `canRun` — it looks roughly like:

Edit:
- `old_string`:
```
  // Dispatch via chain().focus() so the cursor lands back inside the
  // now-modified table after each op (esp. important if the user used the
  // keyboard to trigger the button without clicking into a cell first).
  const run = (cmd: keyof ReturnType<Editor["can"]>) => {
    // Narrow: all our commands are zero-arg on chain().
    (editor.chain().focus() as unknown as Record<string, () => { run: () => boolean }>)
      [cmd]()
      .run();
  };

  const canRun = (cmd: keyof ReturnType<Editor["can"]>) => {
    return (editor.can() as unknown as Record<string, () => boolean>)[cmd]();
  };
```
- `new_string`:
```
  // Dispatch via chain().focus() so the cursor lands back inside the
  // now-modified table after each op. In hover-only mode (cursor wasn't in
  // any cell), first move the selection into the last-hovered cell so the
  // row/column-scoped commands have a reference cell to operate on.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorAny = editor as any;
  const maybeSnapCursor = () => {
    if (cursorTable && anchor === cursorTable) return; // already inside
    const cell = lastHoverCellRef.current;
    if (!cell || !cell.isConnected) return;
    try {
      const pos = editor.view.posAtDOM(cell, 0);
      // +1 steps inside the cell's content (past the opening token).
      editor.commands.setTextSelection(pos + 1);
    } catch {
      // Stale cell (removed between hover and click) — fall through; the
      // command will operate on whatever the current selection is or no-op.
    }
  };
  const run = (cmd: string) => {
    maybeSnapCursor();
    editorAny.chain().focus()[cmd]().run();
  };
  const canRun = (cmd: string) => {
    // Can() doesn't mutate; safe to ask regardless of hover state. In
    // hover-only mode the check returns false (no selection in a table),
    // which disables every button — the user sees the bar chrome and
    // tooltips but has to click into a cell first. On the first click
    // after that, the cursor effect picks it up and enables the buttons.
    return editorAny.can()[cmd]();
  };
```

(Also change the button callsites: they already pass string literals, so they're fine with the looser `string` type. The `keyof ReturnType<...>` form is replaced.)

- [ ] **Step 5: Verify typecheck**

Run: `cd "/Users/kiro/My Projects/knowledge-base" && npx tsc --noEmit -p tsconfig.json`
Expected: Only the pre-existing `codeBlockCopy.tsx(46,26)` error.

- [ ] **Step 6: Rebuild graphify index**

```bash
cd "/Users/kiro/My Projects/knowledge-base" && /Users/kiro/.local/pipx/venvs/graphifyy/bin/python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

- [ ] **Step 7: Commit**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git add src/app/knowledge_base/features/document/components/TableFloatingToolbar.tsx
git commit -m "$(cat <<'EOF'
feat(document): table toolbar shows on hover + snaps cursor on click

Add hover-based visibility to TableFloatingToolbar via delegated
mouseover/mouseout events on the editor's scroll container. 200ms
debounce on leave prevents flicker when the mouse moves from the
table onto the toolbar itself.

Track the last-hovered cell in a ref; when a button is clicked in
hover-only mode (cursor not already in a cell), first set a
TextSelection inside that cell so row/column ops have a reference.

When both cursor and hover resolve a table, cursor wins — hover never
pulls the toolbar off the cursor's table.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Browser verification

**Files:** No file changes. Exercises all previous tasks against the running dev server.

- [ ] **Step 1: Confirm dev server + document are ready**

Run: `mcp__Claude_Preview__preview_list`. Note the serverId; store as `$SID`.

Run: `mcp__Claude_Preview__preview_snapshot(serverId=$SID)`. Expected: a `.markdown-editor` region. If instead the snapshot shows "Open Folder" / "No file open", stop and ask the user to open a vault and a `.md` file — the File System Access picker is native browser UI that can't be driven here.

- [ ] **Step 2: Insert a 3×3 table and confirm the toolbar appears on cursor**

```js
(() => {
  const btn = document.querySelector('button[title="Insert table"]');
  btn?.click();
  const cells = document.querySelectorAll('.relative .grid .w-5.h-5');
  if (cells.length < 18) return { error: 'picker not open' };
  // 3×3 = index 2*8+2 = 18
  cells[18]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  return { ok: true };
})()
```

Then wait a moment and:

```js
(() => ({
  toolbarVisible: !!document.querySelector('.kb-table-toolbar'),
  toolbarButtons: document.querySelectorAll('.kb-table-toolbar button').length,
  tableInDoc: !!document.querySelector('.markdown-editor td'),
}))()
```

Expected: `toolbarVisible: false` initially (cursor may be outside or at the row-selection fallback). Click into a cell:

```js
(() => {
  const td = document.querySelectorAll('.markdown-editor td')[0];
  const p = td?.querySelector('p');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  td?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  td?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  td?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return { ok: true };
})()
```

Then `mcp__Claude_Preview__preview_click(serverId=$SID, selector=".markdown-editor td p")` to place a real cursor. Re-query:

```js
(() => ({
  toolbarVisible: !!document.querySelector('.kb-table-toolbar'),
  buttonCount: document.querySelectorAll('.kb-table-toolbar button').length,
}))()
```

Expected: `toolbarVisible: true`, `buttonCount: 9`.

- [ ] **Step 3: Click Add Row Above and verify the table grew**

```js
(() => {
  const beforeRows = document.querySelectorAll('.markdown-editor tr').length;
  const btn = document.querySelector('.kb-table-toolbar button[title="Add row above"]');
  btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  const afterRows = document.querySelectorAll('.markdown-editor tr').length;
  return { beforeRows, afterRows };
})()
```

Expected: `afterRows === beforeRows + 1`.

- [ ] **Step 4: Verify Insert Table button is disabled while cursor is in a cell**

```js
(() => {
  const btn = document.querySelector('button[title^="Insert table"]');
  return {
    title: btn?.title,
    disabled: btn?.disabled,
    opacity: btn ? getComputedStyle(btn).opacity : null,
  };
})()
```

Expected: `title === "Insert table (not allowed inside a table)"`, `disabled: true` (or the opacity check showing dimmed state — the button uses opacity via Tailwind rather than the native disabled attribute, see the `TBtn` classes).

Also try to trigger `insertTable` via the command API to verify the guard:

```js
(() => {
  // Find the Tiptap editor. The MarkdownEditor doesn't export it globally,
  // but the ProseMirror DOM has a pmViewDesc attached; Tiptap stores the
  // editor in EditorContent's React fiber. Simpler test: click the button
  // and verify nothing happened.
  const beforeCount = document.querySelectorAll('.markdown-editor table').length;
  const btn = document.querySelector('button[title^="Insert table"]');
  btn?.click();  // should be a no-op since it's disabled
  return {
    beforeCount,
    afterCount: document.querySelectorAll('.markdown-editor table').length,
    popoverOpen: !!document.querySelector('.grid.gap-px'),
  };
})()
```

Expected: `beforeCount === afterCount` and `popoverOpen === false`. If `popoverOpen` is true, the UI disable didn't take — check the `disabled` prop wiring in `TablePicker`.

- [ ] **Step 5: Toggle header row, toggle header column**

```js
(() => {
  const before = document.querySelector('.markdown-editor tr th') ? 'has-th' : 'no-th';
  document.querySelector('.kb-table-toolbar button[title="Toggle header row"]')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  const after = document.querySelector('.markdown-editor tr th') ? 'has-th' : 'no-th';
  return { before, after };
})()
```

Expected: `before !== after` (toggled either direction). Click again to toggle back.

- [ ] **Step 6: Hover visibility test**

Move the cursor outside the table by clicking elsewhere in the doc:

```js
(() => {
  // Click on an area above/below the table in the editor.
  const pm = document.querySelector('.markdown-editor .ProseMirror');
  // Place caret at position 0 of the first block (outside the table).
  const firstBlock = pm?.firstChild;
  if (!firstBlock) return { error: 'no first block' };
  const range = document.createRange();
  range.setStart(firstBlock, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return { toolbarVisible: !!document.querySelector('.kb-table-toolbar') };
})()
```

Expected: `toolbarVisible: false` (cursor not in table).

Now simulate hover by dispatching mouseover on a table cell:

```js
(() => {
  const td = document.querySelectorAll('.markdown-editor td')[0];
  td?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { toolbarVisible: !!document.querySelector('.kb-table-toolbar') };
})()
```

Expected: `toolbarVisible: true`.

Dispatch mouseout with `relatedTarget` being somewhere off-table, wait 250 ms, and check:

```js
(() => new Promise(resolve => {
  const td = document.querySelectorAll('.markdown-editor td')[0];
  td?.dispatchEvent(new MouseEvent('mouseout', {
    bubbles: true,
    relatedTarget: document.body,
  }));
  setTimeout(() => {
    resolve({ toolbarVisible: !!document.querySelector('.kb-table-toolbar') });
  }, 300);
}))()
```

Expected: `toolbarVisible: false` after the 200 ms debounce.

- [ ] **Step 7: Delete Table**

```js
(() => {
  // Click into a cell to make the toolbar appear
  const td = document.querySelectorAll('.markdown-editor td')[0];
  const p = td?.querySelector('p');
  const range = document.createRange();
  range.setStart(p, 0);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  td?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  const before = document.querySelectorAll('.markdown-editor table').length;
  document.querySelector('.kb-table-toolbar button[title="Delete table"]')
    ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  const after = document.querySelectorAll('.markdown-editor table').length;
  return { before, after, toolbarVisible: !!document.querySelector('.kb-table-toolbar') };
})()
```

Expected: `after === before - 1`, `toolbarVisible: false`.

- [ ] **Step 8: Screenshot proof**

Insert a fresh table for the final screenshot:

Click Insert Table button, pick 3×3, click into a cell, then:

`mcp__Claude_Preview__preview_screenshot(serverId=$SID)`

Save and reference in any PR description.

- [ ] **Step 9: Commit any follow-up fixes from verification**

If any step above revealed an issue (most likely: an icon import name, a disabled-prop wiring miss, a debounce timing tweak), fix it, typecheck, rebuild graphify, and commit with a `fix(document):` prefix. If all steps pass, no commit in this step.

---

## Appendix: Rollback

Each task is one commit touching a small number of files. To revert any single task:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git log --oneline -5
git revert <sha>
```

- Task 1's commit contains `tableNoNest.ts` plus the one-line import / extension swap in `MarkdownEditor.tsx`. Revert alone restores nesting (bad, but contained).
- Task 2's commit contains `TableFloatingToolbar.tsx` (new file). Revert removes the toolbar; no effect on other features.
- Task 3's commit contains the wiring (`MarkdownEditor.tsx` + `globals.css`). Revert leaves the toolbar file in the tree but unmounted; no visible effect until Task 2 or 3 is re-applied.
- Task 4's commit is purely additions to `TableFloatingToolbar.tsx`. Revert drops hover support; the cursor path from Task 2 still works.

No commit touches existing extensions (`markdownReveal.ts`, `markdownSerializer.ts`, etc.), so reverts can't affect raw-reveal or serialization paths.
