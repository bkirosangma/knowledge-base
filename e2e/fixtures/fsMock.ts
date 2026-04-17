/**
 * In-browser mock for the File System Access API used by the knowledge-base
 * app.  `installMockFS()` is serialised and injected via
 * `page.addInitScript()` so it runs before any page script — the app then
 * sees `window.showDirectoryPicker` available and usable, with no native
 * dialog in the way.
 *
 * The mock models a vault as nested Maps: directories hold name→handle maps
 * for both sub-directories and files; files hold a mutable string body.
 * Handles expose just the surface the app uses (`values`, `getFileHandle`,
 * `getDirectoryHandle`, `removeEntry`, `getFile`, `createWritable`,
 * `requestPermission`).
 *
 * Seed the vault from the test via
 *   page.evaluate(seed, { "notes/a.md": "# A", … })
 * and open it via the normal "Open Folder" button — the mocked picker
 * resolves with the seeded root instead of showing a native chooser.
 */

// Shape of the mock we hang off `window` so tests can inspect it.
declare global {
  interface Window {
    __kbMockFS?: {
      root: FileSystemDirectoryHandle
      seed: (files: Record<string, string>) => void
      read: (path: string) => string | undefined
      reset: () => void
    }
  }
}

export function installMockFS() {
  if (typeof window === 'undefined') return
  if (window.__kbMockFS) return

  type Dir = Map<string, Dir | FileBody>
  interface FileBody { __file: true; name: string; content: string }

  const isFile = (x: Dir | FileBody): x is FileBody =>
    (x as FileBody).__file === true

  function makeDir(name: string, store: Dir): FileSystemDirectoryHandle {
    const handle = {
      kind: 'directory' as const,
      name,

      async requestPermission() { return 'granted' as PermissionState },

      async *values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle> {
        for (const [childName, entry] of store) {
          if (isFile(entry)) yield makeFile(childName, entry)
          else yield makeDir(childName, entry)
        }
      },

      async getDirectoryHandle(
        childName: string,
        options?: { create?: boolean },
      ): Promise<FileSystemDirectoryHandle> {
        let entry = store.get(childName)
        if (!entry && options?.create) {
          entry = new Map<string, Dir | FileBody>()
          store.set(childName, entry)
        }
        if (!entry || isFile(entry)) {
          const err = new Error(`NotFoundError: ${childName}`)
          err.name = 'NotFoundError'
          throw err
        }
        return makeDir(childName, entry)
      },

      async getFileHandle(
        childName: string,
        options?: { create?: boolean },
      ): Promise<FileSystemFileHandle> {
        let entry = store.get(childName)
        if (!entry && options?.create) {
          entry = { __file: true, name: childName, content: '' }
          store.set(childName, entry)
        }
        if (!entry || !isFile(entry)) {
          const err = new Error(`NotFoundError: ${childName}`)
          err.name = 'NotFoundError'
          throw err
        }
        return makeFile(childName, entry)
      },

      async removeEntry(childName: string, _options?: { recursive?: boolean }) {
        store.delete(childName)
      },
    }
    return handle as unknown as FileSystemDirectoryHandle
  }

  function makeFile(name: string, body: FileBody): FileSystemFileHandle {
    const handle = {
      kind: 'file' as const,
      name,

      async getFile(): Promise<File> {
        const blob = new Blob([body.content], { type: 'text/plain' })
        const file = {
          name,
          size: body.content.length,
          type: 'text/plain',
          lastModified: Date.now(),
          text: async () => body.content,
          arrayBuffer: async () => await blob.arrayBuffer(),
          slice: () => blob.slice(),
          stream: () => blob.stream(),
        }
        return file as unknown as File
      },

      async createWritable(): Promise<FileSystemWritableFileStream> {
        let pending = ''
        const writable = {
          async write(data: string | Blob | ArrayBuffer | ArrayBufferView) {
            if (typeof data === 'string') pending += data
            else if (data instanceof Blob) pending += await data.text()
            else if (data instanceof ArrayBuffer) {
              pending += new TextDecoder().decode(data)
            } else {
              const view = data as ArrayBufferView
              pending += new TextDecoder().decode(
                new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
              )
            }
          },
          async close() {
            body.content = pending
          },
          async abort() { /* no-op */ },
          locked: false,
          getWriter() { throw new Error('not implemented') },
        }
        return writable as unknown as FileSystemWritableFileStream
      },
    }
    return handle as unknown as FileSystemFileHandle
  }

  let rootStore: Dir = new Map()

  function seed(files: Record<string, string>) {
    rootStore = new Map()
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split('/').filter(Boolean)
      let cur = rootStore
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]
        let next = cur.get(seg)
        if (!next || isFile(next)) {
          next = new Map<string, Dir | FileBody>()
          cur.set(seg, next)
        }
        cur = next
      }
      const fname = parts[parts.length - 1]
      cur.set(fname, { __file: true, name: fname, content })
    }
  }

  function read(path: string): string | undefined {
    const parts = path.split('/').filter(Boolean)
    let cur: Dir = rootStore
    for (let i = 0; i < parts.length - 1; i++) {
      const next = cur.get(parts[i])
      if (!next || isFile(next)) return undefined
      cur = next
    }
    const entry = cur.get(parts[parts.length - 1])
    return entry && isFile(entry) ? entry.content : undefined
  }

  function reset() { rootStore = new Map() }

  // Install the mock picker. The root is a proxy that re-reads `rootStore`
  // lazily so tests can re-seed between runs.
  const rootHandle = makeDir('vault', new Proxy(rootStore, {
    // Forward every Map op to the current rootStore (swappable via seed/reset).
    get(_target, prop, receiver) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const live = rootStore as any
      const v = live[prop]
      return typeof v === 'function' ? v.bind(live) : v
    },
  }) as Dir)

  window.showDirectoryPicker = async (): Promise<FileSystemDirectoryHandle> => {
    // Re-build the root each call so `values()` iterates the CURRENT rootStore.
    return makeDir('vault', rootStore)
  }

  window.__kbMockFS = {
    root: rootHandle,
    seed,
    read,
    reset,
  }
}
