pub mod commands;
pub mod pty;

use std::sync::Mutex;

use crate::term::pty::PtySession;

pub use commands::*;

/// App-managed state holding at most one live PTY session.
pub struct TermState(pub Mutex<Option<PtySession>>);

impl TermState {
    pub fn new() -> Self {
        TermState(Mutex::new(None))
    }
}

impl Default for TermState {
    fn default() -> Self {
        Self::new()
    }
}
