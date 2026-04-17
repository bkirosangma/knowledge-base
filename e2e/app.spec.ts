import { test, expect } from '@playwright/test'

test('app loads without JS errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')
  await expect(page.locator('body')).toBeVisible()

  expect(errors).toHaveLength(0)
})
