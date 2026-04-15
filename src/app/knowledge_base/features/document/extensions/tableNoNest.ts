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
          if (!parentInsert) return false;
          return parentInsert(options)(ctx);
        },
    };
  },
});
