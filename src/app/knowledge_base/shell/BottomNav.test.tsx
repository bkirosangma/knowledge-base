import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BottomNav from './BottomNav'

// Covers SHELL-1.14-09..11. See test-cases/01-app-shell.md §1.14.

describe('BottomNav', () => {
  it('SHELL-1.14-09: renders 3 tabs (files, read, graph) with testids', () => {
    render(<BottomNav active="files" onChange={() => {}} />)
    expect(screen.getByTestId('bottom-nav-files')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-read')).toBeInTheDocument()
    expect(screen.getByTestId('bottom-nav-graph')).toBeInTheDocument()
  })

  it('SHELL-1.14-10: active tab has aria-selected="true"; others "false"', () => {
    render(<BottomNav active="read" onChange={() => {}} />)
    expect(screen.getByTestId('bottom-nav-files')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('bottom-nav-read')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('bottom-nav-graph')).toHaveAttribute('aria-selected', 'false')
  })

  it('SHELL-1.14-11: clicking a tab fires onChange with that tab id', () => {
    const onChange = vi.fn()
    render(<BottomNav active="files" onChange={onChange} />)
    fireEvent.click(screen.getByTestId('bottom-nav-graph'))
    expect(onChange).toHaveBeenCalledWith('graph')
  })

  it('exposes accessible labels on each tab', () => {
    render(<BottomNav active="files" onChange={() => {}} />)
    expect(screen.getByLabelText('Files tab')).toBeInTheDocument()
    expect(screen.getByLabelText('Read tab')).toBeInTheDocument()
    expect(screen.getByLabelText('Graph tab')).toBeInTheDocument()
  })
})
