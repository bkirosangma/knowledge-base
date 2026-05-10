// SHELL-1.15-04: `ServiceWorkerRegister` only calls
// `navigator.serviceWorker.register("/sw.js")` when `NODE_ENV === "production"`.
// Dev mode is a no-op so HMR / Turbopack chunks aren't intercepted by the SW.
//
// The case was originally framed as "needs production-bundle e2e backend".
// That was wrong by the same logic that retired SHELL-1.15-01 / 02 / 03:
// the component's NODE_ENV gate is a runtime branch we can drive with
// `vi.stubEnv("NODE_ENV", ...)` against a mocked `navigator.serviceWorker`.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ServiceWorkerRegister from "./ServiceWorkerRegister";

interface RegisterMock {
  fn: ReturnType<typeof vi.fn>;
  restore: () => void;
}

function mockServiceWorker(): RegisterMock {
  const fn = vi.fn().mockResolvedValue(undefined);
  const original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  Object.defineProperty(navigator, "serviceWorker", {
    value: { register: fn },
    configurable: true,
    writable: true,
  });
  return {
    fn,
    restore: () => {
      if (original) {
        Object.defineProperty(navigator, "serviceWorker", original);
      } else {
        // jsdom doesn't ship navigator.serviceWorker — strip the stub
        // so subsequent tests see the original "missing" shape.
        Reflect.deleteProperty(navigator, "serviceWorker");
      }
    },
  };
}

describe("SHELL-1.15-04: ServiceWorkerRegister NODE_ENV gating", () => {
  let mock: RegisterMock;

  beforeEach(() => {
    mock = mockServiceWorker();
  });

  afterEach(() => {
    mock.restore();
    vi.unstubAllEnvs();
  });

  it("registers /sw.js when NODE_ENV is production", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<ServiceWorkerRegister />);
    expect(mock.fn).toHaveBeenCalledTimes(1);
    expect(mock.fn).toHaveBeenCalledWith("/sw.js");
  });

  it("does NOT register when NODE_ENV is development (HMR-safe)", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<ServiceWorkerRegister />);
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it("does NOT register when NODE_ENV is test", () => {
    vi.stubEnv("NODE_ENV", "test");
    render(<ServiceWorkerRegister />);
    expect(mock.fn).not.toHaveBeenCalled();
  });

  it("prefixes the SW path with NEXT_PUBLIC_BASE_PATH when set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/knowledge-base");
    render(<ServiceWorkerRegister />);
    expect(mock.fn).toHaveBeenCalledWith("/knowledge-base/sw.js");
  });
});
