import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import { seedWithNode, seedWithTwoNodes } from './helpers/diagramSeeds'

// Covers DIAG-3.22-01, DIAG-3.22-02, DIAG-3.22-03

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
      localStorage.setItem(`diagram-read-only:${filename}`, 'false')
      localStorage.setItem(`document-read-only:${filename}`, 'false')
    }
  }, seed)
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate((files) => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openDiagram(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
  await page.getByText('diagram.json').first().click()
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
}

test.describe('Drag-to-connect edge handles', () => {
  test('DIAG-3.22-02: Edge handles appear when a node is selected (not in read mode)', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Handles should not be visible before selection
    await expect(page.locator('[data-testid="edge-handle-n1-n"]')).not.toBeVisible()

    // Click the node to select it
    await page.locator('[data-testid="node-n1"]').click()

    // All four handles should now be visible
    await expect(page.locator('[data-testid="edge-handle-n1-n"]')).toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-e"]')).toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-s"]')).toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-w"]')).toBeVisible()

    // Deselect — handles should disappear
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-testid="edge-handle-n1-n"]')).not.toBeVisible()
  })

  test('DIAG-3.22-03: Edge handles do not appear in read mode', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)

    // Select the node, then enter read mode
    await page.locator('[data-testid="node-n1"]').click()
    await expect(page.locator('[data-testid="edge-handle-n1-e"]')).toBeVisible()

    // Toggle read mode on
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()

    // Handles must be gone in read mode — even though node is selected
    await expect(page.locator('[data-testid="edge-handle-n1-n"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-e"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-s"]')).not.toBeVisible()
    await expect(page.locator('[data-testid="edge-handle-n1-w"]')).not.toBeVisible()
  })

  test('DIAG-3.22-01: Dragging from an edge handle to another node creates a connection', async ({ page }) => {
    await setupFs(page, seedWithTwoNodes())
    await openDiagram(page)

    // Select n1 so the edge handle appears
    await page.locator('[data-testid="node-n1"]').click()
    const handle = page.locator('[data-testid="edge-handle-n1-e"]')
    await expect(handle).toBeVisible()

    // Get target node bounding box
    const targetBox = await page.locator('[data-testid="node-n2"]').boundingBox()
    expect(targetBox).not.toBeNull()

    // Get handle position
    const handleBox = await handle.boundingBox()
    expect(handleBox).not.toBeNull()

    const fromX = handleBox!.x + handleBox!.width / 2
    const fromY = handleBox!.y + handleBox!.height / 2
    const toX = targetBox!.x + targetBox!.width / 2
    const toY = targetBox!.y + targetBox!.height / 2

    // Drag from the east handle onto n2 — hold long enough to bypass the 150ms timer
    await page.mouse.move(fromX, fromY)
    await page.mouse.down()
    // Slow drag to trigger the 150ms hold delay and ensure snapping
    await page.mouse.move(fromX + 10, fromY, { steps: 3 })
    await page.waitForTimeout(200)
    await page.mouse.move(toX, toY, { steps: 10 })
    await page.mouse.up()

    // A connection line should now exist between n1 and n2
    // DiagramLinesOverlay renders SVG paths — wait for any path to appear inside the canvas
    await expect(page.locator('[data-testid="diagram-canvas"] svg path').first()).toBeVisible({ timeout: 3000 })
  })
})
