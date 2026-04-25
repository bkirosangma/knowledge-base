import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import {
  seedWithAsyncConnection,
  seedWithColoredConnection,
  seedWithFlowAndOffFlowConnection,
} from './helpers/diagramSeeds'

// Covers DIAG-3.8-10/14, DIAG-3.10-17
// Queries SVG attributes directly using getAttribute / evaluate.
//
// Connection SVG id: DataLine.tsx renders <g id={connection.id}>.
// Seed connections use id: 'c1', so selector is #c1 (not #conn-c1).

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

test.describe('Diagram connection rendering', () => {
  test('DIAG-3.8-10: Async connection renders stroke-dasharray on SVG path', async ({ page }) => {
    await setupFs(page, seedWithAsyncConnection())
    await openDiagram(page)
    const strokeDash = await page.locator('#c1').evaluate(
      (el) => (el as SVGPathElement).getAttribute('stroke-dasharray')
    )
    expect(strokeDash).toBe('8 5')
  })

  test('DIAG-3.8-14: Connection color is applied as stroke on the SVG path', async ({ page }) => {
    await setupFs(page, seedWithColoredConnection('#ff0000'))
    await openDiagram(page)
    const stroke = await page.locator('#c1').evaluate(
      (el) => (el as SVGPathElement).getAttribute('stroke')
    )
    expect(stroke).toBe('#ff0000')
  })

  test('DIAG-3.10-17: Selecting a flow dims connections not in that flow', async ({ page }) => {
    await setupFs(page, seedWithFlowAndOffFlowConnection())
    await openDiagram(page)
    // Click flow button in properties panel to select the flow
    await page.getByRole('button', { name: 'Main Flow' }).click()
    // Off-flow connection (c2) should receive opacity="0.1" on its <g> element
    await expect(page.locator('#c2')).toHaveAttribute('opacity', '0.1')
  })
})
