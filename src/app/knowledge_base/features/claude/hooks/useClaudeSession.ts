import { useCallback, useEffect, useReducer, useRef } from "react";
import { tauriBridge } from "../../../infrastructure/tauriBridge";
import type { ChatTurn, ClaudeEvent, TokenUsage } from "../types";

interface SessionState {
  turns: ChatTurn[];
  usage: TokenUsage;
  errorMessage: string | null;
  isStreaming: boolean;
}

const INITIAL: SessionState = {
  turns: [],
  usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  errorMessage: null,
  isStreaming: false,
};

type Action =
  | { type: "user"; text: string }
  | { type: "event"; event: ClaudeEvent }
  | { type: "reset" };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "user": {
      const turnNum = state.turns.length + 1;
      return {
        ...state,
        turns: [
          ...state.turns,
          {
            turn: turnNum,
            role: "user",
            text: action.text,
            toolUses: [],
            isStreaming: false,
          },
        ],
      };
    }
    case "reset":
      return INITIAL;
    case "event": {
      const e = action.event;
      switch (e.kind) {
        case "message_start": {
          return {
            ...state,
            isStreaming: true,
            turns: [
              ...state.turns,
              {
                turn: e.turn,
                role: "assistant",
                text: "",
                toolUses: [],
                isStreaming: true,
              },
            ],
          };
        }
        case "partial_text": {
          return {
            ...state,
            turns: state.turns.map((t) =>
              t.role === "assistant" && t.isStreaming
                ? { ...t, text: t.text + e.delta }
                : t,
            ),
          };
        }
        case "tool_use": {
          return {
            ...state,
            turns: state.turns.map((t) =>
              t.role === "assistant" && t.isStreaming
                ? {
                    ...t,
                    toolUses: [
                      ...t.toolUses,
                      { tool: e.tool, input: e.input },
                    ],
                  }
                : t,
            ),
          };
        }
        case "tool_result": {
          return {
            ...state,
            turns: state.turns.map((t) => {
              if (t.role !== "assistant" || !t.isStreaming) return t;
              const last = t.toolUses[t.toolUses.length - 1];
              if (!last || last.tool !== e.tool) return t;
              const updated = [...t.toolUses];
              updated[updated.length - 1] = { ...last, output: e.output };
              return { ...t, toolUses: updated };
            }),
          };
        }
        case "message_end": {
          // The Rust parser fans out a single LLM turn into THREE message_end
          // events (one for stream-json `message_delta` w/ usage, one for
          // `message_stop` w/o usage, one for the final `result` line w/ cost).
          // Detect the duplicate by looking for an assistant turn that's still
          // streaming. If none exists, this is a fan-out duplicate — drop it,
          // unless it carries a costUsd that the first end did not record.
          const streamingIdx = state.turns.findIndex(
            (t) => t.role === "assistant" && t.isStreaming,
          );
          if (streamingIdx === -1) {
            // Duplicate end. Patch in cost from the result line if the first
            // end had none.
            if (
              e.usage?.costUsd != null &&
              (state.usage.costUsd == null || state.usage.costUsd === 0)
            ) {
              return {
                ...state,
                usage: { ...state.usage, costUsd: e.usage.costUsd },
              };
            }
            return state;
          }
          // First end for this turn: end the turn and accumulate usage once.
          const usage = e.usage
            ? {
                inputTokens:
                  state.usage.inputTokens + (e.usage.inputTokens ?? 0),
                outputTokens:
                  state.usage.outputTokens + (e.usage.outputTokens ?? 0),
                costUsd: (state.usage.costUsd ?? 0) + (e.usage.costUsd ?? 0),
              }
            : state.usage;
          return {
            ...state,
            isStreaming: false,
            usage,
            turns: state.turns.map((t, i) =>
              i === streamingIdx
                ? { ...t, isStreaming: false, endedAt: Date.now() }
                : t,
            ),
          };
        }
        case "error": {
          return {
            ...state,
            errorMessage: e.message,
            isStreaming: false,
          };
        }
        case "crashed": {
          return {
            ...state,
            isStreaming: false,
            errorMessage: `Claude crashed: ${e.reason}`,
          };
        }
        case "hook_event":
          // Reducer drops hook_event entirely — chat surface doesn't render
          // hook output (spec § 7.4). A future debug panel may re-surface it.
          return state;
      }
    }
  }
}

export function useClaudeSession() {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let active = true;
    void tauriBridge
      .subscribeClaudeEvent((event) => {
        if (!active) return;
        dispatch({ type: "event", event });
      })
      .then((unsub) => {
        if (active) unsubRef.current = unsub;
        else unsub();
      });
    return () => {
      active = false;
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  const send = useCallback(async (text: string) => {
    dispatch({ type: "user", text });
    await tauriBridge.claudeSend({ text });
  }, []);

  const interrupt = useCallback(async () => {
    await tauriBridge.claudeInterrupt();
  }, []);

  const reset = useCallback(async () => {
    await tauriBridge.claudeReset();
    dispatch({ type: "reset" });
  }, []);

  return {
    turns: state.turns,
    usage: state.usage,
    errorMessage: state.errorMessage,
    isStreaming: state.isStreaming,
    send,
    interrupt,
    reset,
  };
}
