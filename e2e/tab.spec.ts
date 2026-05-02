import { test, expect } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

test.describe("TAB-11.2-14 — guitar tab viewer smoke", () => {
  test("opens an .alphatex file and mounts the canvas", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.addInitScript(installMockFS);
    await page.addInitScript(() => {
      try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    });
    await page.goto("/");

    // Seed the in-memory FSA mock with a single .alphatex file.
    await page.evaluate(() => {
      const m = (window as unknown as {
        __kbMockFS: { seed: (f: Record<string, string>) => void };
      }).__kbMockFS;
      m.seed({
        "intro.alphatex":
          "\\title \"Intro\"\n\\tempo 120\n.\n:4 5.6 7.6 5.5 7.5 |",
      });
    });

    await page.getByRole("button", { name: /open folder/i }).click();
    await expect(page.getByText("intro.alphatex")).toBeVisible();
    await page.getByText("intro.alphatex").click();

    // The engine mounts a host div; confirm it renders within Playwright's
    // default timeout (5 s, comfortably above the 2 s spec budget).
    await expect(page.getByTestId("tab-view-canvas")).toBeVisible();

    // No engine-load failures.
    await expect(page.getByTestId("tab-view-engine-error")).not.toBeVisible();

    // No uncaught page errors during mount.
    expect(errors).toEqual([]);
  });
});
