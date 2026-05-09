// Replaces spec § 9.7's chained MVP-2 + MVP-3 e2e ("/kb document" → file
// appears) with a Vitest-tier integration test. Per MVP-4 scope decision 1,
// the ClaudeRunner trait + StubRunner are deferred; this test drives the
// reducer directly with replay frames from
// docs/superpowers/plans/.mvp4-kb-document-capture.jsonl (or the MVP-2
// fallback) via Task 7's loadKbDocumentEvents() loader.
//
// Mock pattern mirrors useClaudeSession.test.ts — vi.spyOn against the live
// `tauriBridge` export (mutable), with subscribeClaudeEvent capturing the
// reducer's handler so we can fire synthetic ClaudeEvent frames at it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as tauriBridgeModule from "../../../infrastructure/tauriBridge";
import type { ClaudeEvent } from "../types";
import { useClaudeSession } from "./useClaudeSession";
import { loadKbDocumentEvents } from "./__fixtures__/loadCaptureSlice";

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
vi.spyOn(
  tauriBridgeModule.tauriBridge,
  "subscribeClaudeEvent",
).mockImplementation(async (handler) => {
  eventHandlers.push(handler);
  return () => {
    const i = eventHandlers.indexOf(handler);
    if (i >= 0) eventHandlers.splice(i, 1);
  };
});

function fire(payload: ClaudeEvent) {
  for (const h of eventHandlers) h(payload);
}

describe("useClaudeSession — chained /kb document flow", () => {
  beforeEach(() => {
    eventHandlers.length = 0;
    vi.mocked(tauriBridgeModule.tauriBridge.claudeSend).mockClear();
  });

  it("turns the captured stream-json frames into a complete /kb document turn", async () => {
    const events = loadKbDocumentEvents();
    const { result } = renderHook(() => useClaudeSession());

    await act(async () => {
      await result.current.send("/kb document Topic Test");
      for (const e of events) fire(e);
    });

    // User turn lands first.
    expect(result.current.turns[0]).toMatchObject({
      role: "user",
      text: "/kb document Topic Test",
    });

    // Assistant turn rolls up the tool use + tool result + final text.
    const assistant = result.current.turns[1];
    expect(assistant).toMatchObject({
      role: "assistant",
      isStreaming: false,
      model: "claude-opus-4-7",
    });
    expect(assistant.text).toContain("Creating a new document at ");
    expect(assistant.text).toContain("Topic Test.md");
    expect(assistant.toolUses).toHaveLength(1);
    expect(assistant.toolUses[0]).toMatchObject({
      tool: "Write",
      input: { file_path: "Topic Test.md" },
      output: { ok: true },
    });

    // Usage closed via message_end. The fixture emits a single message_end
    // carrying input/output/cost — the reducer's fan-out de-dup logic only
    // kicks in for a SECOND message_end after the streaming turn has
    // already ended, so a single end is sufficient here (matches the
    // reducer's "first end" branch at useClaudeSession.ts L127-146).
    expect(result.current.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.05,
    });
    expect(result.current.isStreaming).toBe(false);

    // claudeSend was driven through the bridge wrapper exactly once.
    expect(tauriBridgeModule.tauriBridge.claudeSend).toHaveBeenCalledTimes(1);
  });
});
