//! Test-only HTTP server. Compiled out of release bundles via the
//! `#[cfg(debug_assertions)]` gate in `lib.rs`. Used exclusively by
//! the `test_server` binary (`src/bin/test_server.rs`) and Playwright
//! e2e specs running under MVP-4.x.
//!
//! The server re-invokes the production command bodies (the `impl_<name>`
//! sibling fns landed by Phase 3.C.1's first commit) over HTTP so
//! Playwright in chromium can drive real Rust code without a Tauri
//! runtime. Commands that need a live `AppHandle` (term_*, claude_send,
//! claude_interrupt, claude_reset, settings_*, skill_*, vault_pick,
//! vault_watch_start) are rejected by the dispatcher; the four MVP-4.x
//! proof-set specs do not exercise those surfaces.

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
    /// re-emitted as SSE to connected /events subscribers. Currently
    /// unused — production event sources are not yet wired through it
    /// (the four proof-set specs assert no event-driven behaviour).
    /// Future specs that need real event delivery can flip this on by
    /// upgrading the dispatcher to call event-emitting impl-fn variants.
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
