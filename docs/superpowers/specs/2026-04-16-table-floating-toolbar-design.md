# Table Floating Toolbar + No-Nest Guard — Design

## Context

The document editor (`MarkdownEditor.tsx`) uses Tiptap's `Table` / `TableCell` / `TableHeader` / `TableRow` extensions. Today the only table-related UI lives in the main toolbar: a `TablePicker` that inserts a new table of chosen dimensions. Once a table exists, there is no way to add or remove rows or columns, toggle the header, or delete the table except through keyboard shortcuts (`Tab` navigates cells, `Mod-Backspace` on a full selection deletes). All of the structural commands the editor already supports —`addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `toggleHeaderRow`, `toggleHeaderColumn`, `deleteTable` — are unreachable through the UI.

Separately, `TableCell.content = "block+"` and `Table` is in the `block` group, so the schema allows a table inside a cell. Nested tables cannot be represented in GFM pipe-table markdown, and our serializer (`tableToMarkdown`) produces only pipe tables. Anything nested either gets lost on save or produces malformed markdown. Today there is no UI or runtime guard against nesting; it is simply never reached because there is no "insert table" action except the top toolbar button, which a user typically invokes from outside any table.

This design adds:
1. A floating toolbar anchored to the active table, giving the structural commands a UI.
2. A guard that refuses `insertTable` when the cursor is already in a table, preventing any nesting.

It is explicitly **not** adding:
- Table styling (background / border / alternating row / colour schemes / themes). Out of scope.
- Nested-table serialization. Nesting is forbidden entirely — the serializer concern disappears.
- Schema-level narrowing of `tableCell.content`. Out of scope; the command guard is sufficient.

## Goals

- While the cursor is in a cell (or the mouse is hovering a table), a floating horizontal toolbar appears just above the top-left corner of that table.
- The toolbar exposes add-row-above, add-row-below, delete-row, add-column-left, add-column-right, delete-column, toggle-header-row, toggle-header-column, and delete-table.
- Each button's enabled state mirrors `editor.can().<command>()` so e.g. `deleteTable` is only enabled when a table actually contains the selection.
- Clicking a button runs the matching Tiptap command and keeps the cursor inside the now-modified table.
- The toolbar repositions smoothly when the table grows / shrinks (rows / columns added or removed), when the editor scrolls, and when the window resizes.
- In read-only mode, the toolbar never shows.
- The existing top-toolbar Insert Table button is disabled whenever the cursor is inside any cell, and the corresponding `insertTable` command is a no-op in that state so keyboard shortcuts / paste cannot slip in a nested table either.

## Non-goals

- Inline `+` / `⋯` handles on row / column edges (spreadsheet-style). Future work.
- Context / right-click menus for table ops. The floating toolbar covers the discoverability gap; a context menu would be redundant.
- Multi-cell operations beyond what Tiptap's core commands already do (merge / split cells are available via commands but intentionally omitted from this toolbar per the scope decision).
- Styling persistence of any kind. Absolutely none.

## Approach

### 1. New component — `TableFloatingToolbar.tsx`

A React component rendered by `MarkdownEditor.tsx` next to `<EditorContent>`.

**Props:**
- `editor: Editor | null`
- `containerRef: React.RefObject<HTMLDivElement>` — ref to the editor's scrollable ancestor (the `.markdown-editor` wrapper), used as the positioning context.

**State (local):**
- `cursorTable: HTMLTableElement | null` — the table containing the current selection, or null.
- `hoverTable: HTMLTableElement | null` — the table the mouse is over, or null. Reset with a ~200 ms debounce so moving between the table and the toolbar doesn't flicker it off.

Derived: `anchor = cursorTable ?? hoverTable`. Visibility: `anchor != null && editor.isEditable`.

**Cursor tracking (effect):**
```ts
useEffect(() => {
  if (!editor) return;
  const update = () => {
    const cell = findActiveCellDom(editor);
    setCursorTable(cell?.closest("table") ?? null);
  };
  editor.on("selectionUpdate", update);
  editor.on("transaction", update);  // covers non-selection doc edits
  update();  // initial
  return () => {
    editor.off("selectionUpdate", update);
    editor.off("transaction", update);
  };
}, [editor]);
```

`findActiveCellDom` resolves the DOM node for the current selection's cell:
```ts
function findActiveCellDom(editor: Editor): HTMLElement | null {
  const { $head } = editor.state.selection;
  for (let d = $head.depth; d > 0; d--) {
    const name = $head.node(d).type.name;
    if (name === "tableCell" || name === "tableHeader") {
      const pos = $head.before(d);
      return editor.view.nodeDOM(pos) as HTMLElement | null;
    }
  }
  return null;
}
```

**Hover tracking (effect):**
```ts
useEffect(() => {
  if (!editor || !containerRef.current) return;
  const root = containerRef.current;
  let hideTimer: number | undefined;
  const handleEnter = (e: MouseEvent) => {
    const tbl = (e.target as Element).closest?.("table") as HTMLTableElement | null;
    if (!tbl || !root.contains(tbl)) return;
    if (hideTimer) window.clearTimeout(hideTimer);
    setHoverTable(tbl);
  };
  const handleLeave = (e: MouseEvent) => {
    const toEl = e.relatedTarget as Element | null;
    // Stay visible when moving from the table INTO the toolbar.
    if (toEl?.closest?.(".kb-table-toolbar")) return;
    hideTimer = window.setTimeout(() => setHoverTable(null), 200);
  };
  root.addEventListener("mouseover", handleEnter, true);
  root.addEventListener("mouseout", handleLeave, true);
  return () => {
    root.removeEventListener("mouseover", handleEnter, true);
    root.removeEventListener("mouseout", handleLeave, true);
    if (hideTimer) window.clearTimeout(hideTimer);
  };
}, [editor]);
```

Event delegation on the container — no need to attach per-table listeners that churn as tables are added and removed.

**Position tracking (effect):**
```ts
const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
useEffect(() => {
  if (!anchor || !containerRef.current) {
    setPos(null);
    return;
  }
  const updatePos = () => {
    const t = anchor.getBoundingClientRect();
    const c = containerRef.current!.getBoundingClientRect();
    setPos({
      top: t.top - c.top + containerRef.current!.scrollTop - TOOLBAR_HEIGHT - 4,
      left: t.left - c.left + containerRef.current!.scrollLeft,
    });
  };
  updatePos();
  const ro = new ResizeObserver(updatePos);
  ro.observe(anchor);
  ro.observe(containerRef.current);
  containerRef.current.addEventListener("scroll", updatePos);
  window.addEventListener("resize", updatePos);
  return () => {
    ro.disconnect();
    containerRef.current?.removeEventListener("scroll", updatePos);
    window.removeEventListener("resize", updatePos);
  };
}, [anchor]);
```

The `4` pixel gap between the toolbar bottom and the table top keeps them visually distinct. `TOOLBAR_HEIGHT` is a constant matching the rendered height (around 32 px).

**Render:**
```tsx
if (!anchor || !editor || pos == null || !editor.isEditable) return null;
return (
  <div
    className="kb-table-toolbar"
    style={{ position: "absolute", top: pos.top, left: pos.left }}
  >
    <TBtn title="Add row above" onClick={() => run("addRowBefore")} disabled={!canRun("addRowBefore")}>
      <ArrowUp size={14} />
    </TBtn>
    {/* 8 more buttons */}
  </div>
);
```

Where `run(cmd)` = `editor.chain().focus().[cmd]().run()` and `canRun(cmd)` = `editor.can().[cmd]()`. The `focus()` call re-anchors the cursor inside the table so hover-only invocations (where the cursor wasn't in the table) still land the command in a sensible cell — we pick the cell the mouse was last over via a small ref kept in the hover handler.

Buttons and their commands (full list). Exact icons are implementation-level choices from `lucide-react`; the plan will pin concrete names from the installed version. Shapes below indicate the *intent* (directional arrow for "add on side X", a row/column glyph for the row/column-scoped delete, a trash for the whole-table delete).

| Shape | Title | Command |
|-------|-------|---------|
| up-arrow | Add row above | `addRowBefore` |
| down-arrow | Add row below | `addRowAfter` |
| row + ✕ | Delete row | `deleteRow` |
| left-arrow | Add column left | `addColumnBefore` |
| right-arrow | Add column right | `addColumnAfter` |
| column + ✕ | Delete column | `deleteColumn` |
| row highlight | Toggle header row | `toggleHeaderRow` |
| column highlight | Toggle header column | `toggleHeaderColumn` |
| trash | Delete table | `deleteTable` |

Separator `<Sep />` elements group {row ops} / {column ops} / {header toggles} / {delete table} visually. Reuses the `TBtn` / `Sep` helpers already defined in `MarkdownEditor.tsx` — export them or re-declare them locally. Re-declaring is simpler and keeps the toolbar file self-contained (~150 lines vs an export dance).

**Hover cell tracking (for hover-only focus):**
Keep a `lastHoverCell: HTMLElement | null` in a ref. When `mouseover` fires, update it to the nearest `td`/`th`. When the user clicks a button while the cursor isn't in a cell, the click handler first focuses that cell's interior:
```ts
function runWithFocus(cmd: CommandName) {
  const view = editor.view;
  const sel = editor.state.selection;
  const inTable = isSelectionInTable(sel);
  if (!inTable && lastHoverCell.current) {
    const pos = view.posAtDOM(lastHoverCell.current, 0);
    editor.commands.setTextSelection(pos + 1);  // +1 steps inside the cell
  }
  editor.chain().focus()[cmd]().run();
}
```

### 2. No-nest guard — new file `tableNoNest.ts` + existing file update

**New file: `src/app/knowledge_base/features/document/extensions/tableNoNest.ts`**

```ts
import { Table } from "@tiptap/extension-table";

/**
 * Extends Tiptap's Table extension so `insertTable` refuses when the
 * current selection is already inside a table. Prevents nested tables,
 * which GFM pipe-table markdown can't represent and our serializer
 * can't round-trip.
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

**Modify `MarkdownEditor.tsx`:**
- Replace `Table.configure({ resizable: true })` with `TableNoNest.configure({ resizable: true })`.
- In the render of the `TablePicker` button, compute `canInsertTable = !editor?.isActive("table")` and pass `disabled={!canInsertTable}` to `<TablePicker>`. Extend `TablePicker` to forward `disabled` to its inner `<TBtn>` and gate the popover's `setOpen(true)` on `!disabled`.
- Render `<TableFloatingToolbar editor={editor} containerRef={editorContainerRef} />` right after `<EditorContent>` (inside the scroll container so positioning math is relative to it).
- Add a `const editorContainerRef = useRef<HTMLDivElement>(null)` and attach it to the existing `<div className="flex-1 overflow-auto">` wrapper so the toolbar shares the editor's scroll context.

### 3. CSS additions (`globals.css`)

```css
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

Button hover / disabled styles re-use the existing `<TBtn>` Tailwind classes; the container just provides the bar chrome.

## Data Flow

```
User clicks into cell
  → Tiptap selectionUpdate
  → TableFloatingToolbar's cursor effect finds the containing <table> via nodeDOM
  → setCursorTable(tableEl)
  → anchor = cursorTable
  → position effect recomputes top/left via getBoundingClientRect
  → toolbar renders at the computed coords

User hovers a second table (mouse only, cursor still in the first)
  → mouseover bubbles to the container delegate
  → closest("table") resolves the target
  → setHoverTable(tableEl2)
  → anchor = cursorTable (cursor wins); hoverTable is ignored for anchoring
  → no visual change

User clicks "Add row above"
  → runWithFocus("addRowBefore")
  → editor.chain().focus().addRowBefore().run()
  → Tiptap dispatches transaction
  → selectionUpdate + transaction both fire
  → cursor effect re-resolves (same cell, now with a row above it)
  → ResizeObserver on the anchor fires (table grew by one row)
  → position recomputed; toolbar stays locked to the table's top-left

User presses Cmd+T / clicks Insert Table while inside a cell
  → TablePicker button is disabled (UI defense)
  → If bypassed via keyboard shortcut / command palette:
    → TableNoNest.insertTable runs
    → editor.isActive("table") === true → return false
    → no transaction dispatched, no nested table
```

## Error Handling

- `editor.view.nodeDOM(pos)` can return `null` if ProseMirror hasn't rendered yet (race during setup). The cursor effect handles null by falling through to `setCursorTable(null)`; the toolbar just stays hidden one extra tick.
- `anchor.getBoundingClientRect()` on a detached table (one removed between frames — e.g., user clicked Delete Table) returns zeroes. The position effect's `ResizeObserver` observes the anchor; when it disconnects, we also watch `anchor.isConnected` in the updatePos call and clear the anchor if the table was removed.
- Read-only toggle flip: the render guard `editor.isEditable` hides the toolbar when read-only. Hover / cursor effects still run harmlessly — nothing dispatches — because the render short-circuits before anything visible happens.
- `runWithFocus` called with a stale `lastHoverCell` (table was deleted, cell no longer in doc): `editor.view.posAtDOM` throws. Wrap in try/catch, fall back to `editor.chain().focus().run()` without setTextSelection.

## Testing

This repo has no unit-test harness for editor code; verification is manual via `preview_*` tools against the running dev server.

1. **Basic visibility**: insert a 3×3 table, click into a cell → toolbar shows above the top-left corner of the table.
2. **Hover visibility**: move cursor outside the table (e.g., into a paragraph below), then hover the mouse over the table → toolbar appears; move mouse off → toolbar fades after ~200 ms.
3. **Row ops**: use each of add-above / add-below / delete; confirm the table updates and the toolbar stays put.
4. **Column ops**: same as above for columns.
5. **Header toggles**: click toggle-header-row → first row becomes `<th>` (bold, greyer background from existing CSS); click again → reverts.
6. **Delete table**: click trash → table vanishes, toolbar hides (no anchor).
7. **Nesting prevented from UI**: click into a cell → top toolbar's Insert Table button is visibly disabled (reduced opacity, cursor: not-allowed); hovering shows the "not allowed inside a table" title tooltip.
8. **Nesting prevented from command**: outside a table, run `editor.commands.insertTable({ rows: 2, cols: 2 })` in the preview console — succeeds. Then place cursor in a cell and rerun — the call returns false and no nested table appears.
9. **Read-only mode**: flip readOnly on → toolbar hides even if the cursor had been in a cell. Flip off → toolbar re-appears when cursor re-enters.
10. **Scroll sync**: scroll the editor while a table's toolbar is visible → toolbar scrolls with the table (no detachment / lag).
11. **Resize sync**: add a wide column → table grows; toolbar's left position stays pinned to the table's left (doesn't drift).
12. **Toolbar position when table is near the viewport top**: insert a table at the very top of the document → toolbar may render above the visible area of the editor container. Accepted as a known minor quirk; user scrolls up to reach it. (Flip-to-below is a future enhancement.)

## Open Questions

- For the "hover-only" case (mouse over a table, cursor not in it), should button clicks first snap the cursor into the last-hovered cell (as described in `runWithFocus`), or should the button be disabled until the user clicks in? This spec chose the snap-in behaviour for ergonomics; if that proves surprising, swap to disabled-until-clicked.
- The existing `<TBtn>` helper lives in `MarkdownEditor.tsx` as a local component. The new toolbar re-declares it. If a third consumer appears later, extract to a shared `components/ToolbarButton.tsx`.
