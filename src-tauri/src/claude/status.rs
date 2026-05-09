use crate::claude::types::ClaudeStatus;
use std::path::PathBuf;
use tokio::process::Command;

/// Resolve the Claude binary path. Returns None if the binary isn't on PATH.
pub fn locate_binary() -> Option<PathBuf> {
    which::which("claude").ok()
}

/// Run `<bin> --version` and parse the leading semver token. Returns None on failure.
pub async fn read_version(bin: &PathBuf) -> Option<String> {
    let output = Command::new(bin).arg("--version").output().await.ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    parse_version_line(&stdout)
}

/// Strip everything after the semver token. "2.1.129 (Claude Code)\n" → "2.1.129".
pub fn parse_version_line(line: &str) -> Option<String> {
    let token = line.split_whitespace().next()?;
    if token.chars().next()?.is_ascii_digit() {
        Some(token.to_string())
    } else {
        None
    }
}

/// Detect auth posture by checking common credential locations + env.
/// Returns "oauth" if ~/.claude/.credentials or keychain hit; "api_key" if env set; else "unknown".
pub fn detect_auth_mode() -> &'static str {
    if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        return "api_key";
    }
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return "unknown",
    };
    let oauth_paths = [
        home.join(".claude").join(".credentials.json"),
        home.join(".config").join("claude").join("credentials.json"),
    ];
    if oauth_paths.iter().any(|p| p.exists()) {
        return "oauth";
    }
    "unknown"
}

pub async fn detect() -> ClaudeStatus {
    match locate_binary() {
        None => ClaudeStatus {
            binary: "missing".into(),
            version: None,
            auth: detect_auth_mode().into(),
        },
        Some(bin) => {
            let version = read_version(&bin).await;
            ClaudeStatus {
                binary: "found".into(),
                version,
                auth: detect_auth_mode().into(),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_version_line_strips_trailing_text() {
        assert_eq!(
            parse_version_line("2.1.129 (Claude Code)\n").as_deref(),
            Some("2.1.129")
        );
    }

    #[test]
    fn parse_version_line_rejects_non_numeric_lead() {
        assert_eq!(parse_version_line("hello world").as_deref(), None);
    }

    #[test]
    fn parse_version_line_handles_empty() {
        assert_eq!(parse_version_line("").as_deref(), None);
    }

    #[test]
    fn detect_auth_mode_returns_known_value() {
        let mode = detect_auth_mode();
        assert!(["oauth", "api_key", "unknown"].contains(&mode));
    }
}
