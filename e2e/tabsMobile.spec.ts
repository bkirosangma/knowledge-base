import { test, expect, type Page } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

// TAB-012 mobile gating smoke. Verifies the `tabs.import-gp` palette
// command is suppressed on a mobile viewport (KB-040 stance: read-only
// + playback only — no editor → no point importing).
//
// The viewport is set to 390 x 844 (iPhone-class) so `useViewport`
// reports `isMobile: true` and `MobileShell` mounts. Pattern mirrors
// `e2e/mobileLayout.spec.ts`.
//
// TAB-11.8-06 (mobile read-only TabView smoke) is deferred — see
// `test-cases/11-tabs.md`. Headless Chromium does not reliably parse
// alphaTex content during the test window, so TabProperties stays in
// the "Loading score…" state and never renders the Attach affordances
// the assertion would target. Unit coverage in TAB-11.8-01..05
// exercises the gate at the helper level.

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
  test("TAB-11.8-07: command palette excludes 'Import Guitar Pro file…' on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setupFs(page);

    await expect(page.getByTestId("mobile-shell")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /open folder/i }).click();

    // Open the palette via the mobile header trigger. The palette
    // defaults to *search* mode; the `>` prefix flips it to command
    // mode, which is where the `tabs.import-gp` gate applies.
    await page.getByTestId("command-palette-trigger").click();
    await expect(page.getByRole("dialog", { name: /command palette/i })).toBeVisible({ timeout: 3000 });
    const input = page.getByPlaceholder("Search the vault, or > for commands…");
    await input.fill(">Import Guitar Pro");

    // Mobile gate is effective → no commands match → palette shows the
    // empty hint. (Sanity: typing `>Toggle` on this page would surface
    // "Toggle Read / Edit Mode" via the existing palette wiring.)
    await expect(page.getByText("No matching commands")).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole("option", { name: /Import Guitar Pro/i })).toHaveCount(0);
  });
});
