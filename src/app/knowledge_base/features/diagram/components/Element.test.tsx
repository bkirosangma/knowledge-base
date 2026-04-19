import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Element from './Element'

// Covers DIAG-3.10-20/21/22/24 — flow role glow on rectangle nodes.

const base = {
  id: 'n1',
  label: 'Node',
  x: 0,
  y: 0,
  showLabels: true,
}

describe('Element — flow role glow', () => {
  it('DIAG-3.10-20: start role applies green box-shadow', () => {
    const { getByTestId } = render(<Element {...base} flowRole="start" />)
    const style = getByTestId('node-n1').getAttribute('style') ?? ''
    expect(style).toContain('#22c55e')
  })

  it('DIAG-3.10-21: end role applies red box-shadow', () => {
    const { getByTestId } = render(<Element {...base} flowRole="end" />)
    const style = getByTestId('node-n1').getAttribute('style') ?? ''
    expect(style).toContain('#ef4444')
  })

  it('DIAG-3.10-22: middle role has no colored glow', () => {
    const { getByTestId } = render(<Element {...base} flowRole="middle" />)
    const style = getByTestId('node-n1').getAttribute('style') ?? ''
    expect(style).not.toContain('#22c55e')
    expect(style).not.toContain('#ef4444')
  })

  it('DIAG-3.10-24: no flowRole means no glow', () => {
    const { getByTestId } = render(<Element {...base} />)
    const style = getByTestId('node-n1').getAttribute('style') ?? ''
    expect(style).not.toContain('#22c55e')
    expect(style).not.toContain('#ef4444')
  })

  it('start and end glows use different colors', () => {
    const { getByTestId: getStart } = render(<Element {...base} id="start" flowRole="start" />)
    const { getByTestId: getEnd } = render(<Element {...base} id="end" flowRole="end" />)
    const startStyle = getStart('node-start').getAttribute('style') ?? ''
    const endStyle = getEnd('node-end').getAttribute('style') ?? ''
    expect(startStyle).not.toContain('#ef4444')
    expect(endStyle).not.toContain('#22c55e')
  })
})
