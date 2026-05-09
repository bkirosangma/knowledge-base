//! Knowledge-base desktop app — Rust core.

pub mod claude;
pub mod env_bootstrap;
pub mod settings;
pub mod skill;
pub mod term;
#[cfg(debug_assertions)]
pub mod test_support;
pub mod vault;
