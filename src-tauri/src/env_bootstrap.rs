//! Captures the user's login-shell PATH once at app boot and merges it into
//! the current process env. macOS / Linux GUI apps don't inherit dotfile-
//! defined PATH otherwise, which breaks `which::which("claude")` and any
//! spawned `zsh -i -l` PTY that needs to resolve user-installed binaries.

use std::process::Command;

/// Run `/bin/zsh -ilc env`, parse the output, and merge any captured PATH
/// into the current process. Errors are logged-and-swallowed: if the shell
/// command fails or produces no PATH line, we keep the inherited env.
pub fn merge_login_shell_path() {
    let output = match Command::new("/bin/zsh").args(["-ilc", "env"]).output() {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            eprintln!(
                "env_bootstrap: zsh -ilc env failed with status {:?}",
                o.status
            );
            return;
        }
        Err(e) => {
            eprintln!("env_bootstrap: failed to spawn /bin/zsh: {e}");
            return;
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    if let Some(path) = parse_path(&stdout) {
        std::env::set_var("PATH", path);
    }
}

/// Extract the PATH line from `env` output. Returns the raw value (everything
/// after `PATH=`), preserving colons, spaces, and any quirks.
fn parse_path(env_output: &str) -> Option<String> {
    for line in env_output.lines() {
        if let Some(rest) = line.strip_prefix("PATH=") {
            return Some(rest.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_path;

    #[test]
    fn parse_path_basic() {
        let env = "HOME=/Users/alice\nPATH=/usr/local/bin:/usr/bin:/bin\nSHELL=/bin/zsh\n";
        assert_eq!(
            parse_path(env).as_deref(),
            Some("/usr/local/bin:/usr/bin:/bin")
        );
    }

    #[test]
    fn parse_path_with_spaces() {
        let env = "PATH=/Users/alice/bin:/Applications/Some App.app/Contents/bin:/usr/bin\n";
        assert_eq!(
            parse_path(env).as_deref(),
            Some("/Users/alice/bin:/Applications/Some App.app/Contents/bin:/usr/bin")
        );
    }

    #[test]
    fn parse_path_missing_returns_none() {
        let env = "HOME=/Users/alice\nSHELL=/bin/zsh\n";
        assert!(parse_path(env).is_none());
    }

    #[test]
    fn parse_path_first_match_wins_when_duplicated() {
        let env = "PATH=/first\nPATH=/second\n";
        assert_eq!(parse_path(env).as_deref(), Some("/first"));
    }
}
