// e2e/helpers/tempVault.ts
//
// Helper for Playwright specs that need a fresh / fixture-seeded vault
// tempdir. Calls the debug-only `make_temp_vault` Tauri command. The
// returned `cleanup()` is currently a no-op — Task 1 leaks the TempDir
// guard on the Rust side and relies on /tmp reaping. Callers should still
// `await cleanup()` so a future explicit-destroy command can drop in
// without spec changes.
//
// Callers must be running inside a webdriver-driven Tauri context where
// `window.__TAURI__` is wired. In the `nextdev` Playwright fallback
// (Task 11) this helper throws — the fallback specs use the in-process
// FSA mock instead.

import { invoke } from "@tauri-apps/api/core";

export interface TempVaultHandle {
  path: string;
  cleanup: () => Promise<void>;
}

export async function makeTempVault(opts?: {
  fixture?: string;
  initialized?: boolean;
}): Promise<TempVaultHandle> {
  const path = await invoke<string>("make_temp_vault", {
    fixture: opts?.fixture ?? null,
    initialized: opts?.initialized ?? true,
  });
  return {
    path,
    cleanup: async () => {
      // Intentional no-op (see Task 1 trade-off note). Reserved shape.
    },
  };
}
