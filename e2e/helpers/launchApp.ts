// e2e/helpers/launchApp.ts
//
// Boots the app for an e2e spec. Two backends:
// - 'webdriver' (default in CI): the tauri-plugin-webdriver-driven Tauri
//   webview. The Tauri-side make_temp_vault command is callable from
//   spec code via `page.evaluate(() => window.__TAURI__.invoke(...))`.
// - 'nextdev' (fallback): plain `next dev` against the existing
//   FSA-mock fixture. `setVaultPath()` throws here.

import type { Page } from "@playwright/test";

export type Backend = "webdriver" | "nextdev";

export function currentBackend(): Backend {
  const raw = process.env.KB_E2E_BACKEND ?? "webdriver";
  if (raw !== "webdriver" && raw !== "nextdev") {
    throw new Error(`Unknown KB_E2E_BACKEND: ${raw}`);
  }
  return raw;
}

export async function setVaultPath(page: Page, vaultPath: string): Promise<void> {
  if (currentBackend() === "webdriver") {
    await page.evaluate(async (path) => {
      // @ts-expect-error - Tauri injects __TAURI__ at runtime
      await window.__TAURI__.invoke("vault_set_root", { path });
    }, vaultPath);
  } else {
    // The nextdev fallback uses the existing FSA mock; no setVaultPath
    // semantics. Specs that depend on real vault paths skip in this mode.
    throw new Error("setVaultPath only valid under KB_E2E_BACKEND=webdriver");
  }
}
