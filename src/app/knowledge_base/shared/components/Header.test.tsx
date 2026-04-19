import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Header from './Header'

// Covers SHELL-1.2-18/19 (split toggle). Title editing, dirty dot, Save, and
// Discard moved into `PaneTitle` when the shell header was stripped — see
// PaneTitle.test.tsx for SHELL-1.2-02..13 coverage. Back-link (1.2-01) is
// deferred to Playwright.

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
