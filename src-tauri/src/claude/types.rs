use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeStatus {
    /// "found" or "missing"
    pub binary: String,
    /// e.g. "2.1.129" — present only when binary is found
    pub version: Option<String>,
    /// "oauth" | "api_key" | "unknown"
    pub auth: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeUserMessage {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ClaudeEvent {
    MessageStart { turn: u64, model: Option<String> },
    PartialText { turn: u64, delta: String },
    ToolUse { turn: u64, tool: String, input: serde_json::Value },
    ToolResult { turn: u64, tool: String, output: serde_json::Value },
    HookEvent { name: String, payload: serde_json::Value },
    MessageEnd { turn: u64, usage: Option<TokenUsage> },
    Error { message: String },
    Crashed { reason: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Optional cost in USD; computed by Claude or by the parser if model rate is known.
    pub cost_usd: Option<f64>,
}
