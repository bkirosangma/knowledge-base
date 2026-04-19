import { renderHook, act } from '@testing-library/react'
import { useRef } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { useFlowManagement } from './useFlowManagement'
import type { Connection, FlowDef } from '../types'

// Covers DIAG-3.11-10 (handleSelectFlow null path added for flow-deselect fix).

function setup() {
  const setFlows = vi.fn()
  const setSelection = vi.fn()
  const scheduleRecord = vi.fn()

  const { result } = renderHook(() => {
    const connectionsRef = useRef<Connection[]>([])
    const flowsRef = useRef<FlowDef[]>([])
    const flowCounter = useRef(0)
    return useFlowManagement(connectionsRef, flowsRef, flowCounter, setFlows, setSelection, scheduleRecord)
  })

  return { result, setFlows, setSelection, scheduleRecord }
}

describe('useFlowManagement — handleSelectFlow', () => {
  it('handleSelectFlow(id) sets selection to { type: flow, id }', () => {
    const { result, setSelection } = setup()
    act(() => { result.current.handleSelectFlow('flow-abc') })
    expect(setSelection).toHaveBeenCalledWith({ type: 'flow', id: 'flow-abc' })
  })

  it('DIAG-3.11-10: handleSelectFlow(null) sets selection to null', () => {
    const { result, setSelection } = setup()
    act(() => { result.current.handleSelectFlow(null) })
    expect(setSelection).toHaveBeenCalledWith(null)
  })
})
