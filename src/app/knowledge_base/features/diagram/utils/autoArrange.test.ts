import { describe, it, expect } from 'vitest'
import { Database } from 'lucide-react'
import type { NodeData, Connection } from '../types'
import { hierarchicalLayout, forceDirectedLayout } from './autoArrange'
import { snapToGrid } from './gridSnap'

// Covers DIAG-3.15-07..12 (auto-arrange algorithm).

const node = (id: string, x = 0, y = 0): NodeData => ({
  id, label: id, layer: 'L', icon: Database, x, y, w: 100,
})
const conn = (id: string, from: string, to: string): Connection => ({
  id, from, to,
  fromAnchor: 'right' as Connection['fromAnchor'],
  toAnchor: 'left' as Connection['toAnchor'],
  color: '#000', label: '',
})

// ── hierarchicalLayout ─────────────────────────────────────────────────────

describe('hierarchicalLayout — DAG shape (DIAG-3.15-07)', () => {
  it('DIAG-3.15-07: simple chain (a→b→c) assigns ranks 0, 1, 2 in TB', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c')]
    const out = hierarchicalLayout(nodes, conns, { direction: 'TB' })
    const ya = out.get('a')!.y
    const yb = out.get('b')!.y
    const yc = out.get('c')!.y
    expect(ya).toBeLessThan(yb)
    expect(yb).toBeLessThan(yc)
  })

  it('independent roots get the same rank (both at y=0 in TB)', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const conns = [conn('c1', 'a', 'c'), conn('c2', 'b', 'c')]
    const out = hierarchicalLayout(nodes, conns, { direction: 'TB' })
    expect(out.get('a')!.y).toBe(out.get('b')!.y)
    expect(out.get('c')!.y).toBeGreaterThan(out.get('a')!.y)
  })

  it('empty nodes → empty result', () => {
    expect(hierarchicalLayout([], [], {}).size).toBe(0)
  })

  it('handles a single node', () => {
    const out = hierarchicalLayout([node('solo')], [], { direction: 'TB' })
    expect(out.size).toBe(1)
    const p = out.get('solo')!
    expect(p.x).toBe(snapToGrid(p.x))
    expect(p.y).toBe(snapToGrid(p.y))
  })
})

describe('hierarchicalLayout — rank spacing (DIAG-3.15-08)', () => {
  it('DIAG-3.15-08: TB chain has rank spacing of 180 px', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c')]
    const out = hierarchicalLayout(nodes, conns, { direction: 'TB' })
    const ya = out.get('a')!.y
    const yb = out.get('b')!.y
    const yc = out.get('c')!.y
    expect(yb - ya).toBe(180)
    expect(yc - yb).toBe(180)
  })
})

describe('hierarchicalLayout — direction rotation (DIAG-3.15-10)', () => {
  it('DIAG-3.15-10: LR direction rotates layout — rank separation is on x-axis', () => {
    const nodes = [node('a'), node('b'), node('c')]
    const conns = [conn('c1', 'a', 'b'), conn('c2', 'b', 'c')]
    const out = hierarchicalLayout(nodes, conns, { direction: 'LR' })
    const xa = out.get('a')!.x
    const xb = out.get('b')!.x
    const xc = out.get('c')!.x
    expect(xa).toBeLessThan(xb)
    expect(xb).toBeLessThan(xc)
    expect(xb - xa).toBe(180)
  })

  it('LR direction keeps siblings on the y axis (same rank, stacked vertically)', () => {
    // Two independent roots feed into one sink.
    const nodes = [node('a'), node('b'), node('c')]
    const conns = [conn('c1', 'a', 'c'), conn('c2', 'b', 'c')]
    const out = hierarchicalLayout(nodes, conns, { direction: 'LR' })
    expect(out.get('a')!.x).toBe(out.get('b')!.x)
    expect(out.get('a')!.y).not.toBe(out.get('b')!.y)
  })
})

describe('hierarchicalLayout — grid snap (DIAG-3.15-12)', () => {
  it('DIAG-3.15-12: every coordinate lands on the grid', () => {
    const nodes = Array.from({ length: 6 }, (_, i) => node(`n${i}`))
    const conns: Connection[] = [
      conn('c1', 'n0', 'n1'),
      conn('c2', 'n0', 'n2'),
      conn('c3', 'n1', 'n3'),
      conn('c4', 'n2', 'n3'),
      conn('c5', 'n3', 'n4'),
      conn('c6', 'n4', 'n5'),
    ]
    const out = hierarchicalLayout(nodes, conns, { direction: 'TB' })
    for (const p of out.values()) {
      expect(p.x).toBe(snapToGrid(p.x))
      expect(p.y).toBe(snapToGrid(p.y))
    }
  })
})

// ── forceDirectedLayout (DIAG-3.15-11 substitute) ──────────────────────────

describe('forceDirectedLayout', () => {
  it('empty input → empty result', () => {
    expect(forceDirectedLayout([], []).size).toBe(0)
  })

  it('spreads nodes apart (connected pair does not collapse to identical coords)', () => {
    const out = forceDirectedLayout(
      [node('a', 0, 0), node('b', 10, 10)],
      [conn('c', 'a', 'b')],
    )
    const pa = out.get('a')!
    const pb = out.get('b')!
    const dx = pa.x - pb.x
    const dy = pa.y - pb.y
    expect(Math.hypot(dx, dy)).toBeGreaterThan(0)
  })

  it('outputs grid-snapped positions', () => {
    const nodes = [node('a', 0, 0), node('b', 100, 0), node('c', 0, 100)]
    const conns: Connection[] = [conn('c1', 'a', 'b'), conn('c2', 'a', 'c')]
    const out = forceDirectedLayout(nodes, conns)
    for (const p of out.values()) {
      expect(p.x).toBe(snapToGrid(p.x))
      expect(p.y).toBe(snapToGrid(p.y))
    }
  })
})
