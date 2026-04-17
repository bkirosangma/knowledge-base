import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocumentProperties from './DocumentProperties'

// Covers DOC-4.9-01, 4.9-03..08, 4.9-10.
// DOC-4.9-02 (char count display): 🚫 — stats.chars is computed but not rendered in the UI.
// DOC-4.9-09 (localStorage collapse state): 🚫 — collapsed is owned/persisted by the parent component.

describe('DocumentProperties — stats (DOC-4.9-01, 4.9-03)', () => {
  it('DOC-4.9-01: word count equals whitespace-split token count', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="one two three four five"
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText(/5 words/)).toBeTruthy()
  })

  it('DOC-4.9-03: reading time = ceil(words / 200)', () => {
    // 201 words → ceil(201/200) = 2 min
    const longContent = Array.from({ length: 201 }, (_, i) => `word${i}`).join(' ')
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content={longContent}
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('2 min read')).toBeTruthy()
  })

  it('reading time minimum is 1 min for very short content', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="hi"
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('1 min read')).toBeTruthy()
  })

  it('empty content reports 0 words and 0 min reading time', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content=""
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText(/0 words/)).toBeTruthy()
    // Math.max(1, ceil(0/200)) = max(1, 0) = 1... but wait, the impl
    // short-circuits to { words: 0, readingTime: '0 min' } for empty content.
    expect(screen.getByText('0 min read')).toBeTruthy()
  })
})

describe('DocumentProperties — outbound links (DOC-4.9-04, 4.9-05, 4.9-07)', () => {
  it('DOC-4.9-04: lists each outbound link target', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[{ target: 'notes/a.md' }, { target: 'notes/b.md' }]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('notes/a.md')).toBeTruthy()
    expect(screen.getByText('notes/b.md')).toBeTruthy()
  })

  it('DOC-4.9-05: shows #section suffix when present', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[{ target: 'notes/a.md', section: 'intro' }]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('notes/a.md#intro')).toBeTruthy()
  })

  it('DOC-4.9-07: clicking outbound link calls onNavigateLink with target path', () => {
    const navigate = vi.fn()
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[{ target: 'notes/a.md' }]}
        backlinks={[]}
        onNavigateLink={navigate}
      />,
    )
    fireEvent.click(screen.getByText('notes/a.md'))
    expect(navigate).toHaveBeenCalledWith('notes/a.md')
  })

  it('shows "No outbound links" when outbound list is empty', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('No outbound links')).toBeTruthy()
  })

  it('shows link count header e.g. "Links (2)"', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[{ target: 'a.md' }, { target: 'b.md' }]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('Links (2)')).toBeTruthy()
  })
})

describe('DocumentProperties — backlinks (DOC-4.9-06, 4.9-08)', () => {
  it('DOC-4.9-06: lists each backlink sourcePath', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[{ sourcePath: 'notes/parent.md' }, { sourcePath: 'notes/ref.md' }]}
      />,
    )
    expect(screen.getByText('notes/parent.md')).toBeTruthy()
    expect(screen.getByText('notes/ref.md')).toBeTruthy()
  })

  it('DOC-4.9-08: clicking a backlink calls onNavigateLink with source path', () => {
    const navigate = vi.fn()
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[{ sourcePath: 'notes/parent.md' }]}
        onNavigateLink={navigate}
      />,
    )
    fireEvent.click(screen.getByText('notes/parent.md'))
    expect(navigate).toHaveBeenCalledWith('notes/parent.md')
  })

  it('shows "No backlinks" when backlinks list is empty', () => {
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('No backlinks')).toBeTruthy()
  })
})

describe('DocumentProperties — collapsed state (DOC-4.9-10)', () => {
  it('DOC-4.9-10: collapsed=true renders a 36px-wide panel', () => {
    const { container } = render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[]}
        collapsed
      />,
    )
    const panel = container.firstChild as HTMLElement
    expect(panel.style.width).toBe('36px')
  })

  it('collapsed panel exposes a toggle button', () => {
    const toggle = vi.fn()
    render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[]}
        collapsed
        onToggleCollapse={toggle}
      />,
    )
    const btn = screen.getByRole('button', { name: 'Expand properties' })
    fireEvent.click(btn)
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('non-collapsed panel is 280px wide', () => {
    const { container } = render(
      <DocumentProperties
        filePath="notes/test.md"
        content="x"
        outbound={[]}
        backlinks={[]}
      />,
    )
    const panel = container.firstChild as HTMLElement
    expect(panel.style.width).toBe('280px')
  })
})

describe('DocumentProperties — null filePath', () => {
  it('renders "No document selected" when filePath is null', () => {
    render(
      <DocumentProperties filePath={null} content="" outbound={null} backlinks={[]} />,
    )
    expect(screen.getByText('No document selected')).toBeTruthy()
  })

  it('renders filename in header when filePath has a path', () => {
    render(
      <DocumentProperties
        filePath="notes/design.md"
        content="x"
        outbound={[]}
        backlinks={[]}
      />,
    )
    expect(screen.getByText('design.md')).toBeTruthy()
  })
})
