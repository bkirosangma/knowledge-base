/**
 * Tauri implementation of `TabRefsRepository`. Delegates JSON read/write
 * to the vault VFS commands via `tauriBridge`.
 *
 * The sidecar is a per-tab metadata file at `<tab-path>.refs.json`,
 * created lazily only when the user has added section/track refs or source links.
 */

import type { TabRefsPayload, TabRefsRepository } from "../domain/tabRefs";
import { tauriBridge } from "./tauriBridge";

function sidecarPath(tabPath: string): string {
  return `${tabPath}.refs.json`;
}

export function createTabRefsRepositoryTauri(): TabRefsRepository {
  return {
    async read(filePath: string): Promise<TabRefsPayload | null> {
      const path = sidecarPath(filePath);

      // Missing sidecar → return null (lazy creation).
      if (!(await tauriBridge.exists(path))) {
        return null;
      }

      return tauriBridge.readJson<TabRefsPayload>(path);
    },

    async write(filePath: string, payload: TabRefsPayload): Promise<void> {
      const path = sidecarPath(filePath);
      await tauriBridge.writeJson(path, payload);
    },
  };
}
