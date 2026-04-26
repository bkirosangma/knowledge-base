import { test, expect, type Page } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

// Covers SHELL-1.13-01..04 — Phase 3 PR 1 dark theme + tokens (2026-04-26).

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
}

const SEED_DARK = {
  ...SEED,
  // Pre-seeded vault config with theme persisted as dark — exercises the
  // first-mount sync from vaultConfig (SHELL-1.13-03 / -04).
  '.archdesigner/config.json': JSON.stringify({
    version: '1.0',
    name: 'vault',
    created: '2026-04-26T00:00:00.000Z',
    lastOpened: '2026-04-26T00:00:00.000Z',
    theme: 'dark',
  }),
}

test.describe('Theme toggle (SHELL-1.13)', () => {
  test('SHELL-1.13-01: ⌘⇧L toggles theme; root gains data-theme="dark"', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    const root = page.locator('[data-testid="knowledge-base"]')
    // Default is light (OS pref or fallback) on a fresh vault with no theme set.
    await expect(root).toHaveAttribute('data-theme', 'light')

    // Click somewhere neutral so the keyboard shortcut isn't blocked by an editor.
    await root.click({ position: { x: 10, y: 10 } })
    await page.keyboard.press('Meta+Shift+l')

    await expect(root).toHaveAttribute('data-theme', 'dark')

    // Toggling again returns to light.
    await page.keyboard.press('Meta+Shift+l')
    await expect(root).toHaveAttribute('data-theme', 'light')
  })

  test('SHELL-1.13-02: sun/moon icon click toggles theme', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    const root = page.locator('[data-testid="knowledge-base"]')
    const toggle = page.getByTestId('theme-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(root).toHaveAttribute('data-theme', 'dark')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    await toggle.click()
    await expect(root).toHaveAttribute('data-theme', 'light')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('SHELL-1.13-03: theme persists across reload via vault config', async ({ page }) => {
    // Pre-seed the vault with theme: "dark" — first mount must apply it.
    await setupFs(page, SEED_DARK)
    await openFolder(page)

    const root = page.locator('[data-testid="knowledge-base"]')
    await expect(root).toHaveAttribute('data-theme', 'dark')
  })

  test('SHELL-1.13-04: dark mode applies dark surface via tokenised utility', async ({ page }) => {
    await setupFs(page, SEED)
    await openFolder(page)

    const root = page.locator('[data-testid="knowledge-base"]')

    // Light first — root uses bg-surface-2 (--surface-2), which in light is
    // #f8fafc (rgb(248, 250, 252)).
    const lightBg = await root.evaluate((el: HTMLElement) =>
      getComputedStyle(el).backgroundColor,
    )
    expect(lightBg).toBe('rgb(248, 250, 252)')

    await page.getByTestId('theme-toggle').click()
    await expect(root).toHaveAttribute('data-theme', 'dark')

    // Dark — same utility class now resolves through the dark token
    // override: --surface-2 is #1e293b (rgb(30, 41, 59)). The light → dark
    // jump asserts both that the data-theme override is wired and that the
    // tokenised utility actually flips colour at runtime.
    const darkBg = await root.evaluate((el: HTMLElement) =>
      getComputedStyle(el).backgroundColor,
    )
    expect(darkBg).toBe('rgb(30, 41, 59)')
  })
})
