// Covers CHAT-12.2-01 through 12.2-09 — useClaudeSession reducer
// (turns, usage, errors, message_end fan-out de-duplication).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as tauriBridgeModule from "../../../infrastructure/tauriBridge";
import type { ClaudeEvent } from "../types";
import { useClaudeSession } from "./useClaudeSession";

const eventHandlers: Array<(e: ClaudeEvent) => void> = [];

vi.spyOn(tauriBridgeModule.tauriBridge, "claudeSend").mockResolvedValue(
  undefined,
);
vi.spyOn(tauriBridgeModule.tauriBridge, "claudeInterrupt").mockResolvedValue(
  undefined,
);
vi.spyOn(tauriBridgeModule.tauriBridge, "claudeReset").mockResolvedValue(
  undefined,
);
vi.spyOn(tauriBridgeModule.tauriBridge, "subscribeClaudeEvent").mockImplementation(
  async (handler) => {
    eventHandlers.push(handler);
    return () => {
      const i = eventHandlers.indexOf(handler);
      if (i >= 0) eventHandlers.splice(i, 1);
    };
  },
);

function fireEvent(payload: ClaudeEvent) {
  for (const h of eventHandlers) h(payload);
}

describe("useClaudeSession", () => {
  beforeEach(() => {
    eventHandlers.length = 0;
    vi.mocked(tauriBridgeModule.tauriBridge.claudeSend).mockClear();
    vi.mocked(tauriBridgeModule.tauriBridge.claudeInterrupt).mockClear();
    vi.mocked(tauriBridgeModule.tauriBridge.claudeReset).mockClear();
  });

  it("starts with no turns", () => {
    const { result } = renderHook(() => useClaudeSession());
    expect(result.current.turns).toEqual([]);
  });

  it("appends user turn on send", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hello");
    });
    expect(result.current.turns).toHaveLength(1);
    expect(result.current.turns[0]).toMatchObject({
      role: "user",
      text: "hello",
    });
  });

  it("starts assistant turn on message_start", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
    });
    expect(result.current.turns).toHaveLength(2);
    expect(result.current.turns[1]).toMatchObject({
      role: "assistant",
      isStreaming: true,
    });
  });

  it("accumulates partial_text deltas", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "partial_text", turn: 1, delta: "Hel" });
      fireEvent({ kind: "partial_text", turn: 1, delta: "lo" });
    });
    expect(result.current.turns[1].text).toBe("Hello");
    expect(result.current.turns[1].isStreaming).toBe(true);
  });

  it("marks turn ended on message_end", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "partial_text", turn: 1, delta: "ok" });
      fireEvent({
        kind: "message_end",
        turn: 1,
        usage: { inputTokens: 5, outputTokens: 1 },
      });
    });
    expect(result.current.turns[1].isStreaming).toBe(false);
    expect(result.current.usage.inputTokens).toBe(5);
    expect(result.current.usage.outputTokens).toBe(1);
  });

  it("captures tool_use", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({
        kind: "tool_use",
        turn: 1,
        tool: "Read",
        input: { path: "x.md" },
      });
    });
    expect(result.current.turns[1].toolUses).toHaveLength(1);
    expect(result.current.turns[1].toolUses[0].tool).toBe("Read");
  });

  it("clears state on reset", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      await result.current.reset();
    });
    expect(result.current.turns).toEqual([]);
  });

  it("ignores duplicate message_end for already-ended turn", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      fireEvent({ kind: "partial_text", turn: 1, delta: "ok" });
      fireEvent({
        kind: "message_end",
        turn: 1,
        usage: { inputTokens: 5, outputTokens: 1 },
      });
      // Second message_end (parser fan-out) — should NOT re-accumulate tokens.
      fireEvent({
        kind: "message_end",
        turn: 1,
        usage: { inputTokens: 5, outputTokens: 1 },
      });
    });
    expect(result.current.usage.inputTokens).toBe(5);
    expect(result.current.usage.outputTokens).toBe(1);
  });

  it("patches cost into existing usage from late result-line message_end", async () => {
    const { result } = renderHook(() => useClaudeSession());
    await act(async () => {
      await result.current.send("hi");
      fireEvent({ kind: "message_start", turn: 1 });
      // First end: tokens but no cost (message_delta path).
      fireEvent({
        kind: "message_end",
        turn: 1,
        usage: { inputTokens: 6, outputTokens: 6 },
      });
      // Late end from the result line — carries cost.
      fireEvent({
        kind: "message_end",
        turn: 1,
        usage: { inputTokens: 6, outputTokens: 6, costUsd: 0.247 },
      });
    });
    expect(result.current.usage.inputTokens).toBe(6); // not 12
    expect(result.current.usage.outputTokens).toBe(6); // not 12
    expect(result.current.usage.costUsd).toBe(0.247);
  });
});
