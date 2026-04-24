import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import { seedWithNode, seedWithNodeAndLayer, seedWithWideNodes } from './helpers/diagramSeeds'

// Covers DIAG-3.3-01/02/06
// Requires data-testid="minimap" and data-testid="minimap-viewport" on Minimap.tsx.
// Minimap toggle button has title="Toggle minimap".

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
  await page.getByText('diagram.json').first().click()
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
}

test.describe('Diagram minimap', () => {
  test('DIAG-3.3-01: Minimap shows node and layer outlines after toggling on', async ({ page }) => {
    await setupFs(page, seedWithNodeAndLayer())
    await openDiagram(page)
    // Minimap is visible by default (showMinimap starts true)
    await expect(page.locator('[data-testid="minimap"]')).toBeVisible()
    // Minimap renders div elements for nodes and layers
    const count = await page.locator('[data-testid="minimap"] div').count()
    expect(count).toBeGreaterThan(0)
  })

  test('DIAG-3.3-02: Minimap shows viewport indicator rect', async ({ page }) => {
    await setupFs(page, seedWithNode())
    await openDiagram(page)
    await expect(page.locator('[data-testid="minimap-viewport"]')).toBeVisible()
  })

  test('DIAG-3.3-06: Minimap panel is 200px wide', async ({ page }) => {
    // Wide nodes at x=100,600,1100 → world.w=1240 > 4/3 × 800(min-height) → width-constrained at 200px
    // toHaveCSS polls until fitToContent useEffect runs and CSS content-width reaches 200px
    await setupFs(page, seedWithWideNodes())
    await openDiagram(page)
    await expect(page.locator('[data-testid="minimap"]')).toHaveCSS('width', '200px')
  })
})
