import { describe, it, expect } from 'vitest'
import {
  getNodeHeight,
  getNodeDims,
  rectsIntersect,
  segmentIntersectsRect,
  lineIntersectsRect,
  detectContextMenuTarget,
} from './geometry'
import type { NodeData } from '../types'

// Covers DIAG-3.8-15 (pathIntersectsAny equivalent — segment/rect overlap true),
// 3.8-16 (no overlap false), 3.8-17 (segment on edge), plus node geometry.

describe('getNodeHeight', () => {
  it('returns 60 for compact widths (110, 130)', () => {
    expect(getNodeHeight(110)).toBe(60)
    expect(getNodeHeight(130)).toBe(60)
  })

  it('returns 70 for all other widths', () => {
    expect(getNodeHeight(100)).toBe(70)
    expect(getNodeHeight(150)).toBe(70)
    expect(getNodeHeight(200)).toBe(70)
  })
})

describe('getNodeDims', () => {
  const baseNode = { id: 'n1', x: 0, y: 0, w: 150 } as unknown as NodeData

  it('returns measured size when available (non-condition)', () => {
    const measured = { n1: { w: 180, h: 90 } }
    expect(getNodeDims(baseNode, measured)).toEqual({ w: 180, h: 90 })
  })

  it('falls back to node.w and computed height when measurement is missing', () => {
    expect(getNodeDims(baseNode, {})).toEqual({ w: 150, h: 70 })
  })

  it('condition nodes always use computed dimensions (ignores measured)', () => {
    const condition = {
      id: 'c1', x: 0, y: 0, w: 999,
      shape: 'condition', conditionSize: 1, conditionOutCount: 2,
    } as unknown as NodeData
    const measured = { c1: { w: 5000, h: 5000 } }
    const dims = getNodeDims(condition, measured)
    expect(dims.w).not.toBe(5000)
    expect(dims.h).not.toBe(5000)
  })
})

describe('rectsIntersect', () => {
  it('returns true when rectangles overlap', () => {
    expect(rectsIntersect(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 5, y: 5, w: 10, h: 10 },
    )).toBe(true)
  })

  it('returns false when rectangles are entirely separate', () => {
    expect(rectsIntersect(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 20, y: 20, w: 10, h: 10 },
    )).toBe(false)
  })

  it('returns false when rectangles only touch at edge (strict inequality)', () => {
    // Edge-touch: a.x+w === b.x exactly.
    expect(rectsIntersect(
      { x: 0, y: 0, w: 10, h: 10 },
      { x: 10, y: 0, w: 10, h: 10 },
    )).toBe(false)
  })

  it('returns true for contained rectangle', () => {
    expect(rectsIntersect(
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 25, y: 25, w: 25, h: 25 },
    )).toBe(true)
  })
})

describe('segmentIntersectsRect', () => {
  // rect: 10..20 in x, 10..20 in y
  const rx = 10, ry = 10, rw = 10, rh = 10

  it('DIAG-3.8-15: horizontal segment crossing the rect → true', () => {
    expect(segmentIntersectsRect(0, 15, 30, 15, rx, ry, rw, rh)).toBe(true)
  })

  it('DIAG-3.8-15: vertical segment crossing the rect → true', () => {
    expect(segmentIntersectsRect(15, 0, 15, 30, rx, ry, rw, rh)).toBe(true)
  })

  it('DIAG-3.8-15: diagonal segment passing through rect → true', () => {
    expect(segmentIntersectsRect(0, 0, 30, 30, rx, ry, rw, rh)).toBe(true)
  })

  it('DIAG-3.8-16: segment entirely outside and above → false', () => {
    expect(segmentIntersectsRect(0, 0, 30, 5, rx, ry, rw, rh)).toBe(false)
  })

  it('DIAG-3.8-16: segment entirely to one side → false', () => {
    expect(segmentIntersectsRect(30, 0, 30, 30, rx, ry, rw, rh)).toBe(false)
  })

  it('DIAG-3.8-17: segment with endpoint inside the rect → true', () => {
    expect(segmentIntersectsRect(0, 15, 15, 15, rx, ry, rw, rh)).toBe(true)
  })

  it('segment entirely inside the rect → true', () => {
    expect(segmentIntersectsRect(12, 12, 18, 18, rx, ry, rw, rh)).toBe(true)
  })
})

describe('lineIntersectsRect (with 4px stroke padding)', () => {
  const rect = { x: 100, y: 100, w: 50, h: 50 }

  it('two-point line through rect → true', () => {
    expect(lineIntersectsRect(
      { id: 'l1', points: [{ x: 50, y: 125 }, { x: 200, y: 125 }] },
      rect,
    )).toBe(true)
  })

  it('multi-point polyline with one segment intersecting → true', () => {
    expect(lineIntersectsRect(
      { id: 'l1', points: [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 200, y: 125 }, // this segment crosses rect
      ] },
      rect,
    )).toBe(true)
  })

  it('line near rect within 4px padding → true', () => {
    // Rect right edge is x=150. Vertical line at x=153 (3px away) → padded rect
    // extends to x=154, so vertical segment at x=153 y=0..300 is inside padded.
    expect(lineIntersectsRect(
      { id: 'l1', points: [{ x: 153, y: 0 }, { x: 153, y: 300 }] },
      rect,
    )).toBe(true)
  })

  it('line far from rect → false', () => {
    expect(lineIntersectsRect(
      { id: 'l1', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }] },
      rect,
    )).toBe(false)
  })
})

describe('detectContextMenuTarget', () => {
  const getDim = (n: { w: number }) => ({ w: n.w, h: 40 })

  it('returns element hit when point lies inside a node', () => {
    const nodes = [{ id: 'n1', x: 100, y: 100, w: 80 }]
    expect(detectContextMenuTarget(100, 100, nodes, getDim, [])).toEqual({
      type: 'element', id: 'n1',
    })
  })

  it('returns layer hit when point lies inside a non-empty layer', () => {
    const regions = [{
      id: 'L1', left: 0, top: 0, width: 300, height: 300, empty: false,
    }]
    expect(detectContextMenuTarget(50, 50, [], getDim, regions)).toEqual({
      type: 'layer', id: 'L1',
    })
  })

  it('empty layers are skipped (treated as canvas)', () => {
    const regions = [{
      id: 'L1', left: 0, top: 0, width: 300, height: 300, empty: true,
    }]
    expect(detectContextMenuTarget(50, 50, [], getDim, regions)).toEqual({
      type: 'canvas',
    })
  })

  it('element hit beats layer hit (nodes checked first)', () => {
    const nodes = [{ id: 'n1', x: 100, y: 100, w: 80 }]
    const regions = [{
      id: 'L1', left: 0, top: 0, width: 300, height: 300, empty: false,
    }]
    expect(detectContextMenuTarget(100, 100, nodes, getDim, regions)).toEqual({
      type: 'element', id: 'n1',
    })
  })

  it('falls through to canvas when nothing hit', () => {
    expect(detectContextMenuTarget(9999, 9999, [], getDim, [])).toEqual({
      type: 'canvas',
    })
  })
})
