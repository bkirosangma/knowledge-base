import { describe, it, expect } from 'vitest'
import {
  rectsOverlap,
  between,
  clampLayerDelta,
  clampNodePosition,
  clampMultiNodeDelta,
  clampElementToAvoidLayerCollision,
  findNonOverlappingLayerPosition,
  type Rect,
  type LayerBounds,
} from './collisionUtils'
import { LAYER_GAP, NODE_GAP } from './constants'

// Covers DIAG-3.7-13 (collision-scope primitives), 3.15.13–3.15.19 (layer/node
// clamp algorithms). See test-cases/03-diagram.md §3.7 and §3.15.

const rect = (
  left: number, top: number, width: number, height: number,
): Rect => ({ left, top, width, height })

const layer = (
  id: string, left: number, top: number, w: number, h: number,
  empty = false,
): LayerBounds => ({ id, left, top, width: w, height: h, empty })

describe('rectsOverlap', () => {
  it('returns true for actually overlapping rects (gap=0)', () => {
    expect(rectsOverlap(rect(0, 0, 50, 50), rect(25, 25, 50, 50), 0)).toBe(true)
  })

  it('edge-touching rects with gap=0 do NOT overlap (strict inequality)', () => {
    expect(rectsOverlap(rect(0, 0, 50, 50), rect(50, 0, 50, 50), 0)).toBe(false)
  })

  it('gap expands the collision zone — close-but-separate rects count as overlap', () => {
    expect(rectsOverlap(rect(0, 0, 50, 50), rect(55, 0, 50, 50), 10)).toBe(true)
    // Same pair with no gap → no overlap.
    expect(rectsOverlap(rect(0, 0, 50, 50), rect(55, 0, 50, 50), 0)).toBe(false)
  })

  it('fully separate rects never overlap even with gap', () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(100, 100, 10, 10), 15)).toBe(false)
  })
})

describe('between (order-independent inclusive)', () => {
  it('true when value is strictly between endpoints', () => {
    expect(between(5, 0, 10)).toBe(true)
  })

  it('true at either endpoint (inclusive)', () => {
    expect(between(0, 0, 10)).toBe(true)
    expect(between(10, 0, 10)).toBe(true)
  })

  it('false when value is outside', () => {
    expect(between(-1, 0, 10)).toBe(false)
    expect(between(11, 0, 10)).toBe(false)
  })

  it('handles reversed endpoints (a > b)', () => {
    expect(between(5, 10, 0)).toBe(true)
    expect(between(-1, 10, 0)).toBe(false)
  })
})

describe('clampLayerDelta', () => {
  const dragged = layer('dragged', 0, 0, 100, 100)

  it('returns raw delta when there are no obstacles', () => {
    expect(clampLayerDelta(dragged, [], 150, 0, 0, 0)).toEqual({ dx: 150, dy: 0 })
  })

  it('ignores the dragged layer itself and empty layers', () => {
    const others = [
      layer('dragged', 0, 0, 100, 100), // same id — should be filtered
      layer('empty', 200, 0, 100, 100, true), // empty → filtered
    ]
    expect(clampLayerDelta(dragged, others, 150, 0, 0, 0)).toEqual({
      dx: 150, dy: 0,
    })
  })

  it('clamps delta against a solid obstacle', () => {
    // Obstacle at (200,0) 100x100. With LAYER_GAP=10, dragged can move right
    // until its right edge + gap touches obstacle.left → dx ≤ 90.
    const obs = [layer('obs', 200, 0, 100, 100)]
    const result = clampLayerDelta(dragged, obs, 150, 0, 0, 0)
    expect(result.dx).toBeLessThanOrEqual(90 + 0.01)
    expect(result.dy).toBe(0)
    // Verify the clamped position has no overlap.
    const clampedBounds = rect(dragged.left + result.dx, dragged.top + result.dy, 100, 100)
    expect(rectsOverlap(clampedBounds, rect(200, 0, 100, 100), LAYER_GAP)).toBe(false)
  })

  it('returns raw delta when clamped position has no collision', () => {
    // Move away from obstacle — no need to clamp.
    const obs = [layer('obs', 500, 500, 100, 100)]
    expect(clampLayerDelta(dragged, obs, 50, 50, 0, 0)).toEqual({ dx: 50, dy: 50 })
  })
})

describe('clampNodePosition', () => {
  it('returns raw position when there are no siblings', () => {
    expect(clampNodePosition(100, 100, 30, 20, 0, 0, [])).toEqual({
      x: 100, y: 100,
    })
  })

  it('clamps a dragged node against a sibling rect', () => {
    // Sibling centered in world: left=100, top=0, 50x40.
    const siblings = [rect(100, 0, 50, 40)]
    // Dragged node half-size 25×20, from prev (0,0) trying to move to (130, 0).
    const result = clampNodePosition(130, 0, 25, 20, 0, 0, siblings)
    // Verify no overlap at clamped position.
    const rResult = rect(result.x - 25, result.y - 20, 50, 40)
    expect(rectsOverlap(rResult, siblings[0], NODE_GAP)).toBe(false)
  })
})

describe('clampMultiNodeDelta', () => {
  const draggedNodes = [
    { x: 0, y: 0, halfW: 25, halfH: 20 },
    { x: 0, y: 50, halfW: 25, halfH: 20 },
  ]

  it('returns raw delta when there are no siblings', () => {
    expect(clampMultiNodeDelta(100, 0, 0, 0, draggedNodes, [])).toEqual({
      dx: 100, dy: 0,
    })
  })

  it('returns raw delta when there are no dragged nodes', () => {
    expect(clampMultiNodeDelta(
      100, 0, 0, 0, [], [rect(200, 0, 50, 50)],
    )).toEqual({ dx: 100, dy: 0 })
  })

  it('clamps when any dragged node would collide with a sibling', () => {
    // Sibling in path of the upper dragged node.
    const siblings = [rect(100, -20, 50, 40)]
    const result = clampMultiNodeDelta(200, 0, 0, 0, draggedNodes, siblings)
    // The result must not cause any of the dragged nodes to overlap a sibling.
    for (const dn of draggedNodes) {
      const moved = rect(
        dn.x + result.dx - dn.halfW,
        dn.y + result.dy - dn.halfH,
        dn.halfW * 2,
        dn.halfH * 2,
      )
      for (const s of siblings) {
        expect(rectsOverlap(moved, s, NODE_GAP)).toBe(false)
      }
    }
  })
})

describe('clampElementToAvoidLayerCollision', () => {
  // A simple predictFn that pads the provided element position with LAYER_PADDING.
  const predictFn = (
    _layerId: string,
    _nodes: { id: string; x: number; y: number; w: number; layer: string }[],
    nx: number, ny: number, nhw: number, nhh: number,
  ): Rect => ({
    left: nx - nhw - 25,
    top: ny - nhh - 25,
    width: nhw * 2 + 50,
    height: nhh * 2 + 50,
  })

  it('fast path: returns input unchanged when placement is valid', () => {
    const result = clampElementToAvoidLayerCollision(
      0, 0, 30, 20, 'L1',
      /* existingNodes */ [],
      /* getNodeDimensions */ (_n) => ({ w: 60, h: 40 }),
      /* layerManualSizes */ {},
      /* allRegions */ [layer('L1', -100, -100, 200, 200)],
      predictFn,
    )
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('no layerShift flag when no alternate placement is needed', () => {
    const result = clampElementToAvoidLayerCollision(
      0, 0, 30, 20, 'L1', [], (_n) => ({ w: 60, h: 40 }), {},
      [layer('L1', -100, -100, 200, 200)], predictFn,
    )
    expect(result.layerShift).toBeUndefined()
  })
})

describe('findNonOverlappingLayerPosition', () => {
  it('returns input unchanged when there are no obstacles', () => {
    expect(findNonOverlappingLayerPosition(
      rect(0, 0, 200, 100), [],
    )).toEqual({ left: 0, top: 0 })
  })

  it('zero-width empty layers are filtered and do not block', () => {
    const obstacles = [layer('ghost', 0, 0, 0, 0, true)]
    expect(findNonOverlappingLayerPosition(
      rect(0, 0, 200, 100), obstacles,
    )).toEqual({ left: 0, top: 0 })
  })

  it('returns input when placement at raw is already valid', () => {
    const obstacles = [layer('L1', 500, 500, 100, 100)]
    expect(findNonOverlappingLayerPosition(
      rect(0, 0, 200, 100), obstacles,
    )).toEqual({ left: 0, top: 0 })
  })

  it('shifts to a closest safe edge-candidate when raw would overlap', () => {
    // Obstacle at (0,0) 200×100. Trying to place a new 100×50 layer at (50,0).
    // Valid candidates include: left of obstacle (−110, 0), right of obstacle (210, 0),
    // above (50, −60), below (50, 110). Nearest to (50, 0) is below (50, 110) or above (50, −60).
    const obstacles = [layer('L1', 0, 0, 200, 100)]
    const result = findNonOverlappingLayerPosition(
      rect(50, 0, 100, 50), obstacles,
    )
    // Whatever it picks, it must not overlap the obstacle.
    const placed = rect(result.left, result.top, 100, 50)
    expect(rectsOverlap(placed, obstacles[0], LAYER_GAP)).toBe(false)
  })
})
