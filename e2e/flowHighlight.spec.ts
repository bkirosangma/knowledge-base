import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DIAG-3.10-20/21/22/24/25 — flow start/end node glow +
// off-flow label suppression. These require the full DiagramView render path.

// Three nodes in a linear flow (nA→nB→nC) plus one off-flow connection
// (nD→nE) with a distinct label so we can assert it disappears.
const FLOW_DIAGRAM = {
  title: 'Flow Highlight Test',
  layers: [],
  nodes: [
    { id: 'nA', label: 'Source', x: 160,  y: 200, w: 160, layer: '', type: 'default' },
    { id: 'nB', label: 'Middle', x: 420,  y: 200, w: 160, layer: '', type: 'default' },
    { id: 'nC', label: 'Sink',   x: 680,  y: 200, w: 160, layer: '', type: 'default' },
    { id: 'nD', label: 'OffA',   x: 160,  y: 460, w: 160, layer: '', type: 'default' },
    { id: 'nE', label: 'OffB',   x: 420,  y: 460, w: 160, layer: '', type: 'default' },
  ],
  connections: [
    { id: 'c1', from: 'nA', to: 'nB', fromAnchor: 'right-1', toAnchor: 'left-1', color: '#94a3b8', label: 'in-flow-1', labelPosition: 0.5 },
    { id: 'c2', from: 'nB', to: 'nC', fromAnchor: 'right-1', toAnchor: 'left-1', color: '#94a3b8', label: 'in-flow-2', labelPosition: 0.5 },
    { id: 'c3', from: 'nD', to: 'nE', fromAnchor: 'right-1', toAnchor: 'left-1', color: '#94a3b8', label: 'off-flow',  labelPosition: 0.5 },
  ],
  flows: [{ id: 'f1', name: 'Main Flow', connectionIds: ['c1', 'c2'] }],
  documents: [],
  layerManualSizes: {},
  lineCurve: 'orthogonal',
}

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openDiagram(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
  await page.getByText('flow.json').first().click()
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('[data-testid="node-nA"]')).toBeVisible()
}

// Green glow color (#22c55e) as Chromium normalizes it.
const GREEN = 'rgb(34, 197, 94)'
// Red glow color (#ef4444) as Chromium normalizes it.
const RED = 'rgb(239, 68, 68)'

// Click the flow name button in the ArchitectureProperties panel to select f1.
async function selectFlow(page: Page) {
  await page.getByRole('button', { name: 'Main Flow' }).click()
  // Wait for the selection to propagate (green glow appears on source node).
  await expect(page.locator('[data-testid="node-nA"]')).toHaveAttribute('style', new RegExp(GREEN.replace(/[()]/g, '\\$&')), { timeout: 3000 })
}

test.describe('Flow start/end highlighting', () => {
  test('DIAG-3.10-20: source node gets green glow when flow selected', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)
    await selectFlow(page)

    const style = await page.locator('[data-testid="node-nA"]').getAttribute('style') ?? ''
    expect(style).toContain(GREEN)
    expect(style).not.toContain(RED)
  })

  test('DIAG-3.10-21: sink node gets red glow when flow selected', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)
    await selectFlow(page)

    const style = await page.locator('[data-testid="node-nC"]').getAttribute('style') ?? ''
    expect(style).toContain(RED)
    expect(style).not.toContain(GREEN)
  })

  test('DIAG-3.10-22: middle node has no colored glow when flow selected', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)
    await selectFlow(page)

    const style = await page.locator('[data-testid="node-nB"]').getAttribute('style') ?? ''
    expect(style).not.toContain(GREEN)
    expect(style).not.toContain(RED)
  })

  test('DIAG-3.10-24: glows clear after canvas click deselects flow', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)
    await selectFlow(page)

    // Escape clears selection.
    await page.keyboard.press('Escape')

    await expect(page.locator('[data-testid="node-nA"]')).not.toHaveAttribute(
      'style', new RegExp(GREEN.replace(/[()]/g, '\\$&')), { timeout: 3000 }
    )
    const style = await page.locator('[data-testid="node-nC"]').getAttribute('style') ?? ''
    expect(style).not.toContain(RED)
  })

  test('DIAG-3.10-25: off-flow connection label hidden while flow is active', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)

    // Before selecting: all labels visible (showLabels defaults to true).
    await expect(page.getByText('off-flow').first()).toBeVisible()

    await selectFlow(page)

    // Off-flow label must not appear anywhere in the DOM.
    await expect(page.getByText('off-flow')).toHaveCount(0)

    // In-flow labels remain visible.
    await expect(page.getByText('in-flow-1').first()).toBeVisible()
  })

  test('off-flow labels reappear after flow is deselected', async ({ page }) => {
    await setupFs(page, { 'flow.json': JSON.stringify(FLOW_DIAGRAM) })
    await openDiagram(page)
    await selectFlow(page)
    await expect(page.getByText('off-flow')).toHaveCount(0)

    await page.keyboard.press('Escape')

    await expect(page.getByText('off-flow').first()).toBeVisible()
  })
})
