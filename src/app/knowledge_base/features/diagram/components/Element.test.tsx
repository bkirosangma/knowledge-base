import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
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

// KB-032 — non-color signals: text pill survives when CSS color is disabled.
describe('Element — flow role text pill (KB-032 non-color signal)', () => {
  it('DIAG-3.10-43 (KB-032): start role renders a "Start" pill', () => {
    const { getByTestId } = render(<Element {...base} flowRole="start" />)
    expect(getByTestId('flow-role-pill-n1').textContent).toBe('Start')
  })

  it('DIAG-3.10-43 (KB-032): end role renders an "End" pill', () => {
    const { getByTestId } = render(<Element {...base} flowRole="end" />)
    expect(getByTestId('flow-role-pill-n1').textContent).toBe('End')
  })

  it('DIAG-3.10-43 (KB-032): middle role does not render a pill', () => {
    const { queryByTestId } = render(<Element {...base} flowRole="middle" />)
    expect(queryByTestId('flow-role-pill-n1')).toBeNull()
  })

  it('DIAG-3.10-43 (KB-032): no flowRole means no pill', () => {
    const { queryByTestId } = render(<Element {...base} />)
    expect(queryByTestId('flow-role-pill-n1')).toBeNull()
  })
})

// DIAG-3.10-45 — click-toggle role pill in lock+edit mode
describe('Element — click-toggle role pill (DIAG-3.10-45)', () => {
  it('DIAG-3.10-45: null → start on first click in lock+edit', () => {
    const onRoleToggle = vi.fn()
    const { getByTestId } = render(
      <Element {...base} flowRole={undefined} lockEditRoleToggle onRoleToggle={onRoleToggle} />,
    )
    fireEvent.click(getByTestId('flow-role-toggle-n1'))
    expect(onRoleToggle).toHaveBeenCalledTimes(1)
    expect(onRoleToggle).toHaveBeenLastCalledWith('start')
  })

  it('DIAG-3.10-45: start → end on click in lock+edit', () => {
    const onRoleToggle = vi.fn()
    const { getByTestId } = render(
      <Element {...base} flowRole="start" lockEditRoleToggle onRoleToggle={onRoleToggle} />,
    )
    fireEvent.click(getByTestId('flow-role-toggle-n1'))
    expect(onRoleToggle).toHaveBeenLastCalledWith('end')
  })

  it('DIAG-3.10-45: end → null on click in lock+edit', () => {
    const onRoleToggle = vi.fn()
    const { getByTestId } = render(
      <Element {...base} flowRole="end" lockEditRoleToggle onRoleToggle={onRoleToggle} />,
    )
    fireEvent.click(getByTestId('flow-role-toggle-n1'))
    expect(onRoleToggle).toHaveBeenLastCalledWith(null)
  })

  it('DIAG-3.10-45: toggle button renders dot sentinel when no role in lock+edit', () => {
    const { getByTestId } = render(
      <Element {...base} flowRole={undefined} lockEditRoleToggle onRoleToggle={vi.fn()} />,
    )
    expect(getByTestId('flow-role-toggle-n1').textContent).toBe('·')
  })

  it('DIAG-3.10-45: no lockEditRoleToggle → role pill uses existing flow-role-pill testid', () => {
    const { getByTestId } = render(
      <Element {...base} flowRole="start" />,
    )
    expect(getByTestId('flow-role-pill-n1').textContent).toBe('Start')
  })

  it('DIAG-3.10-45: no lockEditRoleToggle and no role → no toggle area rendered', () => {
    const { queryByTestId } = render(
      <Element {...base} />,
    )
    expect(queryByTestId('flow-role-toggle-n1')).toBeNull()
  })
})
