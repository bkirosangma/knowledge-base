import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ConditionElement from './ConditionElement'

// Covers DIAG-3.10-23 — flow role glow on diamond (condition) nodes.

const base = {
  id: 'ce1',
  label: 'Decision',
  x: 0,
  y: 0,
  w: 120,
  h: 80,
  outCount: 2,
  rotation: 0,
  showLabels: true,
}

describe('ConditionElement — flow role glow', () => {
  it('DIAG-3.10-23: start role applies green drop-shadow filter', () => {
    const { container } = render(<ConditionElement {...base} flowRole="start" />)
    const outer = container.firstChild as HTMLDivElement
    const style = outer.getAttribute('style') ?? ''
    expect(style).toContain('#22c55e')
  })

  it('DIAG-3.10-23: end role applies red drop-shadow filter', () => {
    const { container } = render(<ConditionElement {...base} flowRole="end" />)
    const outer = container.firstChild as HTMLDivElement
    const style = outer.getAttribute('style') ?? ''
    expect(style).toContain('#ef4444')
  })

  it('middle role has no colored filter', () => {
    const { container } = render(<ConditionElement {...base} flowRole="middle" />)
    const outer = container.firstChild as HTMLDivElement
    const style = outer.getAttribute('style') ?? ''
    expect(style).not.toContain('#22c55e')
    expect(style).not.toContain('#ef4444')
  })

  it('no flowRole means no colored filter', () => {
    const { container } = render(<ConditionElement {...base} />)
    const outer = container.firstChild as HTMLDivElement
    const style = outer.getAttribute('style') ?? ''
    expect(style).not.toContain('#22c55e')
    expect(style).not.toContain('#ef4444')
  })
})

// KB-032 — non-color signals: text pill survives when CSS color is disabled.
describe('ConditionElement — flow role text pill (KB-032 non-color signal)', () => {
  it('DIAG-3.10-44 (KB-032): start role renders a "Start" pill', () => {
    const { getByTestId } = render(<ConditionElement {...base} flowRole="start" />)
    expect(getByTestId('flow-role-pill-ce1').textContent).toBe('Start')
  })

  it('DIAG-3.10-44 (KB-032): end role renders an "End" pill', () => {
    const { getByTestId } = render(<ConditionElement {...base} flowRole="end" />)
    expect(getByTestId('flow-role-pill-ce1').textContent).toBe('End')
  })

  it('DIAG-3.10-44 (KB-032): middle role does not render a pill', () => {
    const { queryByTestId } = render(<ConditionElement {...base} flowRole="middle" />)
    expect(queryByTestId('flow-role-pill-ce1')).toBeNull()
  })

  it('DIAG-3.10-44 (KB-032): no flowRole means no pill', () => {
    const { queryByTestId } = render(<ConditionElement {...base} />)
    expect(queryByTestId('flow-role-pill-ce1')).toBeNull()
  })
})
