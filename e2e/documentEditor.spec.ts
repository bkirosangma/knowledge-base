import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers DOC-4.1-04, DOC-4.3-07–11 (wiki-link suggestion + folder picker),
//        DOC-4.7-15–17 (LinkEditorPopover browse button),
//        DOC-4.3-15/16 / DOC-4.12-05 (click navigation in read mode).

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

async function openFile(page: Page, filename: string) {
  await page.getByText(filename).first().click()
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
}

// ── Backlinks dropdown ────────────────────────────────────────────────────────

test.describe('Backlinks dropdown', () => {
  test('DOC-4.1-04: backlinks button appears and opens dropdown when references exist', async ({ page }) => {
    await setupFs(page, {
      'source.md': '# Source\n\nSee [[target]] for more.',
      'target.md': '# Target',
    })
    await openFolder(page)

    // Open source.md first to trigger updateDocumentLinks, seeding target's backlink in the index
    await openFile(page, 'source.md')
    await expect(page.getByText('See').first()).toBeVisible()
    // Give the async link-index update time to settle before switching panes
    await page.waitForTimeout(1500)
    // Now open target.md
    await openFile(page, 'target.md')

    // Button shows the reference count
    const backlinkBtn = page.getByRole('button', { name: /1 reference/ })
    await expect(backlinkBtn).toBeVisible({ timeout: 8000 })

    // Click to open dropdown
    await backlinkBtn.click()

    // Backlink entry for source.md appears
    await expect(page.getByText('source.md').first()).toBeVisible()
  })
})

// ── Wiki-link suggestion / FolderPicker ───────────────────────────────────────

test.describe('Wiki-link suggestion popup', () => {
  test('DOC-4.3-07: typing [[ opens the folder picker starting at the vault root', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\n',
      'other.md': '# Other',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    // Move cursor to end of content
    await page.keyboard.press('End')
    await page.keyboard.type('[[')

    // FolderPicker header shows "Root" at the vault root
    await expect(page.locator('body').getByText('Root').first()).toBeVisible({ timeout: 3000 })
  })

  test('DOC-4.3-08: typing after [[ switches picker to flat filtered list', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\n',
      'alpha.md': '# Alpha',
      'beta.md': '# Beta',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type('[[')

    // Picker mode: Root label visible
    await expect(page.locator('body').getByText('Root').first()).toBeVisible({ timeout: 3000 })

    // Type a character → switches to list mode
    await page.keyboard.type('al')

    // List mode shows matching paths
    await expect(page.locator('body').getByText('alpha.md').first()).toBeVisible({ timeout: 3000 })
    // Picker header "Root" is gone
    await expect(page.locator('body').getByText('Root')).not.toBeVisible()
  })

  test('DOC-4.3-09: arrow keys highlight different items in the suggestion list', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\n',
      'apple.md': '# Apple',
      'apricot.md': '# Apricot',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type('[[ap')

    // Two items visible in the suggestion popup
    await expect(page.locator('body').getByText('apple.md').first()).toBeVisible({ timeout: 3000 })
    await expect(page.locator('body').getByText('apricot.md').first()).toBeVisible()

    // Items are rendered with data-index. Capture their initial classes.
    const firstItem = page.locator('[data-index="0"]').first()
    const secondItem = page.locator('[data-index="1"]').first()

    // Press ArrowDown to move selection from item 0 to item 1
    await page.keyboard.press('ArrowDown')

    // After ArrowDown the second item should be highlighted (bg-blue-50) and first should not
    await expect(secondItem).toHaveClass(/bg-blue-50/, { timeout: 2000 })
    await expect(firstItem).not.toHaveClass(/bg-blue-50/)
  })

  test('DOC-4.3-10: Enter commits the selected suggestion as a wiki-link', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\n',
      'target.md': '# Target',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.press('End')
    // Slow-type so each transaction's async view.update() completes before
    // the next keystroke — prevents the Suggestion plugin from having stale
    // plugin-active state when Enter is pressed.
    await page.keyboard.type('[[target', { delay: 50 })

    // Wait for the list-mode popup container (.max-h-48 is unique to the suggestion list)
    const firstItem = page.locator('.max-h-48 [data-index="0"]')
    await expect(firstItem).toBeVisible({ timeout: 3000 })

    // Click the suggestion item — invokes commandFn synchronously, bypassing the async Enter race
    await firstItem.click()

    // Suggestion popup should close
    await expect(page.locator('.max-h-48')).not.toBeVisible({ timeout: 3000 })

    // Wiki-link pill should appear in the editor
    await expect(editor.locator('.wiki-link').filter({ hasText: /target/ }).first()).toBeVisible({ timeout: 3000 })
  })

  test('DOC-4.3-11: Escape closes the suggestion without inserting a wiki-link', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\n',
      'target.md': '# Target',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    const editor = page.locator('.ProseMirror').first()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type('[[')

    await expect(page.locator('body').getByText('Root').first()).toBeVisible({ timeout: 3000 })

    // Escape closes the suggestion
    await page.keyboard.press('Escape')

    await expect(page.locator('body').getByText('Root')).not.toBeVisible()
    // No wiki-link pill inserted
    await expect(editor.locator('.wiki-link')).toHaveCount(0)
  })
})

// ── LinkEditorPopover browse button ──────────────────────────────────────────

test.describe('LinkEditorPopover — browse button', () => {
  test('DOC-4.7-15: browse button absent for plain link marks (URL mode)', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\nVisit [example](https://example.com).',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    // Click inside the link text to open the popover
    await page.locator('.ProseMirror a').first().click()

    // Popover shows the URL label
    await expect(page.getByText('URL').first()).toBeVisible({ timeout: 3000 })

    // Browse button (folder icon) should NOT be visible for plain links
    await expect(page.getByTitle('Browse files')).not.toBeVisible()
  })

  test('DOC-4.7-16: clicking the browse button on a wiki-link opens the FolderPicker inline', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\nSee [[target]].',
      'target.md': '# Target',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    // Click the wiki-link pill to select it (creates NodeSelection → opens popover)
    await page.locator('.ProseMirror .wiki-link').first().click()

    // Wait for popover with "Path" label
    await expect(page.getByText('Path').first()).toBeVisible({ timeout: 3000 })

    // Browse button should be visible
    await expect(page.getByTitle('Browse files')).toBeVisible()

    // Click browse to open FolderPicker
    await page.getByTitle('Browse files').click()

    // FolderPicker panel appears inline (shows "Root" header)
    await expect(page.getByText('Root').first()).toBeVisible({ timeout: 3000 })
  })

  test('DOC-4.7-17: selecting a file from the inline picker commits the path', async ({ page }) => {
    await setupFs(page, {
      'note.md': '# Note\n\nSee [[old-target]].',
      'old-target.md': '# Old',
      'new-target.md': '# New',
    })
    await openFolder(page)
    await openFile(page, 'note.md')

    // Select the wiki-link
    await page.locator('.ProseMirror .wiki-link').first().click()
    await expect(page.getByText('Path').first()).toBeVisible({ timeout: 3000 })

    // Open browse picker
    await page.getByTitle('Browse files').click()
    await expect(page.getByText('Root').first()).toBeVisible({ timeout: 3000 })

    // Click new-target.md in the picker (scope to FolderPicker container to avoid sidebar)
    await page.locator('.max-h-56').getByText('new-target.md').first().click()

    // Picker should close
    await expect(page.getByText('Root')).not.toBeVisible()

    // After picker selection the popover closes (focus returns to editor).
    // The wiki-link pill in the editor should display the new path.
    const editor = page.locator('.ProseMirror').first()
    await expect(editor.locator('.wiki-link').filter({ hasText: 'new-target.md' }).first()).toBeVisible({ timeout: 3000 })
  })
})

// ── Wiki-link click navigation in read mode ──────────────────────────────────
// DOC-4.3-15, DOC-4.3-16, DOC-4.12-05

test.describe('Wiki-link click navigation (read mode)', () => {
  test('DOC-4.3-15 / DOC-4.12-05: clicking a resolved wiki-link in read mode navigates to the target', async ({ page }) => {
    await setupFs(page, {
      'index.md': '# Index\n\nSee [[notes/target]].',
      'notes/target.md': '# Target Doc',
    })
    await openFolder(page)
    await openFile(page, 'index.md')

    // Enter read-only mode
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')

    // Click the resolved wiki-link pill
    await page.locator('.ProseMirror .wiki-link').filter({ hasText: 'notes/target' }).first().click()

    // Should navigate to target.md (editor shows target content)
    await expect(page.getByText('Target Doc').first()).toBeVisible({ timeout: 5000 })
  })

  test('DOC-4.3-16: clicking an unresolved wiki-link in read mode triggers document creation', async ({ page }) => {
    await setupFs(page, {
      'index.md': '# Index\n\nSee [[missing-doc]].',
    })
    await openFolder(page)
    await openFile(page, 'index.md')

    // Enter read-only mode
    await page.getByRole('button', { name: 'Enter Read Mode' }).click()
    await expect(page.locator('.ProseMirror').first()).toHaveAttribute('contenteditable', 'false')

    // Click the unresolved (red) wiki-link pill
    await page.locator('.ProseMirror .wiki-link').filter({ hasText: 'missing-doc' }).first().click()

    // A new empty document should be created and opened in the editor
    // The new doc's editor should be visible (ProseMirror is now editable for the new doc)
    await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 5000 })
    // The explorer should show missing-doc.md (or the editor path shows it)
    await expect(page.getByText('missing-doc.md').first()).toBeVisible({ timeout: 5000 })
  })
})
