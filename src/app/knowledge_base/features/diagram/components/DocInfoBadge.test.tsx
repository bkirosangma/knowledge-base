import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DocInfoBadge from './DocInfoBadge'

// Covers parts of FS-2.5 + SHELL-1.2 doc-info badge behaviour.

describe('DocInfoBadge', () => {
  it('renders nothing when documentPaths is empty', () => {
    const { container } = render(
      <DocInfoBadge
        color="#00ff00"
        position={{ x: 10, y: 20 }}
        documentPaths={[]}
        onNavigate={() => {}}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a circular badge with the configured color', () => {
    const { container } = render(
      <DocInfoBadge
        color="#ff0000"
        position={{ x: 50, y: 60 }}
        documentPaths={['a.md']}
        onNavigate={() => {}}
      />,
    )
    const circle = container.querySelector('div[title]') as HTMLDivElement
    expect(circle).not.toBeNull()
    expect(circle.style.backgroundColor).toMatch(/rgb\(255,\s*0,\s*0\)|#ff0000/)
  })

  it('positions the wrapper via absolute left/top', () => {
    const { container } = render(
      <DocInfoBadge
        color="#000"
        position={{ x: 42, y: 84 }}
        documentPaths={['a.md']}
        onNavigate={() => {}}
      />,
    )
    const wrapper = container.firstChild as HTMLDivElement
    expect(wrapper.style.left).toBe('42px')
    expect(wrapper.style.top).toBe('84px')
  })

  it('single document: clicking the badge calls onNavigate with that path (no dropdown)', () => {
    const onNavigate = vi.fn()
    render(
      <DocInfoBadge
        color="#000"
        position={{ x: 0, y: 0 }}
        documentPaths={['docs/solo.md']}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(screen.getByTitle('Open docs/solo.md'))
    expect(onNavigate).toHaveBeenCalledWith('docs/solo.md')
  })

  it('multiple documents: badge title summarises count', () => {
    render(
      <DocInfoBadge
        color="#000"
        position={{ x: 0, y: 0 }}
        documentPaths={['a.md', 'b.md', 'c.md']}
        onNavigate={() => {}}
      />,
    )
    expect(screen.getByTitle('3 documents')).toBeTruthy()
  })

  it('multiple documents: badge click toggles a dropdown with all paths by basename', () => {
    render(
      <DocInfoBadge
        color="#000"
        position={{ x: 0, y: 0 }}
        documentPaths={['docs/alpha.md', 'notes/beta.md']}
        onNavigate={() => {}}
      />,
    )
    fireEvent.click(screen.getByTitle('2 documents'))
    expect(screen.getByRole('button', { name: 'alpha.md' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'beta.md' })).toBeTruthy()
  })

  it('dropdown entry click triggers onNavigate and closes the menu', () => {
    const onNavigate = vi.fn()
    render(
      <DocInfoBadge
        color="#000"
        position={{ x: 0, y: 0 }}
        documentPaths={['a.md', 'b.md']}
        onNavigate={onNavigate}
      />,
    )
    fireEvent.click(screen.getByTitle('2 documents'))
    fireEvent.click(screen.getByRole('button', { name: 'b.md' }))
    expect(onNavigate).toHaveBeenCalledWith('b.md')
    // Dropdown closes after navigation.
    expect(screen.queryByRole('button', { name: 'a.md' })).toBeNull()
  })

  it('second click on the badge toggles the dropdown closed', () => {
    render(
      <DocInfoBadge
        color="#000"
        position={{ x: 0, y: 0 }}
        documentPaths={['a.md', 'b.md']}
        onNavigate={() => {}}
      />,
    )
    const badge = screen.getByTitle('2 documents')
    fireEvent.click(badge)
    expect(screen.getByRole('button', { name: 'a.md' })).toBeTruthy()
    fireEvent.click(badge)
    expect(screen.queryByRole('button', { name: 'a.md' })).toBeNull()
  })
})
