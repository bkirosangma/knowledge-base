// Covers SHELL-1.15-07, 1.15-08, 1.15-09 (KB-044 app-shell precache + offline boot).
//
// Service-worker scripts can't be `import`ed in JSDOM the way React modules
// can, so we read sw.js as text and evaluate it inside a sandbox where
// `self`, `caches`, and `fetch` are all hand-rolled mocks. The mocks are
// minimal — only the surface sw.js touches — but enough to drive the
// `install` and `fetch` handlers and assert their behaviour.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

interface SwHarness {
  install: () => Promise<void>;
  activate: () => Promise<void>;
  navigate: (url: string) => Promise<Response>;
  asset: (url: string) => Promise<Response>;
  defaultFetch: (url: string) => Promise<Response>;
  cacheKeys: () => Promise<string[]>;
  cacheEntries: (cacheName: string) => Promise<string[]>;
  setFetch: (fn: (req: Request) => Promise<Response>) => void;
  staticCacheName: () => string;
}

// Repo layout: src/app/knowledge_base/shell/ → ../../../../public/sw.js
const SW_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "public",
  "sw.js",
);

function makeHarness(): SwHarness {
  const cacheStorage = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: unknown) => void>();

  let fetchImpl: (req: Request) => Promise<Response> = async () => {
    throw new Error("network error");
  };

  function keyFor(req: Request | string): string {
    if (typeof req === "string") return req;
    return new URL(req.url).pathname;
  }

  function makeCache(name: string) {
    if (!cacheStorage.has(name)) cacheStorage.set(name, new Map());
    const store = cacheStorage.get(name)!;
    return {
      async match(req: Request | string) {
        return store.get(keyFor(req));
      },
      async put(req: Request | string, res: Response) {
        store.set(keyFor(req), res);
      },
      async add(input: Request | string) {
        const url = typeof input === "string" ? input : input.url;
        const req = new Request(`http://localhost${url}`);
        const res = await fetchImpl(req);
        if (!res.ok) throw new Error(`add failed for ${url}`);
        store.set(keyFor(url), res);
      },
      async addAll(inputs: Array<Request | string>) {
        await Promise.all(inputs.map((i) => this.add(i)));
      },
    };
  }

  const cachesMock = {
    async open(name: string) {
      return makeCache(name);
    },
    async keys() {
      return Array.from(cacheStorage.keys());
    },
    async delete(name: string) {
      return cacheStorage.delete(name);
    },
    async match(req: Request | string) {
      for (const store of cacheStorage.values()) {
        const hit = store.get(keyFor(req));
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const selfMock = {
    // Root-deploy stub — `BASE` derives to "" so existing assertions
    // (`/manifest.json`, `/icon.svg`, ...) still match. Override the
    // pathname in tests that need to exercise a non-empty basePath.
    location: { pathname: "/sw.js" },
    addEventListener(event: string, handler: (e: unknown) => void) {
      listeners.set(event, handler);
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };

  const source = readFileSync(SW_PATH, "utf8");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const factory = new Function(
    "self",
    "caches",
    "fetch",
    "Response",
    "URL",
    "Request",
    source,
  );
  factory(
    selfMock,
    cachesMock,
    (req: Request) => fetchImpl(req),
    Response,
    URL,
    Request,
  );

  async function dispatchInstall() {
    const handler = listeners.get("install");
    if (!handler) throw new Error("install listener not registered");
    let waited: Promise<unknown> = Promise.resolve();
    const event = {
      waitUntil(p: Promise<unknown>) {
        waited = p;
      },
    };
    handler(event);
    await waited;
  }

  async function dispatchActivate() {
    const handler = listeners.get("activate");
    if (!handler) throw new Error("activate listener not registered");
    let waited: Promise<unknown> = Promise.resolve();
    const event = {
      waitUntil(p: Promise<unknown>) {
        waited = p;
      },
    };
    handler(event);
    await waited;
  }

  async function dispatchFetch(req: Request): Promise<Response> {
    const handler = listeners.get("fetch");
    if (!handler) throw new Error("fetch listener not registered");
    let respondWith: Promise<Response> | undefined;
    const event = {
      request: req,
      respondWith(p: Promise<Response>) {
        respondWith = p;
      },
    };
    handler(event);
    if (!respondWith) {
      throw new Error("fetch handler did not call respondWith for " + req.url);
    }
    return await respondWith;
  }

  function makeNavigationRequest(url: string): Request {
    return new Request(`http://localhost${url}`, {
      headers: { accept: "text/html" },
    });
  }

  function makeAssetRequest(url: string): Request {
    return new Request(`http://localhost${url}`);
  }

  return {
    install: dispatchInstall,
    activate: dispatchActivate,
    navigate: (url) => dispatchFetch(makeNavigationRequest(url)),
    asset: (url) => dispatchFetch(makeAssetRequest(url)),
    defaultFetch: (url) => dispatchFetch(makeAssetRequest(url)),
    cacheKeys: async () => Array.from(cacheStorage.keys()),
    cacheEntries: async (name) => {
      const store = cacheStorage.get(name);
      return store ? Array.from(store.keys()) : [];
    },
    setFetch(fn) {
      fetchImpl = fn;
    },
    staticCacheName: () => {
      const keys = Array.from(cacheStorage.keys());
      return keys.find((k) => k.startsWith("kb-static-")) ?? "";
    },
  };
}

function htmlResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html" },
    ...init,
  });
}

describe("public/sw.js — KB-044 app-shell cache", () => {
  let h: SwHarness;

  beforeEach(() => {
    h = makeHarness();
    h.setFetch(async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/") return htmlResponse("<html>online</html>");
      if (path === "/manifest.json")
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      if (path === "/icon.svg")
        return new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } });
      if (path.startsWith("/_next/static/"))
        return new Response("/* bundle */", { status: 200, headers: { "content-type": "text/javascript" } });
      return new Response("not found", { status: 404 });
    });
  });

  it("SHELL-1.15-07: install precaches the app shell ('/' and the static assets)", async () => {
    await h.install();
    const staticCache = h.staticCacheName();
    expect(staticCache).toMatch(/^kb-static-/);
    const entries = await h.cacheEntries(staticCache);
    expect(entries).toContain("/");
    expect(entries).toContain("/manifest.json");
    expect(entries).toContain("/icon.svg");
  });

  it("SHELL-1.15-08: offline navigation falls back to cached '/'", async () => {
    await h.install();
    // Now go offline and request a path that wasn't precached.
    h.setFetch(async () => {
      throw new Error("offline");
    });
    const res = await h.navigate("/");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("online"); // served from precache
  });

  it("SHELL-1.15-08: offline navigation to deep route still serves cached '/'", async () => {
    await h.install();
    h.setFetch(async () => {
      throw new Error("offline");
    });
    const res = await h.navigate("/some/deep/route");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("online");
  });

  it("SHELL-1.15-09: hashed asset under /_next/static is cached on first hit and served from cache afterwards", async () => {
    await h.install();
    const networkCalls: string[] = [];
    h.setFetch(async (req) => {
      networkCalls.push(new URL(req.url).pathname);
      return new Response("/* bundle */", {
        status: 200,
        headers: { "content-type": "text/javascript" },
      });
    });
    const path = "/_next/static/chunks/main-abc123.js";
    const first = await h.asset(path);
    expect(first.status).toBe(200);
    // Second hit — should NOT touch the network.
    h.setFetch(async () => {
      throw new Error("network must not be called for cached hashed asset");
    });
    const second = await h.asset(path);
    expect(second.status).toBe(200);
    expect(networkCalls).toEqual([path]);
  });

  it("network-first navigation refreshes the cached '/' on every successful HTML fetch", async () => {
    await h.install();
    h.setFetch(async () => htmlResponse("<html>fresh</html>"));
    const res = await h.navigate("/");
    expect(await res.text()).toBe("<html>fresh</html>");
    // Now go offline; cache should hold the freshest body.
    h.setFetch(async () => {
      throw new Error("offline");
    });
    const offline = await h.navigate("/");
    expect(await offline.text()).toBe("<html>fresh</html>");
  });

  it("preserves the existing /__kb-cache/ vault-content lane (cache-only, 504 when missing)", async () => {
    await h.install();
    h.setFetch(async () => {
      throw new Error("network must not be reached for vault cache lane");
    });
    const res = await h.asset("/__kb-cache/some/note.md");
    expect(res.status).toBe(504);
  });
});
