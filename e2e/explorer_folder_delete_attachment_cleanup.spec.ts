// e2e/explorer_folder_delete_attachment_cleanup.spec.ts
//
// FS-2.3-72/74/75 — folder-delete cascades attachment-row cleanup.
// (FS-2.3-73 demoted to 🅑 in markdown — see test-cases/02-file-system.md.
// `.kbjson` files are not surfaced by `vaultIndexRepoTauri.ts`'s extension
// filter (only `.md` / `.json` / `.svg` / `.alphatex`), so they never
// appear in the tree and `collectAttachableFilePaths` cannot reach them
// without a production-side change to the filter — out of scope per
// MVP-5 Decision 5.)
//
// Production wiring (knowledgeBase.tsx):
//   • The folder context-menu's Delete button calls `onDeleteFolder(path,
//     event)`, which routes via `diagramBridgeRef.current?.handleDeleteFolder`
//     when a diagram is open, or `setShellConfirmAction` otherwise.
//   • Both paths converge through `useFileActions.handleConfirmAction`
//     (line 251) which awaits `onBeforeDeleteFolder?.(path)` —
//     `cleanupAttachmentsForFolder` in `knowledgeBase.tsx` line 511 —
//     BEFORE `fileExplorer.deleteFolder`. The cleanup walks
//     `collectAttachableFilePaths(tree, folderPath)` and detaches every
//     `.md` / `.alphatex` row in a single `withBatch`.
//
// At the e2e layer with a vault that contains no diagram, only the
// shell-modal path is reachable; the bridge path's behaviour is
// equivalent at this layer (both end-states write the same JSON).

import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

const ATTACHMENT_LINKS_PATH = ".kb/attachment-links.json";

interface AttachmentLink {
  entityType: string;
  entityId: string;
  docPath: string;
}

async function readAttachmentLinks(vaultPath: string): Promise<AttachmentLink[]> {
  const raw = await fs.readFile(path.join(vaultPath, ATTACHMENT_LINKS_PATH), "utf8");
  return JSON.parse(raw) as AttachmentLink[];
}

/** Right-click `notes` folder, click Delete in the context menu, confirm. */
async function deleteNotesFolder(page: Page): Promise<void> {
  // The folder row is rendered as text "notes" in explorer-tree. With
  // `with_attachments` fixture, `notes/` is the only folder visible.
  const notesRow = page.getByTestId("explorer-tree").getByText("notes").first();
  await expect(notesRow).toBeVisible();
  await notesRow.click({ button: "right" });

  // Context menu has a Delete button in red (text "Delete"). Use the
  // first match — context menu is the only place a "Delete" button is
  // rendered at this point.
  const deleteBtn = page.locator('button:has-text("Delete")').first();
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // ConfirmPopover renders with confirmLabel="Delete" and message
  // `Delete folder "notes" and all its contents?`. Click the popover's
  // Delete button — disambiguate by scoping under the popover container.
  const popover = page.locator('div.fixed.z-\\[9999\\]', {
    hasText: 'Delete folder "notes"',
  });
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "Delete" }).click();
}

async function setupVault(page: Page) {
  const vault = await makeTempVault({ fixture: "with_attachments" });
  await page.goto("/");
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await setVaultPath(page, vault.path);
  await expect(page.getByTestId("explorer-tree")).toBeVisible();
  return vault;
}

test.describe("Folder delete attachment cleanup (FS-2.3-72/74/75)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("FS-2.3-72: deleting notes/ removes the .md attachment row", async ({ page }) => {
    const vault = await setupVault(page);

    // Sanity: fixture seed has the .md row.
    const before = await readAttachmentLinks(vault.path);
    expect(before.some((r) => r.docPath === "notes/attached.md")).toBe(true);

    await deleteNotesFolder(page);

    // Wait for the `.md` row to drop out of the JSON (cleanup batch flush).
    await expect
      .poll(
        async () => {
          const rows = await readAttachmentLinks(vault.path);
          return rows.some((r) => r.docPath === "notes/attached.md");
        },
        { timeout: 5000, intervals: [200] },
      )
      .toBe(false);

    // Out-of-folder row survives.
    const after = await readAttachmentLinks(vault.path);
    expect(after.some((r) => r.docPath === "keep.md")).toBe(true);

    await vault.cleanup();
  });

  test("FS-2.3-74: deleting notes/ removes the .alphatex attachment row", async ({ page }) => {
    const vault = await setupVault(page);

    const before = await readAttachmentLinks(vault.path);
    expect(
      before.some(
        (r) => r.entityType === "tab" && r.entityId === "notes/attached.alphatex",
      ),
    ).toBe(true);

    await deleteNotesFolder(page);

    // tabFileMatcher matches by entityId === path (or path# prefix), so
    // the row's removal proves the .alphatex branch ran.
    await expect
      .poll(
        async () => {
          const rows = await readAttachmentLinks(vault.path);
          return rows.some(
            (r) => r.entityType === "tab" && r.entityId === "notes/attached.alphatex",
          );
        },
        { timeout: 5000, intervals: [200] },
      )
      .toBe(false);

    await vault.cleanup();
  });

  test("FS-2.3-75: shell-modal path removes all attachable types in one batch", async ({ page }) => {
    const vault = await setupVault(page);

    const before = await readAttachmentLinks(vault.path);
    // Fixture seeds 3 rows: notes/attached.md, notes/attached.alphatex, keep.md.
    expect(before).toHaveLength(3);

    await deleteNotesFolder(page);

    // After one delete: both notes/* rows gone in a single batch flush;
    // only keep.md (out-of-folder) survives. The end-state is one row.
    await expect
      .poll(
        async () => {
          const rows = await readAttachmentLinks(vault.path);
          return rows.length;
        },
        { timeout: 5000, intervals: [200] },
      )
      .toBe(1);

    const after = await readAttachmentLinks(vault.path);
    expect(after.map((r) => r.docPath)).toEqual(["keep.md"]);

    await vault.cleanup();
  });
});
