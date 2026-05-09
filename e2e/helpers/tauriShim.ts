// e2e/helpers/tauriShim.ts
//
// Init-script that monkey-patches `window.__TAURI_INTERNALS__` so the
// frontend's `@tauri-apps/api/core::invoke` / `@tauri-apps/api/event::listen`
// round-trip to test_server (axum on :1421) instead of the missing
// Tauri runtime. Registered via Playwright's `page.addInitScript` so
// it runs BEFORE any page module evaluates — Tauri's bridge code reads
// __TAURI_INTERNALS__ at module-eval time (the bundler emits a static
// reference; lazy patching after page.goto() is too late).
//
// listen() is currently a no-op stub: none of the 4 MVP-4.x proof-set
// specs assert event-driven behaviour. The test_server scaffolds an
// SSE endpoint at /events for future specs that do; swap this body
// for an EventSource on TS + "/events" filtering by msg.event === name
// when that day comes.

import type { Page } from "@playwright/test";

export const TEST_SERVER_URL = "http://localhost:1421";

// String form (not a function reference) so Playwright can serialize
// it across the addInitScript boundary. The body runs in the page
// context with no closure access to this module.
export const INIT_SCRIPT = `
(function () {
  const TS = "${TEST_SERVER_URL}";

  async function invoke(cmd, args) {
    const res = await fetch(TS + "/invoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd, args: args ?? {} }),
    });
    if (!res.ok) {
      throw new Error("test_server " + res.status + ": " + (await res.text()));
    }
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || "invoke failed: " + cmd);
    return body.value;
  }

  // listen() returns an unlisten function. Tauri's @tauri-apps/api/event
  // resolves an EventSource against /events; for the proof set we
  // currently no-op (none of the 4 specs assert event-driven behaviour).
  // When future specs need real event delivery, replace this body with
  // an EventSource on TS + "/events" filtering by msg.event === name.
  function listen(name, handler) {
    return Promise.resolve(function unlisten() { /* no-op */ });
  }

  // Tauri 2.x bridge contract: __TAURI_INTERNALS__.invoke(cmd, args).
  // The high-level @tauri-apps/api/core wraps this with type cleanup.
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback: function (cb) { return cb; },
    metadata: { plugins: {} },
  };

  // Belt-and-suspenders: the legacy __TAURI__ namespace some code paths still read.
  window.__TAURI__ = {
    invoke,
    event: { listen },
    core: { invoke },
  };
})();
`;

export async function installShim(page: Page): Promise<void> {
  await page.addInitScript({ content: INIT_SCRIPT });
}
