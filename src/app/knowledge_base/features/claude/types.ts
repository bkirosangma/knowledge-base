export type ClaudeBinaryState = "found" | "missing";
export type ClaudeAuthMode = "oauth" | "api_key" | "unknown";

export interface ClaudeStatus {
  binary: ClaudeBinaryState;
  version?: string;
  auth: ClaudeAuthMode;
}

export interface ClaudeUserMessage {
  text: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export type ClaudeEvent =
  | { kind: "message_start"; turn: number }
  | { kind: "partial_text"; turn: number; delta: string }
  | { kind: "tool_use"; turn: number; tool: string; input: unknown }
  | { kind: "tool_result"; turn: number; tool: string; output: unknown }
  | { kind: "hook_event"; name: string; payload: unknown }
  | { kind: "message_end"; turn: number; usage?: TokenUsage }
  | { kind: "error"; message: string }
  | { kind: "crashed"; reason: string };

/** Aggregated session state, derived from a stream of ClaudeEvents. */
export interface ChatTurn {
  turn: number;
  role: "user" | "assistant";
  text: string;
  toolUses: Array<{ tool: string; input: unknown; output?: unknown }>;
  isStreaming: boolean;
  endedAt?: number;
}
