import { describe, it, expect } from 'vitest'
import { Database } from 'lucide-react'
import type { NodeData, Selection } from '../types'
import {
  isItemSelected,
  toggleItemInSelection,
  resolveRectangleSelection,
  toggleRectangleSelection,
} from './selectionUtils'

// Covers DIAG-3.11-01..07 and 3.11-09 at the logic layer.
// DIAG-3.11-08 (25 px drag threshold) lives in the canvas interaction code and
// is verified by Playwright (Bucket 25) since it needs real pointer events.

const node = (id: string, layer: string, x = 0, y = 0): NodeData => ({
  id, label: id, layer, x, y, w: 100, icon: Database,
})

// ── isItemSelected ─────────────────────────────────────────────────────────

describe('isItemSelected', () => {
  it('DIAG-3.11-01/02/03: matches single-kind selection by type + id', () => {
    expect(isItemSelected({ type: 'node', id: 'n1' }, 'node', 'n1')).toBe(true)
    expect(isItemSelected({ type: 'layer', id: 'L1' }, 'layer', 'L1')).toBe(true)
    expect(isItemSelected({ type: 'line', id: 'l1' }, 'line', 'l1')).toBe(true)
  })

  it('returns false for mismatched type or id', () => {
    expect(isItemSelected({ type: 'node', id: 'n1' }, 'node', 'n2')).toBe(false)
    expect(isItemSelected({ type: 'node', id: 'n1' }, 'layer', 'n1')).toBe(false)
  })

  it('matches multi-node when id is in the set', () => {
    const sel: Selection = { type: 'multi-node', ids: ['a', 'b', 'c'], layer: 'L' }
    expect(isItemSelected(sel, 'node', 'b')).toBe(true)
    expect(isItemSelected(sel, 'node', 'z')).toBe(false)
  })

  it('multi-layer / multi-line follow the same rule', () => {
    expect(isItemSelected({ type: 'multi-layer', ids: ['L1', 'L2'] }, 'layer', 'L2')).toBe(true)
    expect(isItemSelected({ type: 'multi-line', ids: ['l1', 'l2'] }, 'line', 'l1')).toBe(true)
  })

  it('null selection is never selected', () => {
    expect(isItemSelected(null, 'node', 'anything')).toBe(false)
  })
})

// ── toggleItemInSelection ──────────────────────────────────────────────────

const nodes = [
  node('n1', 'L1'),
  node('n2', 'L1'),
  node('n3', 'L2'),
]

describe('toggleItemInSelection — single-kind behaviour', () => {
  it('DIAG-3.11-01: empty selection → single-select', () => {
    expect(toggleItemInSelection(null, { type: 'node', id: 'n1' }, nodes))
      .toEqual({ type: 'node', id: 'n1' })
  })

  it('DIAG-3.11-05: clicking the same item toggles off to null', () => {
    expect(toggleItemInSelection({ type: 'node', id: 'n1' }, { type: 'node', id: 'n1' }, nodes))
      .toBeNull()
  })
})

describe('toggleItemInSelection — node add-to-selection (DIAG-3.11-04)', () => {
  it('two nodes in the same layer → multi-node tagged with that layer', () => {
    const result = toggleItemInSelection(
      { type: 'node', id: 'n1' },
      { type: 'node', id: 'n2' },
      nodes,
    )
    expect(result).toEqual({ type: 'multi-node', ids: ['n1', 'n2'], layer: 'L1' })
  })

  it('two nodes in DIFFERENT layers → promote to multi-layer', () => {
    const result = toggleItemInSelection(
      { type: 'node', id: 'n1' },
      { type: 'node', id: 'n3' }, // different layer
      nodes,
    )
    expect(result).toEqual({ type: 'multi-layer', ids: ['L1', 'L2'] })
  })

  it('DIAG-3.11-05: removing a node from multi-node collapses to single when only one remains', () => {
    const current: Selection = { type: 'multi-node', ids: ['n1', 'n2'], layer: 'L1' }
    const result = toggleItemInSelection(current, { type: 'node', id: 'n2' }, nodes)
    expect(result).toEqual({ type: 'node', id: 'n1' })
  })
})

describe('toggleItemInSelection — layers + lines', () => {
  it('second layer click → multi-layer', () => {
    expect(toggleItemInSelection(
      { type: 'layer', id: 'L1' },
      { type: 'layer', id: 'L2' },
      nodes,
    )).toEqual({ type: 'multi-layer', ids: ['L1', 'L2'] })
  })

  it('multi-layer minus one → single layer', () => {
    const result = toggleItemInSelection(
      { type: 'multi-layer', ids: ['L1', 'L2'] },
      { type: 'layer', id: 'L2' },
      nodes,
    )
    expect(result).toEqual({ type: 'layer', id: 'L1' })
  })

  it('two line clicks → multi-line', () => {
    expect(toggleItemInSelection(
      { type: 'line', id: 'l1' },
      { type: 'line', id: 'l2' },
      nodes,
    )).toEqual({ type: 'multi-line', ids: ['l1', 'l2'] })
  })

  it('incompatible types (line added to node selection) → switch to fresh line selection', () => {
    expect(toggleItemInSelection(
      { type: 'node', id: 'n1' },
      { type: 'line', id: 'l1' },
      nodes,
    )).toEqual({ type: 'line', id: 'l1' })
  })
})

// ── resolveRectangleSelection (DIAG-3.11-06, 3.11-07) ──────────────────────

describe('resolveRectangleSelection (DIAG-3.11-06, 3.11-07)', () => {
  const dims = () => ({ w: 100, h: 80 })

  it('DIAG-3.11-06: rect covering N nodes in one layer → multi-node', () => {
    const regions = [{ id: 'L1', left: -50, top: -50, width: 500, height: 500 }]
    const result = resolveRectangleSelection(
      { x: -200, y: -200, w: 600, h: 600 },
      [node('n1', 'L1', 0, 0), node('n2', 'L1', 200, 0)],
      regions,
      dims,
    )
    expect(result).toEqual({ type: 'multi-node', ids: ['n1', 'n2'], layer: 'L1' })
  })

  it('single node in rect → single-node selection', () => {
    const regions = [{ id: 'L1', left: -50, top: -50, width: 500, height: 500 }]
    const result = resolveRectangleSelection(
      { x: -10, y: -10, w: 50, h: 50 },
      [node('n1', 'L1', 0, 0), node('n2', 'L1', 400, 0)],
      regions,
      dims,
    )
    expect(result).toEqual({ type: 'node', id: 'n1' })
  })

  it('rect covering multiple layers → multi-layer', () => {
    const regions = [
      { id: 'L1', left: 0, top: 0, width: 100, height: 100 },
      { id: 'L2', left: 200, top: 0, width: 100, height: 100 },
    ]
    const result = resolveRectangleSelection(
      { x: -50, y: -50, w: 400, h: 200 },
      [],
      regions,
      dims,
    )
    expect(result).toEqual({ type: 'multi-layer', ids: ['L1', 'L2'] })
  })

  it('rect covering nodes in DIFFERENT layers → multi-layer promotion', () => {
    const regions = [{ id: 'L1', left: -50, top: -50, width: 500, height: 500 }]
    const result = resolveRectangleSelection(
      { x: -100, y: -100, w: 500, h: 500 },
      [node('n1', 'L1', 0, 0), node('n2', 'L2', 200, 0)],
      regions,
      dims,
    )
    expect(result).toEqual({ type: 'multi-layer', ids: ['L1', 'L2'] })
  })

  it('rect hitting only lines → multi-line when 2+, line when 1', () => {
    const result1 = resolveRectangleSelection(
      { x: 0, y: 0, w: 100, h: 100 },
      [],
      [],
      dims,
      [{ id: 'ln1', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }],
    )
    expect(result1).toEqual({ type: 'line', id: 'ln1' })

    const result2 = resolveRectangleSelection(
      { x: 0, y: 0, w: 100, h: 100 },
      [],
      [],
      dims,
      [
        { id: 'ln1', points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] },
        { id: 'ln2', points: [{ x: 60, y: 60 }, { x: 90, y: 90 }] },
      ],
    )
    expect(result2).toEqual({ type: 'multi-line', ids: ['ln1', 'ln2'] })
  })

  it('empty rect (no hits) → null', () => {
    const result = resolveRectangleSelection(
      { x: 1000, y: 1000, w: 10, h: 10 },
      [node('n1', 'L1', 0, 0)],
      [{ id: 'L1', left: 0, top: 0, width: 100, height: 100 }],
      dims,
    )
    expect(result).toBeNull()
  })
})

// ── toggleRectangleSelection ──────────────────────────────────────────────

describe('toggleRectangleSelection', () => {
  it('null current + rect result → rect result wins', () => {
    expect(toggleRectangleSelection(null, { type: 'node', id: 'n1' }, nodes))
      .toEqual({ type: 'node', id: 'n1' })
  })

  it('current + null rect result → current preserved', () => {
    const current: Selection = { type: 'node', id: 'n1' }
    expect(toggleRectangleSelection(current, null, nodes)).toBe(current)
  })

  it('incompatible types → rect replaces', () => {
    expect(toggleRectangleSelection(
      { type: 'layer', id: 'L1' },
      { type: 'node', id: 'n1' },
      nodes,
    )).toEqual({ type: 'node', id: 'n1' })
  })

  it('adding disjoint nodes via rect toggle → union', () => {
    const result = toggleRectangleSelection(
      { type: 'node', id: 'n1' },
      { type: 'multi-node', ids: ['n2'], layer: 'L1' },
      nodes,
    )
    expect(result).toMatchObject({ type: 'multi-node' })
    expect((result as { type: 'multi-node'; ids: string[] }).ids.sort()).toEqual(['n1', 'n2'])
  })

  it('overlapping nodes cancel via symmetric difference', () => {
    const result = toggleRectangleSelection(
      { type: 'multi-node', ids: ['n1', 'n2'], layer: 'L1' },
      { type: 'multi-node', ids: ['n2', 'n3'], layer: 'L1' },
      nodes,
    )
    // symmetric diff: {n1, n3}; n3 is in L2, so promotes to multi-layer
    expect(result).toMatchObject({ type: 'multi-layer' })
  })
})
