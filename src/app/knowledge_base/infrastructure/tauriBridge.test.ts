import { afterEach, describe, expect, it, vi } from "vitest";

import { FileSystemError } from "../domain/errors";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { tauriBridge } from "./tauriBridge";

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
