//! Test-only helpers. Compiled out of release bundles via the
//! `#[cfg(debug_assertions)]` gate in `lib.rs`. Lives at the crate level
//! (not under `tests/common/`) so the same `TempVault` struct serves
//! both `cargo test --test ...` integration files and the
//! `make_temp_vault` runtime command Playwright e2e specs invoke.

pub mod vault;

// `make_temp_vault` is intentionally not re-exported here — `tauri::generate_handler!`
// resolves the macro-generated `__cmd__make_temp_vault` companion item at the same
// module path as the `#[tauri::command]` attribute, so `main.rs` references
// `test_support::vault::make_temp_vault` directly and a `pub use` re-export wouldn't
// help. `TempVault` is re-exported because Rust callers (integration tests) consume
// it via the short path.
pub use vault::TempVault;
