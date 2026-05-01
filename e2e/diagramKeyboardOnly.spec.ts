import { test, expect, type Page } from "@playwright/test";
import { installMockFS } from "./fixtures/fsMock";

// KB-030 acceptance: the diagram golden path completes via keyboard
// only. Mirrors the move-and-save + delete-and-save assertions of
// `diagramGoldenPath.spec.ts`, but without a single mouse interaction
// once the vault is open. The "Open Folder" button + tree row require
// the host browser's native focus/click affordance — same as keyboard
// users in production rely on `Tab + Space` to operate them — so those
// two interactions ARE done with `.click()` for stability. Everything
// inside the diagram pane is keyboard.

const TWO_NODE_DIAGRAM = {
  title: "Test Flow",
  layers: [],
  nodes: [
    { id: "n1", label: "Alpha", icon: "Box",   x: 120, y: 120, w: 180, layer: "", type: "default" },
    { id: "n2", label: "Beta",  icon: "Cloud", x: 420, y: 120, w: 180, layer: "", type: "default" },
  ],
  connections: [], flows: [], documents: [], layerManualSizes: {}, lineCurve: "orthogonal",
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

async function readMockFile(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate((p) => {
    const m = (window as unknown as { __kbMockFS: { read: (p: string) => string | undefined } }).__kbMockFS;
    return m.read(p);
  }, path);
}

test.describe("Diagram keyboard-only golden path (KB-030)", () => {
  test("move + save via Tab/arrows; delete + save via Tab/Delete", async ({ page }) => {
    await setupFs(page, { "flow.json": JSON.stringify(TWO_NODE_DIAGRAM) });
    // Two clicks to bootstrap (browser-native UI, matches keyboard users
    // pressing Space on the focused button + Enter on the focused tree row).
    await page.getByRole("button", { name: "Open Folder" }).click();
    await page.getByText("flow.json").first().click();
    await expect(page.locator('[data-testid="diagram-canvas"]')).toBeVisible({ timeout: 5000 });

    // Now keyboard only.
    const canvas = page.locator('[data-testid="diagram-canvas-root"]');
    await canvas.evaluate((el) => (el as HTMLElement).focus());

    // Tab walks reading order (no layers → fall through to y, x). Both
    // nodes share y=120; n1 is at x=120, n2 at x=420 → n1 first.
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-testid="node-n1"]')).toHaveClass(/ring-2/);

    // Move n1 to the right by 24 px and down by 16 px using arrow keys.
    const before = await page.locator('[data-testid="node-n1"]').boundingBox();
    expect(before).not.toBeNull();
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight"); // 24 px
    for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowDown");  // 16 px
    const after = await page.locator('[data-testid="node-n1"]').boundingBox();
    expect(after).not.toBeNull();
    expect(Math.round(after!.x - before!.x)).toBe(24);
    expect(Math.round(after!.y - before!.y)).toBe(16);

    // Save. The save button is reachable via Tab from the canvas; rather
    // than count Tab stops (host-dependent), focus it directly via its
    // accessible name and press Space — the keyboard-equivalent of click.
    await page.getByRole("button", { name: /^save$/i }).focus();
    await page.keyboard.press("Space");

    // Verify n1 moved 24,16 from seed (120,120) → (144,136).
    const saved1 = await readMockFile(page, "flow.json");
    expect(saved1).toBeTruthy();
    const diagram1 = JSON.parse(saved1!) as { nodes: Array<{ id: string; x: number; y: number }> };
    const n1 = diagram1.nodes.find((n) => n.id === "n1")!;
    expect(n1.x).toBe(144);
    expect(n1.y).toBe(136);
    // n2 unchanged.
    const n2 = diagram1.nodes.find((n) => n.id === "n2")!;
    expect(n2.x).toBe(420);
    expect(n2.y).toBe(120);

    // Delete n2 via keyboard. The move above shifted n1 down to y=136
    // while n2 stayed at y=120, so the (z, y, x) reading order is now
    // n2 → n1 — Tab once from a cleared canvas to land on n2.
    await canvas.evaluate((el) => (el as HTMLElement).focus());
    await page.keyboard.press("Escape"); // clears any held selection
    await page.keyboard.press("Tab");
    await expect(page.locator('[data-testid="node-n2"]')).toHaveClass(/ring-2/);
    await page.keyboard.press("Delete");
    await expect(page.locator('[data-testid="node-n2"]')).toHaveCount(0);

    // Save again, verify only n1 remains.
    await page.getByRole("button", { name: /^save$/i }).focus();
    await page.keyboard.press("Space");
    const saved2 = await readMockFile(page, "flow.json");
    const diagram2 = JSON.parse(saved2!) as { nodes: Array<{ id: string }> };
    expect(diagram2.nodes.map((n) => n.id)).toEqual(["n1"]);
  });
});
