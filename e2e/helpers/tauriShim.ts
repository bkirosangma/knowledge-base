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
// Two interception points:
//   • `invoke(cmd, args)` for ordinary commands forwards to /invoke.
//   • `invoke("plugin:event|listen", { event, handler })` is intercepted
//     locally: the JS handler (an integer id from our `transformCallback`)
//     is wired to a shared `EventSource` against TS + "/events" so SSE
//     frames from the test_server's `EventBus` reach the right callback.
//   • `invoke("plugin:event|unlisten", { eventId })` removes the listener.
//
// The `EventBus` is fed by the `TestWatcher` (parallel
// notify_debouncer_full) on the Rust side — Playwright specs that
// mutate files from node-side `fs` see the React tree refresh exactly
// the way it does in production via `app.emit("vault_change", _)`.

import type { Page } from "@playwright/test";

export const TEST_SERVER_URL = "http://localhost:1421";

// String form (not a function reference) so Playwright can serialize
// it across the addInitScript boundary. The body runs in the page
// context with no closure access to this module.
export const INIT_SCRIPT = `
(function () {
  const TS = "${TEST_SERVER_URL}";

  // ── Tauri callback registry ──────────────────────────────────────
  // transformCallback(fn) stashes the JS handler and returns an id
  // the backend can later use to call it back. Production Tauri stores
  // these on window under generated names; for the test shim we keep
  // them in a plain Map so the shape is local and deterministic.
  const _callbacks = new Map();
  let _nextCbId = 1;
  function transformCallback(callback, once) {
    const id = _nextCbId++;
    _callbacks.set(id, function (payload) {
      if (once) _callbacks.delete(id);
      try { callback(payload); } catch (_e) { /* swallow per Tauri */ }
    });
    return id;
  }

  // ── Lazy shared EventSource ──────────────────────────────────────
  let _source = null;
  function _ensureSource() {
    if (_source && _source.readyState !== 2 /* CLOSED */) return _source;
    _source = new EventSource(TS + "/events");
    return _source;
  }

  // ── Active SSE listeners (one per plugin:event|listen call) ──────
  const _listeners = new Map();
  let _nextListenerId = 1;

  async function _invokeOverHttp(cmd, args) {
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

  async function invoke(cmd, args) {
    // Intercept Tauri's event-plugin listen/unlisten so SSE frames
    // dispatch into the registered callback.
    if (cmd === "plugin:event|listen") {
      const eventName = args && args.event;
      const handlerId = args && args.handler;
      const cb = _callbacks.get(handlerId);
      if (!eventName || typeof cb !== "function") return -1;

      const source = _ensureSource();
      const onSse = function (msg) {
        let payload = null;
        try {
          const env = JSON.parse(msg.data);
          payload = env && typeof env === "object" ? env.payload : null;
        } catch (_e) { /* malformed frame */ }
        cb({ event: eventName, payload, id: handlerId });
      };
      source.addEventListener(eventName, onSse);

      const listenerId = _nextListenerId++;
      _listeners.set(listenerId, { event: eventName, onSse });
      return listenerId;
    }

    if (cmd === "plugin:event|unlisten") {
      const listenerId = args && args.eventId;
      const entry = _listeners.get(listenerId);
      if (entry) {
        _ensureSource().removeEventListener(entry.event, entry.onSse);
        _listeners.delete(listenerId);
      }
      return null;
    }

    return _invokeOverHttp(cmd, args);
  }

  // Tauri 2.x bridge contract: __TAURI_INTERNALS__.invoke / transformCallback.
  window.__TAURI_INTERNALS__ = {
    invoke,
    transformCallback,
    metadata: { plugins: {} },
  };

  // Belt-and-suspenders: the legacy __TAURI__ namespace some code paths still read.
  window.__TAURI__ = {
    invoke,
    core: { invoke },
  };
})();
`;

export async function installShim(page: Page): Promise<void> {
  await page.addInitScript({ content: INIT_SCRIPT });
}
