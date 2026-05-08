/**
 * Tauri implementation of `SVGRepository`. Delegates raw text read/write
 * to the vault VFS commands via `tauriBridge`.
 */

import type { SVGRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createSVGRepositoryTauri(): SVGRepository {
  return {
    read(svgPath) {
      return tauriBridge.readText(svgPath);
    },
    write(svgPath, svgString) {
      return tauriBridge.writeText(svgPath, svgString);
    },
  };
}
