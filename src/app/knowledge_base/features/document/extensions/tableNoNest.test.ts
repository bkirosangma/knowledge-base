import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import { TableNoNest } from './tableNoNest'

// Covers DOC-4.3-26 and DOC-4.3-27. See test-cases/04-document.md §4.3.c.

function createEditor() {
  return new Editor({
    extensions: [
      StarterKit,
      TableNoNest.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
    ],
    content: '<p>Hello</p>',
  })
}

describe('TableNoNest extension', () => {
  it('DOC-4.3-27: insertTable succeeds when cursor is NOT inside a table', () => {
    const editor = createEditor()
    // Cursor starts in the opening paragraph — not in a table.
    expect(editor.isActive('table')).toBe(false)
    const result = editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    expect(result).toBe(true)
    // Editor now contains a <table …> open tag.
    expect(editor.getHTML()).toMatch(/<table[\s>]/)
    editor.destroy()
  })

  it('DOC-4.3-26: insertTable returns false when cursor is already inside a table', () => {
    const editor = createEditor()
    // First, insert a table to seed editor state.
    editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    expect(editor.isActive('table')).toBe(true)

    // Second insertTable call inside a table must be blocked.
    const result = editor.chain().insertTable({ rows: 3, cols: 3 }).run()
    expect(result).toBe(false)

    // Only the single originally-inserted table exists.
    const tables = editor.getHTML().match(/<table[\s>]/g) ?? []
    expect(tables).toHaveLength(1)
    editor.destroy()
  })

  it('insertTable works again after moving cursor out of the table', () => {
    const editor = createEditor()
    editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    // Move cursor out of the table by jumping to end of doc + adding a paragraph.
    editor.chain().focus('end').createParagraphNear().run()
    expect(editor.isActive('table')).toBe(false)
    const result = editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()
    expect(result).toBe(true)
    editor.destroy()
  })
})
