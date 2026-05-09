//! Test-only helpers. Compiled out of release bundles via the
//! `#[cfg(debug_assertions)]` gate in `lib.rs`. Lives at the crate level
//! (not under `tests/common/`) so the same `TempVault` struct serves
//! both `cargo test --test ...` integration files and the
//! `make_temp_vault` runtime command Playwright e2e specs invoke.

pub mod vault;

pub use vault::{make_temp_vault, TempVault};
