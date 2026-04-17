import { describe, it, expect } from 'vitest'
import { Database } from 'lucide-react'
import type { NodeData } from '../types'
import { getDistinctTypes, getNodesByType } from './typeUtils'

// Covers DIAG-3.13-35 (distinct-type tree) and 3.13-36 (select-all-by-type) at
// the logic layer. Panel rendering is covered by LayerProperties.test.tsx.

const node = (id: string, type?: string): NodeData => ({
  id, label: id, type, icon: Database, x: 0, y: 0, w: 100, layer: 'L',
})

describe('getDistinctTypes (DIAG-3.13-35)', () => {
  it('returns unique, sorted type names', () => {
    const nodes = [node('a', 'Server'), node('b', 'Database'), node('c', 'Server')]
    expect(getDistinctTypes(nodes)).toEqual(['Database', 'Server'])
  })

  it('skips nodes without a type', () => {
    const nodes = [node('a', 'Server'), node('b'), node('c', 'Database')]
    expect(getDistinctTypes(nodes)).toEqual(['Database', 'Server'])
  })

  it('empty input → empty array', () => {
    expect(getDistinctTypes([])).toEqual([])
  })

  it('all-untyped → empty array', () => {
    expect(getDistinctTypes([node('a'), node('b')])).toEqual([])
  })
})

describe('getNodesByType (DIAG-3.13-36)', () => {
  const nodes = [
    node('a', 'Server'),
    node('b', 'Database'),
    node('c', 'Server'),
    node('d'),
  ]

  it('returns every node whose type matches', () => {
    expect(getNodesByType(nodes, 'Server').map((n) => n.id).sort()).toEqual(['a', 'c'])
    expect(getNodesByType(nodes, 'Database').map((n) => n.id)).toEqual(['b'])
  })

  it('unknown type → empty array', () => {
    expect(getNodesByType(nodes, 'NonExistent')).toEqual([])
  })

  it('untyped nodes are never returned by any type filter', () => {
    expect(getNodesByType(nodes, 'Server').find((n) => n.id === 'd')).toBeUndefined()
  })
})
