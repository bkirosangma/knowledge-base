import { describe, it, expect, beforeEach } from 'vitest'
import {
  scopedKey,
  setDirectoryScope,
  getDirectoryScope,
  clearDirectoryScope,
} from './directoryScope'

// Covers PERSIST-7.1-01, 7.1-02, 7.1-03. See test-cases/07-persistence.md §7.1.

// Module-level currentScope must be reset between tests.
beforeEach(() => {
  clearDirectoryScope()
})

describe('directoryScope', () => {
  it('PERSIST-7.1-02: scopedKey returns base unchanged when no scope is set', () => {
    expect(getDirectoryScope()).toBeNull()
    expect(scopedKey('explorer.sort')).toBe('explorer.sort')
  })

  it('PERSIST-7.1-01: scopedKey appends [scopeId] suffix when a scope is set', () => {
    setDirectoryScope('abc12345')
    expect(scopedKey('explorer.sort')).toBe('explorer.sort[abc12345]')
  })

  it('setDirectoryScope / getDirectoryScope round-trip', () => {
    setDirectoryScope('my-scope')
    expect(getDirectoryScope()).toBe('my-scope')
  })

  it('clearDirectoryScope resets state to null', () => {
    setDirectoryScope('transient')
    clearDirectoryScope()
    expect(getDirectoryScope()).toBeNull()
    expect(scopedKey('key')).toBe('key')
  })

  it('PERSIST-7.1-03: different scopes produce distinct keys for the same base', () => {
    setDirectoryScope('A')
    const keyA = scopedKey('explorer.filter')

    setDirectoryScope('B')
    const keyB = scopedKey('explorer.filter')

    expect(keyA).toBe('explorer.filter[A]')
    expect(keyB).toBe('explorer.filter[B]')
    expect(keyA).not.toBe(keyB)
  })

  it('scope suffix is applied to any base string (not just predefined ones)', () => {
    setDirectoryScope('s1')
    expect(scopedKey('anything-goes-here')).toBe('anything-goes-here[s1]')
    expect(scopedKey('')).toBe('[s1]') // empty base still gets the suffix
  })
})
