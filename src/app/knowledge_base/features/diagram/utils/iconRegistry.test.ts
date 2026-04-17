import { describe, it, expect } from 'vitest'
import { Database, Server } from 'lucide-react'
import type { ComponentType } from 'react'
import { getIcon, getIconName, getIconNames } from './iconRegistry'

// Covers DIAG-3.4-01 through 3.4-05. See test-cases/03-diagram.md §3.4.

describe('getIconNames', () => {
  it('DIAG-3.4-01: registry has exactly 41 entries', () => {
    expect(getIconNames()).toHaveLength(41)
  })

  it('returns names as strings with no duplicates', () => {
    const names = getIconNames()
    expect(new Set(names).size).toBe(names.length)
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true)
  })

  it('includes the canonical lucide names (Database/Server/Cloud/…)', () => {
    const names = getIconNames()
    for (const expected of ['Database', 'Server', 'Cloud', 'Shield', 'User']) {
      expect(names).toContain(expected)
    }
  })
})

describe('getIcon', () => {
  it('DIAG-3.4-02: known name returns the component', () => {
    expect(getIcon('Database')).toBe(Database)
    expect(getIcon('Server')).toBe(Server)
  })

  it('DIAG-3.4-03: unknown name returns undefined (no throw)', () => {
    expect(getIcon('Nonexistent')).toBeUndefined()
    expect(getIcon('')).toBeUndefined()
  })
})

describe('getIconName', () => {
  it('DIAG-3.4-04: round-trip works for canonical lucide names', () => {
    // Spec-referenced icons known to round-trip cleanly.
    for (const name of ['Server', 'Database', 'Cloud', 'Shield', 'User', 'Box', 'Cpu']) {
      const icon = getIcon(name)!
      expect(getIconName(icon)).toBe(name)
    }
  })

  it('lucide legacy aliases (BarChart, Fingerprint) round-trip via reverse-lookup', () => {
    // lucide-react re-exports BarChart → ChartNoAxesColumnIncreasing and
    // Fingerprint → FingerprintPattern; the underlying component's displayName
    // is the new canonical name. getIconName reverse-looks up the registry so
    // the key we wrote (BarChart/Fingerprint) is what we read back, not the
    // canonical displayName.
    expect(getIconName(getIcon('BarChart')!)).toBe('BarChart')
    expect(getIconName(getIcon('Fingerprint')!)).toBe('Fingerprint')
  })

  it('DIAG-3.4-05: component not in the registry returns "Unknown"', () => {
    // Anything that isn't registered — a plain object, an arbitrary component
    // — has no registry entry to reverse-look-up, so getIconName returns the
    // sentinel "Unknown".
    const anon = {} as unknown as ComponentType<{ size?: number }>
    expect(getIconName(anon)).toBe('Unknown')

    const UnregisteredComp = function MyIcon() { return null } as unknown as ComponentType<unknown>
    expect(getIconName(UnregisteredComp)).toBe('Unknown')
  })
})
