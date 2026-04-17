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

  it('known lucide aliases do NOT round-trip (documented bug)', () => {
    // lucide-react re-exports some icons under legacy aliases; the underlying
    // component's displayName is the new canonical name, so saving a
    // BarChart/Fingerprint icon writes the canonical name to disk — which is
    // then NOT in the registry, causing loadDiagramFromData to fall back to
    // Database. These two are the only currently-affected entries.
    expect(getIconName(getIcon('BarChart')!)).toBe('ChartNoAxesColumnIncreasing')
    expect(getIconName(getIcon('Fingerprint')!)).toBe('FingerprintPattern')
  })

  it('DIAG-3.4-05: component with no displayName/name returns "Unknown"', () => {
    // A plain object cast as ComponentType has neither property defined.
    const anon = {} as unknown as ComponentType<{ size?: number }>
    expect(getIconName(anon)).toBe('Unknown')
  })

  it('prefers displayName over function.name when both exist', () => {
    // Function.name is "Alpha"; displayName is "Beta" → getIconName → "Beta".
    const Comp = function Alpha() { return null } as unknown as ComponentType<unknown> & { displayName: string }
    Comp.displayName = 'Beta'
    expect(getIconName(Comp)).toBe('Beta')
  })

  it('falls back to function.name when displayName is undefined', () => {
    const Comp = function MyIcon() { return null } as unknown as ComponentType<unknown>
    expect(getIconName(Comp)).toBe('MyIcon')
  })
})
