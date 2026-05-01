import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers SHELL-1.11-01 through SHELL-1.11-05 (command palette open, filter,
// close, chip trigger, execute).
//
// KB-010c shifted the palette default mode from command-filter to vault
// search. Command filtering is now reached by prefixing the input with `>`.
// Tests that exercise command behaviour use `>` accordingly; the search
// behaviour itself has its own dedicated spec (vaultSearch.spec.ts).

const PALETTE_PLACEHOLDER = 'Search the vault, or > for commands…'

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

test.describe('Command Palette', () => {
  test('SHELL-1.11-01: ⌘K opens the command palette', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Click somewhere neutral (not in the editor) so ⌘K isn't blocked by contenteditable
    await page.locator('[data-testid="knowledge-base"]').click({ position: { x: 10, y: 10 } })

    await page.keyboard.press('Meta+k')
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByPlaceholder(PALETTE_PLACEHOLDER)).toBeVisible()
  })

  test('SHELL-1.11-02: Typing > filters commands', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Open palette via chip button
    await page.getByTestId('command-palette-trigger').click()
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })

    // Empty input — palette shows the mode hint, no commands listed
    await expect(page.getByText(/Type to search documents and diagrams/i)).toBeVisible()

    // `>` shows all commands
    await page.getByPlaceholder(PALETTE_PLACEHOLDER).fill('>')
    await expect(page.getByText('Toggle Read / Edit Mode').first()).toBeVisible({ timeout: 3000 })

    // `>xyzzy` matches nothing
    await page.getByPlaceholder(PALETTE_PLACEHOLDER).fill('>xyzzy')
    await expect(page.getByText('No matching commands')).toBeVisible()
  })

  test('SHELL-1.11-03: Escape closes the palette', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    await page.getByTestId('command-palette-trigger').click()
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).not.toBeVisible({ timeout: 3000 })
  })

  test('SHELL-1.11-04: Clicking the Header chip opens the palette', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    await page.getByTestId('command-palette-trigger').click()
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByPlaceholder(PALETTE_PLACEHOLDER)).toBeVisible()
  })

  test('SHELL-1.11-05: Enter executes a command and closes the palette', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)
    await openDocument(page, 'note.md')

    // Open palette
    await page.getByTestId('command-palette-trigger').click()
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).toBeVisible({ timeout: 3000 })

    // Filter to the toggle-read-only command using the `>` prefix.
    // "Toggle Read" is specific enough to land on Toggle Read / Edit Mode
    // as the active item — bare "Toggle" also matches Toggle Focus Mode.
    await page.getByPlaceholder(PALETTE_PLACEHOLDER).fill('>Toggle Read')
    await expect(page.getByText('Toggle Read / Edit Mode').first()).toBeVisible({ timeout: 3000 })

    // Execute with Enter
    await page.keyboard.press('Enter')

    // Palette should close
    await expect(page.getByRole('dialog', { name: 'Command Palette' })).not.toBeVisible({ timeout: 3000 })

    // The command should have fired — read mode button should now show "Exit Read Mode"
    await expect(page.getByRole('button', { name: 'Exit Read Mode' })).toBeVisible({ timeout: 3000 })
  })
})
