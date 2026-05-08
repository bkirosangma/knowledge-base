/**
 * Tauri implementation of `SvgRefsRepository`. Delegates JSON read/write
 * to the vault VFS commands via `tauriBridge`.
 *
 * The sidecar is a per-SVG metadata file at `<svg-path>.refs.json`,
 * created lazily only when the user has added source links.
 */

import type { SvgRefsPayload, SvgRefsRepository } from "../domain/svgRefs";
import { tauriBridge } from "./tauriBridge";

function sidecarPath(svgPath: string): string {
  return `${svgPath}.refs.json`;
}

export function createSvgRefsRepositoryTauri(): SvgRefsRepository {
  return {
    async read(filePath: string): Promise<SvgRefsPayload | null> {
      const path = sidecarPath(filePath);

      // Missing sidecar → return null (lazy creation).
      if (!(await tauriBridge.exists(path))) {
        return null;
      }

      return tauriBridge.readJson<SvgRefsPayload>(path);
    },

    async write(filePath: string, payload: SvgRefsPayload): Promise<void> {
      const path = sidecarPath(filePath);
      await tauriBridge.writeJson(path, payload);
    },
  };
}
