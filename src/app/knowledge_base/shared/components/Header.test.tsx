import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from './Header'

// Covers SHELL-1.2-18/19 (split toggle) + SHELL-1.12 dirty-stack indicator
// (Phase 2 PR 2). Title editing, dirty dot, Save, and Discard moved into
// each pane's `PaneHeader` row when the shell header was stripped — see
// PaneHeader.test.tsx for SHELL-1.2-02..13 coverage.

describe('Header — split view toggle', () => {
  it('split toggle is not rendered when onToggleSplit is omitted', () => {
    render(<Header />)
    expect(screen.queryByTitle(/Split view|Exit split view/)).toBeNull()
  })

  it('split toggle renders when onToggleSplit is provided (isSplit=false)', () => {
    render(<Header onToggleSplit={() => {}} isSplit={false} />)
    expect(screen.getByTitle('Split view')).toBeTruthy()
  })

  it('title changes to "Exit split view" when isSplit=true', () => {
    render(<Header onToggleSplit={() => {}} isSplit />)
    expect(screen.getByTitle('Exit split view')).toBeTruthy()
  })

  it('SHELL-1.2-18/19: clicking split toggle fires onToggleSplit', () => {
    const onToggleSplit = vi.fn()
    render(<Header onToggleSplit={onToggleSplit} />)
    fireEvent.click(screen.getByTitle('Split view'))
    expect(onToggleSplit).toHaveBeenCalledTimes(1)
  })
})

describe('Header — dirty-stack indicator', () => {
  it('SHELL-1.12-04: shows "1 unsaved" when one file is dirty', () => {
    render(<Header dirtyFiles={new Set(['notes/draft.md'])} />)
    const badge = screen.getByTestId('dirty-stack-indicator')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toContain('1 unsaved')
  })

  it('shows count for multiple dirty files', () => {
    render(<Header dirtyFiles={new Set(['a.md', 'b.md', 'c.md'])} />)
    expect(screen.getByTestId('dirty-stack-indicator').textContent).toContain('3 unsaved')
  })

  it('SHELL-1.12-05: hidden when no files are dirty', () => {
    render(<Header dirtyFiles={new Set()} />)
    expect(screen.queryByTestId('dirty-stack-indicator')).toBeNull()
  })

  it('hidden when dirtyFiles prop is omitted', () => {
    render(<Header />)
    expect(screen.queryByTestId('dirty-stack-indicator')).toBeNull()
  })

  it('tooltip lists every dirty file path', () => {
    render(<Header dirtyFiles={new Set(['a.md', 'b.md'])} />)
    const badge = screen.getByTestId('dirty-stack-indicator')
    const title = badge.getAttribute('title') ?? ''
    expect(title).toContain('a.md')
    expect(title).toContain('b.md')
  })

  it('SHELL-1.12-09: dirty-stack wrapper is a polite status live region', () => {
    // Wrapper present even when count is 0 so screen readers announce the
    // 0→N transition. KB-035.
    const { rerender } = render(<Header />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region.textContent).toBe('')

    rerender(<Header dirtyFiles={new Set(['a.md'])} />)
    expect(screen.getByRole('status').textContent).toBe('1 unsaved')
  })
})
