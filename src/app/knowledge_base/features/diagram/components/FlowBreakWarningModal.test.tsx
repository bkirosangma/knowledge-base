import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FlowBreakWarningModal from './FlowBreakWarningModal'
import type { FlowDef } from '../types'

// Covers DIAG-3.9-06/07/08 modal flow.

const mkFlow = (id: string, name: string): FlowDef => ({
  id, name, connectionIds: [],
})

describe('FlowBreakWarningModal', () => {
  it('renders the description and every broken flow name', () => {
    render(
      <FlowBreakWarningModal
        description="Reconnecting this line will detach two flows."
        brokenFlows={[mkFlow('f1', 'Auth flow'), mkFlow('f2', 'Pay flow')]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('Reconnecting this line will detach two flows.')).toBeTruthy()
    expect(screen.getByText('Auth flow')).toBeTruthy()
    expect(screen.getByText('Pay flow')).toBeTruthy()
  })

  it('pluralises the heading for a single broken flow', () => {
    render(
      <FlowBreakWarningModal
        description=""
        brokenFlows={[mkFlow('f1', 'Single')]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('This will break a flow')).toBeTruthy()
  })

  it('pluralises the heading for multiple broken flows', () => {
    render(
      <FlowBreakWarningModal
        description=""
        brokenFlows={[mkFlow('f1', 'A'), mkFlow('f2', 'B')]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    )
    expect(screen.getByText('This will break flows')).toBeTruthy()
  })

  it('Cancel button triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <FlowBreakWarningModal
        description=""
        brokenFlows={[]}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Continue button triggers onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <FlowBreakWarningModal
        description=""
        brokenFlows={[]}
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('clicking the backdrop triggers onCancel', () => {
    const onCancel = vi.fn()
    const { container } = render(
      <FlowBreakWarningModal
        description="x"
        brokenFlows={[]}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    )
    fireEvent.click(container.firstChild as HTMLElement)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('clicking inside the modal body does NOT trigger onCancel', () => {
    const onCancel = vi.fn()
    render(
      <FlowBreakWarningModal
        description="body"
        brokenFlows={[]}
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('body'))
    expect(onCancel).not.toHaveBeenCalled()
  })
})
