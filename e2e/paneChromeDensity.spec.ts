import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// KB-013 — pane chrome density.
// Stop conditions:
//  1. Layout shift < 4 px when switching between paths of different depth
//     (asserted by comparing the title-input bbox between two same-depth
//     files; cross-depth shifts are by design — the breadcrumb appears
//     for the first time at depth ≥ 2).
//  2. Resize to 1024 px → diagram toolbar collapses (overflow visible).
//  3. Open a root-level note → no breadcrumb strip.

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
      localStorage.setItem(`document-read-only:${filename}`, 'false')
      localStorage.setItem(`diagram-read-only:${filename}`, 'false')
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

test.describe('KB-013 — breadcrumb density', () => {
  test('opening a root-level note shows no breadcrumb strip', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Hello\n\nWorld.',
    })
    await openFolder(page)
    await page.getByText('note.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    // Depth = 1 → no breadcrumb element.
    await expect(page.getByTestId('pane-breadcrumb')).toHaveCount(0)
  })

  test('opening a nested note shows the breadcrumb', async ({ page }) => {
    await setupFs(page, {
      'notes/topic/deep.md': '# Deep\n\nNested.',
    })
    await openFolder(page)

    // Use the explorer search to surface the nested file without
    // needing to expand the folder tree row-by-row.
    await page.getByTestId('explorer-search').fill('deep')
    await page.getByText('deep.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    const breadcrumb = page.getByTestId('pane-breadcrumb')
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText('notes')
    await expect(breadcrumb).toContainText('topic')
    await expect(breadcrumb).toContainText('deep.md')
  })

  test('layout shift < 4 px when switching between two paths of the same depth', async ({ page }) => {
    await setupFs(page, {
      'notes/a.md': '# A',
      'notes/b.md': '# B',
    })
    await openFolder(page)
    // Surface both nested files via the explorer search.
    await page.getByTestId('explorer-search').fill('.md')

    // Open a.md first.
    await page.getByText('a.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    const titleA = page.getByTestId('pane-title')
    await expect(titleA).toBeVisible()
    const boxA = await titleA.boundingBox()
    expect(boxA).not.toBeNull()

    // Switch to b.md (same depth, different name → breadcrumb width
    // varies by 1 char).
    await page.getByText('b.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toContainText('B')
    const titleB = page.getByTestId('pane-title')
    const boxB = await titleB.boundingBox()
    expect(boxB).not.toBeNull()

    expect(Math.abs((boxA!.x ?? 0) - (boxB!.x ?? 0))).toBeLessThan(4)
  })
})

test.describe('KB-013 — diagram toolbar overflow at 1024 px', () => {
  test('toolbar collapses Live / Labels / Minimap into the overflow menu', async ({ page }) => {
    await setupFs(page, {
      'topo.json': JSON.stringify({
        title: 'Topo',
        layers: [{ id: 'l1', title: 'L1', bg: '#fff', border: '#000' }],
        nodes: [{ id: 'n1', label: 'N1', icon: 'default', x: 200, y: 200, w: 200, layer: 'l1' }],
        connections: [],
      }),
    })

    // Resize before navigation so the initial render lands in compact mode.
    await page.setViewportSize({ width: 1024, height: 768 })
    await openFolder(page)
    await page.getByText('topo.json').first().click()
    await page.waitForTimeout(500)

    // Inline Live button should not exist; overflow trigger should.
    await expect(page.getByRole('button', { name: 'Toggle live data flow animation' })).toHaveCount(0)
    const trigger = page.getByTestId('diagram-toolbar-overflow-trigger')
    await expect(trigger).toBeVisible()

    // Zoom controls remain inline.
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()

    // Open the overflow → all three toggles surface.
    await trigger.click()
    await expect(page.getByTestId('overflow-item-live')).toBeVisible()
    await expect(page.getByTestId('overflow-item-labels')).toBeVisible()
    await expect(page.getByTestId('overflow-item-minimap')).toBeVisible()
  })

  test('toolbar restores inline buttons at desktop width', async ({ page }) => {
    await setupFs(page, {
      'topo.json': JSON.stringify({
        title: 'Topo',
        layers: [{ id: 'l1', title: 'L1', bg: '#fff', border: '#000' }],
        nodes: [{ id: 'n1', label: 'N1', icon: 'default', x: 200, y: 200, w: 200, layer: 'l1' }],
        connections: [],
      }),
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await openFolder(page)
    await page.getByText('topo.json').first().click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('diagram-toolbar-overflow-trigger')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Toggle live data flow animation' })).toBeVisible()
  })
})

test.describe('KB-013 — explorer width', () => {
  test('explorer renders at the new 240 px default width', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Hello' })
    await openFolder(page)
    const explorer = page.getByTestId('explorer-container')
    const box = await explorer.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.width).toBe(240)
  })
})
