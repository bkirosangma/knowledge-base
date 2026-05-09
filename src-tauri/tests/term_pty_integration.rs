//! Real-PTY integration tests promoted from MVP-3.5 § 6 "Defer to MVP-4".
//!
//! We bypass the #[tauri::command] wrappers (which require an AppHandle for
//! event emit) and call term::pty::* directly with a custom emit channel.
//! The wrappers in src-tauri/src/term/commands.rs are 5-line forwarders;
//! their parity is covered by code review, not by these tests.

use std::io::Write;
use std::time::Duration;
use tokio::sync::mpsc;

use knowledge_base_lib::term::pty::{close as pty_close, spawn_with_channel};
use knowledge_base_lib::test_support::TempVault;

#[tokio::test(flavor = "multi_thread")]
async fn echo_round_trip_emits_data_event() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let mut session = spawn_with_channel(vault.root.clone(), 24, 80, tx).expect("spawn pty");

    // Give zsh a moment to settle past the auto-typed `claude\n` (which may
    // either launch claude or print "command not found" depending on the
    // host). Either way, zsh returns to a prompt within a second.
    tokio::time::sleep(Duration::from_millis(800)).await;

    session
        .writer
        .write_all(b"echo hello\n")
        .expect("write echo");
    session.writer.flush().ok();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);
    let mut all = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let timeout = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(timeout, rx.recv()).await {
            Ok(Some(bytes)) => {
                all.extend_from_slice(&bytes);
                if String::from_utf8_lossy(&all).contains("hello") {
                    break;
                }
            }
            Ok(None) | Err(_) => break,
        }
    }

    let s = String::from_utf8_lossy(&all);
    assert!(
        s.contains("hello"),
        "expected 'hello' in PTY output, got {:?}",
        s
    );

    pty_close(session);
}

#[tokio::test(flavor = "multi_thread")]
async fn resize_does_not_crash() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, _rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let session = spawn_with_channel(vault.root.clone(), 24, 80, tx).expect("spawn pty");

    session
        .master
        .resize(portable_pty::PtySize {
            rows: 50,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("resize");

    pty_close(session);
}

#[tokio::test(flavor = "multi_thread")]
async fn close_is_safe_to_call_once_per_session() {
    let vault = TempVault::fresh().expect("fresh tempvault");
    let (tx, _rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let session = spawn_with_channel(vault.root.clone(), 24, 80, tx).expect("spawn pty");
    pty_close(session);
}
