import { test, expect } from '@playwright/test'

test('app loads without JS errors', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', (err) => pageErrors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  await page.goto('/')
  await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible()

  expect(pageErrors).toHaveLength(0)
  expect(consoleErrors).toHaveLength(0)
})
