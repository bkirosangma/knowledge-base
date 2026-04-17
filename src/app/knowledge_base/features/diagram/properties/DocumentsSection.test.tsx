import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocumentsSection from './DocumentsSection'

// Covers DIAG-3.13-18/38 (backlinks list) and DIAG-3.13-40 (click-to-open).

describe('DocumentsSection', () => {
  it('shows empty-state text when backlinks list is empty', () => {
    render(<DocumentsSection backlinks={[]} />)
    expect(screen.getByText('No documents reference this diagram')).toBeTruthy()
  })

  it('title omits the count parenthetical when list is empty', () => {
    render(<DocumentsSection backlinks={[]} />)
    // Section header is "References" (no "(0)")
    expect(screen.getByText('References')).toBeTruthy()
    expect(screen.queryByText(/References \(0\)/)).toBeNull()
  })

  it('renders every backlink using the filename basename', () => {
    render(
      <DocumentsSection
        backlinks={[
          { sourcePath: 'docs/alpha.md' },
          { sourcePath: 'notes/beta.md' },
        ]}
      />,
    )
    expect(screen.getByText('alpha.md')).toBeTruthy()
    expect(screen.getByText('beta.md')).toBeTruthy()
  })

  it('section title includes the count', () => {
    render(
      <DocumentsSection
        backlinks={[
          { sourcePath: 'a.md' },
          { sourcePath: 'b.md' },
        ]}
      />,
    )
    expect(screen.getByText('References (2)')).toBeTruthy()
  })

  it('entries with a section append " #section" to the label', () => {
    render(
      <DocumentsSection
        backlinks={[{ sourcePath: 'docs/a.md', section: 'intro' }]}
      />,
    )
    expect(screen.getByText('a.md #intro')).toBeTruthy()
  })

  it('clicking a backlink fires onOpenDocument with the full sourcePath', () => {
    const onOpenDocument = vi.fn()
    render(
      <DocumentsSection
        backlinks={[{ sourcePath: 'deep/nested/doc.md' }]}
        onOpenDocument={onOpenDocument}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'doc.md' }))
    expect(onOpenDocument).toHaveBeenCalledWith('deep/nested/doc.md')
  })

  it('click does not throw when onOpenDocument is not provided', () => {
    render(
      <DocumentsSection
        backlinks={[{ sourcePath: 'x.md' }]}
      />,
    )
    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'x.md' }))
    }).not.toThrow()
  })

  it('de-dupes by path#section key so repeated backlinks don\'t crash React', () => {
    // Two backlinks from the same source+section would collide on key.
    // This test ensures our key format path#section gives each entry a
    // unique slot; repeated entries just render both rows.
    const { container } = render(
      <DocumentsSection
        backlinks={[
          { sourcePath: 'a.md', section: 's' },
          { sourcePath: 'a.md', section: 't' },
        ]}
      />,
    )
    const rows = container.querySelectorAll('.bg-slate-50')
    expect(rows.length).toBe(2)
  })

  it('renders the wiki-link help text under the list', () => {
    const { container } = render(<DocumentsSection backlinks={[]} />)
    // Help text contains "[[wiki-links]]" inside a <code> element.
    expect(container.querySelector('code')?.textContent).toBe('[[wiki-links]]')
  })
})
