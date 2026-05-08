import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock tauriBridge to control list responses.
vi.mock("../../../infrastructure/tauriBridge", () => ({
  tauriBridge: {
    list: vi.fn(),
  },
}));

import { tauriBridge } from "../../../infrastructure/tauriBridge";
import { VaultFilePickerModal } from "./VaultFilePickerModal";

const list = vi.mocked(tauriBridge.list);

beforeEach(() => list.mockReset());

function entry(name: string, kind: "file" | "directory", path?: string) {
  return { name, kind, path: path ?? name };
}

describe("VaultFilePickerModal", () => {
  it("VAULTPICK-13.4-01: lists files matching .json extension filter", async () => {
    list.mockImplementation(async (dir: string) => {
      if (dir === "") return [entry("foo.json", "file"), entry("bar.md", "file"), entry("subdir", "directory")];
      if (dir === "subdir") return [entry("baz.json", "file", "subdir/baz.json"), entry("qux.txt", "file", "subdir/qux.txt")];
      return [];
    });
    render(<VaultFilePickerModal open extensions={[".json"]} onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("foo.json")).toBeInTheDocument());
    expect(screen.getByText("subdir/baz.json")).toBeInTheDocument();
    expect(screen.queryByText("bar.md")).toBeNull();
    expect(screen.queryByText("subdir/qux.txt")).toBeNull();
  });

  it("VAULTPICK-13.4-02: shows 'No matching files' when nothing matches", async () => {
    list.mockResolvedValue([entry("only.md", "file")]);
    render(<VaultFilePickerModal open extensions={[".json"]} onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No matching files/)).toBeInTheDocument());
  });

  it("VAULTPICK-13.4-03: Cancel returns null", async () => {
    list.mockResolvedValue([]);
    const onPick = vi.fn();
    render(<VaultFilePickerModal open extensions={[]} onPick={onPick} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("VAULTPICK-13.4-04: Escape returns null", async () => {
    list.mockResolvedValue([]);
    const onPick = vi.fn();
    render(<VaultFilePickerModal open extensions={[]} onPick={onPick} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("VAULTPICK-13.4-05: backdrop mouseDown returns null", async () => {
    list.mockResolvedValue([]);
    const onPick = vi.fn();
    render(<VaultFilePickerModal open extensions={[]} onPick={onPick} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("VAULTPICK-13.4-06: clicking a file returns its vault-relative path", async () => {
    list.mockResolvedValue([entry("a.json", "file"), entry("b.json", "file")]);
    const onPick = vi.fn();
    render(<VaultFilePickerModal open extensions={[".json"]} onPick={onPick} />);
    await waitFor(() => expect(screen.getByText("a.json")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByText("b.json"));
    expect(onPick).toHaveBeenCalledWith("b.json");
  });

  it("VAULTPICK-13.4-07: handles list rejection at root with empty file list (BFS swallows per-dir errors)", async () => {
    // Root call rejects -> queue empties, no files surface, modal shows "No matching files".
    // mockRejectedValueOnce so only the first (BFS root) call rejects; vitest's
    // internal runner may call the mock once more during teardown and we don't
    // want that stray call to produce an unhandled rejection.
    list.mockRejectedValueOnce(new Error("vault gone"));
    list.mockResolvedValue([]);
    render(<VaultFilePickerModal open extensions={[]} onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No matching files/)).toBeInTheDocument());
  });

  it("VAULTPICK-13.4-08: skips dot-directories (e.g. .archdesigner, .git)", async () => {
    list.mockImplementation(async (dir: string) => {
      if (dir === "") return [
        entry(".archdesigner", "directory"),
        entry(".git", "directory"),
        entry("docs", "directory"),
        entry("readme.md", "file"),
      ];
      if (dir === "docs") return [entry("guide.md", "file", "docs/guide.md")];
      // .archdesigner and .git should never be queued, so list() should never be called for them
      return [];
    });
    render(<VaultFilePickerModal open extensions={[]} onPick={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("readme.md")).toBeInTheDocument());
    expect(screen.getByText("docs/guide.md")).toBeInTheDocument();
    // Verify dot-dirs were skipped (list never called for them)
    expect(list).toHaveBeenCalledWith("");
    expect(list).toHaveBeenCalledWith("docs");
    expect(list).not.toHaveBeenCalledWith(".archdesigner");
    expect(list).not.toHaveBeenCalledWith(".git");
  });

  it("VAULTPICK-13.4-09: renders nothing when closed", () => {
    list.mockResolvedValue([]);
    render(<VaultFilePickerModal open={false} extensions={[]} onPick={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
