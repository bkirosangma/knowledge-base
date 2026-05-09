// e2e/helpers/tempVault.ts
//
// Helper for Playwright specs that need a fresh / fixture-seeded vault
// tempdir. POSTs to test_server's /invoke endpoint directly from node —
// `makeTempVault` is called from the test body (which runs in node, NOT
// the page), so the page-side `__TAURI__` shim doesn't apply here. The
// returned path is consumed by node-side `fs` calls anyway, so a direct
// fetch is the cleanest path.
//
// The returned `cleanup()` is currently a no-op — the Rust impl leaks
// the TempDir guard (see test_support/vault.rs). Callers should still
// `await cleanup()` so a future explicit-destroy command can drop in
// without spec changes.

const TEST_SERVER_URL =
  process.env.KB_TEST_SERVER_URL ?? "http://localhost:1421";

export interface TempVaultHandle {
  path: string;
  cleanup: () => Promise<void>;
}

interface InvokeEnvelope {
  ok: boolean;
  value?: unknown;
  error?: string;
}

async function invokeViaTestServer(cmd: string, args: unknown): Promise<unknown> {
  const res = await fetch(`${TEST_SERVER_URL}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  if (!res.ok) {
    throw new Error(
      `test_server ${res.status} (${cmd}): ${await res.text().catch(() => "<no body>")}`,
    );
  }
  const body = (await res.json()) as InvokeEnvelope;
  if (!body.ok) {
    throw new Error(body.error || `invoke failed: ${cmd}`);
  }
  return body.value;
}

export async function makeTempVault(opts?: {
  fixture?: string;
  initialized?: boolean;
}): Promise<TempVaultHandle> {
  const path = (await invokeViaTestServer("make_temp_vault", {
    fixture: opts?.fixture ?? null,
    initialized: opts?.initialized ?? true,
  })) as string;
  return {
    path,
    cleanup: async () => {
      // Intentional no-op (see Task 1 trade-off note). Reserved shape.
    },
  };
}
