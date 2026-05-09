//! axum router builder. Three routes:
//!   • `GET  /health`  — Playwright readiness probe (`webServer.url`)
//!   • `POST /invoke`  — JSON `{cmd,args}` → impl-fn dispatch
//!   • `GET  /events`  — SSE stream replaying `EventBus` broadcasts
//!
//! CORS is permissive (any origin / method / header) because the only
//! consumer is `next dev` on `localhost:3000` — the test_server never
//! ships in release builds and never binds outside loopback.

use std::sync::Arc;

use axum::{
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse,
    },
    routing::{get, post},
    Json, Router,
};
use futures::stream::Stream;
use serde_json::json;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::cors::{Any, CorsLayer};

use super::{dispatch, TestServerState};

pub fn build(state: Arc<TestServerState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/invoke", post(dispatch::invoke_handler))
        .route("/events", get(events_stream))
        .layer(
            CorsLayer::new()
                .allow_methods(Any)
                .allow_headers(Any)
                .allow_origin(Any),
        )
        .with_state(state)
}

async fn health() -> impl IntoResponse {
    Json(json!({ "ok": true, "service": "test_server" }))
}

async fn events_stream(
    axum::extract::State(state): axum::extract::State<Arc<TestServerState>>,
) -> Sse<impl Stream<Item = Result<Event, std::convert::Infallible>>> {
    let rx = state.events.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res| {
        let env = res.ok()?;
        let data = serde_json::to_string(&env).ok()?;
        Some(Ok(Event::default().event(env.name.clone()).data(data)))
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}
