/**
 * Tauri implementation of `VaultConfigRepository`. Reads and writes
 * `.archdesigner/config.json` via `tauriBridge`, with shape validation.
 */

import type { VaultConfig } from "../shared/utils/types";
import type { VaultConfigRepository } from "../domain/repositories";
import { FileSystemError } from "../domain/errors";
import { tauriBridge } from "./tauriBridge";

const CONFIG_PATH = ".archdesigner/config.json";

function isValidVaultConfig(data: unknown): data is VaultConfig {
  if (!data || typeof data !== "object") return false;
  const c = data as Record<string, unknown>;
  return (
    typeof c.version === "string" &&
    typeof c.name === "string" &&
    typeof c.created === "string" &&
    typeof c.lastOpened === "string"
  );
}

/**
 * One-level deep merge. For each key in `patch`, if both the current
 * and patch values are plain objects (not arrays, not null), shallow-
 * merge them; otherwise the patch value replaces the current value.
 */
function mergeOneLevel<T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>,
): T {
  const result: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const cur = (current as Record<string, unknown>)[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      cur !== null &&
      typeof cur === "object" &&
      !Array.isArray(cur)
    ) {
      result[key] = {
        ...(cur as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

export function createVaultConfigRepositoryTauri(): VaultConfigRepository {
  return {
    async init(vaultName: string): Promise<VaultConfig> {
      const now = new Date().toISOString();
      const config: VaultConfig = {
        version: "1.0",
        name: vaultName,
        created: now,
        lastOpened: now,
      };
      await tauriBridge.writeJson(CONFIG_PATH, config);
      return config;
    },

    async read(): Promise<VaultConfig> {
      const parsed = await tauriBridge.readJson<unknown>(CONFIG_PATH);

      if (!isValidVaultConfig(parsed)) {
        throw new FileSystemError(
          "malformed",
          `Vault config at ${CONFIG_PATH} is missing required fields or has invalid shape`,
        );
      }
      return parsed;
    },

    async touchLastOpened(): Promise<void> {
      const current = await tauriBridge.readJson<VaultConfig>(CONFIG_PATH);
      current.lastOpened = new Date().toISOString();
      await tauriBridge.writeJson(CONFIG_PATH, current);
    },

    async update(patch: Partial<VaultConfig>): Promise<VaultConfig> {
      const current = await tauriBridge.readJson<VaultConfig>(CONFIG_PATH);
      const next = mergeOneLevel(
        current as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>,
      ) as unknown as VaultConfig;
      await tauriBridge.writeJson(CONFIG_PATH, next);
      return next;
    },

    isVault(config: VaultConfig | null): boolean {
      return config !== null && config.version != null;
    },
  };
}
