import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import React from 'react'
import PropertiesPanel from './PropertiesPanel'
import type { NodeData, Connection, LayerDef, FlowDef, Selection } from '../types'
import type { RegionBounds } from './shared'
import { Database } from 'lucide-react'
import {
  DiagramInteractionProvider,
  useLockedFlow,
} from '../state/DiagramInteractionContext'

// Covers DIAG-3.13-02: tab switching — PropertiesPanel shows the right
// sub-panel based on selection.type.

const node: NodeData = {
  id: 'n1', label: 'API', icon: Database as unknown as NodeData['icon'],
  x: 0, y: 0, w: 150, layer: '',
}

const region: RegionBounds = {
  id: 'L1', title: 'Database',
  bg: '#fff', border: '#ccc',
  left: 0, width: 200, top: 0, height: 200, empty: false,
}

const layerDef: LayerDef = { id: 'L1', title: 'Database', bg: '#fff', border: '#ccc', textColor: '#000' }

const connection: Connection = {
  id: 'c1', from: 'n1', to: 'n2',
  fromAnchor: 'right-0', toAnchor: 'left-0',
  color: '#000', label: '',
}

const flows: FlowDef[] = []

/** Helper that locks a flow via context after mount. */
function LockHelper({ flowId }: { flowId: string }) {
  const { setLockedFlowId } = useLockedFlow()
  React.useEffect(() => {
    setLockedFlowId(flowId)
  }, [flowId, setLockedFlowId])
  return null
}

function panel(selection: Selection, testFlows: FlowDef[] = flows) {
  return (
    <DiagramInteractionProvider>
      <PropertiesPanel
        selection={selection}
        title="My Diagram"
        nodes={[node]}
        connections={[connection]}
        regions={[region]}
        layerDefs={[layerDef]}
        flows={testFlows}
      />
    </DiagramInteractionProvider>
  )
}

describe('DIAG-3.13-02: PropertiesPanel tab switching', () => {
  it('null selection → shows "Architecture" section label', () => {
    render(panel(null))
    expect(screen.getByText('Architecture')).toBeTruthy()
  })

  it('flow selection → shows "Architecture" section label', () => {
    render(panel({ type: 'flow', id: 'f1' }))
    expect(screen.getByText('Architecture')).toBeTruthy()
  })

  it('node selection → shows "Element" section label', () => {
    render(panel({ type: 'node', id: 'n1' }))
    expect(screen.getByText('Element')).toBeTruthy()
    // NodeProperties Identity section renders
    expect(screen.getByText('Identity')).toBeTruthy()
  })

  it('layer selection → shows "Layer" section label', () => {
    render(panel({ type: 'layer', id: 'L1' }))
    expect(screen.getByText('Layer')).toBeTruthy()
    // LayerProperties renders the layer title
    expect(screen.getByText('Database')).toBeTruthy()
  })

  it('line selection → shows "Connection" section label', () => {
    render(panel({ type: 'line', id: 'c1' }))
    expect(screen.getByText('Connection')).toBeTruthy()
  })

  it('multi-node selection → shows "N Elements" label', () => {
    render(panel({ type: 'multi-node', ids: ['n1', 'n2'], layer: '' }))
    expect(screen.getByText('2 Elements')).toBeTruthy()
  })

  it('multi-layer selection → shows "N Layers" label', () => {
    render(panel({ type: 'multi-layer', ids: ['L1', 'L2'] }))
    expect(screen.getByText('2 Layers')).toBeTruthy()
  })

  it('multi-line selection → shows "N Lines" label', () => {
    render(panel({ type: 'multi-line', ids: ['c1', 'c2'] }))
    expect(screen.getByText('2 Lines')).toBeTruthy()
  })

  it('collapsed prop renders chevron-left toggle instead of full panel', () => {
    render(
      <DiagramInteractionProvider>
        <PropertiesPanel
          selection={null}
          title="D"
          nodes={[]} connections={[]} regions={[]} layerDefs={[]} flows={[]}
          collapsed
          onToggleCollapse={() => {}}
        />
      </DiagramInteractionProvider>,
    )
    // Full panel content is not rendered when collapsed
    expect(screen.queryByText('Architecture')).toBeNull()
    // Expand button is visible
    expect(screen.getByLabelText('Expand properties')).toBeTruthy()
  })
})

// DIAG-12-01: PropertiesPanel stacks FlowProperties + element panel when locked
describe('DIAG-12-01: PropertiesPanel locked-flow stack mode', () => {
  const flowWithMember: FlowDef = {
    id: 'flow-1',
    name: 'Flow One',
    category: '',
    connectionIds: ['c1'], // c1 connects n1 → n2, so n1 is a member
  }

  it('stacks FlowProperties + NodeProperties when locked and a member node is selected', async () => {
    render(
      <DiagramInteractionProvider>
        <LockHelper flowId="flow-1" />
        <PropertiesPanel
          selection={{ type: 'node', id: 'n1' }}
          title="My Diagram"
          nodes={[node]}
          connections={[connection]}
          regions={[region]}
          layerDefs={[layerDef]}
          flows={[flowWithMember]}
        />
      </DiagramInteractionProvider>,
    )
    // Wait for the LockHelper effect to fire.
    await act(async () => {})
    expect(screen.getByTestId('flow-properties-panel')).toBeTruthy()
    expect(screen.getByTestId('element-properties-panel')).toBeTruthy()
  })
})
