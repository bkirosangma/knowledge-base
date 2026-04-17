import { describe, it, expect } from 'vitest'
import {
  migrateAnchorId,
  getAnchorPosition,
  getAnchors,
  getAnchorEdge,
  getAnchorDirection,
  getNodeAnchorPosition,
  getNodeAnchorDirection,
  pickBestTargetAnchor,
  findNearestAnchor,
} from './anchors'

// Covers DIAG-3.8-06, 3.8-07, 3.8-08 plus internal helpers.
// See test-cases/03-diagram.md §3.8.

describe('migrateAnchorId', () => {
  it('maps legacy corner IDs to nearest side anchor', () => {
    expect(migrateAnchorId('top-left')).toBe('top-0')
    expect(migrateAnchorId('top-right')).toBe('top-2')
    expect(migrateAnchorId('bottom-left')).toBe('bottom-0')
    expect(migrateAnchorId('bottom-right')).toBe('bottom-2')
  })

  it('passes through modern anchor IDs unchanged', () => {
    expect(migrateAnchorId('top-1')).toBe('top-1')
    expect(migrateAnchorId('right-0')).toBe('right-0')
    expect(migrateAnchorId('cond-in')).toBe('cond-in')
    expect(migrateAnchorId('cond-out-3')).toBe('cond-out-3')
  })
})

describe('getAnchorPosition (standard rect node)', () => {
  // Node: centered at (100, 100), w=80, h=40 ⇒ hw=40, hh=20
  const cx = 100, cy = 100, w = 80, h = 40

  it('top-* positions lie on the top edge', () => {
    expect(getAnchorPosition('top-0', cx, cy, w, h)).toEqual({ x: 80, y: 80 })
    expect(getAnchorPosition('top-1', cx, cy, w, h)).toEqual({ x: 100, y: 80 })
    expect(getAnchorPosition('top-2', cx, cy, w, h)).toEqual({ x: 120, y: 80 })
  })

  it('bottom-* positions lie on the bottom edge', () => {
    expect(getAnchorPosition('bottom-0', cx, cy, w, h)).toEqual({ x: 80, y: 120 })
    expect(getAnchorPosition('bottom-1', cx, cy, w, h)).toEqual({ x: 100, y: 120 })
    expect(getAnchorPosition('bottom-2', cx, cy, w, h)).toEqual({ x: 120, y: 120 })
  })

  it('left-* positions lie on the left edge', () => {
    expect(getAnchorPosition('left-0', cx, cy, w, h)).toEqual({ x: 60, y: 90 })
    expect(getAnchorPosition('left-1', cx, cy, w, h)).toEqual({ x: 60, y: 100 })
    expect(getAnchorPosition('left-2', cx, cy, w, h)).toEqual({ x: 60, y: 110 })
  })

  it('right-* positions lie on the right edge', () => {
    expect(getAnchorPosition('right-0', cx, cy, w, h)).toEqual({ x: 140, y: 90 })
    expect(getAnchorPosition('right-1', cx, cy, w, h)).toEqual({ x: 140, y: 100 })
    expect(getAnchorPosition('right-2', cx, cy, w, h)).toEqual({ x: 140, y: 110 })
  })

  it('migrates legacy corner IDs before positioning', () => {
    // "top-left" → "top-0"
    expect(getAnchorPosition('top-left' as never, cx, cy, w, h)).toEqual({
      x: 80, y: 80,
    })
  })

  it('unknown anchor ID falls back to top-center', () => {
    expect(getAnchorPosition('totally-invalid' as never, cx, cy, w, h)).toEqual({
      x: 100, y: 80,
    })
  })
})

describe('getAnchors', () => {
  it('DIAG-3.8-06: returns 12 anchors per rectangular node (3 per side × 4 sides)', () => {
    // Note: Features.md says "9 anchors"; implementation exposes 12
    // (three per side on top/bottom/left/right). Keeping 12 here as ground
    // truth since tests reference implementation.
    const anchors = getAnchors(0, 0, 100, 60)
    expect(anchors).toHaveLength(12)
    const ids = anchors.map((a) => a.id).sort()
    expect(ids).toEqual([
      'bottom-0', 'bottom-1', 'bottom-2',
      'left-0', 'left-1', 'left-2',
      'right-0', 'right-1', 'right-2',
      'top-0', 'top-1', 'top-2',
    ])
  })

  it('DIAG-3.8-07: every anchor sits on the rectangle perimeter', () => {
    const cx = 50, cy = 50, w = 40, h = 20
    const left = cx - w / 2, right = cx + w / 2
    const top = cy - h / 2, bottom = cy + h / 2
    for (const a of getAnchors(cx, cy, w, h)) {
      const onVertical = a.x === left || a.x === right
      const onHorizontal = a.y === top || a.y === bottom
      // Must sit on at least one of the four edges.
      expect(onVertical || onHorizontal).toBe(true)
      // And stay inside the bounding box on the other axis.
      expect(a.x).toBeGreaterThanOrEqual(left)
      expect(a.x).toBeLessThanOrEqual(right)
      expect(a.y).toBeGreaterThanOrEqual(top)
      expect(a.y).toBeLessThanOrEqual(bottom)
    }
  })
})

describe('getAnchorEdge', () => {
  it('returns the edge name prefix', () => {
    expect(getAnchorEdge('top-0')).toBe('top')
    expect(getAnchorEdge('top-2')).toBe('top')
    expect(getAnchorEdge('bottom-1')).toBe('bottom')
    expect(getAnchorEdge('left-0')).toBe('left')
    expect(getAnchorEdge('right-2')).toBe('right')
  })

  it('falls back to "top" for unknown IDs', () => {
    expect(getAnchorEdge('weird')).toBe('top')
  })
})

describe('getAnchorDirection', () => {
  it('points outward along the edge normal', () => {
    expect(getAnchorDirection('top-0')).toEqual({ dx: 0, dy: -1 })
    expect(getAnchorDirection('bottom-1')).toEqual({ dx: 0, dy: 1 })
    expect(getAnchorDirection('left-2')).toEqual({ dx: -1, dy: 0 })
    expect(getAnchorDirection('right-0')).toEqual({ dx: 1, dy: 0 })
  })

  it('cond-in points up, cond-out-N defaults down (without node context)', () => {
    expect(getAnchorDirection('cond-in')).toEqual({ dx: 0, dy: -1 })
    expect(getAnchorDirection('cond-out-0')).toEqual({ dx: 0, dy: 1 })
    expect(getAnchorDirection('cond-out-5')).toEqual({ dx: 0, dy: 1 })
  })

  it('returns zero vector for completely unknown IDs', () => {
    expect(getAnchorDirection('unknown')).toEqual({ dx: 0, dy: 0 })
  })
})

describe('getNodeAnchorPosition dispatch', () => {
  it('uses standard geometry for non-condition shapes', () => {
    // Rect node 80×40 at (100,100), top-1 expected.
    const pos = getNodeAnchorPosition('top-1', 100, 100, 80, 40, 'rect')
    expect(pos).toEqual({ x: 100, y: 80 })
  })

  it('dispatches to condition geometry when shape === "condition"', () => {
    // For a condition, cond-in sits above the center by effective-h/2.
    // Exact value depends on getConditionDimensions; just assert direction.
    const pos = getNodeAnchorPosition(
      'cond-in',
      200, 200,
      81, 70,  // outCount=2 default dims
      'condition',
      2,
      0,
    )
    expect(pos.x).toBe(200)
    expect(pos.y).toBeLessThan(200) // top-vertex sits above center
  })
})

describe('getNodeAnchorDirection dispatch', () => {
  it('standard anchors use edge-normal direction', () => {
    expect(
      getNodeAnchorDirection('right-1', 0, 0, 80, 40, 'rect'),
    ).toEqual({ dx: 1, dy: 0 })
  })

  it('condition in-anchor rotates with node rotation', () => {
    // rotation=90° should swing the "up" direction to the right (per rotation matrix).
    const d = getNodeAnchorDirection(
      'cond-in', 0, 0, 81, 70, 'condition', 2, 90,
    )
    expect(d.dx).toBeCloseTo(1, 5)
    expect(d.dy).toBeCloseTo(0, 5)
  })
})

describe('pickBestTargetAnchor', () => {
  it('source to the right of target → right-1', () => {
    expect(pickBestTargetAnchor({ x: 300, y: 100 }, 100, 100, 80, 40)).toBe('right-1')
  })

  it('source to the left of target → left-1', () => {
    expect(pickBestTargetAnchor({ x: -100, y: 100 }, 100, 100, 80, 40)).toBe('left-1')
  })

  it('source above target → top-1', () => {
    expect(pickBestTargetAnchor({ x: 100, y: -100 }, 100, 100, 80, 40)).toBe('top-1')
  })

  it('source below target → bottom-1', () => {
    expect(pickBestTargetAnchor({ x: 100, y: 300 }, 100, 100, 80, 40)).toBe('bottom-1')
  })

  it('ties on |dx|===|dy| favour vertical axis (bottom/top)', () => {
    // Math.abs(dx) > Math.abs(dy) is strict; equality falls through to vertical case.
    expect(pickBestTargetAnchor({ x: 200, y: 200 }, 100, 100, 80, 40)).toBe('bottom-1')
  })
})

describe('findNearestAnchor', () => {
  const rectNode = { id: 'n1', x: 100, y: 100, w: 80, h: 40 }

  it('DIAG-3.8-08: snaps to anchor when point is within snap radius', () => {
    // right-1 sits at (140, 100). Point ~10px away should snap.
    const hit = findNearestAnchor(145, 100, [rectNode], 25)
    expect(hit).not.toBeNull()
    expect(hit!.nodeId).toBe('n1')
    expect(hit!.anchorId).toBe('right-1')
    expect(hit!.distance).toBeCloseTo(5, 5)
  })

  it('DIAG-3.8-08: returns null when no anchor is within snap radius', () => {
    // Point far away from any anchor.
    expect(findNearestAnchor(10000, 10000, [rectNode], 25)).toBeNull()
  })

  it('picks the closest anchor among multiple candidates', () => {
    // Point near right-1 (140, 100) — not equidistant from others.
    const hit = findNearestAnchor(138, 100, [rectNode], 50)
    expect(hit!.anchorId).toBe('right-1')
  })

  it('dispatches to condition anchors for condition nodes', () => {
    const conditionNode = {
      id: 'c1', x: 0, y: 0, w: 81, h: 70,
      shape: 'condition', conditionOutCount: 2, rotation: 0,
    }
    // cond-in sits at (0, -35). Query point just above top-vertex.
    const hit = findNearestAnchor(0, -35, [conditionNode], 25)
    expect(hit!.anchorId).toBe('cond-in')
    expect(hit!.distance).toBeCloseTo(0, 5)
  })
})
