"use client";

import { useEffect } from "react";
import type { TreeNode } from "./useFileExplorer";
import { createDocumentRepository } from "../../infrastructure/documentRepo";
import { createDiagramRepository } from "../../infrastructure/diagramRepo";

/**
 * Last-known-good cache for the most recently opened files. Reads recents
 * from `localStorage["kb-recents"]` AT EXECUTION TIME (not closure
 * capture, which goes stale across visibilitychange ticks — flagged in
 * the PR-3 review notes), reads each file via the appropriate repo, and
 * stores the response body under the `kb-files-v1` Cache Storage bucket
 * keyed by `/__kb-cache/<path>`.  When the SW serves a fetch for the same
 * key it gets the cached response back even when the disk handle is
 * unavailable.
 *
 * This is NOT full offline support — File System Access requires the
 * disk to be present. The cache covers "open the PWA without picking a
 * folder yet" so users can re-read recently visited content.
 *
 * Triggers:
 *   - Initial mount (after the directory handle is available)
 *   - `visibilitychange` → document.visibilityState === "hidden"
 *     (fires when the user backgrounds the tab — "save before forget")
 *   - 30 s heartbeat while the page is visible
 */

const RECENTS_KEY = "kb-recents";
const MAX_FILES = 10;
const CACHE_NAME = "kb-files-v1";
const HEARTBEAT_MS = 30_000;

/**
 * Synthetic URL that the SW + cache use to key per-file responses.
 * Exported so the SW (when we hand-roll it) can reference the same
 * prefix without duplicating the literal.
 */
export const KB_CACHE_PREFIX = "/__kb-cache/";

export function cacheKeyForPath(path: string): string {
  return `${KB_CACHE_PREFIX}${path.replace(/^\/+/, "")}`;
}

function loadRecentsFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_FILES);
  } catch {
    return [];
  }
}

interface UseOfflineCacheArgs {
  /** Vault root handle. Hook is a no-op when null (no folder picked yet). */
  rootHandleRef: React.RefObject<FileSystemDirectoryHandle | null>;
  /**
   * Live tree — used to skip cache writes for paths that have been
   * deleted since they were last visited (avoids surfacing stale ghosts).
   */
  tree: TreeNode[];
}

function flattenTreePaths(tree: TreeNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (items: TreeNode[]) => {
    for (const it of items) {
      if (it.type === "file") out.add(it.path);
      if (it.children) walk(it.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Read a single path via the right repo and write to the cache.  Errors
 * are swallowed — caching is best-effort.
 */
async function cacheOnePath(
  rootHandle: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  try {
    let body: string;
    if (path.endsWith(".md")) {
      const repo = createDocumentRepository(rootHandle);
      body = await repo.read(path);
    } else if (path.endsWith(".json")) {
      const repo = createDiagramRepository(rootHandle);
      const raw = await repo.read(path);
      body = JSON.stringify(raw);
    } else {
      // Skip unknown extensions — vault config, drafts, history sidecars.
      return;
    }

    const cache = await caches.open(CACHE_NAME);
    const url = cacheKeyForPath(path);
    const contentType = path.endsWith(".md")
      ? "text/markdown; charset=utf-8"
      : "application/json; charset=utf-8";
    await cache.put(
      url,
      new Response(body, {
        status: 200,
        headers: {
          "content-type": contentType,
          "x-kb-cache-path": path,
        },
      }),
    );
  } catch {
    // Read or write failure — cache is best-effort, never block.
  }
}

/**
 * Run the cache pass.  Reads recents fresh each call so the list isn't
 * stale across long visible sessions.
 */
async function refreshCache(
  rootHandle: FileSystemDirectoryHandle,
  liveTreePaths: Set<string>,
): Promise<void> {
  if (typeof caches === "undefined") return;
  const recents = loadRecentsFromStorage();
  for (const path of recents) {
    if (!liveTreePaths.has(path)) continue;
    await cacheOnePath(rootHandle, path);
  }
}

export function useOfflineCache({ rootHandleRef, tree }: UseOfflineCacheArgs) {
  useEffect(() => {
    // Skip in non-browser environments + when caches API is unavailable
    // (older Safari, test runners without service-worker-context).
    if (typeof window === "undefined") return;
    if (typeof caches === "undefined") return;

    const liveTreePaths = flattenTreePaths(tree);

    const run = () => {
      const handle = rootHandleRef.current;
      if (!handle) return;
      void refreshCache(handle, liveTreePaths);
    };

    // Initial pass — best-effort.
    run();

    // visibilitychange — write before the user backgrounds.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") run();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // 30 s heartbeat while page is visible.
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, HEARTBEAT_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
    // We deliberately re-mount when `tree` reference changes (paths set is
    // recomputed) but rootHandleRef is a ref so it doesn't go in deps —
    // the closure reads the live ref each call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree]);
}
