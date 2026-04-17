import { test, expect } from '@playwright/test'

test('app mounts and loads without errors', async ({ page }) => {
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
