import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { CodeBlockWithCopy } from './codeBlockCopy'

// Covers DOC-4.3-22 through DOC-4.3-25. See test-cases/04-document.md §4.3.b.

/** Render a Tiptap editor seeded with a single code block. */
function EditorHost({ code = 'const x = 1;' }: { code?: string }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      CodeBlockWithCopy,
    ],
    content: `<pre><code>${code}</code></pre>`,
    immediatelyRender: false,
  })
  if (!editor) return null
  return <EditorContent editor={editor} />
}

/** Mock the Clipboard API on navigator; returns a restore helper. */
function mockClipboard(impl: (text: string) => Promise<void> | void) {
  const originalClipboard = navigator.clipboard
  const writeText = vi.fn(impl)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return {
    restore: () => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      })
    },
    writeText,
  }
}

describe('CodeBlockWithCopy — rendering', () => {
  it('DOC-4.3-22: renders a copy button inside the code block wrapper', async () => {
    const { container } = render(<EditorHost code="hello" />)
    await waitFor(() =>
      expect(container.querySelector('.md-codeblock-wrapper')).not.toBeNull(),
    )
    expect(container.querySelector('.md-codeblock-copy')).not.toBeNull()
  })

  it('the copy button exposes a Copy icon and "Copy code" label initially', async () => {
    render(<EditorHost code="hello" />)
    const btn = await screen.findByRole('button', { name: 'Copy code' })
    expect(btn.getAttribute('title')).toBe('Copy code')
  })
})

describe('CodeBlockWithCopy — click copies', () => {
  it('DOC-4.3-23: writes the code block\'s text content via navigator.clipboard', async () => {
    const { writeText, restore } = mockClipboard(async () => {})
    render(<EditorHost code="const answer = 42;" />)
    const btn = await screen.findByRole('button', { name: 'Copy code' })
    await act(async () => { fireEvent.click(btn) })
    expect(writeText).toHaveBeenCalledWith('const answer = 42;')
    restore()
  })

  it('DOC-4.3-25: after click, button reports "Copied" then reverts after ~1500 ms', async () => {
    const { restore } = mockClipboard(async () => {})
    render(<EditorHost code="x" />)
    const btn = await screen.findByRole('button', { name: 'Copy code' })
    await act(async () => { fireEvent.click(btn) })

    // Immediately after click, label flips to "Copied".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    })

    // Real timers: wait up to ~2s for the label to revert.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy(),
      { timeout: 2500 },
    )

    restore()
  })
})

describe('CodeBlockWithCopy — execCommand fallback', () => {
  it('DOC-4.3-24: falls back to textarea + document.execCommand("copy") when clipboard throws', async () => {
    const { restore } = mockClipboard(async () => {
      throw new Error('permission denied')
    })
    const execCopy = vi.fn(() => true)
    const originalExec = document.execCommand
    document.execCommand = execCopy as unknown as typeof document.execCommand

    render(<EditorHost code="fallback content" />)
    const btn = await screen.findByRole('button', { name: 'Copy code' })
    await act(async () => { fireEvent.click(btn) })

    expect(execCopy).toHaveBeenCalledWith('copy')
    // And the button still flips to the Copied state even when fallback was used.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    })

    document.execCommand = originalExec
    restore()
  })
})
