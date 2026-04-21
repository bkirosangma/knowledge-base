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
  const histName = `.${name.replace(/\.(json|md)$/, "")}.history.json`;
  return dir ? `${dir}/${histName}` : histName;
}

export async function resolveParentHandle(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop();
  let current = rootHandle;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

export async function readHistoryFile<T>(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
): Promise<HistoryFile<T> | null> {
  try {
    const histPath = historyFileName(filePath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as HistoryFile<T>;
  } catch {
    return null;
  }
}

export async function writeHistoryFile<T>(
  rootHandle: FileSystemDirectoryHandle,
  filePath: string,
  data: HistoryFile<T>,
): Promise<void> {
  try {
    const histPath = historyFileName(filePath);
    const parentHandle = await resolveParentHandle(rootHandle, histPath);
    const fileName = histPath.split("/").pop()!;
    const fileHandle = await parentHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data));
    await writable.close();
  } catch {
    // Silently ignore write failures
  }
}
