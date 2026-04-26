"use client";

import { useEffect } from "react";

/**
 * Registers `/sw.js` (the hand-rolled Workbox-style service worker) once
 * per app boot.  Production-only: dev mode skips registration so HMR /
 * Turbopack don't fight the cache layer (the SW would intercept /_next
 * chunks and break iteration).
 *
 * `next-pwa` is intentionally NOT used — it's not Next-16 compatible
 * (the library hasn't been updated for the App Router + Turbopack
 * pipeline).  The hand-rolled SW lives at `public/sw.js` and ships as
 * a static asset; this component just calls `register()`.
 *
 * Phase 3 PR 3 (PWA / SHELL-1.15, 2026-04-26).
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Production only — guard belt-and-braces in case envs vary.
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Don't await — registration is fire-and-forget; failures are
    // logged but never thrown into the React tree.
    navigator.serviceWorker
      .register("/sw.js")
      .catch((err) => {
        console.warn("[kb] service worker registration failed", err);
      });
  }, []);

  return null;
}
