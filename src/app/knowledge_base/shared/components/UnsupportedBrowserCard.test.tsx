import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import UnsupportedBrowserCard from './UnsupportedBrowserCard'

// KB-001: full-pane fallback shown when window.showDirectoryPicker is absent
// (Firefox/Safari). Replaces the previous hidden file <input> fallback that
// could read but never write.

describe('UnsupportedBrowserCard', () => {
  it('renders the headline naming the missing API', () => {
    render(<UnsupportedBrowserCard />)
    expect(
      screen.getByRole('heading', {
        name: /Knowledge Base needs the File System Access API\./i,
      }),
    ).toBeTruthy()
  })

  it('lists every supported browser', () => {
    render(<UnsupportedBrowserCard />)
    const body = screen.getByRole('alert')
    for (const name of ['Chrome', 'Edge', 'Brave', 'Arc', 'Opera']) {
      expect(body.textContent).toContain(name)
    }
  })

  it('exposes itself to assistive tech as a polite live alert', () => {
    render(<UnsupportedBrowserCard />)
    const card = screen.getByRole('alert')
    expect(card.getAttribute('aria-live')).toBe('polite')
  })
})
