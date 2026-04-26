import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers: EXPL-2.7-01, EXPL-2.7-02, EXPL-2.8-01, EXPL-2.8-02, EXPL-2.9-01

const ONE_NODE_DIAGRAM = JSON.stringify({
  title: 'arch',
  layers: [],
  nodes: [{ id: 'n1', label: 'Service', icon: 'Box', x: 120, y: 120, w: 180, layer: '', type: 'default' }],
  connections: [],
  flows: [],
  documents: [],
  layerManualSizes: {},
  lineCurve: 'orthogonal',
})

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
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void }
    }).__kbMockFS
    m.seed(files)
  }, seed)
}

async function openFolder(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
}

test.describe('Explorer Search', () => {
  test('EXPL-2.7-01: typing in search filters the file list', async ({ page }) => {
    await setupFs(page, {
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
      'notes/deep.md': '# Deep note',
    })
    await openFolder(page)

    // Wait for tree to populate
    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })

    // Type search query
    const searchInput = page.getByTestId('explorer-search')
    await searchInput.fill('deep')

    // Search results should show the matching file
    await expect(page.getByTestId('explorer-search-results')).toBeVisible({ timeout: 3000 })
    // Use first() because the search result renders both a filename span and a path span
    await expect(page.getByText('deep.md').first()).toBeVisible()

    // Non-matching files should not be visible in the tree or search results
    await expect(page.getByTestId('explorer-search-results').getByText('alpha.md')).not.toBeVisible()
    await expect(page.getByTestId('explorer-search-results').getByText('beta.md')).not.toBeVisible()
  })

  test('EXPL-2.7-02: clearing the search restores the full tree', async ({ page }) => {
    await setupFs(page, {
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
      'notes/deep.md': '# Deep note',
    })
    await openFolder(page)

    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })

    // Filter
    const searchInput = page.getByTestId('explorer-search')
    await searchInput.fill('deep')
    await expect(page.getByText('deep.md').first()).toBeVisible({ timeout: 3000 })

    // Clear via clear button
    await page.getByRole('button', { name: 'Clear search' }).click()

    // Normal tree is restored
    await expect(page.getByTestId('explorer-search-results')).not.toBeVisible()
    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('beta.md').first()).toBeVisible()
  })
})

test.describe('Explorer Recents', () => {
  test('EXPL-2.8-01: opening a file adds it to the Recents group', async ({ page }) => {
    await setupFs(page, {
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
    })
    await openFolder(page)

    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })

    // Click to open a file
    await page.getByText('alpha.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Recents group should appear and contain the file
    await expect(page.getByText('Recents', { exact: false }).first()).toBeVisible({ timeout: 3000 })
    // The recents section should list alpha.md
    const recentsSection = page.locator('button:has-text("Recents")').locator('..')
    await expect(recentsSection.getByText('alpha.md').first()).toBeVisible({ timeout: 3000 })
  })

  test('EXPL-2.8-02: Recents shows most recently opened file first', async ({ page }) => {
    await setupFs(page, {
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
    })
    await openFolder(page)

    await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })

    // Open alpha then beta
    await page.getByText('alpha.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    await page.getByText('beta.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 3000 })

    // Recents group should exist
    await expect(page.getByText('Recents', { exact: false }).first()).toBeVisible({ timeout: 3000 })

    // Get all text within the recents area; beta.md was opened last and should appear before alpha.md
    const recentsParent = page.locator('button:has-text("Recents")').locator('..')
    const recentsText = await recentsParent.textContent()
    const betaIdx = recentsText?.indexOf('beta.md') ?? -1
    const alphaIdx = recentsText?.indexOf('alpha.md') ?? -1
    expect(betaIdx).toBeGreaterThanOrEqual(0)
    expect(alphaIdx).toBeGreaterThanOrEqual(0)
    expect(betaIdx).toBeLessThan(alphaIdx)
  })
})

test.describe('Explorer Unsaved', () => {
  test('EXPL-2.9-01: Unsaved group shows files with unsaved changes', async ({ page }) => {
    await setupFs(page, {
      'arch.json': ONE_NODE_DIAGRAM,
    })
    await openFolder(page)

    await expect(page.getByText('arch.json').first()).toBeVisible({ timeout: 5000 })

    // Open the diagram
    await page.getByText('arch.json').first().click()
    await expect(page.locator('[data-testid="node-n1"]')).toBeVisible({ timeout: 5000 })

    // Drag the node to mark the diagram dirty
    const node = page.locator('[data-testid="node-n1"]')
    const box = await node.boundingBox()
    if (!box) throw new Error('node-n1 has no bounding box')
    const sx = box.x + 20
    const sy = box.y + 20
    await node.dispatchEvent('mousedown', { bubbles: true, cancelable: true, clientX: sx, clientY: sy })
    await page.mouse.move(sx + 150, sy + 50, { steps: 5 })
    await page.mouse.up()

    // The Unsaved group should appear (dirty state is debounced by 500ms in persistence hook)
    await expect(page.getByText('Unsaved changes', { exact: false })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('arch.json').first()).toBeVisible()
  })
})
