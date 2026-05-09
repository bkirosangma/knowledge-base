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

/// Spawn `zsh -i -l` in the given vault, auto-type `claude\n`, start the
/// reader task. Caller must hold the TermState lock.
pub fn spawn(
    vault_root: PathBuf,
    rows: u16,
    cols: u16,
    app: AppHandle,
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

    let reader_app = app.clone();
    let reader_task = tokio::task::spawn_blocking(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match std::io::Read::read(&mut reader, &mut buf) {
                Ok(0) => {
                    let _ = reader_app.emit("term_event", TermEventPayload::Exit);
                    break;
                }
                Ok(n) => {
                    let payload = TermEventPayload::Data {
                        bytes: buf[..n].to_vec(),
                    };
                    let _ = reader_app.emit("term_event", payload);
                }
                Err(e) => {
                    eprintln!("term reader: {e}");
                    let _ = reader_app.emit("term_event", TermEventPayload::Exit);
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
