# Diagram Playwright E2E Test Plan

> **Status:** Deferred — feature fixes on `fix/condition-node-nan-backlink-dedup` take priority.
> **Resume:** Create branch `test/diagram-playwright-coverage` and implement tier by tier.

**Goal:** Cover all remaining ❌ cases in `test-cases/03-diagram.md` with Playwright e2e tests.

**Architecture:** Extend the existing `e2e/` suite using the mock-FS pattern from `diagramGoldenPath.spec.ts`:
- `page.addInitScript(installMockFS)` to inject `__kbMockFS`
- `setupFs(page, seed)` to seed a diagram JSON + navigate to `/`
- `openFolder(page)` to activate the mock FS
- `readMockFile(page, path)` to assert persisted state
- `data-testid` selectors: `diagram-canvas`, `node-{id}`, `layer-{id}`, `doc-preview-backdrop`

**Tech Stack:** Playwright, `@playwright/test`, existing `e2e/helpers/` utilities

---

## Tier 1 — Deterministic (~22 tests) — New files: `e2e/diagramKeyboard.spec.ts`, `e2e/diagramReadOnly.spec.ts`; additions to existing spec files

These tests use only keyboard events, role-based selectors, and CSS class assertions. No geometry math required.

### Task 1: Keyboard shortcuts (`e2e/diagramKeyboard.spec.ts`)

**Files:**
- Create: `e2e/diagramKeyboard.spec.ts`

- [ ] **DIAG-3.14-01: Escape deselects node**

```typescript
test('DIAG-3.14-01: Escape deselects selected node', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').click()
  await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="node-n1"]')).not.toHaveClass(/ring-2/)
})
```

- [ ] **DIAG-3.14-02: Escape closes context menu**

```typescript
test('DIAG-3.14-02: Escape closes context menu', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 200, y: 200 } })
  await expect(page.getByRole('menuitem')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menuitem')).not.toBeVisible()
})
```

- [ ] **DIAG-3.14-04: Delete with flow impact → FlowBreakWarningModal**

```typescript
test('DIAG-3.14-04: Delete connection in a flow shows warning modal', async ({ page }) => {
  await setupFs(page, seedWithConnectionInFlow())
  await openFolder(page)
  // click connection SVG path by its id attribute
  await page.locator('#conn-c1').click()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('dialog', { name: /break/i })).toBeVisible()
})
```

- [ ] **DIAG-3.14-05: Ctrl+G creates flow from selected connections**

```typescript
test('DIAG-3.14-05: Ctrl+G creates a flow from selected connections', async ({ page }) => {
  await setupFs(page, seedWithTwoConnections())
  await openFolder(page)
  await page.locator('#conn-c1').click()
  await page.locator('#conn-c2').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+g')
  // flow should appear in properties when any of its connections is clicked
  await page.locator('#conn-c1').click()
  await expect(page.getByText('Flow')).toBeVisible()
})
```

- [ ] **DIAG-3.14-08: Ctrl+Shift+R toggles read-only**

```typescript
test('DIAG-3.14-08: Ctrl+Shift+R toggles read-only mode on/off', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.keyboard.press('Control+Shift+r')
  // read-only indicator appears (toolbar shows lock icon or "Read Only" text)
  await expect(page.getByText(/read.?only/i)).toBeVisible()
  await page.keyboard.press('Control+Shift+r')
  await expect(page.getByText(/read.?only/i)).not.toBeVisible()
})
```

- [ ] **DIAG-3.14-09: Delete key ignored while input is focused**

```typescript
test('DIAG-3.14-09: Delete key does not delete selection when a properties input is focused', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').click()
  // click into a label input in the properties panel
  await page.getByRole('textbox', { name: /label/i }).click()
  await page.keyboard.press('Delete')
  // node should still be present
  await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
})
```

- [ ] **DIAG-3.14-10: Delete key ignored while label is being edited (contenteditable)**

```typescript
test('DIAG-3.14-10: Delete key does not delete node while editing its label inline', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').dblclick()
  await expect(page.locator('[contenteditable="true"]')).toBeVisible()
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
})
```

- [ ] **DIAG-3.2-10: Canvas click deselects**

```typescript
test('DIAG-3.2-10: Clicking empty canvas area deselects current selection', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').click()
  await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
  await page.locator('[data-testid="diagram-canvas"]').click({ position: { x: 600, y: 400 } })
  await expect(page.locator('[data-testid="node-n1"]')).not.toHaveClass(/ring-2/)
})
```

- [ ] **DIAG-3.5-01: Create node via context menu**

```typescript
test('DIAG-3.5-01: Right-click empty canvas → Add Element creates a new node', async ({ page }) => {
  await setupFs(page, seedEmpty())
  await openFolder(page)
  const before = await page.locator('[data-testid^="node-"]').count()
  await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 300, y: 300 } })
  await page.getByRole('menuitem', { name: /add element/i }).click()
  await expect(page.locator('[data-testid^="node-"]')).toHaveCount(before + 1)
})
```

- [ ] **DIAG-3.7-01: Create layer via context menu**

```typescript
test('DIAG-3.7-01: Right-click canvas → Add Layer creates a new layer', async ({ page }) => {
  await setupFs(page, seedEmpty())
  await openFolder(page)
  const before = await page.locator('[data-testid^="layer-"]').count()
  await page.locator('[data-testid="diagram-canvas"]').click({ button: 'right', position: { x: 300, y: 300 } })
  await page.getByRole('menuitem', { name: /add layer/i }).click()
  await expect(page.locator('[data-testid^="layer-"]')).toHaveCount(before + 1)
})
```

- [ ] **DIAG-3.5-10: Double-click node label → inline edit mode**

```typescript
test('DIAG-3.5-10: Double-click node enters inline label edit mode', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').dblclick()
  await expect(page.locator('[contenteditable="true"]')).toBeVisible()
})
```

- [ ] **DIAG-3.5-11: Enter commits label**

```typescript
test('DIAG-3.5-11: Pressing Enter commits the new label', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').dblclick()
  await page.keyboard.selectAll()
  await page.keyboard.type('New Label')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="node-n1"]')).toContainText('New Label')
})
```

- [ ] **DIAG-3.5-12: Escape reverts label**

```typescript
test('DIAG-3.5-12: Pressing Escape reverts to original label', async ({ page }) => {
  await setupFs(page, seedWithNode({ label: 'Original' }))
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').dblclick()
  await page.keyboard.selectAll()
  await page.keyboard.type('Changed')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="node-n1"]')).toContainText('Original')
})
```

### Task 2: Read-only mode (`e2e/diagramReadOnly.spec.ts`)

**Files:**
- Create: `e2e/diagramReadOnly.spec.ts`

- [ ] **DIAG-3.17-02: Toggle read-only via Ctrl+Shift+R**

Same as DIAG-3.14-08 — can share setup helper.

- [ ] **DIAG-3.17-03: Node drag disabled in read-only**

```typescript
test('DIAG-3.17-03: Node cannot be dragged in read-only mode', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.keyboard.press('Control+Shift+r') // enter read-only
  const box = await page.locator('[data-testid="node-n1"]').boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + 150, box!.y + 150, { steps: 10 })
  await page.mouse.up()
  // node should be at original position (bounding box should not have moved significantly)
  const newBox = await page.locator('[data-testid="node-n1"]').boundingBox()
  expect(Math.abs(newBox!.x - box!.x)).toBeLessThan(10)
})
```

- [ ] **DIAG-3.17-06: Delete key does nothing in read-only**

```typescript
test('DIAG-3.17-06: Delete key does not delete node in read-only mode', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').click()
  await page.keyboard.press('Control+Shift+r') // enter read-only
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-testid="node-n1"]')).toBeVisible()
})
```

- [ ] **DIAG-3.17-07: Context menu suppressed or shows read-only variant in read-only**

```typescript
test('DIAG-3.17-07: Right-click in read-only shows no destructive menu items', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.keyboard.press('Control+Shift+r')
  await page.locator('[data-testid="node-n1"]').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: /delete/i })).not.toBeVisible()
})
```

- [ ] **DIAG-3.17-08: Properties panel inputs disabled in read-only**

```typescript
test('DIAG-3.17-08: Properties panel inputs are disabled in read-only mode', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.locator('[data-testid="node-n1"]').click()
  await page.keyboard.press('Control+Shift+r')
  const input = page.getByRole('textbox', { name: /label/i })
  await expect(input).toBeDisabled()
})
```

- [ ] **DIAG-3.17-09: Node selection still works in read-only**

```typescript
test('DIAG-3.17-09: Clicking a node selects it even in read-only mode', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.keyboard.press('Control+Shift+r')
  await page.locator('[data-testid="node-n1"]').click()
  await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/)
})
```

- [ ] **DIAG-3.16-12: Undo ignored in read-only**

```typescript
test('DIAG-3.16-12: Undo does not restore changes when in read-only mode', async ({ page }) => {
  await setupFs(page, seedWithNode({ label: 'Original' }))
  await openFolder(page)
  // rename node
  await page.locator('[data-testid="node-n1"]').dblclick()
  await page.keyboard.selectAll()
  await page.keyboard.type('Changed')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-testid="node-n1"]')).toContainText('Changed')
  // enter read-only, then undo
  await page.keyboard.press('Control+Shift+r')
  await page.keyboard.press('Control+z')
  await expect(page.locator('[data-testid="node-n1"]')).toContainText('Changed') // unchanged
})
```

---

## Tier 2 — SVG attribute queries (~6 tests) — New file: `e2e/diagramConnectionRendering.spec.ts`

These tests query SVG element attributes directly using Playwright's `getAttribute` / `evaluate` APIs.

### Task 3: Connection rendering (`e2e/diagramConnectionRendering.spec.ts`)

**Files:**
- Create: `e2e/diagramConnectionRendering.spec.ts`

- [ ] **DIAG-3.8-10: Asynchronous connection renders stroke-dasharray**

```typescript
test('DIAG-3.8-10: Async connection type renders stroke-dasharray on SVG path', async ({ page }) => {
  await setupFs(page, seedWithAsyncConnection())
  await openFolder(page)
  const strokeDash = await page.locator('#conn-c1').evaluate(
    (el) => (el as SVGPathElement).getAttribute('stroke-dasharray')
  )
  expect(strokeDash).toBe('8 5')
})
```

Seed helper:
```typescript
function seedWithAsyncConnection() {
  return {
    'diagram.json': JSON.stringify({
      title: 'Test', layerDefs: [], layerManualSizes: {}, lineCurve: 'orthogonal',
      flows: [], documents: [],
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 100, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 100, w: 120, h: 60 },
      ],
      connections: [{
        id: 'c1', from: 'n1', to: 'n2', label: '', connectionType: 'asynchronous',
      }],
    }),
  }
}
```

- [ ] **DIAG-3.8-14: Connection color applied to SVG path stroke**

```typescript
test('DIAG-3.8-14: Connection color is applied as stroke attribute on the SVG path', async ({ page }) => {
  await setupFs(page, seedWithColoredConnection('#ff0000'))
  await openFolder(page)
  const stroke = await page.locator('#conn-c1').evaluate(
    (el) => (el as SVGPathElement).getAttribute('stroke')
  )
  expect(stroke).toBe('#ff0000')
})
```

- [ ] **DIAG-3.10-17: Hover dims off-flow connections**

```typescript
test('DIAG-3.10-17: Hovering a node in a flow dims connections not in that flow', async ({ page }) => {
  await setupFs(page, seedWithFlowAndOffFlowConnection())
  await openFolder(page)
  // select the flow first to enable flow-awareness
  await page.getByRole('button', { name: /main flow/i }).click()
  await page.locator('[data-testid="node-n1"]').hover()
  const offFlowOpacity = await page.locator('#conn-c2').evaluate(
    (el) => parseFloat((el as SVGPathElement).style.opacity || '1')
  )
  expect(offFlowOpacity).toBeLessThan(0.5)
})
```

---

> **DIAG-3.8-09 BLOCKED:** Test case says "biDirectional renders arrowheads at both ends" but `DataLine.tsx` has **zero arrowhead SVG elements** (`<marker>`, `markerEnd`, `markerStart` do not exist). The `biDirectional` flag only affects `FlowDots` animation (`keyPoints="0;1;0"`). Needs user decision:
> - Option A: Test case description is wrong — update it to say "biDirectional reverses FlowDots animation direction" and write the FlowDots test instead
> - Option B: Arrowheads are an unimplemented feature — mark DIAG-3.8-09 as 🚫 with a note

---

## Tier 3 — Needs `data-testid` additions (~6 tests) — New file: `e2e/diagramMinimap.spec.ts`

**Required code changes before writing tests:**

In `src/app/knowledge_base/features/diagram/components/Minimap.tsx`:
- Add `data-testid="minimap"` to the outer container div
- Add `data-testid="minimap-viewport"` to the viewport rect element

### Task 4: Minimap (`e2e/diagramMinimap.spec.ts`)

**Files:**
- Modify: `src/app/knowledge_base/features/diagram/components/Minimap.tsx` (add data-testid)
- Create: `e2e/diagramMinimap.spec.ts`

- [ ] **DIAG-3.3-01: Minimap renders nodes and layers**

```typescript
test('DIAG-3.3-01: Minimap shows node and layer outlines after enabling', async ({ page }) => {
  await setupFs(page, seedWithNodeAndLayer())
  await openFolder(page)
  // toggle minimap via toolbar button (title="Toggle minimap")
  await page.getByRole('button', { name: /minimap/i }).click()
  await expect(page.locator('[data-testid="minimap"]')).toBeVisible()
  // minimap should contain SVG rect elements representing nodes/layers
  await expect(page.locator('[data-testid="minimap"] rect')).toHaveCount({ minimum: 1 })
})
```

- [ ] **DIAG-3.3-02: Minimap viewport rect is visible**

```typescript
test('DIAG-3.3-02: Minimap shows viewport indicator rect', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.getByRole('button', { name: /minimap/i }).click()
  await expect(page.locator('[data-testid="minimap-viewport"]')).toBeVisible()
})
```

- [ ] **DIAG-3.3-06: Minimap width is 200px**

```typescript
test('DIAG-3.3-06: Minimap panel is 200px wide', async ({ page }) => {
  await setupFs(page, seedWithNode())
  await openFolder(page)
  await page.getByRole('button', { name: /minimap/i }).click()
  const box = await page.locator('[data-testid="minimap"]').boundingBox()
  expect(box!.width).toBe(200)
})
```

---

## Tier 4 — Geometry/timing heavy (~20 tests) — Defer

These require real browser layout (`scrollWidth`/`scrollHeight`), fine-grained pointer control, or timing-sensitive interactions (150ms hold timer). Implement only after Tiers 1-3 are green.

Cases deferred:
- **DIAG-3.2-01/02/03/06/08:** Viewport patch geometry
- **DIAG-3.2-04/05:** Zoom in/out via `page.mouse.wheel()`
- **DIAG-3.2-11:** Pan by drag on empty canvas
- **DIAG-3.5-07:** Node drag respects layer bounds (clamping)
- **DIAG-3.5-08/09:** Multi-node drag via Ctrl+click
- **DIAG-3.9-01/02:** Endpoint drag with 150ms hold timer (`page.waitForTimeout(200)` mid-drag)
- **DIAG-3.9-03/04:** Endpoint snap to anchor (complex anchor position math)
- **DIAG-3.9-09/10/11:** Segment drag inserts/updates waypoints
- **DIAG-3.9-12/13:** Anchor popup on hover + drag-from popup
- **DIAG-3.10-11:** FlowDots animation direction for biDirectional (`keyPoints="0;1;0"` assertion)
- **DIAG-3.11-08:** Drag threshold = 25px
- **DIAG-3.15-06:** Grid snap integration (x/y are multiples of GRID_SIZE after drag + save)
- **DIAG-3.7-07/08/09:** Layer drag moves children / layer resize
- **DIAG-3.20-02:** Wiki-link backlink click → DocPreviewModal (requires document pane + link rendering)
- **DIAG-3.20-07:** Canvas blur (`pointer-events: none`) while DocPreviewModal is open

---

## Seed Helpers

All spec files import from `e2e/helpers/diagramSeeds.ts` (create this file):

```typescript
// e2e/helpers/diagramSeeds.ts

const baseDiagram = {
  title: 'Test', layerDefs: [], layerManualSizes: {}, lineCurve: 'orthogonal',
  flows: [], documents: [],
}

export function seedEmpty() {
  return { 'diagram.json': JSON.stringify({ ...baseDiagram, nodes: [], connections: [] }) }
}

export function seedWithNode(opts: { label?: string } = {}) {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [{ id: 'n1', label: opts.label ?? 'Node 1', x: 200, y: 200, w: 120, h: 60 }],
      connections: [],
    }),
  }
}

export function seedWithNodeAndLayer() {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      layerDefs: [{ id: 'l1', label: 'Layer 1', x: 50, y: 50, w: 400, h: 300, color: '#e2e8f0' }],
      nodes: [{ id: 'n1', label: 'Node 1', x: 200, y: 150, w: 120, h: 60 }],
      connections: [],
    }),
  }
}

export function seedWithConnectionInFlow() {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 200, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 200, w: 120, h: 60 },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', label: '' }],
      flows: [{ id: 'flow-main', name: 'Main Flow', connectionIds: ['c1'] }],
    }),
  }
}

export function seedWithTwoConnections() {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 200, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 200, w: 120, h: 60 },
        { id: 'n3', label: 'C', x: 700, y: 200, w: 120, h: 60 },
      ],
      connections: [
        { id: 'c1', from: 'n1', to: 'n2', label: '' },
        { id: 'c2', from: 'n2', to: 'n3', label: '' },
      ],
      flows: [],
    }),
  }
}

export function seedWithAsyncConnection() {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 200, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 200, w: 120, h: 60 },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', label: '', connectionType: 'asynchronous' }],
    }),
  }
}

export function seedWithColoredConnection(color: string) {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 200, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 200, w: 120, h: 60 },
      ],
      connections: [{ id: 'c1', from: 'n1', to: 'n2', label: '', color }],
    }),
  }
}

export function seedWithFlowAndOffFlowConnection() {
  return {
    'diagram.json': JSON.stringify({
      ...baseDiagram,
      nodes: [
        { id: 'n1', label: 'A', x: 100, y: 200, w: 120, h: 60 },
        { id: 'n2', label: 'B', x: 400, y: 200, w: 120, h: 60 },
        { id: 'n3', label: 'C', x: 700, y: 200, w: 120, h: 60 },
      ],
      connections: [
        { id: 'c1', from: 'n1', to: 'n2', label: '' }, // in flow
        { id: 'c2', from: 'n2', to: 'n3', label: '' }, // NOT in flow
      ],
      flows: [{ id: 'flow-main', name: 'Main Flow', connectionIds: ['c1'] }],
    }),
  }
}
```

---

## Open Questions Before Implementation

1. **DIAG-3.8-09 (biDirectional arrowheads):** Code has zero arrowhead SVG — test case description is wrong or feature is unimplemented. Decision needed.
2. **Read-only indicator:** What exact text/icon does the toolbar show when read-only is active? Affects selectors in DIAG-3.14-08 / DIAG-3.17-02.
3. **Minimap toggle button:** Does `getByRole('button', { name: /minimap/i })` match it, or does it use a title attribute / icon only?
4. **Connection SVG `id` attribute:** Verify DataLine.tsx renders `<path id={connection.id}>` — the plan assumes this. If it's `id={\`conn-${id}\`}` or similar, adjust selectors.
