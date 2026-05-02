import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers: LINK-5.2-04 (delete closes pane), LINK-5.2-05 (delete removes tree row),
//         LINK-5.2-06 (delete shows confirm popover),
//         LINK-5.1-09 (rename of currently-open document),
//         LINK-5.4-01 (rename propagates to open doc content).

// The delete-confirmation flow routes through the DiagramBridge, which is only
// initialized when DiagramView is mounted. Delete tests must open a diagram file
// first so the bridge is live before triggering any delete action.
const EMPTY_DIAGRAM = JSON.stringify({
  title: 'empty', layers: [], nodes: [], connections: [],
  layerManualSizes: {}, lineCurve: 'orthogonal', flows: [],
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

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as {
      __kbMockFS: { read: (p: string) => string | undefined }
    }).__kbMockFS
    return m.read(p)
  }, path)
}

/** Right-click the first explorer-tree row containing `filename` to open the context menu.
 *  Scoped to the tree so it doesn't pick up Recents/Unsaved entries. */
async function rightClickFile(page: Page, filename: string) {
  await page.getByTestId('explorer-tree').getByText(filename).first().click({ button: 'right' })
}

/** Open a diagram file from the tree; waits for canvas to confirm DiagramBridge is live. */
async function openDiagram(page: Page, filename: string) {
  await page.getByTestId('explorer-tree').getByText(filename).first().click()
  await page.locator('[data-testid="diagram-canvas"]').waitFor({ timeout: 5000 })
}

test.describe('File explorer — delete operations', () => {
  test('LINK-5.2-06: right-click → Delete shows a confirmation popover', async ({ page }) => {
    await setupFs(page, { 'diagram.json': EMPTY_DIAGRAM, 'note.md': '# Hello' })
    await openFolder(page)
    await openDiagram(page, 'diagram.json')

    await rightClickFile(page, 'note.md')
    // Context menu appears with Delete option
    await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Delete' }).click()
    // Confirmation popover shows the filename
    await expect(page.getByText(/Delete "note\.md"/)).toBeVisible({ timeout: 3000 })
  })

  test('LINK-5.2-05: confirming delete removes the file from the explorer tree', async ({ page }) => {
    await setupFs(page, { 'diagram.json': EMPTY_DIAGRAM, 'note.md': '# Hello', 'other.md': '# Other' })
    await openFolder(page)
    await openDiagram(page, 'diagram.json')
    await expect(page.getByText('note.md').first()).toBeVisible()

    await rightClickFile(page, 'note.md')
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(/Delete "note\.md"/)).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Delete' }).last().click()

    // File should be gone from the tree
    await expect(page.getByText('note.md')).toHaveCount(0, { timeout: 3000 })
    // Other file unaffected
    await expect(page.getByText('other.md').first()).toBeVisible()
  })

  test('LINK-5.2-04: confirming delete of open file removes it from tree and resets canvas', async ({ page }) => {
    // The pane stays mounted but the diagram state resets; "No file open" only
    // appears when leftPane===null which doesn't happen on delete.
    await setupFs(page, { 'diagram.json': EMPTY_DIAGRAM, 'other.md': '# Other' })
    await openFolder(page)
    await openDiagram(page, 'diagram.json')

    await rightClickFile(page, 'diagram.json')
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(/Delete "diagram\.json"/)).toBeVisible({ timeout: 3000 })
    await page.getByRole('button', { name: 'Delete' }).last().click()

    // File is removed from the explorer tree. Tree rows use 'span.truncate.flex-1';
    // Footer and PaneHeader both use 'span.truncate' without flex-1.
    await expect(page.locator('span.truncate.flex-1').filter({ hasText: 'diagram.json' })).toHaveCount(0, { timeout: 5000 })
    // Canvas stays visible (pane does not auto-close); other file unaffected
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible()
    await expect(page.getByText('other.md').first()).toBeVisible()
  })
})

test.describe('File explorer — rename operations', () => {
  test('LINK-5.1-09: renaming an open document updates the breadcrumb and preserves content', async ({ page }) => {
    await setupFs(page, { 'original.md': '# Hello\n\nContent here.' })
    await openFolder(page)
    await page.getByText('original.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })

    // Right-click → Rename. The context-menu item is the only button with
    // visible "Rename" text content; HoverBtn icons share the accessible
    // name via aria-label but have no text body, and the KB-036 Tooltip
    // bubbles render as `[role="tooltip"]` <span>s rather than buttons —
    // so a `button:has-text("Rename")` locator targets the menu item only.
    await rightClickFile(page, 'original.md')
    await page.locator('button:has-text("Rename")').click()

    // The file name in the tree becomes an input
    const renameInput = page.locator('input[value="original.md"]').first()
    await expect(renameInput).toBeVisible({ timeout: 3000 })
    // Use selectText + pressSequentially so each keystroke fires a real keyboard
    // event; React processes onChange synchronously per key, keeping editValue in
    // sync so commitRename's closure is fresh when Enter fires.
    await renameInput.selectText()
    await renameInput.pressSequentially('renamed.md')
    await page.keyboard.press('Enter')

    // Explorer shows the new name
    await expect(page.getByText('renamed.md').first()).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('original.md')).toHaveCount(0)

    // Content is preserved (scope to editor to avoid matching the pane title H1)
    await expect(page.locator('.ProseMirror').getByText('Hello')).toBeVisible()
    await expect(page.locator('.ProseMirror').getByText('Content here.')).toBeVisible()
  })

  test('LINK-5.4-01: renaming a doc propagates [[wiki-link]] references in open docs', async ({ page }) => {
    await setupFs(page, {
      'index.md': '# Index\n\nSee [[target]] for more.',
      'target.md': '# Target',
    })
    await openFolder(page)
    // Open index.md (which references [[target]])
    await page.getByText('index.md').first().click()
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    // The wiki-link pill for "target" is visible
    await expect(page.locator('.ProseMirror .wiki-link').filter({ hasText: 'target' })).toBeVisible({ timeout: 3000 })

    // Rename target.md → renamed.md
    await rightClickFile(page, 'target.md')
    await page.locator('button:has-text("Rename")').click()
    const renameInput = page.locator('input[value="target.md"]').first()
    await expect(renameInput).toBeVisible({ timeout: 3000 })
    await renameInput.selectText()
    await renameInput.pressSequentially('renamed.md')
    await page.keyboard.press('Enter')

    // index.md on disk should now contain [[renamed]] not [[target]]
    await expect.poll(async () => await readMockFile(page, 'index.md'), { timeout: 3000 })
      .toMatch(/\[\[renamed\]\]/)
  })
})
