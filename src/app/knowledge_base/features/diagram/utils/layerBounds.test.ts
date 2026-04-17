import { describe, it, expect } from 'vitest'
import { Database } from 'lucide-react'
import type { LayerDef, NodeData } from '../types'
import { predictLayerBounds, computeRegions } from './layerBounds'
import { LAYER_PADDING, LAYER_TITLE_OFFSET } from './constants'

// Covers DIAG-3.7-03 / 3.7-04 / 3.7-05 at the logic layer. UI / drag
// integration (3.7-06..09) lives in the canvas harness (Bucket 23).

const defaultDims = () => ({ w: 100, h: 80 })
const node = (id: string, layer: string, x = 0, y = 0): NodeData => ({
  id, label: id, layer, icon: Database, x, y, w: 100,
})
const layer = (id: string, title = id): LayerDef => ({
  id, title, bg: '#fff', border: '#000',
})

describe('predictLayerBounds — auto-expand (DIAG-3.7-03)', () => {
  it('DIAG-3.7-03: hypothetical new node expands bounds to cover it + LAYER_PADDING', () => {
    const bounds = predictLayerBounds(
      'L1',
      [],
      100, // new node x
      100, // new node y
      50,  // half-width
      40,  // half-height
      defaultDims,
      {},
    )
    // Node extents: (50, 60) to (150, 140). Padding = LAYER_PADDING both sides.
    expect(bounds.left).toBe(50 - LAYER_PADDING)
    expect(bounds.top).toBe(60 - LAYER_PADDING - LAYER_TITLE_OFFSET)
    expect(bounds.width).toBe(100 + LAYER_PADDING * 2)
    expect(bounds.height).toBe(80 + LAYER_PADDING * 2 + LAYER_TITLE_OFFSET)
  })

  it('DIAG-3.7-04: top edge accounts for LAYER_TITLE_OFFSET', () => {
    const bounds = predictLayerBounds('L1', [], 0, 0, 50, 40, defaultDims, {})
    // minY of node = -40; top = -40 - LAYER_PADDING - LAYER_TITLE_OFFSET
    expect(bounds.top).toBe(-40 - LAYER_PADDING - LAYER_TITLE_OFFSET)
  })

  it('with existing nodes, bounds cover all of them plus the new one', () => {
    const existing = [
      { id: 'a', layer: 'L1', x: 0, y: 0, w: 100 },
      { id: 'b', layer: 'L1', x: 500, y: 200, w: 100 },
    ]
    const bounds = predictLayerBounds('L1', existing, 1000, 1000, 50, 40, defaultDims, {})
    expect(bounds.left).toBeLessThanOrEqual(-50 - LAYER_PADDING)
    expect(bounds.left + bounds.width).toBeGreaterThanOrEqual(1050 + LAYER_PADDING)
  })

  it('DIAG-3.7-05: manual size override expands but never shrinks auto bounds', () => {
    const manualBounds = predictLayerBounds(
      'L1',
      [],
      0, 0, 50, 40,
      defaultDims,
      { L1: { left: -500, width: 2000, top: -500, height: 1000 } },
    )
    // Manual values are larger → override kicks in.
    expect(manualBounds.left).toBe(-500)
    expect(manualBounds.width).toBe(2000)
    expect(manualBounds.top).toBe(-500)
    expect(manualBounds.height).toBe(1000)
  })

  it('manual size SMALLER than auto bounds is ignored (no shrink)', () => {
    // Place a node far from origin; manual bounds tight around origin only.
    const bounds = predictLayerBounds(
      'L1',
      [],
      1000, 1000, 50, 40,
      defaultDims,
      { L1: { left: 0, width: 10, top: 0, height: 10 } },
    )
    // Auto bounds include x=1000 node; manual 10-wide should NOT clamp it.
    expect(bounds.left + bounds.width).toBeGreaterThanOrEqual(1050)
  })
})

describe('computeRegions', () => {
  it('empty layer with no manual size → zero-sized empty region', () => {
    const regions = computeRegions(
      [layer('L1')],
      [],
      defaultDims,
      {},
      null,
      null,
    )
    expect(regions).toHaveLength(1)
    expect(regions[0]).toMatchObject({
      id: 'L1',
      left: 0, top: 0, width: 0, height: 0,
      empty: true,
    })
  })

  it('empty layer with a manual size → region uses the manual rect', () => {
    const regions = computeRegions(
      [layer('L1')],
      [],
      defaultDims,
      { L1: { left: 100, top: 100, width: 400, height: 300 } },
      null,
      null,
    )
    expect(regions[0]).toMatchObject({ left: 100, top: 100, width: 400, height: 300, empty: true })
  })

  it('non-empty layer computes bounds from contained nodes', () => {
    const regions = computeRegions(
      [layer('L1')],
      [node('a', 'L1', 0, 0), node('b', 'L1', 400, 0)],
      defaultDims,
      {},
      null,
      null,
    )
    expect(regions[0].empty).toBe(false)
    // Left bound: min(a.x - half, b.x - half) - padding = -50 - LAYER_PADDING
    expect(regions[0].left).toBe(-50 - LAYER_PADDING)
  })

  it('a dragging node uses elementDragPos instead of its stored position', () => {
    const regions = computeRegions(
      [layer('L1')],
      [node('a', 'L1', 0, 0)],
      defaultDims,
      {},
      'a',
      { x: 1000, y: 1000 },
    )
    // Right edge must include the dragged position, not the stored origin.
    expect(regions[0].left + regions[0].width).toBeGreaterThanOrEqual(1050)
  })

  it('multi-drag delta shifts every listed node', () => {
    const regions = computeRegions(
      [layer('L1')],
      [node('a', 'L1', 0, 0), node('b', 'L1', 100, 0)],
      defaultDims,
      {},
      null,
      null,
      ['a', 'b'],
      { dx: 500, dy: 0 },
    )
    // Both nodes shifted +500, so right edge is at 100+500+half+padding.
    expect(regions[0].left + regions[0].width).toBeGreaterThanOrEqual(650)
  })

  it('separates layers — each region only covers its own nodes', () => {
    const regions = computeRegions(
      [layer('L1'), layer('L2')],
      [node('a', 'L1', 0, 0), node('b', 'L2', 500, 0)],
      defaultDims,
      {},
      null,
      null,
    )
    expect(regions).toHaveLength(2)
    const l1 = regions.find((r) => r.id === 'L1')!
    const l2 = regions.find((r) => r.id === 'L2')!
    expect(l1.left + l1.width).toBeLessThan(l2.left + l2.width)
  })
})
