// Covers the footer-status accumulator: model derivation from the most
// recent assistant turn, token totals pass-through, and undefined-cost
// normalization (so the footer never renders "$NaN").
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../ChatContext", () => ({
  useChat: vi.fn(),
}));

import { useChat } from "../ChatContext";
import { useClaudeUsage } from "./useClaudeUsage";

describe("useClaudeUsage", () => {
  it("returns zero state when no turns", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      turns: [],
    } as unknown as ReturnType<typeof useChat>);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current).toEqual({
      model: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
  });

  it("derives model from most recent assistant turn", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 12400, outputTokens: 3200, costUsd: 0.04 },
      turns: [
        {
          turn: 1,
          role: "user",
          text: "hi",
          toolUses: [],
          isStreaming: false,
        },
        {
          turn: 1,
          role: "assistant",
          text: "hello",
          toolUses: [],
          isStreaming: false,
          model: "sonnet-4-6",
        },
      ],
    } as unknown as ReturnType<typeof useChat>);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current.model).toBe("sonnet-4-6");
    expect(result.current.inputTokens).toBe(12400);
    expect(result.current.outputTokens).toBe(3200);
    expect(result.current.costUsd).toBe(0.04);
  });

  it("uses null model when assistant turn has no model field", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 5, outputTokens: 5, costUsd: 0.01 },
      turns: [
        {
          turn: 1,
          role: "assistant",
          text: "ok",
          toolUses: [],
          isStreaming: false,
        },
      ],
    } as unknown as ReturnType<typeof useChat>);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current.model).toBeNull();
  });

  it("normalizes undefined costUsd to 0", () => {
    vi.mocked(useChat).mockReturnValue({
      usage: { inputTokens: 10, outputTokens: 5, costUsd: undefined },
      turns: [],
    } as unknown as ReturnType<typeof useChat>);
    const { result } = renderHook(() => useClaudeUsage());
    expect(result.current.costUsd).toBe(0);
  });
});
