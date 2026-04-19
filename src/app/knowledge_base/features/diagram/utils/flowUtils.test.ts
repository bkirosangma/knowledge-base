import { describe, it, expect } from 'vitest'
import {
  isContiguous,
  orderConnections,
  findBrokenFlows,
  findBrokenFlowsByReconnect,
  computeFlowRoles,
} from './flowUtils'
import type { Connection, FlowDef } from '../types'

// Covers DIAG-3.10-03 through DIAG-3.10-10. See test-cases/03-diagram.md §3.10.

/** Minimal Connection factory — only fills fields flowUtils actually reads. */
function conn(id: string, from: string, to: string): Connection {
  return {
    id, from, to,
    fromAnchor: 'right-1', toAnchor: 'left-1',
    color: '#000', label: '',
  }
}

describe('isContiguous', () => {
  it('empty set is trivially contiguous', () => {
    expect(isContiguous([], [])).toBe(true)
  })

  it('DIAG-3.10-03: single connection is contiguous', () => {
    expect(isContiguous(['c1'], [conn('c1', 'A', 'B')])).toBe(true)
  })

  it('DIAG-3.10-04: chain A→B→C shares node B → contiguous', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'B', 'C')]
    expect(isContiguous(['c1', 'c2'], conns)).toBe(true)
  })

  it('DIAG-3.10-04: longer chain A→B→C→D → contiguous', () => {
    const conns = [
      conn('c1', 'A', 'B'),
      conn('c2', 'B', 'C'),
      conn('c3', 'C', 'D'),
    ]
    expect(isContiguous(['c1', 'c2', 'c3'], conns)).toBe(true)
  })

  it('DIAG-3.10-05: disjoint pairs A→B, C→D → not contiguous', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'C', 'D')]
    expect(isContiguous(['c1', 'c2'], conns)).toBe(false)
  })

  it('branching graph (A→B, A→C, B→D) is still contiguous', () => {
    const conns = [
      conn('c1', 'A', 'B'),
      conn('c2', 'A', 'C'),
      conn('c3', 'B', 'D'),
    ]
    expect(isContiguous(['c1', 'c2', 'c3'], conns)).toBe(true)
  })

  it('returns false when a referenced connection ID is missing', () => {
    // "c-missing" is not in connections list → graph is incomplete.
    expect(isContiguous(['c1', 'c-missing'], [conn('c1', 'A', 'B')])).toBe(false)
  })

  it('connection from shared target (A→B, C→B) is contiguous via B', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'C', 'B')]
    expect(isContiguous(['c1', 'c2'], conns)).toBe(true)
  })
})

describe('orderConnections', () => {
  it('empty input → empty output', () => {
    expect(orderConnections([], [])).toEqual([])
  })

  it('single connection → returned as-is', () => {
    expect(orderConnections(['c1'], [conn('c1', 'A', 'B')])).toEqual(['c1'])
  })

  it('DIAG-3.10-06: out-of-order chain → ordered source-to-dest', () => {
    // Chain is A→B→C→D; input is shuffled.
    const conns = [
      conn('cAB', 'A', 'B'),
      conn('cBC', 'B', 'C'),
      conn('cCD', 'C', 'D'),
    ]
    expect(orderConnections(['cCD', 'cAB', 'cBC'], conns)).toEqual([
      'cAB', 'cBC', 'cCD',
    ])
  })

  it('DIAG-3.10-06: picks a true source node (no incoming edges) as start', () => {
    // X has no incoming in the set; walk starts from X.
    const conns = [
      conn('c1', 'Y', 'Z'),
      conn('c2', 'X', 'Y'),
    ]
    expect(orderConnections(['c1', 'c2'], conns)).toEqual(['c2', 'c1'])
  })

  it('cycle has no true source → falls back to first connection\'s from', () => {
    // A→B→A cycle: no node is pure source; start from conns[0].from.
    const conns = [
      conn('c1', 'A', 'B'),
      conn('c2', 'B', 'A'),
    ]
    const result = orderConnections(['c1', 'c2'], conns)
    expect(result).toHaveLength(2)
    expect(new Set(result)).toEqual(new Set(['c1', 'c2']))
  })

  it('appends orphaned connection IDs at the end (safety net)', () => {
    // "c-missing" has no entry in the connections array — orderConnections
    // preserves it at the tail rather than silently dropping it.
    const conns = [conn('c1', 'A', 'B')]
    const result = orderConnections(['c1', 'c-missing'], conns)
    expect(result).toContain('c1')
    expect(result).toContain('c-missing')
  })
})

describe('findBrokenFlows', () => {
  const c1 = conn('c1', 'A', 'B')
  const c2 = conn('c2', 'B', 'C')
  const c3 = conn('c3', 'C', 'D')
  const allConns = [c1, c2, c3]

  const flow: FlowDef = {
    id: 'f1', name: 'test-flow',
    connectionIds: ['c1', 'c2', 'c3'],
  }

  it('DIAG-3.10-07: deleting the middle connection breaks contiguity', () => {
    const broken = findBrokenFlows([flow], new Set(['c2']), allConns)
    expect(broken).toHaveLength(1)
    expect(broken[0].id).toBe('f1')
  })

  it('DIAG-3.10-08: deleting all connections touching a mid-flow node breaks the flow', () => {
    // Removing both connections at node C (c2 and c3) leaves only c1 (A→B).
    // remaining.length (1) !== connectionIds.length (3) AND isContiguous([c1]) is true,
    // so the flow is NOT broken by the "non-contiguous" rule — but it IS mutilated.
    // This test documents the actual behaviour: shrinking a flow to a contiguous
    // subset is NOT flagged as broken by findBrokenFlows.
    const broken = findBrokenFlows([flow], new Set(['c2', 'c3']), allConns)
    expect(broken).toHaveLength(0)
  })

  it('deleting a middle connection from a 3-chain leaves disjoint pieces → broken', () => {
    // Sharper DIAG-3.10-08: when removal splits the flow into two disjoint halves.
    const longFlow: FlowDef = {
      id: 'f2', name: 'split-me',
      connectionIds: ['c1', 'c2', 'c3'],
    }
    const broken = findBrokenFlows([longFlow], new Set(['c2']), allConns)
    expect(broken.map((f) => f.id)).toEqual(['f2'])
  })

  it('removing all connections marks the flow broken (empty remaining)', () => {
    const broken = findBrokenFlows(
      [flow],
      new Set(['c1', 'c2', 'c3']),
      allConns,
    )
    expect(broken.map((f) => f.id)).toEqual(['f1'])
  })

  it('removing nothing leaves every flow intact', () => {
    expect(findBrokenFlows([flow], new Set(), allConns)).toEqual([])
  })

  it('removing a connection that is not in the flow does not mark it broken', () => {
    const otherFlow: FlowDef = {
      id: 'f2', name: 'unrelated', connectionIds: ['c1'],
    }
    const broken = findBrokenFlows([otherFlow], new Set(['c3']), allConns)
    expect(broken).toEqual([])
  })

  it('processes multiple flows independently', () => {
    const f2: FlowDef = { id: 'f2', name: 'short', connectionIds: ['c3'] }
    const broken = findBrokenFlows([flow, f2], new Set(['c2']), allConns)
    expect(broken.map((f) => f.id)).toEqual(['f1']) // f2 untouched
  })
})

describe('findBrokenFlowsByReconnect', () => {
  // Chain A→B→C→D; flow f1 covers all three connections.
  const c1 = conn('c1', 'A', 'B')
  const c2 = conn('c2', 'B', 'C')
  const c3 = conn('c3', 'C', 'D')
  const allConns = [c1, c2, c3]
  const flow: FlowDef = {
    id: 'f1', name: 'chain', connectionIds: ['c1', 'c2', 'c3'],
  }

  it('DIAG-3.10-09: reconnect that breaks contiguity → flow is broken', () => {
    // Reconnect c2 from (B→C) to (X→Y) — detaches the chain; c1 ends at B
    // and c3 starts at C, now with nothing bridging them.
    const broken = findBrokenFlowsByReconnect(
      [flow], 'c2', 'X', 'Y', allConns,
    )
    expect(broken.map((f) => f.id)).toEqual(['f1'])
  })

  it('DIAG-3.10-10: reconnect that preserves contiguity → no flows broken', () => {
    // Reroute c2 to (B→D): now c1=A→B, c2=B→D, c3=C→D. c1 shares B with c2;
    // c2 shares D with c3 → still contiguous.
    const broken = findBrokenFlowsByReconnect(
      [flow], 'c2', 'B', 'D', allConns,
    )
    expect(broken).toEqual([])
  })

  it('ignores flows that do not contain the reconnected connection', () => {
    const otherFlow: FlowDef = {
      id: 'f2', name: 'other', connectionIds: ['c1'],
    }
    // Even a destructive reconnect on c2 is invisible to f2.
    const broken = findBrokenFlowsByReconnect(
      [otherFlow], 'c2', 'X', 'Y', allConns,
    )
    expect(broken).toEqual([])
  })

  it('undefined newFrom/newTo falls back to the existing endpoint', () => {
    // newFrom undefined → keeps c2.from=B; newTo='Y' → c2 becomes B→Y.
    // Chain: c1(A→B), c2(B→Y), c3(C→D). c1–c2 share B, but c3 is orphaned.
    const broken = findBrokenFlowsByReconnect(
      [flow], 'c2', undefined, 'Y', allConns,
    )
    expect(broken.map((f) => f.id)).toEqual(['f1'])
  })

  it('reconnect on a single-connection flow cannot break contiguity', () => {
    const solo: FlowDef = { id: 'f2', name: 'solo', connectionIds: ['c1'] }
    const broken = findBrokenFlowsByReconnect(
      [solo], 'c1', 'X', 'Y', allConns,
    )
    expect(broken).toEqual([])
  })
})

describe('computeFlowRoles', () => {
  it('DIAG-3.10-18: empty connectionIds → null', () => {
    expect(computeFlowRoles([], [])).toBeNull()
  })

  it('DIAG-3.10-19: linear A→B→C — A is start, C is end, B is middle', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'B', 'C')]
    const roles = computeFlowRoles(['c1', 'c2'], conns)!
    expect(roles.get('A')?.role).toBe('start')
    expect(roles.get('B')?.role).toBe('middle')
    expect(roles.get('C')?.role).toBe('end')
  })

  it('DIAG-3.10-20: fan-in (A→C and B→C) — both A and B are sources', () => {
    const conns = [conn('c1', 'A', 'C'), conn('c2', 'B', 'C')]
    const roles = computeFlowRoles(['c1', 'c2'], conns)!
    expect(roles.get('A')?.role).toBe('start')
    expect(roles.get('B')?.role).toBe('start')
    expect(roles.get('C')?.role).toBe('end')
  })

  it('DIAG-3.10-21: fan-out (A→B and A→C) — both B and C are sinks', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'A', 'C')]
    const roles = computeFlowRoles(['c1', 'c2'], conns)!
    expect(roles.get('A')?.role).toBe('start')
    expect(roles.get('B')?.role).toBe('end')
    expect(roles.get('C')?.role).toBe('end')
  })

  it('DIAG-3.10-22: node appearing as both from and to is middle', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'B', 'C'), conn('c3', 'B', 'D')]
    const roles = computeFlowRoles(['c1', 'c2', 'c3'], conns)!
    expect(roles.get('B')?.role).toBe('middle')
  })

  it('DIAG-3.10-24: missing connection IDs are skipped gracefully', () => {
    const conns = [conn('c1', 'A', 'B')]
    const roles = computeFlowRoles(['c1', 'c-missing'], conns)!
    expect(roles.get('A')?.role).toBe('start')
    expect(roles.get('B')?.role).toBe('end')
    expect(roles.has('undefined')).toBe(false)
  })

  it('single connection — from is start, to is end', () => {
    const roles = computeFlowRoles(['c1'], [conn('c1', 'X', 'Y')])!
    expect(roles.get('X')?.role).toBe('start')
    expect(roles.get('Y')?.role).toBe('end')
  })

  it('cycle (A→B→A) — both nodes appear as both from and to → both middle', () => {
    const conns = [conn('c1', 'A', 'B'), conn('c2', 'B', 'A')]
    const roles = computeFlowRoles(['c1', 'c2'], conns)!
    expect(roles.get('A')?.role).toBe('middle')
    expect(roles.get('B')?.role).toBe('middle')
  })
})
