use std::collections::VecDeque;
use std::time::{Duration, Instant};

const WINDOW: Duration = Duration::from_secs(60);
const THRESHOLD: usize = 3;

#[derive(Debug, Default)]
pub struct CrashTracker {
    timestamps: VecDeque<Instant>,
}

impl CrashTracker {
    pub fn new() -> Self {
        CrashTracker { timestamps: VecDeque::new() }
    }

    /// Record a crash. Returns true if the threshold has been hit (caller should stop respawning).
    pub fn record(&mut self) -> bool {
        let now = Instant::now();
        self.timestamps.push_back(now);
        // Drop entries older than WINDOW.
        while let Some(front) = self.timestamps.front() {
            if now.duration_since(*front) > WINDOW {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }
        self.timestamps.len() >= THRESHOLD
    }

    pub fn reset(&mut self) {
        self.timestamps.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_under_threshold_returns_false() {
        let mut t = CrashTracker::new();
        assert!(!t.record());
        assert!(!t.record());
    }

    #[test]
    fn three_in_window_returns_true() {
        let mut t = CrashTracker::new();
        t.record();
        t.record();
        assert!(t.record());
    }

    #[test]
    fn reset_clears() {
        let mut t = CrashTracker::new();
        t.record();
        t.record();
        t.record();
        t.reset();
        assert!(!t.record());
    }

    // Note: a real "old entries fall off after 60s" test would need a clock injection
    // to avoid sleeping for 60s in CI. Deferred — covered indirectly by manual smoke.
}
