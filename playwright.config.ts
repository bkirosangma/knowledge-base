import { defineConfig, devices } from '@playwright/test'

// Single-backend post-MVP-4.x: chromium against `next dev` (:3000),
// with Tauri's invoke surface shimmed to `test_server` (axum :1421)
// via Playwright's addInitScript (see e2e/helpers/tauriShim.ts).
//
// `webServer.command` runs scripts/run-e2e.sh, which forks both
// processes side-by-side and traps SIGTERM. The readiness probe
// targets test_server's /health endpoint — Playwright treats that
// as the boot signal; next dev becomes ready ~3s after, well before
// any spec actually navigates.
//
// Two browser projects: `chromium` is the default (CI runs only this
// project — fast, deterministic). `webkit` is opt-in via
// `--project=webkit` and gives Apple WebKit engine fidelity locally
// (CSS / DOM / JavaScriptCore) — useful as a pre-release smoke since
// real Tauri WKWebView automation is not available today (tauri-driver
// 2.0.6 source-level-rejects darwin; upstream PR tauri-apps/tauri#15295
// documents Apple's lack of a DOM-aware WebDriver path into WKWebView
// as an open design problem). Playwright's webkit binary is standalone
// WebKit, NOT WKWebView — it catches engine bugs but NOT Tauri's IPC
// bridge / preload / CSP. Manual smoke remains the gate for those.

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
    // Register webkit so `--project=webkit` works for opt-in pre-release
    // smokes. CI passes `--project=chromium` explicitly to keep the default
    // run fast; the `npm run test:e2e:webkit` script in package.json is the
    // local entry point for WebKit-engine fidelity.
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
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
