import { describe, it, expect } from 'vitest'
import { snapToGrid, GRID_SIZE } from './gridSnap'

describe('snapToGrid', () => {
  it('snaps a value to the nearest grid multiple', () => {
    expect(snapToGrid(14)).toBe(10)
    expect(snapToGrid(15)).toBe(20)
    expect(snapToGrid(20)).toBe(20)
  })

  it('uses GRID_SIZE as the default step', () => {
    expect(snapToGrid(3)).toBe(0)
  })

  it('accepts a custom grid size', () => {
    expect(snapToGrid(7, 5)).toBe(5)
    expect(snapToGrid(8, 5)).toBe(10)
  })

  it('handles negative values', () => {
    expect(snapToGrid(-14)).toBe(-10)
    expect(snapToGrid(-15)).toBe(-10)
    expect(snapToGrid(-16)).toBe(-20)
  })

  it('returns zero for zero input', () => {
    expect(snapToGrid(0)).toBe(0)
  })
})
