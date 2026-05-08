"use client";

// TODO MVP-1d: delete this file entirely; Tauri ships native — no PWA
// service-worker or Cache Storage cache needed. The FSA-backed offline-cache
// concept goes away with the FSA layer.

import type { TreeNode } from "./useFileExplorer";

export const KB_CACHE_PREFIX = "/__kb-cache/";

export function cacheKeyForPath(path: string): string {
  return `${KB_CACHE_PREFIX}${path.replace(/^\/+/, "")}`;
}

interface UseOfflineCacheArgs {
  tree: TreeNode[];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useOfflineCache(_args: UseOfflineCacheArgs): void {
  // No-op in Tauri mode. Retains the call signature so callers compile
  // without changes; the rootHandleRef arg has been removed. The full
  // implementation can be deleted in MVP-1d.
}
