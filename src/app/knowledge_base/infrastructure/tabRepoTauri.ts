/**
 * Tauri implementation of `TabRepository`. Delegates raw read/write
 * to the vault VFS commands via `tauriBridge`.
 */

import type { TabRepository } from "../domain/repositories";
import { tauriBridge } from "./tauriBridge";

export function createTabRepositoryTauri(): TabRepository {
  return {
    read(tabPath) {
      return tauriBridge.readText(tabPath);
    },
    write(tabPath, content) {
      return tauriBridge.writeText(tabPath, content);
    },
  };
}
