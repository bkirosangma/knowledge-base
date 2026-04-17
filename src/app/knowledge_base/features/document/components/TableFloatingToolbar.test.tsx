import { describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import type { Editor } from '@tiptap/core'
import { TableNoNest } from '../extensions/tableNoNest'
import { TableFloatingToolbar } from './TableFloatingToolbar'

// Covers DOC-4.6-06..12 (table row/column/header/delete operations via toolbar buttons).
// DOC-4.6-01..05, 13..14 are 🟡/🚫 — they depend on real browser layout (hover geometry,
// scroll events, 200 ms timer, viewport clipping) that JSDOM cannot exercise.

let editorInstance: Editor | null = null

function TableEditorHost() {
  const containerRef = useRef<HTMLDivElement>(null)
  const editor = useEditor({
    extensions: [
      StarterKit,
      TableNoNest.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: '<p>seed</p>',
    immediatelyRender: false,
  })
  editorInstance = editor
  if (!editor) return null
  return (
    <div ref={containerRef}>
      <EditorContent editor={editor} />
      <TableFloatingToolbar editor={editor} containerRef={containerRef} />
    </div>
  )
}

/** Insert a 2×2 table with a header row and place cursor in the first body cell. */
async function insertTableAndFocus() {
  await act(async () => {
    editorInstance!
      .chain()
      .focus()
      .insertTable({ rows: 2, cols: 2, withHeaderRow: true })
      .run()
  })
}

describe('TableFloatingToolbar — button labels', () => {
  it('all 9 operation buttons are present when cursor is inside a table', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()

    // Toolbar renders only once anchor (table DOM el) + pos are resolved.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Add row above' })).not.toBeNull()
    })

    for (const label of [
      'Add row above',
      'Add row below',
      'Delete row',
      'Add column left',
      'Add column right',
      'Delete column',
      'Toggle header row',
      'Toggle header column',
      'Delete table',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })
})

describe('TableFloatingToolbar — row operations (DOC-4.6-06, 4.6-07)', () => {
  it('DOC-4.6-06: "Add row below" inserts a new row', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add row below' })).not.toBeNull(),
    )

    const htmlBefore = editorInstance!.getHTML()
    const rowsBefore = (htmlBefore.match(/<tr[\s>]/g) ?? []).length

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Add row below' }))
    await waitFor(() => {
      const rows = (editorInstance!.getHTML().match(/<tr[\s>]/g) ?? []).length
      expect(rows).toBe(rowsBefore + 1)
    })
  })

  it('DOC-4.6-07: "Delete row" removes the current row', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete row' })).not.toBeNull(),
    )

    const rowsBefore = (editorInstance!.getHTML().match(/<tr[\s>]/g) ?? []).length

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete row' }))
    await waitFor(() => {
      const rows = (editorInstance!.getHTML().match(/<tr[\s>]/g) ?? []).length
      expect(rows).toBe(rowsBefore - 1)
    })
  })
})

describe('TableFloatingToolbar — column operations (DOC-4.6-08, 4.6-09)', () => {
  it('DOC-4.6-08: "Add column right" inserts a new column', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Add column right' })).not.toBeNull(),
    )

    const colsBefore = (editorInstance!.getHTML().match(/<td[\s>]|<th[\s>]/g) ?? []).length

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Add column right' }))
    await waitFor(() => {
      const cols = (editorInstance!.getHTML().match(/<td[\s>]|<th[\s>]/g) ?? []).length
      expect(cols).toBeGreaterThan(colsBefore)
    })
  })

  it('DOC-4.6-09: "Delete column" removes the current column', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete column' })).not.toBeNull(),
    )

    const colsBefore = (editorInstance!.getHTML().match(/<td[\s>]|<th[\s>]/g) ?? []).length

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete column' }))
    await waitFor(() => {
      const cols = (editorInstance!.getHTML().match(/<td[\s>]|<th[\s>]/g) ?? []).length
      expect(cols).toBeLessThan(colsBefore)
    })
  })
})

describe('TableFloatingToolbar — header operations (DOC-4.6-10, 4.6-11)', () => {
  it('DOC-4.6-10: "Toggle header row" flips <th> presence in first row', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Toggle header row' })).not.toBeNull(),
    )

    const hadHeaders = editorInstance!.getHTML().includes('<th')
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Toggle header row' }))
    await waitFor(() => {
      expect(editorInstance!.getHTML().includes('<th')).toBe(!hadHeaders)
    })
  })
})

describe('TableFloatingToolbar — delete table (DOC-4.6-12)', () => {
  it('DOC-4.6-12: "Delete table" removes the entire table from the document', async () => {
    render(<TableEditorHost />)
    await waitFor(() => editorInstance !== null)
    await insertTableAndFocus()
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Delete table' })).not.toBeNull(),
    )

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Delete table' }))
    await waitFor(() => {
      expect(editorInstance!.getHTML()).not.toMatch(/<table[\s>]/)
    })
  })
})
