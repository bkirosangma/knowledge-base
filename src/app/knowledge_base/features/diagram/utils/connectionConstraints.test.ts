import { describe, it, expect } from 'vitest'
import { Database } from 'lucide-react'
import type { NodeData, Connection } from '../types'
import { validateConnection } from './connectionConstraints'

// Covers the validateConnection contract — partial DIAG-3.9-05 "reconnect
// blocked by constraints" at the logic layer.

const node = (id: string, shape?: NodeData['shape']): NodeData => {
  const base = { id, label: id, layer: 'L', icon: Database, x: 0, y: 0, w: 100 };
  if (shape === 'condition') {
    return { ...base, shape: 'condition', conditionOutCount: 2, conditionSize: 1 as const };
  }
  return base;
}
const conn = (id: string, from: string, to: string, fromAnchor = 'right', toAnchor = 'left'): Connection => ({
  id, from, to,
  fromAnchor: fromAnchor as Connection['fromAnchor'],
  toAnchor: toAnchor as Connection['toAnchor'],
  color: '#000', label: '',
})

describe('validateConnection — anchor role enforcement', () => {
  it('rejects cond-in as a source anchor', () => {
    const result = validateConnection(node('c', 'condition'), 'cond-in', node('n'), 'left', [])
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/receive/i)
  })

  it('rejects cond-out as a destination anchor', () => {
    const result = validateConnection(node('n'), 'right', node('c', 'condition'), 'cond-out-1', [])
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/send/i)
  })

  it('accepts a regular anchor pairing', () => {
    const result = validateConnection(node('a'), 'right', node('b'), 'left', [])
    expect(result.valid).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it('accepts cond-out → regular anchor', () => {
    const result = validateConnection(node('c', 'condition'), 'cond-out-1', node('b'), 'left', [])
    expect(result.valid).toBe(true)
  })

  it('accepts regular anchor → cond-in', () => {
    const result = validateConnection(node('a'), 'right', node('c', 'condition'), 'cond-in', [])
    expect(result.valid).toBe(true)
  })
})

describe('validateConnection — cond-in fan-in guard', () => {
  it('rejects a second incoming connection when cond-in already has one', () => {
    const existing = [conn('c1', 'src', 'target', 'right', 'cond-in')]
    const result = validateConnection(node('a'), 'right', node('target', 'condition'), 'cond-in', existing)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/already has an incoming/i)
  })

  it('allows cond-in on a different condition node', () => {
    const existing = [conn('c1', 'src', 'other-target', 'right', 'cond-in')]
    const result = validateConnection(node('a'), 'right', node('my-target', 'condition'), 'cond-in', existing)
    expect(result.valid).toBe(true)
  })
})
