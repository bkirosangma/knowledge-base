import { describe, it, expect } from "vitest";
import type { ClaudeEvent, ClaudeStatus } from "./types";

describe("ClaudeEvent type", () => {
  it("accepts message_start variant", () => {
    const e: ClaudeEvent = { kind: "message_start", turn: 1 };
    expect(e.kind).toBe("message_start");
  });

  it("accepts partial_text with delta", () => {
    const e: ClaudeEvent = { kind: "partial_text", turn: 1, delta: "Hel" };
    expect(e.delta).toBe("Hel");
  });

  it("accepts tool_use with arbitrary input", () => {
    const e: ClaudeEvent = {
      kind: "tool_use",
      turn: 2,
      tool: "Read",
      input: { path: "foo.md" },
    };
    expect(e.tool).toBe("Read");
  });

  it("accepts message_end with optional usage", () => {
    const e: ClaudeEvent = {
      kind: "message_end",
      turn: 1,
      usage: { inputTokens: 12, outputTokens: 4, costUsd: 0.0001 },
    };
    expect(e.usage?.inputTokens).toBe(12);
  });

  it("accepts error variant", () => {
    const e: ClaudeEvent = { kind: "error", message: "boom" };
    expect(e.message).toBe("boom");
  });
});

describe("ClaudeStatus type", () => {
  it("found + oauth", () => {
    const s: ClaudeStatus = { binary: "found", version: "2.1.129", auth: "oauth" };
    expect(s.auth).toBe("oauth");
  });

  it("missing has no version", () => {
    const s: ClaudeStatus = { binary: "missing", auth: "unknown" };
    expect(s.version).toBeUndefined();
  });
});
