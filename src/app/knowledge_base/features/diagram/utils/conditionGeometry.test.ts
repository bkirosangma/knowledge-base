import { describe, it, expect } from 'vitest'
import {
  rotatePoint,
  getConditionScale,
  getConditionDimensions,
  getEffectiveConditionHeight,
  getConditionPath,
  getConditionAnchors,
  getConditionAnchorPosition,
  getConditionAnchorDirection,
  CONDITION_WIDTH,
  CONDITION_HEIGHT,
} from './conditionGeometry'

// Covers DIAG-3.6-01 (condition shape renders), 3.6-04/05 (cond-in/cond-out-N),
// 3.6-06 (anchor positions), 3.6-07 (scale matches size).
// See test-cases/03-diagram.md §3.6.

describe('rotatePoint', () => {
  it('returns input unchanged when angle is 0', () => {
    expect(rotatePoint(3, 4, 0, 0, 0)).toEqual({ x: 3, y: 4 })
  })

  it('rotates (1,0) by 90° around origin → (0,1)', () => {
    const p = rotatePoint(1, 0, 0, 0, 90)
    expect(p.x).toBeCloseTo(0, 5)
    expect(p.y).toBeCloseTo(1, 5)
  })

  it('rotates (0,1) by 90° around origin → (-1,0)', () => {
    const p = rotatePoint(0, 1, 0, 0, 90)
    expect(p.x).toBeCloseTo(-1, 5)
    expect(p.y).toBeCloseTo(0, 5)
  })

  it('rotating a point around itself is a no-op', () => {
    const p = rotatePoint(5, 7, 5, 7, 135)
    expect(p.x).toBeCloseTo(5, 5)
    expect(p.y).toBeCloseTo(7, 5)
  })

  it('180° rotation mirrors relative to center', () => {
    const p = rotatePoint(10, 10, 5, 5, 180)
    expect(p.x).toBeCloseTo(0, 5)
    expect(p.y).toBeCloseTo(0, 5)
  })
})

describe('getConditionScale', () => {
  it('DIAG-3.6-07: scale grows 0.25 per size step', () => {
    expect(getConditionScale(1)).toBe(1.0)
    expect(getConditionScale(2)).toBe(1.25)
    expect(getConditionScale(3)).toBe(1.5)
    expect(getConditionScale(4)).toBe(1.75)
    expect(getConditionScale(5)).toBe(2.0)
  })

  it('undefined size defaults to 1.0', () => {
    expect(getConditionScale(undefined)).toBe(1.0)
  })
})

describe('getConditionDimensions', () => {
  it('DIAG-3.6-07: larger size produces larger dimensions (monotone)', () => {
    const s1 = getConditionDimensions(1, 2)
    const s3 = getConditionDimensions(3, 2)
    const s5 = getConditionDimensions(5, 2)
    expect(s3.w).toBeGreaterThan(s1.w)
    expect(s5.w).toBeGreaterThan(s3.w)
    expect(s3.h).toBeGreaterThan(s1.h)
    expect(s5.h).toBeGreaterThan(s3.h)
  })

  it('size=3 dims ≈ 1.5× size=1 dims (within rounding)', () => {
    const s1 = getConditionDimensions(1, 2)
    const s3 = getConditionDimensions(3, 2)
    // Integer rounding means s3 may be off by ≤1 from exact 1.5× scaling.
    expect(Math.abs(s3.w - s1.w * 1.5)).toBeLessThanOrEqual(1)
    expect(Math.abs(s3.h - s1.h * 1.5)).toBeLessThanOrEqual(1)
  })

  it('DIAG-3.6-05: more out-anchors widens the base (vertex angle grows)', () => {
    const two = getConditionDimensions(1, 2)
    const four = getConditionDimensions(1, 4)
    const seven = getConditionDimensions(1, 7)
    expect(four.w).toBeGreaterThan(two.w)
    expect(seven.w).toBeGreaterThanOrEqual(four.w)
    // Vertex angle caps at 120° so 7+ anchors hit max width.
    expect(seven.w).toBe(CONDITION_WIDTH)
  })

  it('CONDITION_WIDTH and CONDITION_HEIGHT constants reflect reference geometry', () => {
    // CONDITION_WIDTH is at 120° vertex (≥7 anchors).
    expect(CONDITION_WIDTH).toBe(140)
    // CONDITION_HEIGHT is at 60° (2 anchors, no arc).
    expect(CONDITION_HEIGHT).toBeGreaterThan(60)
    expect(CONDITION_HEIGHT).toBeLessThan(80)
  })
})

describe('getEffectiveConditionHeight', () => {
  it('adds no sagitta when outCount <= 2', () => {
    expect(getEffectiveConditionHeight(70, 81, 2)).toBe(70)
  })

  it('adds sagitta when outCount >= 3', () => {
    const eff = getEffectiveConditionHeight(65, 95, 3)
    expect(eff).toBeGreaterThan(65)
  })

  it('sagitta grows with outCount (capped at 5 extra)', () => {
    const e3 = getEffectiveConditionHeight(60, 110, 3)
    const e4 = getEffectiveConditionHeight(60, 110, 4)
    const e5 = getEffectiveConditionHeight(60, 110, 5)
    expect(e4).toBeGreaterThan(e3)
    expect(e5).toBeGreaterThan(e4)
  })
})

describe('getConditionPath', () => {
  it('DIAG-3.6-01: outCount=2 → plain triangle path (no arc)', () => {
    const d = getConditionPath(80, 70, 2)
    expect(d).toMatch(/^M 40 0 L 80 70 L 0 70 Z$/)
    expect(d).not.toContain('A ') // no arc segment
  })

  it('DIAG-3.6-01: outCount>=3 → triangle with circular arc base', () => {
    const d = getConditionPath(100, 65, 4)
    expect(d).toMatch(/^M 50 0 L/) // starts at top-vertex
    expect(d).toContain('A ') // SVG arc command present
    expect(d.endsWith(' Z')).toBe(true)
  })
})

describe('getConditionAnchors', () => {
  it('DIAG-3.6-04/05: returns 1 cond-in + N cond-out-i anchors', () => {
    const anchors = getConditionAnchors(0, 0, 81, 70, 3, 0)
    expect(anchors).toHaveLength(4) // 1 in + 3 out
    expect(anchors[0].id).toBe('cond-in')
    expect(anchors[0].anchorType).toBe('in')
    expect(anchors.slice(1).map((a) => a.id)).toEqual([
      'cond-out-0', 'cond-out-1', 'cond-out-2',
    ])
    expect(anchors.slice(1).every((a) => a.anchorType === 'out')).toBe(true)
  })

  it('outCount<2 is clamped to 2 (minimum base points)', () => {
    const anchors = getConditionAnchors(0, 0, 81, 70, 1, 0)
    expect(anchors).toHaveLength(3) // 1 in + 2 out (clamped)
    expect(anchors.slice(1).map((a) => a.id)).toEqual([
      'cond-out-0', 'cond-out-1',
    ])
  })

  it('DIAG-3.6-06: cond-in sits directly above center (rotation=0)', () => {
    const anchors = getConditionAnchors(50, 50, 81, 70, 2, 0)
    const inAnchor = anchors.find((a) => a.id === 'cond-in')!
    expect(inAnchor.x).toBe(50)
    expect(inAnchor.y).toBe(50 - 70 / 2) // ehh=35 (no arc at outCount=2)
  })

  it('DIAG-3.6-06: out-anchors distributed symmetrically around base', () => {
    // outCount=2: two corners at (cx±w/2, cy+h/2)
    const anchors = getConditionAnchors(100, 100, 80, 70, 2, 0)
    const outs = anchors.filter((a) => a.anchorType === 'out')
    expect(outs[0].x).toBeCloseTo(60, 5)
    expect(outs[0].y).toBeCloseTo(135, 5)
    expect(outs[1].x).toBeCloseTo(140, 5)
    expect(outs[1].y).toBeCloseTo(135, 5)
  })

  it('rotation rotates every anchor around the center', () => {
    // Rotate 90° — cond-in should move from "above" to "to the right of" center.
    const anchors = getConditionAnchors(0, 0, 80, 70, 2, 90)
    const inAnchor = anchors.find((a) => a.id === 'cond-in')!
    expect(inAnchor.x).toBeCloseTo(35, 5) // previous y=-35 becomes x=+35
    expect(inAnchor.y).toBeCloseTo(0, 5)
  })
})

describe('getConditionAnchorPosition', () => {
  it('returns position of named anchor', () => {
    const pos = getConditionAnchorPosition('cond-in', 100, 100, 80, 70, 2, 0)
    expect(pos).toEqual({ x: 100, y: 65 })
  })

  it('unknown anchor ID falls back to center', () => {
    const pos = getConditionAnchorPosition('no-such-anchor', 100, 100, 80, 70, 2, 0)
    expect(pos).toEqual({ x: 100, y: 100 })
  })
})

describe('getConditionAnchorDirection', () => {
  it('cond-in direction points up with rotation=0', () => {
    expect(getConditionAnchorDirection('cond-in', 0, 0, 80, 70, 2, 0))
      .toEqual({ dx: 0, dy: -1 })
  })

  it('cond-in direction rotates with node rotation', () => {
    const d = getConditionAnchorDirection('cond-in', 0, 0, 80, 70, 2, 180)
    expect(d.dx).toBeCloseTo(0, 5)
    expect(d.dy).toBeCloseTo(1, 5)
  })

  it('cond-out-* direction points outward from center (unit length)', () => {
    const d = getConditionAnchorDirection('cond-out-0', 0, 0, 80, 70, 2, 0)
    const len = Math.sqrt(d.dx * d.dx + d.dy * d.dy)
    expect(len).toBeCloseTo(1, 5)
    // cond-out-0 sits at (-40, 35) → direction is normalized (-40, 35)/|…|
    expect(d.dx).toBeLessThan(0)
    expect(d.dy).toBeGreaterThan(0)
  })
})
