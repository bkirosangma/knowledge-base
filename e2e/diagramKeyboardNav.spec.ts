import { test, expect, type Page } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

// KB-030 — Diagram canvas keyboard navigation. Covers DIAG-3.25-01..05.

const DIAGRAM = {
  title: "Test",
  layers: [
    { id: "l1", title: "Lower", bg: "#f8fafc", border: "#e2e8f0" },
    { id: "l2", title: "Upper", bg: "#f0fdf4", border: "#bbf7d0" },
  ],
  layerManualSizes: {},
  lineCurve: "orthogonal",
  flows: [],
  documents: [],
  // Place nodes so the reading-order sort is layer.zIndex (l1 < l2)
  // → y → x. Tab order should be: a, b, c (all in l1, ordered by y,
  // then x), then d (in l2).
  nodes: [
    { id: "a", label: "Alpha",   icon: "Box", x: 100, y: 100, w: 140, layer: "l1" },
    { id: "b", label: "Bravo",   icon: "Box", x: 300, y: 200, w: 140, layer: "l1" },
    { id: "c", label: "Charlie", icon: "Box", x: 100, y: 200, w: 140, layer: "l1" },
    { id: "d", label: "Delta",   icon: "Box", x: 200, y: 50,  w: 140, layer: "l2" },
  ],
  connections: [],
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

async function openDiagram(page: Page) {
  await page.getByRole("button", { name: "Open Folder" }).click();
  await page.getByText("diagram.json").first().click();
  await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 });
}

const SEED = { "diagram.json": JSON.stringify(DIAGRAM) };

test.describe("Diagram canvas keyboard navigation (KB-030)", () => {
  test("DIAG-3.25-01: canvas root has tabindex, role, aria-label, focus ring", async ({ page }) => {
    await setupFs(page, SEED);
    await openDiagram(page);
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    await expect(canvas).toHaveAttribute("tabindex", "0");
    await expect(canvas).toHaveAttribute("role", "application");
    await expect(canvas).toHaveAttribute(
      "aria-label",
      "Diagram canvas. Tab to walk nodes, arrows to move.",
    );
    // Focus the canvas via JS so :focus-visible matches reliably across
    // headless browsers (mouse focus alone can fall through to :focus
    // without :focus-visible). The visible ring is the *:focus-visible
    // box-shadow rule defined in tokens.css.
    await canvas.evaluate((el) => (el as HTMLElement).focus());
    await expect(canvas).toBeFocused();
  });

  test("DIAG-3.25-02: Tab/Shift+Tab walks nodes in (layer-z, y, x) order with wrap", async ({ page }) => {
    await setupFs(page, SEED);
    await openDiagram(page);
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    await canvas.evaluate((el) => (el as HTMLElement).focus());

    // Expected reading order with the seed above:
    //  l1 / y=100 / x=100 → "a"  (Alpha)
    //  l1 / y=200 / x=100 → "c"  (Charlie)  — same y, lower x first
    //  l1 / y=200 / x=300 → "b"  (Bravo)
    //  l2 / y=50  / x=200 → "d"  (Delta) — l2 has higher z than l1
    const order = ["a", "c", "b", "d"];

    for (const id of order) {
      await page.keyboard.press("Tab");
      await expect(page.locator(`[data-testid="node-${id}"]`)).toHaveClass(/ring-2/);
    }
    // Wrap forward: another Tab returns to the first
    await page.keyboard.press("Tab");
    await expect(page.locator(`[data-testid="node-${order[0]}"]`)).toHaveClass(/ring-2/);

    // Shift+Tab walks backwards through the order.
    const reverse = [...order].reverse();
    for (const id of reverse) {
      await page.keyboard.press("Shift+Tab");
      await expect(page.locator(`[data-testid="node-${id}"]`)).toHaveClass(/ring-2/);
    }
  });

  test("DIAG-3.25-03: ArrowRight/Down nudge selected node by 8 px (1 px with Shift)", async ({ page }) => {
    await setupFs(page, SEED);
    await openDiagram(page);
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    await canvas.evaluate((el) => (el as HTMLElement).focus());

    await page.keyboard.press("Tab"); // selects "a" (Alpha) per the order above
    const node = page.locator('[data-testid="node-a"]');

    const before = await node.boundingBox();
    expect(before).not.toBeNull();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Shift+ArrowRight"); // 1 px
    await page.keyboard.press("Shift+ArrowDown");  // 1 px
    const after = await node.boundingBox();
    expect(after).not.toBeNull();
    // Two ArrowRight (16) + one Shift+ArrowRight (1) = 17 px right.
    expect(Math.round(after!.x - before!.x)).toBe(17);
    // One ArrowDown (8) + one Shift+ArrowDown (1) = 9 px down.
    expect(Math.round(after!.y - before!.y)).toBe(9);
  });

  test("DIAG-3.25-04: Enter on a Tab-selected node opens inline label edit", async ({ page }) => {
    await setupFs(page, SEED);
    await openDiagram(page);
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    await canvas.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("Tab"); // "a"
    await page.keyboard.press("Enter");
    // The inline label editor renders a textarea/input for the node label.
    await expect(page.locator('input[data-testid="diagram-label-input"], textarea[data-testid="diagram-label-input"]').first())
      .toBeVisible({ timeout: 2000 });
  });

  test("DIAG-3.25-05: aria-live region announces selection changes", async ({ page }) => {
    await setupFs(page, SEED);
    await openDiagram(page);
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    const live = page.locator('[data-testid="canvas-live-region"]');
    await expect(live).toHaveAttribute("aria-live", "polite");

    await canvas.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("Tab"); // selects "a"
    await expect(live).toHaveText("Selected: Alpha, layer Lower");

    await page.keyboard.press("Tab"); // selects "c"
    await expect(live).toHaveText("Selected: Charlie, layer Lower");

    // Tab through to "d" in upper layer.
    await page.keyboard.press("Tab"); // "b"
    await page.keyboard.press("Tab"); // "d"
    await expect(live).toHaveText("Selected: Delta, layer Upper");
  });
});
