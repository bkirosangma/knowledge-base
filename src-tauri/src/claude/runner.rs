use crate::claude::{crash::CrashTracker, parser, types::{ClaudeEvent, ClaudeUserMessage}};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

/// Long-lived `claude -p` subprocess wrapper.
pub struct Runner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    crash: CrashTracker,
    turn: u64,
    /// Accept-edits or default. Set at spawn time; changing requires reset.
    permission_mode: String,
}

impl Runner {
    pub fn new() -> Self {
        Runner {
            child: None,
            stdin: None,
            crash: CrashTracker::new(),
            turn: 0,
            permission_mode: "acceptEdits".into(),
        }
    }

    /// Spawn or reuse the subprocess.
    /// `app` is captured by the stdout-drain task to emit events.
    pub async fn ensure_alive(&mut self, app: AppHandle, vault_root: PathBuf, permission_mode: String)
        -> Result<(), String>
    {
        if self.child.as_mut().map_or(false, |c| c.try_wait().ok().flatten().is_none()) {
            return Ok(());
        }

        self.permission_mode = permission_mode.clone();

        let mut cmd = Command::new("claude");
        cmd.arg("-p")
            .arg("--verbose")
            .arg("--input-format").arg("stream-json")
            .arg("--output-format").arg("stream-json")
            .arg("--include-partial-messages")
            .arg("--include-hook-events")
            .arg("--permission-mode").arg(&permission_mode)
            .current_dir(&vault_root)
            .env_remove("ANTHROPIC_API_KEY")
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                // Spawn failed — record crash, possibly break the loop.
                if self.crash.record() {
                    return Err(format!("claude: failing to start (3 crashes in 60s): {}", e));
                }
                return Err(format!("spawn failed: {}", e));
            }
        };

        let stdin = child.stdin.take().ok_or("no stdin")?;
        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        self.stdin = Some(stdin);

        // Spawn drain tasks. Both emit through the app handle.
        let app_out = app.clone();
        let turn_at_spawn = self.turn;
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            let mut current_turn = turn_at_spawn;
            while let Ok(Some(line)) = reader.next_line().await {
                if let Some(event) = parser::parse_line(&line, current_turn) {
                    if let ClaudeEvent::MessageStart { turn } = event {
                        current_turn = turn;
                    }
                    let _ = app_out.emit("claude_event", event);
                }
            }
        });

        let app_err = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = app_err.emit("claude_event", ClaudeEvent::Error { message: line });
            }
        });

        // Watcher task: detects exit, fires crashed event.
        let app_exit = app.clone();
        // Note: we can't easily move `child` into a task while keeping it on Self.
        // Instead, we spawn a child-wait task only after capturing the pid; then
        // a separate maintenance check happens lazily from `send`.
        // For simplicity in this MVP we leave child on Self and check status in send().
        let _ = app_exit; // placeholder to silence unused warning

        self.child = Some(child);
        Ok(())
    }

    /// Push one message envelope onto stdin.
    pub async fn send(&mut self, app: AppHandle, vault_root: PathBuf, message: ClaudeUserMessage)
        -> Result<(), String>
    {
        // Detect prior exit.
        let still_alive = self.child.as_mut().map_or(false, |c| c.try_wait().ok().flatten().is_none());
        if !still_alive {
            if self.child.is_some() {
                let crashed_too_many = self.crash.record();
                let _ = app.emit("claude_event", ClaudeEvent::Crashed { reason: "subprocess exited".into() });
                if crashed_too_many {
                    self.child = None;
                    self.stdin = None;
                    return Err("claude: failing to start (3 crashes in 60s)".into());
                }
            }
            self.child = None;
            self.stdin = None;
            self.ensure_alive(app.clone(), vault_root, self.permission_mode.clone()).await?;
        }

        self.turn += 1;
        let envelope = serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": message.text },
        });
        let line = format!("{}\n", envelope);
        let stdin = self.stdin.as_mut().ok_or("no stdin")?;
        stdin.write_all(line.as_bytes()).await.map_err(|e| e.to_string())?;
        stdin.flush().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn current_turn(&self) -> u64 {
        self.turn
    }

    /// SIGINT to subprocess; keeps it alive for next turn.
    pub async fn interrupt(&mut self) -> Result<(), String> {
        let pid = self.child.as_ref().and_then(|c| c.id()).ok_or("no subprocess")?;
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(pid as i32, libc::SIGINT);
            }
            Ok(())
        }
        #[cfg(not(unix))]
        {
            let _ = pid;
            Err("interrupt only supported on unix".into())
        }
    }

    /// Kill subprocess and clear state. Next `send` respawns.
    pub async fn reset(&mut self) -> Result<(), String> {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill().await;
        }
        self.stdin = None;
        self.turn = 0;
        self.crash.reset();
        Ok(())
    }
}
