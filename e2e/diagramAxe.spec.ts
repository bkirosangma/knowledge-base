import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { installMockFS } from "./fixtures/fsMock";

// KB-030 acceptance: axe-core scan of the diagram pane returns zero
// violations. Scoped to the kb-diagram-viewport subtree (everything
// the canvas owns) — the broader app shell is out of scope for KB-030
// and may have its own findings tracked in other tickets.

const SEED = {
  "flow.json": JSON.stringify({
    title: "Test", layers: [],
    nodes: [
      { id: "n1", label: "Alpha", icon: "Box", x: 120, y: 120, w: 180, layer: "" },
      { id: "n2", label: "Beta",  icon: "Cloud", x: 320, y: 120, w: 180, layer: "" },
    ],
    connections: [], flows: [], documents: [], layerManualSizes: {}, lineCurve: "orthogonal",
  }),
};

async function setupFs(page: Page, seed: Record<string, string>) {
  await page.addInitScript(installMockFS);
  await page.addInitScript(() => {
    try { indexedDB.deleteDatabase("knowledge-base"); } catch { /* ignore */ }
    try { localStorage.clear(); } catch { /* ignore */ }
  });
  await page.addInitScript((files) => {
    for (const filename of Object.keys(files)) {
      localStorage.setItem(`diagram-read-only:${filename}`, "false");
      localStorage.setItem(`document-read-only:${filename}`, "false");
    }
  }, seed);
  await page.goto("/");
  await page.locator('[data-testid="knowledge-base"]').waitFor();
  await page.evaluate((files) => {
    const m = (window as unknown as { __kbMockFS: { seed: (f: Record<string, string>) => void } }).__kbMockFS;
    m.seed(files);
  }, seed);
}

test.describe("Diagram pane accessibility (KB-030)", () => {
  test("axe-core: zero violations on diagram canvas subtree", async ({ page }) => {
    await setupFs(page, SEED);
    await page.getByRole("button", { name: "Open Folder" }).click();
    await page.getByText("flow.json").first().click();
    await expect(page.locator('[data-testid="diagram-canvas-root"]')).toBeVisible({ timeout: 5000 });
    // Let the post-mount effects settle (file watcher, link index, footer
    // info push) so the snapshot is stable.
    await page.waitForTimeout(800);

    const results = await new AxeBuilder({ page })
      .include('[data-testid="diagram-canvas-root"]')
      .analyze();

    if (results.violations.length > 0) {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
