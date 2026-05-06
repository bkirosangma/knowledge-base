import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

// Mock MarkdownEditor with a stub that:
//   1. Forwards `editorContainerRef` to a real <div> so the parent's
//      `editorContainerRef.current.querySelector(...)` can find headings.
//   2. Renders a heading with `data-heading-id` (the contract Task 5 will
//      stamp on real Tiptap heading nodes).
//   3. Calls `onEditorReady` after mount via useEffect — never during
//      render — so React doesn't warn about parent state updates inside
//      a child render.
//
// Strategy 2 from the MVP-3 Task 4 plan: we test MarkdownPane's anchor
// contract without dragging in Tiptap's mount timing.
function MarkdownEditorStub({
  editorContainerRef,
  onEditorReady,
}: {
  editorContainerRef?: React.RefObject<HTMLDivElement | null>
  onEditorReady?: () => void
}) {
  React.useEffect(() => {
    onEditorReady?.()
  }, [onEditorReady])
  return (
    <div
      ref={editorContainerRef as React.RefObject<HTMLDivElement>}
      data-testid="editor-stub"
    >
      <h1 data-heading-id="a">A</h1>
      <h2 data-heading-id="b-section">B Section</h2>
    </div>
  )
}

vi.mock('./MarkdownEditor', () => ({ default: MarkdownEditorStub }))

import MarkdownPane from './MarkdownPane'

describe('MarkdownPane — anchor scroll (DOC-4 MVP-3)', () => {
  // JSDOM does not implement Element.prototype.scrollIntoView. Stub it
  // with a vi.fn() so we can assert against it. Reset the mock between
  // tests rather than restoring (there is nothing to restore to).
  const scrollIntoViewSpy = vi.fn<() => void>()

  beforeEach(() => {
    scrollIntoViewSpy.mockClear()
    Element.prototype.scrollIntoView = scrollIntoViewSpy as unknown as Element['scrollIntoView']
  })

  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('scrolls to the heading matching anchor when content renders', async () => {
    render(
      <MarkdownPane
        filePath="doc.md"
        content="# A\n## B Section"
        title="Doc"
        anchor="b-section"
      />,
    )

    await waitFor(() => {
      expect(scrollIntoViewSpy).toHaveBeenCalled()
    })

    // Verify scrollIntoView was called on the element with the matching
    // data-heading-id, not on some other heading.
    const target = document.querySelector(
      '[data-heading-id="b-section"]',
    ) as HTMLElement
    expect(target).not.toBeNull()
    expect(scrollIntoViewSpy.mock.instances).toContain(target)
    expect(scrollIntoViewSpy).toHaveBeenCalledWith({
      block: 'start',
      behavior: 'instant',
    })
    // And NOT on the wrong heading.
    const otherHeading = document.querySelector(
      '[data-heading-id="a"]',
    ) as HTMLElement
    expect(scrollIntoViewSpy.mock.instances).not.toContain(otherHeading)
  })

  it('does not scroll when anchor is unset', async () => {
    render(
      <MarkdownPane
        filePath="doc.md"
        content="# A\n## B Section"
        title="Doc"
      />,
    )

    // Allow the editor stub's mount effect to run and onEditorReady to fire.
    await waitFor(() => {
      expect(document.querySelector('[data-heading-id="b-section"]')).not.toBeNull()
    })

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })
})
