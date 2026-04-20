import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LineProperties } from './LineProperties'
import type { Connection, NodeData } from '../types'
import { Database } from 'lucide-react'

// Covers DIAG-3.13-24..30 (LineProperties label, colour, bidir toggle,
// conn-type toggle, flow-duration input, source/dest display).

const conn: Connection = {
  id: 'c1',
  from: 'n1',
  to: 'n2',
  fromAnchor: 'right',
  toAnchor: 'left',
  color: '#3b82f6',
  label: 'calls',
  biDirectional: false,
  flowDuration: 2.5,
  connectionType: 'synchronous',
}

const nodes: NodeData[] = [
  { id: 'n1', label: 'Auth Service', icon: Database as unknown as NodeData['icon'], x: 0, y: 0, w: 150, layer: '' },
  { id: 'n2', label: 'User DB',      icon: Database as unknown as NodeData['icon'], x: 200, y: 0, w: 150, layer: '' },
]

function base(overrides: Partial<React.ComponentProps<typeof LineProperties>> = {}) {
  return {
    id: 'c1',
    connections: [conn],
    nodes,
    allConnectionIds: ['c1'],
    ...overrides,
  } as React.ComponentProps<typeof LineProperties>
}

// ── DIAG-3.13-24: label edit ──────────────────────────────────────────────────

describe('DIAG-3.13-24: LineProperties — label edit', () => {
  it('double-clicking the Label row opens an input', () => {
    render(<LineProperties {...base()} />)
    const labelRow = screen.getByText('calls').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(labelRow)
    const input = screen.getByRole('textbox')
    expect((input as HTMLInputElement).value).toBe('calls')
  })

  it('Enter commits new label via onUpdate', () => {
    const onUpdate = vi.fn()
    render(<LineProperties {...base({ onUpdate })} />)
    const labelRow = screen.getByText('calls').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(labelRow)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'invokes' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('c1', { label: 'invokes' })
  })
})

// ── DIAG-3.13-25: colour display ──────────────────────────────────────────────

describe('DIAG-3.13-25: LineProperties — colour display', () => {
  it('renders a color input swatch with the connection colour', () => {
    const { container } = render(<LineProperties {...base()} />)
    const colorInput = container.querySelector('input[type="color"]')!
    expect((colorInput as HTMLInputElement).value).toBe('#3b82f6')
  })
})

// ── DIAG-3.13-27: bidirectional toggle ───────────────────────────────────────

describe('DIAG-3.13-27: LineProperties — bidirectional toggle', () => {
  it('clicking the toggle calls onUpdate with biDirectional=true when off', () => {
    const onUpdate = vi.fn()
    render(<LineProperties {...base({ onUpdate })} />)
    // The toggle button is the rounded-full div; find by its parent label text
    const toggleBtn = screen.getByText('Bi-directional').closest('div')!.querySelector('button')!
    fireEvent.click(toggleBtn)
    expect(onUpdate).toHaveBeenCalledWith('c1', { biDirectional: true })
  })

  it('clicking again when biDirectional=true calls onUpdate with false', () => {
    const onUpdate = vi.fn()
    const biConn = { ...conn, biDirectional: true }
    render(<LineProperties {...base({ connections: [biConn], onUpdate })} />)
    const toggleBtn = screen.getByText('Bi-directional').closest('div')!.querySelector('button')!
    fireEvent.click(toggleBtn)
    expect(onUpdate).toHaveBeenCalledWith('c1', { biDirectional: false })
  })
})

// ── DIAG-3.13-28: connection type toggle ─────────────────────────────────────

describe('DIAG-3.13-28: LineProperties — connection type sync/async', () => {
  it('"Sync" button is active by default (connectionType = synchronous)', () => {
    render(<LineProperties {...base()} />)
    const syncBtn = screen.getByRole('button', { name: 'Sync' })
    expect(syncBtn.className).toMatch(/bg-blue-100/)
  })

  it('clicking "Async" calls onUpdate with connectionType=asynchronous', () => {
    const onUpdate = vi.fn()
    render(<LineProperties {...base({ onUpdate })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Async' }))
    expect(onUpdate).toHaveBeenCalledWith('c1', { connectionType: 'asynchronous' })
  })

  it('"Async" button is active when connectionType=asynchronous', () => {
    const asyncConn = { ...conn, connectionType: 'asynchronous' as const }
    render(<LineProperties {...base({ connections: [asyncConn] })} />)
    const asyncBtn = screen.getByRole('button', { name: 'Async' })
    expect(asyncBtn.className).toMatch(/bg-blue-100/)
  })
})

// ── DIAG-3.13-29: flow duration input ────────────────────────────────────────

describe('DIAG-3.13-29: LineProperties — flow duration input', () => {
  it('displays the current flowDuration value in seconds', () => {
    render(<LineProperties {...base()} />)
    expect(screen.getByText('2.5s')).toBeTruthy()
  })

  it('double-clicking opens a number input', () => {
    render(<LineProperties {...base()} />)
    const durRow = screen.getByText('2.5s').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(durRow)
    expect(screen.getByRole('spinbutton')).toBeTruthy()
  })

  it('Enter commits new duration via onUpdate', () => {
    const onUpdate = vi.fn()
    render(<LineProperties {...base({ onUpdate })} />)
    const durRow = screen.getByText('2.5s').closest('[class*="cursor-text"]')!
    fireEvent.doubleClick(durRow)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onUpdate).toHaveBeenCalledWith('c1', { flowDuration: 5 })
  })
})

// ── DIAG-3.13-30: source / dest displayed ────────────────────────────────────

describe('DIAG-3.13-30: LineProperties — source and destination display', () => {
  it('shows the From node label', () => {
    render(<LineProperties {...base()} />)
    expect(screen.getByText('Auth Service')).toBeTruthy()
  })

  it('shows the To node label', () => {
    render(<LineProperties {...base()} />)
    expect(screen.getByText('User DB')).toBeTruthy()
  })

  it('falls back to node ID when node is not in nodes array', () => {
    render(<LineProperties {...base({ nodes: [] })} />)
    expect(screen.getByText('n1')).toBeTruthy()
    expect(screen.getByText('n2')).toBeTruthy()
  })
})
