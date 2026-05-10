// e2e/manifest_serving.spec.ts
//
// SHELL-1.15-01: GET /manifest.json returns the PWA manifest document.
//
// The case was originally deferred under the assumption that this needed
// a production-bundle harness. That was wrong: `next dev` already serves
// `public/*` at the root URL (Next App Router conventions), so the
// existing chromium harness can issue an HTTP GET against the dev server
// without any extra wiring. The matching `metadata.manifest` *export*
// invariant is covered by SHELL-1.15-02 in `src/app/layout.test.ts`.

import { test, expect } from "@playwright/test";

test.describe("SHELL-1.15-01 — PWA manifest serves at /manifest.json", () => {
  test("GET /manifest.json returns 200 with the expected JSON shape", async ({ request }) => {
    const res = await request.get("/manifest.json");
    expect(res.status()).toBe(200);

    const body = (await res.json()) as {
      name?: unknown;
      theme_color?: unknown;
      icons?: Array<{ src?: unknown }>;
    };

    // The exact strings live in `public/manifest.json` and intentionally
    // mirror the metadata exported from `src/app/layout.tsx`:
    // `theme_color` matches `viewport.themeColor` (SHELL-1.15-03) and
    // `manifest.icons[0].src` matches `metadata.icons.icon` (`./icon.svg`).
    expect(body.name).toBe("Knowledge Base");
    expect(body.theme_color).toBe("#047857");
    expect(Array.isArray(body.icons)).toBe(true);
    expect(body.icons?.length ?? 0).toBeGreaterThan(0);
    expect(body.icons?.[0]?.src).toBe("./icon.svg");
  });
});
