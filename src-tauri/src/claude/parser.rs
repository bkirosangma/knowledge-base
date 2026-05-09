use crate::claude::types::{ClaudeEvent, TokenUsage};
use serde_json::Value;

/// Parse one stream-json line. Returns None for unknown / ignored event shapes.
///
/// The Claude CLI emits a wrapped format when invoked with --verbose
/// --output-format stream-json:
///   - Top-level `type` is one of: system | stream_event | assistant | user | result | rate_limit_event.
///   - Real Anthropic API events live nested under `stream_event.event.{type,...}`.
///   - `assistant` / `user` carry assembled messages (used here only for tool_use / tool_result detection).
///   - `result` carries the final usage + total_cost_usd.
///   - `system` carries hook lifecycle events.
pub fn parse_line(line: &str, current_turn: u64) -> Option<ClaudeEvent> {
    let v: Value = serde_json::from_str(line).ok()?;
    let outer_type = v.get("type")?.as_str()?;

    match outer_type {
        "stream_event" => parse_stream_event(v.get("event")?, current_turn),
        "assistant" => parse_assistant_line(&v, current_turn),
        "user" => parse_user_line(&v, current_turn),
        "result" => parse_result_line(&v, current_turn),
        "system" => parse_system_line(&v),
        // rate_limit_event, etc. — ignore.
        _ => None,
    }
}

fn parse_stream_event(event: &Value, current_turn: u64) -> Option<ClaudeEvent> {
    let inner_type = event.get("type")?.as_str()?;
    match inner_type {
        "message_start" => {
            let model = event
                .pointer("/message/model")
                .and_then(Value::as_str)
                .map(str::to_string);
            Some(ClaudeEvent::MessageStart {
                turn: current_turn,
                model,
            })
        }
        "content_block_delta" => {
            // delta.type === "text_delta" → text chunk.
            // delta.type === "input_json_delta" → tool input delta (ignore for MVP-2; tool_use comes from assistant line).
            let delta = event.get("delta")?;
            let delta_type = delta.get("type").and_then(Value::as_str).unwrap_or("");
            if delta_type != "text_delta" {
                return None;
            }
            let text = delta.get("text").and_then(Value::as_str).unwrap_or("");
            if text.is_empty() {
                return None;
            }
            Some(ClaudeEvent::PartialText {
                turn: current_turn,
                delta: text.to_string(),
            })
        }
        "message_delta" => {
            // Carries final usage on event.usage.
            let usage = event.get("usage").and_then(parse_usage);
            Some(ClaudeEvent::MessageEnd {
                turn: current_turn,
                usage,
            })
        }
        "message_stop" => {
            // Sometimes the only signal of end (when message_delta wasn't emitted).
            // We emit MessageEnd with no usage; the result line (top-level "type":"result")
            // will follow with full usage + cost — but per the current ClaudeEvent shape,
            // usage gets aggregated by message_delta when present.
            Some(ClaudeEvent::MessageEnd {
                turn: current_turn,
                usage: None,
            })
        }
        // content_block_start / content_block_stop — structural; ignore.
        _ => None,
    }
}

fn parse_assistant_line(v: &Value, current_turn: u64) -> Option<ClaudeEvent> {
    // assistant.message.content is an array; emit ToolUse for any tool_use block.
    let content = v.pointer("/message/content")?.as_array()?;
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("tool_use") {
            let tool = block.get("name")?.as_str()?.to_string();
            let input = block.get("input").cloned().unwrap_or(Value::Null);
            // We can only emit one event per call; if multiple tool_uses are in one assistant line,
            // they get coalesced by the caller (drain task) re-invoking parse_line per JSON line.
            // In practice, a single assistant line carries one block at a time.
            return Some(ClaudeEvent::ToolUse {
                turn: current_turn,
                tool,
                input,
            });
        }
    }
    None
}

fn parse_user_line(v: &Value, current_turn: u64) -> Option<ClaudeEvent> {
    // user.message.content array; emit ToolResult for any tool_result block.
    let content = v.pointer("/message/content")?.as_array()?;
    for block in content {
        if block.get("type").and_then(Value::as_str) == Some("tool_result") {
            // Tool name isn't directly on the result; tool_use_id links it. For MVP-2,
            // we surface "" as the tool name and let the frontend pair via order.
            let tool = block
                .get("tool_use_id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            let output = block.get("content").cloned().unwrap_or(Value::Null);
            return Some(ClaudeEvent::ToolResult {
                turn: current_turn,
                tool,
                output,
            });
        }
    }
    None
}

fn parse_result_line(v: &Value, current_turn: u64) -> Option<ClaudeEvent> {
    // Final summary; has usage + total_cost_usd. We treat this as MessageEnd with usage.
    let usage = v.get("usage").and_then(parse_usage);
    // Pull cost_usd from total_cost_usd into our usage struct so the frontend sees real $.
    let cost_usd = v.get("total_cost_usd").and_then(Value::as_f64);
    let usage = match (usage, cost_usd) {
        (Some(mut u), Some(c)) => {
            u.cost_usd = Some(c);
            Some(u)
        }
        (Some(u), None) => Some(u),
        (None, Some(c)) => Some(TokenUsage {
            input_tokens: 0,
            output_tokens: 0,
            cost_usd: Some(c),
        }),
        (None, None) => None,
    };
    Some(ClaudeEvent::MessageEnd {
        turn: current_turn,
        usage,
    })
}

fn parse_system_line(v: &Value) -> Option<ClaudeEvent> {
    // system carries hook lifecycle events; surface as HookEvent.
    let subtype = v.get("subtype")?.as_str()?;
    if !subtype.starts_with("hook_") {
        return None;
    }
    let name = v
        .get("hook_name")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
        .to_string();
    Some(ClaudeEvent::HookEvent {
        name,
        payload: v.clone(),
    })
}

/// Parse a usage object from event.usage or result.usage. Both share the field shape:
///   { input_tokens, output_tokens, cache_read_input_tokens?, cache_creation_input_tokens?, ... }
fn parse_usage(u: &Value) -> Option<TokenUsage> {
    let input = u.get("input_tokens")?.as_u64()?;
    let output = u.get("output_tokens")?.as_u64()?;
    Some(TokenUsage {
        input_tokens: input,
        output_tokens: output,
        cost_usd: None, // result line will set this separately.
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stream_event_message_start() {
        let line = r#"{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-opus-4-7"}}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::MessageStart { turn, model }) => {
                assert_eq!(turn, 1);
                assert_eq!(model.as_deref(), Some("claude-opus-4-7"));
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_message_start_with_no_model() {
        let line = r#"{"type":"stream_event","event":{"type":"message_start"}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::MessageStart {
                turn: 1,
                model: None,
            }) => {}
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_text_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}}"#;
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
    fn ignores_input_json_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"k"}}}"#;
        assert!(parse_line(line, 1).is_none());
    }

    #[test]
    fn parses_tool_use_from_assistant_line() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"path":"foo.md"}}]}}"#;
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
    fn parses_tool_result_from_user_line() {
        let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"abc","content":"file contents"}]}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::ToolResult { tool, output, .. }) => {
                assert_eq!(tool, "abc");
                assert_eq!(output.as_str().unwrap(), "file contents");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_message_delta_with_usage() {
        let line = r#"{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":12,"output_tokens":4}}}"#;
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
    fn parses_result_line_with_cost() {
        let line = r#"{"type":"result","subtype":"success","total_cost_usd":0.0123,"usage":{"input_tokens":6,"output_tokens":6}}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::MessageEnd { turn: 1, usage }) => {
                let u = usage.unwrap();
                assert_eq!(u.input_tokens, 6);
                assert_eq!(u.output_tokens, 6);
                assert!((u.cost_usd.unwrap() - 0.0123).abs() < 1e-9);
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn parses_hook_started_system_line() {
        let line = r#"{"type":"system","subtype":"hook_started","hook_name":"SessionStart:startup","hook_id":"abc"}"#;
        let e = parse_line(line, 1);
        match e {
            Some(ClaudeEvent::HookEvent { name, .. }) => {
                assert_eq!(name, "SessionStart:startup");
            }
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[test]
    fn ignores_rate_limit_event() {
        let line = r#"{"type":"rate_limit_event","rate_limit_info":{}}"#;
        assert!(parse_line(line, 1).is_none());
    }

    #[test]
    fn unknown_outer_type_returns_none() {
        let line = r#"{"type":"random_unknown_outer"}"#;
        assert!(parse_line(line, 1).is_none());
    }

    #[test]
    fn malformed_json_returns_none() {
        assert!(parse_line("not json", 1).is_none());
    }

    #[test]
    fn ignores_content_block_start_and_stop() {
        let line1 = r#"{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}}"#;
        let line2 = r#"{"type":"stream_event","event":{"type":"content_block_stop","index":0}}"#;
        assert!(parse_line(line1, 1).is_none());
        assert!(parse_line(line2, 1).is_none());
    }

    /// End-to-end replay of the captured stream-json transcript. This is the
    /// strongest offline verification available — the capture is a real
    /// `claude -p --verbose --output-format stream-json` run that produced
    /// "pong" via two text deltas. If the wire format shifts, this test pins
    /// the regression.
    #[test]
    fn replays_captured_stream_transcript() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("docs/superpowers/plans/.mvp2-stream-json-capture.jsonl");
        let contents = std::fs::read_to_string(&path).expect("capture file present");

        let mut message_starts = 0;
        let mut partial_texts: Vec<String> = Vec::new();
        let mut message_ends = 0;
        let mut hook_events = 0;
        let mut tool_uses = 0;
        let mut tool_results = 0;
        let mut last_cost_usd: Option<f64> = None;

        for line in contents.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Some(event) = parse_line(line, 1) {
                match event {
                    ClaudeEvent::MessageStart { .. } => message_starts += 1,
                    ClaudeEvent::PartialText { delta, .. } => partial_texts.push(delta),
                    ClaudeEvent::MessageEnd { usage, .. } => {
                        message_ends += 1;
                        if let Some(u) = usage {
                            if u.cost_usd.is_some() {
                                last_cost_usd = u.cost_usd;
                            }
                        }
                    }
                    ClaudeEvent::HookEvent { .. } => hook_events += 1,
                    ClaudeEvent::ToolUse { .. } => tool_uses += 1,
                    ClaudeEvent::ToolResult { .. } => tool_results += 1,
                    ClaudeEvent::Error { .. } | ClaudeEvent::Crashed { .. } => {}
                }
            }
        }

        assert_eq!(message_starts, 1, "expected exactly one MessageStart");
        assert_eq!(
            partial_texts,
            vec!["p".to_string(), "ong".to_string()],
            "expected two text deltas spelling 'pong'"
        );
        // message_delta + message_stop + result line all map to MessageEnd.
        assert!(
            message_ends >= 2,
            "expected at least 2 MessageEnd events, got {}",
            message_ends
        );
        assert!(
            hook_events >= 4,
            "expected hook lifecycle events, got {}",
            hook_events
        );
        assert_eq!(tool_uses, 0, "no tool_use blocks in this transcript");
        assert_eq!(tool_results, 0, "no tool_result blocks in this transcript");
        let cost = last_cost_usd.expect("result line should carry cost_usd");
        assert!(
            (cost - 0.10246749).abs() < 1e-6,
            "cost_usd from result line: {}",
            cost
        );
    }
}
