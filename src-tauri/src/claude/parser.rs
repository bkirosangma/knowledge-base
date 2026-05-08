use crate::claude::types::{ClaudeEvent, TokenUsage};
use serde_json::Value;

/// Parse one stream-json line. Returns None for unknown / ignored event shapes.
pub fn parse_line(line: &str, current_turn: u64) -> Option<ClaudeEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let kind = v.get("type")?.as_str()?;

    match kind {
        "message_start" => Some(ClaudeEvent::MessageStart { turn: current_turn }),
        "content_block_delta" | "message_delta" => {
            let delta = v.pointer("/delta/text")
                .and_then(Value::as_str)
                .unwrap_or("");
            if delta.is_empty() { return None; }
            Some(ClaudeEvent::PartialText { turn: current_turn, delta: delta.into() })
        }
        "tool_use" => {
            let tool = v.get("name")?.as_str()?.to_string();
            let input = v.get("input").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::ToolUse { turn: current_turn, tool, input })
        }
        "tool_result" => {
            let tool = v.get("tool_name").and_then(Value::as_str).unwrap_or("").to_string();
            let output = v.get("content").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::ToolResult { turn: current_turn, tool, output })
        }
        "hook_event" => {
            let name = v.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let payload = v.get("payload").cloned().unwrap_or(Value::Null);
            Some(ClaudeEvent::HookEvent { name, payload })
        }
        "message_stop" | "message_end" => {
            let usage = v.pointer("/usage").and_then(|u| serde_json::from_value::<TokenUsage>(u.clone()).ok());
            Some(ClaudeEvent::MessageEnd { turn: current_turn, usage })
        }
        "error" => {
            let message = v.get("message")
                .and_then(Value::as_str)
                .unwrap_or("unknown error")
                .to_string();
            Some(ClaudeEvent::Error { message })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_message_start() {
        let line = r#"{"type":"message_start"}"#;
        let e = parse_line(line, 1);
        assert!(matches!(e, Some(ClaudeEvent::MessageStart { turn: 1 })));
    }

    #[test]
    fn parses_content_block_delta() {
        let line = r#"{"type":"content_block_delta","delta":{"text":"Hello"}}"#;
        let e = parse_line(line, 2);
        match e {
            Some(ClaudeEvent::PartialText { turn, delta }) => {
                assert_eq!(turn, 2);
                assert_eq!(delta, "Hello");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_tool_use() {
        let line = r#"{"type":"tool_use","name":"Read","input":{"path":"foo.md"}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::ToolUse { tool, input, .. }) => {
                assert_eq!(tool, "Read");
                assert_eq!(input.get("path").unwrap(), "foo.md");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_message_stop_with_usage() {
        let line = r#"{"type":"message_stop","usage":{"inputTokens":12,"outputTokens":4}}"#;
        let e = parse_line(line, 3);
        match e {
            Some(ClaudeEvent::MessageEnd { turn, usage }) => {
                assert_eq!(turn, 3);
                let u = usage.unwrap();
                assert_eq!(u.input_tokens, 12);
                assert_eq!(u.output_tokens, 4);
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn unknown_type_returns_none() {
        let line = r#"{"type":"random_unknown_event"}"#;
        assert!(parse_line(line, 1).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse_line("not json", 1).is_none());
    }
}
