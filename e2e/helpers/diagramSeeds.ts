// Shared diagram JSON seeds for Playwright E2E tests.
// All seeds output { 'diagram.json': string } — open with openDiagram() helper.
//
// Node serialized format matches SerializedNodeData from persistence.ts:
// id, label, icon (string), x, y, w, layer (required), type (optional).
// Layers use { id, title, bg, border } per LayerDef; geometry via layerManualSizes.

const baseDiagram = {
  title: 'Test',
  layers: [] as unknown[],
  layerManualSizes: {} as Record<string, unknown>,
  lineCurve: 'orthogonal',
  flows: [] as unknown[],
  documents: [] as unknown[],
}

export function seedEmpty(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({ ...baseDiagram, nodes: [], connections: [] }),
  }
}

export function seedWithNode(opts: { label?: string } = {}): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [{ id: 'n1', label: opts.label ?? 'Node 1', icon: 'Box', x: 200, y: 200, w: 180, layer: '' }],
      connections: [],
    }),
  }
}

export function seedWithNodeAndLayer(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      layers: [{ id: 'l1', title: 'Layer 1', bg: '#f8fafc', border: '#e2e8f0' }],
      layerManualSizes: { l1: { left: 80, top: 80, width: 400, height: 300 } },
      nodes: [{ id: 'n1', label: 'Node 1', icon: 'Box', x: 200, y: 200, w: 180, layer: 'l1' }],
      connections: [],
    }),
  }
}

export function seedWithConnectionInFlow(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 420, y: 200, w: 160, layer: '' },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', fromAnchor: 'right-1', toAnchor: 'left-1', label: '' }],
      flows: [{ id: 'flow-main', name: 'Main Flow', connectionIds: ['c1'] }],
    }),
  }
}

// Three nodes spread wide enough that world.w/world.h > 4/3, making the minimap width-constrained at 200px.
// fitToContent enforces a 1-unit (800px) minimum height; nodes at x=100,600,1100 give world.w=1240 > 4/3*800=1067.
export function seedWithWideNodes(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 600, y: 200, w: 160, layer: '' },
        { id: 'n3', label: 'C', icon: 'Box', x: 1100, y: 200, w: 160, layer: '' },
      ],
      connections: [],
    }),
  }
}

export function seedWithTwoConnections(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 420, y: 200, w: 160, layer: '' },
        { id: 'n3', label: 'C', icon: 'Box', x: 740, y: 200, w: 160, layer: '' },
      ],
      connections: [
        { id: 'c1', from: 'n1', to: 'n2', fromAnchor: 'right-1', toAnchor: 'left-1', label: '' },
        { id: 'c2', from: 'n2', to: 'n3', fromAnchor: 'right-1', toAnchor: 'left-1', label: '' },
      ],
      flows: [],
    }),
  }
}

export function seedWithAsyncConnection(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 420, y: 200, w: 160, layer: '' },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', fromAnchor: 'right-1', toAnchor: 'left-1', label: '', connectionType: 'asynchronous' }],
    }),
  }
}

export function seedWithColoredConnection(color: string): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 420, y: 200, w: 160, layer: '' },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', fromAnchor: 'right-1', toAnchor: 'left-1', label: '', color }],
    }),
  }
}

// Two connections: c1 is in "Main Flow", c2 is off-flow.
export function seedWithFlowAndOffFlowConnection(): Record<string, string> {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', icon: 'Box', x: 100, y: 200, w: 160, layer: '' },
        { id: 'n2', label: 'B', icon: 'Box', x: 420, y: 200, w: 160, layer: '' },
        { id: 'n3', label: 'C', icon: 'Box', x: 740, y: 200, w: 160, layer: '' },
      ],
      connections: [
        { id: 'c1', from: 'n1', to: 'n2', fromAnchor: 'right-1', toAnchor: 'left-1', label: '' },
        { id: 'c2', from: 'n2', to: 'n3', fromAnchor: 'right-1', toAnchor: 'left-1', label: '' },
      ],
      flows: [{ id: 'flow-main', name: 'Main Flow', connectionIds: ['c1'] }],
    }),
  }
}
