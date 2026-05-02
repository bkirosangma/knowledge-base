import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers SHELL-1.12-01..05 — Phase 2 PR 2 shell collapse: PaneTitle folded
// into PaneHeader; the global Header now shows a dirty-stack indicator.

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

async function openDiagram(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  // Wait for the diagram pane title to render (PaneHeader title section).
  await expect(page.getByTestId('pane-title')).toBeVisible({ timeout: 5000 })
}

async function openDocument(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

const DIAGRAM_SEED = JSON.stringify({
  title: 'Architecture Overview',
  layers: [],
  nodes: [],
  connections: [],
})

test.describe('Shell collapse — PaneTitle folded into PaneHeader (SHELL-1.12)', () => {
  test('SHELL-1.12-01: title input lives inside the breadcrumb row (no separate row)', async ({ page }) => {
    // KB-013 hides the breadcrumb at path depth ≤ 1, so this test
    // (which co-locates the breadcrumb segment with the title) needs
    // a nested fixture to surface a breadcrumb segment at all.
    await setupFs(page, { 'diagrams/arch.json': DIAGRAM_SEED })
    await openFolder(page)
    await page.getByTestId('explorer-search').fill('arch')
    await openDiagram(page, 'arch.json')

    // Both the breadcrumb segment for the file and the title <h1> share the
    // SAME parent row (the PaneHeader strip), so the old PaneTitle row is
    // gone. We assert co-location by looking for them inside one ancestor
    // element with the PaneHeader's identifying class set.
    const breadcrumbSegment = page.locator('span', { hasText: 'arch.json' }).first()
    const titleHeading = page.getByTestId('pane-title')
    const sharedAncestor = page.locator('div.border-b.border-line').filter({
      has: breadcrumbSegment,
    }).filter({ has: titleHeading })
    await expect(sharedAncestor.first()).toBeVisible()
  })

  test('SHELL-1.12-02: editing the title and pressing Enter commits the change', async ({ page }) => {
    await setupFs(page, { 'arch.json': DIAGRAM_SEED })
    await openFolder(page)
    await openDiagram(page, 'arch.json')

    // Click the heading to enter edit mode.
    await page.getByTestId('pane-title').click()
    const input = page.getByTestId('pane-title-input')
    await expect(input).toBeVisible()
    await input.fill('Renamed Diagram')
    await input.press('Enter')

    // After Enter, the heading reflects the committed value. KB-032 prepends
    // a "•" to the title text whenever the file is dirty, so the rename will
    // surface as "• Renamed Diagram" — assert containment, not exact text.
    await expect(page.getByTestId('pane-title')).toContainText('Renamed Diagram')
  })

  test('SHELL-1.12-03: Save and Discard appear next to the title in the breadcrumb', async ({ page }) => {
    await setupFs(page, { 'arch.json': DIAGRAM_SEED })
    await openFolder(page)
    await openDiagram(page, 'arch.json')

    // Edit the title to make the file dirty and surface Save / Discard.
    await page.getByTestId('pane-title').click()
    const input = page.getByTestId('pane-title-input')
    await input.fill('Dirty Title')
    await input.press('Enter')

    // Save + Discard live in the same PaneHeader row as the breadcrumb.
    const saveBtn = page.getByTitle(/^Save/)
    const discardBtn = page.getByTitle('Discard changes')
    await expect(saveBtn).toBeVisible()
    await expect(discardBtn).toBeVisible()
    await expect(saveBtn).toBeEnabled()
    await expect(discardBtn).toBeEnabled()
  })

  test('SHELL-1.12-04: dirty-stack indicator in Header shows count after edit', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Note\n\nBody.' })
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Indicator hidden before any edits.
    await expect(page.getByTestId('dirty-stack-indicator')).toHaveCount(0)

    // Type into the editor to dirty the document.
    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await editor.press('End')
    await page.keyboard.type(' edited', { delay: 30 })

    const indicator = page.getByTestId('dirty-stack-indicator')
    await expect(indicator).toBeVisible({ timeout: 5000 })
    await expect(indicator).toHaveText(/1 unsaved/)
  })

  test('SHELL-1.12-05: dirty-stack indicator hidden when no files are dirty', async ({ page }) => {
    await setupFs(page, { 'note.md': '# Note\n\nBody.' })
    await openFolder(page)
    await openDocument(page, 'note.md')

    // No edits made → indicator must not be in the DOM.
    await expect(page.getByTestId('dirty-stack-indicator')).toHaveCount(0)
  })
})
