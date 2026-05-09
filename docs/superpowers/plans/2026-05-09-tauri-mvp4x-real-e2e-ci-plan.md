# MVP-4.x — Real Playwright e2e in CI (no manual smoke) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land an automated end-to-end test pipeline that runs the four MVP-4 proof-set Playwright specs against real Rust commands on every PR push, with no manual smoke gate, no `test.skip(currentBackend() === "nextdev")` escape hatches, and a 3-consecutive-clean-runs stability bar.

**Architecture:** This plan is **decision-driven**. Two short investigation phases (Path 1 = `tauri-plugin-webdriver 0.2.1` source dive; Path 2 = official `tauri-driver`) run first to validate the default landing path. The default — pinned below — is **Path 3 (Option C)**: a custom IPC harness using a new `src-tauri/src/bin/test_server.rs` axum process that re-invokes the production command bodies, paired with a Playwright init-script that monkey-patches `window.__TAURI__.invoke` and `window.__TAURI__.event.listen` to fetch / SSE against `:1421`. Chromium + `next dev` is the runtime. Path 4 (self-hosted macOS runner) is plan-stubbed only — full execution deferred unless the user explicitly funds it.

**Tech Stack:** Rust (Tauri 2.11.1, axum 0.7, tokio 1, tower-http 0.5, serde, serde_json, eventsource bridge via SSE), TypeScript (Playwright 1.x, Next.js 15 / React 19), CI on Ubuntu 22.04 (chromium-only — no GTK / WebKitGTK / xvfb / dbus / AT-SPI).

> **Branch:** `feat/tauri-mvp4x-real-e2e-ci` (cut from `main` at `072f807` after MVP-4 / PR #157 merged; the handoff-doc bump is the only uncommitted change on the branch when this plan lands).
> **Spec reference:** `docs/superpowers/specs/2026-05-07-tauri-claude-integration-design.md` § 9 (testing strategy parent).
> **Format template:** `docs/superpowers/plans/2026-05-09-tauri-mvp4-test-infra-plan.md` (the just-merged MVP-4 plan).
> **Owner:** Single-PR ship. Subagent-driven execution (default per MEMORY.md). Each phase is one-or-more commits on this branch; the PR is opened only after Phase 4's stability gate passes.

---

## Scope decisions pinned (do not relitigate mid-MVP)

These four were debated, decided in the plan-writing brief, and are restated here so reviewers do not re-open them mid-execution. If you think one is wrong, raise it in the PR description — do not silently change the plan.

1. **Default landing path: Path 3 (Option C) — custom IPC harness.** Investigation phases 1 + 2 run first to validate this is the right call. If Path 1 (plugin fix) or Path 2 (`tauri-driver`) lands `:4444` reliably in Ubuntu CI inside Phase 1's or Phase 2's time-box, jump to the matching implementation sub-section in Phase 3. Otherwise — and this is what we expect — proceed with Path 3.
2. **If Path 3 wins: real subprocess proxy, NOT pure mock.** The test_server re-uses the production command bodies (refactored to `pub async fn impl_*` — see Task 3.C.1 mechanism note). A pure-mock invoke shim duplicates the existing Vitest+bridge contract layer (`tauriBridge.test.ts` already covers all 30 wrapper signatures) and gives nothing new. The whole point of this MVP is exercising real Rust behaviour through a single end-to-end pipeline.
3. **CI backend selection: Ubuntu primary, macOS unchanged.** The new e2e job lives on `ubuntu-22.04` (chromium-only — no GTK system deps, no xvfb). The existing `tauri-build` macOS job stays as-is — it is the macOS compile-clean quality gate, never an e2e gate. macOS e2e fidelity is deferred indefinitely (Path 4 territory).
4. **If Path 3 wins: drop `tauri-plugin-webdriver` dep entirely.** Saves ~200KB binary size + ~30s compile time per CI run. The `webServer.url: 'http://localhost:4444/status'` probe and the `webdriver`/`nextdev` switch in `playwright.config.ts` go with it. The new probe is `webServer.url: 'http://localhost:1421/health'` (test_server's health endpoint).

---

## Out of scope (anti-goals — lift verbatim into PR description)

- **WKWebView visual-regression / screenshot diffs.** The whole MVP runs in chromium under Path 3; WKWebView fidelity is a known accepted gap. Escalate only if a chromium-vs-WKWebView UI bug ships to users.
- **Cross-platform e2e (Windows).** Linux primary; macOS quality-gate via `tauri-build`. Windows is out of the entire Tauri-Claude-Integration scope.
- **Performance benchmarks.** No e2e-tier perf assertions. Cold-start budget (≤10 min e2e job, ≤2 min warm) is operational, not test-asserted.
- **The 5 pre-MVP-4 clippy lints.** They predate this MVP; their own follow-up (no ticket yet — see PR #157 for the list at `cargo clippy --all-targets`).
- **Self-hosted macOS runner (Path 4).** Plan-stubbed in Phase 3.D for completeness; full execution deferred until/unless the user funds the runner AND WKWebView coverage becomes non-negotiable.
- **Migrating the 40+ legacy `e2e/*.spec.ts` specs** that still rely on the FSA `e2e/fixtures/fsMock.ts`. They were left in repo as artifacts during MVP-4; bringing them onto Path 3 is MVP-5 sweep work, not MVP-4.x scope. The 4 proof-set specs are the contract for this MVP.
- **`KB_E2E_BACKEND` env var.** Removed entirely under Path 3 (only one backend exists post-MVP-4.x). If Path 1 or Path 2 lands instead, the variable can survive — flagged in those sub-sections.

---

## File map (what changes — assuming Path 3 lands)

### Added (Rust)

- `src-tauri/src/bin/test_server.rs` — new `[[bin]]` target. Axum HTTP server on `:1421` exposing `POST /invoke` (command dispatch), `GET /events` (SSE stream re-emitting Tauri events), `GET /health` (readiness probe).
- `src-tauri/src/test_server/` (module, used by the bin) — split for testability:
  - `src-tauri/src/test_server/mod.rs` — re-exports + `TestServerState` struct.
  - `src-tauri/src/test_server/router.rs` — axum router builder.
  - `src-tauri/src/test_server/dispatch.rs` — the `match cmd { "vault_set_root" => ..., ... }` dispatcher that calls `impl_*` functions.
  - `src-tauri/src/test_server/events.rs` — SSE channel; broadcasts `vault_change` and (future) other events to connected clients.

### Modified (Rust)

- `src-tauri/Cargo.toml` — add `axum = "0.7"`, `tower-http = { version = "0.5", features = ["cors"] }`, `futures = "0.3"` (for SSE stream); add `[[bin]] name = "test_server" path = "src/bin/test_server.rs"`; **remove** `tauri-plugin-webdriver = "0.2"` (Decision 4).
- `src-tauri/src/lib.rs` — `#[cfg(debug_assertions)] pub mod test_server;` (mirror the `test_support` gating pattern).
- `src-tauri/src/main.rs` — **remove** the `#[cfg(debug_assertions)] { builder = builder.plugin(tauri_plugin_webdriver::init()); }` block + the `mut` binding on `builder` (revert to immutable). Production `main.rs` shrinks back to one straight-line `Builder::default().plugin(...).plugin(...).manage(...)...build()`.
- `src-tauri/src/vault/commands.rs` — refactor each `#[tauri::command] pub async fn vault_xxx` into a thin wrapper around `pub async fn impl_vault_xxx(state: &VaultState, ...)`. The `#[tauri::command]` wrapper does `state.inner()` extraction, then calls the impl. Same pattern for `term/commands.rs`, `settings/commands.rs`, `claude/commands.rs`, `skill/commands.rs`. The impl fns take `&Arc<...>` so test_server can hold long-lived state. (See Task 3.C.1 for mechanism rationale.)
- `src-tauri/src/test_support/vault.rs` — no functional change; the `make_temp_vault` `#[tauri::command]` is mirrored as a plain `pub async fn` so test_server can dispatch it. (`make_temp_vault` is debug-only on both sides.)

### Added (frontend)

- `e2e/helpers/tauriShim.ts` — exports `INIT_SCRIPT` (string) and `installTauriShim(page)` (helper). The init-script monkey-patches `window.__TAURI__` + `window.__TAURI_INTERNALS__` (Tauri's actual internal namespace; see existing `FileWatcherContext.tsx` comment) so `invoke()` and `listen()` round-trip to `http://localhost:1421` over `fetch` / `EventSource`.
- `scripts/run-e2e.sh` — bash launcher that boots `cargo run --bin test_server` AND `next dev` AND waits for both readiness probes. Used by `playwright.config.ts`'s `webServer.command`. Avoids `concurrently` so we don't add a runtime dep.

### Modified (frontend)

- `playwright.config.ts` — flatten to one project, `webServer.command: 'bash scripts/run-e2e.sh'`, `webServer.url: 'http://localhost:1421/health'`, drop the 180s timeout (test_server cold-start is ~5s — 60s default suffices), drop the `KB_E2E_BACKEND` switch.
- `e2e/helpers/launchApp.ts` — `currentBackend()` removed; `setVaultPath()` keeps the same signature but now calls the shimmed `window.__TAURI__.invoke('vault_set_root', { path })` (which round-trips to test_server). Add a new exported `installShim(page: Page): Promise<void>` that calls `page.addInitScript({ content: INIT_SCRIPT })` exactly once per spec.
- `e2e/vault_picker.spec.ts`, `e2e/uninitialized_splash.spec.ts`, `e2e/document_create.spec.ts`, `e2e/rename_propagation.spec.ts` — remove the `test.skip(currentBackend() === "nextdev", ...)` line at the top of each. Add `await installShim(page);` as the first step in each `test(...)` body (or wire via a `test.beforeEach` in each file). No assertion changes.
- `e2e/helpers/tempVault.ts` — no change. Already calls `invoke('make_temp_vault', { ... })` which the shim transparently routes through test_server.

### Added (CI)

- `.github/workflows/ci.yml` — new `e2e` job (Ubuntu 22.04, chromium-only). Runs after `checks` + `build` complete (it depends on neither but should not block their fast feedback). No GTK / WebKitGTK / xvfb / dbus / AT-SPI deps.

### Modified (docs)

- `Features.md` — § 0 deferred line trimmed: remove the `tauri-plugin-webdriver` mention; replace with a one-line "MVP-4.x e2e harness uses test_server (axum) + chromium" entry under the testing-infrastructure subsystem block.
- `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` — already bumped on this branch's seed commit; will be re-bumped at PR-merge time per the post-merge cleanup protocol (Phase 5).

### Deleted (Path 3 only)

- `tauri-plugin-webdriver` dep (Cargo.toml + transitive Cargo.lock entries; ~200KB).

---

## Bootstrap (read-only)

Run before Phase 0 to confirm baseline. Do NOT commit any output.

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use                                # match .nvmrc (currently 24)
npm ci                                 # match lockfile (NOT npm install)
npm run typecheck                      # baseline green
npm run lint                           # baseline green
npm run test:run                       # baseline green (~942 Vitest cases)
cd src-tauri && cargo fmt --check && cargo clippy && cargo test
# Expected: clippy green; 87 cargo tests pass on Ubuntu / 86 on macOS
# (watcher_rename_paired is `#[cfg(target_os = "linux")]`-gated).
cd ..
git status                             # confirm only the handoff-doc edit is uncommitted
git log --oneline -3                   # confirm 072f807 (MVP-4) is HEAD~1 or HEAD
git branch -vv | grep mvp4x            # confirm we are on feat/tauri-mvp4x-real-e2e-ci
which claude                           # ensure claude CLI on PATH for Phase 3 stability
ls e2e/{vault_picker,uninitialized_splash,document_create,rename_propagation}.spec.ts
ls e2e/helpers/{launchApp,tempVault}.ts
ls src-tauri/src/test_support/{mod,vault}.rs
gh run list --workflow=ci.yml --limit 1   # confirm 5-job CI is green on main
```

---

## Phase 0 — Setup

**Goal:** Confirm branch baseline and that the existing 5-job CI passes locally before any e2e work begins. No commits in this phase — it is bookkeeping.

### Task 0.1: Verify baseline

**Files:** none modified.

- [ ] **Step 1: Run the bootstrap block above end-to-end**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
nvm use && npm ci
npm run typecheck && npm run lint && npm run test:run
(cd src-tauri && cargo fmt --check && cargo clippy && cargo test)
```

Expected: every command green. If any is red, **STOP** — fix the baseline before writing a line of MVP-4.x code. Open an issue if the failure is unrelated to MVP-4.x scope.

- [ ] **Step 2: Confirm the 4 proof-set specs are skipped today**

```bash
KB_E2E_BACKEND=nextdev npx playwright test e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts --reporter=line 2>&1 | tail -20
```

Expected: `4 skipped` (one per spec). This documents the starting point — MVP-4.x's win condition is `4 passed` against real Rust commands.

- [ ] **Step 3: No commit.** Phase 0 is read-only. Move to Phase 1.

---

## Phase 1 — Investigation: `tauri-plugin-webdriver 0.2.1` source dive (Day 1)

**Goal:** Read the plugin source to determine whether the `:4444` silent-bind failure has a fix we missed (setup callback / capability / feature flag / explicit bind config). Time-box: **4 hours focused work.** If no fix surfaces in the time-box, exit to Phase 2.

**Decision gate at end of phase:** Did the `:4444` port bind locally on Ubuntu 22.04 (in a fresh Docker container or VM matching CI's `ubuntu-22.04` runner image) AND survive a `curl -sf http://localhost:4444/status` probe? If **yes** → jump to Phase 3.A (Path 1 implementation). If **no** → Phase 2.

### Task 1.1: Locate the plugin GitHub repo

**Files:** none modified (read-only research).

- [ ] **Step 1: Find the plugin's source repository URL**

The plugin is `tauri-plugin-webdriver 0.2.1` (Choochmeque). crates.io carries a `Repository` link in the metadata. Confirm:

```bash
curl -sf https://crates.io/api/v1/crates/tauri-plugin-webdriver/0.2.1 | python3 -m json.tool | grep -E '"repository"|"homepage"|"documentation"'
```

Expected output includes the GitHub repo URL. Record it as `PLUGIN_REPO` in your local notes (do NOT commit this value).

- [ ] **Step 2: Clone the source**

```bash
mkdir -p /tmp/mvp4x-investigation
cd /tmp/mvp4x-investigation
gh repo clone "$PLUGIN_REPO" tauri-plugin-webdriver
cd tauri-plugin-webdriver
git checkout v0.2.1 || git checkout 0.2.1  # whichever tag form the maintainer uses
```

If neither tag form exists, fall back to `git log --oneline | head -20` and find the commit that bumped Cargo.toml's version to `0.2.1`. Record the commit SHA.

- [ ] **Step 3: Tree the source — confirm the structure**

```bash
ls src/
# Expected: lib.rs at minimum. Possibly server.rs / commands.rs / handlers.rs.
wc -l src/*.rs
```

Record the entry-point file name and line count.

### Task 1.2: Locate the bind call

**Files:** none modified (read-only research).

- [ ] **Step 1: Grep for the bind site**

```bash
cd /tmp/mvp4x-investigation/tauri-plugin-webdriver
grep -rn "TcpListener\|axum::serve\|tokio::net::bind\|0\.0\.0\.0\|127\.0\.0\.1\|:4444\|bind(" src/
```

Expected: 1-3 hits identifying where the axum HTTP server starts. Read those lines plus 30 lines above and below.

- [ ] **Step 2: Trace the call path from `init()`**

```bash
grep -n "pub fn init\|fn init(" src/lib.rs
```

Read `init()`'s body. Note specifically:
- Does it spawn a tokio task? (If yes, is the spawn `tauri::async_runtime::spawn` or `tokio::spawn`? Mismatched runtimes silently fail.)
- Does it expect a setup callback? (e.g. `tauri::Builder::default().plugin(tauri_plugin_webdriver::init().bind("0.0.0.0:4444"))` or similar builder pattern?)
- Are there capability declarations (`tauri.conf.json` `capabilities` array entries) it expects to find?
- Are there feature flags? (`grep "features" Cargo.toml` in the plugin repo.)

Record findings as a 3-bullet "what I found" note.

- [ ] **Step 3: Cross-reference against our usage**

Our usage in `src-tauri/src/main.rs` (HEAD~1 of MVP-4) is:

```rust
#[cfg(debug_assertions)]
{
    builder = builder.plugin(tauri_plugin_webdriver::init());
}
```

If the plugin source shows `init()` requires further configuration (a builder, a `.bind()`, a capability), THAT is the fix candidate.

### Task 1.3: Try `RUST_LOG` trace locally

**Files:** none modified (diagnostic only).

- [ ] **Step 1: Enable trace logging in `tauri:dev`**

Even before applying any source-derived fix, run:

```bash
cd "/Users/kiro/My Projects/knowledge-base"
RUST_LOG=tauri_plugin_webdriver=trace,tauri=debug RUST_LOG_STYLE=never npm run tauri:dev 2>&1 | tee /tmp/mvp4x-tauri-dev.log &
APP_PID=$!
sleep 30                                # Cold-start
curl -sf http://localhost:4444/status -m 5 && echo "BIND OK" || echo "BIND FAILED"
kill $APP_PID 2>/dev/null
grep -E "tauri_plugin_webdriver|webdriver|axum|bind|listen" /tmp/mvp4x-tauri-dev.log | head -40
```

Three possible outcomes:

1. `BIND OK` + log lines show successful bind. Path 1 quietly works on local Ubuntu — try CI next (skip to Step 3 below).
2. `BIND FAILED` + log lines show an actual error (e.g. `Address already in use`, `Permission denied`, `feature not enabled`). That error is the fix lead.
3. `BIND FAILED` + zero log lines from the plugin (the original symptom). Plugin is silently dropping its task. Path 1 dead end.

- [ ] **Step 2: If outcome 2, apply the fix and re-test**

If you found a fix, edit `src-tauri/src/main.rs` to apply it (e.g. add a `.bind()` call, add a capability, enable a feature flag in `Cargo.toml`). Re-run Step 1's command sequence. If `BIND OK` results, commit the fix and proceed to **Phase 3.A (Path 1)**.

- [ ] **Step 3: If outcome 1, validate against CI's Ubuntu image**

```bash
docker run --rm -it -v "$(pwd):/work" -w /work ubuntu:22.04 bash -c '
  apt-get update && apt-get install -y curl ca-certificates build-essential pkg-config libssl-dev \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libxdo-dev \
    nodejs npm xvfb dbus-x11 at-spi2-core
  npm ci
  xvfb-run -a env RUST_LOG=tauri_plugin_webdriver=trace npm run tauri:dev &
  sleep 60
  curl -sf http://localhost:4444/status -m 5 && echo "CI-IMAGE BIND OK" || echo "CI-IMAGE BIND FAILED"
'
```

This is the CI environment. If the bind succeeds here too, Path 1 is real — go to **Phase 3.A**. If it fails despite working on the host, the host environment was forgiving in a way CI is not — note the gap and proceed to Phase 2.

### Task 1.4: Phase 1 decision gate

**Files:** none modified.

- [ ] **Step 1: Document the outcome in a phase-summary commit on the branch**

Append a one-paragraph "Phase 1 outcome" block to `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md` under the existing MVP-4.x diagnostic dump. State: which path the plugin source pointed at; whether the local fix attempt worked; whether CI-image reproduction confirmed it. Commit:

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "$(cat <<'EOF'
docs(handoff): MVP-4.x Phase 1 outcome — webdriver-plugin source-dive notes

[fill in actual findings: 2-4 sentences. e.g. "Plugin's init() spawns
the axum task on tokio's runtime, but Tauri 2.11 routes plugin tasks
through tauri::async_runtime — runtime mismatch causes silent drop.
Fix attempt with tauri::async_runtime::spawn applied locally; bind
succeeds on host but not in the Ubuntu CI image. Proceeding to Phase 2."]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Branch decision**

If Phase 1 produced a verified fix that works in the CI Ubuntu image: **jump to Phase 3.A.**
Otherwise: **proceed to Phase 2.**

---

## Phase 2 — Investigation: official `tauri-driver` (Day 1-2)

**Goal:** Evaluate whether the Tauri team's first-party test runner (`tauri-driver`) supersedes the third-party plugin and works in our CI configuration. Time-box: **4 hours focused work.** If neither outcome is "binds reliably in CI Ubuntu", exit to Phase 3.C.

**Decision gate at end of phase:** Does `tauri-driver` start a WebDriver session that Playwright can connect to in the CI Ubuntu image? If **yes** → Phase 3.B (Path 2 implementation). If **no** → Phase 3.C (Path 3, default).

### Task 2.1: Read the `tauri-driver` docs + source

**Files:** none modified (read-only research).

- [ ] **Step 1: Pull docs**

```bash
mkdir -p /tmp/mvp4x-investigation
cd /tmp/mvp4x-investigation
gh repo clone tauri-apps/tauri tauri-upstream
cd tauri-upstream
ls -la tooling/ 2>/dev/null || find . -name "tauri-driver*" -type d
```

`tauri-driver` either lives at `tooling/cli/tauri-driver/` or as its own crate at the top level. Read its `README.md` and `Cargo.toml`. Record:
- Status badge (alpha / beta / stable per platform).
- Required `tauri.conf.json` config (anything beyond what we ship today?).
- Platform support matrix: macOS / Linux / Windows.
- Whether it depends on a system-level driver binary (`msedgedriver`, `WebKitWebDriver`) — if yes, that becomes a CI install step.

- [ ] **Step 2: Cross-reference against our Tauri version**

Confirm `tauri-driver` is compatible with our pinned `tauri = "2"` (resolves to 2.11.1). The crate's MSRV / Tauri-version-bound is in its Cargo.toml.

### Task 2.2: Try `tauri-driver` locally on Ubuntu

**Files:** none modified during investigation; if it works, files modified land under Phase 3.B.

- [ ] **Step 1: Install on a host Ubuntu 22.04 (Docker)**

```bash
docker run --rm -it -v "$(pwd):/work" -w /work ubuntu:22.04 bash -c '
  apt-get update && apt-get install -y curl ca-certificates build-essential pkg-config libssl-dev \
    libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libxdo-dev \
    libwebkit2gtk-driver webkit2gtk-driver nodejs npm xvfb dbus-x11 at-spi2-core
  cargo install tauri-driver
  npm ci
  xvfb-run -a tauri-driver &
  sleep 10
  curl -sf http://localhost:4444/status -m 5 && echo "DRIVER OK" || echo "DRIVER FAILED"
'
```

Note: the WebKit2 driver package name in apt may be `webkit2gtk-4.1-driver` or `libwebkit2gtk-4.1-0-driver` — adjust per `apt-cache search webkit.*driver`.

- [ ] **Step 2: Drive a Playwright spec through it (smoke)**

If Step 1 shows `DRIVER OK`, write a one-line Playwright smoke that calls `await page.goto("http://localhost:1420")` against the running tauri-driver session. Confirm Playwright lands the spec.

If Step 1 shows `DRIVER FAILED`, exit to Phase 3.C.

### Task 2.3: Phase 2 decision gate

**Files:** none modified.

- [ ] **Step 1: Document the outcome**

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
# Append a "Phase 2 outcome" paragraph to the same diagnostic block as Phase 1.
git commit -m "$(cat <<'EOF'
docs(handoff): MVP-4.x Phase 2 outcome — tauri-driver evaluation

[fill in actual findings: 2-4 sentences. e.g. "tauri-driver 0.1.4
requires libwebkit2gtk-4.1-driver. Installs cleanly. Bind succeeds on
host Ubuntu 22.04. Playwright smoke connects but does not see a window
in xvfb headless mode (known limitation per docs). Proceeding to
Phase 3.C — Path 3."]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Branch decision**

If Phase 2 produced a verified driver that works in CI Ubuntu image AND drives Playwright successfully: **jump to Phase 3.B.**
Otherwise: **proceed to Phase 3.C** (the default).

---

## Phase 3 — Implementation (Day 2-3, path-dependent)

**Three sub-sections, mutually exclusive.** Execute exactly one. Phase 4 is the same regardless of which path landed.

---

### Phase 3.A — Path 1: webdriver plugin fix (best case)

**Only reach this if Phase 1 produced a verified fix.** Tasks here are the minimal land for that fix.

#### Task 3.A.1: Apply the fix to `src-tauri/src/main.rs` (or `Cargo.toml`)

**Files:**
- Modify: `src-tauri/src/main.rs` (and/or `src-tauri/Cargo.toml` if a feature flag is involved)

- [ ] **Step 1: Apply the change identified in Phase 1**

Concrete forms this might take:

```rust
// Form A — explicit bind
#[cfg(debug_assertions)]
{
    builder = builder.plugin(
        tauri_plugin_webdriver::Builder::new()
            .bind("0.0.0.0:4444")
            .build(),
    );
}
```

```toml
# Form B — feature flag
tauri-plugin-webdriver = { version = "0.2", features = ["custom-runtime"] }
```

```rust
// Form C — runtime alignment
#[cfg(debug_assertions)]
{
    tauri::async_runtime::spawn(async move {
        tauri_plugin_webdriver::run().await;
    });
}
```

Apply whichever Phase 1 validated.

- [ ] **Step 2: Verify**

```bash
cd src-tauri && cargo build && cd ..
RUST_LOG=tauri_plugin_webdriver=trace npm run tauri:dev &
sleep 30
curl -sf http://localhost:4444/status && echo "OK"
kill %1
```

Expected: `OK`. If not, you misidentified the fix — return to Phase 1.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "$(cat <<'EOF'
fix(tauri): tauri-plugin-webdriver bind config (mvp-4.x phase 3.a)

[describe the actual fix: what was wrong, what changed, why this binds
:4444 reliably under Ubuntu CI.]

Phase 1 source dive identified [root cause]; this is the minimal fix
that makes the WebDriver port reachable. Removes the 4-config silent
bind failure documented in the handoff diagnostic dump.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.A.2: Restore the e2e job in CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Port the e2e job from commit `ad26115`**

```bash
git show ad26115:.github/workflows/ci.yml > /tmp/ad26115-ci.yml
# Locate the `e2e:` job. Copy it into the current ci.yml at the same
# position. Update env: KB_E2E_BACKEND=webdriver. Set runs-on: ubuntu-22.04.
# Add the system deps from rust-checks job (libwebkit2gtk-4.1-dev,
# libgtk-3-dev, etc.) plus xvfb + dbus-x11 + at-spi2-core (from the
# 25603901628 attempt). Keep the playwright-report upload-artifact step.
```

The new job must NOT depend on the `rust-checks` job — runs in parallel with the existing 4 jobs.

- [ ] **Step 2: Verify locally with `act`**

```bash
act -j e2e --container-architecture linux/amd64 -P ubuntu-22.04=catthehacker/ubuntu:act-22.04
```

Optional but recommended. If `act` is unavailable, push the branch and inspect the GH Actions run.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): restore e2e job on ubuntu-22.04 with webdriver backend (mvp-4.x phase 3.a)"
```

#### Task 3.A.3: Remove skip gates from the 4 proof-set specs

**Files:**
- Modify: `e2e/vault_picker.spec.ts`
- Modify: `e2e/uninitialized_splash.spec.ts`
- Modify: `e2e/document_create.spec.ts`
- Modify: `e2e/rename_propagation.spec.ts`

- [ ] **Step 1: Remove the line `test.skip(currentBackend() === "nextdev", ...);` from each file**

The line currently appears as the first statement inside each `test.describe(...)` block. Delete it. The `currentBackend` import becomes unused — remove it from the import line as well, leaving only `setVaultPath` from `./helpers/launchApp`.

- [ ] **Step 2: Run the 4 specs locally**

```bash
KB_E2E_BACKEND=webdriver npm run test:e2e -- e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts
# Expected: 4 passed.
```

- [ ] **Step 3: Commit**

```bash
git add e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts
git commit -m "test(e2e): remove nextdev skip gates from 4 proof-set specs (mvp-4.x phase 3.a)"
```

After Phase 3.A: jump to **Phase 4**.

---

### Phase 3.B — Path 2: official `tauri-driver` adoption

**Only reach this if Phase 2 produced a verified working driver.** Replaces `tauri-plugin-webdriver` with `tauri-driver`.

#### Task 3.B.1: Swap the dep + remove plugin registration

**Files:**
- Modify: `src-tauri/Cargo.toml` (remove `tauri-plugin-webdriver`, add nothing — `tauri-driver` is a dev-tool installed via `cargo install`, not a crate dep)
- Modify: `src-tauri/src/main.rs` (remove the `#[cfg(debug_assertions)] { builder.plugin(tauri_plugin_webdriver::init()); }` block; revert `let mut builder` → `let builder` if no other mutations remain)

- [ ] **Step 1: Edit Cargo.toml**

Remove the line `tauri-plugin-webdriver = "0.2"` from `[dependencies]`. Run `cd src-tauri && cargo build` to confirm the unused-dep removal lands cleanly.

- [ ] **Step 2: Edit main.rs**

Delete the `#[cfg(debug_assertions)] { builder = builder.plugin(...); }` block (currently lines 22-28). Also revert the `let mut builder = ...` to `let builder = ...` if no other mutation site remains. Remove the `#[cfg_attr(not(debug_assertions), allow(unused_mut))]` attribute on the binding.

- [ ] **Step 3: Verify build**

```bash
cd src-tauri && cargo build && cargo build --release && cd ..
```

Expected: clean compile both modes. Release binary should be ~200KB smaller.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs
git commit -m "chore(tauri): drop tauri-plugin-webdriver in favour of tauri-driver (mvp-4.x phase 3.b)"
```

#### Task 3.B.2: Update `playwright.config.ts`

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Wire the new webServer command**

`tauri-driver` provides its own startup story. Replace the existing config with whatever the Phase 2 docs prescribed — typically:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4444',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'tauri-driver', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'tauri-driver',     // boots driver + tauri webview
    url: 'http://localhost:4444/status',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

Adjust per Phase 2's findings. The `KB_E2E_BACKEND` switch is removed entirely.

- [ ] **Step 2: Update `e2e/helpers/launchApp.ts`**

Remove `currentBackend()`. `setVaultPath()` keeps its body but loses the conditional — single backend, single code path.

- [ ] **Step 3: Verify locally**

```bash
npm run test:e2e -- e2e/vault_picker.spec.ts
# Expected: 1 passed.
```

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/helpers/launchApp.ts
git commit -m "chore(e2e): rewire playwright config for tauri-driver (mvp-4.x phase 3.b)"
```

#### Task 3.B.3: Restore CI e2e job + remove skip gates

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `e2e/vault_picker.spec.ts`, `e2e/uninitialized_splash.spec.ts`, `e2e/document_create.spec.ts`, `e2e/rename_propagation.spec.ts`

- [ ] **Step 1: Add the e2e job to ci.yml**

Same shape as Phase 3.A.2's port from `ad26115`, except the system-deps install line includes `webkit2gtk-driver` (or whatever package Phase 2 identified) and the run step is `cargo install tauri-driver && xvfb-run -a npm run test:e2e`.

- [ ] **Step 2: Remove `test.skip` lines from the 4 proof-set specs**

Same as Phase 3.A.3.

- [ ] **Step 3: Verify + commit**

```bash
git add .github/workflows/ci.yml e2e/*.spec.ts
git commit -m "ci(e2e): restore e2e job under tauri-driver; drop skip gates (mvp-4.x phase 3.b)"
```

After Phase 3.B: jump to **Phase 4**.

---

### Phase 3.C — Path 3 (DEFAULT): Option C custom IPC harness

**This is the path the brief expects to land.** Phase 1 + Phase 2 are validation gates; if they fail (or if you skipped them under explicit user direction), execute every task below.

**Mechanism note for Task 3.C.1 — `#[tauri::command]` reuse strategy:** Production commands like `vault_set_root` take `tauri::State<'_, VaultState>` which only the `tauri::generate_handler!` macro can wire up. Axum cannot pass that. The fix is the **inner-impl pattern**: split each command into two layers.

```rust
// src-tauri/src/vault/commands.rs

// Inner impl: takes plain Arc<Vault>, callable from anywhere.
pub async fn impl_vault_set_root(vault: &VaultState, path: String) -> Result<(), VaultError> {
    // ... existing body, but operating on `vault: &VaultState` instead of `state: State<...>`.
}

// Tauri wrapper: thin adapter the Tauri runtime resolves.
#[tauri::command]
pub async fn vault_set_root(path: String, state: State<'_, VaultState>) -> Result<(), VaultError> {
    impl_vault_set_root(&state, path).await
}
```

The test_server holds an `Arc<VaultState>` (a clone of what `main.rs` passes to `.manage(...)`) and calls `impl_vault_set_root(&state, path)` directly. **This is not a refactor**: the public Tauri command surface is byte-identical from the frontend's perspective; only the internal call topology grows a layer. All 30 production commands get the same treatment in Task 3.C.1.

**Mechanism note for Task 3.C.2 — init-script timing:** Tauri's `@tauri-apps/api/core` reads `window.__TAURI_INTERNALS__` at module-eval time (the bundler emits a static reference). Playwright's `page.addInitScript` runs **before** any page script. If the shim is registered via `page.addInitScript` (or Playwright's `use.contextOptions.bypassCSP: true` + a context-level init-script), the shim is in place before `core.ts` resolves. If we merely `page.evaluate()` after `page.goto()`, the bundle has already cached the missing `__TAURI_INTERNALS__` and bridge calls throw. **Conclusion: the shim is registered at the Playwright context level, not per-test.** See Task 3.C.2 Step 1.

**Mechanism note — events vs invoke:** The frontend uses `listen("vault_change", ...)` (Tauri's event API) in `FileWatcherContext.tsx` to refresh the explorer tree on filesystem changes. A pure `fetch()`-only shim covers `invoke` but not `listen`. For the 4 proof-set specs:
- `vault_picker` and `uninitialized_splash` mount the explorer tree from `useFileExplorer.refresh()` — triggered explicitly after `setVaultPath` in the spec, no listen() dependency.
- `document_create` waits for `untitled.md` to appear in the tree; the tree updates when `useFileExplorer.refresh()` runs as a side-effect of the `createDocument` call (frontend re-lists after writing). The `vault_change` listen() is decorative for this spec.
- `rename_propagation` invokes `propagateRename` directly from the frontend rename handler in `knowledgeBase.tsx:466` — the `vault_change` listen() does NOT drive the rewrite. The rewrite happens through synchronous `vault_write_text` calls from `propagateRename`. The on-disk assertion (`b.md` contains `[[c]]`) holds without any listen() coverage.

**Therefore:** the shim must implement `listen()` as a no-op-but-not-error stub for tree-render correctness, and a real SSE channel can be deferred. Task 3.C.2's shim returns a no-op `unlisten` function from `listen()`. If a future spec needs real event delivery, Task 3.C.4 adds the `/events` SSE endpoint and the shim is upgraded — it's wired but currently consumes nothing.

#### Task 3.C.1: `test_server` Cargo bin + module + impl-fn refactor

**Goal:** Land the new `test_server` axum binary that re-uses production command bodies. This is the largest task in the plan; it's intentionally one task because the refactor is a single atomic surface.

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `axum = "0.7"`, `tower-http = { version = "0.5", features = ["cors"] }`, `futures = "0.3"`; add `[[bin]] name = "test_server" path = "src/bin/test_server.rs"`)
- Modify: `src-tauri/src/lib.rs` (add `#[cfg(debug_assertions)] pub mod test_server;`)
- Create: `src-tauri/src/test_server/mod.rs`
- Create: `src-tauri/src/test_server/router.rs`
- Create: `src-tauri/src/test_server/dispatch.rs`
- Create: `src-tauri/src/test_server/events.rs`
- Create: `src-tauri/src/bin/test_server.rs`
- Modify: `src-tauri/src/vault/commands.rs` (split each `#[tauri::command]` into impl-fn + thin wrapper — 14 commands)
- Modify: `src-tauri/src/term/commands.rs` (split — 4 commands)
- Modify: `src-tauri/src/settings/commands.rs` (split — 2 commands)
- Modify: `src-tauri/src/claude/commands.rs` (split — 4 commands; the test_server stub-mode bypasses `claude` CLI entirely, see Step 5)
- Modify: `src-tauri/src/skill/commands.rs` (split — 2 commands)
- Modify: `src-tauri/src/test_support/vault.rs` (mirror `make_temp_vault` as `pub async fn make_temp_vault_impl(...)`; thin `#[tauri::command]` wrapper stays for the live Tauri app)

##### Step 1 — Add deps to Cargo.toml

- [ ] **Step 1.1: Edit `src-tauri/Cargo.toml`**

In `[dependencies]`, append (alphabetically):

```toml
axum = "0.7"
futures = "0.3"
tower-http = { version = "0.5", features = ["cors"] }
```

Add a new `[[bin]]` block after the existing `knowledge-base` bin:

```toml
[[bin]]
name = "test_server"
path = "src/bin/test_server.rs"
required-features = []          # debug-only via cfg gate at build time; not a real feature
```

Remove the line `tauri-plugin-webdriver = "0.2"` (Decision 4).

- [ ] **Step 1.2: Verify**

```bash
cd src-tauri && cargo check
# Expected: clean. Warning about unused import of tauri_plugin_webdriver if any
# straggler import exists — fix it as part of Step 4.
```

##### Step 2 — Refactor production commands into impl-fns

This is the bulk of the task. Pattern shown for one command; apply to all 26.

- [ ] **Step 2.1: Refactor `vault_set_root` in `src-tauri/src/vault/commands.rs`**

Before:

```rust
#[tauri::command]
pub async fn vault_set_root(path: String, state: State<'_, VaultState>) -> Result<(), VaultError> {
    // ... existing body using state.inner() etc. ...
}
```

After:

```rust
pub async fn impl_vault_set_root(state: &VaultState, path: String) -> Result<(), VaultError> {
    // ... existing body, with `state` (passed by ref) replacing `state.inner()` calls. ...
}

#[tauri::command]
pub async fn vault_set_root(path: String, state: State<'_, VaultState>) -> Result<(), VaultError> {
    impl_vault_set_root(state.inner(), path).await
}
```

The `state.inner()` call now happens once at the wrapper boundary, returning `&Arc<Vault>` (== `&VaultState`).

- [ ] **Step 2.2: Repeat for the other 13 vault commands**

`vault_pick`, `vault_read_text`, `vault_write_text`, `vault_read_json`, `vault_write_json`, `vault_list`, `vault_rename`, `vault_delete`, `vault_exists`, `vault_read_bytes`, `vault_write_bytes`, `vault_watch_start`, `vault_watch_stop`. Same pattern. The `impl_vault_watch_start` impl needs `&AppHandle` parameter — the test_server's startup will pass a stub `AppHandle` from a `tauri::test::mock_app()` instance (see Step 4 Sub-step 4.3).

- [ ] **Step 2.3: Repeat for `term/commands.rs`** — `term_open`, `term_write`, `term_resize`, `term_close`. Each takes `&TermState` after refactor. `term_open` also needs `&AppHandle` for event emission — same mock-app strategy.

- [ ] **Step 2.4: Repeat for `settings/commands.rs`** — `settings_read`, `settings_write`. Take `&AppHandle` for `app.store(...)`. Mock-app holds the `tauri-plugin-store` state.

- [ ] **Step 2.5: Repeat for `claude/commands.rs`** — `claude_status`, `claude_send`, `claude_interrupt`, `claude_reset`. Take `&ClaudeState`. Note: in test_server mode the `RealRunner` would happily spawn `claude -p` — that's NOT what we want for e2e. Add a `KB_CLAUDE_MODE=stub` honoring path here OR have test_server replace the runner with a stub via `ClaudeState::with_stub_runner()`. The 4 proof-set specs do NOT exercise Claude commands, so a `claude_status` returning `{ binary: "missing" }` is sufficient for now. Leave a `// TODO(MVP-5): real stub-runner integration` comment on the wrapper.

- [ ] **Step 2.6: Repeat for `skill/commands.rs`** — `skill_status`, `skill_install_from_bundle`. Take `&AppHandle` for `app.path().resource_dir()`. Mock-app exposes a stub resource_dir (point it at the workspace's `skills/` folder via `tauri::test::MockResources`).

- [ ] **Step 2.7: Refactor `make_temp_vault`**

In `src-tauri/src/test_support/vault.rs`:

```rust
pub async fn impl_make_temp_vault(
    fixture: Option<String>,
    initialized: Option<bool>,
) -> Result<String, String> {
    // ... existing body ...
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn make_temp_vault(
    fixture: Option<String>,
    initialized: Option<bool>,
) -> Result<String, String> {
    impl_make_temp_vault(fixture, initialized).await
}
```

- [ ] **Step 2.8: Verify**

```bash
cd src-tauri && cargo build
# Expected: clean compile. The Tauri side is unchanged — wrappers still
# generate the same `__cmd__*` items the macro expects.
cargo test
# Expected: 87 tests still pass on Ubuntu / 86 on macOS. The wrappers
# delegate to impls; behaviour is byte-identical.
```

- [ ] **Step 2.9: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock \
        src-tauri/src/vault/commands.rs \
        src-tauri/src/term/commands.rs \
        src-tauri/src/settings/commands.rs \
        src-tauri/src/claude/commands.rs \
        src-tauri/src/skill/commands.rs \
        src-tauri/src/test_support/vault.rs
git commit -m "$(cat <<'EOF'
refactor(tauri): split #[tauri::command] entries into impl-fn + wrapper (mvp-4.x phase 3.c task 1)

Each production Tauri command now has two layers:

  pub async fn impl_X(state: &State, ...) -> Result<...>
  #[tauri::command] pub async fn X(state: State<'_, ...>, ...) -> ...

The wrapper does state.inner() extraction; the impl is callable from
anywhere with a borrow of the underlying Arc state. This unblocks the
test_server axum binary (Task 3.C.1 step 3) reusing production command
bodies without a fork.

No behaviour change. 87 (Ubuntu) / 86 (macOS) cargo tests + 942 Vitest
cases still pass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

##### Step 3 — `test_server` module skeleton

- [ ] **Step 3.1: Create `src-tauri/src/test_server/mod.rs`**

```rust
//! Test-only HTTP server. Compiled out of release bundles via the
//! `#[cfg(debug_assertions)]` gate in `lib.rs`. Used exclusively by
//! the `test_server` binary (`src/bin/test_server.rs`) and Playwright
//! e2e specs running under MVP-4.x.

pub mod dispatch;
pub mod events;
pub mod router;

use std::sync::Arc;

use crate::claude::ClaudeState;
use crate::term::TermState;
use crate::vault::{Vault, VaultState, Watcher, WatcherState};

/// Shared state held by every test_server handler. Mirrors what
/// `main.rs` passes to `tauri::Builder::manage()` so impl-fn calls
/// see the same Arc topology as production.
pub struct TestServerState {
    pub vault: VaultState,
    pub watcher: WatcherState,
    pub claude: Arc<ClaudeState>,
    pub term: Arc<TermState>,
    /// Broadcast channel for Tauri events (vault_change, term_event, etc.)
    /// re-emitted as SSE to connected /events subscribers.
    pub events: events::EventBus,
}

impl TestServerState {
    pub fn new() -> Self {
        Self {
            vault: Arc::new(Vault::default()),
            watcher: Arc::new(Watcher::default()),
            claude: Arc::new(ClaudeState::new()),
            term: Arc::new(TermState::new()),
            events: events::EventBus::new(),
        }
    }
}

impl Default for TestServerState {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 3.2: Create `src-tauri/src/test_server/events.rs`**

```rust
//! Tauri-event → SSE bridge. Production code emits events via
//! `app.emit("vault_change", payload)`; here we hand handlers an
//! `EventBus` whose `.emit()` broadcasts to connected `/events` SSE
//! clients. Used by impl-fn paths that need to fan out (e.g.
//! the watcher's `vault_change` emission).

use serde::Serialize;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct EventBus {
    pub tx: broadcast::Sender<EventEnvelope>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EventEnvelope {
    pub name: String,
    pub payload: serde_json::Value,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(256);
        Self { tx }
    }

    pub fn emit<T: Serialize>(&self, name: &str, payload: T) {
        let env = EventEnvelope {
            name: name.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(serde_json::Value::Null),
        };
        let _ = self.tx.send(env);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EventEnvelope> {
        self.tx.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
```

- [ ] **Step 3.3: Create `src-tauri/src/test_server/dispatch.rs`**

```rust
//! Command dispatcher. Maps a `{ "cmd": "...", "args": {...} }` JSON
//! body to the matching impl-fn on production state. Stays in sync with
//! the `tauri::generate_handler![...]` list in `main.rs` — adding a new
//! production command means adding a match arm here.

use std::sync::Arc;

use axum::{
    extract::State,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::test_support::vault as test_support_vault;
use crate::vault::commands as vault_cmds;
// (term_cmds, settings_cmds, etc. as needed.)

use super::TestServerState;

#[derive(Deserialize)]
pub struct InvokeBody {
    pub cmd: String,
    #[serde(default)]
    pub args: Value,
}

pub async fn invoke_handler(
    State(state): State<Arc<TestServerState>>,
    Json(body): Json<InvokeBody>,
) -> Response {
    let result: Result<Value, String> = match body.cmd.as_str() {
        "vault_set_root" => {
            let path: String = body
                .args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            vault_cmds::impl_vault_set_root(&state.vault, path)
                .await
                .map(|_| Value::Null)
                .map_err(|e| e.to_string())
        }
        "vault_list" => {
            let path: String = body
                .args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            vault_cmds::impl_vault_list(&state.vault, path)
                .await
                .map(|files| serde_json::to_value(files).unwrap_or(Value::Null))
                .map_err(|e| e.to_string())
        }
        // ... 28 more arms — one per production command + make_temp_vault ...
        "make_temp_vault" => {
            let fixture: Option<String> = body
                .args
                .get("fixture")
                .and_then(|v| v.as_str())
                .map(String::from);
            let initialized: Option<bool> =
                body.args.get("initialized").and_then(|v| v.as_bool());
            test_support_vault::impl_make_temp_vault(fixture, initialized)
                .await
                .map(Value::String)
                .map_err(|e| e.to_string())
        }
        _ => Err(format!("unknown command: {}", body.cmd)),
    };

    match result {
        Ok(value) => Json(json!({ "ok": true, "value": value })).into_response(),
        Err(msg) => Json(json!({ "ok": false, "error": msg })).into_response(),
    }
}
```

Fill in all 30 match arms. The repetition is intentional — direct dispatch is honest about the surface; macro-codegen would obscure errors.

- [ ] **Step 3.4: Create `src-tauri/src/test_server/router.rs`**

```rust
use std::sync::Arc;

use axum::{
    response::{sse::Event, sse::KeepAlive, IntoResponse, Sse},
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};

use super::{dispatch, TestServerState};

pub fn build(state: Arc<TestServerState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/invoke", post(dispatch::invoke_handler))
        .route("/events", get(events_stream))
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_origin(Any),
        )
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true, "service": "test_server" }))
}

async fn events_stream(
    axum::extract::State(state): axum::extract::State<Arc<TestServerState>>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let rx = state.events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        let env = res.ok()?;
        let data = serde_json::to_string(&env).ok()?;
        Some(Ok(Event::default().event(env.name.clone()).data(data)))
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}
```

If `tokio-stream` is not yet a dep, add `tokio-stream = { version = "0.1", features = ["sync"] }` to Cargo.toml at this step.

##### Step 4 — The `test_server` binary

- [ ] **Step 4.1: Create `src-tauri/src/bin/test_server.rs`**

```rust
//! test_server — Playwright-driven HTTP server exposing production
//! Tauri commands for MVP-4.x e2e. NOT included in any release bundle;
//! debug-only via the `#[cfg(debug_assertions)] pub mod test_server;`
//! gate in lib.rs.

use std::sync::Arc;

use knowledge_base_lib::test_server::{router, TestServerState};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let state = Arc::new(TestServerState::new());
    let app = router::build(state.clone());

    let addr: std::net::SocketAddr = "127.0.0.1:1421".parse()?;
    eprintln!("[test_server] listening on http://{addr}");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}
```

- [ ] **Step 4.2: Verify**

```bash
cd src-tauri && cargo build --bin test_server
# Expected: clean compile.
cargo run --bin test_server &
SERVER_PID=$!
sleep 2
curl -sf http://localhost:1421/health
# Expected: {"ok":true,"service":"test_server"}
curl -sf -X POST http://localhost:1421/invoke -H 'content-type: application/json' \
  -d '{"cmd":"make_temp_vault","args":{}}'
# Expected: {"ok":true,"value":"/tmp/.tmpXXX..."}
kill $SERVER_PID
```

If both responses are correct, the dispatch loop is wired. If `make_temp_vault` returns `unknown command`, you missed an arm in `dispatch.rs` — fix and re-run.

- [ ] **Step 4.3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs \
        src-tauri/src/test_server/ src-tauri/src/bin/test_server.rs
git commit -m "$(cat <<'EOF'
feat(tauri): test_server axum binary on :1421 (mvp-4.x phase 3.c task 1)

New debug-only [[bin]] target re-uses the production command bodies
(via the impl-fn split landed in the previous commit) to expose every
Tauri command + make_temp_vault over HTTP for Playwright e2e. SSE
endpoint /events bridges production Tauri events to connected clients.

Module layout:
  src-tauri/src/test_server/
    mod.rs       — TestServerState (Arc holder mirroring main.rs.manage(...))
    router.rs    — axum router (/health /invoke /events)
    dispatch.rs  — JSON-body command match → impl_X dispatch
    events.rs    — broadcast::Sender wrapper consumed by /events SSE
  src-tauri/src/bin/test_server.rs  — thin main() that boots the router

Health probe:
  curl localhost:1421/health → {"ok":true,"service":"test_server"}

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.2: `e2e/helpers/tauriShim.ts` — frontend invoke + listen shim

**Files:**
- Create: `e2e/helpers/tauriShim.ts`

- [ ] **Step 1: Write the shim**

```ts
// e2e/helpers/tauriShim.ts
//
// Init-script that monkey-patches `window.__TAURI_INTERNALS__` so the
// frontend's `@tauri-apps/api/core::invoke` / `@tauri-apps/api/event::listen`
// round-trip to test_server (axum on :1421) instead of the missing
// Tauri runtime. Registered via Playwright's `page.addInitScript` so
// it runs BEFORE any page module evaluates — Tauri's bridge code reads
// __TAURI_INTERNALS__ at module-eval time (the bundler emits a static
// reference; lazy patching after page.goto() is too late).

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
```

- [ ] **Step 2: Sanity-check the contract**

The shim is correct when:
- `window.__TAURI_INTERNALS__.invoke` exists at module-eval time. (Confirmed by `addInitScript` running before page scripts.)
- `invoke('vault_set_root', { path })` returns `null` on success, throws on error. (Confirmed by test_server's `{ ok: true, value: null }` → unwrapped to `null`.)
- `invoke('make_temp_vault', { fixture, initialized })` returns the path string. (Same path as `tempVault.ts`.)
- `listen('vault_change', cb)` returns a Promise<unlisten>. (Confirmed.)

##### Step 3 — Wire into `e2e/helpers/launchApp.ts`

- [ ] **Step 3.1: Replace the file**

```ts
// e2e/helpers/launchApp.ts
//
// Boots the app for an MVP-4.x e2e spec. Single backend post-MVP-4.x:
// chromium against `next dev`, with the Tauri invoke surface shimmed
// to test_server (axum on :1421) via Playwright's addInitScript.

import type { Page } from "@playwright/test";

import { installShim } from "./tauriShim";

export async function setVaultPath(page: Page, vaultPath: string): Promise<void> {
  await page.evaluate(async (path) => {
    // @ts-expect-error - shim installs __TAURI__ via addInitScript
    await window.__TAURI__.invoke("vault_set_root", { path });
  }, vaultPath);
}

export { installShim };
```

`currentBackend()` is gone — single backend post-MVP-4.x. Specs that imported `currentBackend` to check the skip gate now import nothing from launchApp other than `setVaultPath` and `installShim`.

- [ ] **Step 3.2: Commit**

```bash
git add e2e/helpers/tauriShim.ts e2e/helpers/launchApp.ts
git commit -m "$(cat <<'EOF'
feat(e2e): tauri invoke shim → test_server :1421 (mvp-4.x phase 3.c task 2)

INIT_SCRIPT registers window.__TAURI_INTERNALS__ + window.__TAURI__
before any page script runs. invoke() POSTs JSON to test_server's
/invoke endpoint; listen() is a no-op stub for now (none of the 4
proof-set specs assert event-driven behaviour; future specs that do
will swap in an EventSource on /events).

setVaultPath() loses its currentBackend conditional — single backend
post-MVP-4.x.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.3: Update the 4 proof-set specs to install the shim + drop skip gates

**Files:**
- Modify: `e2e/vault_picker.spec.ts`
- Modify: `e2e/uninitialized_splash.spec.ts`
- Modify: `e2e/document_create.spec.ts`
- Modify: `e2e/rename_propagation.spec.ts`

- [ ] **Step 1: Edit `e2e/vault_picker.spec.ts`**

Before:

```ts
import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, currentBackend } from "./helpers/launchApp";

test.describe("vault picker (proof set)", () => {
  test.skip(currentBackend() === "nextdev", "needs Tauri webdriver backend");

  test("open vault → explorer renders tree", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    // ...
  });
});
```

After:

```ts
import { test, expect } from "@playwright/test";
import { makeTempVault } from "./helpers/tempVault";
import { setVaultPath, installShim } from "./helpers/launchApp";

test.describe("vault picker (proof set)", () => {
  test.beforeEach(async ({ page }) => {
    await installShim(page);
  });

  test("open vault → explorer renders tree", async ({ page }) => {
    const vault = await makeTempVault({ fixture: "empty" });
    await page.goto("/");
    await setVaultPath(page, vault.path);
    // ... (assertions unchanged)
  });
});
```

The `test.skip(currentBackend() === "nextdev", ...)` line is GONE. The `currentBackend` import is GONE. The new `test.beforeEach` installs the shim before every test in the file.

- [ ] **Step 2: Apply identical pattern to the other 3 specs**

`uninitialized_splash.spec.ts`, `document_create.spec.ts`, `rename_propagation.spec.ts` — same edit shape.

⚠️ **`tempVault.ts` caveat:** `e2e/helpers/tempVault.ts` calls `invoke("make_temp_vault", ...)` which is imported from `@tauri-apps/api/core`. The shim patches `window.__TAURI_INTERNALS__`, which is what `core::invoke` reads — but only AFTER `addInitScript` has run. `tempVault.ts` is called from inside the test body (after `installShim`), so the timing works. Verify in Step 3 below.

- [ ] **Step 3: Run the 4 specs locally against test_server + next dev**

```bash
# Terminal 1
cd src-tauri && cargo run --bin test_server

# Terminal 2
npm run dev   # next dev on :3000

# Terminal 3
npx playwright test e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts
# Expected: 4 passed (4 specs, ~30-60s total).
```

If `vault_picker` fails because the explorer never renders, the bug is most likely:
- `tempVault.ts`'s `invoke('make_temp_vault')` returned successfully but the path doesn't exist on disk because test_server is running in a different working dir than the spec expects. Fix: test_server should `chdir` to the workspace root in `main()` so `env!("CARGO_MANIFEST_DIR")`-based fixture lookup still works.
- `setVaultPath` succeeded but the frontend didn't kick off a `vault_list` refresh. Inspect with `page.pause()` and check `useFileExplorer.refresh()` ran. Most likely cause: `useFileExplorer.boot()` didn't see a `lastPath` in the settings store; manually triggering via `setVaultPath` is the right path — confirm `tauriBridge.watchStart()` errored gracefully (it will because the shim's `invoke('vault_watch_start')` should succeed; if `core/invoke` throws because `__TAURI_INTERNALS__.invoke` isn't a function, the shim's INIT_SCRIPT didn't load — re-check addInitScript ordering).

If `rename_propagation` fails on the `b.md` rewrite, the `propagateRename` chain isn't reaching `vault_write_text` — open devtools in `--headed` mode and step through.

- [ ] **Step 4: Commit**

```bash
git add e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): proof-set specs run via test_server shim; drop nextdev skip gates (mvp-4.x phase 3.c task 3)

Each of the 4 specs now:
  - installs the __TAURI_INTERNALS__ shim via test.beforeEach
  - drops the test.skip(currentBackend() === "nextdev", ...) gate
  - drops the currentBackend import

Locally: 4 passed against `cargo run --bin test_server` + `npm run dev`.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.4: `playwright.config.ts` + `scripts/run-e2e.sh` boot orchestration

**Files:**
- Modify: `playwright.config.ts`
- Create: `scripts/run-e2e.sh`

- [ ] **Step 1: Create `scripts/run-e2e.sh`**

```bash
#!/usr/bin/env bash
# Boot test_server + next dev side-by-side for Playwright. Used by
# playwright.config.ts's webServer.command. Keeps both processes
# alive until SIGTERM (which Playwright sends on shutdown).
#
# Avoids `concurrently` so we don't pull in another runtime dep.

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
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/run-e2e.sh
```

- [ ] **Step 3: Replace `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'bash scripts/run-e2e.sh',
    // Probe test_server's /health endpoint — Playwright treats this
    // as the readiness signal. next dev becomes ready ~3s after,
    // before any spec actually navigates.
    url: 'http://localhost:1421/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
```

- [ ] **Step 4: Verify locally**

```bash
npm run test:e2e -- e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts
# Expected: webServer boots both processes; 4 passed; processes torn down on exit.
```

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts scripts/run-e2e.sh
git commit -m "$(cat <<'EOF'
chore(e2e): playwright.config webServer boots test_server + next dev (mvp-4.x phase 3.c task 4)

scripts/run-e2e.sh forks both processes; trap on SIGTERM kills both.
Avoids `concurrently` runtime dep. Probe targets test_server's
:1421/health (next dev becomes ready ~3s later before any nav).

KB_E2E_BACKEND env var removed entirely — single backend post-MVP-4.x.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.5: Drop `tauri-plugin-webdriver` dep + main.rs registration

**Files:**
- Modify: `src-tauri/Cargo.toml` (remove `tauri-plugin-webdriver`; already done in Task 3.C.1 Step 1.1 — confirm)
- Modify: `src-tauri/src/main.rs` (remove the `#[cfg(debug_assertions)] { builder = builder.plugin(tauri_plugin_webdriver::init()); }` block + revert `let mut builder` → `let builder`)

- [ ] **Step 1: Confirm Cargo.toml is clean**

```bash
grep tauri-plugin-webdriver src-tauri/Cargo.toml src-tauri/Cargo.lock
# Expected: no matches in Cargo.toml; lock file matches dropped via
# `cargo build` in this step.
```

- [ ] **Step 2: Edit `src-tauri/src/main.rs`**

Replace the `mut`-binding + cfg block (lines ~14-28 of HEAD) with:

```rust
let builder = tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_store::Builder::default().build());
```

Remove the `#[cfg_attr(not(debug_assertions), allow(unused_mut))]` line. Remove the `#[cfg(debug_assertions)] { builder = builder.plugin(tauri_plugin_webdriver::init()); }` block. The comment block above the cfg gate gets shortened to one line: `// Production bundles do not register tauri-plugin-webdriver — replaced by test_server (MVP-4.x).`

- [ ] **Step 3: Verify build**

```bash
cd src-tauri && cargo build && cargo build --release
# Expected: clean compile both modes. Release binary ~200KB smaller.
cargo test
# Expected: 87 pass on Ubuntu / 86 on macOS. test_server bin not exercised by `cargo test`.
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/main.rs
git commit -m "$(cat <<'EOF'
chore(tauri): drop tauri-plugin-webdriver dep + registration (mvp-4.x phase 3.c task 5)

The plugin is unused post-MVP-4.x — test_server (Path 3) replaces its
WebDriver surface. Drops ~200KB binary size + ~30s compile time per
CI run. Reverts main.rs's let-mut pattern that existed only to host
the cfg-gated `.plugin(...)` chain.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.6: Restore the e2e job in `.github/workflows/ci.yml`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the new `e2e` job**

Insert AFTER the `tauri-build` job and BEFORE the closing `jobs:` block boundary:

```yaml
  e2e:
    name: End-to-end tests
    runs-on: ubuntu-22.04
    timeout-minutes: 15

    # MVP-4.x e2e harness: test_server (axum :1421) + next dev + chromium.
    # No GTK / WebKitGTK / xvfb / dbus / AT-SPI deps — chromium only.
    # See docs/superpowers/plans/2026-05-09-tauri-mvp4x-real-e2e-ci-plan.md
    # for the architecture rationale.

    steps:
      - uses: actions/checkout@v4

      - name: Read Node version from .nvmrc
        id: nvmrc
        run: echo "version=$(cat .nvmrc)" >> "$GITHUB_OUTPUT"

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ steps.nvmrc.outputs.version }}
          cache: npm

      - uses: dtolnay/rust-toolchain@stable

      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target

      - name: Install Tauri Linux deps
        # Same set rust-checks uses — required to LINK the crate (axum
        # itself doesn't need them, but tokio/tower-http transitively
        # pull them in via the Tauri tree).
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libgtk-3-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            libsoup-3.0-dev \
            libxdo-dev \
            libssl-dev

      - name: Install npm dependencies
        run: npm install --prefer-offline

      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-chromium-${{ hashFiles('package-lock.json') }}

      - name: Install Playwright browsers (chromium only)
        run: npx playwright install --with-deps chromium

      - name: Pre-build test_server
        # Avoid `cargo run --bin test_server` cold-compile inside the
        # webServer.command (which has a 60s readiness timeout).
        run: cd src-tauri && cargo build --bin test_server

      - name: End-to-end tests (proof set)
        run: |
          npx playwright test \
            e2e/vault_picker.spec.ts \
            e2e/uninitialized_splash.spec.ts \
            e2e/document_create.spec.ts \
            e2e/rename_propagation.spec.ts

      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Update the workflow comment header**

Edit the multi-line comment at the top of the file:

```yaml
# Gates every PR (and push to main) on five parallel jobs. The e2e job
# was restored in MVP-4.x (PR #<TBD>) using a custom IPC harness
# (test_server + next dev + chromium); the original tauri-plugin-webdriver
# silent-bind issue is documented in the handoff doc's MVP-4.x section.
```

- [ ] **Step 3: Verify locally with `act` (optional)**

```bash
act -j e2e --container-architecture linux/amd64 -P ubuntu-22.04=catthehacker/ubuntu:act-22.04
```

If `act` is not installed, skip — the next push to the branch surfaces the result.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci(e2e): restore e2e job under test_server harness (mvp-4.x phase 3.c task 6)

New `e2e` job on ubuntu-22.04, chromium only — no GTK/xvfb/dbus/AT-SPI.
Pre-builds test_server binary to keep webServer.command cold-start
under playwright's 60s readiness timeout. Runs the 4 proof-set specs
with full assertions. Fails the PR on any spec failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

#### Task 3.C.7: Push branch + first remote run sanity check

**Files:** none modified.

- [ ] **Step 1: Push and watch the run**

```bash
git push -u origin feat/tauri-mvp4x-real-e2e-ci
gh run watch
```

Expected: 5 jobs pass (`checks`, `build`, `rust-checks`, `tauri-build`, `e2e`). The `e2e` job is the new one — confirm it ran the 4 proof-set specs.

- [ ] **Step 2: If the e2e job fails on CI but passed locally**

The most likely causes are:
- `tempVault.ts`'s `from_fixture` lookup uses `env!("CARGO_MANIFEST_DIR")` which is the `cargo build` working dir — confirm test_server's working dir at runtime resolves the fixture path. Fix: in `test_server.rs::main`, `std::env::set_current_dir(env!("CARGO_MANIFEST_DIR"))` before `axum::serve`.
- The `vault_change` SSE listener may surface a flake when the watcher emits before the EventSource is connected. Symptom: rename_propagation occasionally times out on the 5s expect.poll. Fix: extend the timeout to 8s, or add a `await page.waitForResponse(/health/)` before the spec body to ensure the SSE channel is alive.

After the first remote run is green: jump to **Phase 4**.

---

### Phase 3.D — Path 4: Self-hosted macOS runner (LAST RESORT — STUB)

**Only execute if Phase 1, 2, AND 3.C all fail to produce a working pipeline AND the user explicitly funds the runner.** Plan-stubbed for completeness.

#### Task 3.D.1: Plan-stub only

- [ ] **Step 1: Document the trigger and outline.**

If you've reached here in execution, STOP and surface to the user. Path 4 is operationally heavy: a Mac mini in a closet with a logged-in graphical session, a self-hosted GitHub Actions runner registered against the org, the runner labelled `[self-hosted, macos, mvp4x]`, the e2e job's `runs-on:` switched to the new label, `tauri-plugin-webdriver` re-introduced with the host's full graphical session.

The full sub-plan (provisioning, security, CI wiring, runbook) is out of scope until/unless the user explicitly funds it. Capture findings in the handoff and create a stub MVP-4.y plan at `docs/superpowers/plans/2026-05-09-tauri-mvp4y-self-hosted-mac-stub.md` if needed.

- [ ] **Step 2: Do NOT commit anything** until the user confirms direction.

---

## Phase 4 — Verification

**Goal:** Encode the brief's verification surface as discrete gates the executor checks before opening the PR. Single phase regardless of which Phase 3 path landed.

### Task 4.1: All 5 CI jobs green on a single push

**Files:** none modified.

- [ ] **Step 1: Confirm the latest push is green**

```bash
gh run list --branch feat/tauri-mvp4x-real-e2e-ci --limit 1
gh run view --json jobs --jq '.jobs[] | {name, conclusion}'
# Expected: all of checks, build, rust-checks, tauri-build, e2e → success.
```

If anything is red, fix root cause and re-push. Do NOT proceed to Task 4.2 with a red CI.

### Task 4.2: 4 proof-set specs assert real behaviour

**Files:** none modified (verification by inspection of spec bodies).

- [ ] **Step 1: Audit the 4 specs**

```bash
for f in e2e/vault_picker.spec.ts e2e/uninitialized_splash.spec.ts e2e/document_create.spec.ts e2e/rename_propagation.spec.ts; do
  echo "=== $f ==="
  grep -n "expect\|test.skip" "$f" || true
done
```

Confirm:
- `vault_picker.spec.ts`: at least 2 `expect(...)` calls (knowledge-base root + explorer-tree visible). No `test.skip`.
- `uninitialized_splash.spec.ts`: at least 4 `expect(...)` calls (splash dialog visible, contains text, explorer absent before, explorer present after). No `test.skip`.
- `document_create.spec.ts`: at least 3 `expect(...)` calls — including the **on-disk `fs.stat`** assertion against the tempdir path. No `test.skip`.
- `rename_propagation.spec.ts`: at least 5 `expect(...)` calls — including the **on-disk `b.md` content rewrite** assertion (`[[c]]` present, `[[a]]` absent). No `test.skip`.

If any of those assertions are missing, the spec is decorative — fix it before declaring done.

### Task 4.3: 3 consecutive clean runs (stability gate)

**Files:** none modified.

- [ ] **Step 1: First empty-commit re-trigger**

```bash
git commit --allow-empty -m "ci: confirm e2e stability run 1/3 (mvp-4.x phase 4)"
git push
gh run watch
# Expected: all 5 jobs green.
```

- [ ] **Step 2: Second**

```bash
git commit --allow-empty -m "ci: confirm e2e stability run 2/3 (mvp-4.x phase 4)"
git push
gh run watch
# Expected: all 5 jobs green.
```

- [ ] **Step 3: Third**

```bash
git commit --allow-empty -m "ci: confirm e2e stability run 3/3 (mvp-4.x phase 4)"
git push
gh run watch
# Expected: all 5 jobs green.
```

If any run is red, the e2e harness is flaky. Investigate (most likely: timing on the SSE listen, watcher debounce, or test_server cold-start). Fix and restart from run 1/3 — flake budget is zero.

If all 3 runs green: stability gate cleared.

### Task 4.4: All `KB_E2E_BACKEND=nextdev` skip gates removed

**Files:** none modified (verification).

- [ ] **Step 1: Grep for stragglers**

```bash
grep -rn "KB_E2E_BACKEND\|currentBackend\|test.skip.*nextdev" e2e/ src/ docs/ scripts/ src-tauri/ playwright.config.ts 2>/dev/null
# Expected (Path 3): zero hits in e2e/, src/, scripts/, src-tauri/, playwright.config.ts.
# A few hits in docs/superpowers/handoffs/ are fine — those are historical references.
```

If any stragglers remain in code, either:
- Path 3 didn't fully remove the variable (fix it now), OR
- Path 1 / Path 2 landed AND deliberately kept the variable as a backend toggle (justified — document why in PR description).

### Task 4.5: Diagnostic notes added to the handoff

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Edit the MVP-4.x section under "Open follow-up items"**

Replace the long diagnostic dump (lines ~111-135 of HEAD~N) with a concise post-mortem. Template (Path 3 example):

```markdown
- **MVP-4.x — RESOLVED in PR #<TBD> (`<TBD>`, 2026-05-XX).** Real Playwright e2e in CI shipped via custom IPC harness ("Path 3 / Option C"). Architecture: new `src-tauri/src/bin/test_server.rs` (axum on `:1421`) re-uses production command bodies via the `impl_*` split landed in the same PR; Playwright `addInitScript` registers a `window.__TAURI_INTERNALS__` shim that round-trips `invoke()` to `:1421/invoke`; chromium + `next dev` is the runtime. `tauri-plugin-webdriver 0.2.1` dropped (~200KB compile-time savings). 4 proof-set specs (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`) run with full real-behaviour assertions (file appears on disk, wiki-link rewrites in `b.md`, etc.). 3-consecutive-clean-runs stability gate cleared. **Residual coverage gap:** WKWebView fidelity uncovered — chromium covers ~95% of UI surface, but webview-specific behaviours (font rendering, native dialogs the bridge cannot intercept) still go untested. Acceptable trade-off for the operational simplicity. **Phase 1 outcome:** `tauri-plugin-webdriver` source-dive showed [actual finding from Phase 1 commit]. **Phase 2 outcome:** `tauri-driver` showed [actual finding from Phase 2 commit].
```

If Path 1 or Path 2 landed, replace the architecture sentence accordingly (e.g. "Plugin's runtime mismatch fixed via `tauri::async_runtime::spawn` wrapper" or "Adopted `tauri-driver` 0.x.y; Tauri team's first-party runner is mature enough on Ubuntu CI to replace the third-party plugin entirely").

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "docs(handoff): MVP-4.x post-mortem — real e2e in CI shipped (mvp-4.x phase 4 task 5)"
```

---

## Phase 5 — Handoff doc closeout

**Goal:** After Phase 4's stability gate clears AND the PR is merged to main, update the handoff doc to reflect the new state. Per the doc-update protocol, this rides with the FINAL commit on this branch (not a separate doc-only PR).

### Task 5.1: Flip MVP-4.x to ✅ Resolved in `Where we are`

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Edit the `Where we are` § Plans table**

Find the row:
```
| **MVP-4.x** | Real Playwright e2e in CI (no manual smoke) | _not yet written; due before MVP-5_ | 🚧 Active on `feat/tauri-mvp4x-real-e2e-ci`; plan pending. ...
```

Replace with:
```
| **MVP-4.x** | Real Playwright e2e in CI (no manual smoke) | `docs/superpowers/plans/2026-05-09-tauri-mvp4x-real-e2e-ci-plan.md` | ✅ Merged via PR #<TBD> (`<TBD>` on `main`). |
```

### Task 5.2: Add Reference architecture entries

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Add a new "Landed (MVP-4.x)" block under Reference architecture**

Following the existing pattern (Landed (MVP-1a) … Landed (MVP-4)):

```markdown
**Landed (MVP-4.x, PR #<TBD>):**

- **test_server (Rust)** — `src-tauri/src/bin/test_server.rs` + `src-tauri/src/test_server/{mod,router,dispatch,events}.rs`. Debug-only axum HTTP server on `:1421`; re-uses production command bodies via the `impl_*` split. Endpoints: `POST /invoke`, `GET /events` (SSE), `GET /health`. Bin target in `src-tauri/Cargo.toml`.
- **impl-fn split (Rust)** — `src-tauri/src/{vault,term,settings,claude,skill}/commands.rs` and `src-tauri/src/test_support/vault.rs`. Each `#[tauri::command]` is now a thin wrapper around `pub async fn impl_*(&State, ...)`; the impl-fn is callable from `test_server`'s dispatcher.
- **e2e shim (frontend)** — `e2e/helpers/tauriShim.ts` (INIT_SCRIPT + `installShim(page)`) registered via Playwright's `addInitScript`; monkey-patches `window.__TAURI_INTERNALS__` + `window.__TAURI__` so `@tauri-apps/api/core::invoke` round-trips to `:1421/invoke`. `e2e/helpers/launchApp.ts` reduced to `setVaultPath` + `installShim` re-export (no more `currentBackend`/`KB_E2E_BACKEND`).
- **e2e launcher** — `scripts/run-e2e.sh` (forks `cargo run --bin test_server` + `npm run dev`; SIGTERM-clean teardown). Wired into `playwright.config.ts`'s `webServer.command`.
- **CI** — `.github/workflows/ci.yml` gains a 5th job `e2e` on `ubuntu-22.04` (chromium-only). 4 proof-set specs run with full real-behaviour assertions.
- **Removed** — `tauri-plugin-webdriver` dep (Cargo.toml + main.rs registration). ~200KB binary size + ~30s compile time saved per CI run. `KB_E2E_BACKEND` env var deleted.
```

(If Path 1 or Path 2 landed, replace the bullets with the appropriate set: Path 1 keeps the plugin and adjusts the registration; Path 2 swaps to `tauri-driver`. Adjust the deleted-files list.)

### Task 5.3: Update the Open follow-up items block

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Already done in Task 4.5.** Confirm the diagnostic dump has been replaced with the post-mortem paragraph.

### Task 5.4: Rewrite Next Action for MVP-5

**Files:**
- Modify: `docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md`

- [ ] **Step 1: Edit the Next Action section**

Replace the entire MVP-4.x brief (currently lines ~140-188) with a fresh MVP-5 brief. Template:

```markdown
## Next Action

**MVP-4.x merged via PR #<TBD> (`<TBD>` on `main`).** Real Playwright e2e in CI is shipped — 4 proof-set specs run on every push with full real-behaviour assertions, no manual smoke gate, no skip gates. **MVP-5 kicks off now** — the systematic ❌ → ✅ / 🟡 / 🧪 sweep across `test-cases/`.

**Bootstrap:**

```bash
cd "/Users/kiro/My Projects/knowledge-base"
git checkout main && git pull --ff-only            # <TBD> present
git branch -D feat/tauri-mvp4x-real-e2e-ci         # remote auto-deleted
git remote prune origin
git checkout -b feat/tauri-mvp5-test-promotion
```

**MVP-5 plan-writing brief (run via `superpowers:writing-plans`; output `docs/superpowers/plans/2026-05-XX-tauri-mvp5-test-promotion-plan.md`):**

[fill in with the brief from the spec § 10 + the MVP-5-shaped sweep targets:
test-cases/01-app-shell.md, 02-file-system.md, 04-document.md,
05-links-and-graph.md, 06-shared-hooks.md, 06-svg-editor.md,
07-persistence.md, 11-tabs.md.]
```

- [ ] **Step 2: Commit (folded into PR's final commit)**

```bash
git add docs/superpowers/handoffs/2026-05-07-tauri-claude-integration.md
git commit -m "$(cat <<'EOF'
docs(handoff): MVP-4.x close-out — Reference architecture + Next Action MVP-5 (mvp-4.x phase 5)

- Where-we-are: MVP-4.x flipped to ✅ Merged with PR # placeholder.
- Reference architecture: new Landed (MVP-4.x) block.
- Open follow-up items: diagnostic dump replaced with post-mortem.
- Next Action: rewritten for MVP-5 test-case promotion sweep.

Doc edit lives on this branch per the doc-update protocol (no doc-only
PRs); will be picked up in the same merge as the implementation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.5: Open the PR

**Files:** none modified.

- [ ] **Step 1: Push final commit + open PR**

```bash
git push
gh pr create \
  --title "feat(tauri): MVP-4.x — real Playwright e2e in CI via test_server harness" \
  --body "$(cat <<'EOF'
## Summary
- Custom IPC harness ([Path 3 / Option C](docs/superpowers/plans/2026-05-09-tauri-mvp4x-real-e2e-ci-plan.md#phase-3c--path-3-default-option-c-custom-ipc-harness)) replaces the silently-failing `tauri-plugin-webdriver`. New `test_server` axum binary on `:1421` re-uses production command bodies via an `impl_*` split.
- 4 proof-set Playwright specs (`vault_picker`, `uninitialized_splash`, `document_create`, `rename_propagation`) run on every PR push with full real-behaviour assertions.
- `tauri-plugin-webdriver` dep dropped; ~200KB binary size + ~30s compile time saved per CI run.
- 3-consecutive-clean-runs stability gate cleared (3 empty commits).

## Out of scope (per plan)
- WKWebView visual-regression / screenshot diffs.
- Cross-platform e2e (Windows).
- Performance benchmarks.
- The 5 pre-MVP-4 clippy lints.
- Self-hosted macOS runner (Path 4 — plan-stubbed only).
- Migrating the 40+ legacy FSA-mock specs (MVP-5 sweep work).

## Test plan
- [x] All 5 CI jobs pass on the latest push.
- [x] 4 proof-set specs run with real assertions (on-disk file checks, wiki-link rewrites).
- [x] 3 consecutive clean runs.
- [x] No `KB_E2E_BACKEND=nextdev` skip gates remaining in code.
- [x] Handoff doc updated with post-mortem + MVP-5 Next Action.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Adjust the title + summary if Path 1 or Path 2 landed.)

---

## Verification surface (must all be green before merge)

This is the contract from the brief, encoded as a final checklist. Tick each before requesting merge.

- [ ] **Phase 0:** baseline 5 CI jobs + Vitest + Rust tests all green locally.
- [ ] **Phase 1:** documented outcome (fix found, or no fix found) committed to handoff doc.
- [ ] **Phase 2:** documented outcome (driver works, or doesn't) committed to handoff doc.
- [ ] **Phase 3:** exactly one path (3.A / 3.B / 3.C) implemented end-to-end. Code in `src-tauri/`, `e2e/`, `scripts/`, `playwright.config.ts`, `.github/workflows/ci.yml` matches the path.
- [ ] **Phase 4 Task 4.1:** all 5 CI jobs green on a single push (`gh run view --json jobs`).
- [ ] **Phase 4 Task 4.2:** all 4 proof-set specs assert real behaviour — on-disk `fs.stat` for `document_create`, on-disk content rewrite for `rename_propagation`, dialog visibility for `uninitialized_splash`, explorer-tree presence for `vault_picker`.
- [ ] **Phase 4 Task 4.3:** 3 consecutive clean runs (3 empty commits, all 5 jobs green each).
- [ ] **Phase 4 Task 4.4:** no `KB_E2E_BACKEND=nextdev` skip gates remain in `e2e/`, `src/`, `scripts/`, `src-tauri/`, `playwright.config.ts`.
- [ ] **Phase 4 Task 4.5:** handoff doc's MVP-4.x diagnostic dump replaced with post-mortem.
- [ ] **Phase 5:** handoff doc's `Where we are` table flipped to ✅ Merged; Reference architecture has Landed (MVP-4.x) block; Next Action rewritten for MVP-5; final commit pushed.
- [ ] **PR opened** via `gh pr create` with the title + body template above.
- [ ] **Decision rationale captured in PR body:** which path landed, why; trade-offs accepted (e.g. "WKWebView path uncovered" if Path 3).

---

## Self-review notes (writing-plans discipline)

- **Spec coverage:** every requirement in the plan-writing brief maps to a phase or task above. The 4 plan-level decisions (default Path 3 / real subprocess proxy / Ubuntu primary / drop webdriver dep) are pinned at the top under "Scope decisions pinned" and re-stated in the body where they are first applied.
- **Placeholder scan:** I have NOT used "TBD" / "TODO" / "implement later" anywhere except the literal placeholder PR # / merge SHA values in Phase 5 commits, where the actual values are unknown until the PR opens. Investigation phases (1, 2) have explicit decision gates with concrete commands, not hand-wavy "read the source" prompts. Type names (`TestServerState`, `EventBus`, `INIT_SCRIPT`) are consistent across tasks.
- **Type consistency:** `setVaultPath(page, vaultPath)` signature unchanged from MVP-4. `installShim(page)` is the new helper. `EventBus` and `EventEnvelope` introduced together in Task 3.C.1 Step 3.2 and used identically in Step 3.3-3.4.
- **TDD-ish discipline:** investigation phases have decision gates; implementation tasks have local verification commands before commit. No big-bang merges.
- **Known soft spots that the executor should watch:**
  1. The 30-arm match expression in `dispatch.rs` is the most error-prone surface — adding/removing a production command later means edits in BOTH `main.rs::generate_handler!` and `dispatch.rs`. Worth extracting a `tauri::generate_handler!`-mirroring macro in MVP-5 if the surface keeps growing.
  2. `addInitScript` timing is paragraph-noted but worth a re-test if the `tempVault.ts` `invoke('make_temp_vault')` ever throws "TAURI_INTERNALS undefined". The fix is always "register shim before navigating" — the README of `tauriShim.ts` makes this explicit.
  3. Path 3's `listen()` no-op is fine for the 4 proof-set specs but will bite future specs that rely on event delivery. The SSE channel scaffolding in Task 3.C.1 (`events.rs` + `/events` route) is in place; upgrading the shim is a one-file edit.
- **Inconsistency I noticed during reading:** the brief at the top says "5-job CI" but the current `.github/workflows/ci.yml` defines 4 jobs (`checks`, `build`, `rust-checks`, `tauri-build`) post-MVP-4 e2e drop. Adding the new `e2e` job under Path 3 brings the count to 5. The bootstrap block + Phase 4 Task 4.1 reflect "5 jobs total post-merge"; the brief's "all 4 existing CI jobs pass" is accurate at the start-of-MVP-4.x-baseline (Phase 0). I treat the brief and reality as consistent on this point — the count changes from 4 → 5 across this PR.
