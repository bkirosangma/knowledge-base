// e2e/diagram_palette_commands.spec.ts
//
// SHELL-1.11-12: Diagram-scoped palette commands are present when a
// diagram pane is open. The matching negative case (no diagram open →
// commands absent) is covered by SHELL-1.11-11 in `command_palette.spec.ts`.
// SHELL-1.11-14 covers the `when:` guard hiding `Delete Selected` when
// nothing is selected; this spec covers the *with-selection* branch.
//
// The MVP-5 case note framed this as "needs a diagram-canvas pointer-event
// harness" — that turned out to be wrong. A simple `node-n1` click seeds
// selection just fine (mirrors `diagramKeyboard.spec.ts`); the real gap
// was that the original framing assumed the obsolete `installMockFS` boot
// path. The modern `installShim + makeTempVault + vault_write_json` flow
// (used by SHELL-1.11-13/14) is sufficient.

import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

const PLACEHOLDER = "Search the vault, or > for commands…";

const TEST_SERVER_URL =
  process.env.KB_TEST_SERVER_URL ?? "http://localhost:1421";

async function invokeViaTestServer(cmd: string, args: unknown): Promise<void> {
  const res = await fetch(`${TEST_SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  if (!res.ok) {
    throw new Error(`test_server ${res.status} (${cmd}): ${await res.text()}`);
  }
}

test.describe("SHELL-1.11-12 — diagram commands present when diagram open", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("with a diagram pane open and a node selected, palette surfaces the diagram commands", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "with_links" });

    // Re-point test_server at the new temp vault before writing — same
    // discipline as SHELL-1.11-14. Without it, vault_write_json could
    // land in a stale path from a previous spec.
    await invokeViaTestServer("vault_set_root", { path: vault.path });

    // Seed a diagram with a single node. Shape mirrors `seedWithNode` in
    // `e2e/helpers/diagramSeeds.ts` (and createEmptyDiagram in
    // `shared/utils/persistence.ts`) so loadDiagramFromData accepts it.
    await invokeViaTestServer("vault_write_json", {
      path: "diagram.json",
      value: {
        title: "diagram",
        layers: [],
        layerManualSizes: {},
        lineCurve: "orthogonal",
        flows: [],
        nodes: [
          {
            id: "n1",
            label: "Node 1",
            icon: "Box",
            x: 200,
            y: 200,
            w: 180,
            layer: "",
          },
        ],
        connections: [],
      },
    });

    await page.goto("/");
    await setVaultPath(page, vault.path);
    await expect(page.locator('[data-testid="knowledge-base"]')).toBeVisible();

    // Open the diagram and wait for the canvas to mount.
    const tree = page.getByTestId("explorer-tree");
    await expect(tree).toBeVisible();
    const diagramRow = tree.getByText(/^diagram\.json$/).first();
    await expect(diagramRow).toBeVisible({ timeout: 5000 });
    await diagramRow.click();
    await expect(
      page.locator('[data-testid="diagram-canvas-root"]'),
    ).toBeVisible({ timeout: 5000 });

    // Seed selection by clicking the node — DiagramCanvas marks the
    // selected node with a `ring-2` outline class.
    const node = page.locator('[data-testid="node-n1"]');
    await expect(node).toBeVisible();
    await node.click();
    await expect(node).toHaveClass(/ring-2/);

    // Open the palette and assert both diagram-scoped commands surface.
    await page.getByTestId("command-palette-trigger").click();
    await expect(
      page.getByRole("dialog", { name: "Command Palette" }),
    ).toBeVisible({ timeout: 3000 });

    // "Delete Selected" — registered with `when: () => selectionRef.current != null`.
    await page.getByPlaceholder(PLACEHOLDER).fill(">Delete Selected");
    const diagramGroup = page.locator('[role="group"][aria-label="Diagram"]');
    await expect(diagramGroup).toBeVisible({ timeout: 3000 });
    await expect(diagramGroup.getByText("Delete Selected")).toBeVisible();

    // "Toggle Read / Edit Mode" — registered unconditionally on diagram pane.
    // Filter to ensure we resolve the Diagram-group entry, not a Document one.
    await page.getByPlaceholder(PLACEHOLDER).fill(">Toggle Read");
    await expect(diagramGroup).toBeVisible({ timeout: 3000 });
    await expect(diagramGroup.getByText("Toggle Read / Edit Mode")).toBeVisible();

    await vault.cleanup();
  });
});
