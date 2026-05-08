// Covers CHAT-12.1-01 through 12.1-04 — useClaudeStatus initial state and refresh.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import * as tauriBridgeModule from "../../../infrastructure/tauriBridge";
import { useClaudeStatus } from "./useClaudeStatus";

vi.spyOn(tauriBridgeModule.tauriBridge, "claudeStatus").mockResolvedValue({
  binary: "found",
  version: "2.1.129",
  auth: "oauth",
});

describe("useClaudeStatus", () => {
  beforeEach(() => {
    vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus).mockClear();
  });

  it("starts in unknown state before the probe resolves", () => {
    vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus).mockImplementationOnce(
      () => new Promise(() => {}), // never resolves
    );
    const { result } = renderHook(() => useClaudeStatus());
    expect(result.current.status.binary).toBe("unknown");
    expect(result.current.status.auth).toBe("unknown");
  });

  it("resolves to found + oauth on success", async () => {
    vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus).mockResolvedValueOnce({
      binary: "found",
      version: "2.1.129",
      auth: "oauth",
    });
    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => {
      expect(result.current.status.binary).toBe("found");
    });
    expect(result.current.status.auth).toBe("oauth");
    expect(result.current.status.version).toBe("2.1.129");
  });

  it("resolves to missing on probe failure", async () => {
    vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus).mockRejectedValueOnce(
      new Error("command not found"),
    );
    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => {
      expect(result.current.status.binary).toBe("missing");
    });
    expect(result.current.status.auth).toBe("unknown");
  });

  it("exposes refresh() that re-invokes the probe", async () => {
    vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus)
      .mockResolvedValueOnce({ binary: "found", version: "2.1.129", auth: "oauth" })
      .mockResolvedValueOnce({ binary: "missing", auth: "unknown" });

    const { result } = renderHook(() => useClaudeStatus());
    await waitFor(() => {
      expect(result.current.status.binary).toBe("found");
    });

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status.binary).toBe("missing");
    expect(vi.mocked(tauriBridgeModule.tauriBridge.claudeStatus)).toHaveBeenCalledTimes(2);
  });
});
