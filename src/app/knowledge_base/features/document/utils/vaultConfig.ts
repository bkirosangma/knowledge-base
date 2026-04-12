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

export async function readVaultConfig(
  rootHandle: FileSystemDirectoryHandle,
): Promise<VaultConfig | null> {
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as VaultConfig;
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
