import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { useState, useEffect } from 'react'
import StarterKit from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { NodeSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/core'
import { WikiLink } from '../extensions/wikiLink'
import { LinkEditorPopover } from './LinkEditorPopover'

// Covers DOC-4.7-01, 4.7-02, 4.7-06..12.
// DOC-4.7-03..05 (positioning below/above/clamp) are 🚫 — depend on real viewport geometry.

let editorRef: Editor | null = null

beforeEach(() => {
  // Reset so waitFor doesn't pass on a stale destroyed editor from a prior test.
  editorRef = null
})

function LinkEditorHost({
  initialContent = '<p>Hello</p>',
  allDocPaths,
}: {
  initialContent?: string
  allDocPaths?: string[]
}) {
  // Tiptap v3 uses useSyncExternalStore which doesn't propagate inside JSDOM
  // act(). An explicit transaction listener guarantees React re-renders so that
  // useMemo deps (editor.state.selection) are re-evaluated after each dispatch.
  const [, forceUpdate] = useState(0)
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      WikiLink,
    ],
    content: initialContent,
    immediatelyRender: false,
  })
  editorRef = editor

  useEffect(() => {
    if (!editor) return
    const fn = () => forceUpdate((n) => n + 1)
    editor.on('transaction', fn)
    return () => {
      editor.off('transaction', fn)
    }
  }, [editor])

  if (!editor) return null
  return (
    <>
      <EditorContent editor={editor} />
      <LinkEditorPopover editor={editor} allDocPaths={allDocPaths} />
    </>
  )
}

/** Wait until the current test's editor is live and editable. */
async function waitForEditor() {
  await waitFor(() => editorRef !== null && !editorRef.isDestroyed)
}

/** Find the position of a node by type name in the current doc. */
function findNodePos(editor: Editor, typeName: string): number {
  let found = -1
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.type.name === typeName) { found = pos; return false }
  })
  return found
}

/** Place cursor inside the link mark. Position 3 is between 'i' and 'n' of "link text". */
async function focusInsideLink(pos = 3) {
  await act(async () => {
    editorRef!.chain().focus().setTextSelection(pos).run()
  })
}

describe('LinkEditorPopover — link mark mode (DOC-4.7-01)', () => {
  it('DOC-4.7-01: shows "URL" and "Text" field labels when cursor is on a link mark', async () => {
    render(
      <LinkEditorHost
        initialContent='<p><a href="https://example.com">link text</a></p>'
      />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    await waitFor(() => {
      expect(screen.queryByText('URL')).not.toBeNull()
    })
    expect(screen.getByText('Text')).toBeTruthy()
  })

  it('URL input is pre-populated with the link href', async () => {
    render(
      <LinkEditorHost
        initialContent='<p><a href="https://example.com">click me</a></p>'
      />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    await waitFor(() => {
      expect(screen.queryByDisplayValue('https://example.com')).not.toBeNull()
    })
  })

  it('DOC-4.7-09: Escape key reverts URL draft to original value', async () => {
    render(
      <LinkEditorHost
        initialContent='<p><a href="https://example.com">link text</a></p>'
      />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    const input = await screen.findByDisplayValue('https://example.com') as HTMLInputElement

    // Change the draft without committing (stay in the input).
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://modified.com' } })
    })
    expect(input.value).toBe('https://modified.com')

    // Escape should revert the draft without committing to the editor.
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    await waitFor(() => expect(input.value).toBe('https://example.com'))
  })

  it('DOC-4.7-07: Enter key commits the URL change to the editor', async () => {
    render(
      <LinkEditorHost
        initialContent='<p><a href="https://old.com">link text</a></p>'
      />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    await waitFor(() =>
      expect(screen.queryByDisplayValue('https://old.com')).not.toBeNull(),
    )
    const input = screen.getByDisplayValue('https://old.com') as HTMLInputElement
    input.focus()
    await act(async () => {
      fireEvent.change(input, { target: { value: 'https://new.com' } })
      fireEvent.keyDown(input, { key: 'Enter' })
    })

    await waitFor(() => {
      expect(editorRef!.getHTML()).toContain('https://new.com')
    })
  })

  it('DOC-4.7-12: unlink button removes the link mark, leaving plain text', async () => {
    render(
      <LinkEditorHost
        initialContent='<p><a href="https://example.com">link text</a></p>'
      />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    await waitFor(() => expect(screen.queryByText('URL')).not.toBeNull())

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove link'))
    })

    await waitFor(() => {
      expect(editorRef!.getHTML()).not.toContain('<a ')
    })
  })
})

describe('LinkEditorPopover — readOnly mode (DOC-4.12-03)', () => {
  it('DOC-4.12-03: popover disappears when editor becomes non-editable', async () => {
    render(
      <LinkEditorHost initialContent='<p><a href="https://example.com">link text</a></p>' />,
    )
    await waitForEditor()
    await focusInsideLink(3)

    await waitFor(() => expect(screen.queryByText('URL')).not.toBeNull())

    await act(async () => {
      editorRef!.setEditable(false)
      // setEditable emits Tiptap's 'update' event, not 'transaction', so the
      // forceUpdate listener won't re-render the host automatically. A no-op
      // dispatch triggers 'transaction' so the useMemo deps re-evaluate and
      // return null (target = null → popover hides).
      editorRef!.view.dispatch(editorRef!.state.tr)
    })

    await waitFor(() => expect(screen.queryByText('URL')).toBeNull())
  })
})

describe('LinkEditorPopover — wiki-link mode (DOC-4.7-02, 4.7-06, 4.7-10, 4.7-11)', () => {
  async function insertAndSelectWikiLink(path: string, section?: string) {
    await act(async () => {
      editorRef!.chain().focus('end').insertWikiLink(path, section).run()
    })
    const pos = findNodePos(editorRef!, 'wikiLink')
    await act(async () => {
      const sel = NodeSelection.create(editorRef!.state.doc, pos)
      editorRef!.view.dispatch(editorRef!.state.tr.setSelection(sel))
    })
  }

  it('DOC-4.7-02: shows "Path" and "Text" field labels when a wiki-link is selected', async () => {
    render(<LinkEditorHost />)
    await waitForEditor()
    await insertAndSelectWikiLink('notes/test.md')

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )
    expect(screen.getByText('Text')).toBeTruthy()
  })

  it('DOC-4.7-06: datalist is populated with allDocPaths in wiki mode', async () => {
    render(
      <LinkEditorHost allDocPaths={['notes/alpha.md', 'notes/beta.md']} />,
    )
    await waitForEditor()
    await insertAndSelectWikiLink('notes/alpha.md')

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )

    // datalist options rendered via the portal into document.body
    const options = document.querySelectorAll('datalist option')
    const values = Array.from(options).map((o) => (o as HTMLOptionElement).value)
    expect(values).toContain('notes/alpha.md')
    expect(values).toContain('notes/beta.md')
  })

  it('DOC-4.7-10: display text is preserved when it was customised (not path-derived)', async () => {
    render(<LinkEditorHost />)
    await waitForEditor()
    // Insert with custom display
    await act(async () => {
      editorRef!.chain().focus().insertContent({
        type: 'wikiLink',
        attrs: { path: 'notes/test.md', section: null, display: 'My Custom Label' },
      }).run()
    })
    const pos = findNodePos(editorRef!, 'wikiLink')
    await act(async () => {
      const sel = NodeSelection.create(editorRef!.state.doc, pos)
      editorRef!.view.dispatch(editorRef!.state.tr.setSelection(sel))
    })

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )

    const pathInput = screen.getByDisplayValue('notes/test.md') as HTMLInputElement
    pathInput.focus()
    await act(async () => {
      fireEvent.change(pathInput, { target: { value: 'notes/other.md' } })
      fireEvent.keyDown(pathInput, { key: 'Enter' })
    })

    await waitFor(() => {
      const node = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
      expect(node?.attrs.display).toBe('My Custom Label')
    })
  })

  it('DOC-4.7-11: display text refreshes to new basename when it matched old path default', async () => {
    render(<LinkEditorHost />)
    await waitForEditor()
    await insertAndSelectWikiLink('notes/old.md')

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )

    const pathInput = screen.getByPlaceholderText('path/to/note#section') as HTMLInputElement
    pathInput.focus()
    await act(async () => {
      fireEvent.change(pathInput, { target: { value: 'notes/new.md' } })
      fireEvent.keyDown(pathInput, { key: 'Enter' })
    })

    await waitFor(() => {
      const node = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
      expect(node?.attrs.display).toBe('notes/new.md')
    })
  })

  it('DOC-4.7-12: unlink (Remove) button deletes the wiki-link atom', async () => {
    render(<LinkEditorHost />)
    await waitForEditor()
    await insertAndSelectWikiLink('notes/test.md')

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Remove wiki-link'))
    })

    await waitFor(() => {
      expect(editorRef!.getHTML()).not.toContain('data-wiki-link')
    })
  })

  it('DOC-4.3-14: Escape in the display-text input reverts to the prior display value', async () => {
    render(<LinkEditorHost />)
    await waitForEditor()
    await insertAndSelectWikiLink('notes/test.md')

    await waitFor(
      () => expect(screen.queryByText('Path')).not.toBeNull(),
      { timeout: 3000 },
    )

    // The Text input is the second input in the popover
    const inputs = document.querySelectorAll<HTMLInputElement>('.bg-white input')
    const displayInput = Array.from(inputs).find(
      (el) => el !== screen.getByPlaceholderText('path/to/note#section'),
    )!

    await act(async () => {
      fireEvent.change(displayInput, { target: { value: 'Edited label' } })
    })
    expect(displayInput.value).toBe('Edited label')

    await act(async () => {
      fireEvent.keyDown(displayInput, { key: 'Escape' })
    })

    // Escape should revert to the original display (path-derived default = 'notes/test.md')
    await waitFor(() => expect(displayInput.value).toBe('notes/test.md'))
  })
})

// ── DOC-4.3-04: diagram icon NodeView rendering ────────────────────────────

function WikiLinkHost({
  existingDocPaths,
  onNavigate,
  onCreateDocument,
}: {
  existingDocPaths?: Set<string>
  onNavigate?: (path: string, section?: string) => void
  onCreateDocument?: (path: string) => void
}) {
  const [, forceUpdate] = useState(0)
  const editor = useEditor({
    extensions: [
      StarterKit,
      WikiLink.configure({ existingDocPaths, onNavigate, onCreateDocument }),
    ],
    content: '<p>Start</p>',
    immediatelyRender: false,
  })
  editorRef = editor

  useEffect(() => {
    if (!editor) return
    const fn = () => forceUpdate((n) => n + 1)
    editor.on('transaction', fn)
    return () => { editor.off('transaction', fn) }
  }, [editor])

  if (!editor) return null
  return <EditorContent editor={editor} />
}

// DOC-4.3-15, 4.3-16, 4.12-05 (click-in-read-mode navigation/create) are 🚫 —
// ProseMirror handleClickOn uses posAtCoords({x,y}) which needs real viewport layout;
// JSDOM returns zero for all getBoundingClientRect calls. Covered in e2e/documentEditor.spec.ts.

describe('WikiLink NodeView — icon and inline-edit (DOC-4.3-04, 4.3-12, 4.3-13)', () => {
  it('DOC-4.3-04: .json target renders with diagram icon (data-kind="diagram")', async () => {
    render(
      <WikiLinkHost existingDocPaths={new Set(['diagram.json'])} />,
    )
    await waitForEditor()

    await act(async () => {
      editorRef!.chain().focus('end').insertWikiLink('diagram.json').run()
    })

    await waitFor(() => {
      const iconEl = document.querySelector<HTMLElement>('.wiki-link-icon')
      expect(iconEl).not.toBeNull()
      expect(iconEl!.dataset.kind).toBe('diagram')
    })
  })

  it('DOC-4.3-12: pressing a printable key while wiki-link is selected appends to display text', async () => {
    render(<WikiLinkHost />)
    await waitForEditor()

    await act(async () => {
      editorRef!.chain().focus('end').insertWikiLink('notes/test.md').run()
    })
    const pos = findNodePos(editorRef!, 'wikiLink')
    await act(async () => {
      const sel = NodeSelection.create(editorRef!.state.doc, pos)
      editorRef!.view.dispatch(editorRef!.state.tr.setSelection(sel))
    })

    const nodeBeforeKey = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
    const displayBefore = (nodeBeforeKey?.attrs.display as string) ?? 'notes/test.md'

    await act(async () => {
      fireEvent.keyDown(editorRef!.view.dom, { key: 'x' })
    })

    await waitFor(() => {
      const node = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
      expect(node?.attrs.display).toBe(displayBefore + 'x')
    })
  })

  it('DOC-4.3-13: Backspace while wiki-link is selected removes the last display character', async () => {
    render(<WikiLinkHost />)
    await waitForEditor()

    await act(async () => {
      editorRef!.chain().focus('end').insertWikiLink('notes/test.md').run()
    })
    const pos = findNodePos(editorRef!, 'wikiLink')
    await act(async () => {
      const sel = NodeSelection.create(editorRef!.state.doc, pos)
      editorRef!.view.dispatch(editorRef!.state.tr.setSelection(sel))
    })

    const nodeBefore = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
    const displayBefore = (nodeBefore?.attrs.display as string) ?? 'notes/test.md'

    await act(async () => {
      fireEvent.keyDown(editorRef!.view.dom, { key: 'Backspace' })
    })

    await waitFor(() => {
      const node = editorRef!.state.doc.nodeAt(findNodePos(editorRef!, 'wikiLink'))
      expect(node?.attrs.display).toBe(displayBefore.slice(0, -1))
    })
  })

})
