import { test, expect } from '@playwright/test'
import { installMockFS } from './fixtures/fsMock'

test('sanity: addInitScript installs window.showDirectoryPicker', async ({ page }) => {
  await page.addInitScript(installMockFS)
  await page.goto('/')

  const info = await page.evaluate(() => {
    const w = window as unknown as {
      showDirectoryPicker?: unknown
      __kbMockFS?: { seed: (f: Record<string, string>) => void; read: (p: string) => string | undefined }
    }
    return {
      hasPicker: typeof w.showDirectoryPicker,
      hasMock: typeof w.__kbMockFS,
    }
  })
  expect(info.hasPicker).toBe('function')
  expect(info.hasMock).toBe('object')
})

test('sanity: calling showDirectoryPicker returns a seeded root handle', async ({ page }) => {
  await page.addInitScript(installMockFS)
  await page.goto('/')
  await page.evaluate(() => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS
    m.seed({ 'notes/a.md': 'hello', 'notes/b.md': 'world' })
  })

  const filenames = await page.evaluate(async () => {
    const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker()
    const out: string[] = []
    for await (const entry of handle.values()) {
      if (entry.kind === 'directory') {
        const dir = entry as FileSystemDirectoryHandle
        for await (const child of dir.values()) out.push(`${entry.name}/${child.name}`)
      } else {
        out.push(entry.name)
      }
    }
    return out.sort()
  })

  expect(filenames).toEqual(['notes/a.md', 'notes/b.md'])
})

test('sanity: click Open Folder populates explorer with root-level files', async ({ page }) => {
  await page.addInitScript(installMockFS)
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase('knowledge-base') } catch { /* ignore */ }
    try { localStorage.clear() } catch { /* ignore */ }
  })
  await page.goto('/')
  await page.locator('[data-testid="knowledge-base"]').waitFor()
  await page.evaluate(() => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS
    m.seed({ 'alpha.md': '# Alpha', 'beta.md': '# Beta' })
  })

  await page.getByRole('button', { name: 'Open Folder' }).click()
  // Root-level files should appear in the explorer within a few seconds.
  await expect(page.getByText('alpha.md').first()).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('beta.md').first()).toBeVisible({ timeout: 5000 })
})
