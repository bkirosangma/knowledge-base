import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'
import { seedWithNode } from './helpers/diagramSeeds'

// Covers DOC-4.12-09, DOC-4.12-10, DOC-4.12-11, DOC-4.12-12
//         DIAG-3.17-10, DIAG-3.17-12, DIAG-3.17-13

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

async function openDocument(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

const SEED = {
  'note.md': '# Hello\n\nWorld',
}

test.describe('Read Mode Escape Hatch — Document', () => {
  test('DOC-4.12-09: E key toggles from read mode to edit mode in a document', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Enter read mode via the button
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()

    // Editor is now non-editable
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')

    // Press E — focus must be outside the editor (click neutral area first)
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('e')

    // Should have exited read mode
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'true')
  })

  test('DOC-4.12-10: E key toggles from edit mode to read mode in a document', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Should be in edit mode (localStorage pre-seeded false)
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible()

    // Click neutral area so E fires (not captured by Tiptap)
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('e')

    // Should now be in read mode
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')
  })

  test('DOC-4.12-11: First keypress in read mode shows toast "Press E to edit"', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Enter read mode
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible()

    // Press a non-E key while in read mode (outside editor)
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('a')

    // Toast should appear
    await expect(page.getByRole('status')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('status')).toContainText('Press E to edit')
  })

  test('DOC-4.12-12: Newly created document opens in edit mode', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    // Click the "New Document" button in the explorer header
    await page.getByTitle('New Document').click()

    // Wait for the new file to appear and be opened
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // New document should open in edit mode — Enter Read Mode is visible (not Exit)
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'true')
  })
})

// ---------------------------------------------------------------------------
// Diagram pane — E key read-mode escape hatch
// ---------------------------------------------------------------------------

async function setupDiagramFs(page: Page, seed: Record<string, string>) {
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

async function openDiagramFile(page: Page) {
  await page.getByRole('button', { name: 'Open Folder' }).click()
  await page.getByText('diagram.json').first().click()
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })
}

test.describe('Read Mode Escape Hatch — Diagram', () => {
  test('DIAG-3.17-10: E key toggles read mode to edit mode (and back) in diagram', async ({ page }) => {
    await setupDiagramFs(page, seedWithNode())
    await openDiagramFile(page)

    // Diagram opens in edit mode (localStorage pre-seeded to false)
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible()

    // Enter read mode via keyboard shortcut
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })

    // Click neutral canvas area so E is not captured by a focused widget
    await page.locator('[data-testid="diagram-canvas"]').click({ position: { x: 10, y: 10 } })

    // Press E — should exit read mode
    await page.keyboard.press('e')
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible({ timeout: 3000 })

    // Press E again — should re-enter read mode (edit→read direction)
    await page.locator('[data-testid="diagram-canvas"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('e')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })
  })

  test('DIAG-3.17-12: First keypress in diagram read mode shows toast "Press E to edit"', async ({ page }) => {
    await setupDiagramFs(page, seedWithNode())
    await openDiagramFile(page)

    // Enter read mode
    await page.keyboard.press('Control+Shift+r')
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })

    // Click neutral canvas area then press a non-E key
    await page.locator('[data-testid="diagram-canvas"]').click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('a')

    // Toast should appear with the hint text
    await expect(page.getByRole('status')).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('status')).toContainText('Press E to edit')
  })

  test('DIAG-3.17-13: Newly created diagram file opens in edit mode', async ({ page }) => {
    await setupDiagramFs(page, seedWithNode())
    await openDiagramFile(page)

    // Click the "New Diagram" button in the explorer header
    await page.getByTitle('New Diagram').click()

    // Wait for the new diagram canvas to be visible
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 })

    // New diagram should open in edit mode — Enter Read Mode is visible (not Exit)
    await expect(page.getByRole('button', { name: 'Enter Read Mode' })).toBeVisible({ timeout: 3000 })
  })
})
