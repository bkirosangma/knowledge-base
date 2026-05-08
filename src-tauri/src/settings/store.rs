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
pub struct ClaudeChatSettings {
    pub height: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UiSettings {
    pub claude_chat: ClaudeChatSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub vault: VaultSettings,
    #[serde(default)]
    pub ui: UiSettings,
    #[serde(default)]
    pub claude: serde_json::Map<String, serde_json::Value>,
}

impl Default for ClaudeChatSettings {
    fn default() -> Self {
        Self { height: 320 }
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            vault: VaultSettings::default(),
            ui: UiSettings::default(),
            claude: serde_json::Map::new(),
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
        assert_eq!(json["ui"]["claudeChat"]["height"], 320);
    }

    #[test]
    fn settings_round_trip_through_serde_json() {
        let s = Settings {
            vault: VaultSettings {
                last_path: Some("/v".into()),
                recents: vec!["/v".into(), "/w".into()],
            },
            ui: UiSettings {
                claude_chat: ClaudeChatSettings { height: 480 },
            },
            claude: serde_json::Map::new(),
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
        assert_eq!(s.ui.claude_chat.height, 320);
    }
}
