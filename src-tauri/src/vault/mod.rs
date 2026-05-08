//! Vault filesystem adapter (commands, IO, path safety, errors).

pub mod error;
pub mod io;
pub mod path;
pub use error::VaultError;
