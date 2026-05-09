//! PTY session management. Tasks 3-5 fill in spawn / write / resize / close.

use std::path::PathBuf;

/// A live PTY session: the master, the spawned child (zsh), the writer
/// handle for stdin, the vault root we spawned in (for vault-switch
/// detection), and the JoinHandle for the byte-drain reader task.
pub struct PtySession {
    pub vault_root: PathBuf,
    // master + child + writer + reader_task fields land in Task 3.
}
