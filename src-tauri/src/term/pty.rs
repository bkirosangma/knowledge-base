//! PTY session management. Tasks 3-5 fill in spawn / write / resize / close.

use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

/// A live PTY session: the master end (read + resize), the writer for
/// stdin, the spawned child handle (for graceful close), the vault root
/// (for switch detection in Task 5), and the reader-task handle.
pub struct PtySession {
    pub vault_root: PathBuf,
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send + Sync>,
    pub reader_task: JoinHandle<()>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TermEventPayload {
    /// Bytes streamed from the PTY master. Frontend pipes into xterm.write().
    Data { bytes: Vec<u8> },
    /// Child exited. Frontend may surface "claude exited" / re-spawn.
    Exit,
}

/// Internal messages produced by the reader task. The production `spawn`
/// fans these out to `app.emit("term_event", ...)`; the debug-only
/// `spawn_with_channel` sibling forwards Data bytes to an mpsc channel and
/// drops Exit (tests close explicitly).
pub(crate) enum EmitMsg {
    Data(Vec<u8>),
    Exit,
}

/// Spawn `zsh -i -l` in the given vault, auto-type `claude\n`, start the
/// reader task. Caller must hold the TermState lock.
pub fn spawn(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    app: AppHandle,
) -> Result<PtySession, String> {
    spawn_inner(vault_root, rows, cols, move |msg| match msg {
        EmitMsg::Data(bytes) => {
            let _ = app.emit("term_event", TermEventPayload::Data { bytes });
        }
        EmitMsg::Exit => {
            let _ = app.emit("term_event", TermEventPayload::Exit);
        }
    })
}

/// Debug-only sibling of `spawn` for Rust integration tests that cannot
/// construct a real `AppHandle`. Forwards Data byte chunks to `tx`; drops
/// Exit (tests own session lifetime via `close`).
#[cfg(debug_assertions)]
pub fn spawn_with_channel(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    tx: tokio::sync::mpsc::UnboundedSender<Vec<u8>>,
) -> Result<PtySession, String> {
    spawn_inner(vault_root, rows, cols, move |msg| {
        if let EmitMsg::Data(bytes) = msg {
            let _ = tx.send(bytes);
        }
        // Exit: silently dropped — tests close the session explicitly.
    })
}

fn spawn_inner(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    emit: impl Fn(EmitMsg) + Send + 'static,
) -> Result<PtySession, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty: {e}"))?;

    let mut cmd = CommandBuilder::new("zsh");
    cmd.args(["-i", "-l"]);
    cmd.cwd(&vault_root);
    // ANTHROPIC_API_KEY is scrubbed by MVP-2 already at process level. No
    // re-scrub here — same env reaches both surfaces.

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn zsh: {e}"))?;

    let mut writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take_writer: {e}"))?;

    // Auto-type `claude\n` to launch claude inside the freshly-spawned shell.
    // Sleep a tiny bit so zsh has time to print its prompt first; the user
    // sees "$ claude\n" in their scrollback as if they typed it.
    std::thread::sleep(Duration::from_millis(150));
    writer
        .write_all(b"claude\n")
        .map_err(|e| format!("auto-type claude: {e}"))?;
    writer.flush().ok();

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("try_clone_reader: {e}"))?;

    let reader_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) => {
                    emit(EmitMsg::Exit);
                    break;
                }
                Ok(n) => {
                    emit(EmitMsg::Data(buf[..n].to_vec()));
                }
                Err(e) => {
                    eprintln!("term reader: {e}");
                    emit(EmitMsg::Exit);
                    break;
                }
            }
        }
    });

    Ok(PtySession {
        vault_root,
        master: pair.master,
        writer,
        child,
        reader_task,
    })
}

/// Graceful close: write Ctrl-C, wait 500ms, then kill the child + abort the
/// reader task.
pub fn close(mut session: PtySession) {
    // Best-effort Ctrl-C — ignore write errors (child may already be dead).
    let _ = session.writer.write_all(&[0x03]);
    let _ = session.writer.flush();

    std::thread::sleep(Duration::from_millis(500));

    let _ = session.child.kill();
    session.reader_task.abort();
}

/// Send Ctrl-C + cd + claude\n to an existing session's writer. Updates
/// vault_root in place. Caller holds the TermState lock.
pub fn restart_in_new_vault(session: &mut PtySession, new_vault: PathBuf) -> Result<(), String> {
    use std::io::Write;
    // Step 1: Ctrl-C — exits claude, returns control to zsh.
    session
        .writer
        .write_all(&[0x03])
        .map_err(|e| format!("ctrl-c: {e}"))?;
    session.writer.flush().ok();
    // Step 2: small sleep so claude finishes flushing exit + zsh re-emits prompt.
    std::thread::sleep(std::time::Duration::from_millis(250));
    // Step 3: cd to new vault.
    let cd_line = format!("cd {}\n", shell_escape(&new_vault.display().to_string()));
    session
        .writer
        .write_all(cd_line.as_bytes())
        .map_err(|e| format!("cd: {e}"))?;
    // Step 4: re-launch claude.
    session
        .writer
        .write_all(b"claude\n")
        .map_err(|e| format!("claude: {e}"))?;
    session.writer.flush().ok();

    session.vault_root = new_vault;
    Ok(())
}

/// Quote a path for use in a shell command. Escapes single quotes by ending
/// the quote, escaping the quote, and reopening it. Vault paths shouldn't
/// contain wild characters but this is the safe shape.
fn shell_escape(s: &str) -> String {
    if !s.contains('\'') {
        return format!("'{s}'");
    }
    format!("'{}'", s.replace('\'', r"'\''"))
}

#[cfg(test)]
mod tests {
    use super::shell_escape;

    #[test]
    fn shell_escape_basic() {
        assert_eq!(shell_escape("/Users/kiro/notes"), "'/Users/kiro/notes'");
    }

    #[test]
    fn shell_escape_with_spaces() {
        assert_eq!(
            shell_escape("/Users/kiro/My Vault"),
            "'/Users/kiro/My Vault'"
        );
    }

    #[test]
    fn shell_escape_with_apostrophe() {
        assert_eq!(
            shell_escape("/Users/joe's vault"),
            r"'/Users/joe'\''s vault'"
        );
    }
}
