import type { VaultConfig } from "../../../shared/utils/types";

const CONFIG_DIR = ".archdesigner";
const CONFIG_FILE = "config.json";

export async function initVault(
  rootHandle: FileSystemDirectoryHandle,
  name: string,
): Promise<VaultConfig> {
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
): Promise<VaultConfig | null> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    // Phase 5b (2026-04-19): validate the full shape at the I/O boundary
    // rather than handing a cast-but-unvalidated object to callers.
    return isValidVaultConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
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
  } catch {
    // Config doesn't exist — not a vault
  }
}

export function isVaultDirectory(config: VaultConfig | null): boolean {
  return config !== null && config.version != null;
}
