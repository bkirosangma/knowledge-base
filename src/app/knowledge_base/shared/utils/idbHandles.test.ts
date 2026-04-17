import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import {
  IDB_NAME,
  IDB_STORE,
  IDB_DIR_KEY,
  IDB_SCOPE_KEY,
  openIDB,
  saveDirHandle,
  loadDirHandle,
  clearDirHandle,
} from './idbHandles'

// Covers PERSIST-7.2-01..08 (IndexedDB directory-handle storage contract).

beforeEach(() => {
  // Fresh IDB per test — `fake-indexeddb/auto` already installs the shim; we
  // just reset the database state by replacing the factory.
  globalThis.indexedDB = new IDBFactory()
})

/** Build a stub that's shaped enough like a FileSystemDirectoryHandle for IDB
 *  to round-trip it via the structured clone algorithm. fake-indexeddb clones
 *  plain objects; we attach a `kind` tag and a `name` so tests can assert on
 *  what came back. */
function makeHandleStub(name = 'vault'): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle
}

describe('IDB constants (PERSIST-7.2-01, 7.2-02)', () => {
  it('PERSIST-7.2-01: DB name is "knowledge-base"', () => {
    expect(IDB_NAME).toBe('knowledge-base')
  })
  it('PERSIST-7.2-02: object store is "handles"', () => {
    expect(IDB_STORE).toBe('handles')
  })
  it('handle and scope keys are distinct', () => {
    expect(IDB_DIR_KEY).toBe('directory-handle')
    expect(IDB_SCOPE_KEY).toBe('directory-scope')
    expect(IDB_DIR_KEY).not.toBe(IDB_SCOPE_KEY)
  })
})

describe('openIDB — schema upgrade (PERSIST-7.2-06)', () => {
  it('PERSIST-7.2-06: creates the handles object store on first open (empty DB)', async () => {
    const db = await openIDB()
    expect(Array.from(db.objectStoreNames)).toContain(IDB_STORE)
    db.close()
  })

  it('opening an already-upgraded DB does not recreate the store (idempotent)', async () => {
    const db1 = await openIDB(); db1.close()
    const db2 = await openIDB()
    expect(Array.from(db2.objectStoreNames)).toContain(IDB_STORE)
    db2.close()
  })
})

describe('saveDirHandle (PERSIST-7.2-03)', () => {
  it('PERSIST-7.2-03: writes handle + scope id to the store', async () => {
    const handle = makeHandleStub('my-vault')
    await saveDirHandle(handle, 'abc12345')

    const db = await openIDB()
    const tx = db.transaction(IDB_STORE, 'readonly')
    const store = tx.objectStore(IDB_STORE)
    const handleReq = store.get(IDB_DIR_KEY)
    const scopeReq = store.get(IDB_SCOPE_KEY)
    await new Promise<void>((res) => { tx.oncomplete = () => res() })
    expect(handleReq.result).toMatchObject({ kind: 'directory', name: 'my-vault' })
    expect(scopeReq.result).toBe('abc12345')
    db.close()
  })

  it('swallows errors if indexedDB is unavailable', async () => {
    const broken = {
      open: () => { throw new Error('IDB disabled') },
    } as unknown as IDBFactory
    const original = globalThis.indexedDB
    globalThis.indexedDB = broken
    try {
      await expect(saveDirHandle(makeHandleStub(), 's')).resolves.toBeUndefined()
    } finally {
      globalThis.indexedDB = original
    }
  })
})

describe('loadDirHandle (PERSIST-7.2-04, 7.2-07)', () => {
  it('PERSIST-7.2-04: returns null when nothing is stored', async () => {
    expect(await loadDirHandle()).toBeNull()
  })

  it('PERSIST-7.2-07: round-trips a saved handle + scope id', async () => {
    const handle = makeHandleStub('my-vault')
    await saveDirHandle(handle, 'xyz789')
    const loaded = await loadDirHandle()
    expect(loaded).not.toBeNull()
    expect(loaded!.handle).toMatchObject({ kind: 'directory', name: 'my-vault' })
    expect(loaded!.scopeId).toBe('xyz789')
  })

  it('mints a fresh scope id when handle exists but scope id was never written (migration)', async () => {
    // Simulate legacy state: write only the handle, leave scope slot empty.
    const db = await openIDB()
    const tx = db.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(makeHandleStub('legacy'), IDB_DIR_KEY)
    await new Promise<void>((res) => { tx.oncomplete = () => res() })
    db.close()

    const loaded = await loadDirHandle()
    expect(loaded).not.toBeNull()
    expect(loaded!.scopeId).toMatch(/^[0-9a-f]{8}$/i)
  })

  it('swallows errors and returns null when IDB is unavailable', async () => {
    const broken = {
      open: () => { throw new Error('IDB disabled') },
    } as unknown as IDBFactory
    const original = globalThis.indexedDB
    globalThis.indexedDB = broken
    try {
      expect(await loadDirHandle()).toBeNull()
    } finally {
      globalThis.indexedDB = original
    }
  })
})

describe('clearDirHandle (PERSIST-7.2-05, 7.2-08)', () => {
  it('PERSIST-7.2-05: removes both the handle and scope entries', async () => {
    await saveDirHandle(makeHandleStub('v'), 'scope-1')
    expect(await loadDirHandle()).not.toBeNull()
    await clearDirHandle()
    expect(await loadDirHandle()).toBeNull()
  })

  it('PERSIST-7.2-08: clear leaves the DB + store intact for a fresh save', async () => {
    await saveDirHandle(makeHandleStub('v'), 's1')
    await clearDirHandle()
    await saveDirHandle(makeHandleStub('v2'), 's2')
    const loaded = await loadDirHandle()
    expect(loaded!.handle).toMatchObject({ name: 'v2' })
    expect(loaded!.scopeId).toBe('s2')
  })

  it('is a no-op when nothing is stored', async () => {
    await expect(clearDirHandle()).resolves.toBeUndefined()
    expect(await loadDirHandle()).toBeNull()
  })
})
