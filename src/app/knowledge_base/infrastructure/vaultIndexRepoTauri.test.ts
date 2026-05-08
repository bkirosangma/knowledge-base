/**
 * Unit tests for `vaultIndexRepoTauri` — Tauri implementation of
 * VaultIndexRepository.
 *
 * Covers: TAB-VIR-01 through TAB-VIR-08 (vault index repository contract).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  list: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("./tauriBridge", () => ({ tauriBridge: bridge }));

import { createVaultIndexRepositoryTauri } from "./vaultIndexRepoTauri";

describe("vaultIndexRepoTauri", () => {
  afterEach(() => {
    bridge.list.mockReset();
    bridge.rename.mockReset();
    bridge.delete.mockReset();
    bridge.exists.mockReset();
    bridge.writeText.mockReset();
  });

  // ── scan ──────────────────────────────────────────────────────────────────

  describe("scan", () => {
    it("returns sorted tree: files first, then folders, alphabetical within each group", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockResolvedValue([
        { name: "zeta", kind: "directory", path: "zeta" },
        { name: "alpha", kind: "directory", path: "alpha" },
        { name: "z-last.md", kind: "file", path: "z-last.md" },
        { name: "a-first.md", kind: "file", path: "a-first.md" },
        { name: "chart.json", kind: "file", path: "chart.json" },
        // alpha and zeta have no children
      ]);
      // Nested list calls for subdirs return empty
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir === "") {
          return [
            { name: "zeta", kind: "directory", path: "zeta" },
            { name: "alpha", kind: "directory", path: "alpha" },
            { name: "z-last.md", kind: "file", path: "z-last.md" },
            { name: "a-first.md", kind: "file", path: "a-first.md" },
            { name: "chart.json", kind: "file", path: "chart.json" },
          ];
        }
        return [];
      });

      const tree = await repo.scan();
      expect(tree.map((n) => ({ name: n.name, type: n.type }))).toEqual([
        { name: "a-first.md", type: "file" },
        { name: "chart.json", type: "file" },
        { name: "z-last.md", type: "file" },
        { name: "alpha", type: "folder" },
        { name: "zeta", type: "folder" },
      ]);
    });

    it("filters hidden folders: 'memory' and dot-prefixed", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir !== "") return [];
        return [
          { name: "memory", kind: "directory", path: "memory" },
          { name: ".archdesigner", kind: "directory", path: ".archdesigner" },
          { name: ".claude", kind: "directory", path: ".claude" },
          { name: "visible", kind: "directory", path: "visible" },
          { name: "notes.md", kind: "file", path: "notes.md" },
        ];
      });

      const tree = await repo.scan();
      const names = tree.map((n) => n.name);
      expect(names).toContain("notes.md");
      expect(names).toContain("visible");
      expect(names).not.toContain("memory");
      expect(names).not.toContain(".archdesigner");
      expect(names).not.toContain(".claude");
    });

    it("filters hidden files: CLAUDE.md, MEMORY.md, AGENTS.md, and history sidecars", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir !== "") return [];
        return [
          { name: "CLAUDE.md", kind: "file", path: "CLAUDE.md" },
          { name: "MEMORY.md", kind: "file", path: "MEMORY.md" },
          { name: "AGENTS.md", kind: "file", path: "AGENTS.md" },
          { name: ".diagram.history.json", kind: "file", path: ".diagram.history.json" },
          { name: ".foo.md.history.json", kind: "file", path: ".foo.md.history.json" },
          { name: "README.md", kind: "file", path: "README.md" },
        ];
      });

      const tree = await repo.scan();
      expect(tree.map((n) => n.name)).toEqual(["README.md"]);
    });

    it("filters non-recognized extensions", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir !== "") return [];
        return [
          { name: "image.png", kind: "file", path: "image.png" },
          { name: "data.csv", kind: "file", path: "data.csv" },
          { name: "ignored.txt", kind: "file", path: "ignored.txt" },
          { name: "valid.md", kind: "file", path: "valid.md" },
          { name: "valid.json", kind: "file", path: "valid.json" },
          { name: "valid.svg", kind: "file", path: "valid.svg" },
          { name: "valid.alphatex", kind: "file", path: "valid.alphatex" },
        ];
      });

      const tree = await repo.scan();
      expect(tree.map((n) => n.name).sort()).toEqual([
        "valid.alphatex",
        "valid.json",
        "valid.md",
        "valid.svg",
      ]);
    });

    it("assigns correct fileType per extension", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir !== "") return [];
        return [
          { name: "doc.md", kind: "file", path: "doc.md" },
          { name: "diagram.json", kind: "file", path: "diagram.json" },
          { name: "image.svg", kind: "file", path: "image.svg" },
          { name: "song.alphatex", kind: "file", path: "song.alphatex" },
        ];
      });

      const tree = await repo.scan();
      const byName = Object.fromEntries(tree.map((n) => [n.name, n.fileType]));
      expect(byName["doc.md"]).toBe("document");
      expect(byName["diagram.json"]).toBe("diagram");
      expect(byName["image.svg"]).toBe("svg");
      expect(byName["song.alphatex"]).toBe("tab");
    });

    it("recurses into subdirectories and builds nested children", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.list.mockImplementation(async (dir: string) => {
        if (dir === "") {
          return [
            { name: "notes", kind: "directory", path: "notes" },
            { name: "root.md", kind: "file", path: "root.md" },
          ];
        }
        if (dir === "notes") {
          return [
            { name: "sub", kind: "directory", path: "notes/sub" },
            { name: "top.md", kind: "file", path: "notes/top.md" },
          ];
        }
        if (dir === "notes/sub") {
          return [{ name: "deep.md", kind: "file", path: "notes/sub/deep.md" }];
        }
        return [];
      });

      const tree = await repo.scan();
      // root.md first (file), then notes (folder)
      expect(tree[0].name).toBe("root.md");
      expect(tree[1].name).toBe("notes");

      const notes = tree[1];
      expect(notes.children).toBeDefined();
      const notesPaths = notes.children!.map((c) => c.name);
      expect(notesPaths).toContain("top.md");
      expect(notesPaths).toContain("sub");

      const sub = notes.children!.find((c) => c.name === "sub")!;
      expect(sub.children?.[0].path).toBe("notes/sub/deep.md");
    });
  });

  // ── rename ────────────────────────────────────────────────────────────────

  describe("rename", () => {
    it("forwards rename to tauriBridge.rename", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.rename.mockResolvedValue(undefined);

      await repo.rename("old/path.md", "new/path.md");

      expect(bridge.rename).toHaveBeenCalledWith("old/path.md", "new/path.md");
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────

  describe("delete", () => {
    it("forwards delete to tauriBridge.delete", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.delete.mockResolvedValue(undefined);

      await repo.delete("notes/draft.md");

      expect(bridge.delete).toHaveBeenCalledWith("notes/draft.md");
    });
  });

  // ── exists ────────────────────────────────────────────────────────────────

  describe("exists", () => {
    it("forwards exists to tauriBridge.exists and returns true", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.exists.mockResolvedValue(true);

      const result = await repo.exists("notes/doc.md");

      expect(bridge.exists).toHaveBeenCalledWith("notes/doc.md");
      expect(result).toBe(true);
    });

    it("returns false when tauriBridge.exists returns false", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.exists.mockResolvedValue(false);

      const result = await repo.exists("missing.md");

      expect(result).toBe(false);
    });
  });

  // ── createFolder ─────────────────────────────────────────────────────────

  describe("createFolder", () => {
    it("writes a .kbkeep sentinel file under the given path", async () => {
      const repo = createVaultIndexRepositoryTauri();
      bridge.writeText.mockResolvedValue(undefined);

      await repo.createFolder("notes/new-folder");

      expect(bridge.writeText).toHaveBeenCalledWith(
        "notes/new-folder/.kbkeep",
        "",
      );
    });
  });
});
