import { describe, it, expect } from 'vitest'
import { computeLevelMap, getCollisionPeers } from './levelModel'
import type { NodeData, Connection } from '../types'

// Covers DIAG-3.7-10 through 3.7-13. See test-cases/03-diagram.md §3.7.

/** Minimal NodeData factory — only fills fields computeLevelMap reads. */
function node(
  id: string,
  layer: string,
  shape?: 'rect' | 'condition',
): NodeData {
  return {
    id, label: id, icon: 'Box', x: 0, y: 0, w: 150,
    layer,
    ...(shape ? { shape } : {}),
  }
}

/** Minimal Connection factory with configurable toAnchor (so we can test cond-in gating). */
function conn(
  id: string, from: string, to: string, toAnchor: string = 'cond-in',
): Connection {
  return {
    id, from, to,
    fromAnchor: 'right-1',
    toAnchor: toAnchor as Connection['toAnchor'],
    color: '#000', label: '',
  }
}

describe('computeLevelMap', () => {
  it('DIAG-3.7-10: layerless node → level 1, base "canvas"', () => {
    const map = computeLevelMap([node('n1', '')], [])
    expect(map.get('n1')).toEqual({ level: 1, base: 'canvas' })
  })

  it('DIAG-3.7-11: in-layer node → level 2, base = layerId', () => {
    const map = computeLevelMap([node('n1', 'L1')], [])
    expect(map.get('n1')).toEqual({ level: 2, base: 'L1' })
  })

  it('DIAG-3.7-12: condition inherits source level when all outputs share base', () => {
    // Source n1 and target n2 both in layer L1; condition c1 also in L1.
    // All outputs stay inside L1 → condition stays at (2, L1).
    const nodes = [
      node('n1', 'L1'),
      node('n2', 'L1'),
      node('c1', 'L1', 'condition'),
    ]
    const conns = [
      conn('e1', 'n1', 'c1', 'cond-in'),
      conn('e2', 'c1', 'n2', 'left-1'),
    ]
    const map = computeLevelMap(nodes, conns)
    expect(map.get('c1')).toEqual({ level: 2, base: 'L1' })
  })

  it('DIAG-3.7-12: condition demoted when output crosses base', () => {
    // Source n1 in L1; condition c1 in L1; one output goes to canvas node n2.
    // Cross-base → condition demoted to (1, "canvas").
    const nodes = [
      node('n1', 'L1'),
      node('n2', ''),
      node('c1', 'L1', 'condition'),
    ]
    const conns = [
      conn('e1', 'n1', 'c1', 'cond-in'),
      conn('e2', 'c1', 'n2', 'left-1'),
    ]
    const map = computeLevelMap(nodes, conns)
    expect(map.get('c1')).toEqual({ level: 1, base: 'canvas' })
  })

  it('condition with no incoming cond-in connection → level 1, base "canvas"', () => {
    // c1 has no inbound edge landing on cond-in.
    const nodes = [node('n1', 'L1'), node('c1', 'L1', 'condition')]
    const conns = [conn('ignored', 'n1', 'c1', 'left-1')] // wrong anchor
    const map = computeLevelMap(nodes, conns)
    expect(map.get('c1')).toEqual({ level: 1, base: 'canvas' })
  })

  it('condition whose source is unknown → level 1, base "canvas"', () => {
    // Source "ghost" isn't in the nodes list, so map.get returns undefined.
    const nodes = [node('c1', 'L1', 'condition')]
    const conns = [conn('e1', 'ghost', 'c1', 'cond-in')]
    const map = computeLevelMap(nodes, conns)
    expect(map.get('c1')).toEqual({ level: 1, base: 'canvas' })
  })

  it('condition with no outbound → inherits source (no cross-base possible)', () => {
    const nodes = [node('n1', 'L1'), node('c1', 'L1', 'condition')]
    const conns = [conn('e1', 'n1', 'c1', 'cond-in')]
    const map = computeLevelMap(nodes, conns)
    expect(map.get('c1')).toEqual({ level: 2, base: 'L1' })
  })

  it('handles mix of canvas and layer nodes in a single pass', () => {
    const nodes = [
      node('a', ''),
      node('b', 'L1'),
      node('c', 'L2'),
    ]
    const map = computeLevelMap(nodes, [])
    expect(map.get('a')).toEqual({ level: 1, base: 'canvas' })
    expect(map.get('b')).toEqual({ level: 2, base: 'L1' })
    expect(map.get('c')).toEqual({ level: 2, base: 'L2' })
  })

  it('returns empty map for empty input', () => {
    expect(computeLevelMap([], []).size).toBe(0)
  })
})

describe('getCollisionPeers', () => {
  // Setup: two canvas nodes, one in L1, one in L2, plus a condition.
  const nodes: NodeData[] = [
    node('a', ''),
    node('b', ''),
    node('c', 'L1'),
    node('d', 'L1'),
    node('e', 'L2'),
  ]
  const map = computeLevelMap(nodes, [])

  it('DIAG-3.7-13: returns peers sharing both level and base (excluding self)', () => {
    // 'a' is (1, canvas); peer 'b' shares that cell.
    const peers = getCollisionPeers('a', nodes, map)
    expect(peers.map((p) => p.id)).toEqual(['b'])
  })

  it('DIAG-3.7-13: excludes nodes in other layers (different base)', () => {
    // 'c' is (2, L1); sibling 'd' in L1; 'e' in L2 must NOT be a peer.
    const peers = getCollisionPeers('c', nodes, map)
    expect(peers.map((p) => p.id)).toEqual(['d'])
  })

  it('DIAG-3.7-13: excludes canvas nodes from layer peers (different level)', () => {
    // 'c' is (2, L1); 'a' and 'b' on canvas must NOT appear.
    const peers = getCollisionPeers('c', nodes, map)
    expect(peers.find((p) => p.id === 'a')).toBeUndefined()
    expect(peers.find((p) => p.id === 'b')).toBeUndefined()
  })

  it('returns empty array for a node missing from the level map', () => {
    expect(getCollisionPeers('unknown', nodes, map)).toEqual([])
  })

  it('lone node in its cell has no peers', () => {
    // 'e' is alone in L2.
    expect(getCollisionPeers('e', nodes, map)).toEqual([])
  })
})
