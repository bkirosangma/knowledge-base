pub mod commands;
pub mod crash;
pub mod parser;
pub mod runner;
pub mod status;
pub mod types;

use tokio::sync::Mutex;

/// Tauri-managed state holding the long-lived subprocess and crash tracker.
pub struct ClaudeState(pub Mutex<runner::Runner>);

impl ClaudeState {
    pub fn new() -> Self {
        ClaudeState(Mutex::new(runner::Runner::new()))
    }
}
