/* eslint-disable no-restricted-globals */
/**
 * Knowledge Base service worker — hand-rolled (next-pwa is not Next-16
 * compatible).
 *
 * Phase 3 PR 3 (PWA / SHELL-1.15, 2026-04-26).
 *
 * Strategy:
 *   - On install: pre-cache the manifest + icon so the PWA install
 *     prompt has its assets even on a cold start.
 *   - On fetch:
 *       * `/__kb-cache/*` (synthetic prefix written by useOfflineCache):
 *         cache-only — return the stored Response or 504 when missing.
 *         Network has nothing here; this is a vault-content cache.
 *       * Everything else: network-first, fall back to cache when the
 *         network errors. Keeps Next/Turbopack chunks live in dev/prod
 *         and lets the manifest survive offline reloads.
 */

const CACHE = "kb-static-v1";
const FILES_CACHE = "kb-files-v1";
const STATIC_ASSETS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop old static caches but preserve `kb-files-v1` (the offline-cache
  // hook owns its lifecycle independently).
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE && k !== FILES_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Vault-file cache lane.
  if (url.pathname.startsWith("/__kb-cache/")) {
    event.respondWith(
      caches.open(FILES_CACHE).then((cache) =>
        cache.match(req).then((res) =>
          res ||
          new Response("Not in offline cache", {
            status: 504,
            headers: { "content-type": "text/plain" },
          }),
        ),
      ),
    );
    return;
  }

  // Static asset cache lane — manifest + icon.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((res) => res || fetch(req)),
      ),
    );
    return;
  }

  // Default: network-first; fall back to cache on offline.
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then((res) =>
        res ||
        new Response("Offline and not cached", {
          status: 504,
          headers: { "content-type": "text/plain" },
        }),
      ),
    ),
  );
});
