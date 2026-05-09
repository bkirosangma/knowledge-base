import { defineConfig, devices } from '@playwright/test'

// Single-backend post-MVP-4.x: chromium against `next dev` (:3000),
// with Tauri's invoke surface shimmed to `test_server` (axum :1421)
// via Playwright's addInitScript (see e2e/helpers/tauriShim.ts).
//
// `webServer.command` runs scripts/run-e2e.sh, which forks both
// processes side-by-side and traps SIGTERM. The readiness probe
// targets test_server's /health endpoint — Playwright treats that
// as the boot signal; next dev becomes ready ~3s after, well before
// any spec actually navigates. The `KB_E2E_BACKEND` env switch is
// gone — there is only one backend now.

export default defineConfig({
  testDir: './e2e',
  // Single Tauri instance per run; specs serialize through workers: 1.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'bash scripts/run-e2e.sh',
    // Probe test_server's /health endpoint — Playwright treats this
    // as the readiness signal. next dev becomes ready ~3s after,
    // before any spec actually navigates.
    url: 'http://localhost:1421/health',
    reuseExistingServer: !process.env.CI,
    // Cold cargo-run on a clean cache can take ~30-60s; bump beyond
    // Playwright's 60s default to give CI breathing room. CI also
    // pre-builds the bin in a separate step so this is effectively
    // already-up.
    timeout: 180_000,
  },
})
