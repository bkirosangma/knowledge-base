export interface ClaudeUsage {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const ZERO: ClaudeUsage = { model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 };

/** Stub — Task 15 replaces the body with a real accumulator. */
export function useClaudeUsage(): ClaudeUsage {
  return ZERO;
}
