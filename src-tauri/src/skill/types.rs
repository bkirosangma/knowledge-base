use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillStatus {
    pub installed: bool,
    pub target_path: String,
    pub bundled_path: String,
}
