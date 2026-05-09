// e2e/helpers/launchApp.ts
//
// Boots the app for an MVP-4.x e2e spec. Single backend post-MVP-4.x:
// chromium against `next dev`, with the Tauri invoke surface shimmed
// to test_server (axum on :1421) via Playwright's addInitScript.
//
// The legacy `currentBackend()` switch + `KB_E2E_BACKEND` env var are
// gone — there is only one backend now. Specs that previously gated
// `test.skip(currentBackend() === "nextdev", …)` install the shim
// via `test.beforeEach(installShim)` instead.

import type { Page } from "@playwright/test";

import { installShim } from "./tauriShim";

export async function setVaultPath(page: Page, vaultPath: string): Promise<void> {
  await page.evaluate(async (path) => {
    // @ts-expect-error - shim installs __TAURI__ via addInitScript
    await window.__TAURI__.invoke("vault_set_root", { path });
  }, vaultPath);
}

export { installShim };
