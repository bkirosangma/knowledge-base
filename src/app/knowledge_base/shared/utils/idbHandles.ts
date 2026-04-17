/**
 * IndexedDB wrapper for persisting the File System Access `FileSystemDirectoryHandle`
 * across reloads, paired with a short per-folder scope id used to namespace
 * localStorage keys (see `directoryScope.ts`).
 *
 * The entire DB is a single object store that holds two keys: the handle itself
 * and the scope id. All helpers swallow errors — IDB is best-effort persistence;
 * if it fails (private mode, quota, browser opt-out) the app falls back to the
 * pre-folder empty state.
 */

export const IDB_NAME = "knowledge-base";
export const IDB_STORE = "handles";
export const IDB_DIR_KEY = "directory-handle";
export const IDB_SCOPE_KEY = "directory-scope";

export function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveDirHandle(handle: FileSystemDirectoryHandle, scopeId: string): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_DIR_KEY);
    tx.objectStore(IDB_STORE).put(scopeId, IDB_SCOPE_KEY);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* ignore */ }
}

export async function loadDirHandle(): Promise<{ handle: FileSystemDirectoryHandle; scopeId: string } | null> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const handleReq = store.get(IDB_DIR_KEY);
    const scopeReq = store.get(IDB_SCOPE_KEY);
    const [handle, scopeId] = await new Promise<[FileSystemDirectoryHandle | null, string | null]>((res, rej) => {
      tx.oncomplete = () => res([handleReq.result ?? null, scopeReq.result ?? null]);
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    if (!handle) return null;
    // Migration from old data that didn't record a scope id — mint one.
    const id = scopeId ?? crypto.randomUUID().slice(0, 8);
    return { handle, scopeId: id };
  } catch { return null; }
}

export async function clearDirHandle(): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(IDB_DIR_KEY);
    tx.objectStore(IDB_STORE).delete(IDB_SCOPE_KEY);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* ignore */ }
}
