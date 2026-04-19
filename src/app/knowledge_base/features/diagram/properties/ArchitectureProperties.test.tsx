import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ArchitectureProperties } from './ArchitectureProperties'
import type { FlowDef, Connection } from '../types'
import type { RegionBounds } from './shared'

// Covers DIAG-3.11-10: flow selection / deselection driven through onSelectFlow.

const regions: RegionBounds[] = []
const connections: Connection[] = []
const flows: FlowDef[] = [
  { id: 'flow-1', name: 'Auth Flow', connectionIds: [] },
  { id: 'flow-2', name: 'Data Flow', connectionIds: [] },
]

function base(overrides: Partial<React.ComponentProps<typeof ArchitectureProperties>> = {}) {
  return {
    title: 'My Diagram',
    regions,
    nodes: [],
    connections,
    ...overrides,
  } as React.ComponentProps<typeof ArchitectureProperties>
}

describe('ArchitectureProperties — flow toggle (DIAG-3.11-10)', () => {
  it('clicking a flow row calls onSelectFlow with its id', () => {
    const onSelectFlow = vi.fn()
    render(<ArchitectureProperties {...base({ flows, onSelectFlow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    expect(onSelectFlow).toHaveBeenCalledWith('flow-1')
    expect(onSelectFlow).toHaveBeenCalledTimes(1)
  })

  it('clicking the same row a second time calls onSelectFlow(null)', () => {
    const onSelectFlow = vi.fn()
    render(<ArchitectureProperties {...base({ flows, onSelectFlow })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    fireEvent.click(screen.getByRole('button', { name: 'Auth Flow' }))
    expect(onSelectFlow).toHaveBeenNthCalledWith(1, 'flow-1')
    expect(onSelectFlow).toHaveBeenNthCalledWith(2, null)
  })

  it('activeFlowId prop pre-expands the matching flow', () => {
    render(<ArchitectureProperties {...base({ flows, activeFlowId: 'flow-1' })} />)
    expect(screen.getByRole('button', { name: 'Delete Flow' })).toBeTruthy()
  })

  it('when activeFlowId prop changes to undefined the flow detail collapses', () => {
    const { rerender } = render(
      <ArchitectureProperties {...base({ flows, activeFlowId: 'flow-1' })} />,
    )
    expect(screen.getByRole('button', { name: 'Delete Flow' })).toBeTruthy()

    rerender(<ArchitectureProperties {...base({ flows, activeFlowId: undefined })} />)
    expect(screen.queryByRole('button', { name: 'Delete Flow' })).toBeNull()
  })
})
