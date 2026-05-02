/* eslint-disable no-restricted-globals */
/**
 * Knowledge Base service worker — hand-rolled (next-pwa is not Next-16
 * compatible).
 *
 * Phase 3 PR 3 + KB-044 (2026-04-26 / 2026-05-02).
 *
 * Caches:
 *   - kb-static-vN — app-shell HTML at "/", manifest, icon, and any
 *     immutable Next bundles under /_next/static/* the runtime
 *     intercepts on the way to the browser. Bumping the version drops
 *     the previous shell on the next activate.
 *   - kb-files-v1 — vault-content cache owned by `useOfflineCache`.
 *     Lifecycle is independent; activate must NEVER drop it.
 *
 * Lanes:
 *   - /__kb-cache/* (synthetic prefix written by useOfflineCache):
 *     cache-only — return the stored Response or 504 when missing.
 *   - /_next/static/*: cache-first — content-hashed, immutable, so a
 *     single successful fetch is enough to satisfy every reload, online
 *     or offline. KB-044.
 *   - Navigation requests (req.mode === "navigate" or accept: text/html):
 *     network-first; on success, refresh the cached "/" entry; on
 *     network failure, return the cached navigation entry, else the
 *     cached "/" shell, else a 504. This is the "offline boot returns
 *     the app, not Chrome's offline page" guarantee.
 *   - Manifest + icon: cache-first (small, infrequent).
 *   - Everything else: network-first with cache fallback.
 */

const CACHE = "kb-static-v3";
const FILES_CACHE = "kb-files-v1";

// Precached on `install`. `/` is the app shell — Next 16 streams the same
// route handler regardless of the deep URL, so a single cached entry is
// enough to boot any path offline. /index.html is included as an alias so
// hosts that resolve `/` to a static file still resolve from cache.
const APP_SHELL = ["/", "/index.html", "/manifest.json", "/icon.svg", "/soundfonts/sonivox.sf2"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Best-effort: in dev (`next dev`) the SW shouldn't even run, but
      // some assets may legitimately 404 (e.g. `/index.html` on a Next
      // app that only serves `/`). A failed pre-cache must not abort the
      // install — the runtime caching lanes will recover on first hit.
      await Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  // Drop superseded static caches; preserve `kb-files-v1` (offline-cache
  // hook owns its lifecycle independently).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== FILES_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isSoundFont(url) {
  return url.pathname.startsWith("/soundfonts/");
}

function isManifestOrIcon(url) {
  return url.pathname === "/manifest.json" || url.pathname === "/icon.svg";
}

function isNavigationRequest(req) {
  if (req.mode === "navigate") return true;
  const accept = req.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Vault-file cache lane — cache-only.
  if (url.pathname.startsWith("/__kb-cache/")) {
    event.respondWith(
      caches.open(FILES_CACHE).then((cache) =>
        cache.match(req).then(
          (res) =>
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

  // Hashed Next bundles — cache-first. They're content-hashed, so a hit
  // is always safe; a miss falls through to the network and is stored
  // for next time. KB-044.
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          // Offline + not yet cached — return whatever the global cache
          // happens to hold, or surface a 504.
          const fallback = await caches.match(req);
          return (
            fallback ||
            new Response("Offline and not cached", {
              status: 504,
              headers: { "content-type": "text/plain" },
            })
          );
        }
      }),
    );
    return;
  }

  // SoundFonts — cache-first. Big binary that never changes; one fetch
  // serves every reload, online or offline. KB-044 lane extension.
  if (isSoundFont(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return new Response("Offline and SoundFont not cached", {
            status: 504,
            headers: { "content-type": "text/plain" },
          });
        }
      }),
    );
    return;
  }

  // Manifest + icon — cache-first.
  if (isManifestOrIcon(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((res) => res || fetch(req)),
      ),
    );
    return;
  }

  // Navigation — network-first, fall back to cached navigation entry,
  // then to the cached "/" app shell. KB-044.
  if (isNavigationRequest(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const cloned = res.clone();
            // Always refresh "/" on a successful navigation fetch — the
            // shell is identical across deep links, and keeping it
            // current is what makes a later offline boot return the
            // freshest app, not an ancient one.
            caches
              .open(CACHE)
              .then((cache) => cache.put("/", cloned))
              .catch(() => undefined);
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match("/")) ||
            new Response("Offline and not cached", {
              status: 504,
              headers: { "content-type": "text/plain" },
            })
          );
        }),
    );
    return;
  }

  // Default — network-first; fall back to whatever the cache holds.
  event.respondWith(
    fetch(req).catch(() =>
      caches.match(req).then(
        (res) =>
          res ||
          new Response("Offline and not cached", {
            status: 504,
            headers: { "content-type": "text/plain" },
          }),
      ),
    ),
  );
});
