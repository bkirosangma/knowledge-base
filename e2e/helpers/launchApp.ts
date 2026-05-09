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

const TEST_SERVER_URL =
  process.env.KB_TEST_SERVER_URL ?? "http://localhost:1421";

/**
 * Sets the test_server's vault root and reloads the page so the React
 * boot path (useFileExplorer.tsx line ~78) restores into the chosen
 * vault via `settings_read → settings.vault.lastPath`.
 *
 * Why reload (not just call from the page)?  The boot effect runs once
 * on mount. Setting the root after the first mount has no effect on
 * React state because nothing watches the backend. Reloading is the
 * minimal way to re-trigger the boot path against the seeded root.
 *
 * The dispatch.rs `settings_read` handler synthesizes
 * `vault.lastPath` from the test_server's current vault root, so the
 * post-reload `settings_read` returns the path we just set.
 */
export async function setVaultPath(page: Page, vaultPath: string): Promise<void> {
  // POST to test_server from node — `setVaultPath` does not need the
  // page-side __TAURI__ shim because the test body runs in node.
  const res = await fetch(`${TEST_SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd: "vault_set_root", args: { path: vaultPath } }),
  });
  if (!res.ok) {
    throw new Error(
      `vault_set_root: test_server ${res.status}: ${await res.text().catch(() => "")}`,
    );
  }
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) {
    throw new Error(body.error || "vault_set_root failed");
  }
  // Re-trigger the React boot path with the seeded vault.
  await page.reload();
}

export { installShim };
