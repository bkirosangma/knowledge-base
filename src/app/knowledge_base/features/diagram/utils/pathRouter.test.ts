import { describe, it, expect } from 'vitest'
import { computePath } from './pathRouter'
import { buildObstacles } from './orthogonalRouter'

// Covers DIAG-3.8-01 (straight), 3.8-02/03 (bezier control distance),
// 3.8-04 (orthogonal obstacle avoidance), 3.8-05 (rounded corners).
// See test-cases/03-diagram.md §3.8.

describe('computePath — straight', () => {
  it('DIAG-3.8-01: straight routing returns single M/L segment', () => {
    const result = computePath(
      'straight',
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      'right-1',
      'left-1',
      [],
    )
    expect(result.path).toBe('M 0 0 L 100 100')
    expect(result.points).toEqual([{ x: 0, y: 0 }, { x: 100, y: 100 }])
  })

  it('DIAG-3.8-01: straight path ignores obstacles', () => {
    const result = computePath(
      'straight',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      'right-1',
      'left-1',
      [{ left: 30, top: -20, right: 70, bottom: 20 }], // directly on the line
    )
    expect(result.path).toBe('M 0 0 L 100 0')
  })
})

describe('computePath — bezier', () => {
  it('DIAG-3.8-02: bezier path uses cubic curve (C command)', () => {
    const result = computePath(
      'bezier',
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      'right-1',
      'left-1',
      [],
    )
    expect(result.path).toMatch(/^M 0 0 C /)
    // Cubic bezier has "C cp1 cp2 end" format.
    expect(result.path.split(',').length).toBeGreaterThanOrEqual(2)
  })

  it('DIAG-3.8-02: samples 17 points along the curve (segments=16 + 1)', () => {
    const result = computePath(
      'bezier',
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      'right-1',
      'left-1',
      [],
    )
    expect(result.points).toHaveLength(17)
    expect(result.points[0]).toEqual({ x: 0, y: 0 })
    expect(result.points[16].x).toBeCloseTo(200, 5)
    expect(result.points[16].y).toBeCloseTo(200, 5)
  })

  it('DIAG-3.8-03: control-point offset is min(0.4 * span, 150)', () => {
    // Short span: 0.4 * span dominates (span=100 → ext=40).
    // from at (0,0) with right-1 direction (+x, 0): cp1 should be at (40, 0).
    // to at (100,0) with left-1 direction (-x, 0): cp2 at (60, 0).
    const result = computePath(
      'bezier',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      'right-1',
      'left-1',
      [],
    )
    // Parse "M 0 0 C 40 0, 60 0, 100 0"
    const match = result.path.match(/C\s+([-\d.]+)\s+([-\d.]+),\s+([-\d.]+)\s+([-\d.]+),\s+([-\d.]+)\s+([-\d.]+)/)
    expect(match).not.toBeNull()
    const [, cp1x, cp1y, cp2x, cp2y] = match!.map(Number)
    expect(cp1x).toBeCloseTo(40, 5)
    expect(cp1y).toBeCloseTo(0, 5)
    expect(cp2x).toBeCloseTo(60, 5)
    expect(cp2y).toBeCloseTo(0, 5)
  })

  it('DIAG-3.8-03: long span caps control distance at 150', () => {
    // span=1000 → would be 400, but clamped to 150.
    const result = computePath(
      'bezier',
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      'right-1',
      'left-1',
      [],
    )
    const match = result.path.match(/C\s+([-\d.]+)\s+([-\d.]+),\s+([-\d.]+)\s+([-\d.]+),/)
    const [, cp1x] = match!.map(Number)
    expect(cp1x).toBeCloseTo(150, 5)
  })

  it('respects dir overrides (e.g. condition anchor directions)', () => {
    // fromDir pointing up: cp1 extends upward from (0,0).
    const result = computePath(
      'bezier',
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      'top-1',
      'left-1',
      [],
      undefined,
      { dx: 0, dy: -1 }, // override from-dir
      { dx: -1, dy: 0 },
    )
    const match = result.path.match(/C\s+([-\d.]+)\s+([-\d.]+),/)
    const [, cp1x, cp1y] = match!.map(Number)
    expect(cp1x).toBeCloseTo(0, 5)
    expect(cp1y).toBeLessThan(0) // extends upward
  })
})

describe('computePath — orthogonal', () => {
  it('DIAG-3.8-01 (ortho): path consists of M + only horizontal/vertical segments', () => {
    const result = computePath(
      'orthogonal',
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      'right-1',
      'left-1',
      [],
    )
    // Check each successive point pair: either x matches (vertical) or y matches (horizontal).
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1]
      const b = result.points[i]
      const aligned = Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5
      expect(aligned).toBe(true)
    }
  })

  it('DIAG-3.8-05: orthogonal path uses arc (A) commands for rounded corners', () => {
    const result = computePath(
      'orthogonal',
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      'right-1',
      'left-1',
      [],
    )
    expect(result.path).toContain('A ') // rounded corner(s)
  })

  it('DIAG-3.8-01 (ortho): path begins with a stub in the from-anchor direction', () => {
    // right-1 anchor at (0, 0) ⇒ stubFrom should be at (20, 0).
    const result = computePath(
      'orthogonal',
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      'right-1',
      'left-1',
      [],
    )
    // First segment leaves from (0,0) going +x.
    expect(result.points[0]).toEqual({ x: 0, y: 0 })
    expect(result.points[1]).toEqual({ x: 20, y: 0 })
  })

  it('DIAG-3.8-04: routes around obstacles rather than through them', () => {
    // H→H routing from right-1(0,0) to left-1(200,100): the default midX=100
    // path would run a vertical segment at x=100 straight through the obstacle.
    // The router's offset-search should shift it to x<65 or x>135 (outside
    // the 15px-padded obstacle at x∈[80,120]).
    const obstacle = { left: 80, top: -20, right: 120, bottom: 80 }
    const result = computePath(
      'orthogonal',
      { x: 0, y: 0 },
      { x: 200, y: 100 },
      'right-1',
      'left-1',
      [obstacle],
    )
    for (let i = 1; i < result.points.length; i++) {
      const a = result.points[i - 1]
      const b = result.points[i]
      const horizontal = Math.abs(a.y - b.y) < 0.5
      const vertical = Math.abs(a.x - b.x) < 0.5
      if (horizontal) {
        const y = a.y
        const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x)
        const crosses = y > obstacle.top && y < obstacle.bottom &&
          maxX > obstacle.left && minX < obstacle.right
        expect(crosses).toBe(false)
      } else if (vertical) {
        const x = a.x
        const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y)
        const crosses = x > obstacle.left && x < obstacle.right &&
          maxY > obstacle.top && minY < obstacle.bottom
        expect(crosses).toBe(false)
      }
    }
  })

  it('user-provided waypoints override automatic routing', () => {
    const waypoints = [{ x: 50, y: 50 }, { x: 50, y: 150 }]
    const result = computePath(
      'orthogonal',
      { x: 0, y: 0 },
      { x: 200, y: 200 },
      'right-1',
      'left-1',
      [],
      waypoints,
    )
    // The supplied waypoints must appear in order between the stubs.
    const ptStrs = result.points.map((p) => `${p.x},${p.y}`)
    expect(ptStrs).toContain('50,50')
    expect(ptStrs).toContain('50,150')
  })

  it('aligned vertical anchors produce no intermediate waypoints', () => {
    // Both endpoints vertically aligned on x=100 with top/bottom directions.
    const result = computePath(
      'orthogonal',
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      'bottom-1',
      'top-1',
      [],
    )
    // Should collapse to: start → stubDown → stubUp → end (two stubs only).
    expect(result.points.length).toBeLessThanOrEqual(4)
  })
})

describe('buildObstacles', () => {
  it('converts nodes to left/top/right/bottom rects centered on x/y', () => {
    const obs = buildObstacles(
      [{ id: 'n1', x: 100, y: 100, w: 80, h: 40 }],
      [],
    )
    expect(obs).toEqual([
      { left: 60, top: 80, right: 140, bottom: 120 },
    ])
  })

  it('excludes nodes whose id is in excludeIds', () => {
    const obs = buildObstacles(
      [
        { id: 'keep', x: 0, y: 0, w: 20, h: 20 },
        { id: 'skip', x: 100, y: 100, w: 20, h: 20 },
      ],
      ['skip'],
    )
    expect(obs).toHaveLength(1)
    expect(obs[0]).toEqual({ left: -10, top: -10, right: 10, bottom: 10 })
  })

  it('excludes multiple nodes', () => {
    const obs = buildObstacles(
      [
        { id: 'a', x: 0, y: 0, w: 10, h: 10 },
        { id: 'b', x: 100, y: 0, w: 10, h: 10 },
        { id: 'c', x: 200, y: 0, w: 10, h: 10 },
      ],
      ['a', 'c'],
    )
    expect(obs).toHaveLength(1)
    expect(obs[0].left).toBe(95)
  })
})
