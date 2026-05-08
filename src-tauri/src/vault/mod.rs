//! Vault filesystem adapter (commands, IO, path safety, errors).

use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

pub mod commands;
pub mod error;
pub mod io;
pub mod path;
pub use error::VaultError;

/// In-memory holder for the active vault root path. Tauri stores this as
/// shared state; commands lock-and-clone the root before doing IO.
#[derive(Default)]
pub struct Vault {
    pub root: RwLock<Option<PathBuf>>,
}

pub type VaultState = Arc<Vault>;

impl Vault {
    pub async fn root_or_error(&self) -> Result<PathBuf, VaultError> {
        self.root.read().await.clone().ok_or(VaultError::NoVault)
    }

    pub async fn set_root(&self, path: PathBuf) {
        *self.root.write().await = Some(path);
    }
}
