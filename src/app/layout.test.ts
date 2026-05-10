import { describe, it, expect, vi } from 'vitest'

vi.mock('next/font/google', () => {
  const stub = (key: string) => () => ({
    variable: `--font-${key}`,
    className: `font-${key}`,
    style: { fontFamily: key },
  })
  return { Geist: stub('geist-sans'), Geist_Mono: stub('geist-mono') }
})

vi.mock('./globals.css', () => ({}))
vi.mock('./globals.print.css', () => ({}))

// SHELL-1.15-03: Next 16 moved themeColor out of `metadata` and into the
// dedicated `viewport` export. Build-time the classifier is silent, so this
// asserts the convention directly against the layout module.
describe('SHELL-1.15-03: app/layout.tsx Next 16 metadata classifier', () => {
  it('exports themeColor on the viewport export', async () => {
    const mod = await import('./layout')
    expect(mod.viewport).toBeDefined()
    expect(mod.viewport.themeColor).toBeTypeOf('string')
    expect((mod.viewport.themeColor as string).length).toBeGreaterThan(0)
  })

  it('does not place themeColor on the metadata export', async () => {
    const mod = await import('./layout')
    expect(mod.metadata).toBeDefined()
    expect((mod.metadata as Record<string, unknown>).themeColor).toBeUndefined()
  })
})
