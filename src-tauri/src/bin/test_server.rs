//! test_server — Playwright-driven HTTP server exposing production
//! Tauri command bodies for MVP-4.x e2e. NOT included in any release
//! bundle; debug-only via the `#[cfg(debug_assertions)] pub mod test_server;`
//! gate in `lib.rs`.
//!
//! Bind address is fixed at `127.0.0.1:1421` to match `playwright.config.ts`'s
//! `webServer.url` health probe. The address is loopback-only — the server
//! must never be reachable from off-host.

#[cfg(debug_assertions)]
mod debug_main {
    use std::sync::Arc;

    use knowledge_base_lib::test_server::{router, TestServerState};

    #[tokio::main]
    pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
        let state = Arc::new(TestServerState::new());
        let app = router::build(state.clone());

        let addr: std::net::SocketAddr = "127.0.0.1:1421".parse()?;
        eprintln!("[test_server] listening on http://{addr}");

        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;
        Ok(())
    }
}

fn main() {
    #[cfg(debug_assertions)]
    {
        if let Err(err) = debug_main::run() {
            eprintln!("[test_server] fatal: {err}");
            std::process::exit(1);
        }
    }
    #[cfg(not(debug_assertions))]
    {
        eprintln!("test_server is debug-only; rebuild without --release");
        std::process::exit(2);
    }
}
