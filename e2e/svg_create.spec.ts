// e2e/svg_create.spec.ts
//
// SVG-6.1-01..03 — SVG editor file creation & routing.
//
// • SVG-6.1-01 — Right-click `drawings/` folder → New → SVG; assert
//   `untitled.svg` appears in the tree under `drawings/` and exists on
//   disk in the temp vault.
// • SVG-6.1-02 — Hover over `drawings/` folder; click the New SVG icon
//   button (HoverBtn rendered by TreeNodeRow.tsx line 208 with
//   `title="New SVG"`); assert `untitled.svg` appears.
// • SVG-6.1-03 — Click `existing.svg` in the explorer tree; assert the
//   SVG editor pane mounts (svg-canvas-container visible) and that
//   the document pane (`[data-pane-content="document"]`) is NOT
//   rendered. (Diagram pane has no analogous data-pane-content
//   selector, so we use the canvas container as the positive signal
//   plus the document-pane negative — sufficient for the case
//   statement.)
//
// Fixture: `with_folders/` ships `drawings/` (empty), `existing.svg`,
// and `keep.md` so the tree is non-empty (avoids empty-state CTA).
//
// Production wiring (knowledgeBase.tsx + ExplorerPanel.tsx):
//   • Folder right-click opens the contextMenu state with type="folder"
//     and renders a `New ▶` submenu (line 691). Hovering "New" shows
//     [Diagram, Document, SVG, Folder] — clicking SVG calls
//     `handleCreateSVG(contextMenu.path)` which routes to
//     `useFileExplorer.createSVG(parentPath)`.
//   • The hover-time HoverBtn affordance lives in TreeNodeRow.tsx and
//     calls the same `handleCreateSVG`.

import { test, expect } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("SVG editor — file creation & routing (proof set)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SVG-6.1-01: right-click folder → New → SVG creates untitled.svg under drawings/", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_folders" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Right-click `drawings/` folder row.
    const drawingsRow = page.getByTestId("explorer-tree").getByText("drawings").first();
    await expect(drawingsRow).toBeVisible();
    await drawingsRow.click({ button: "right" });

    // Hover the "New" menu trigger so the submenu renders. The trigger
    // is the only `New`-text button inside the context menu container.
    const newTrigger = page.locator('button:has-text("New")').first();
    await expect(newTrigger).toBeVisible();
    await newTrigger.hover();

    // Click "SVG" in the submenu. Disambiguate — there are no other
    // visible `SVG` buttons at this point.
    const svgBtn = page.locator('button:has-text("SVG")').first();
    await expect(svgBtn).toBeVisible();
    await svgBtn.click();

    // Assert tree shows the new file under `drawings/`.
    await expect(
      page
        .getByTestId("explorer-tree")
        .getByRole("treeitem", { name: /^untitled(-\d+)?\.svg/ }),
    ).toBeVisible({ timeout: 5000 });

    // Assert disk: `drawings/untitled.svg` exists.
    const onDisk = path.join(vault.path, "drawings/untitled.svg");
    const exists = await fs
      .stat(onDisk)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    await vault.cleanup();
  });

  test("SVG-6.1-02: hover folder → New SVG icon button creates untitled.svg", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_folders" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Hover the `drawings/` folder row to reveal HoverBtns.
    const drawingsRow = page.getByTestId("explorer-tree").getByText("drawings").first();
    await expect(drawingsRow).toBeVisible();
    await drawingsRow.hover();

    // The New SVG HoverBtn has `title="New SVG"` — we match by accessible
    // name (button title). The hover affordance is one of four buttons
    // [New Diagram, New Document, New SVG, New Folder, Rename] rendered
    // adjacent to the folder name on hover (TreeNodeRow.tsx line 202+).
    const newSvgBtn = page.getByRole("button", { name: "New SVG" }).first();
    await expect(newSvgBtn).toBeVisible();
    await newSvgBtn.click();

    // Assert tree shows the new file.
    await expect(
      page
        .getByTestId("explorer-tree")
        .getByRole("treeitem", { name: /^untitled(-\d+)?\.svg/ }),
    ).toBeVisible({ timeout: 5000 });

    // Assert on disk under `drawings/`.
    const onDisk = path.join(vault.path, "drawings/untitled.svg");
    const exists = await fs
      .stat(onDisk)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    await vault.cleanup();
  });

  test("SVG-6.1-03: clicking .svg file routes to SVG editor pane (not document)", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_folders" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Click the `existing.svg` row in the explorer tree — the load-bearing
    // affordance: openFile routes `.svg` paths to `panes.openFile(path,
    // "svgEditor")` (knowledgeBase.tsx line 675), which causes
    // `entry.fileType === "svgEditor"` → SVGEditorView mounts.
    const svgRow = page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^existing\.svg/ });
    await expect(svgRow).toBeVisible();
    await svgRow.click();

    // Positive signal: the SVG canvas container renders.
    await expect(page.getByTestId("svg-canvas-container")).toBeVisible({ timeout: 5000 });

    // Negative signal: the document pane is NOT rendered. (MarkdownPane
    // is the only pane that carries `data-pane-content`; absence of the
    // diagram pane is implicitly proven by the canvas-container assert
    // above — diagram and svgEditor mount in the same slot.)
    await expect(page.locator('[data-pane-content="document"]')).toHaveCount(0);

    await vault.cleanup();
  });
});
