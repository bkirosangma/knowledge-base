import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { useOfflineCache, KB_CACHE_PREFIX, cacheKeyForPath } from './useOfflineCache'
import type { TreeNode } from './useFileExplorer'

// Covers SHELL-1.15-05..06 — Phase 3 PR 3 (PWA offline cache smoke test).

describe('cacheKeyForPath', () => {
  it('prefixes any vault path with /__kb-cache/', () => {
    expect(cacheKeyForPath('docs/notes/a.md')).toBe(`${KB_CACHE_PREFIX}docs/notes/a.md`)
  })

  it('strips leading slashes so paths normalise cleanly', () => {
    expect(cacheKeyForPath('/already/absolute.md')).toBe(`${KB_CACHE_PREFIX}already/absolute.md`)
  })
})

describe('useOfflineCache (smoke)', () => {
  let originalCaches: typeof globalThis.caches | undefined

  beforeEach(() => {
    originalCaches = (globalThis as { caches?: CacheStorage }).caches
    // Strip caches API — the hook should be a no-op in environments
    // without it (jsdom default + older Safari).
    delete (globalThis as { caches?: CacheStorage }).caches
  })

  afterEach(() => {
    if (originalCaches) {
      ;(globalThis as { caches?: CacheStorage }).caches = originalCaches
    }
    vi.useRealTimers()
  })

  it('SHELL-1.15-05: hook mounts without throwing when caches API is absent', () => {
    const tree: TreeNode[] = []
    expect(() => {
      renderHook(() => {
        const ref = useRef<FileSystemDirectoryHandle | null>(null)
        useOfflineCache({ rootHandleRef: ref, tree })
      })
    }).not.toThrow()
  })

  it('SHELL-1.15-06: hook is a no-op when rootHandleRef is null', () => {
    // Install a stub `caches` so the hook would proceed if root handle
    // were available. We assert no calls landed because rootHandleRef
    // is null (no folder picked yet).
    const open = vi.fn().mockResolvedValue({ put: vi.fn() })
    ;(globalThis as { caches: CacheStorage }).caches = { open } as unknown as CacheStorage

    const tree: TreeNode[] = []
    renderHook(() => {
      const ref = useRef<FileSystemDirectoryHandle | null>(null)
      useOfflineCache({ rootHandleRef: ref, tree })
    })

    // Cache should NOT have been opened — rootHandle is null.
    expect(open).not.toHaveBeenCalled()
  })
})
