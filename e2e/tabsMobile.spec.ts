import { test, expect, type Page } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

// TAB-012 mobile gating smoke. Verifies the KB-040 stance for the Tabs
// pane:
//   - opening an .alphatex file on a mobile viewport mounts TabView
//     read-only (no Attach affordances surface in TabProperties);
//   - the `tabs.import-gp` palette command is absent from the mobile
//     command palette.
//
// The viewport is set to 390 x 844 (iPhone-class) so `useViewport`
// reports `isMobile: true` and `MobileShell` mounts. Pattern mirrors
// `e2e/mobileLayout.spec.ts`.

const SEED = {
  "intro.alphatex":
    '\\title "Intro"\n\\tempo 120\n.\n\\section "Verse 1"\n:4 5.6 7.6 5.5 7.5 |',
};

async function setupFs(page: Page) {
  await page.addInitScript(installMockFS);
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
  });
  await page.goto("/");
  await page.locator('[data-testid="knowledge-base"]').waitFor();
  await page.evaluate((files) => {
    const m = (window as unknown as {
      __kbMockFS: { seed: (f: Record<string, string>) => void };
    }).__kbMockFS;
    m.seed(files);
  }, SEED);
}

test.describe("Tabs — mobile (TAB-012)", () => {
  test("TAB-11.8-06: at 390x844, .alphatex opens with no Attach affordances (mobile read-only)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupFs(page);

    await expect(page.getByTestId("mobile-shell")).toBeVisible({ timeout: 5000 });

    // Open folder and tap the seeded .alphatex from the Files tab.
    await page.getByRole("button", { name: /open folder/i }).click();
    await expect(page.getByText("intro.alphatex")).toBeVisible();
    await page.getByText("intro.alphatex").click();

    // Mobile shell flips to the Read tab and mounts the tab pane.
    await expect(page.getByTestId("mobile-tab-read")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible({ timeout: 5000 });

    // KB-040: no Attach affordances surface anywhere in the tab pane.
    // TabProperties gates them on `!readOnly`; the mobile shell injects
    // `readOnly: true` via `buildTabPaneContext`.
    await expect(
      page.getByRole("button", { name: /attach (document|svg|diagram)/i }),
    ).toHaveCount(0);
  });

  test("TAB-11.8-07: command palette excludes 'Import Guitar Pro file…' on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupFs(page);

    await expect(page.getByTestId("mobile-shell")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /open folder/i }).click();

    // Open the palette via the mobile header trigger and type the
    // command title fragment that would match if the gate were
    // ineffective.
    await page.getByTestId("command-palette-trigger").click();
    const palette = page.getByRole("dialog").or(page.getByPlaceholder(/type a command/i));
    await palette.first().waitFor();
    await page.keyboard.type("Import Guitar Pro");

    // The command must not appear. Allow the palette a moment to
    // re-filter, then assert absence.
    await expect(page.getByRole("option", { name: /Import Guitar Pro/i })).toHaveCount(0);
    await expect(page.getByText("Import Guitar Pro file")).toHaveCount(0);
  });
});
