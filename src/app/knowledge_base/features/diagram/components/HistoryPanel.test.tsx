import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})
import HistoryPanel from './HistoryPanel'
import type { HistoryEntry } from '../../../shared/hooks/useActionHistory'

// Covers DIAG-3.16-10 (lists entries) and DIAG-3.16-11 (click reverts).

const snapshot = { nodes: [], connections: [], layerDefs: [], flows: [] } as unknown as HistoryEntry['snapshot']

function makeEntries(n: number): HistoryEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    description: `Action ${i}`,
    timestamp: Date.now() - i * 1000,
    snapshot,
  }))
}

function baseProps(overrides: Partial<React.ComponentProps<typeof HistoryPanel>> = {}) {
  return {
    entries: [],
    currentIndex: 0,
    savedIndex: 0,
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onGoToEntry: vi.fn(),
    collapsed: false,
    onToggleCollapse: vi.fn(),
    ...overrides,
  } satisfies React.ComponentProps<typeof HistoryPanel>
}

// ── DIAG-3.16-10: lists entries ───────────────────────────────────────────────

describe('DIAG-3.16-10: HistoryPanel lists entries', () => {
  it('shows "No history yet" when entries is empty', () => {
    render(<HistoryPanel {...baseProps()} />)
    expect(screen.getByText('No history yet')).toBeTruthy()
  })

  it('renders one button per entry', () => {
    const entries = makeEntries(3)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 2, savedIndex: 0 })} />)
    expect(screen.getByText('Action 0')).toBeTruthy()
    expect(screen.getByText('Action 1')).toBeTruthy()
    expect(screen.getByText('Action 2')).toBeTruthy()
  })

  it('shows counter badge when there are multiple entries', () => {
    const entries = makeEntries(3)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 1, savedIndex: 0 })} />)
    expect(screen.getByText('2/3')).toBeTruthy()
  })

  it('marks the saved entry with a "saved" badge', () => {
    const entries = makeEntries(2)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 1, savedIndex: 0 })} />)
    expect(screen.getByText('saved')).toBeTruthy()
  })

  it('hides entry list when collapsed', () => {
    const entries = makeEntries(2)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 1, savedIndex: 0, collapsed: true })} />)
    expect(screen.queryByText('Action 0')).toBeNull()
    expect(screen.queryByText('Action 1')).toBeNull()
  })

  it('disables Undo when canUndo=false', () => {
    render(<HistoryPanel {...baseProps({ canUndo: false })} />)
    const undo = screen.getByTitle('Undo (Cmd+Z)')
    expect((undo as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Undo when canUndo=true', () => {
    render(<HistoryPanel {...baseProps({ canUndo: true, onUndo: vi.fn() })} />)
    const undo = screen.getByTitle('Undo (Cmd+Z)')
    expect((undo as HTMLButtonElement).disabled).toBe(false)
  })
})

// ── DIAG-3.16-11: click reverts ───────────────────────────────────────────────

describe('DIAG-3.16-11: HistoryPanel click reverts to entry', () => {
  it('clicking an entry button calls onGoToEntry with its index', () => {
    const onGoToEntry = vi.fn()
    const entries = makeEntries(3)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 2, savedIndex: 0, onGoToEntry })} />)
    // entries are rendered newest-first (reversed), so "Action 0" is the oldest
    // and corresponds to index 0 in the original array
    fireEvent.click(screen.getByText('Action 0'))
    expect(onGoToEntry).toHaveBeenCalledWith(0)
  })

  it('clicking Undo button calls onUndo', () => {
    const onUndo = vi.fn()
    const entries = makeEntries(2)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 1, savedIndex: 0, canUndo: true, onUndo })} />)
    fireEvent.click(screen.getByTitle('Undo (Cmd+Z)'))
    expect(onUndo).toHaveBeenCalledTimes(1)
  })

  it('clicking Redo button calls onRedo', () => {
    const onRedo = vi.fn()
    const entries = makeEntries(2)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 0, savedIndex: 0, canRedo: true, onRedo })} />)
    fireEvent.click(screen.getByTitle('Redo (Cmd+Shift+Z)'))
    expect(onRedo).toHaveBeenCalledTimes(1)
  })

  it('entry buttons are disabled in readOnly mode', () => {
    const onGoToEntry = vi.fn()
    const entries = makeEntries(2)
    render(<HistoryPanel {...baseProps({ entries, currentIndex: 1, savedIndex: 0, onGoToEntry, readOnly: true })} />)
    const btn = screen.getByText('Action 0').closest('button')!
    expect((btn as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(btn)
    expect(onGoToEntry).not.toHaveBeenCalled()
  })
})
