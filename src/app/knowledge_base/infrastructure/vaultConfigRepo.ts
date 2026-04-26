/**
 * File System Access API implementation of `VaultConfigRepository`. Reads
 * and writes `.archdesigner/config.json` under the given vault root.
 */

import type { VaultConfigRepository } from "../domain/repositories";
import {
  initVault,
  readVaultConfig,
  updateVaultConfig,
  updateVaultLastOpened,
  isVaultDirectory,
} from "../features/document/utils/vaultConfig";

export function createVaultConfigRepository(
  rootHandle: FileSystemDirectoryHandle,
): VaultConfigRepository {
  return {
    init: (vaultName) => initVault(rootHandle, vaultName),
    read: () => readVaultConfig(rootHandle),
    touchLastOpened: () => updateVaultLastOpened(rootHandle),
    update: (patch) => updateVaultConfig(rootHandle, patch),
    isVault: (config) => isVaultDirectory(config),
  };
}
