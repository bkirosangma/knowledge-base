//! Mirrors MVP-3.5 § 4.7 "Lifecycle" — vault switch keeps the same PTY
//! alive and `pwd` reports the new root after the restart byte sequence.

use std::io::Write;
use std::time::Duration;
use tokio::sync::mpsc;

use knowledge_base_lib::term::pty::{close as pty_close, restart_in_new_vault, spawn_with_channel};
use knowledge_base_lib::test_support::TempVault;

async fn drain_until(
    rx: &mut mpsc::UnboundedReceiver<Vec<u8>>,
    needle: &str,
    timeout: Duration,
) -> String {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut all = Vec::new();
    while tokio::time::Instant::now() < deadline {
        let left = deadline.saturating_duration_since(tokio::time::Instant::now());
        match tokio::time::timeout(left, rx.recv()).await {
            Ok(Some(bytes)) => {
                all.extend_from_slice(&bytes);
                let s = String::from_utf8_lossy(&all);
                if s.contains(needle) {
                    return s.to_string();
                }
            }
            Ok(None) | Err(_) => break,
        }
    }
    String::from_utf8_lossy(&all).to_string()
}

#[tokio::test(flavor = "multi_thread")]
async fn vault_switch_keeps_pty_alive_and_changes_cwd() {
    let vault_a = TempVault::fresh().expect("vault a");
    let vault_b = TempVault::fresh().expect("vault b");
    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();

    let mut session = spawn_with_channel(vault_a.root.clone(), 24, 80, tx).expect("spawn");

    // Wait for the initial prompt before switching. macOS zsh's default
    // PROMPT is "%n@%m %1~ %# " — `%# ` resolves to "% " for non-root, so
    // we look for a generic "% " or "$ " marker. We accept either since
    // the auto-typed `claude\n` may run claude (TUI echoes prompt later)
    // or print "command not found" + zsh prompt.
    drain_until(&mut rx, "% ", Duration::from_secs(2)).await;

    restart_in_new_vault(&mut session, vault_b.root.clone()).expect("restart");

    // Send pwd and confirm vault_b's path appears.
    session.writer.write_all(b"pwd\n").expect("write pwd");
    session.writer.flush().ok();

    let needle = vault_b.root.to_string_lossy().to_string();
    let captured = drain_until(&mut rx, &needle, Duration::from_secs(3)).await;
    assert!(
        captured.contains(&needle),
        "expected pwd to report {} in PTY output, got:\n{}",
        needle,
        captured
    );

    pty_close(session);
}
