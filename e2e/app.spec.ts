import { test, expect } from '@playwright/test'

// Covers SHELL-1.1-01..03 (pre-folder/empty-state behaviours that don't
// depend on picking a real directory).
//
// Golden-path flows (open folder → create → edit → save → navigate) require
// driving `window.showDirectoryPicker`, which Chromium gates behind a user
// gesture and a native dialog. Driving that dialog reliably from Playwright
// needs an in-memory File System Access mock injected via addInitScript;
// that mock is out-of-scope here and is why the integration cases across
// LINK-5.1 / 5.2 / 5.4 / 5.5 stay 🚫 in test-cases/05-links-and-graph.md.

test('SHELL-1.1-01: app mounts and loads without errors', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.startsWith('Failed to load resource')) {
        consoleErrors.push(text)
      }
    }
  })

  await page.goto('/')
  await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible()

  expect(pageErrors).toHaveLength(0)
  expect(consoleErrors).toHaveLength(0)
})

test('SHELL-1.1-02: Geist font CSS variables applied to <html>', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()

  // next/font injects `--font-geist-sans` / `--font-geist-mono` as inline style vars
  // on <html>. They resolve to a generated font-family string, not empty.
  const sansVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-geist-sans').trim(),
  )
  const monoVar = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--font-geist-mono').trim(),
  )
  expect(sansVar.length).toBeGreaterThan(0)
  expect(monoVar.length).toBeGreaterThan(0)
})

test('SHELL-1.1-03: root shell uses full-height flex column layout', async ({ page }) => {
  await page.goto('/')
  const root = page.locator('[data-testid="knowledge-base"]')
  await root.waitFor()

  const display = await root.evaluate((el) => getComputedStyle(el).display)
  const flexDirection = await root.evaluate((el) => getComputedStyle(el).flexDirection)
  const box = await root.boundingBox()

  expect(display).toBe('flex')
  expect(flexDirection).toBe('column')
  const viewport = page.viewportSize()!
  expect(Math.round(box!.height)).toBe(viewport.height)
})

test('first-run hero renders when no folder is open', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()

  // KB-012: when no vault has ever been opened, knowledgeBase.tsx
  // surfaces the FirstRunHero as the right-pane content. The "No file
  // open" empty state still exists for the post-vault-open path
  // (covered by FirstRunHero.test.tsx + firstRunHero.spec.ts). The
  // explorer's own "No folder open" message + "Open Folder" button
  // remain on the left sidebar.
  await expect(page.getByTestId('first-run-hero')).toBeVisible()
  await expect(page.getByTestId('first-run-open-folder')).toBeVisible()
  await expect(page.getByTestId('first-run-sample-vault')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open Folder' })).toBeVisible()
})

test('Open Folder button is a real clickable control', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: 'Open Folder' })
  await btn.waitFor()
  await expect(btn).toBeEnabled()
  // Deliberately NOT clicked — Chromium's directory picker can't be driven
  // from Playwright without a page-injected File System Access mock.
})

test('top-level Header renders only the Split toggle before any file is open', async ({ page }) => {
  // Title editing + Save/Discard moved into each pane's `PaneHeader` row
  // (folded from PaneTitle on 2026-04-26 / SHELL-1.12), so the shell header
  // no longer shows an "Untitled" fallback input before a file is open.
  // Only the ⌘K trigger and Split toggle remain up top.
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await expect(page.locator('input[value="Untitled"]')).toHaveCount(0)
  await expect(page.locator('button[aria-label="Enter split view"]').first()).toBeVisible()
})
