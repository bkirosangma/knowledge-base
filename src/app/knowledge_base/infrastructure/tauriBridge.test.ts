import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemError } from "../domain/errors";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const listenMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/event", () => ({ listen: listenMock }));

import { tauriBridge } from "./tauriBridge";

afterEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
});

describe("tauriBridge", () => {
  afterEach(() => {
    invokeMock.mockReset();
  });

  it("calls vault_read_text with the path arg", async () => {
    invokeMock.mockResolvedValue("hello");
    const got = await tauriBridge.readText("docs/topic.md");
    expect(invokeMock).toHaveBeenCalledWith("vault_read_text", { path: "docs/topic.md" });
    expect(got).toBe("hello");
  });

  it("calls vault_write_text with path + content", async () => {
    invokeMock.mockResolvedValue(undefined);
    await tauriBridge.writeText("docs/topic.md", "x");
    expect(invokeMock).toHaveBeenCalledWith("vault_write_text", {
      path: "docs/topic.md",
      content: "x",
    });
  });

  it("calls vault_list with dir", async () => {
    invokeMock.mockResolvedValue([{ name: "a.md", kind: "file", path: "a.md" }]);
    const got = await tauriBridge.list("");
    expect(invokeMock).toHaveBeenCalledWith("vault_list", { dir: "" });
    expect(got).toEqual([{ name: "a.md", kind: "file", path: "a.md" }]);
  });

  it("translates not_found into FileSystemError('not-found')", async () => {
    invokeMock.mockRejectedValue({ kind: "not_found", path: "missing.md" });
    try {
      await tauriBridge.readText("missing.md");
    } catch (e) {
      expect(e).toBeInstanceOf(FileSystemError);
      expect((e as FileSystemError).kind).toBe("not-found");
    }
  });

  it("translates permission_denied into FileSystemError('permission')", async () => {
    invokeMock.mockRejectedValue({ kind: "permission_denied", path: "x.md" });
    try {
      await tauriBridge.readText("x.md");
    } catch (e) {
      expect(e).toBeInstanceOf(FileSystemError);
      expect((e as FileSystemError).kind).toBe("permission");
    }
  });

  it("translates parse into FileSystemError('malformed')", async () => {
    invokeMock.mockRejectedValue({ kind: "parse", path: "x.json", message: "bad" });
    try {
      await tauriBridge.readJson("x.json");
    } catch (e) {
      expect(e).toBeInstanceOf(FileSystemError);
      expect((e as FileSystemError).kind).toBe("malformed");
    }
  });

  it("translates no_vault into FileSystemError('unknown')", async () => {
    invokeMock.mockRejectedValue({ kind: "no_vault" });
    try {
      await tauriBridge.readText("anything");
    } catch (e) {
      expect(e).toBeInstanceOf(FileSystemError);
      expect((e as FileSystemError).kind).toBe("unknown");
    }
  });
});

describe("watchStart / watchStop", () => {
  it("invokes vault_watch_start with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.watchStart();
    expect(invokeMock).toHaveBeenCalledWith("vault_watch_start", {});
  });

  it("invokes vault_watch_stop with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.watchStop();
    expect(invokeMock).toHaveBeenCalledWith("vault_watch_stop", {});
  });

  it("translates raw VaultError on watch_start failure", async () => {
    invokeMock.mockRejectedValueOnce({ kind: "no_vault" });
    await expect(tauriBridge.watchStart()).rejects.toMatchObject({
      kind: "unknown",
      message: expect.stringContaining("No vault configured"),
    });
  });
});

describe("claude bridge", () => {
  it("claudeStatus invokes claude_status with no args", async () => {
    invokeMock.mockResolvedValueOnce({ binary: "found", running: false });
    const got = await tauriBridge.claudeStatus();
    expect(invokeMock).toHaveBeenCalledWith("claude_status", {});
    expect(got).toEqual({ binary: "found", running: false });
  });

  it("claudeSend invokes claude_send with the message wrapped under { message }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const message = { type: "user", text: "hello" } as never;
    await tauriBridge.claudeSend(message);
    expect(invokeMock).toHaveBeenCalledWith("claude_send", { message });
  });

  it("claudeInterrupt invokes claude_interrupt with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.claudeInterrupt();
    expect(invokeMock).toHaveBeenCalledWith("claude_interrupt", {});
  });

  it("claudeReset invokes claude_reset with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.claudeReset();
    expect(invokeMock).toHaveBeenCalledWith("claude_reset", {});
  });

  it("subscribeClaudeEvent registers a claude_event listener and forwards payloads", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();

    const returnedUnlisten = await tauriBridge.subscribeClaudeEvent(handler);

    expect(listenMock).toHaveBeenCalledWith("claude_event", expect.any(Function));

    // Drive the listener callback with a fake Tauri event envelope and confirm
    // the handler receives the unwrapped payload.
    const tauriCallback = listenMock.mock.calls[0][1] as (e: { payload: unknown }) => void;
    tauriCallback({ payload: { kind: "ready" } });
    expect(handler).toHaveBeenCalledWith({ kind: "ready" });

    // The returned function is the underlying unlisten.
    expect(returnedUnlisten).toBe(unlisten);
    returnedUnlisten();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});

describe("skill bridge", () => {
  it("skillStatus invokes skill_status with { name }", async () => {
    invokeMock.mockResolvedValueOnce({
      installed: true,
      targetPath: "/t",
      bundledPath: "/b",
    });
    const got = await tauriBridge.skillStatus("knowledge-base");
    expect(invokeMock).toHaveBeenCalledWith("skill_status", { name: "knowledge-base" });
    expect(got).toEqual({ installed: true, targetPath: "/t", bundledPath: "/b" });
  });

  it("skillInstallFromBundle invokes skill_install_from_bundle with { name }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.skillInstallFromBundle("knowledge-base");
    expect(invokeMock).toHaveBeenCalledWith("skill_install_from_bundle", {
      name: "knowledge-base",
    });
  });
});

describe("terminal bridge", () => {
  it("termOpen invokes term_open with { vaultPath, rows, cols }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.termOpen("/vault", 24, 80);
    expect(invokeMock).toHaveBeenCalledWith("term_open", {
      vaultPath: "/vault",
      rows: 24,
      cols: 80,
    });
  });

  it("termWrite invokes term_write with { bytes }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.termWrite([104, 105]);
    expect(invokeMock).toHaveBeenCalledWith("term_write", { bytes: [104, 105] });
  });

  it("termResize invokes term_resize with { rows, cols }", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.termResize(40, 120);
    expect(invokeMock).toHaveBeenCalledWith("term_resize", { rows: 40, cols: 120 });
  });

  it("termClose invokes term_close with no args", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await tauriBridge.termClose();
    expect(invokeMock).toHaveBeenCalledWith("term_close", {});
  });

  it("subscribeTermEvent registers a term_event listener and forwards payloads", async () => {
    const unlisten = vi.fn();
    listenMock.mockResolvedValueOnce(unlisten);
    const handler = vi.fn();

    const returnedUnlisten = await tauriBridge.subscribeTermEvent(handler);

    expect(listenMock).toHaveBeenCalledWith("term_event", expect.any(Function));

    const tauriCallback = listenMock.mock.calls[0][1] as (e: { payload: unknown }) => void;
    tauriCallback({ payload: { kind: "data", bytes: [65] } });
    expect(handler).toHaveBeenCalledWith({ kind: "data", bytes: [65] });

    expect(returnedUnlisten).toBe(unlisten);
    returnedUnlisten();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
