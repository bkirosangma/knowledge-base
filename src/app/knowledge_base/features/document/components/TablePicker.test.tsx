// Covers DOC-4.5-20..23 (TablePicker grid rendering, hover label, selection, disabled state).
// Note: TBtn uses onMouseDown+preventDefault to avoid focus loss, so we use
// fireEvent.mouseDown on the toggle button rather than fireEvent.click.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import TablePicker from './TablePicker'

function openPicker(container: HTMLElement) {
  fireEvent.mouseDown(container.querySelector('button')!)
}

// ── DOC-4.5-20: shows 8×8 grid ───────────────────────────────────────────────

describe('DOC-4.5-20: TablePicker shows 8×8 grid when opened', () => {
  it('grid is hidden before the button is clicked', () => {
    render(<TablePicker onSelect={() => {}} />)
    expect(screen.queryByText('Select size')).toBeNull()
  })

  it('renders 64 cells (8 × 8) after opening', () => {
    const { container } = render(<TablePicker onSelect={() => {}} />)
    openPicker(container)
    const grid = container.querySelector('.grid')!
    expect(grid.children).toHaveLength(64)
  })
})

// ── DOC-4.5-21: hovering shows "N × M table" label ───────────────────────────

describe('DOC-4.5-21: hover shows N × M table label', () => {
  it('shows "Select size" label when no cell is hovered', () => {
    const { container } = render(<TablePicker onSelect={() => {}} />)
    openPicker(container)
    expect(screen.getByText('Select size')).toBeTruthy()
  })

  it('updates label to "2 × 3 table" when hovering row=1 col=2 (0-indexed)', () => {
    const { container } = render(<TablePicker onSelect={() => {}} />)
    openPicker(container)
    // Cell at row=1, col=2 is index (1*8 + 2) = 10
    const cells = container.querySelectorAll('.grid > div')
    fireEvent.mouseEnter(cells[10])
    expect(screen.getByText('2 × 3 table')).toBeTruthy()
  })

  it('resets label to "Select size" when mouse leaves the grid', () => {
    const { container } = render(<TablePicker onSelect={() => {}} />)
    openPicker(container)
    const cells = container.querySelectorAll('.grid > div')
    fireEvent.mouseEnter(cells[0])
    fireEvent.mouseLeave(container.querySelector('.grid')!)
    expect(screen.getByText('Select size')).toBeTruthy()
  })
})

// ── DOC-4.5-22: click inserts table ──────────────────────────────────────────

describe('DOC-4.5-22: clicking a cell calls onSelect with correct dimensions', () => {
  it('mouseDown on first cell calls onSelect(1, 1)', () => {
    const onSelect = vi.fn()
    const { container } = render(<TablePicker onSelect={onSelect} />)
    openPicker(container)
    const cells = container.querySelectorAll('.grid > div')
    fireEvent.mouseDown(cells[0])
    expect(onSelect).toHaveBeenCalledWith(1, 1)
  })

  it('mouseDown on row=2 col=3 (index 19) calls onSelect(3, 4)', () => {
    const onSelect = vi.fn()
    const { container } = render(<TablePicker onSelect={onSelect} />)
    openPicker(container)
    const cells = container.querySelectorAll('.grid > div')
    fireEvent.mouseDown(cells[19]) // row=2 (2*8=16), col=3 → index 19
    expect(onSelect).toHaveBeenCalledWith(3, 4)
  })

  it('closes the popover after selection', () => {
    const { container } = render(<TablePicker onSelect={() => {}} />)
    openPicker(container)
    const cells = container.querySelectorAll('.grid > div')
    fireEvent.mouseDown(cells[0])
    expect(screen.queryByText('Select size')).toBeNull()
  })
})

// ── DOC-4.5-23: disabled state ───────────────────────────────────────────────

describe('DOC-4.5-23: table picker disabled when cursor is in a table', () => {
  it('clicking the disabled button does not open the picker', () => {
    const { container } = render(<TablePicker onSelect={() => {}} disabled />)
    // Simulate mouseDown on the disabled button (which has the disabled HTML attr)
    // The underlying <button disabled> will not fire the handler in real browsers;
    // in jsdom we test that the onClick guard in TablePicker prevents opening.
    fireEvent.mouseDown(container.querySelector('button')!)
    expect(screen.queryByText('Select size')).toBeNull()
  })

  it('auto-closes the popover when disabled becomes true while open', () => {
    const { container, rerender } = render(<TablePicker onSelect={() => {}} disabled={false} />)
    openPicker(container)
    expect(screen.getByText('Select size')).toBeTruthy()
    rerender(<TablePicker onSelect={() => {}} disabled={true} />)
    expect(screen.queryByText('Select size')).toBeNull()
  })
})
