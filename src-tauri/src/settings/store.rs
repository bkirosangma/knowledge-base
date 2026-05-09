use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    #[serde(default)]
    pub last_path: Option<String>,
    #[serde(default)]
    pub recents: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDrawerUiSettings {
    pub height: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    // Accept old "claudeChat" key from settings files written before the
    // drawer rename; on the next write the new "claudeDrawer" key is used.
    #[serde(alias = "claudeChat")]
    pub claude_drawer: ClaudeDrawerUiSettings,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ClaudeSurface {
    #[default]
    Terminal,
    Chat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSettings {
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    #[serde(default)]
    pub surface: ClaudeSurface,
}

fn default_permission_mode() -> String {
    "acceptEdits".into()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub vault: VaultSettings,
    #[serde(default)]
    pub ui: UiSettings,
    #[serde(default)]
    pub claude: ClaudeSettings,
}

impl Default for ClaudeDrawerUiSettings {
    fn default() -> Self {
        Self { height: 320 }
    }
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            permission_mode: "acceptEdits".into(),
            surface: ClaudeSurface::Terminal,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_serialise_to_camel_case_with_320_height() {
        let s = Settings::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["vault"]["lastPath"], serde_json::Value::Null);
        assert_eq!(json["vault"]["recents"], serde_json::json!([]));
        assert_eq!(json["ui"]["claudeDrawer"]["height"], 320);
    }

    #[test]
    fn settings_round_trip_through_serde_json() {
        let s = Settings {
            vault: VaultSettings {
                last_path: Some("/v".into()),
                recents: vec!["/v".into(), "/w".into()],
            },
            ui: UiSettings {
                claude_drawer: ClaudeDrawerUiSettings { height: 480 },
            },
            claude: ClaudeSettings {
                permission_mode: "default".into(),
                surface: ClaudeSurface::Chat,
            },
        };
        let json = serde_json::to_value(&s).unwrap();
        let back: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn settings_deserialises_from_partial_json_with_defaults() {
        let json = serde_json::json!({ "vault": { "lastPath": "/v" } });
        let s: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(s.vault.last_path, Some("/v".into()));
        assert_eq!(s.vault.recents, Vec::<String>::new());
        assert_eq!(s.ui.claude_drawer.height, 320);
    }

    #[test]
    fn claude_settings_default_to_accept_edits_when_missing() {
        // Verifies migration: existing settings.json without a "claude" key
        // deserialise cleanly to permission_mode = "acceptEdits".
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.claude.permission_mode, "acceptEdits");

        // Also verify empty claude object fills in the default.
        let s2: Settings = serde_json::from_str(r#"{"claude":{}}"#).unwrap();
        assert_eq!(s2.claude.permission_mode, "acceptEdits");
    }

    #[test]
    fn claude_settings_serialise_to_camel_case() {
        let s = Settings::default();
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["claude"]["permissionMode"], "acceptEdits");
    }

    #[test]
    fn claude_surface_defaults_to_terminal() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.claude.surface, ClaudeSurface::Terminal);

        let s2: Settings = serde_json::from_str(r#"{"claude":{}}"#).unwrap();
        assert_eq!(s2.claude.surface, ClaudeSurface::Terminal);
    }

    #[test]
    fn claude_surface_round_trips_chat_variant() {
        let s = Settings {
            claude: ClaudeSettings {
                permission_mode: "acceptEdits".into(),
                surface: ClaudeSurface::Chat,
            },
            ..Default::default()
        };
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["claude"]["surface"], "chat");
        let back: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(back.claude.surface, ClaudeSurface::Chat);
    }

    #[test]
    fn ui_claude_drawer_migrates_from_old_claude_chat_key() {
        // Settings written before the rename use "claudeChat"; the serde alias
        // ensures they deserialise into claude_drawer without data loss.
        let json = serde_json::json!({ "ui": { "claudeChat": { "height": 450 } } });
        let s: Settings = serde_json::from_value(json).unwrap();
        assert_eq!(s.ui.claude_drawer.height, 450);
    }
}
