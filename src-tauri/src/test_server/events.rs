//! Tauri-event → SSE bridge. Production code emits events via
//! `app.emit("vault_change", payload)`; the test_server hands handlers
//! an `EventBus` whose `.emit()` broadcasts to connected `/events` SSE
//! clients. Currently unused — the four MVP-4.x proof-set specs do not
//! assert event delivery — but the scaffold is one-edit-upgrade-ready
//! for future specs that need a real fan-out.

use serde::Serialize;
use tokio::sync::broadcast;

#[derive(Clone)]
pub struct EventBus {
    pub tx: broadcast::Sender<EventEnvelope>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EventEnvelope {
    pub name: String,
    pub payload: serde_json::Value,
}

impl EventBus {
    pub fn new() -> Self {
        let (tx, _rx) = broadcast::channel(256);
        Self { tx }
    }

    #[allow(dead_code)] // wired in MVP-5 once specs exercise events
    pub fn emit<T: Serialize>(&self, name: &str, payload: T) {
        let env = EventEnvelope {
            name: name.to_string(),
            payload: serde_json::to_value(payload).unwrap_or(serde_json::Value::Null),
        };
        let _ = self.tx.send(env);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EventEnvelope> {
        self.tx.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
