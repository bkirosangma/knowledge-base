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
 * One-level deep merge. For each key in `patch`, if both the current
 * and patch values are plain objects (not arrays, not null), shallow-
 * merge them; otherwise the patch value replaces the current value.
 *
 * Why one level? VaultConfig has nested groups (`graph`, future `ui`,
 * etc.) where a partial update like `{ graph: { layout } }` should
 * preserve sibling fields (`graph.zoom`, etc.) instead of replacing
 * the whole `graph` object. We deliberately DON'T recurse beyond one
 * level — `graph.layout` itself is meant to be wholesale-replaced by
 * its caller (`GraphView` already merges the layout-map upstream so
 * it sends a complete map), and going deeper would silently mask
 * intentional removals from inner maps.
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

/**
 * Read the persisted vault config, merge `patch` over the top, and write
 * it back atomically. Throws `FileSystemError` on read/write failure or
 * when the file is absent (no silent no-op — partial updates assume a
 * config already exists). Used by `useTheme` to persist theme choice
 * (Phase 3 PR 1, 2026-04-26) and by `GraphView` for the cached graph
 * layout (Phase 3 PR 2, 2026-04-26).
 *
 * Merge semantics: one-level deep — top-level keys in `patch` are merged
 * over `current`, and if both sides of a key are plain objects, those
 * are themselves shallow-merged (so `update({ graph: { layout } })`
 * preserves any other `graph.*` siblings instead of wiping them).
 */
export async function updateVaultConfig(
  rootHandle: FileSystemDirectoryHandle,
  patch: Partial<VaultConfig>,
): Promise<VaultConfig> {
  // Acquire dir + file handles ONCE and reuse for both read and write —
  // mirrors `updateVaultLastOpened` so two concurrent patches (e.g. theme
  // + lastOpened) can't interleave their separate read/write lookups and
  // drop one update.
  try {
    const configDir = await rootHandle.getDirectoryHandle(CONFIG_DIR);
    const fileHandle = await configDir.getFileHandle(CONFIG_FILE);
    const file = await fileHandle.getFile();
    const current = JSON.parse(await file.text()) as VaultConfig;
    const next = mergeOneLevel(
      current as unknown as Record<string, unknown>,
      patch as unknown as Record<string, unknown>,
    ) as unknown as VaultConfig;
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(next, null, 2));
    await writable.close();
    return next;
  } catch (e) {
    throw classifyError(e);
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
