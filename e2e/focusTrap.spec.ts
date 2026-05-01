import { test, expect, type Page } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

// KB-031 — exercises the shared `useFocusTrap` hook end-to-end via the
// Command Palette (the gold-standard reference modal). The hook's
// generic behaviour is unit-tested in `useFocusTrap.test.tsx`; this
// spec proves the wiring on a real modal: Tab cycles stay inside, Tab
// from outside snaps focus back in, Escape closes the modal, and
// focus returns to the trigger element.

async function setupFs(page: Page) {
  await page.addInitScript(installMockFS);
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
  });
  await page.goto("/");
  await page.locator('[data-testid="knowledge-base"]').waitFor();
}

test.describe("Focus trap on modals (KB-031)", () => {
  test("CommandPalette: trigger → open via click, Escape closes and focus returns", async ({ page }) => {
    await setupFs(page);
    const trigger = page.getByTestId("command-palette-trigger");
    await trigger.focus();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible({ timeout: 3000 });

    // Search input should be focused inside the trap.
    const input = page.locator('[role="dialog"][aria-label="Command Palette"] input').first();
    await expect(input).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).not.toBeVisible({ timeout: 3000 });

    // Trigger gets focus back.
    await expect(trigger).toBeFocused();
  });

  test("CommandPalette: focus that escapes the trap is snapped back on Tab", async ({ page }) => {
    await setupFs(page);
    await page.getByTestId("command-palette-trigger").click();
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible({ timeout: 3000 });

    // Move focus outside the dialog programmatically (mimics any bug
    // that would let focus drift out — e.g. a click on the body).
    await page.evaluate(() => {
      const body = document.body;
      body.setAttribute("tabindex", "-1");
      (body as HTMLElement).focus();
    });

    await page.keyboard.press("Tab");
    // Hook should have pulled focus back into the dialog.
    const input = page.locator('[role="dialog"][aria-label="Command Palette"] input').first();
    await expect(input).toBeFocused();
  });

  test("CommandPalette: open via ⌘K and close via Escape returns focus to whatever was focused before", async ({ page }) => {
    await setupFs(page);
    // Click "Open Folder" to give us a stable focus anchor.
    const open = page.getByRole("button", { name: "Open Folder" });
    await open.focus();
    await expect(open).toBeFocused();

    // Open via ⌘K (Meta on darwin is what Playwright drives).
    await page.keyboard.press("Meta+k");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).toBeVisible({ timeout: 3000 });

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Command Palette" })).not.toBeVisible({ timeout: 3000 });
    await expect(open).toBeFocused();
  });
});
