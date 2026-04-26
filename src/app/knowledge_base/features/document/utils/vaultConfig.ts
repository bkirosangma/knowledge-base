import type { VaultConfig } from "../../../shared/utils/types";
import { FileSystemError, classifyError } from "../../../domain/errors";

const CONFIG_DIR = ".archdesigner";
const CONFIG_FILE = "config.json";

export async function initVault(
  rootHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<VaultConfig> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR, { create: true });
    const now = new Date().toISOString();
    const config: VaultConfig = {
      version: "1.0",
      name,
      created: now,
      lastOpened: now,
    };
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(config, null, 2));
    await writable.close();
    return config;
  } catch (e) {
    throw classifyError(e);
  }
}

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

export async function readVaultConfig(
  rootHandle: FileSystemDirectoryHandle,
): Promise<VaultConfig> {
  let text: string;
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    text = await file.text();
  } catch (e) {
    throw classifyError(e);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new FileSystemError(
      "malformed",
      `Vault config at ${CONFIG_DIR}/${CONFIG_FILE} is not valid JSON`,
      e,
    );
  }
  // Phase 5b (2026-04-19): validate the full shape at the I/O boundary.
  if (!isValidVaultConfig(parsed)) {
    throw new FileSystemError(
      "malformed",
      `Vault config at ${CONFIG_DIR}/${CONFIG_FILE} is missing required fields`,
    );
  }
  return parsed;
}

/**
 * Read the persisted vault config, merge `patch` over the top, and write
 * it back atomically. Throws `FileSystemError` on read/write failure or
 * when the file is absent (no silent no-op — partial updates assume a
 * config already exists). Used by `useTheme` to persist theme choice
 * (Phase 3 PR 1, 2026-04-26).
 */
export async function updateVaultConfig(
  rootHandle: FileSystemDirectoryHandle,
  patch: Partial<VaultConfig>,
): Promise<VaultConfig> {
  let current: VaultConfig;
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    current = JSON.parse(await file.text()) as VaultConfig;
  } catch (e) {
    throw classifyError(e);
  }
  const next: VaultConfig = { ...current, ...patch };
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(next, null, 2));
    await writable.close();
  } catch (e) {
    throw classifyError(e);
  }
  return next;
}

export async function updateVaultLastOpened(
  rootHandle: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const config: VaultConfig = JSON.parse(await file.text());
    config.lastOpened = new Date().toISOString();
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(config, null, 2));
    await writable.close();
  } catch (e) {
    const fsErr = classifyError(e);
    // Silent no-op when the config is absent (non-vault folder) keeps the
    // pre-Phase-5c behaviour of a best-effort timestamp touch. Every other
    // failure — permission, quota, etc. — now surfaces so callers can
    // report it instead of silently dropping the update.
    if (fsErr.kind === "not-found") return;
    throw fsErr;
  }
}

export function isVaultDirectory(config: VaultConfig | null): boolean {
  return config !== null && config.version != null;
}
