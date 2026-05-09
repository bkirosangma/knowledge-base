import { defineConfig, devices } from '@playwright/test'

const backend = (process.env.KB_E2E_BACKEND ?? 'webdriver') as
  | 'webdriver'
  | 'nextdev'

const useWebdriver = backend === 'webdriver'

export default defineConfig({
  testDir: './e2e',
  // Single Tauri instance per run; specs serialize through workers: 1.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: useWebdriver
      ? process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:1420'
      : process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: useWebdriver ? 'webdriver' : 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useWebdriver
    ? {
        command: 'npm run tauri:dev',
        // Readiness probe targets the WebDriver port set up by
        // tauri-plugin-webdriver (Task 9). When this responds the
        // Tauri webview is mounted.
        url: 'http://localhost:4444/status',
        reuseExistingServer: !process.env.CI,
        // Cold-start `tauri dev` is heavy on macOS — bump from
        // Playwright's 60s default.
        timeout: 180_000,
      }
    : process.env.PLAYWRIGHT_BASE_URL
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: !process.env.CI,
        },
})
