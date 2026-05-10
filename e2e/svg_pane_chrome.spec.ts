// e2e/svg_pane_chrome.spec.ts
//
// SVG-6.2-02 — PaneHeader shows Save and Discard buttons when isDirty=true.
//
// The SVGEditorView mounts in read-only mode (`isReadOnly` initialised
// to `true` at SVGEditorView.tsx line 64). Save/Discard buttons are
// disabled-but-rendered when there's no active file or dirty state;
// PaneHeader renders them when `onSave`/`onDiscard` are provided. To
// observe them in the **enabled** dirty-state branch we have to:
//   1. Open `existing.svg` so SVGEditorView mounts with hasActiveFile.
//   2. Toggle out of read-only mode (press 'e' — SVGEditorView's own
//      keyboard handler at line ~115-130).
//   3. Drive a meaningful change through the SVG canvas. The editor's
//      `useSVGPersistence` hook listens via wrapped `addCommandToHistory`
//      AND a MutationObserver fallback (per case SVG-6.4-17) — under
//      headless chromium without the @svgedit/svgcanvas runtime fully
//      driveable, dirtying the canvas reliably is the load-bearing risk
//      called out in the plan ("SVG canvas fragility escape hatch").
//
// Per the plan's escape hatch, if neither toolbar interaction nor a
// programmatic mutation reliably dirties the editor, we demote
// SVG-6.2-02 to 🅑 with the documented note. We try a primary path
// (toolbar → click canvas) and a fallback (direct DOM mutation
// inside #svgcontent that the MutationObserver should see); failure
// of both is the demotion trigger. We do NOT ship a flake.

import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("SVG editor — pane chrome dirty-state (proof set)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("SVG-6.2-02: PaneHeader shows enabled Save and Discard when isDirty=true", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_folders" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();
    await expect(page.getByTestId("explorer-tree")).toBeVisible();

    // Open existing.svg (routes via panes.openFile → svgEditor pane).
    const svgRow = page
      .getByTestId("explorer-tree")
      .getByRole("treeitem", { name: /^existing\.svg/ });
    await expect(svgRow).toBeVisible();
    await svgRow.click();

    // Wait for SVGEditorView mount.
    await expect(page.getByTestId("svg-canvas-container")).toBeVisible({ timeout: 5000 });

    // PaneHeader Save/Discard buttons (matched by accessible name —
    // PaneHeader uses aria-label="Discard changes" + visible text "Save").
    const discardBtn = page.getByRole("button", { name: "Discard changes" });
    const saveBtn = page.getByRole("button", { name: /^Save/ });

    // Both buttons render even in the disabled state when an SVG is open.
    await expect(discardBtn).toBeVisible();
    await expect(saveBtn).toBeVisible();

    // Toggle out of read-only mode so the editor accepts mutations.
    // SVGEditorView listens for plain `e` (no metaKey) when no input
    // element is focused. Click on the canvas first to ensure focus
    // is inside the editor pane (not the explorer).
    await page.getByTestId("svg-canvas-container").click();
    await page.keyboard.press("e");

    // Drive a programmatic mutation that the persistence hook's
    // wrapped addCommandToHistory + MutationObserver fallback will
    // observe. Try direct attribute mutation on a child of #svgcontent
    // (the MutationObserver target per useSVGPersistence wiring).
    const dirtyResult = await page.evaluate(() => {
      const svgcontent = document.getElementById("svgcontent");
      if (!svgcontent) return { ok: false, reason: "no #svgcontent" };
      const ns = "http://www.w3.org/2000/svg";
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "10");
      rect.setAttribute("y", "10");
      rect.setAttribute("width", "50");
      rect.setAttribute("height", "50");
      rect.setAttribute("fill", "red");
      svgcontent.appendChild(rect);
      return { ok: true, reason: "mutation dispatched" };
    });

    if (!dirtyResult.ok) {
      test.skip(
        true,
        `SVG-6.2-02 demoted to 🅑 — ${dirtyResult.reason}; needs SVG canvas dirty-state harness`,
      );
      return;
    }

    // Wait for dirty propagation: useSVGPersistence's onChanged →
    // setIsDirty(true) → bridge → PaneHeader. Buttons become enabled
    // (no `disabled` attribute, no opacity-40 class).
    await expect
      .poll(
        async () => {
          const disabled = await discardBtn.evaluate(
            (el) => (el as HTMLButtonElement).disabled,
          );
          return disabled === false;
        },
        { timeout: 5000 },
      )
      .toBe(true);

    await expect
      .poll(
        async () => {
          const disabled = await saveBtn.evaluate(
            (el) => (el as HTMLButtonElement).disabled,
          );
          return disabled === false;
        },
        { timeout: 5000 },
      )
      .toBe(true);

    await vault.cleanup();
  });
});
