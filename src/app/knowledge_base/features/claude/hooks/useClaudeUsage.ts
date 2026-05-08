import { useChat } from "../ChatContext";

export interface ClaudeUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Footer-status accumulator: surfaces the latest model name plus the
 * running token / cost totals from the chat session. The model is read
 * from the most recent assistant turn's `model` field (set by the
 * `message_start` reducer case from the Rust parser's
 * `event.message.model` extraction).
 */
export function useClaudeUsage(): ClaudeUsage {
  const { usage, turns } = useChat();
  const lastAssistant = [...turns].reverse().find((t) => t.role === "assistant");
  const model = lastAssistant?.model ?? null;
  return {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: usage.costUsd ?? 0,
  };
}
