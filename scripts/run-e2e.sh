#!/usr/bin/env bash
# Boot test_server + next dev side-by-side for Playwright. Used by
# playwright.config.ts's webServer.command. Keeps both processes
# alive until SIGTERM (which Playwright sends on shutdown).
#
# Avoids `concurrently` so we don't pull in another runtime dep.
#
# Locally: `cargo run --bin test_server` cold-compiles in ~30-60s on
# first run, then hot from rust-cache. CI pre-builds the bin in a
# separate step so this `cargo run` is effectively a no-op.

set -euo pipefail

# Test_server (axum :1421). Background. Must be cargo-built before
# this script runs; in CI we pre-build, locally cargo-run is fine.
( cd src-tauri && exec cargo run --bin test_server ) &
TS_PID=$!

# Next dev (:3000). Background.
( exec npm run dev ) &
NEXT_PID=$!

trap 'kill ${TS_PID} ${NEXT_PID} 2>/dev/null; wait' EXIT INT TERM

# Wait on both forever (until trapped).
wait
