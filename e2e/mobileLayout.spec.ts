import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers SHELL-1.14-01..04 — Phase 3 PR 3 mobile shell + bottom nav (2026-04-26).
//
// The breakpoint is 900 px; the default Playwright Desktop Chrome viewport
// is 1280 × 720 so existing specs stay on the desktop tree. These tests
// explicitly set the iPhone-class viewport before opening the page so
// `useViewport` reports `isMobile: true` and `MobileShell` mounts.

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

const SEED = {
  'note.md': '# Hello\n\nWorld',
  'second.md': '# Second note\n\nLinked from [[note]].',
}

test.describe('Mobile Shell (SHELL-1.14)', () => {
  test('SHELL-1.14-01: At 390x844 viewport, MobileShell renders (BottomNav visible)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupFs(page, SEED)
    // Wait for hydration — the SSR default is desktop, so the mobile
    // shell only mounts after the matchMedia effect runs.
    await expect(page.getByTestId('mobile-shell')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('bottom-nav')).toBeVisible()
    await expect(page.getByTestId('bottom-nav-files')).toBeVisible()
    await expect(page.getByTestId('bottom-nav-read')).toBeVisible()
    await expect(page.getByTestId('bottom-nav-graph')).toBeVisible()
  })

  test('SHELL-1.14-02: Files tab → tap a file → switches to Read tab and shows content', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupFs(page, SEED)
    await expect(page.getByTestId('mobile-shell')).toBeVisible({ timeout: 5000 })

    await openFolder(page)

    // Files tab is the default — open one.
    await expect(page.getByTestId('mobile-tab-files')).toBeVisible()
    await page.getByText('note.md').first().click()

    // Read tab now active and showing the doc content.
    await expect(page.getByTestId('mobile-tab-read')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('bottom-nav-read')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.ProseMirror').first()).toBeVisible()
  })

  test('SHELL-1.14-03: Bottom nav Graph tab opens GraphView', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupFs(page, SEED)
    await expect(page.getByTestId('mobile-shell')).toBeVisible({ timeout: 5000 })
    await openFolder(page)

    await page.getByTestId('bottom-nav-graph').click()
    await expect(page.getByTestId('mobile-tab-graph')).toBeVisible()
    await expect(page.getByTestId('graph-view')).toBeVisible({ timeout: 5000 })
  })

  test('SHELL-1.14-04: Above 900px viewport, MobileShell does NOT render', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await setupFs(page, SEED)

    // Mobile shell stays unmounted; desktop chrome is what we see.
    await expect(page.getByTestId('mobile-shell')).toHaveCount(0)
    await expect(page.getByTestId('bottom-nav')).toHaveCount(0)
    // The desktop split-toggle button only exists in the desktop tree.
    await expect(page.locator('[aria-label="Enter split view"], [aria-label="Exit split view"]')).toBeVisible()
  })
})
