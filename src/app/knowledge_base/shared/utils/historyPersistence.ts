import { tauriBridge } from "../../infrastructure/tauriBridge";

export interface HistoryEntry<T> {
  id: number;
  description: string;
  timestamp: number;
  snapshot: T;
}

export interface HistoryFile<T> {
  checksum: string;
  currentIndex: number;
  savedIndex: number;
  entries: HistoryEntry<T>[];
}

export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function historyFileName(filePath: string): string {
  const parts = filePath.split("/");
  const name = parts.pop()!;
  const dir = parts.join("/");
  // Include the full filename (with extension) so .json and .md files that
  // share the same base name don't collide on the same sidecar file.
  const histName = `.${name}.history.json`;
  return dir ? `${dir}/${histName}` : histName;
}

// Pre-fix naming that stripped the extension — used as a migration fallback
// when reading sidecars created before the collision was fixed.
function historyFileNameLegacy(filePath: string): string {
  const parts = filePath.split("/");
  const name = parts.pop()!;
  const dir = parts.join("/");
  const histName = `.${name.replace(/\.(json|md)$/, "")}.history.json`;
  return dir ? `${dir}/${histName}` : histName;
}

export async function readHistoryFile<T>(
  filePath: string,
): Promise<HistoryFile<T> | null> {
  try {
    const text = await tauriBridge.readText(historyFileName(filePath));
    return JSON.parse(text) as HistoryFile<T>;
  } catch {
    try {
      const legacyText = await tauriBridge.readText(historyFileNameLegacy(filePath));
      return JSON.parse(legacyText) as HistoryFile<T>;
    } catch {
      return null;
    }
  }
}

export async function writeHistoryFile<T>(
  filePath: string,
  data: HistoryFile<T>,
): Promise<void> {
  try {
    await tauriBridge.writeText(historyFileName(filePath), JSON.stringify(data));
  } catch {
    // Silently ignore write failures — matches FSA-era behaviour.
  }
}
