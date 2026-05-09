// e2e/explorer_search.spec.ts
//
// EXPL-2.7-03/04/05 — explorer search global shortcut + palette entry.
//
// MVP-4.x harness: chromium against `next dev`, Tauri invoke surface
// shimmed to test_server (axum :1421) via `installShim`. See the four
// proof-set specs (`vault_picker`, `uninitialized_splash`,
// `document_create`, `rename_propagation`) for the canonical shape.

import { test, expect, type Page } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

// Dispatch a synthetic keydown directly to window so the React handler
// runs without chromium intercepting browser-level shortcuts (e.g.
// Ctrl/Cmd+F → native find dialog). The production handler reads
// `metaKey`, `ctrlKey`, and `key` only; this matches that contract.
async function pressShortcut(page: Page, key: string): Promise<void> {
  await page.evaluate((k) => {
    const el = document.activeElement as HTMLElement | null;
    el?.blur?.();
    document.body.focus();
    const e = new KeyboardEvent("keydown", {
      key: k,
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(e);
  }, key);
}

test.describe("Explorer search (EXPL-2.7)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("EXPL-2.7-03: ⌘F focuses the explorer search input", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Dispatch ⌘F via window keydown so chromium doesn't swallow it as
    // the native find shortcut. The handler in knowledgeBase.tsx skips
    // when activeElement is INPUT/TEXTAREA/contenteditable; pressShortcut
    // ensures focus is on <body> first.
    await pressShortcut(page, "f");

    await expect(page.getByTestId("explorer-search")).toBeFocused();

    await vault.cleanup();
  });

  test("EXPL-2.7-04: ⌘F is a no-op when focus is in the editor", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open a.md and put focus inside the ProseMirror editor.
    await page.getByTestId("explorer-tree").getByText("a.md").first().click();
    const editor = page.locator(".ProseMirror").first();
    await expect(editor).toBeVisible();
    await editor.click();

    // Dispatch the keydown directly so the React handler runs. Focus is
    // intentionally KEPT inside `.ProseMirror` (contenteditable) — the
    // handler must short-circuit and NOT focus explorer-search.
    await page.evaluate(() => {
      const e = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(e);
    });

    await expect(page.getByTestId("explorer-search")).not.toBeFocused();

    await vault.cleanup();
  });

  test('EXPL-2.7-05: "Go to file…" palette command focuses explorer search', async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open the command palette via ⌘K. Dispatch directly so chromium
    // doesn't intercept the modifier+letter combo at the browser level.
    await pressShortcut(page, "k");

    // Wait for the palette input and focus it before typing.
    const paletteInput = page.locator(
      'input[placeholder^="Search the vault, or > for commands"]',
    );
    await expect(paletteInput).toBeVisible();
    await paletteInput.focus();

    // Palette default mode is search; prefix with `>` for command mode
    // (per existing commandPalette.spec.ts: "KB-010c shifted the palette
    // default mode from command-filter to vault search"). The registered
    // command title is "Go to file…" so a partial match suffices.
    await page.keyboard.type(">go to file");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("explorer-search")).toBeFocused();

    await vault.cleanup();
  });
});
