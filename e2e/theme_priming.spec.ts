// e2e/theme_priming.spec.ts
//
// SHELL-1.13-05: When the open vault has no `theme` set in its config and
// the OS reports a `prefers-color-scheme: dark` preference, the app boots
// into the dark theme. The corollary (light OS pref → light theme) is the
// same code path with the other branch of `matchMedia` — covered as a
// twin assertion below.
//
// useTheme.ts precedence (line 7 onward):
//   1. vaultConfig.theme if explicit ("light" | "dark") → use it
//   2. otherwise → OS prefers-color-scheme via window.matchMedia()
//
// The `with_links` fixture's `.kb/config.json` is `{"version":1}` (no
// `theme` key), so theme resolution falls through to OS pref.
//
// Harness note: `colorScheme` is fixed via `test.use({ colorScheme })`
// at the test level — this provisions the browser context with the
// emulation BEFORE `page.goto()` runs, eliminating the race the case
// copy calls out ("harness-level prefers-color-scheme priming hook
// before page reload races emulateMedia"). The MVP-4.x `installShim`
// + `setVaultPath` boot sequence reloads the page after seeding the
// vault root; the colorScheme option survives that reload.

import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("SHELL-1.13-05 — prefers-color-scheme precedence on first mount", () => {
  test.describe("OS pref dark", () => {
    test.use({ colorScheme: "dark" });

    test("with no vault theme set, OS dark pref → app data-theme is 'dark'", async ({ page }) => {
      await installShim(page);
      const vault = await makeTempVault({ fixture: "with_links" });

      await page.goto("/");
      await setVaultPath(page, vault.path);

      const root = page.locator('[data-testid="knowledge-base"]');
      await expect(root).toBeVisible();
      // The data-theme attribute is rendered by knowledgeBase.tsx (~line 1454,
      // 1492, 1569) with `themeCtx.theme`. Wait for it to settle — the boot
      // path's vaultConfig read is async, and the initial render is
      // SSR-defaulted to "light".
      await expect(root.first()).toHaveAttribute("data-theme", "dark");

      await vault.cleanup();
    });
  });

  test.describe("OS pref light", () => {
    test.use({ colorScheme: "light" });

    test("with no vault theme set, OS light pref → app data-theme is 'light'", async ({ page }) => {
      await installShim(page);
      const vault = await makeTempVault({ fixture: "with_links" });

      await page.goto("/");
      await setVaultPath(page, vault.path);

      const root = page.locator('[data-testid="knowledge-base"]');
      await expect(root).toBeVisible();
      await expect(root.first()).toHaveAttribute("data-theme", "light");

      await vault.cleanup();
    });
  });
});
